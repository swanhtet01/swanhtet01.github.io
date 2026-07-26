from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


CONTRACT = "supermega.private-storage-privacy.v1"
ADAPTER = "supabase_storage_rest_v2"
MAX_RESPONSE_BYTES = 32_768
MAX_JSON_DEPTH = 8
MAX_JSON_NODES = 256
MAX_JSON_STRING_BYTES = 8_192
MAX_REQUESTS = 6
REQUEST_TIMEOUT_SECONDS = 8
SIGNED_URL_TTL_SECONDS = 60
READ_ONLY_METHODS = frozenset({"GET", "HEAD", "POST"})
DENIED_STATUSES = frozenset({401, 403, 404})
ANONYMOUS_DENIED_STATUSES = frozenset({401, 403})

ENV_ADAPTER = "SUPERMEGA_STORAGE_PRIVACY_ADAPTER"
ENV_BASE_URL = "SUPERMEGA_STORAGE_PRIVACY_BASE_URL"
ENV_ALLOWED_HOST = "SUPERMEGA_STORAGE_PRIVACY_ALLOWED_HOST"
ENV_OWNER_APPROVAL_ID = "SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID"
ENV_BUCKET = "SUPERMEGA_STORAGE_PRIVACY_BUCKET"
ENV_TENANT_A_PREFIX = "SUPERMEGA_STORAGE_PRIVACY_TENANT_A_PREFIX"
ENV_TENANT_A_OBJECT = "SUPERMEGA_STORAGE_PRIVACY_TENANT_A_OBJECT"
ENV_TENANT_B_PREFIX = "SUPERMEGA_STORAGE_PRIVACY_TENANT_B_PREFIX"
ENV_TENANT_B_OBJECT = "SUPERMEGA_STORAGE_PRIVACY_TENANT_B_OBJECT"
ENV_PUBLISHABLE_KEY = "SUPERMEGA_STORAGE_PRIVACY_PUBLISHABLE_KEY"
ENV_TENANT_A_JWT = "SUPERMEGA_STORAGE_PRIVACY_TENANT_A_JWT"
ENV_TENANT_B_JWT = "SUPERMEGA_STORAGE_PRIVACY_TENANT_B_JWT"

_HOST_PATTERN = re.compile(
    r"(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\Z"
)
_BUCKET_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9._-]{0,62})?\Z")
_PATH_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,254}[A-Za-z0-9._-])?\Z")
_APPROVAL_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._:-]{6,126}[A-Za-z0-9])?\Z")
_SAFE_ERROR_PATTERN = re.compile(r"[a-z][a-z0-9_]{2,80}\Z")


class PrivacyAuditError(RuntimeError):
    def __init__(self, code: str) -> None:
        if not _SAFE_ERROR_PATTERN.fullmatch(code):
            code = "privacy_audit_failed"
        self.code = code
        super().__init__(code)


def _strict_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise PrivacyAuditError("response_json_duplicate_key")
        value[key] = item
    return value


def _validate_json_tree(value: Any, *, depth: int = 0, budget: list[int] | None = None) -> None:
    if budget is None:
        budget = [MAX_JSON_NODES]
    budget[0] -= 1
    if budget[0] < 0:
        raise PrivacyAuditError("response_json_too_complex")
    if depth > MAX_JSON_DEPTH:
        raise PrivacyAuditError("response_json_too_deep")
    if value is None or isinstance(value, (bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise PrivacyAuditError("response_json_invalid_number")
        return
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_JSON_STRING_BYTES:
            raise PrivacyAuditError("response_json_string_too_large")
        return
    if isinstance(value, list):
        if len(value) > 32:
            raise PrivacyAuditError("response_json_array_too_large")
        for item in value:
            _validate_json_tree(item, depth=depth + 1, budget=budget)
        return
    if isinstance(value, dict):
        if len(value) > 32:
            raise PrivacyAuditError("response_json_object_too_large")
        for key, item in value.items():
            if not isinstance(key, str) or len(key.encode("utf-8")) > 128:
                raise PrivacyAuditError("response_json_key_invalid")
            _validate_json_tree(item, depth=depth + 1, budget=budget)
        return
    raise PrivacyAuditError("response_json_type_invalid")


def _parse_json(raw: bytes) -> Any:
    if len(raw) > MAX_RESPONSE_BYTES:
        raise PrivacyAuditError("response_too_large")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_strict_json_object)
    except PrivacyAuditError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PrivacyAuditError("response_json_invalid") from exc
    _validate_json_tree(value)
    return value


def _digest(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _base64url_decode(value: str) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise PrivacyAuditError("jwt_shape_invalid")
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, base64.binascii.Error) as exc:
        raise PrivacyAuditError("jwt_shape_invalid") from exc


def _jwt_payload(token: str) -> dict[str, Any]:
    if len(token.encode("utf-8")) > 8_192 or "\r" in token or "\n" in token:
        raise PrivacyAuditError("jwt_shape_invalid")
    segments = token.split(".")
    if len(segments) != 3 or not all(segments):
        raise PrivacyAuditError("jwt_shape_invalid")
    payload = _parse_json(_base64url_decode(segments[1]))
    if not isinstance(payload, dict):
        raise PrivacyAuditError("jwt_payload_invalid")
    return payload


def _validate_publishable_key(value: str) -> str:
    key = value.strip()
    lowered = key.lower()
    if not key or len(key.encode("utf-8")) > 2_048 or "\r" in key or "\n" in key:
        raise PrivacyAuditError("publishable_key_invalid")
    if lowered.startswith(("sb_secret_", "sbp_")) or "service_role" in lowered:
        raise PrivacyAuditError("service_role_key_forbidden")
    if key.startswith("sb_publishable_"):
        if len(key) < 24 or not re.fullmatch(r"[A-Za-z0-9._-]+", key):
            raise PrivacyAuditError("publishable_key_invalid")
        return key
    payload = _jwt_payload(key)
    if payload.get("role") != "anon":
        raise PrivacyAuditError("publishable_key_role_invalid")
    return key


def _validate_user_jwt(value: str, *, now: datetime) -> tuple[str, str]:
    token = value.strip()
    payload = _jwt_payload(token)
    if payload.get("role") != "authenticated":
        raise PrivacyAuditError("tenant_jwt_role_invalid")
    subject = payload.get("sub")
    if not isinstance(subject, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{3,128}", subject):
        raise PrivacyAuditError("tenant_jwt_subject_invalid")
    expires_at = payload.get("exp")
    if not isinstance(expires_at, int) or isinstance(expires_at, bool):
        raise PrivacyAuditError("tenant_jwt_expiry_invalid")
    if expires_at <= int(now.timestamp()) + SIGNED_URL_TTL_SECONDS:
        raise PrivacyAuditError("tenant_jwt_expired_or_too_short")
    return token, subject


def _validate_path(value: str, *, prefix: bool) -> str:
    path = value.strip()
    match_value = path[:-1] if prefix and path.endswith("/") else path
    if not path or not _PATH_PATTERN.fullmatch(match_value):
        raise PrivacyAuditError("storage_path_invalid")
    if prefix and not path.endswith("/"):
        raise PrivacyAuditError("storage_prefix_slash_required")
    if any(part in {"", ".", ".."} for part in match_value.split("/")):
        raise PrivacyAuditError("storage_path_invalid")
    return path


def _require_environment(environment: dict[str, str], key: str) -> str:
    value = str(environment.get(key, "")).strip()
    if not value:
        raise PrivacyAuditError("storage_audit_environment_incomplete")
    return value


@dataclass(frozen=True)
class AuditConfig:
    base_url: str
    host: str
    owner_approval_id: str
    bucket: str
    tenant_a_prefix: str
    tenant_a_object: str
    tenant_b_prefix: str
    tenant_b_object: str
    publishable_key: str
    tenant_a_jwt: str
    tenant_b_jwt: str

    @property
    def storage_url(self) -> str:
        return f"{self.base_url}/storage/v1"


def load_config(environment: dict[str, str] | None = None, *, now: datetime | None = None) -> AuditConfig:
    values = dict(os.environ if environment is None else environment)
    captured_at = now or datetime.now(timezone.utc)
    if _require_environment(values, ENV_ADAPTER) != ADAPTER:
        raise PrivacyAuditError("storage_adapter_invalid")

    allowed_host = _require_environment(values, ENV_ALLOWED_HOST).lower().rstrip(".")
    if not _HOST_PATTERN.fullmatch(allowed_host):
        raise PrivacyAuditError("storage_allowed_host_invalid")
    raw_base_url = _require_environment(values, ENV_BASE_URL)
    try:
        parsed = urlsplit(raw_base_url)
        port = parsed.port
    except ValueError as exc:
        raise PrivacyAuditError("storage_base_url_invalid") from exc
    host = str(parsed.hostname or "").lower().rstrip(".")
    if (
        parsed.scheme.lower() != "https"
        or host != allowed_host
        or port not in {None, 443}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise PrivacyAuditError("storage_base_url_invalid")

    owner_approval_id = _require_environment(values, ENV_OWNER_APPROVAL_ID)
    if not _APPROVAL_PATTERN.fullmatch(owner_approval_id):
        raise PrivacyAuditError("owner_approval_id_invalid")
    bucket = _require_environment(values, ENV_BUCKET)
    if not _BUCKET_PATTERN.fullmatch(bucket):
        raise PrivacyAuditError("storage_bucket_invalid")

    tenant_a_prefix = _validate_path(_require_environment(values, ENV_TENANT_A_PREFIX), prefix=True)
    tenant_a_object = _validate_path(_require_environment(values, ENV_TENANT_A_OBJECT), prefix=False)
    tenant_b_prefix = _validate_path(_require_environment(values, ENV_TENANT_B_PREFIX), prefix=True)
    tenant_b_object = _validate_path(_require_environment(values, ENV_TENANT_B_OBJECT), prefix=False)
    if (
        tenant_a_prefix == tenant_b_prefix
        or tenant_a_prefix.startswith(tenant_b_prefix)
        or tenant_b_prefix.startswith(tenant_a_prefix)
        or not tenant_a_object.startswith(tenant_a_prefix)
        or not tenant_b_object.startswith(tenant_b_prefix)
    ):
        raise PrivacyAuditError("tenant_storage_boundaries_invalid")

    publishable_key = _validate_publishable_key(_require_environment(values, ENV_PUBLISHABLE_KEY))
    tenant_a_jwt, tenant_a_subject = _validate_user_jwt(
        _require_environment(values, ENV_TENANT_A_JWT), now=captured_at
    )
    tenant_b_jwt, tenant_b_subject = _validate_user_jwt(
        _require_environment(values, ENV_TENANT_B_JWT), now=captured_at
    )
    if tenant_a_subject == tenant_b_subject or tenant_a_jwt == tenant_b_jwt:
        raise PrivacyAuditError("tenant_identities_not_isolated")

    return AuditConfig(
        base_url=f"https://{host}",
        host=host,
        owner_approval_id=owner_approval_id,
        bucket=bucket,
        tenant_a_prefix=tenant_a_prefix,
        tenant_a_object=tenant_a_object,
        tenant_b_prefix=tenant_b_prefix,
        tenant_b_object=tenant_b_object,
        publishable_key=publishable_key,
        tenant_a_jwt=tenant_a_jwt,
        tenant_b_jwt=tenant_b_jwt,
    )


@dataclass(frozen=True)
class AuditResponse:
    status: int
    headers: dict[str, str]
    body: bytes = b""


class AuditTransport(Protocol):
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        expect_json: bool,
    ) -> AuditResponse: ...


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        del req, fp, code, msg, headers, newurl
        raise PrivacyAuditError("redirect_rejected")


class NetworkTransport:
    def __init__(self) -> None:
        self._opener = build_opener(ProxyHandler({}), _NoRedirectHandler())

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        expect_json: bool,
    ) -> AuditResponse:
        if method not in READ_ONLY_METHODS:
            raise PrivacyAuditError("mutating_http_method_forbidden")
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with self._opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                response_headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
                raw = self._read_body(response, response_headers, expect_json=expect_json)
                return AuditResponse(int(response.status), response_headers, raw)
        except PrivacyAuditError:
            raise
        except HTTPError as exc:
            try:
                return AuditResponse(int(exc.code), {}, b"")
            finally:
                exc.close()
        except (TimeoutError, URLError, OSError) as exc:
            raise PrivacyAuditError("storage_network_request_failed") from exc

    @staticmethod
    def _read_body(response: Any, headers: dict[str, str], *, expect_json: bool) -> bytes:
        if not expect_json:
            response.read(1)
            return b""
        content_type = headers.get("content-type", "").lower()
        if "application/json" not in content_type and "+json" not in content_type:
            raise PrivacyAuditError("response_content_type_invalid")
        content_length = headers.get("content-length", "").strip()
        if content_length:
            try:
                length = int(content_length)
            except ValueError as exc:
                raise PrivacyAuditError("response_content_length_invalid") from exc
            if length < 0 or length > MAX_RESPONSE_BYTES:
                raise PrivacyAuditError("response_too_large")
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise PrivacyAuditError("response_too_large")
        return raw


def _status_class(status: int) -> str:
    return f"{status // 100}xx" if 100 <= status <= 599 else "invalid"


def _list_result(response: AuditResponse) -> dict[str, Any]:
    if response.status != 200:
        raise PrivacyAuditError("storage_listing_failed")
    payload = _parse_json(response.body)
    if not isinstance(payload, dict) or set(payload) - {"hasNext", "folders", "objects", "nextCursor"}:
        raise PrivacyAuditError("storage_list_shape_invalid")
    if not isinstance(payload.get("hasNext"), bool):
        raise PrivacyAuditError("storage_list_shape_invalid")
    folders = payload.get("folders")
    objects = payload.get("objects")
    if not isinstance(folders, list) or not isinstance(objects, list):
        raise PrivacyAuditError("storage_list_shape_invalid")
    if len(folders) > 2 or len(objects) > 2:
        raise PrivacyAuditError("storage_list_limit_ignored")
    if not all(isinstance(item, dict) for item in [*folders, *objects]):
        raise PrivacyAuditError("storage_list_shape_invalid")
    return payload


def _contains_object(payload: dict[str, Any], *, bucket: str, expected_path: str) -> bool:
    expected_names = {expected_path, f"{bucket}/{expected_path}", expected_path.rsplit("/", 1)[-1]}
    for item in payload["objects"]:
        key = item.get("key")
        name = item.get("name")
        if (isinstance(key, str) and key in expected_names) or (
            isinstance(name, str) and name in expected_names
        ):
            return True
    return False


def _validate_signed_url(config: AuditConfig, value: Any) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > MAX_JSON_STRING_BYTES:
        raise PrivacyAuditError("signed_url_shape_invalid")
    if value.startswith("/object/sign/"):
        candidate = f"{config.storage_url}{value}"
    else:
        candidate = value
    try:
        parsed = urlsplit(candidate)
        port = parsed.port
    except ValueError as exc:
        raise PrivacyAuditError("signed_url_target_invalid") from exc
    expected_path = f"/storage/v1/object/sign/{config.bucket}/{config.tenant_b_object}"
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    token_values = query.get("token")
    if (
        parsed.scheme.lower() != "https"
        or str(parsed.hostname or "").lower().rstrip(".") != config.host
        or port not in {None, 443}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or unquote(parsed.path) != expected_path
        or set(query) != {"token"}
        or not isinstance(token_values, list)
        or len(token_values) != 1
        or not token_values[0]
        or len(token_values[0].encode("utf-8")) > 4_096
    ):
        raise PrivacyAuditError("signed_url_target_invalid")
    return candidate


class PrivacyAuditSession:
    def __init__(self, config: AuditConfig, transport: AuditTransport) -> None:
        self.config = config
        self.transport = transport
        self.request_count = 0
        self.http_post_count = 0

    def _request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any] | None = None,
        expect_json: bool,
    ) -> AuditResponse:
        if method not in READ_ONLY_METHODS:
            raise PrivacyAuditError("mutating_http_method_forbidden")
        if self.request_count >= MAX_REQUESTS:
            raise PrivacyAuditError("storage_request_budget_exceeded")
        self.request_count += 1
        if method == "POST":
            self.http_post_count += 1
        body = None if payload is None else json.dumps(
            payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
        return self.transport.request(
            method=method,
            url=url,
            headers=headers,
            body=body,
            expect_json=expect_json,
        )

    def _headers(self, jwt: str | None) -> dict[str, str]:
        credential = self.config.publishable_key if jwt is None else jwt
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {credential}",
            "Content-Type": "application/json",
            "apikey": self.config.publishable_key,
            "Cache-Control": "no-store",
            "User-Agent": "supermega-private-storage-privacy/1",
        }

    def _list(self, *, prefix: str, jwt: str | None) -> AuditResponse:
        bucket = quote(self.config.bucket, safe="")
        return self._request(
            method="POST",
            url=f"{self.config.storage_url}/object/list-v2/{bucket}",
            headers=self._headers(jwt),
            payload={
                "limit": 2,
                "prefix": prefix,
                "sortBy": {"column": "name", "order": "asc"},
                "with_delimiter": False,
            },
            expect_json=True,
        )

    def run(self, *, captured_at: datetime | None = None) -> dict[str, Any]:
        now = (captured_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        proofs: list[dict[str, str | int]] = []

        anonymous = self._list(prefix="", jwt=None)
        if anonymous.status not in ANONYMOUS_DENIED_STATUSES:
            raise PrivacyAuditError("anonymous_listing_not_denied")
        proofs.append(
            {
                "id": "anonymous_bucket_listing_denied",
                "result": "denied",
                "http_status_class": _status_class(anonymous.status),
            }
        )

        own_listing = self._list(prefix=self.config.tenant_a_prefix, jwt=self.config.tenant_a_jwt)
        own_payload = _list_result(own_listing)
        if not _contains_object(
            own_payload, bucket=self.config.bucket, expected_path=self.config.tenant_a_object
        ):
            raise PrivacyAuditError("own_sentinel_not_visible")
        proofs.append(
            {
                "id": "tenant_a_positive_control",
                "result": "sentinel_visible",
                "http_status_class": _status_class(own_listing.status),
            }
        )

        cross_listing = self._list(prefix=self.config.tenant_b_prefix, jwt=self.config.tenant_a_jwt)
        if cross_listing.status in DENIED_STATUSES:
            cross_listing_result = "denied"
        elif cross_listing.status == 200:
            cross_payload = _list_result(cross_listing)
            if cross_payload["folders"] or cross_payload["objects"] or cross_payload["hasNext"]:
                raise PrivacyAuditError("cross_tenant_listing_visible")
            cross_listing_result = "empty_filtered"
        else:
            raise PrivacyAuditError("cross_tenant_listing_unproven")
        proofs.append(
            {
                "id": "cross_tenant_listing_denied",
                "result": cross_listing_result,
                "http_status_class": _status_class(cross_listing.status),
            }
        )

        bucket = quote(self.config.bucket, safe="")
        tenant_b_object = quote(self.config.tenant_b_object, safe="/")
        cross_object = self._request(
            method="GET",
            url=f"{self.config.storage_url}/object/authenticated/{bucket}/{tenant_b_object}",
            headers={**self._headers(self.config.tenant_a_jwt), "Range": "bytes=0-0"},
            expect_json=False,
        )
        if cross_object.status not in DENIED_STATUSES:
            raise PrivacyAuditError("cross_tenant_object_visible")
        proofs.append(
            {
                "id": "cross_tenant_object_denied",
                "result": "denied",
                "http_status_class": _status_class(cross_object.status),
            }
        )

        sign_response = self._request(
            method="POST",
            url=f"{self.config.storage_url}/object/sign/{bucket}/{tenant_b_object}",
            headers=self._headers(self.config.tenant_b_jwt),
            payload={"expiresIn": SIGNED_URL_TTL_SECONDS},
            expect_json=True,
        )
        if sign_response.status != 200:
            raise PrivacyAuditError("signed_url_creation_failed")
        sign_payload = _parse_json(sign_response.body)
        if not isinstance(sign_payload, dict) or set(sign_payload) != {"signedURL"}:
            raise PrivacyAuditError("signed_url_shape_invalid")
        signed_url = _validate_signed_url(self.config, sign_payload["signedURL"])
        proofs.append(
            {
                "id": "tenant_b_short_lived_url_created",
                "result": "created",
                "http_status_class": _status_class(sign_response.status),
                "ttl_seconds": SIGNED_URL_TTL_SECONDS,
            }
        )

        signed_access = self._request(
            method="HEAD",
            url=signed_url,
            headers={"Accept": "application/octet-stream", "Cache-Control": "no-store"},
            expect_json=False,
        )
        if signed_access.status not in {200, 206}:
            raise PrivacyAuditError("signed_object_access_failed")
        proofs.append(
            {
                "id": "tenant_b_signed_object_access",
                "result": "accessible",
                "http_status_class": _status_class(signed_access.status),
            }
        )

        if self.request_count != MAX_REQUESTS:
            raise PrivacyAuditError("storage_request_budget_mismatch")
        evidence = {
            "contract": CONTRACT,
            "adapter": ADAPTER,
            "target_host_digest": _digest(self.config.host),
            "bucket_digest": _digest(self.config.bucket),
            "owner_approval_digest": _digest(self.config.owner_approval_id),
            "captured_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "proofs": proofs,
            "provider_requests_performed": self.request_count,
            "http_post_requests_performed": self.http_post_count,
            "persistent_mutations_performed": 0,
            "object_body_bytes_returned": 0,
            "secrets_exposed": False,
            "bucket_or_object_names_exposed": False,
        }
        encoded = json.dumps(evidence, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
        return {"ok": True, **evidence, "evidence_digest": _digest(encoded)}


class _FixtureTransport:
    def __init__(self, responses: list[AuditResponse | PrivacyAuditError]) -> None:
        self.responses = list(responses)
        self.requests: list[tuple[str, str, dict[str, str], bytes | None]] = []

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        expect_json: bool,
    ) -> AuditResponse:
        self.requests.append((method, url, dict(headers), body))
        if not self.responses:
            raise PrivacyAuditError("fixture_response_missing")
        response = self.responses.pop(0)
        if isinstance(response, PrivacyAuditError):
            raise response
        if expect_json and 200 <= response.status < 300:
            content_type = response.headers.get("content-type", "").lower()
            if "application/json" not in content_type and "+json" not in content_type:
                raise PrivacyAuditError("response_content_type_invalid")
            if len(response.body) > MAX_RESPONSE_BYTES:
                raise PrivacyAuditError("response_too_large")
        return response


def _test_jwt(*, role: str, subject: str, expires_at: int = 4_102_444_800) -> str:
    def encode(value: dict[str, Any]) -> str:
        raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{encode({'alg': 'none', 'typ': 'JWT'})}.{encode({'exp': expires_at, 'role': role, 'sub': subject})}.fixture"


def _fixture_environment() -> dict[str, str]:
    return {
        ENV_ADAPTER: ADAPTER,
        ENV_BASE_URL: "https://fixture-project.supabase.co",
        ENV_ALLOWED_HOST: "fixture-project.supabase.co",
        ENV_OWNER_APPROVAL_ID: "OWNER-STORAGE-AUDIT-001",
        ENV_BUCKET: "private-fixture",
        ENV_TENANT_A_PREFIX: "tenant-a/",
        ENV_TENANT_A_OBJECT: "tenant-a/a-sentinel.txt",
        ENV_TENANT_B_PREFIX: "tenant-b/",
        ENV_TENANT_B_OBJECT: "tenant-b/b-sentinel.txt",
        ENV_PUBLISHABLE_KEY: "sb_publishable_fixture_0123456789",
        ENV_TENANT_A_JWT: _test_jwt(role="authenticated", subject="tenant-a-user"),
        ENV_TENANT_B_JWT: _test_jwt(role="authenticated", subject="tenant-b-user"),
    }


def _json_fixture(value: Any, *, status: int = 200) -> AuditResponse:
    return AuditResponse(
        status,
        {"content-type": "application/json"},
        json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8"),
    )


def _fixture_responses(config: AuditConfig) -> list[AuditResponse | PrivacyAuditError]:
    signed_path = quote(config.tenant_b_object, safe="/")
    return [
        AuditResponse(403, {}),
        _json_fixture(
            {
                "folders": [],
                "hasNext": False,
                "objects": [{"key": config.tenant_a_object, "name": "a-sentinel.txt"}],
            }
        ),
        _json_fixture({"folders": [], "hasNext": False, "objects": []}),
        AuditResponse(403, {}),
        _json_fixture(
            {
                "signedURL": (
                    f"/object/sign/{config.bucket}/{signed_path}?token=fixture-signed-token"
                )
            }
        ),
        AuditResponse(200, {}),
    ]


def run_self_test() -> dict[str, Any]:
    cases = 0
    environment = _fixture_environment()
    config = load_config(environment, now=datetime(2030, 1, 1, tzinfo=timezone.utc))

    happy_transport = _FixtureTransport(_fixture_responses(config))
    report = PrivacyAuditSession(config, happy_transport).run(
        captured_at=datetime(2030, 1, 1, tzinfo=timezone.utc)
    )
    cases += 1
    if report["provider_requests_performed"] != MAX_REQUESTS:
        raise PrivacyAuditError("self_test_request_budget_failed")
    if [request[0] for request in happy_transport.requests] != [
        "POST",
        "POST",
        "POST",
        "GET",
        "POST",
        "HEAD",
    ]:
        raise PrivacyAuditError("self_test_method_contract_failed")

    def expect_failure(code: str, responses: list[AuditResponse | PrivacyAuditError]) -> None:
        nonlocal cases
        cases += 1
        try:
            PrivacyAuditSession(config, _FixtureTransport(responses)).run(
                captured_at=datetime(2030, 1, 1, tzinfo=timezone.utc)
            )
        except PrivacyAuditError as exc:
            if exc.code == code:
                return
        raise PrivacyAuditError("self_test_expected_failure_missing")

    public_listing = _fixture_responses(config)
    public_listing[0] = _json_fixture(
        {"folders": [], "hasNext": False, "objects": [{"name": "exposed.txt"}]}
    )
    expect_failure("anonymous_listing_not_denied", public_listing)

    missing_own = _fixture_responses(config)
    missing_own[1] = _json_fixture({"folders": [], "hasNext": False, "objects": []})
    expect_failure("own_sentinel_not_visible", missing_own)

    cross_listing = _fixture_responses(config)
    cross_listing[2] = _json_fixture(
        {"folders": [], "hasNext": False, "objects": [{"name": "b-sentinel.txt"}]}
    )
    expect_failure("cross_tenant_listing_visible", cross_listing)

    cross_object = _fixture_responses(config)
    cross_object[3] = AuditResponse(200, {})
    expect_failure("cross_tenant_object_visible", cross_object)

    malicious_signed_host = _fixture_responses(config)
    malicious_signed_host[4] = _json_fixture(
        {
            "signedURL": (
                "https://evil.example/storage/v1/object/sign/private-fixture/"
                "tenant-b/b-sentinel.txt?token=stolen"
            )
        }
    )
    expect_failure("signed_url_target_invalid", malicious_signed_host)

    oversized = _fixture_responses(config)
    oversized[1] = AuditResponse(
        200,
        {"content-type": "application/json"},
        b"{" + b"x" * MAX_RESPONSE_BYTES + b"}",
    )
    expect_failure("response_too_large", oversized)

    duplicate_key = _fixture_responses(config)
    duplicate_key[1] = AuditResponse(
        200,
        {"content-type": "application/json"},
        b'{"hasNext":false,"hasNext":true,"folders":[],"objects":[]}',
    )
    expect_failure("response_json_duplicate_key", duplicate_key)

    redirect = _fixture_responses(config)
    redirect[0] = PrivacyAuditError("redirect_rejected")
    expect_failure("redirect_rejected", redirect)

    cases += 1
    service_environment = {**environment, ENV_PUBLISHABLE_KEY: "sb_secret_fixture_forbidden"}
    try:
        load_config(service_environment, now=datetime(2030, 1, 1, tzinfo=timezone.utc))
    except PrivacyAuditError as exc:
        if exc.code != "service_role_key_forbidden":
            raise PrivacyAuditError("self_test_service_key_rejection_failed") from exc
    else:
        raise PrivacyAuditError("self_test_service_key_rejection_failed")

    cases += 1
    serialized = json.dumps(report, sort_keys=True)
    forbidden_values = [
        config.publishable_key,
        config.tenant_a_jwt,
        config.tenant_b_jwt,
        config.bucket,
        config.tenant_a_object,
        config.tenant_b_object,
        "fixture-signed-token",
    ]
    if any(value in serialized for value in forbidden_values):
        raise PrivacyAuditError("self_test_redaction_failed")

    return {
        "ok": True,
        "contract": CONTRACT,
        "mode": "offline_adversarial_self_test",
        "cases": cases,
        "network_requests_performed": 0,
        "persistent_mutations_performed": 0,
        "secrets_exposed": False,
    }


def _failure_report(error: PrivacyAuditError, *, requests: int) -> dict[str, Any]:
    return {
        "ok": False,
        "contract": CONTRACT,
        "error": error.code,
        "provider_requests_performed": requests,
        "persistent_mutations_performed": 0,
        "secrets_exposed": False,
        "bucket_or_object_names_exposed": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Prove private managed-storage isolation without writing objects."
    )
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--confirm-read-only-audit", metavar="OWNER_APPROVAL_ID")
    args = parser.parse_args(argv)
    session: PrivacyAuditSession | None = None
    try:
        if args.self_test and args.confirm_read_only_audit:
            raise PrivacyAuditError("audit_mode_conflict")
        if args.self_test:
            result = run_self_test()
        else:
            if not args.confirm_read_only_audit:
                raise PrivacyAuditError("owner_approval_confirmation_required")
            config = load_config()
            if args.confirm_read_only_audit != config.owner_approval_id:
                raise PrivacyAuditError("owner_approval_confirmation_mismatch")
            session = PrivacyAuditSession(config, NetworkTransport())
            result = session.run()
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    except PrivacyAuditError as exc:
        print(
            json.dumps(
                _failure_report(exc, requests=0 if session is None else session.request_count),
                ensure_ascii=True,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
