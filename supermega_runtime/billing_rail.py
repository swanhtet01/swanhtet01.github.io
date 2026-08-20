"""Founder-gated billing ledger for one managed SuperMega tenant (Gate 9).

Implements hq/strategy/BILLING-RAIL-DESIGN.md sections 3, 4, and 6 in the
``managed_activation.py`` provisioner pattern: a dedicated module, direct SQL
through the reviewed administrative connection (never the runtime member role),
advisory locks, exact-shape validation, digest-sealed payloads, and idempotent
replay by byte-compare. Every transition is one append-only
``app_private.billing_events`` record carrying founder evidence in the repo's
canonical proof shape {actionId, capturedAt, actor, reason, evidenceReference}.

Nothing in this module sends an invoice, requests money, charges anyone, or
unlocks anything by itself. It records founder actions that already happened
out-of-band (design section 3): issuing a prepared invoice packet, confirming a
manually verified payment, voiding an invoice, granting or revoking premium
entitlement, and recording a settled refund. Confirming a payment and granting
entitlement are deliberately separate founder actions; recording a refund never
auto-revokes entitlement. There are no default prices, currencies, or amounts
anywhere in this file: every monetary value arrives inside the founder's
digest-sealed invoice packet and is only ever validated, never fabricated.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from supermega_runtime.trial_store import TrialIdempotencyConflict


def _env_schema_version(default: int = 12) -> int:
    """Parse SUPERMEGA_BILLING_SCHEMA_VERSION without ever crashing at import.

    Mirrors trial_store._env_schema_version exactly: migrations for this same
    app_private.trial_schema_meta counter can land in the repo (reviewed,
    proven on a disposable branch) well before a founder applies them to a
    given target (BILLING-RAIL-DESIGN.md D6). Default 12 keeps deployed
    behavior unchanged; an operator raises it (e.g. to 13) only AFTER the
    matching migration has been applied to that target -- never by editing
    this constant and redeploying.
    """

    raw = str(os.environ.get("SUPERMEGA_BILLING_SCHEMA_VERSION") or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw, 10)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


# The exact live schema version the ledger fail-closes on: _assert_schema
# rejects any database whose app_private schema is not EXACTLY this.
BILLING_SCHEMA_VERSION = _env_schema_version()
# The schema version at which ONE runtime-role privilege stops being an anomaly,
# following the trial_store.py `if TRIAL_SCHEMA_VERSION >= 12:` pattern for
# version-conditional contracts. v12 shipped billing fully dark -- zero
# policies, zero grants for supermega_trial_backend on all three billing tables
# (20260817090000_private_trial_backend_v12_billing_rail.sql header, "RLS
# posture (design 4.4): deny by default, NO policies"). v13
# (20260818090000_private_trial_backend_v13_billing_entitlement_read.sql) is the
# separate founder decision it named: it grants that role SELECT -- and only
# SELECT -- on app_private.billing_entitlements, RLS-scoped by
# billing_entitlements_self_read to the session's own workspace GUC, so
# PostgresTrialStore._premium_unlocked can resolve the paid flag instead of
# fail-closing to false. Below this version that same grant is still an anomaly
# the ledger refuses to operate against: a v13-shaped grant on a v12 database
# was not put there by a reviewed migration.
BILLING_ENTITLEMENT_READ_SCHEMA_VERSION = 13
# The predicate that scoping depends on, pinned by fingerprint. Policy name,
# command, permissiveness and role are all trivially reproducible: a policy
# recreated with the SAME name, SAME SELECT command, SAME permissiveness and
# SAME role but `using (true)` satisfies every one of them while exposing every
# workspace's entitlement row. Only the predicate itself separates the two, so
# the probe fingerprints pg_policies.qual and compares it here.
#
# This is _policy_expression_fingerprint's output, and that function mirrors the
# normalization tools/verify_private_trial_migrations.mjs already applies to
# policy expressions. It is the SAME value that verifier pins at
# expectedPolicyFingerprints.billing_entitlements_self_read.qual -- one
# fingerprint for this predicate in the repo, not a second convention, and
# test_billing_rail.py reads that file and asserts the two stay equal rather
# than leaving the agreement to this comment. It corresponds to v13's
#   using (workspace_id = (select current_setting('app.workspace_id', true)))
# which PostgreSQL reports as
#   (workspace_id = ( SELECT current_setting('app.workspace_id'::text, true)
#    AS current_setting))
# Because that is a deparsed rendering rather than the migration's source text,
# a future PostgreSQL that deparses the same policy differently would fail this
# check on an otherwise-correct database. That is the safe direction to fail,
# and the fix is to re-fingerprint from the target and update both pins together
# -- never to drop the check.
BILLING_ENTITLEMENT_READ_POLICY_DIGEST = (
    "28369fc95fa5a46002daf06b67038c4c9c8695d9defe59a69014c7c40a44d5b5"
)
BILLING_EVENT_RESULT_CONTRACT = "supermega.managed_billing_event.v1"
BILLING_OVERDUE_REPORT_CONTRACT = "supermega.managed_billing_overdue_report.v1"
BILLING_STATE_CONTRACT = "supermega.managed_billing_state.v1"
INVOICE_PACKET_CONTRACT = "supermega.managed-billing.invoice-packet.v1"
MANAGED_BILLING_CONTRACT = "supermega.managed-billing.v1"
MAX_INPUT_BYTES = 1024 * 1024
PREMIUM_TIER = "premium"

BILLING_EVENT_TYPES = (
    "billing.invoice.issued",
    "billing.payment.confirmed",
    "billing.invoice.voided",
    "billing.entitlement.granted",
    "billing.entitlement.revoked",
    "billing.refund.recorded",
)
# Delivery channels for humans, not endpoints (design section 5). Mirrors
# PAYMENT_CATEGORIES in tools/prepare_managed_invoice.mjs exactly.
PAYMENT_CHANNEL_CATEGORIES = frozenset({"bank_transfer", "mobile_money", "cash"})
# Bounded v1 vocabulary for billing.entitlement.revoked (design 4.2 "reason
# class"). Revoking service is always its own founder decision; the class only
# names which kind of decision it was.
REVOKE_REASON_CLASSES = frozenset(
    {"customer_request", "founder_decision", "non_payment", "service_ended"}
)
# The CLI packet's status lifecycle, byte-for-byte (tools/prepare_managed_invoice.mjs
# STATUS_LIFECYCLE). Draft lives only in the founder's local packet; the server
# records issued -> paid | void.
STATUS_LIFECYCLE = {
    "initial": "draft",
    "terminal": ["paid", "void"],
    "transitions": ["draft->issued", "draft->void", "issued->paid", "issued->void"],
}

_INVOICE_ID = re.compile(r"^INV-[A-Za-z0-9-]{4,40}$")
# Kernel tenant id rule, exactly as tools/prepare_managed_invoice.mjs TENANT_ID_RE.
_TENANT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$")
_CURRENCY = re.compile(r"^[A-Z]{3}$")
_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_SECRET_FIELD = re.compile(r"password|secret|token|database.?url|service.?role.?key", re.IGNORECASE)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class BillingRailError(ValueError):
    """Raised when billing evidence cannot support a safe recording."""


class BillingRailConflict(BillingRailError):
    """Raised when durable billing state conflicts with the founder command."""


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _exact(value: object, keys: Sequence[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != set(keys):
        raise BillingRailError(f"{label} has an invalid shape.")
    return value


def _visible_text(value: object, label: str, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or value != value.strip()
        or not value
        or len(value) > maximum
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise BillingRailError(f"{label} must be canonical visible text.")
    return value


def _timestamp(value: object, label: str) -> datetime:
    candidate = _visible_text(value, label, 40)
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BillingRailError(f"{label} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise BillingRailError(f"{label} must include a timezone.")
    normalized = parsed.astimezone(timezone.utc)
    if normalized.isoformat(timespec="milliseconds").replace("+00:00", "Z") != candidate:
        raise BillingRailError(f"{label} must use canonical UTC millisecond precision.")
    return normalized


def _timestamp_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _minor_amount(value: object, label: str, *, minimum: int = 0) -> int:
    """Monetary values must be explicit safe non-negative integers in minor
    units. A bool, string, float, or missing value fails closed; nothing is
    ever defaulted (design section 2 principles)."""

    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < minimum
        or value > _MAX_SAFE_INTEGER
    ):
        raise BillingRailError(f"{label} must be an explicit integer minor-unit amount.")
    return value


def _revision(value: object, label: str, *, minimum: int = 0) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= 1_000_000:
        raise BillingRailError(f"{label} is outside the supported range.")
    return value


def _workspace_id(value: object) -> str:
    candidate = _visible_text(value, "Workspace ID", 80)
    if not _TENANT_ID.fullmatch(candidate):
        raise BillingRailError("Workspace ID is invalid.")
    return candidate


def _invoice_digest(value: object, label: str) -> str:
    candidate = _visible_text(value, label, 71)
    if not _SHA256.fullmatch(candidate):
        raise BillingRailError(f"{label} is invalid.")
    return candidate


def _reject_embedded_secrets(value: object, path: str = "packet") -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            key_text = str(key)
            if _SECRET_FIELD.search(key_text) and isinstance(child, str) and child.strip():
                raise BillingRailError(f"{path}.{key_text} must not contain credential material.")
            _reject_embedded_secrets(child, f"{path}.{key_text}")
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _reject_embedded_secrets(child, f"{path}[{index}]")
        return
    if isinstance(value, str) and value.strip().lower().startswith(("postgres://", "postgresql://")):
        raise BillingRailError(f"{path} must not contain a database URL.")


def validate_founder_evidence(value: object, label: str) -> dict[str, str]:
    """The repo's canonical five-field proof shape, exactly (design 4.2)."""

    evidence = _exact(
        value,
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
        label,
    )
    return {
        "actionId": _visible_text(evidence["actionId"], f"{label} action ID", 80),
        "capturedAt": _timestamp_text(_timestamp(evidence["capturedAt"], f"{label} capture timestamp")),
        "actor": _visible_text(evidence["actor"], f"{label} actor", 160),
        "reason": _visible_text(evidence["reason"], f"{label} reason", 500),
        "evidenceReference": _visible_text(
            evidence["evidenceReference"], f"{label} evidence reference", 200
        ),
    }


def validate_invoice_packet(value: object, *, workspace_id: str) -> dict[str, Any]:
    """Fail-closed re-validation of a prepared invoice packet.

    Mirrors tools/prepare_managed_invoice.mjs verifyInvoicePacket: exact keys,
    integer minor units, sum check, founder-named channels, and the recomputed
    sha256(stableJson(core)) seal. The packet must be bound to the exact target
    workspace; nothing is defaulted or repaired.
    """

    workspace = _workspace_id(workspace_id)
    if not isinstance(value, Mapping):
        raise BillingRailError("Invoice packet must be an object.")
    try:
        encoded = _canonical_json(value).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise BillingRailError("Invoice packet must be canonical JSON.") from exc
    if len(encoded) > MAX_INPUT_BYTES:
        raise BillingRailError("Invoice packet exceeds the 1 MiB billing limit.")
    _reject_embedded_secrets(value)
    packet = _exact(
        value,
        (
            "contract",
            "status",
            "statusLifecycle",
            "invoice",
            "invoiceDigest",
            "configDigest",
            "proposedControlRecord",
            "controls",
        ),
        "Invoice packet",
    )
    if packet["contract"] != INVOICE_PACKET_CONTRACT or packet["status"] != "draft":
        raise BillingRailError("Invoice packet contract or status is invalid.")
    if _canonical_json(packet["statusLifecycle"]) != _canonical_json(STATUS_LIFECYCLE):
        raise BillingRailError("Invoice packet status lifecycle is invalid.")
    invoice = packet["invoice"]
    required_invoice_keys = frozenset(
        {
            "contract",
            "invoiceId",
            "workspace",
            "customer",
            "period",
            "lineItems",
            "tax",
            "amount",
            "paymentChannels",
            "issuedToPayBy",
            "issuer",
        }
    )
    if (
        not isinstance(invoice, Mapping)
        or not required_invoice_keys <= set(invoice)
        or not set(invoice) <= required_invoice_keys | {"notes"}
    ):
        raise BillingRailError("Invoice core has an invalid shape.")
    if invoice["contract"] != MANAGED_BILLING_CONTRACT:
        raise BillingRailError("Invoice core contract is invalid.")
    invoice_id = _visible_text(invoice["invoiceId"], "Invoice ID", 44)
    if not _INVOICE_ID.fullmatch(invoice_id):
        raise BillingRailError("Invoice ID is invalid.")
    invoice_workspace = _exact(invoice["workspace"], ("id", "name"), "Invoice workspace")
    if invoice_workspace["id"] != workspace:
        raise BillingRailError("Invoice packet is bound to a different workspace.")
    _visible_text(invoice_workspace["name"], "Invoice workspace name", 180)
    amount = _exact(invoice["amount"], ("currency", "exponent", "totalMinor"), "Invoice amount")
    if not isinstance(amount["currency"], str) or not _CURRENCY.fullmatch(amount["currency"]):
        raise BillingRailError("Invoice currency is invalid.")
    exponent = amount["exponent"]
    if not isinstance(exponent, int) or isinstance(exponent, bool) or not 0 <= exponent <= 4:
        raise BillingRailError("Invoice currency exponent is invalid.")
    total_minor = _minor_amount(amount["totalMinor"], "Invoice total", minimum=1)
    line_items = invoice["lineItems"]
    if not isinstance(line_items, list) or not 1 <= len(line_items) <= 20:
        raise BillingRailError("Invoice line items are invalid.")
    line_sum = 0
    any_positive = False
    for index, item in enumerate(line_items):
        line = _exact(item, ("description", "amountMinor"), f"Invoice line item {index}")
        _visible_text(line["description"], f"Invoice line item {index} description", 180)
        line_amount = _minor_amount(line["amountMinor"], f"Invoice line item {index} amount")
        line_sum += line_amount
        any_positive = any_positive or line_amount > 0
    if not any_positive:
        raise BillingRailError("Invoice line items cannot all be zero.")
    tax = invoice["tax"]
    if not isinstance(tax, Mapping):
        raise BillingRailError("Invoice tax record is invalid.")
    if tax.get("decided") is False:
        _exact(tax, ("decided",), "Invoice tax record")
    elif tax.get("decided") is True:
        tax_record = _exact(tax, ("decided", "description", "amountMinor"), "Invoice tax record")
        _visible_text(tax_record["description"], "Invoice tax description", 180)
        line_sum += _minor_amount(tax_record["amountMinor"], "Invoice tax amount")
    else:
        raise BillingRailError("Invoice tax record is invalid.")
    if line_sum != total_minor:
        raise BillingRailError("Invoice total does not match its line items.")
    channels = invoice["paymentChannels"]
    if not isinstance(channels, list) or not 1 <= len(channels) <= 5:
        raise BillingRailError("Invoice payment channels are invalid.")
    for index, channel_value in enumerate(channels):
        channel = _exact(
            channel_value, ("category", "label", "reference"), f"Invoice payment channel {index}"
        )
        if channel["category"] not in PAYMENT_CHANNEL_CATEGORIES:
            raise BillingRailError(f"Invoice payment channel {index} category is invalid.")
        _visible_text(channel["label"], f"Invoice payment channel {index} label", 180)
        _visible_text(channel["reference"], f"Invoice payment channel {index} reference", 180)
    issued_to_pay_by = _exact(invoice["issuedToPayBy"], ("issuedAt", "dueDate"), "Invoice schedule")
    _visible_text(issued_to_pay_by["issuedAt"], "Invoice issue timestamp", 40)
    _visible_text(issued_to_pay_by["dueDate"], "Invoice due date", 10)
    issuer = _exact(invoice["issuer"], ("name",), "Invoice issuer")
    _visible_text(issuer["name"], "Invoice issuer name", 180)
    if "notes" in invoice:
        _visible_text(invoice["notes"], "Invoice notes", 400)
    digest = _invoice_digest(packet["invoiceDigest"], "Invoice digest")
    if digest != _digest(invoice):
        raise BillingRailError("Invoice digest does not match its sealed core.")
    _invoice_digest(packet["configDigest"], "Invoice config digest")
    control = _exact(
        packet["proposedControlRecord"],
        ("record_key", "record_type", "tenant_id", "status", "plan_hash", "note"),
        "Invoice control record",
    )
    if (
        control["record_key"] != f"managed-billing-invoice:{workspace}:{invoice_id}"
        or control["record_type"] != "managed_billing_invoice"
        or control["tenant_id"] != workspace
        or control["status"] != "draft"
        or control["plan_hash"] != digest[len("sha256:"):]
    ):
        raise BillingRailError("Invoice control record projection is invalid.")
    controls = _exact(
        packet["controls"],
        (
            "networkActivity",
            "externalWritesPerformed",
            "founderActionRequired",
            "monetaryValuesFromConfigOnly",
            "pricingDecided",
            "taxDecided",
        ),
        "Invoice packet controls",
    )
    if (
        controls["externalWritesPerformed"] is not False
        or controls["founderActionRequired"] is not True
        or controls["monetaryValuesFromConfigOnly"] is not True
        or controls["pricingDecided"] is not False
        or controls["taxDecided"] != tax["decided"]
    ):
        raise BillingRailError("Invoice packet controls are invalid.")
    return {
        "packet": deepcopy(dict(packet)),
        "invoiceId": invoice_id,
        "workspaceId": workspace,
        "invoiceDigest": digest,
        "totalMinor": total_minor,
    }


def _billing_command_identity(
    workspace_id: str,
    event_type: str,
    natural_key: str,
    payload: Mapping[str, Any],
) -> tuple[str, str]:
    """Deterministic command identity, the _self_serve_command_identity idiom.

    The same founder command always replays the same command id; the
    fingerprint byte-binds the exact payload so a divergent replay of that
    identity fails closed as a TrialIdempotencyConflict.
    """

    command_id = str(
        uuid5(NAMESPACE_URL, f"supermega:billing:{workspace_id}:{event_type}:{natural_key}")
    )
    fingerprint = sha256(
        _canonical_json({"kind": event_type, "payload": payload}).encode("utf-8")
    ).hexdigest()
    return command_id, fingerprint


_POLICY_CAST_SUFFIX = re.compile(
    r"::\s*(?:pg_catalog\.)?"
    r"(?:text|character\s+varying|varchar|name|uuid|boolean|integer|bigint)\b",
    re.IGNORECASE,
)


def _policy_expression_fingerprint(value: object) -> str:
    """Fingerprint a pg_policies expression the way the repo already does.

    Mirrors normalizeExpression + fingerprint in
    tools/verify_private_trial_migrations.mjs byte-for-byte: lowercase, drop the
    cast suffixes PostgreSQL adds when it deparses a policy, collapse runs of
    whitespace, trim, sha256. Both sides therefore pin the SAME hex for the same
    predicate, and test_billing_rail.py asserts that agreement rather than
    trusting this comment.

    Returns "" for a missing predicate (no such policy, or a policy with only a
    WITH CHECK expression) so an absent predicate can never compare equal to a
    pinned one.
    """

    if value is None:
        return ""
    normalized = _POLICY_CAST_SUFFIX.sub("", str(value).lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return sha256(normalized.encode("utf-8")).hexdigest()


def _row_value(row: object, key: str, index: int) -> Any:
    if isinstance(row, Mapping):
        return row.get(key)
    if isinstance(row, Sequence) and not isinstance(row, (str, bytes)):
        return row[index]
    return None


def _row_json(row: object, key: str, index: int) -> Any:
    value = _row_value(row, key, index)
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


class BillingLedger:
    """Record founder billing transitions through an administrative connection.

    Design section 6: the provisioner pattern, not the surface pattern. Every
    method validates founder evidence, takes the tenant's billing advisory
    lock inside one serializable transaction, replays exactly on byte-equal
    commands, and fails closed on anything else. The runtime member role can
    never WRITE any billing table and can never read an invoice or an event at
    any schema version; from v13 it may SELECT its own workspace's
    billing_entitlements row and nothing else. The ledger itself refuses to
    operate through it.
    """

    def __init__(self, database_url: str, *, connection_factory: Callable[..., Any] | None = None):
        self._database_url = str(database_url or "").strip()
        self._connection_factory = connection_factory

    def _connect(self) -> Any:
        if self._connection_factory is not None:
            return self._connection_factory(self._database_url)
        try:
            import psycopg
            from psycopg.conninfo import conninfo_to_dict
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - production dependency contract.
            raise BillingRailError("Psycopg 3 is required for the billing ledger.") from exc
        connection_parameters = conninfo_to_dict(self._database_url)
        configured_sslmode = str(connection_parameters.get("sslmode", "")).lower()
        if configured_sslmode not in {"require", "verify-ca", "verify-full"}:
            raise BillingRailError("The billing ledger requires an explicit encrypted sslmode.")
        host = str(connection_parameters.get("host", "")).lower()
        if host not in {"127.0.0.1", "localhost", "::1"}:
            if configured_sslmode != "verify-full" or not str(connection_parameters.get("sslrootcert", "")).strip():
                raise BillingRailError(
                    "A remote billing ledger connection requires sslmode=verify-full and an explicit reviewed CA."
                )
        return psycopg.connect(
            self._database_url,
            autocommit=False,
            connect_timeout=5,
            prepare_threshold=None,
            row_factory=dict_row,
            application_name="supermega-billing-rail",
        )

    @staticmethod
    def _assert_schema(cursor: Any, *, require_write_privilege: bool) -> dict[str, Any]:
        cursor.execute(
            """
            select
              current_setting('server_version_num')::integer as server_version_num,
              current_user as current_user,
              current_setting('transaction_read_only') = 'on' as transaction_read_only,
              coalesce((
                select rolsuper or rolbypassrls
                from pg_roles
                where rolname = current_user
              ), false) as provisioning_role_privileged,
              coalesce((
                select schema_version
                from app_private.trial_schema_meta
                where component = 'private_trial_backend'
              ), 0) as schema_version,
              coalesce((
                select not rolsuper and not rolbypassrls and not rolcanlogin
                from pg_roles
                where rolname = 'supermega_trial_backend'
              ), false) as backend_role_safe,
              /* billing_invoices and billing_events are founder-only forever:
                 no policy, no privilege, at any schema version (v12 header;
                 tools/verify_private_trial_migrations.mjs asserts the same
                 against a live database). Block comments, not line comments:
                 fixtures flatten this statement onto one line. */
              coalesce((
                select bool_and(
                  not has_table_privilege(
                    'supermega_trial_backend',
                    format('app_private.%I', billing_table.table_name),
                    billing_privilege.privilege_name
                  )
                )
                from unnest(array['billing_invoices', 'billing_events'])
                  billing_table(table_name),
                  unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
                  billing_privilege(privilege_name)
              ), false) as runtime_ledger_denied,
              /* Entitlement WRITES stay founder-only forever too: v13 adds no
                 INSERT/UPDATE/DELETE policy and no such grant. The runtime can
                 observe entitlement, never change it. */
              coalesce((
                select bool_and(
                  not has_table_privilege(
                    'supermega_trial_backend',
                    'app_private.billing_entitlements',
                    billing_privilege.privilege_name
                  )
                )
                from unnest(array['INSERT', 'UPDATE', 'DELETE'])
                  billing_privilege(privilege_name)
              ), false) as runtime_entitlement_write_denied,
              /* The single privilege v13 deliberately opens, probed on its own
                 so the version-conditional check below can reason about it. */
              has_table_privilege(
                'supermega_trial_backend', 'app_private.billing_entitlements', 'SELECT'
              ) as runtime_entitlement_read,
              /* The grant alone is not what makes that read safe -- the RLS
                 scoping is. This column is the SHAPE half of that: forced RLS,
                 and exactly one policy on the table, carrying v13's name,
                 SELECT command, permissiveness and role. It is deliberately NOT
                 the whole answer -- every one of those is reproducible by
                 anyone who can create a policy, so the predicate column below
                 carries the rest. Probed on the founder's own ledger connection
                 at command time, because the migration's $verify$ block and
                 tools/verify_private_trial_migrations.mjs only run when the
                 migration is applied. */
              coalesce((
                select relation.relrowsecurity and relation.relforcerowsecurity
                from pg_class relation
                join pg_namespace schema_record
                  on schema_record.oid = relation.relnamespace
                where schema_record.nspname = 'app_private'
                  and relation.relname = 'billing_entitlements'
              ), false)
              and coalesce((
                select count(*) = 1 and bool_and(
                  policy_record.policyname = 'billing_entitlements_self_read'
                  and policy_record.cmd = 'SELECT'
                  and policy_record.permissive = 'PERMISSIVE'
                  and array_to_string(policy_record.roles, ',') = 'supermega_trial_backend'
                )
                from pg_policies policy_record
                where policy_record.schemaname = 'app_private'
                  and policy_record.tablename = 'billing_entitlements'
              ), false) as runtime_entitlement_read_policy_shape,
              /* The scoping policy's PREDICATE, returned verbatim for
                 _policy_expression_fingerprint to normalize and hash. Everything
                 above is reproducible by anyone who can create a policy; only
                 this separates v13's workspace-GUC predicate from a same-named,
                 same-command, same-role `using (true)`. Normalizing in Python
                 rather than SQL keeps one implementation the tests can execute
                 directly, and keeps regex escapes out of a statement whose
                 meaning would otherwise depend on standard_conforming_strings. */
              (
                select policy_record.qual
                from pg_policies policy_record
                where policy_record.schemaname = 'app_private'
                  and policy_record.tablename = 'billing_entitlements'
                  and policy_record.policyname = 'billing_entitlements_self_read'
              ) as runtime_entitlement_read_predicate,
              has_table_privilege(current_user, 'app_private.billing_invoices', 'SELECT') as invoice_select,
              has_table_privilege(current_user, 'app_private.billing_invoices', 'INSERT') as invoice_insert,
              has_table_privilege(current_user, 'app_private.billing_invoices', 'UPDATE') as invoice_update,
              has_table_privilege(current_user, 'app_private.billing_events', 'SELECT') as event_select,
              has_table_privilege(current_user, 'app_private.billing_events', 'INSERT') as event_insert,
              has_table_privilege(current_user, 'app_private.billing_entitlements', 'SELECT') as entitlement_select,
              has_table_privilege(current_user, 'app_private.billing_entitlements', 'INSERT') as entitlement_insert,
              has_table_privilege(current_user, 'app_private.billing_entitlements', 'UPDATE') as entitlement_update
            """
        )
        row = cursor.fetchone()
        if row is None:
            raise BillingRailError("Billing ledger schema probe returned no result.")
        snapshot = {
            "postgresMajor": int(_row_value(row, "server_version_num", 0) or 0) // 10_000,
            "currentUser": str(_row_value(row, "current_user", 1) or ""),
            "transactionReadOnly": bool(_row_value(row, "transaction_read_only", 2)),
            "provisioningRolePrivileged": bool(_row_value(row, "provisioning_role_privileged", 3)),
            "schemaVersion": int(_row_value(row, "schema_version", 4) or 0),
            "backendRoleSafe": bool(_row_value(row, "backend_role_safe", 5)),
            "runtimeLedgerDenied": bool(_row_value(row, "runtime_ledger_denied", 6)),
            "runtimeEntitlementWriteDenied": bool(
                _row_value(row, "runtime_entitlement_write_denied", 7)
            ),
            "runtimeEntitlementRead": bool(_row_value(row, "runtime_entitlement_read", 8)),
            "runtimeEntitlementReadPolicyShape": bool(
                _row_value(row, "runtime_entitlement_read_policy_shape", 9)
            ),
            "runtimeEntitlementReadPredicateDigest": _policy_expression_fingerprint(
                _row_value(row, "runtime_entitlement_read_predicate", 10)
            ),
            "invoiceSelect": bool(_row_value(row, "invoice_select", 11)),
            "invoiceInsert": bool(_row_value(row, "invoice_insert", 12)),
            "invoiceUpdate": bool(_row_value(row, "invoice_update", 13)),
            "eventSelect": bool(_row_value(row, "event_select", 14)),
            "eventInsert": bool(_row_value(row, "event_insert", 15)),
            "entitlementSelect": bool(_row_value(row, "entitlement_select", 16)),
            "entitlementInsert": bool(_row_value(row, "entitlement_insert", 17)),
            "entitlementUpdate": bool(_row_value(row, "entitlement_update", 18)),
        }
        if snapshot["postgresMajor"] != 17 or snapshot["schemaVersion"] != BILLING_SCHEMA_VERSION:
            raise BillingRailError(
                f"The billing ledger requires PostgreSQL 17 and private schema version {BILLING_SCHEMA_VERSION}."
            )
        if not snapshot["backendRoleSafe"]:
            raise BillingRailError("The billing ledger backend role is unsafe.")
        # Deny-by-default for the runtime member role, minus EXACTLY the one
        # read v13 grants. Invoices and events stay dark at every version, and
        # entitlement writes stay dark at every version -- those two clauses are
        # the property this guard has always protected and they are unchanged.
        # Only entitlement SELECT is version-conditional: permitted from v13 on
        # (where a reviewed migration put it there), still an anomaly below it.
        # Permitted, not required -- a v13 target whose grant is absent holds
        # LESS access than v13 allows, which is not the anomaly this guards
        # against, and the ledger's own writes never depend on that grant.
        # snapshot["schemaVersion"] is the live database's own counter, already
        # asserted equal to BILLING_SCHEMA_VERSION above.
        runtime_role_denied = (
            snapshot["runtimeLedgerDenied"]
            and snapshot["runtimeEntitlementWriteDenied"]
            and (
                not snapshot["runtimeEntitlementRead"]
                or snapshot["schemaVersion"] >= BILLING_ENTITLEMENT_READ_SCHEMA_VERSION
            )
        )
        if not runtime_role_denied:
            raise BillingRailError(
                "The billing tables must remain deny-by-default for the runtime member role."
            )
        # The v13 read is safe only because RLS scopes it to the session's own
        # workspace. Disable/force-off RLS, drop billing_entitlements_self_read,
        # add a second permissive SELECT policy beside it, or recreate it with
        # the same name, command and role but a widened predicate, and that same
        # grant becomes a cross-workspace entitlement read. Before this guard
        # was version-aware any grant at all was rejected, so tolerating the
        # grant without re-checking its scoping would be a real relaxation.
        # The predicate fingerprint is the load-bearing half: name, command,
        # permissiveness and role are all trivially reproducible by whoever can
        # create a policy, so a shape-only check passes `using (true)`.
        entitlement_read_scoped = snapshot["runtimeEntitlementReadPolicyShape"] and (
            snapshot["runtimeEntitlementReadPredicateDigest"]
            == BILLING_ENTITLEMENT_READ_POLICY_DIGEST
        )
        if snapshot["runtimeEntitlementRead"] and not entitlement_read_scoped:
            raise BillingRailError(
                "The runtime member role's billing entitlement read must stay scoped to its own workspace."
            )
        if (
            not snapshot["provisioningRolePrivileged"]
            or snapshot["currentUser"] in {"supermega_trial_backend", "supermega_trial_login"}
        ):
            raise BillingRailError("The billing ledger requires the reviewed administrative role, never the runtime role.")
        if snapshot["transactionReadOnly"] == require_write_privilege:
            raise BillingRailError("The billing ledger transaction mode is invalid for this operation.")
        if not all(snapshot[key] for key in ("invoiceSelect", "eventSelect", "entitlementSelect")):
            raise BillingRailError("The billing ledger connection cannot verify billing history.")
        if require_write_privilege and not all(
            snapshot[key]
            for key in (
                "invoiceInsert",
                "invoiceUpdate",
                "eventInsert",
                "entitlementInsert",
                "entitlementUpdate",
            )
        ):
            raise BillingRailError("The billing ledger connection lacks bounded billing privileges.")
        return snapshot

    @staticmethod
    def _lock(cursor: Any, workspace_id: str) -> None:
        cursor.execute(
            "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"billing:{workspace_id}",),
        )

    @staticmethod
    def _event_row(cursor: Any, workspace_id: str, command_id: str) -> Any:
        cursor.execute(
            """
            select event_id, command_fingerprint, event_type, payload_json,
                   result_json, created_at
            from app_private.billing_events
            where workspace_id = %s and command_id = %s
            """,
            (workspace_id, command_id),
        )
        return cursor.fetchone()

    @staticmethod
    def _invoice_row(cursor: Any, workspace_id: str, invoice_id: str) -> Any:
        cursor.execute(
            """
            select invoice_id, status, invoice_digest, payload_json, revision, updated_at
            from app_private.billing_invoices
            where workspace_id = %s and invoice_id = %s
            """,
            (workspace_id, invoice_id),
        )
        return cursor.fetchone()

    @staticmethod
    def _invoice_row_by_digest(cursor: Any, workspace_id: str, digest_hex: str) -> Any:
        cursor.execute(
            """
            select invoice_id, status, invoice_digest, payload_json, revision, updated_at
            from app_private.billing_invoices
            where workspace_id = %s and invoice_digest = %s
            """,
            (workspace_id, digest_hex),
        )
        return cursor.fetchone()

    @staticmethod
    def _prior_refund_total(cursor: Any, workspace_id: str, invoice_digest: str) -> int:
        """Sum amountMinor across every prior recorded refund for this exact
        invoice digest. record_refund bounds each single refund to the sealed
        invoice total, but without this cumulative sum the SAME invoice could be
        refunded past its total across multiple references -- each passing the
        per-refund check independently -- contradicting the guard's own stated
        invariant. Runs inside the held advisory lock, so no concurrent refund
        can slip between this read and the append.

        The invoiceDigest predicate is pushed into SQL so a workspace's entire
        refund history (unbounded, grows across every invoice over the life of
        the workspace) is not transferred and re-parsed in Python on every
        single refund -- only this one invoice's rows cross the wire. The
        Python-side filter below is kept as a defense-in-depth check, not
        removed: it costs nothing once the row set is already narrow, and it
        means this method stays correct even against a connection/fixture that
        does not (yet) honor the new predicate."""
        cursor.execute(
            """
            select payload_json
            from app_private.billing_events
            where workspace_id = %s
              and event_type = 'billing.refund.recorded'
              and payload_json ->> 'invoiceDigest' = %s
            """,
            (workspace_id, invoice_digest),
        )
        total = 0
        for row in cursor.fetchall():
            packet = _row_json(row, "payload_json", 0)
            if not isinstance(packet, Mapping):
                continue
            if packet.get("invoiceDigest") != invoice_digest:
                continue
            amount = packet.get("amountMinor")
            if isinstance(amount, int) and not isinstance(amount, bool):
                total += amount
        return total

    @staticmethod
    def _entitlement_row(cursor: Any, workspace_id: str) -> Any:
        cursor.execute(
            """
            select workspace_id, tier, status, granted_event_id, invoice_digest,
                   revision, updated_at
            from app_private.billing_entitlements
            where workspace_id = %s and tier = %s
            """,
            (workspace_id, PREMIUM_TIER),
        )
        return cursor.fetchone()

    @staticmethod
    def _append_event(
        cursor: Any,
        *,
        workspace_id: str,
        command_id: str,
        fingerprint: str,
        event_type: str,
        actor: str,
        payload: Mapping[str, Any],
        result: Mapping[str, Any],
    ) -> datetime:
        cursor.execute(
            """
            insert into app_private.billing_events (
              event_id, workspace_id, command_id, command_fingerprint,
              event_type, actor_id, actor_kind, payload_json, result_json
            ) values (%s, %s, %s, %s, %s, %s, 'human', %s::jsonb, %s::jsonb)
            returning created_at
            """,
            (
                command_id,
                workspace_id,
                command_id,
                fingerprint,
                event_type,
                actor,
                _canonical_json(payload),
                _canonical_json(result),
            ),
        )
        inserted = cursor.fetchone()
        created_at = _row_value(inserted, "created_at", 0)
        if not isinstance(created_at, datetime):
            raise BillingRailError("Billing event timestamp was not returned by PostgreSQL.")
        return created_at

    @staticmethod
    def _receipt(
        result: Mapping[str, Any],
        *,
        command_id: str,
        created_at: datetime | None,
        replayed: bool,
    ) -> dict[str, Any]:
        receipt = deepcopy(dict(result))
        receipt["replayed"] = replayed
        receipt["commandId"] = command_id
        if isinstance(created_at, datetime):
            receipt["recordedAt"] = _timestamp_text(created_at)
        receipt["authority"] = {
            "system": "postgresql",
            "table": "app_private.billing_events",
            "commandId": command_id,
            "verification": "requery_required",
        }
        receipt["localProjectionTrusted"] = False
        return receipt

    def _replay(
        self,
        event: Any,
        *,
        fingerprint: str,
        command_id: str,
    ) -> dict[str, Any] | None:
        if event is None:
            return None
        if str(_row_value(event, "command_fingerprint", 1)) != fingerprint:
            raise TrialIdempotencyConflict(command_id)
        result = _row_json(event, "result_json", 4)
        created_at = _row_value(event, "created_at", 5)
        if not isinstance(result, Mapping) or not isinstance(created_at, datetime):
            raise BillingRailConflict("Billing command history is not replayable.")
        return self._receipt(result, command_id=command_id, created_at=created_at, replayed=True)

    def issue_invoice(
        self,
        packet_value: object,
        *,
        workspace_id: str,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.invoice.issued: the packet is stored server-side and
        the evidence names how the invoice was handed to the customer."""

        validated = validate_invoice_packet(packet_value, workspace_id=workspace_id)
        proof = validate_founder_evidence(evidence, "Invoice issue evidence")
        workspace = validated["workspaceId"]
        invoice_id = validated["invoiceId"]
        digest_hex = str(validated["invoiceDigest"])[len("sha256:"):]
        payload = {
            "invoicePacket": validated["packet"],
            "invoiceDigest": validated["invoiceDigest"],
            "evidence": proof,
        }
        command_id, fingerprint = _billing_command_identity(
            workspace, "billing.invoice.issued", f"issue:{invoice_id}", payload
        )
        result = {
            "contract": BILLING_EVENT_RESULT_CONTRACT,
            "eventType": "billing.invoice.issued",
            "workspaceId": workspace,
            "invoiceId": invoice_id,
            "invoiceDigest": validated["invoiceDigest"],
            "status": "issued",
            "revision": 1,
            "secretValuesExposed": False,
        }
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, workspace)
                    replay = self._replay(
                        self._event_row(cursor, workspace, command_id),
                        fingerprint=fingerprint,
                        command_id=command_id,
                    )
                    if replay is not None:
                        row = self._invoice_row(cursor, workspace, invoice_id)
                        if (
                            row is None
                            or str(_row_value(row, "invoice_digest", 2)) != digest_hex
                            or _canonical_json(_row_json(row, "payload_json", 3))
                            != _canonical_json(validated["packet"])
                        ):
                            raise BillingRailConflict(
                                "Issued invoice history does not match its durable record."
                            )
                        return replay
                    if self._invoice_row(cursor, workspace, invoice_id) is not None:
                        raise BillingRailConflict(
                            "Invoice IDs are never reused; void the old invoice and prepare a new one."
                        )
                    cursor.execute(
                        """
                        insert into app_private.billing_invoices (
                          workspace_id, invoice_id, status, invoice_digest,
                          payload_json, revision
                        ) values (%s, %s, 'issued', %s, %s::jsonb, 1)
                        """,
                        (
                            workspace,
                            invoice_id,
                            digest_hex,
                            _canonical_json(validated["packet"]),
                        ),
                    )
                    created_at = self._append_event(
                        cursor,
                        workspace_id=workspace,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        event_type="billing.invoice.issued",
                        actor=proof["actor"],
                        payload=payload,
                        result=result,
                    )
            return self._receipt(result, command_id=command_id, created_at=created_at, replayed=False)
        finally:
            connection.close()

    def _transition_invoice(
        self,
        *,
        workspace_id: str,
        invoice_id: str,
        expected_revision: int,
        next_status: str,
        event_type: str,
        natural_key: str,
        proof: Mapping[str, str],
        payload_extra: Mapping[str, Any],
    ) -> dict[str, Any]:
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, workspace_id)
                    payload = {
                        "invoiceId": invoice_id,
                        "expectedRevision": expected_revision,
                        **deepcopy(dict(payload_extra)),
                        "evidence": dict(proof),
                    }
                    command_id, fingerprint = _billing_command_identity(
                        workspace_id, event_type, natural_key, payload
                    )
                    replay = self._replay(
                        self._event_row(cursor, workspace_id, command_id),
                        fingerprint=fingerprint,
                        command_id=command_id,
                    )
                    if replay is not None:
                        row = self._invoice_row(cursor, workspace_id, invoice_id)
                        if (
                            row is None
                            or str(_row_value(row, "status", 1)) != next_status
                            or int(_row_value(row, "revision", 4) or 0) != expected_revision + 1
                        ):
                            raise BillingRailConflict(
                                "Invoice transition history does not match its durable record."
                            )
                        return replay
                    row = self._invoice_row(cursor, workspace_id, invoice_id)
                    if row is None:
                        raise BillingRailConflict("The invoice does not exist on this tenant.")
                    if str(_row_value(row, "status", 1)) != "issued":
                        raise BillingRailConflict(
                            "Only an issued invoice can transition; paid and void are terminal."
                        )
                    if int(_row_value(row, "revision", 4) or 0) != expected_revision:
                        raise BillingRailConflict(
                            "The invoice revision changed; re-read the billing state and retry."
                        )
                    digest_hex = str(_row_value(row, "invoice_digest", 2))
                    cursor.execute(
                        """
                        update app_private.billing_invoices
                        set status = %s, revision = %s
                        where workspace_id = %s and invoice_id = %s
                          and status = 'issued' and revision = %s
                        returning updated_at
                        """,
                        (
                            next_status,
                            expected_revision + 1,
                            workspace_id,
                            invoice_id,
                            expected_revision,
                        ),
                    )
                    if cursor.fetchone() is None:
                        raise BillingRailConflict("The invoice changed before this transition.")
                    result = {
                        "contract": BILLING_EVENT_RESULT_CONTRACT,
                        "eventType": event_type,
                        "workspaceId": workspace_id,
                        "invoiceId": invoice_id,
                        "invoiceDigest": f"sha256:{digest_hex}",
                        "status": next_status,
                        "revision": expected_revision + 1,
                        "secretValuesExposed": False,
                    }
                    created_at = self._append_event(
                        cursor,
                        workspace_id=workspace_id,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        event_type=event_type,
                        actor=str(proof["actor"]),
                        payload=payload,
                        result=result,
                    )
            return self._receipt(result, command_id=command_id, created_at=created_at, replayed=False)
        finally:
            connection.close()

    def confirm_payment(
        self,
        *,
        workspace_id: str,
        invoice_id: str,
        expected_revision: int,
        payment_reference: str,
        channel_category: str,
        paid_at: str,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.payment.confirmed: a statement of fact about money the
        founder verified out-of-band. It never grants entitlement (design 3)."""

        workspace = _workspace_id(workspace_id)
        invoice = _visible_text(invoice_id, "Invoice ID", 44)
        if not _INVOICE_ID.fullmatch(invoice):
            raise BillingRailError("Invoice ID is invalid.")
        revision = _revision(expected_revision, "Invoice expected revision", minimum=1)
        reference = _visible_text(payment_reference, "Payment reference", 180)
        category = _visible_text(channel_category, "Payment channel category", 40)
        if category not in PAYMENT_CHANNEL_CATEGORIES:
            raise BillingRailError("Payment channel category is invalid.")
        paid_timestamp = _timestamp_text(_timestamp(paid_at, "Payment timestamp"))
        proof = validate_founder_evidence(evidence, "Payment confirmation evidence")
        if proof["evidenceReference"] != reference:
            # Field-for-field mirror between the event evidence and the record it
            # changes, exactly as commerce_runtime binds commerce.refund.settled.
            raise BillingRailError(
                "Payment confirmation evidence must reference the verified transfer reference."
            )
        return self._transition_invoice(
            workspace_id=workspace,
            invoice_id=invoice,
            expected_revision=revision,
            next_status="paid",
            event_type="billing.payment.confirmed",
            natural_key=f"confirm:{invoice}",
            proof=proof,
            payload_extra={
                "paymentReference": reference,
                "channelCategory": category,
                "paidAt": paid_timestamp,
            },
        )

    def void_invoice(
        self,
        *,
        workspace_id: str,
        invoice_id: str,
        expected_revision: int,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.invoice.voided for an issued, unpaid invoice."""

        workspace = _workspace_id(workspace_id)
        invoice = _visible_text(invoice_id, "Invoice ID", 44)
        if not _INVOICE_ID.fullmatch(invoice):
            raise BillingRailError("Invoice ID is invalid.")
        revision = _revision(expected_revision, "Invoice expected revision", minimum=1)
        proof = validate_founder_evidence(evidence, "Invoice void evidence")
        return self._transition_invoice(
            workspace_id=workspace,
            invoice_id=invoice,
            expected_revision=revision,
            next_status="void",
            event_type="billing.invoice.voided",
            natural_key=f"void:{invoice}",
            proof=proof,
            payload_extra={},
        )

    def grant_entitlement(
        self,
        *,
        workspace_id: str,
        invoice_digest: str,
        expected_revision: int,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.entitlement.granted, referencing the exact paid
        invoice digest. A separate founder action from confirm_payment by
        design: money arriving is a fact; switching service on is a decision."""

        workspace = _workspace_id(workspace_id)
        digest = _invoice_digest(invoice_digest, "Entitlement invoice digest")
        digest_hex = digest[len("sha256:"):]
        revision = _revision(expected_revision, "Entitlement expected revision")
        proof = validate_founder_evidence(evidence, "Entitlement grant evidence")
        payload = {
            "tier": PREMIUM_TIER,
            "invoiceDigest": digest,
            "expectedRevision": revision,
            "evidence": proof,
        }
        command_id, fingerprint = _billing_command_identity(
            workspace, "billing.entitlement.granted", f"grant:{revision}", payload
        )
        resulting_revision = revision + 2 if revision == 0 else revision + 1
        result = {
            "contract": BILLING_EVENT_RESULT_CONTRACT,
            "eventType": "billing.entitlement.granted",
            "workspaceId": workspace,
            "tier": PREMIUM_TIER,
            "invoiceDigest": digest,
            "status": "granted",
            "revision": resulting_revision,
            "secretValuesExposed": False,
        }
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, workspace)
                    replay = self._replay(
                        self._event_row(cursor, workspace, command_id),
                        fingerprint=fingerprint,
                        command_id=command_id,
                    )
                    if replay is not None:
                        row = self._entitlement_row(cursor, workspace)
                        if (
                            row is None
                            or str(_row_value(row, "status", 2)) != "granted"
                            or str(_row_value(row, "invoice_digest", 4)) != digest_hex
                            or int(_row_value(row, "revision", 5) or 0) != resulting_revision
                        ):
                            raise BillingRailConflict(
                                "Entitlement grant history does not match its durable record."
                            )
                        return replay
                    paid_invoice = self._invoice_row_by_digest(cursor, workspace, digest_hex)
                    if paid_invoice is None or str(_row_value(paid_invoice, "status", 1)) != "paid":
                        raise BillingRailConflict(
                            "Entitlement grants require the exact paid invoice digest."
                        )
                    row = self._entitlement_row(cursor, workspace)
                    if row is None:
                        if revision != 0:
                            raise BillingRailConflict(
                                "The entitlement revision changed; re-read the billing state and retry."
                            )
                        cursor.execute(
                            """
                            insert into app_private.billing_entitlements (
                              workspace_id, tier, status, granted_event_id,
                              invoice_digest, revision
                            ) values (%s, %s, 'none', null, null, 1)
                            """,
                            (workspace, PREMIUM_TIER),
                        )
                        current_revision = 1
                    else:
                        if str(_row_value(row, "status", 2)) == "granted":
                            raise BillingRailConflict("Premium entitlement is already granted.")
                        if int(_row_value(row, "revision", 5) or 0) != revision:
                            raise BillingRailConflict(
                                "The entitlement revision changed; re-read the billing state and retry."
                            )
                        current_revision = revision
                    cursor.execute(
                        """
                        update app_private.billing_entitlements
                        set status = 'granted', granted_event_id = %s,
                            invoice_digest = %s, revision = %s
                        where workspace_id = %s and tier = %s
                          and status in ('none', 'revoked') and revision = %s
                        returning updated_at
                        """,
                        (
                            command_id,
                            digest_hex,
                            current_revision + 1,
                            workspace,
                            PREMIUM_TIER,
                            current_revision,
                        ),
                    )
                    if cursor.fetchone() is None:
                        raise BillingRailConflict("The entitlement changed before this grant.")
                    created_at = self._append_event(
                        cursor,
                        workspace_id=workspace,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        event_type="billing.entitlement.granted",
                        actor=proof["actor"],
                        payload=payload,
                        result=result,
                    )
            return self._receipt(result, command_id=command_id, created_at=created_at, replayed=False)
        finally:
            connection.close()

    def revoke_entitlement(
        self,
        *,
        workspace_id: str,
        reason_class: str,
        expected_revision: int,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.entitlement.revoked. Re-granting later is allowed;
        every transition is CAS-guarded and appended, never edited."""

        workspace = _workspace_id(workspace_id)
        category = _visible_text(reason_class, "Revoke reason class", 40)
        if category not in REVOKE_REASON_CLASSES:
            raise BillingRailError("Revoke reason class is invalid.")
        revision = _revision(expected_revision, "Entitlement expected revision", minimum=1)
        proof = validate_founder_evidence(evidence, "Entitlement revoke evidence")
        payload = {
            "tier": PREMIUM_TIER,
            "reasonClass": category,
            "expectedRevision": revision,
            "evidence": proof,
        }
        command_id, fingerprint = _billing_command_identity(
            workspace, "billing.entitlement.revoked", f"revoke:{revision}", payload
        )
        result = {
            "contract": BILLING_EVENT_RESULT_CONTRACT,
            "eventType": "billing.entitlement.revoked",
            "workspaceId": workspace,
            "tier": PREMIUM_TIER,
            "reasonClass": category,
            "status": "revoked",
            "revision": revision + 1,
            "secretValuesExposed": False,
        }
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, workspace)
                    replay = self._replay(
                        self._event_row(cursor, workspace, command_id),
                        fingerprint=fingerprint,
                        command_id=command_id,
                    )
                    if replay is not None:
                        row = self._entitlement_row(cursor, workspace)
                        if (
                            row is None
                            or str(_row_value(row, "status", 2)) != "revoked"
                            or int(_row_value(row, "revision", 5) or 0) != revision + 1
                        ):
                            raise BillingRailConflict(
                                "Entitlement revoke history does not match its durable record."
                            )
                        return replay
                    row = self._entitlement_row(cursor, workspace)
                    if row is None or str(_row_value(row, "status", 2)) != "granted":
                        raise BillingRailConflict("Only a granted entitlement can be revoked.")
                    if int(_row_value(row, "revision", 5) or 0) != revision:
                        raise BillingRailConflict(
                            "The entitlement revision changed; re-read the billing state and retry."
                        )
                    cursor.execute(
                        """
                        update app_private.billing_entitlements
                        set status = 'revoked', granted_event_id = null,
                            invoice_digest = null, revision = %s
                        where workspace_id = %s and tier = %s
                          and status = 'granted' and revision = %s
                        returning updated_at
                        """,
                        (revision + 1, workspace, PREMIUM_TIER, revision),
                    )
                    if cursor.fetchone() is None:
                        raise BillingRailConflict("The entitlement changed before this revoke.")
                    created_at = self._append_event(
                        cursor,
                        workspace_id=workspace,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        event_type="billing.entitlement.revoked",
                        actor=proof["actor"],
                        payload=payload,
                        result=result,
                    )
            return self._receipt(result, command_id=command_id, created_at=created_at, replayed=False)
        finally:
            connection.close()

    def record_refund(
        self,
        *,
        workspace_id: str,
        invoice_digest: str,
        amount_minor: int,
        channel_category: str,
        refund_reference: str,
        evidence: object,
    ) -> dict[str, Any]:
        """Record billing.refund.recorded: money moved back, in the
        settle-refund evidence shape. It does NOT auto-revoke entitlement --
        revoking service is its own founder decision (design section 3)."""

        workspace = _workspace_id(workspace_id)
        digest = _invoice_digest(invoice_digest, "Refund invoice digest")
        digest_hex = digest[len("sha256:"):]
        amount = _minor_amount(amount_minor, "Refund amount", minimum=1)
        category = _visible_text(channel_category, "Refund channel category", 40)
        if category not in PAYMENT_CHANNEL_CATEGORIES:
            raise BillingRailError("Refund channel category is invalid.")
        reference = _visible_text(refund_reference, "Refund reference", 180)
        proof = validate_founder_evidence(evidence, "Refund settlement evidence")
        if proof["evidenceReference"] != reference:
            raise BillingRailError(
                "Refund settlement evidence must reference the verified refund reference."
            )
        payload = {
            "invoiceDigest": digest,
            "amountMinor": amount,
            "channelCategory": category,
            "refundReference": reference,
            "evidence": proof,
        }
        command_id, fingerprint = _billing_command_identity(
            workspace,
            "billing.refund.recorded",
            f"refund:{digest_hex}:{reference}",
            payload,
        )
        result = {
            "contract": BILLING_EVENT_RESULT_CONTRACT,
            "eventType": "billing.refund.recorded",
            "workspaceId": workspace,
            "invoiceDigest": digest,
            "amountMinor": amount,
            "status": "refund_recorded",
            "secretValuesExposed": False,
        }
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, workspace)
                    replay = self._replay(
                        self._event_row(cursor, workspace, command_id),
                        fingerprint=fingerprint,
                        command_id=command_id,
                    )
                    if replay is not None:
                        return replay
                    row = self._invoice_row_by_digest(cursor, workspace, digest_hex)
                    if row is None or str(_row_value(row, "status", 1)) != "paid":
                        raise BillingRailConflict(
                            "Refunds can only be recorded against the exact paid invoice digest."
                        )
                    stored_packet = _row_json(row, "payload_json", 3)
                    stored_invoice = (
                        stored_packet.get("invoice") if isinstance(stored_packet, Mapping) else None
                    )
                    stored_amount = (
                        stored_invoice.get("amount") if isinstance(stored_invoice, Mapping) else None
                    )
                    stored_total = (
                        stored_amount.get("totalMinor") if isinstance(stored_amount, Mapping) else None
                    )
                    prior_refunds = self._prior_refund_total(cursor, workspace, digest)
                    if (
                        not isinstance(stored_total, int)
                        or isinstance(stored_total, bool)
                        or prior_refunds + amount > stored_total
                    ):
                        raise BillingRailConflict(
                            "Recorded refunds cannot cumulatively exceed the sealed invoice total."
                        )
                    created_at = self._append_event(
                        cursor,
                        workspace_id=workspace,
                        command_id=command_id,
                        fingerprint=fingerprint,
                        event_type="billing.refund.recorded",
                        actor=proof["actor"],
                        payload=payload,
                        result=result,
                    )
            return self._receipt(result, command_id=command_id, created_at=created_at, replayed=False)
        finally:
            connection.close()

    @staticmethod
    def _stored_invoice_core(row: Any) -> Mapping[str, Any] | None:
        """The sealed invoice core inside a stored billing_invoices payload, or
        None when the stored payload does not carry one (never guessed)."""

        packet = _row_json(row, "payload_json", 4)
        invoice = packet.get("invoice") if isinstance(packet, Mapping) else None
        return invoice if isinstance(invoice, Mapping) else None

    def _overdue_report(
        self, cursor: Any, workspace: str, invoice_rows: Sequence[Any], as_of: datetime
    ) -> dict[str, Any]:
        """READ-ONLY overdue projection over the invoices and billing_events
        already recorded by founder actions (first-month lifecycle: the rail
        stores dueDate but nothing computed overdue -- silent revenue leakage).

        Pure projection: no auto-charge, no sends, no new event types, no
        mutation. Only 'issued' invoices can be overdue -- paid means a
        founder-confirmed payment event exists, void means the receivable was
        cancelled. Outstanding is the sealed total net of every recorded refund
        for the exact invoice digest, reusing _prior_refund_total so the
        replay-proof cumulative-refund arithmetic has exactly one home. An
        invoice whose stored payload has no parseable ISO dueDate (or sealed
        amount) is excluded WITH a note rather than guessed at.
        """

        as_of_date = as_of.astimezone(timezone.utc).date()
        entries: list[dict[str, Any]] = []
        excluded: list[dict[str, str]] = []
        for row in invoice_rows:
            if str(_row_value(row, "status", 1)) != "issued":
                # paid: a billing.payment.confirmed event settled it.
                # void: the receivable was cancelled. Neither is outstanding.
                continue
            invoice_id = str(_row_value(row, "invoice_id", 0))
            invoice = self._stored_invoice_core(row)
            schedule = invoice.get("issuedToPayBy") if invoice is not None else None
            due_raw = schedule.get("dueDate") if isinstance(schedule, Mapping) else None
            due_date = None
            if isinstance(due_raw, str):
                try:
                    due_date = date.fromisoformat(due_raw)
                except ValueError:
                    due_date = None
            if due_date is None:
                excluded.append(
                    {
                        "invoiceId": invoice_id,
                        "note": "Stored invoice has no parseable ISO-8601 dueDate; overdue status is not guessed.",
                    }
                )
                continue
            amount = invoice.get("amount") if invoice is not None else None
            total = amount.get("totalMinor") if isinstance(amount, Mapping) else None
            currency = amount.get("currency") if isinstance(amount, Mapping) else None
            if not isinstance(total, int) or isinstance(total, bool) or not isinstance(currency, str):
                excluded.append(
                    {
                        "invoiceId": invoice_id,
                        "note": "Stored invoice has no sealed integer amount; outstanding is not guessed.",
                    }
                )
                continue
            days_overdue = (as_of_date - due_date).days
            if days_overdue <= 0:
                # Due today (or later) is not yet overdue; overdue starts the
                # day after dueDate.
                continue
            digest = f"sha256:{_row_value(row, 'invoice_digest', 2)}"
            refunded = self._prior_refund_total(cursor, workspace, digest)
            entries.append(
                {
                    "invoiceId": invoice_id,
                    "invoiceDigest": digest,
                    "dueDate": due_raw,
                    "daysOverdue": days_overdue,
                    "currency": currency,
                    "totalMinor": total,
                    "refundedMinor": refunded,
                    "outstandingMinor": max(total - refunded, 0),
                }
            )
        entries.sort(key=lambda entry: (-entry["daysOverdue"], entry["invoiceId"]))
        totals: dict[str, int] = {}
        for entry in entries:
            totals[entry["currency"]] = totals.get(entry["currency"], 0) + entry["outstandingMinor"]
        return {
            "contract": BILLING_OVERDUE_REPORT_CONTRACT,
            "asOf": _timestamp_text(as_of),
            "overdueInvoices": entries,
            "excluded": excluded,
            "totalOutstandingMinorByCurrency": totals,
        }

    def get_billing_state(
        self, workspace_id: str, *, as_of: datetime | None = None
    ) -> dict[str, Any]:
        """Read the billing projection for one tenant. Read-only; the only
        place premiumUnlocked is derived is billing_entitlements.status. The
        result carries the overdue report projected as of ``as_of`` (UTC now
        when omitted; must be timezone-aware when supplied)."""

        workspace = _workspace_id(workspace_id)
        if as_of is None:
            as_of = datetime.now(timezone.utc)
        if not isinstance(as_of, datetime) or as_of.tzinfo is None:
            raise BillingRailError("Overdue report reference time must be timezone-aware.")
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction read only")
                    self._assert_schema(cursor, require_write_privilege=False)
                    cursor.execute(
                        """
                        select invoice_id, status, invoice_digest, revision, payload_json
                        from app_private.billing_invoices
                        where workspace_id = %s
                        order by invoice_id
                        """,
                        (workspace,),
                    )
                    invoice_rows = list(cursor.fetchall() or [])
                    overdue_report = self._overdue_report(cursor, workspace, invoice_rows, as_of)
                    entitlement = self._entitlement_row(cursor, workspace)
                    cursor.execute(
                        """
                        select count(*) as event_count
                        from app_private.billing_events
                        where workspace_id = %s
                        """,
                        (workspace,),
                    )
                    event_count = int(_row_value(cursor.fetchone(), "event_count", 0) or 0)
            entitlement_status = (
                str(_row_value(entitlement, "status", 2)) if entitlement is not None else "none"
            )
            entitlement_digest = (
                _row_value(entitlement, "invoice_digest", 4) if entitlement is not None else None
            )
            return {
                "contract": BILLING_STATE_CONTRACT,
                "workspaceId": workspace,
                "invoices": [
                    {
                        "invoiceId": str(_row_value(row, "invoice_id", 0)),
                        "status": str(_row_value(row, "status", 1)),
                        "invoiceDigest": f"sha256:{_row_value(row, 'invoice_digest', 2)}",
                        "revision": int(_row_value(row, "revision", 3) or 0),
                    }
                    for row in invoice_rows
                ],
                "entitlement": {
                    "tier": PREMIUM_TIER,
                    "status": entitlement_status,
                    "invoiceDigest": (
                        f"sha256:{entitlement_digest}" if entitlement_digest else None
                    ),
                    "revision": (
                        int(_row_value(entitlement, "revision", 5) or 0)
                        if entitlement is not None
                        else 0
                    ),
                },
                "premiumUnlocked": entitlement_status == "granted",
                "overdueReport": overdue_report,
                "eventCount": event_count,
                "localProjectionTrusted": False,
                "externalWritesPerformed": False,
                "secretValuesExposed": False,
            }
        finally:
            connection.close()


# Founder-run CLI: the only place BillingLedger is ever actually invoked
# (design section 6). Mirrors managed_activation.py's CLI shape exactly --
# argparse subparsers, evidence and packets always read from files (never as
# raw CLI arguments, so reason text and other free-form fields never touch
# shell history or a process listing), structured JSON stdout, and a two-tier
# exception handler that never leaks driver or provider detail.

# Deliberate typed-confirmation friction gate for every mutating subcommand,
# consistent with how this repo gates every consequential founder action
# (mirrors managed_activation's --confirm-owner-approval, matched here against
# a fixed phrase instead of a plan's approvalId since there is no plan file).
CONFIRM_BILLING_ACTION_PHRASE = "CONFIRM BILLING ACTION"


def _read_json(path_value: str, label: str) -> Any:
    path = Path(path_value).resolve()
    if not path.is_file() or path.stat().st_size > MAX_INPUT_BYTES:
        raise BillingRailError(f"{label} is missing or too large.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BillingRailError(f"{label} is not valid UTF-8 JSON.") from exc
    if not isinstance(value, dict):
        raise BillingRailError(f"{label} must contain a JSON object.")
    return value


def _read_database_url(path_value: str) -> str:
    """Read the administrative database URL from a file, never a CLI
    argument, so the URL never appears in shell history or a process listing.
    BillingLedger._connect enforces the encrypted-sslmode and CA rules; this
    helper only has to get the bytes off disk safely."""

    path = Path(path_value).resolve()
    if not path.is_file() or path.stat().st_size > 16 * 1024:
        raise BillingRailError("Billing database URL file is missing or too large.")
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise BillingRailError("Billing database URL file is empty.")
    return value


def _int_argument(value: str, label: str) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"-?[0-9]+", value):
        raise BillingRailError(f"{label} must be an integer.")
    return int(value)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Record one founder-verified billing rail transition (Gate 9)."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_read_arguments(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--database-url-file", required=True)
        sub.add_argument("--workspace-id", required=True)

    def add_mutation_arguments(sub: argparse.ArgumentParser) -> None:
        add_read_arguments(sub)
        sub.add_argument("--evidence-file", required=True)
        sub.add_argument("--confirm-billing-action", required=True)

    issue_invoice = subparsers.add_parser("issue-invoice")
    add_mutation_arguments(issue_invoice)
    issue_invoice.add_argument("--packet-file", required=True)

    confirm_payment = subparsers.add_parser("confirm-payment")
    add_mutation_arguments(confirm_payment)
    confirm_payment.add_argument("--invoice-id", required=True)
    confirm_payment.add_argument("--expected-revision", required=True)
    confirm_payment.add_argument("--payment-reference", required=True)
    confirm_payment.add_argument("--channel-category", required=True)
    confirm_payment.add_argument("--paid-at", required=True)

    void_invoice = subparsers.add_parser("void-invoice")
    add_mutation_arguments(void_invoice)
    void_invoice.add_argument("--invoice-id", required=True)
    void_invoice.add_argument("--expected-revision", required=True)

    grant_entitlement = subparsers.add_parser("grant-entitlement")
    add_mutation_arguments(grant_entitlement)
    grant_entitlement.add_argument("--invoice-digest", required=True)
    grant_entitlement.add_argument("--expected-revision", required=True)

    revoke_entitlement = subparsers.add_parser("revoke-entitlement")
    add_mutation_arguments(revoke_entitlement)
    revoke_entitlement.add_argument("--reason-class", required=True)
    revoke_entitlement.add_argument("--expected-revision", required=True)

    record_refund = subparsers.add_parser("record-refund")
    add_mutation_arguments(record_refund)
    record_refund.add_argument("--invoice-digest", required=True)
    record_refund.add_argument("--amount-minor", required=True)
    record_refund.add_argument("--channel-category", required=True)
    record_refund.add_argument("--refund-reference", required=True)

    status = subparsers.add_parser("status")
    add_read_arguments(status)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    mutation_performed = False
    try:
        if args.command != "status" and args.confirm_billing_action != CONFIRM_BILLING_ACTION_PHRASE:
            raise BillingRailError(
                f'Billing mutations require --confirm-billing-action "{CONFIRM_BILLING_ACTION_PHRASE}".'
            )
        database_url = _read_database_url(args.database_url_file)
        ledger = BillingLedger(database_url)
        if args.command == "status":
            result = ledger.get_billing_state(args.workspace_id)
        else:
            evidence = _read_json(args.evidence_file, "Billing evidence")
            if args.command == "issue-invoice":
                packet = _read_json(args.packet_file, "Invoice packet")
                result = ledger.issue_invoice(
                    packet, workspace_id=args.workspace_id, evidence=evidence
                )
            elif args.command == "confirm-payment":
                result = ledger.confirm_payment(
                    workspace_id=args.workspace_id,
                    invoice_id=args.invoice_id,
                    expected_revision=_int_argument(args.expected_revision, "Expected revision"),
                    payment_reference=args.payment_reference,
                    channel_category=args.channel_category,
                    paid_at=args.paid_at,
                    evidence=evidence,
                )
            elif args.command == "void-invoice":
                result = ledger.void_invoice(
                    workspace_id=args.workspace_id,
                    invoice_id=args.invoice_id,
                    expected_revision=_int_argument(args.expected_revision, "Expected revision"),
                    evidence=evidence,
                )
            elif args.command == "grant-entitlement":
                result = ledger.grant_entitlement(
                    workspace_id=args.workspace_id,
                    invoice_digest=args.invoice_digest,
                    expected_revision=_int_argument(args.expected_revision, "Expected revision"),
                    evidence=evidence,
                )
            elif args.command == "revoke-entitlement":
                result = ledger.revoke_entitlement(
                    workspace_id=args.workspace_id,
                    reason_class=args.reason_class,
                    expected_revision=_int_argument(args.expected_revision, "Expected revision"),
                    evidence=evidence,
                )
            elif args.command == "record-refund":
                result = ledger.record_refund(
                    workspace_id=args.workspace_id,
                    invoice_digest=args.invoice_digest,
                    amount_minor=_int_argument(args.amount_minor, "Amount minor"),
                    channel_category=args.channel_category,
                    refund_reference=args.refund_reference,
                    evidence=evidence,
                )
            else:
                raise BillingRailError("Unknown billing command.")
            mutation_performed = result.get("replayed") is False
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        return 0
    except (BillingRailError, TrialIdempotencyConflict, OSError, json.JSONDecodeError) as exc:
        print(
            json.dumps(
                {
                    "contract": "supermega.managed_billing_event_error.v1",
                    "status": "blocked",
                    "error": str(exc),
                    "secretValuesExposed": False,
                    "externalMutationPerformed": mutation_performed,
                },
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 1
    except Exception:
        print(
            json.dumps(
                {
                    "contract": "supermega.managed_billing_event_error.v1",
                    "status": "blocked",
                    "error": "Billing rail command failed without exposing provider or credential details.",
                    "secretValuesExposed": False,
                    "externalMutationPerformed": mutation_performed,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "BILLING_ENTITLEMENT_READ_POLICY_DIGEST",
    "BILLING_ENTITLEMENT_READ_SCHEMA_VERSION",
    "BILLING_EVENT_RESULT_CONTRACT",
    "BILLING_EVENT_TYPES",
    "BILLING_OVERDUE_REPORT_CONTRACT",
    "BILLING_SCHEMA_VERSION",
    "BILLING_STATE_CONTRACT",
    "BillingLedger",
    "BillingRailConflict",
    "BillingRailError",
    "CONFIRM_BILLING_ACTION_PHRASE",
    "INVOICE_PACKET_CONTRACT",
    "MANAGED_BILLING_CONTRACT",
    "PAYMENT_CHANNEL_CATEGORIES",
    "PREMIUM_TIER",
    "REVOKE_REASON_CLASSES",
    "main",
    "validate_founder_evidence",
    "validate_invoice_packet",
]
