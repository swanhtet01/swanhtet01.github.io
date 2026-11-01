"""Default-off HTTP boundary for connected-site v15 reconciliation.

This module deliberately exports only a router factory.  The canonical runtime
does not mount it, and no environment variable can enable it.  A future
composition must inject an authenticated device principal, a fresh authority
provider and an already-authenticated repository explicitly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
from typing import Any, Callable, Mapping, Protocol, Sequence

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from .connected_site_v15 import (
    ConnectedSiteV15Adapter,
    ConnectedSiteV15Error,
    SiteAuthority,
    UploadDecision,
    UploadEvent,
)


RECONCILE_REQUEST_CONTRACT = "supermega.connected-site-reconcile-request.v1"
RECONCILE_RESPONSE_CONTRACT = "supermega.connected-site-reconcile-response.v1"
AUTHORITY_RESPONSE_CONTRACT = "supermega.connected-site-authority-response.v1"
ERROR_CONTRACT = "supermega.connected-site-runtime-error.v1"
DEFAULT_MAX_BODY_BYTES = 1024 * 1024

_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_SENSITIVE_KEY_PARTS = (
    "authorization",
    "bearer",
    "cookie",
    "credential",
    "password",
    "secret",
    "sessiontoken",
    "supabase",
    "token",
)


@dataclass(frozen=True, slots=True)
class ConnectedSitePrincipal:
    """Gateway-authenticated device identity, never supplied by request JSON."""

    workspace_id: str
    site_id: str
    device_id: str
    authenticated: bool
    identity_provider: str

    def __post_init__(self) -> None:
        for value in (
            self.workspace_id,
            self.site_id,
            self.device_id,
            self.identity_provider,
        ):
            if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
                raise ValueError("connected_site_principal_invalid")


class ConnectedSiteAuthorityProvider(Protocol):
    """Returns the current, independently verified authority snapshot."""

    def load_authority(self, *, workspace_id: str, site_id: str) -> SiteAuthority | None: ...


PrincipalResolver = Callable[[Request], ConnectedSitePrincipal | None]


class ConnectedSiteRuntimeService:
    """Small transport service over the existing fail-closed v15 adapter."""

    def __init__(
        self,
        *,
        authority_provider: ConnectedSiteAuthorityProvider,
        repository: Any,
        runtime_enabled: bool = False,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._authority_provider = authority_provider
        self._repository = repository
        self._runtime_enabled = runtime_enabled
        self._now = now or (lambda: datetime.now(timezone.utc))

    def authority(
        self,
        *,
        principal: ConnectedSitePrincipal,
        workspace_id: str,
        site_id: str,
    ) -> Mapping[str, Any]:
        authority = self._current_authority(
            principal=principal,
            workspace_id=workspace_id,
            site_id=site_id,
        )
        device = authority.devices.get(principal.device_id)
        if device is None or not device.active:
            raise ConnectedSiteV15Error("connected_site_device_denied")
        return {
            "contract": AUTHORITY_RESPONSE_CONTRACT,
            "workspaceId": authority.workspace_id,
            "siteId": authority.site_id,
            "deviceId": principal.device_id,
            "authorityGeneration": authority.authority_generation,
            "configurationGeneration": authority.configuration_generation,
            "revocationGeneration": authority.revocation_generation,
            "authorityPayload": dict(authority.authority_payload),
            "authorityPayloadDigest": authority.authority_payload_digest,
            "authoritySignature": authority.authority_signature,
            "authorityIssuerKeys": dict(authority.authority_issuer_keys),
            "leaseIssuerKeys": dict(authority.issuer_keys),
            "device": {
                "signingKeyId": device.signing_key_id,
                "publicKey": device.public_key,
                "clientFingerprint": device.client_fingerprint,
                "enrollmentEvidenceDigest": device.enrollment_evidence_digest,
                "coordinatorBindingDigest": device.coordinator_binding_digest,
                "sessionGeneration": device.session_generation,
            },
        }

    def reconcile(
        self,
        *,
        principal: ConnectedSitePrincipal,
        request: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        parsed = _parse_reconcile_request(request)
        authority = self._current_authority(
            principal=principal,
            workspace_id=parsed["workspaceId"],
            site_id=parsed["siteId"],
        )
        if parsed["deviceId"] != principal.device_id:
            raise ConnectedSiteV15Error("connected_site_device_scope")
        adapter = ConnectedSiteV15Adapter(
            authorities={(authority.workspace_id, authority.site_id): authority},
            repository=self._repository,
            runtime_enabled=True,
        )
        decisions = adapter.reconcile(
            workspace_id=parsed["workspaceId"],
            site_id=parsed["siteId"],
            device_id=parsed["deviceId"],
            session_generation=parsed["sessionGeneration"],
            revocation_generation=parsed["revocationGeneration"],
            after_cursor=parsed["afterCursor"],
            events=parsed["events"],
            now=self._now(),
        )
        return {
            "contract": RECONCILE_RESPONSE_CONTRACT,
            "workspaceId": authority.workspace_id,
            "siteId": authority.site_id,
            "deviceId": principal.device_id,
            "afterCursor": parsed["afterCursor"],
            "nextCursor": (
                parsed["events"][-1].cursor if parsed["events"] else parsed["afterCursor"]
            ),
            "decisions": [_decision_json(decision) for decision in decisions],
        }

    def _current_authority(
        self,
        *,
        principal: ConnectedSitePrincipal,
        workspace_id: str,
        site_id: str,
    ) -> SiteAuthority:
        if not self._runtime_enabled:
            raise ConnectedSiteV15Error("connected_site_server_adapter_disabled")
        if not principal.authenticated:
            raise ConnectedSiteV15Error("connected_site_principal_unauthenticated")
        if (principal.workspace_id, principal.site_id) != (workspace_id, site_id):
            raise ConnectedSiteV15Error("connected_site_principal_scope")
        authority = self._authority_provider.load_authority(
            workspace_id=workspace_id,
            site_id=site_id,
        )
        if authority is None or not authority.enabled:
            raise ConnectedSiteV15Error("connected_site_site_authority_unavailable")
        if (authority.workspace_id, authority.site_id) != (workspace_id, site_id):
            raise ConnectedSiteV15Error("connected_site_authority_scope")
        return authority


def create_connected_site_router(
    *,
    service: ConnectedSiteRuntimeService,
    resolve_principal: PrincipalResolver,
    max_body_bytes: int = DEFAULT_MAX_BODY_BYTES,
) -> APIRouter:
    """Create an unmounted router; callers must opt in through reviewed composition."""

    if not isinstance(max_body_bytes, int) or isinstance(max_body_bytes, bool) or max_body_bytes < 1024:
        raise ValueError("connected_site_body_limit_invalid")
    router = APIRouter(prefix="/api/connected-site/v1", tags=["connected-site-disabled"])

    @router.get("/workspaces/{workspace_id}/sites/{site_id}/authority")
    async def authority(workspace_id: str, site_id: str, request: Request) -> JSONResponse:
        _reject_ambient_authority(request)
        principal = _principal(resolve_principal, request)
        try:
            result = service.authority(
                principal=principal,
                workspace_id=_identifier(workspace_id),
                site_id=_identifier(site_id),
            )
            return JSONResponse(result, headers={"cache-control": "no-store"})
        except ConnectedSiteV15Error as exc:
            raise _http_error(exc) from None

    @router.post("/reconcile")
    async def reconcile(request: Request) -> JSONResponse:
        _reject_ambient_authority(request)
        principal = _principal(resolve_principal, request)
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > max_body_bytes:
                    raise _error(413, "request_too_large")
            except ValueError:
                raise _error(400, "content_length_invalid") from None
        body = await request.body()
        if not body or len(body) > max_body_bytes:
            raise _error(413 if body else 400, "request_too_large" if body else "request_body_invalid")
        try:
            parsed = json.loads(body, object_pairs_hook=_unique_object)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise _error(400, "request_json_invalid") from None
        if not isinstance(parsed, dict) or _contains_sensitive_key(parsed):
            raise _error(400, "request_shape_invalid")
        try:
            result = service.reconcile(principal=principal, request=parsed)
            return JSONResponse(result, headers={"cache-control": "no-store"})
        except ConnectedSiteV15Error as exc:
            raise _http_error(exc) from None

    return router


def _principal(resolver: PrincipalResolver, request: Request) -> ConnectedSitePrincipal:
    try:
        principal = resolver(request)
    except Exception:
        principal = None
    if principal is None or not principal.authenticated:
        raise _error(401, "principal_unauthenticated")
    return principal


def _reject_ambient_authority(request: Request) -> None:
    forbidden = {
        "authorization",
        "cookie",
        "x-supabase-api-key",
        "x-supabase-auth",
        "x-supabase-token",
    }
    if any(name.casefold() in forbidden for name in request.headers):
        raise _error(400, "ambient_authority_rejected")


def _parse_reconcile_request(value: Mapping[str, Any]) -> dict[str, Any]:
    keys = {
        "contract",
        "workspaceId",
        "siteId",
        "deviceId",
        "sessionGeneration",
        "revocationGeneration",
        "afterCursor",
        "events",
    }
    if set(value) != keys or value.get("contract") != RECONCILE_REQUEST_CONTRACT:
        raise ConnectedSiteV15Error("connected_site_request_shape")
    workspace_id = _identifier(value["workspaceId"])
    site_id = _identifier(value["siteId"])
    device_id = _identifier(value["deviceId"])
    integers = ("sessionGeneration", "revocationGeneration", "afterCursor")
    if any(
        not isinstance(value[key], int) or isinstance(value[key], bool) or value[key] < 0
        for key in integers
    ) or value["sessionGeneration"] < 1:
        raise ConnectedSiteV15Error("connected_site_request_generation")
    events = value["events"]
    if not isinstance(events, list) or len(events) > 256:
        raise ConnectedSiteV15Error("connected_site_request_events")
    uploads: list[UploadEvent] = []
    event_keys = {"cursor", "commandId", "commandDigest", "event", "eventDigest", "cloudProof"}
    for item in events:
        if not isinstance(item, dict) or set(item) != event_keys:
            raise ConnectedSiteV15Error("connected_site_upload_shape")
        if (
            not isinstance(item["cursor"], int)
            or isinstance(item["cursor"], bool)
            or item["cursor"] < 1
            or not isinstance(item["commandId"], str)
            or not _IDENTIFIER.fullmatch(item["commandId"])
            or not isinstance(item["commandDigest"], str)
            or not _DIGEST.fullmatch(item["commandDigest"])
            or not isinstance(item["event"], dict)
            or not isinstance(item["eventDigest"], str)
            or not _DIGEST.fullmatch(item["eventDigest"])
            or not isinstance(item["cloudProof"], dict)
        ):
            raise ConnectedSiteV15Error("connected_site_upload_shape")
        uploads.append(
            UploadEvent(
                item["cursor"],
                item["commandId"],
                item["commandDigest"],
                item["event"],
                item["eventDigest"],
                item["cloudProof"],
            )
        )
    return {
        "workspaceId": workspace_id,
        "siteId": site_id,
        "deviceId": device_id,
        "sessionGeneration": value["sessionGeneration"],
        "revocationGeneration": value["revocationGeneration"],
        "afterCursor": value["afterCursor"],
        "events": tuple(uploads),
    }


def _identifier(value: Any) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ConnectedSiteV15Error("connected_site_request_identifier")
    return value


def _decision_json(decision: UploadDecision) -> dict[str, Any]:
    return {
        "commandId": decision.command_id,
        "commandDigest": decision.command_digest,
        "state": decision.state,
        "canonicalVersion": decision.canonical_version,
        "eventDigest": decision.event_digest,
        "reason": decision.reason,
    }


def _unique_object(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def _contains_sensitive_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).casefold())
            if any(part in normalized for part in _SENSITIVE_KEY_PARTS):
                return True
            if _contains_sensitive_key(item):
                return True
    elif isinstance(value, list):
        return any(_contains_sensitive_key(item) for item in value)
    return False


def _http_error(exc: ConnectedSiteV15Error) -> HTTPException:
    code = str(exc)
    if code.startswith("connected_site_"):
        code = code.removeprefix("connected_site_")
    forbidden = (
        "authority",
        "device",
        "generation",
        "principal",
        "revocation",
        "session",
        "site",
    )
    status = 403 if any(part in code for part in forbidden) else 409 if (
        "conflict" in code or "cursor" in code
    ) else 503 if "disabled" in code else 422
    return _error(status, code)


def _error(status: int, code: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"contract": ERROR_CONTRACT, "error": code})
