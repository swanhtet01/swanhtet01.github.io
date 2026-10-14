"""Server-only private Supabase object storage. No bucket creation or public URLs."""

from dataclasses import dataclass
from hashlib import sha256
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

from .supabase_auth import SupabaseAuthConfig, _NoRedirectHandler, _decode_jwt_payload
from .trial_store import TrialNotReadyError
from .website_media import MAX_ASSET_BYTES, PreparedPhoto, private_object_path

BUCKET = "supermega-sites-media"
SHOP_BUCKET = "supermega-shop-media"


@dataclass(frozen=True, repr=False)
class MediaStorageConfig:
    base_url: str = ""
    secret: str = ""
    bucket: str = BUCKET

    @classmethod
    def from_environment(cls):
        base = SupabaseAuthConfig.from_environment().base_url
        secret = os.getenv("SUPERMEGA_WEBSITE_MEDIA_STORAGE_KEY", "").strip()
        legacy = _decode_jwt_payload(secret)
        valid_key = (secret.startswith("sb_secret_") and len(secret) >= 24) or (
            bool(legacy) and legacy.get("role") == "service_role")
        return cls(base if base.startswith("https://") else "", secret if valid_key else "")

    @classmethod
    def for_shop_from_environment(cls):
        base = SupabaseAuthConfig.from_environment().base_url
        secret = os.getenv("SUPERMEGA_SHOP_MEDIA_STORAGE_KEY", "").strip()
        legacy = _decode_jwt_payload(secret)
        valid_key = (secret.startswith("sb_secret_") and len(secret) >= 24) or (
            bool(legacy) and legacy.get("role") == "service_role")
        return cls(base if base.startswith("https://") else "", secret if valid_key else "", SHOP_BUCKET)

    @property
    def ready(self):
        return bool(self.base_url and self.secret)


class SupabasePrivateMediaStorage:
    def __init__(self, config: MediaStorageConfig):
        self.config = config

    def _request(self, method: str, path: str, *, data: bytes | None = None,
                 maximum: int = 16 * 1024) -> tuple[int, bytes]:
        if not self.config.ready:
            raise TrialNotReadyError(("website_media_storage_unavailable",))
        agent = "supermega-sites-media/1" if self.config.bucket == BUCKET else "supermega-shop-media/1"
        headers = {"apikey": self.config.secret, "accept": "application/json",
                   "user-agent": agent}
        # Modern secret keys belong in apikey; legacy service JWTs also use Authorization.
        if not self.config.secret.startswith("sb_secret_"):
            headers["authorization"] = f"Bearer {self.config.secret}"
        if data is not None:
            headers.update({"content-type": "image/webp", "x-upsert": "false",
                            "cache-control": "private, no-store"})
        request = Request(f"{self.config.base_url}/storage/v1/{path}", data=data, headers=headers, method=method)
        try:
            with build_opener(ProxyHandler({}), _NoRedirectHandler()).open(request, timeout=8) as response:
                body = response.read(maximum + 1)
                if len(body) > maximum:
                    raise TrialNotReadyError(("website_media_response_too_large",))
                return response.status, body
        except HTTPError as exc:
            # No provider body, object content or credentials in errors/log output.
            status = exc.code
            exc.close()
            return status, b""
        except (OSError, TimeoutError, URLError) as exc:
            raise TrialNotReadyError(("website_media_storage_unavailable",)) from exc

    def _require_private_bucket(self):
        bucket_name = self.config.bucket
        if bucket_name not in (BUCKET, SHOP_BUCKET):
            raise TrialNotReadyError(("website_media_private_bucket_required",))
        status, body = self._request("GET", f"bucket/{bucket_name}")
        try:
            bucket = json.loads(body)
        except (ValueError, UnicodeError):
            bucket = None
        if status != 200 or not isinstance(bucket, dict) or bucket.get("id") != bucket_name or bucket.get("public") is not False:
            raise TrialNotReadyError(("website_media_private_bucket_required",))

    def _object_path(self, workspace_id: str, asset_id: str,
                     object_key: str | None) -> str:
        base = private_object_path(workspace_id, asset_id)
        if self.config.bucket == SHOP_BUCKET:
            if not isinstance(object_key, str) or re.fullmatch(r"[0-9a-f]{32}", object_key) is None:
                raise TrialNotReadyError(("shop_media_object_key_invalid",))
            scope, filename = base.split("/", 1)
            return f"{scope}/{object_key}/{filename}"
        if object_key is not None:
            raise TrialNotReadyError(("website_media_object_key_invalid",))
        return base

    def put(self, workspace_id: str, photo: PreparedPhoto,
            object_key: str | None = None) -> dict:
        self._require_private_bucket()
        path = self._object_path(workspace_id, photo.asset_id, object_key)
        status, _ = self._request("POST", f"object/{self.config.bucket}/{path}", data=photo.data)
        if status not in (200, 201, 400, 409):
            raise TrialNotReadyError(("website_media_upload_unconfirmed",))
        # A duplicate or interrupted retry is success only when exact immutable bytes exist.
        stored = self._download(path)
        if stored != photo.data:
            raise TrialNotReadyError(("website_media_integrity_failed",))
        return photo.receipt()

    def _download(self, path: str) -> bytes:
        status, body = self._request("GET", f"object/authenticated/{self.config.bucket}/{path}", maximum=MAX_ASSET_BYTES)
        if status != 200 or not body:
            raise TrialNotReadyError(("website_media_read_unconfirmed",))
        return body

    def get(self, workspace_id: str, asset_id: str,
            object_key: str | None = None) -> bytes:
        path = self._object_path(workspace_id, asset_id, object_key)
        self._require_private_bucket()
        body = self._download(path)
        if sha256(body).hexdigest() != asset_id[:-5]:
            raise TrialNotReadyError(("website_media_integrity_failed",))
        return body

    def delete(self, workspace_id: str, asset_id: str, object_key: str) -> None:
        """Remove one exact private object; an ambiguous acknowledgement stays retryable.

        The caller must first mark the object unreferenced and retiring in its
        own database transaction. Never invoke this while holding that lock.
        """
        if self.config.bucket != SHOP_BUCKET:
            raise TrialNotReadyError(("shop_media_private_bucket_required",))
        path = self._object_path(workspace_id, asset_id, object_key)
        self._require_private_bucket()
        status, _ = self._request("DELETE", f"object/{self.config.bucket}/{path}")
        if status not in (200, 204, 404):
            raise TrialNotReadyError(("website_media_delete_unconfirmed",))
        observed, _ = self._request("GET", f"object/authenticated/{self.config.bucket}/{path}",
                                    maximum=MAX_ASSET_BYTES)
        if observed != 404:
            raise TrialNotReadyError(("website_media_delete_unconfirmed",))
