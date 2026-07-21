"""Canonical, SuperMega-only API runtime for app.supermega.dev.

The public application remains an isolated browser demo until every managed
trial gate is configured. No legacy client runtime is imported here.
"""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from supermega_runtime.cloud_runtime import router as cloud_runtime_router
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    PostgresTrialStore,
    TrialPrincipal,
    TrialValidationError,
)


SERVICE_NAME = "supermega-service"
SERVICE_VERSION = "1.0.0"
TRIAL_EVENT_BY_SURFACE = {
    "command": "command.snapshot.saved",
    "shop": "shop.snapshot.saved",
    "plant": "plant.snapshot.saved",
    "setup": "setup.snapshot.saved",
}
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_MAX_IDENTITY_AGE_SECONDS = 300


def _text(value: object) -> str:
    return str(value or "").strip()


def _flag(name: str, *, default: bool = False) -> bool:
    value = _text(os.getenv(name))
    if not value:
        return default
    return value.casefold() in {"1", "true", "yes", "on"}


def _validate_state_shape(surface: str, state: Mapping[str, Any]) -> None:
    required_lists = {
        "command": ("tasks",),
        "shop": ("items", "sales", "closes"),
        "plant": ("jobs", "issues", "machines"),
    }
    if surface in required_lists:
        missing = [key for key in required_lists[surface] if not isinstance(state.get(key), list)]
        if missing:
            raise TrialValidationError(f"{surface} state requires list fields: {', '.join(missing)}.")
    elif surface == "setup":
        if state.get("product") not in {"shop", "plant"}:
            raise TrialValidationError("setup product must be shop or plant.")
        for field in ("template", "workspace", "owner"):
            if not isinstance(state.get(field), str) or len(str(state[field])) > 160:
                raise TrialValidationError(f"setup {field} must be a string of at most 160 characters.")


def reduce_trial_state(
    surface: str,
    event_type: str,
    _current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Allow one explicit, versioned snapshot command per product surface."""

    expected_event = TRIAL_EVENT_BY_SURFACE.get(surface)
    if event_type != expected_event:
        raise TrialValidationError(f"event_type must be {expected_event or 'a supported snapshot event'}.")
    if set(payload) != {"state"} or not isinstance(payload.get("state"), Mapping):
        raise TrialValidationError("payload must contain exactly one object field named state.")
    state = dict(payload["state"])
    _validate_state_shape(surface, state)
    try:
        encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise TrialValidationError("state must be valid JSON.") from exc
    if len(encoded) > 64 * 1024:
        raise TrialValidationError("state exceeds the 64 KiB trial limit.")
    return deepcopy(state)


def resolve_trial_principal(request: Request) -> TrialPrincipal | None:
    """Verify identity signed by a trusted auth gateway.

    Browsers cannot assert workspace or actor identity by themselves. The
    gateway signs ``v1\n<timestamp>\n<workspace>\n<actor>`` with the server-only
    ``SUPERMEGA_TRIAL_IDENTITY_SECRET``.
    """

    secret = _text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET"))
    workspace_id = _text(request.headers.get("x-supermega-workspace-id"))
    actor_id = _text(request.headers.get("x-supermega-actor-id"))
    timestamp = _text(request.headers.get("x-supermega-identity-timestamp"))
    signature = _text(request.headers.get("x-supermega-identity-signature")).casefold()
    if not all((secret, workspace_id, actor_id, timestamp, signature)):
        return None
    if not _IDENTIFIER.fullmatch(workspace_id) or not _IDENTIFIER.fullmatch(actor_id):
        return None
    try:
        issued_at = int(timestamp)
    except ValueError:
        return None
    if abs(int(time.time()) - issued_at) > _MAX_IDENTITY_AGE_SECONDS:
        return None
    message = f"v1\n{timestamp}\n{workspace_id}\n{actor_id}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    return TrialPrincipal(workspace_id=workspace_id, actor_id=actor_id, authenticated=True)


def _activation_requirements(*, database_ready: bool, role_ready: bool, schema_ready: bool, audit_ready: bool) -> list[str]:
    requirements: list[str] = []
    if not _text(os.getenv("SUPERMEGA_DATABASE_URL")):
        requirements.append("Configure a dedicated, non-BYPASSRLS managed Postgres connection.")
    elif not database_ready:
        requirements.append("Restore the managed Postgres connection and server-only driver.")
    if database_ready and not role_ready:
        requirements.append("Use an encrypted, dedicated non-BYPASSRLS login with only the trial backend role.")
    if not schema_ready:
        requirements.append("Apply and verify the private trial schema on a non-production branch first.")
    if not _text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET")):
        requirements.append("Configure trusted gateway identity signing and named-user access.")
    if not audit_ready:
        requirements.append("Verify immutable audit-event insert access through the runtime role.")
    if not _flag("SUPERMEGA_TRIAL_WRITES_ENABLED"):
        requirements.append("Enable trial writes only after RLS, recovery, and acceptance tests pass.")
    return requirements


def create_app() -> FastAPI:
    database_url = _text(os.getenv("SUPERMEGA_DATABASE_URL"))
    store = PostgresTrialStore(
        database_url,
        reducer=reduce_trial_state,
        write_enabled=_flag("SUPERMEGA_TRIAL_WRITES_ENABLED"),
    )
    app = FastAPI(
        title="SuperMega Service",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    default_origins = "https://app.supermega.dev,https://supermega.dev,https://www.supermega.dev"
    origins = [item.strip() for item in _text(os.getenv("SUPERMEGA_CORS_ORIGINS") or default_origins).split(",") if item.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=[
            "accept",
            "content-type",
            "x-supermega-workspace-id",
            "x-supermega-actor-id",
            "x-supermega-identity-timestamp",
            "x-supermega-identity-signature",
        ],
    )

    @app.middleware("http")
    async def api_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("cache-control", "no-store")
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("x-frame-options", "DENY")
        response.headers.setdefault("referrer-policy", "no-referrer")
        response.headers.setdefault("permissions-policy", "camera=(), microphone=(), geolocation=()")
        return response

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        readiness = store.readiness(None)
        enterprise_db_ready = readiness.database_ready and readiness.role_ready and readiness.schema_ready and readiness.audit_ready
        security_ready = bool(_text(os.getenv("SUPERMEGA_TRIAL_IDENTITY_SECRET")))
        requirements = _activation_requirements(
            database_ready=readiness.database_ready,
            role_ready=readiness.role_ready,
            schema_ready=readiness.schema_ready,
            audit_ready=readiness.audit_ready,
        )
        return {
            "status": "ready",
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "operating_mode": "managed_trial" if not requirements else "isolated_demo",
            "enterprise_db_ready": enterprise_db_ready,
            "security_ready": security_ready,
            "coverage_score": 0,
            "trial_backend": {
                "database_ready": readiness.database_ready,
                "role_ready": readiness.role_ready,
                "schema_ready": readiness.schema_ready,
                "audit_ready": readiness.audit_ready,
                "write_enabled": readiness.write_enabled,
                "browser_service_role_exposed": False,
            },
            "enterprise_activation": {
                "status": "ready" if not requirements else "attention",
                "requirements": requirements,
                "secret_values_exposed": False,
            },
        }

    app.include_router(create_trial_router(store=store, resolve_principal=resolve_trial_principal))
    app.include_router(cloud_runtime_router)
    return app


app = create_app()


__all__ = ["app", "create_app", "reduce_trial_state", "resolve_trial_principal"]
