"""Server-only private Supabase object storage. No bucket creation or public URLs."""

from dataclasses import dataclass
from hashlib import sha256
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

from .supabase_auth import SupabaseAuthConfig, _NoRedirectHandler, _decode_jwt_payload
from .trial_store import TrialNotReadyError
from .website_media import MAX_ASSET_BYTES, PreparedPhoto, private_object_path

BUCKET = "supermega-sites-media"


@dataclass(frozen=True, repr=False)
class MediaStorageConfig:
    base_url: str = ""
    secret: str = ""

    @classmethod
    def from_environment(cls):
        base = SupabaseAuthConfig.from_environment().base_url
        secret = os.getenv("SUPERMEGA_WEBSITE_MEDIA_STORAGE_KEY", "").strip()
        legacy = _decode_jwt_payload(secret)
        valid_key = (secret.startswith("sb_secret_") and len(secret) >= 24) or (
            bool(legacy) and legacy.get("role") == "service_role")
        return cls(base if base.startswith("https://") else "", secret if valid_key else "")

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
        headers = {"apikey": self.config.secret, "accept": "application/json",
                   "user-agent": "supermega-sites-media/1"}
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
        status, body = self._request("GET", f"bucket/{BUCKET}")
        try:
            bucket = json.loads(body)
        except (ValueError, UnicodeError):
            bucket = None
        if status != 200 or not isinstance(bucket, dict) or bucket.get("id") != BUCKET or bucket.get("public") is not False:
            raise TrialNotReadyError(("website_media_private_bucket_required",))

    def put(self, workspace_id: str, photo: PreparedPhoto) -> dict:
        self._require_private_bucket()
        path = private_object_path(workspace_id, photo.asset_id)
        status, _ = self._request("POST", f"object/{BUCKET}/{path}", data=photo.data)
        if status not in (200, 201, 400, 409):
            raise TrialNotReadyError(("website_media_upload_unconfirmed",))
        # A duplicate or interrupted retry is success only when exact immutable bytes exist.
        stored = self._download(path)
        if stored != photo.data:
            raise TrialNotReadyError(("website_media_integrity_failed",))
        return photo.receipt()

    def _download(self, path: str) -> bytes:
        status, body = self._request("GET", f"object/authenticated/{BUCKET}/{path}", maximum=MAX_ASSET_BYTES)
        if status != 200 or not body:
            raise TrialNotReadyError(("website_media_read_unconfirmed",))
        return body

    def get(self, workspace_id: str, asset_id: str) -> bytes:
        path = private_object_path(workspace_id, asset_id)
        self._require_private_bucket()
        body = self._download(path)
        if sha256(body).hexdigest() != asset_id[:-5]:
            raise TrialNotReadyError(("website_media_integrity_failed",))
        return body
