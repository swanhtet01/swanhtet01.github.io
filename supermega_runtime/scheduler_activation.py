from __future__ import annotations

import hashlib
import hmac
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


SCHEDULER_ACTIVATION_EVIDENCE_CONTRACT = "supermega.scheduler-activation-evidence.v1"
SCHEDULER_ACTIVATION_EVIDENCE_ENV = "SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE"
SCHEDULER_ACTIVATION_SIGNING_SECRET_ENV = "SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET"
CANONICAL_SCHEDULER_PROJECT_ID = "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG"
SCHEDULER_AUTHORITY_DIGEST = "sha256:f6d2f3bdec59514ed3a7709afbe84683d2518974785c861bbb4439291e1827ac"

REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS = (
    "managed-database-tenant-isolation",
    "private-storage-privacy",
    "protected-worker-egress",
    "queue-recovery-side-effect-accounting",
    "protected-release-rollback-owner-decision",
)

_MAX_BUNDLE_BYTES = 8_192
_MAX_SECRET_BYTES = 1_024
_MAX_BUNDLE_TTL = timedelta(days=7)
_MAX_EVIDENCE_AGE = timedelta(days=7)
_MAX_FUTURE_SKEW = timedelta(minutes=5)
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
_COMMIT_RE = re.compile(r"^[a-f0-9]{40}$")
_DIGEST_RE = re.compile(r"^sha256:[a-f0-9]{64}$")
_SIGNATURE_RE = re.compile(r"^hmac-sha256:[a-f0-9]{64}$")
_UTC_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_BUNDLE_FIELDS = frozenset(
    {
        "contract",
        "authority_digest",
        "project_id",
        "environment",
        "release_commit",
        "managed_tenant_id",
        "issued_at",
        "expires_at",
        "owner_decision_id",
        "evidence",
        "signature",
    }
)
_EVIDENCE_FIELDS = frozenset({"id", "status", "captured_at", "digest"})


@dataclass(frozen=True)
class SchedulerActivationEvidenceResult:
    valid: bool
    error: str | None = None
    evidence_digest: str | None = None
    release_commit: str | None = None
    expires_at: str | None = None
    evidence_count: int = 0


def _failure(code: str) -> SchedulerActivationEvidenceResult:
    return SchedulerActivationEvidenceResult(valid=False, error=code)


def _object_without_duplicate_keys(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("activation_evidence_duplicate_key")
        value[key] = item
    return value


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _valid_secret(secret: object) -> str | None:
    if not isinstance(secret, str) or not secret or secret != secret.strip():
        return None
    encoded = secret.encode("utf-8")
    if len(encoded) < 32 or len(encoded) > _MAX_SECRET_BYTES:
        return None
    if any(ord(character) < 33 or ord(character) == 127 for character in secret):
        return None
    return secret


def _utc_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not _UTC_TIMESTAMP_RE.fullmatch(value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _signature_body(bundle: Mapping[str, object]) -> dict[str, object]:
    return {key: bundle[key] for key in sorted(bundle) if key != "signature"}


def sign_scheduler_activation_evidence(
    bundle: Mapping[str, object],
    *,
    secret: str,
) -> dict[str, object]:
    signing_secret = _valid_secret(secret)
    if signing_secret is None:
        raise ValueError("activation_evidence_signing_secret_invalid")
    unsigned = {str(key): value for key, value in bundle.items() if key != "signature"}
    serialized = _canonical_json(unsigned).encode("utf-8")
    signature = hmac.new(signing_secret.encode("utf-8"), serialized, hashlib.sha256).hexdigest()
    return {**unsigned, "signature": f"hmac-sha256:{signature}"}


def verify_scheduler_activation_evidence(
    raw_bundle: object,
    *,
    secret: object,
    expected_release_commit: object,
    expected_project_id: object,
    expected_environment: object,
    now: datetime | None = None,
) -> SchedulerActivationEvidenceResult:
    if not isinstance(raw_bundle, str) or not raw_bundle:
        return _failure("activation_evidence_missing")
    if len(raw_bundle.encode("utf-8")) > _MAX_BUNDLE_BYTES:
        return _failure("activation_evidence_too_large")
    try:
        parsed = json.loads(raw_bundle, object_pairs_hook=_object_without_duplicate_keys)
    except (UnicodeError, ValueError, json.JSONDecodeError):
        return _failure("activation_evidence_invalid_json")
    if not isinstance(parsed, Mapping) or set(parsed) != _BUNDLE_FIELDS:
        return _failure("activation_evidence_invalid_shape")

    signature = parsed.get("signature")
    signing_secret = _valid_secret(secret)
    if signing_secret is None:
        return _failure("activation_evidence_signing_secret_invalid")
    if not isinstance(signature, str) or not _SIGNATURE_RE.fullmatch(signature):
        return _failure("activation_evidence_signature_invalid")
    expected_signature = hmac.new(
        signing_secret.encode("utf-8"),
        _canonical_json(_signature_body(parsed)).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature.removeprefix("hmac-sha256:"), expected_signature):
        return _failure("activation_evidence_signature_invalid")

    if parsed.get("contract") != SCHEDULER_ACTIVATION_EVIDENCE_CONTRACT:
        return _failure("activation_evidence_contract_invalid")
    if parsed.get("authority_digest") != SCHEDULER_AUTHORITY_DIGEST:
        return _failure("activation_evidence_authority_mismatch")
    if expected_project_id != CANONICAL_SCHEDULER_PROJECT_ID:
        return _failure("activation_runtime_project_invalid")
    if parsed.get("project_id") != expected_project_id:
        return _failure("activation_evidence_project_mismatch")
    if expected_environment != "production":
        return _failure("activation_runtime_environment_invalid")
    if parsed.get("environment") != expected_environment:
        return _failure("activation_evidence_environment_mismatch")
    if not isinstance(expected_release_commit, str) or not _COMMIT_RE.fullmatch(expected_release_commit):
        return _failure("activation_runtime_release_invalid")
    if parsed.get("release_commit") != expected_release_commit:
        return _failure("activation_evidence_release_mismatch")
    if not isinstance(parsed.get("managed_tenant_id"), str) or not _ID_RE.fullmatch(parsed["managed_tenant_id"]):
        return _failure("activation_evidence_tenant_invalid")
    if not isinstance(parsed.get("owner_decision_id"), str) or not _ID_RE.fullmatch(parsed["owner_decision_id"]):
        return _failure("activation_evidence_owner_decision_invalid")

    issued_at = _utc_timestamp(parsed.get("issued_at"))
    expires_at = _utc_timestamp(parsed.get("expires_at"))
    if issued_at is None or expires_at is None or expires_at <= issued_at:
        return _failure("activation_evidence_time_invalid")
    checked_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(microsecond=0)
    if issued_at > checked_at + _MAX_FUTURE_SKEW:
        return _failure("activation_evidence_not_yet_valid")
    if expires_at - issued_at > _MAX_BUNDLE_TTL:
        return _failure("activation_evidence_ttl_exceeded")
    if checked_at >= expires_at:
        return _failure("activation_evidence_expired")
    if checked_at - issued_at > _MAX_EVIDENCE_AGE:
        return _failure("activation_evidence_stale")

    evidence = parsed.get("evidence")
    if not isinstance(evidence, list) or len(evidence) != len(REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS):
        return _failure("activation_evidence_incomplete")
    evidence_ids: list[str] = []
    for item in evidence:
        if not isinstance(item, Mapping) or set(item) != _EVIDENCE_FIELDS:
            return _failure("activation_evidence_item_invalid")
        evidence_id = item.get("id")
        captured_at = _utc_timestamp(item.get("captured_at"))
        if not isinstance(evidence_id, str) or evidence_id not in REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS:
            return _failure("activation_evidence_item_unknown")
        if item.get("status") != "passed":
            return _failure("activation_evidence_not_passed")
        if not isinstance(item.get("digest"), str) or not _DIGEST_RE.fullmatch(item["digest"]):
            return _failure("activation_evidence_digest_invalid")
        if captured_at is None or captured_at > issued_at + _MAX_FUTURE_SKEW:
            return _failure("activation_evidence_capture_invalid")
        if issued_at - captured_at > _MAX_EVIDENCE_AGE:
            return _failure("activation_evidence_item_stale")
        evidence_ids.append(evidence_id)
    if len(set(evidence_ids)) != len(evidence_ids):
        return _failure("activation_evidence_duplicate")
    if set(evidence_ids) != set(REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS):
        return _failure("activation_evidence_incomplete")

    evidence_digest = f"sha256:{hashlib.sha256(_canonical_json(parsed).encode('utf-8')).hexdigest()}"
    return SchedulerActivationEvidenceResult(
        valid=True,
        evidence_digest=evidence_digest,
        release_commit=expected_release_commit,
        expires_at=str(parsed["expires_at"]),
        evidence_count=len(evidence_ids),
    )
