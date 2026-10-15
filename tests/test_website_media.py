from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from urllib.error import HTTPError
import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin

from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (PostgresTrialStore, TrialPrincipal, TrialNotReadyError,
    TrialValidationError, TrialPermissionDenied, TrialNotFound, TrialReadiness)
from supermega_runtime.website_media import (prepare_photo, private_object_path, PreparedPhoto,
    MAX_UPLOAD_BYTES, MAX_ASSET_BYTES, _DECODER_SLOT)
from supermega_runtime.website_media_storage import (MediaStorageConfig, SupabasePrivateMediaStorage, BUCKET)
from supermega_runtime.website_media_store import WebsiteMediaStore, MEDIA_EVENT


def photo_bytes(format="PNG", size=(32, 24), **kwargs):
    output = BytesIO()
    with Image.new("RGB", size, "#ab6633") as image:
        image.save(output, format=format, **kwargs)
    return output.getvalue()


class PhotoPreparationTests(unittest.TestCase):
    def test_formats_are_decoded_and_metadata_is_not_retained(self):
        png = PngImagePlugin.PngInfo()
        png.add_text("Comment", "PRIVATE_METADATA_SENTINEL")
        for format, mime, options in (("PNG", "image/png", {"pnginfo": png}),
                ("JPEG", "image/jpeg", {}), ("WEBP", "image/webp", {})):
            with self.subTest(format=format):
                result = prepare_photo(photo_bytes(format, **options), mime)
                with Image.open(BytesIO(result.data)) as saved:
                    self.assertEqual(saved.format, "WEBP")
                    self.assertEqual(saved.size, (32, 24))
                    self.assertFalse(saved.getexif())
                    self.assertNotIn("Comment", saved.info)
                self.assertNotIn(b"PRIVATE_METADATA_SENTINEL", result.data)
                self.assertEqual(result.receipt()["sha256"], sha256(result.data).hexdigest())

    def test_orientation_is_applied_before_metadata_removal(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "PRIVATE_EXIF_SENTINEL"
        result = prepare_photo(photo_bytes("JPEG", (40, 20), exif=exif), "image/jpeg")
        self.assertEqual((result.width, result.height), (20, 40))
        self.assertNotIn(b"PRIVATE_EXIF_SENTINEL", result.data)

    def test_resize_preserves_aspect_and_transparency(self):
        result = prepare_photo(photo_bytes(size=(3000, 1500)), "image/png")
        self.assertEqual((result.width, result.height), (2048, 1024))
        output = BytesIO()
        Image.new("RGBA", (16, 16), (10, 20, 30, 0)).save(output, format="PNG")
        result = prepare_photo(output.getvalue(), "image/png")
        with Image.open(BytesIO(result.data)) as image:
            self.assertEqual(image.getpixel((0, 0))[3], 0)

    def test_rejects_spoofed_truncated_active_and_oversized_input(self):
        cases = [(b"<svg onload='alert(1)'/>", "image/png"), (b"<html/>", "image/jpeg"),
            (photo_bytes("PNG"), "image/jpeg"), (photo_bytes()[:30], "image/png"),
            (b"", "image/png"), (b"x" * (MAX_UPLOAD_BYTES + 1), "image/png"),
            (photo_bytes(), "image/svg+xml")]
        for data, mime in cases:
            with self.subTest(mime=mime, size=len(data)), self.assertRaises(TrialValidationError):
                prepare_photo(data, mime)

    def test_pixel_budget_is_checked_before_decode(self):
        source = MagicMock()
        source.__enter__.return_value = source
        source.format, source.size = "PNG", (10000, 10000)
        with patch("PIL.Image.open", return_value=source), self.assertRaises(TrialValidationError):
            prepare_photo(b"synthetic", "image/png")
        source.load.assert_not_called()

    def test_animation_is_rejected(self):
        output = BytesIO()
        first, second = Image.new("RGB", (16, 16), "red"), Image.new("RGB", (16, 16), "blue")
        first.save(output, format="WEBP", save_all=True, append_images=[second], duration=100, loop=0)
        with self.assertRaises(TrialValidationError):
            prepare_photo(output.getvalue(), "image/webp")

    def test_admission_releases_after_invalid_file(self):
        _DECODER_SLOT.acquire()
        try:
            with self.assertRaises(TrialNotReadyError):
                prepare_photo(photo_bytes(), "image/png")
        finally:
            _DECODER_SLOT.release()
        with self.assertRaises(TrialValidationError):
            prepare_photo(b"bad", "image/png")
        self.assertTrue(prepare_photo(photo_bytes(), "image/png").data)

    def test_object_paths_are_tenant_scoped_and_reject_traversal(self):
        asset = prepare_photo(photo_bytes(), "image/png").asset_id
        self.assertNotEqual(private_object_path("a", asset), private_object_path("b", asset))
        self.assertNotIn("../", private_object_path("../../a", asset))
        for bad in ("../file.webp", "file.jpg", "A" * 64 + ".webp", "a" * 64 + ".webp?x=1"):
            with self.assertRaises(TrialValidationError):
                private_object_path("a", bad)


class PrivateObjectStorageTests(unittest.TestCase):
    def setUp(self):
        self.photo = prepare_photo(photo_bytes(), "image/png")
        self.storage = SupabasePrivateMediaStorage(MediaStorageConfig("https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789"))
        self.private = (200, json.dumps({"id": BUCKET, "public": False}).encode())

    def test_success_requires_private_bucket_and_exact_readback(self):
        for status in (201, 400, 409):
            with self.subTest(status=status), patch.object(self.storage, "_request",
                    side_effect=[self.private, (status, b"{}"), (200, self.photo.data)]) as request:
                self.assertEqual(self.storage.put("a", self.photo), self.photo.receipt())
                self.assertIn(private_object_path("a", self.photo.asset_id), request.call_args_list[1].args[1])

    def test_public_unknown_or_missing_bucket_fails_before_upload(self):
        for response in ((200, b'{"id":"supermega-sites-media","public":true}'),
                (200, b'{"id":"wrong","public":false}'), (404, b""), (200, b"{}")):
            with patch.object(self.storage, "_request", return_value=response) as request:
                with self.assertRaises(TrialNotReadyError):
                    self.storage.put("a", self.photo)
                self.assertEqual(request.call_count, 1)

    def test_upload_and_download_mismatch_or_failure_never_succeed(self):
        cases = [[self.private, (500, b"")], [self.private, (201, b"{}"), (200, b"wrong")],
                 [self.private, (409, b""), (404, b"")]]
        for sequence in cases:
            with patch.object(self.storage, "_request", side_effect=sequence), self.assertRaises(TrialNotReadyError):
                self.storage.put("a", self.photo)
        with patch.object(self.storage, "_request", side_effect=[self.private, (200, b"tampered")]), self.assertRaises(TrialNotReadyError):
            self.storage.get("a", self.photo.asset_id)

    def test_transport_caps_reads_and_never_uses_upsert_or_redirects(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status, response.read.return_value = 200, b"x" * (MAX_ASSET_BYTES + 1)
        opener = MagicMock()
        opener.open.return_value = response
        with patch("supermega_runtime.website_media_storage.build_opener", return_value=opener) as build:
            with self.assertRaises(TrialNotReadyError):
                self.storage._request("POST", "object/test", data=b"test", maximum=MAX_ASSET_BYTES)
            request = opener.open.call_args.args[0]
            self.assertEqual(request.get_header("X-upsert"), "false")
            self.assertEqual(request.get_header("Apikey"), self.storage.config.secret)
            self.assertIsNone(request.get_header("Authorization"))
            self.assertEqual(response.read.call_args.args[0], MAX_ASSET_BYTES + 1)
            self.assertEqual(type(build.call_args.args[1]).__name__, "_NoRedirectHandler")

    def test_unconfigured_provider_does_not_make_a_request(self):
        with patch("supermega_runtime.website_media_storage.build_opener") as opener, self.assertRaises(TrialNotReadyError):
            SupabasePrivateMediaStorage(MediaStorageConfig()).put("a", self.photo)
        opener.assert_not_called()

    def test_transport_closes_http_error_and_hides_provider_body(self):
        provider_body = BytesIO(b"PRIVATE_PROVIDER_SENTINEL")
        failure = HTTPError("https://synthetic.supabase.co/storage/v1/object/x", 403, "Forbidden", {}, provider_body)
        opener = MagicMock()
        opener.open.side_effect = failure
        with patch("supermega_runtime.website_media_storage.build_opener", return_value=opener):
            self.assertEqual(self.storage._request("GET", "object/x"), (403, b""))
        self.assertTrue(provider_body.closed)

    def test_configuration_accepts_only_server_key_and_https(self):
        for base, secret, ready in (("https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", True),
                ("http://localhost:54321", "sb_secret_synthetic_fixture_only_123456789", False),
                ("https://synthetic.supabase.co", "sb_publishable_SYNTHETIC_ONLY_123456", False),
                ("https://user:pass@synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789", False)):
            with patch.dict("os.environ", {"SUPERMEGA_SUPABASE_URL": base,
                    "SUPERMEGA_WEBSITE_MEDIA_STORAGE_KEY": secret}, clear=True):
                self.assertEqual(MediaStorageConfig.from_environment().ready, ready)


class PgDouble:
    """SQL-boundary test double; this is not evidence of live PostgreSQL/RLS."""
    def __init__(self):
        self.events, self.allowed, self.entitled = {}, True, True
        self.quota = {"assets": 0, "bytes": 0, "recent": 0}
        self.fail_commit = False
        self.result = None
    @contextmanager
    def _guarded_cursor(self, actor, *, write, capability=None):
        self._assert_active_identity_session(self, actor)
        before = deepcopy(self.events)
        try:
            yield self, {"website.read", "website.write"}
            if self.fail_commit:
                raise TrialNotReadyError(("audit_commit_failed",))
        except Exception:
            self.events = before
            raise
    def _lock(self, *args): pass
    def _assert_active_identity_session(self, cursor, actor):
        if not self.allowed:
            raise TrialPermissionDenied("website.write")
    def _load_membership(self, cursor, actor): return {"website.read", "website.write"}
    def _product_entitlements(self, cursor, workspace): return ("website",) if self.entitled else ()
    def execute(self, sql, params):
        if "select result_json" in sql:
            result = self.events.get((params[0], params[2]))
            self.result = {"result_json": result} if result else None
        elif "select count(*)" in sql:
            self.result = self.quota
        elif "insert into" in sql:
            receipt = json.loads(params[-1])
            self.events[(params[1], receipt["assetId"])] = receipt
        else: raise AssertionError(sql)
    def fetchone(self): return self.result


class MediaLedgerTests(unittest.TestCase):
    def setUp(self):
        self.pg, self.storage = PgDouble(), MagicMock()
        self.adapter = WebsiteMediaStore(self.pg, self.storage)
        self.actor = TrialPrincipal("workspace-a", "user-a", "human")
        self.photo = prepare_photo(photo_bytes(), "image/png")
        self.storage.put.return_value = self.photo.receipt()
        self.storage.get.return_value = self.photo.data

    def test_durable_upload_retry_and_tenant_scoped_read(self):
        self.assertEqual(self.adapter.put(self.actor, self.photo), self.photo.receipt())
        self.assertEqual(self.adapter.put(self.actor, self.photo), self.photo.receipt())
        self.storage.put.assert_called_once()
        self.assertEqual(len(self.pg.events), 1)
        self.assertEqual(self.adapter.get(self.actor, self.photo.asset_id)[0], self.photo.data)
        self.storage.get.reset_mock()
        with self.assertRaises(TrialNotFound):
            self.adapter.get(TrialPrincipal("workspace-b", "user-b", "human"), self.photo.asset_id)
        self.storage.get.assert_not_called()

    def test_session_or_entitlement_revocation_prevents_provider_write(self):
        for field in ("allowed", "entitled"):
            setattr(self.pg, field, False)
            with self.assertRaises(TrialPermissionDenied): self.adapter.put(self.actor, self.photo)
            self.storage.put.assert_not_called()
            setattr(self.pg, field, True)

    def test_revoke_during_storage_call_rolls_back_receipt(self):
        def revoke(*args):
            self.pg.allowed = False
            return self.photo.receipt()
        self.storage.put.side_effect = revoke
        with self.assertRaises(TrialPermissionDenied): self.adapter.put(self.actor, self.photo)
        self.assertFalse(self.pg.events)

    def test_revoke_during_read_prevents_response(self):
        self.adapter.put(self.actor, self.photo)
        def revoke(*args):
            self.pg.allowed = False
            return self.photo.data
        self.storage.get.side_effect = revoke
        with self.assertRaises(TrialPermissionDenied): self.adapter.get(self.actor, self.photo.asset_id)

    def test_commit_failure_is_not_success_and_retry_can_recover(self):
        self.pg.fail_commit = True
        with self.assertRaises(TrialNotReadyError): self.adapter.put(self.actor, self.photo)
        self.assertFalse(self.pg.events)
        self.pg.fail_commit = False
        self.assertEqual(self.adapter.put(self.actor, self.photo), self.photo.receipt())

    def test_quota_and_rate_limit_prevent_new_object_write(self):
        for quota in ({"assets": 1000, "bytes": 0, "recent": 0},
                {"assets": 0, "bytes": 250 * 1024 * 1024, "recent": 0},
                {"assets": 0, "bytes": 0, "recent": 60}):
            self.pg.quota = quota
            with self.assertRaises((TrialNotReadyError, TrialValidationError)):
                self.adapter.put(self.actor, self.photo)
            self.storage.put.assert_not_called()

    def test_nonhuman_and_wrong_receipt_are_rejected(self):
        with self.assertRaises(TrialPermissionDenied):
            self.adapter.put(TrialPrincipal("workspace-a", "agent-a", "agent"), self.photo)
        self.storage.put.return_value = {**self.photo.receipt(), "bytes": 1}
        with self.assertRaises(TrialNotReadyError): self.adapter.put(self.actor, self.photo)
        self.assertFalse(self.pg.events)


class MediaRouteTests(unittest.TestCase):
    def setUp(self):
        self.store = MagicMock(spec=PostgresTrialStore)
        self.ready = MagicMock(spec=TrialReadiness)
        for flag in ("database_ready", "schema_ready", "audit_ready", "write_enabled", "auth_ready", "membership_ready"):
            setattr(self.ready, flag, True)
        self.ready.capabilities = frozenset({"website.read", "website.write"})
        self.store.readiness.return_value = self.ready
        self.actor = TrialPrincipal("workspace-a", "user-a", "human")
        self.resolve = MagicMock(return_value=self.actor)
        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=self.resolve))
        self.client = TestClient(app)
        self.config = patch("supermega_runtime.website_media_routes.MediaStorageConfig.from_environment",
            return_value=MediaStorageConfig("https://synthetic.supabase.co", "sb_secret_synthetic_fixture_only_123456789"))
        self.config.start()
        self.addCleanup(self.config.stop)
        self.adapter_patch = patch("supermega_runtime.website_media_routes.WebsiteMediaStore")
        self.adapter = self.adapter_patch.start().return_value
        self.addCleanup(self.adapter_patch.stop)
        self.photo = prepare_photo(photo_bytes(), "image/png")
        self.adapter.put.return_value = self.photo.receipt()
        self.adapter.get.return_value = (self.photo.data, self.photo.receipt())

    def test_real_http_binary_upload_and_download_headers(self):
        response = self.client.post("/api/trial/v1/website-media", content=photo_bytes(), headers={"content-type": "image/png"})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json(), self.photo.receipt())
        self.assertEqual(self.adapter.put.call_args.args[0], self.actor)
        read = self.client.get(f"/api/trial/v1/website-media/{self.photo.asset_id}")
        self.assertEqual(read.content, self.photo.data)
        self.assertEqual(read.headers["content-type"], "image/webp")
        self.assertEqual(read.headers["x-content-sha256"], self.photo.receipt()["sha256"])
        for reply in (response, read):
            self.assertEqual(reply.headers["cache-control"], "private, no-store")
            self.assertEqual(reply.headers["x-content-type-options"], "nosniff")

    def test_auth_membership_and_capability_gates_run_before_body(self):
        for gate, status in (("auth_ready", 401), ("membership_ready", 403), ("write_enabled", 503)):
            setattr(self.ready, gate, False)
            response = self.client.post("/api/trial/v1/website-media", content=b"invalid")
            self.assertEqual(response.status_code, status)
            setattr(self.ready, gate, True)
        self.ready.capabilities = frozenset({"website.read"})
        self.assertEqual(self.client.post("/api/trial/v1/website-media").status_code, 403)
        self.resolve.return_value = None
        self.assertEqual(self.client.get(f"/api/trial/v1/website-media/{self.photo.asset_id}").status_code, 401)
        self.adapter.put.assert_not_called()
        self.adapter.get.assert_not_called()

    def test_content_limits_and_invalid_media(self):
        cases = [(b"x", {"content-type": "image/svg+xml"}, 415),
                 (b"x", {"content-type": "image/png", "content-length": str(MAX_UPLOAD_BYTES + 1)}, 413),
                 (b"x", {"content-type": "image/png", "content-length": "-1"}, 400),
                 (b"x", {"content-type": "image/png"}, 422),
                 (b"x" * (MAX_UPLOAD_BYTES + 1), {"content-type": "image/png", "content-length": "1"}, 413)]
        for body, headers, status in cases:
            response = self.client.post("/api/trial/v1/website-media", content=body, headers=headers)
            self.assertEqual(response.status_code, status, response.text)
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.adapter.put.assert_not_called()

    def test_provider_error_does_not_expose_private_details(self):
        self.adapter.put.side_effect = RuntimeError("PRIVATE_PROVIDER_SENTINEL")
        response = self.client.post("/api/trial/v1/website-media", content=photo_bytes(), headers={"content-type": "image/png"})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("PRIVATE_PROVIDER_SENTINEL", response.text)

    def test_invalid_reference_and_extra_identity_parameters_are_rejected(self):
        self.assertEqual(self.client.get("/api/trial/v1/website-media/not-a-photo").status_code, 422)
        self.assertEqual(self.client.get(f"/api/trial/v1/website-media/{self.photo.asset_id}?workspace=other").status_code, 422)
        self.adapter.get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
