from __future__ import annotations

from copy import deepcopy
import contextlib
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from urllib.parse import quote

from supermega_runtime.managed_context import (
    MANAGED_CONTEXT_ALLOWED_USES,
    MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
    managed_ai_context_export_digest,
)
from supermega_runtime.managed_activation import (
    ACTIVATION_PLAN_CONTRACT,
    ACTIVATION_REQUERY_EVIDENCE_CONTRACT,
    ACTIVATION_RECEIPT_CONTRACT,
    MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT,
    SUSPENSION_RECEIPT_CONTRACT,
    TRIAL_SCHEMA_VERSION,
    ManagedActivationConflict,
    ManagedActivationError,
    ManagedWorkspaceProvisioner,
    build_activation_requery_evidence,
    compile_activation_plan,
    compile_multi_product_activation_plan,
    main,
    validate_activation_plan,
    validate_activation_receipt,
    validate_managed_trial_request,
    validate_multi_product_activation_plan,
    _validate_admin_target,
)


NOW = datetime.now(timezone.utc).replace(microsecond=0)


def _fixture_timestamp(minutes_before_now: int) -> str:
    moment = NOW - timedelta(minutes=minutes_before_now)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")
OWNER_ID = "c63af44e-b7c1-4dbf-970d-389d5bba93a7"
OWNER_SESSION_ID = "1ed07925-e474-42e3-82f1-4387f1ae63f9"
APPROVAL_ID = "7f201a3b-d6d9-4c1a-b6c6-3d0d1e123731"
PROJECT_REF = "zvtzwcimpvvtkowflhda"
RELEASE_COMMIT = "a" * 40
ADMIN_CA_SHA256 = "sha256:" + "1" * 64


def pilot_outcome_report(product: str = "commerce") -> dict[str, object]:
    workspace = "Mingalar Fresh Mart"
    owner = "Swan Htet"
    template = {
        "commerce": "retail-wholesale",
        "production": "production-control",
        "website": "lead-generation",
        "ecommerce": "social-storefront",
    }[product]
    started_at = _fixture_timestamp(30)
    reviewed_at = _fixture_timestamp(25)
    checkpoint_digest = "sha256:" + "2" * 64
    baseline = {
        "metricId": "shop-exceptions",
        "label": "Shop exceptions",
        "value": 3,
        "unit": "exceptions",
        "better": "lower",
        "detail": "2 low stock, 1 payment, 0 refund.",
        "sourceDigest": "sha256:" + "3" * 64,
    }
    current = {
        **baseline,
        "value": 1,
        "detail": "1 low stock, 0 payment, 0 refund.",
        "sourceDigest": "sha256:" + "4" * 64,
    }
    recommendation = "Accept the measured improvement or continue until the product is clear."
    projection = [
        "supermega.pilot_outcome_report.v1",
        1,
        product,
        workspace,
        owner,
        template,
        checkpoint_digest,
        started_at,
        list(baseline.values()),
        list(current.values()),
        "improved",
        -2,
        recommendation,
        False,
        False,
    ]
    report_digest = "sha256:" + sha256(
        json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "contract": "supermega.pilot_outcome_report.v1",
        "version": 1,
        "product": product,
        "workspace": workspace,
        "owner": owner,
        "templateId": template,
        "checkpointDigest": checkpoint_digest,
        "startedAt": started_at,
        "measuredAt": reviewed_at,
        "baseline": baseline,
        "current": current,
        "outcomeStatus": "improved",
        "change": -2,
        "recommendation": recommendation,
        "review": {
            "contract": "supermega.local_pilot_outcome_review.v1",
            "reportDigest": report_digest,
            "reviewedBy": owner,
            "reviewedAt": reviewed_at,
            "decision": "accepted",
        },
        "rawRecordsIncluded": False,
        "externalWritesPerformed": False,
        "reportDigest": report_digest,
    }


def approved_ai_context(outcome: dict[str, object]) -> dict[str, object]:
    product, template, behavior_product = {
        "commerce": ("shop", "retail-wholesale", "commerce"),
        "production": ("plant", "production-control", "production"),
        "website": ("website", "lead-generation", "website"),
        "ecommerce": ("ecommerce", "social-storefront", "ecommerce"),
    }[str(outcome["product"])]
    body: dict[str, object] = {
        "contract": "supermega.ai_context_export.v1",
        "version": 1,
        "product": product,
        "templateId": template,
        "sourceCounts": {
            "selectedProductRecords": 12,
            "behaviorSignals": 4,
            "reviewedDecisions": 2,
        },
        "behaviorPreference": {
            "product": behavior_product,
            "chosenCount": 3,
        },
        "outcome": {
            "status": outcome["outcomeStatus"],
            "digest": outcome["reportDigest"],
            "accepted": True,
        },
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "handoff": {"route": "managed_activation_review", "activationRequired": True},
        "ownerReview": {
            "status": "approved_for_managed_review",
            "reviewedBy": "Swan Htet",
            "reviewedAt": _fixture_timestamp(24),
        },
        "privacyBoundary": {
            "rawProductRecordsIncluded": False,
            "rawBehaviorEntriesIncluded": False,
            "rawDecisionRecordsIncluded": False,
            "externalSendPerformed": False,
            "managedWritePerformed": False,
            "modelTrainingAllowed": False,
        },
    }
    return {**body, "contextDigest": managed_ai_context_export_digest(body)}


def managed_trial_request() -> dict[str, object]:
    outcome = pilot_outcome_report()
    data_package = {
        "evidenceFilename": "supermega-trial-evidence.json",
        "localRecords": 12,
        "storagePackages": 1,
        "selectedProductRecords": 12,
        "productSources": ["commerce"],
        "approvalPackets": 2,
        "behaviorSignals": 4,
        "pilotOutcomeDigest": outcome["reportDigest"],
    }
    provisioning = {
        "contract": "supermega.managed_workspace_provisioning.v1",
        "version": 1,
        "createdAt": _fixture_timestamp(20),
        "evidenceVersion": 24,
        "workspace": "Mingalar Fresh Mart",
        "owner": "Swan Htet",
        "product": "Shop",
        "template": "Retail and wholesale",
        "tenantMode": "managed_required",
        "dataPackage": data_package,
        "requiredControls": [
            "dedicated_postgres_rls",
            "trusted_identity_gateway",
            "private_storage",
            "audit_trail",
            "owner_write_approvals",
            "scheduler_budget_limits",
        ],
        "firstSafeActivation": "Create managed tenant from exported evidence after activation gates pass.",
        "forbiddenUntilProvisioned": [
            "copy_browser_storage_to_production",
            "enable_hosted_scheduler",
            "send_customer_messages",
            "capture_payments",
            "publish_domains",
        ],
    }
    return {
        "contract": "supermega.managed_trial_request.v1",
        "version": 1,
        "createdAt": _fixture_timestamp(20),
        "product": "Shop",
        "productSlug": "shop",
        "templateId": "retail-wholesale",
        "templateName": "Retail and wholesale",
        "workspace": "Mingalar Fresh Mart",
        "owner": "Swan Htet",
        "pilotReady": True,
        "localRecords": 12,
        "approvalPackets": 2,
        "behaviorSignals": 4,
        "evidenceVersion": 24,
        "pilotOutcomeReport": outcome,
        "approvedAiContext": approved_ai_context(outcome),
        "managedWorkspaceProvisioningPacket": provisioning,
        "importProvisioningPacket": {
            "contract": "supermega.import_provisioning_readiness.v1",
            "status": "blocked",
            "secretValuesExposed": False,
        },
        "noExternalSend": True,
    }


def managed_trial_request_for(product_slug: str = "shop") -> dict[str, object]:
    request = managed_trial_request()
    request["productSlug"] = product_slug
    product_label, template_id, template_name, report_product = {
        "shop": ("Shop", "retail-wholesale", "Retail and wholesale", "commerce"),
        "plant": ("Plant", "production-control", "Production control", "production"),
        "website": ("Website", "lead-generation", "Lead generation", "website"),
        "ecommerce": ("Ecommerce", "social-storefront", "Social storefront", "ecommerce"),
    }[product_slug]
    if product_slug != "shop":
        request["product"] = product_label
        request["templateId"] = template_id
        request["templateName"] = template_name
        request["managedWorkspaceProvisioningPacket"]["product"] = product_label  # type: ignore[index]
        request["managedWorkspaceProvisioningPacket"]["template"] = template_name  # type: ignore[index]
        outcome = pilot_outcome_report(report_product)
        request["pilotOutcomeReport"] = outcome
        request["approvedAiContext"] = approved_ai_context(outcome)
        request["managedWorkspaceProvisioningPacket"]["dataPackage"]["pilotOutcomeDigest"] = outcome["reportDigest"]  # type: ignore[index]
    return request


def activation_plan(product_slug: str = "shop") -> dict[str, object]:
    request = managed_trial_request_for(product_slug)
    return compile_activation_plan(
        request,
        workspace_id="mingalar-fresh-mart",
        owner_actor_id=OWNER_ID,
        approval_id=APPROVAL_ID,
        approved_by="Swan Htet",
        approved_at=_fixture_timestamp(5),
        project_ref=PROJECT_REF,
        release_commit=RELEASE_COMMIT,
        admin_ca_sha256=ADMIN_CA_SHA256,
        now=NOW,
    )


class FakeDatabase:
    def __init__(self) -> None:
        self.memberships: list[dict[str, object]] = []
        self.access_controls: dict[str, dict[str, object]] = {}
        self.approvals: list[dict[str, object]] = []
        self.events: dict[tuple[str, str], dict[str, object]] = {}
        self.statements: list[tuple[str, tuple[object, ...]]] = []
        self.clock = NOW
        self.current_user = "postgres"
        self.provisioning_role_privileged = True
        self.session_active = True
        self.auth_users: set[str] = {OWNER_ID}
        self.anonymous_auth_users: set[str] = set()

    def connect(self, _database_url: str):
        return FakeConnection(self)


class FakeConnection:
    def __init__(self, database: FakeDatabase) -> None:
        self.database = database
        self.closed = False
        self.snapshot = None

    def transaction(self):
        return self

    def cursor(self):
        return FakeCursor(self.database)

    def __enter__(self):
        self.snapshot = (
            deepcopy(self.database.memberships),
            deepcopy(self.database.access_controls),
            deepcopy(self.database.approvals),
            deepcopy(self.database.events),
            self.database.clock,
        )
        return self

    def __exit__(self, exc_type, *_args):
        if exc_type is not None and self.snapshot is not None:
            (
                self.database.memberships,
                self.database.access_controls,
                self.database.approvals,
                self.database.events,
                self.database.clock,
            ) = self.snapshot
        return False

    def close(self):
        self.closed = True


class FakeCursor:
    def __init__(self, database: FakeDatabase) -> None:
        self.database = database
        self.rows: list[object] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params=()):
        sql = " ".join(str(statement).split()).lower()
        values = tuple(params)
        self.database.statements.append((sql, values))
        self.rows = []
        if "current_setting('server_version_num')" in sql:
            self.rows = [
                {
                    "server_version_num": 170006,
                    "current_user": self.database.current_user,
                    "transaction_read_only": "set transaction read only" in self.database.statements[-2][0]
                    if len(self.database.statements) > 1
                    else False,
                    "provisioning_role_privileged": self.database.provisioning_role_privileged,
                    "schema_version": TRIAL_SCHEMA_VERSION,
                    "backend_role_safe": True,
                    "access_select": True,
                    "access_insert": True,
                    "access_update": True,
                    "approval_select": True,
                    "approval_insert": True,
                    "membership_select": True,
                    "membership_insert": True,
                    "membership_update": True,
                    "event_select": True,
                    "event_insert": True,
                }
            ]
        elif "supabase_session_is_active" in sql:
            self.rows = [{"active": self.database.session_active}]
        elif "from auth.users" in sql:
            member_id = str(values[0])
            self.rows = [{
                "member_exists": (
                    member_id in self.database.auth_users
                    and member_id not in self.database.anonymous_auth_users
                )
            }]
        elif "from app_private.approval_requests" in sql and sql.startswith("select"):
            approval_id, workspace_id, command_id, _approval_order = values
            matches = [
                deepcopy(row)
                for row in self.database.approvals
                if row["approval_id"] == approval_id
                or (row["workspace_id"] == workspace_id and row["command_id"] == command_id)
            ]
            self.rows = matches[:1]
        elif "from app_private.workspace_access_controls" in sql and sql.startswith("select"):
            row = self.database.access_controls.get(str(values[0]))
            self.rows = [deepcopy(row)] if row else []
        elif "from app_private.workspace_memberships" in sql and sql.startswith("select"):
            workspace_id = values[0]
            self.rows = [
                deepcopy(row)
                for row in self.database.memberships
                if row["workspace_id"] == workspace_id
            ]
        elif "from app_private.workspace_events" in sql and sql.startswith("select"):
            event = self.database.events.get((str(values[0]), str(values[1])))
            self.rows = [deepcopy(event)] if event else []
        elif sql.startswith("insert into app_private.approval_requests"):
            (
                approval_id,
                workspace_id,
                command_id,
                fingerprint,
                _title,
                proposal,
                evidence,
                requested_by,
                decided_by,
                note,
            ) = values
            self.database.clock += timedelta(seconds=1)
            self.database.approvals.append(
                {
                    "approval_id": approval_id,
                    "workspace_id": workspace_id,
                    "command_id": command_id,
                    "command_fingerprint": fingerprint,
                    "proposal_json": json.loads(proposal),
                    "evidence_refs_json": json.loads(evidence),
                    "status": "approved",
                    "requested_by": requested_by,
                    "requested_actor_kind": "human",
                    "requested_at": self.database.clock,
                    "decided_by": decided_by,
                    "decided_actor_kind": "human",
                    "decided_at": self.database.clock,
                    "decision_note": note,
                    "decision_contract_version": 2,
                    "version": 1,
                }
            )
            self.rows = [{"requested_at": self.database.clock, "decided_at": self.database.clock}]
        elif sql.startswith("insert into app_private.workspace_access_controls"):
            workspace_id, activation_id, authorization_id, plan_digest, owner_actor_id, project_ref, release_commit = values
            self.database.clock += timedelta(seconds=1)
            self.database.access_controls[str(workspace_id)] = {
                "activation_id": activation_id,
                "authorization_id": authorization_id,
                "authorization_contract": "managed_owner_approval_v1",
                "plan_digest": plan_digest,
                "owner_actor_id": owner_actor_id,
                "project_ref": project_ref,
                "release_commit": release_commit,
                "status": "active",
                "activated_at": self.database.clock,
                "suspended_at": None,
            }
        elif sql.startswith("update app_private.workspace_access_controls"):
            workspace_id, activation_id = values
            row = self.database.access_controls.get(str(workspace_id))
            if row and row["activation_id"] == activation_id and row["status"] == "active":
                row["status"] = "suspended"
                row["suspended_at"] = self.database.clock
                self.rows = [{"updated_at": self.database.clock}]
        elif sql.startswith("insert into app_private.workspace_memberships"):
            self.database.memberships.append(
                {
                    "workspace_id": values[0],
                    "actor_id": values[1],
                    "actor_kind": "human",
                    "status": "active",
                    "capabilities": list(values[2]),
                }
            )
        elif sql.startswith("update app_private.workspace_memberships"):
            workspace_id, actor_id = values
            for row in self.database.memberships:
                if row["workspace_id"] == workspace_id and row["actor_id"] == actor_id and row["status"] == "active":
                    row["status"] = "revoked" if "set status = 'revoked'" in sql else "suspended"
                    self.rows = [{"updated_at": self.database.clock}]
                    break
        elif sql.startswith("insert into app_private.workspace_events"):
            event_id, workspace_id, command_id, fingerprint, actor_id, payload, result = values
            self.database.clock += timedelta(seconds=1)
            event = {
                "event_id": event_id,
                "workspace_id": workspace_id,
                "command_id": command_id,
                "command_fingerprint": fingerprint,
                "actor_id": actor_id,
                "payload_json": json.loads(payload),
                "result_json": json.loads(result),
                "created_at": self.database.clock,
            }
            self.database.events[(str(workspace_id), str(command_id))] = event
            self.rows = [{"created_at": self.database.clock}]

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class ManagedActivationPlanTests(unittest.TestCase):
    def test_managed_trial_request_validator_returns_only_redacted_binding(self) -> None:
        validated = validate_managed_trial_request(managed_trial_request_for("ecommerce"))
        self.assertEqual(validated["contract"], "supermega.managed_trial_request.v1")
        self.assertEqual(validated["product"], "ecommerce")
        self.assertEqual(validated["workspaceLabel"], "Mingalar Fresh Mart")
        self.assertEqual(validated["ownerLabel"], "Swan Htet")
        self.assertEqual(validated["templateId"], "social-storefront")
        self.assertRegex(validated["requestDigest"], r"^sha256:[0-9a-f]{64}$")
        self.assertFalse(validated["rawRecordsIncluded"])
        self.assertFalse(validated["secretValuesExposed"])
        self.assertNotIn("raw", validated)

    def test_multi_product_plan_is_one_tenant_with_union_capabilities(self) -> None:
        plan = compile_multi_product_activation_plan(
            [managed_trial_request_for("shop"), managed_trial_request_for("plant")],
            workspace_id="mingalar-fresh-mart",
            owner_actor_id=OWNER_ID,
            approval_id=APPROVAL_ID,
            approved_by="Swan Htet",
            approved_at=_fixture_timestamp(5),
            project_ref=PROJECT_REF,
            release_commit=RELEASE_COMMIT,
            admin_ca_sha256=ADMIN_CA_SHA256,
            now=NOW,
        )
        self.assertEqual(plan["contract"], MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT)
        self.assertEqual(plan["products"], ["shop", "plant"])
        self.assertIn("commerce.write", plan["ownerCapabilities"])
        self.assertIn("production.write", plan["ownerCapabilities"])
        self.assertEqual(len(plan["sourcePlans"]), 2)
        self.assertEqual(validate_multi_product_activation_plan(plan), plan)

        tampered = deepcopy(plan)
        tampered["products"].reverse()
        with self.assertRaises(ManagedActivationError):
            validate_multi_product_activation_plan(tampered)

    def test_plan_is_deterministic_redacted_and_capability_scoped(self) -> None:
        first = activation_plan()
        second = activation_plan()
        self.assertEqual(first, second)
        self.assertEqual(first["contract"], ACTIVATION_PLAN_CONTRACT)
        self.assertEqual(first["target"]["schemaVersion"], TRIAL_SCHEMA_VERSION)
        self.assertEqual(first["target"]["adminCaSha256"], ADMIN_CA_SHA256)
        self.assertIn("commerce.write", first["ownerCapabilities"])
        self.assertNotIn("production.write", first["ownerCapabilities"])
        self.assertIn("company.baseline.approve", first["ownerCapabilities"])
        self.assertIn("company.control.approve", first["ownerCapabilities"])
        self.assertEqual(first["evidence"]["pilotOutcomeStatus"], "improved")
        request = managed_trial_request()
        self.assertEqual(first["evidence"]["approvedContextDigest"], request["approvedAiContext"]["contextDigest"])
        self.assertEqual(first["evidence"]["approvedContextOutcomeDigest"], first["evidence"]["pilotOutcomeDigest"])
        self.assertEqual(first["evidence"]["approvedContextContract"], "supermega.ai_context_export.v1")
        self.assertEqual(first["evidence"]["approvedContextApprovedBy"], "Swan Htet")
        self.assertFalse(first["evidence"]["approvedContextRawRecordsIncluded"])
        self.assertFalse(first["evidence"]["approvedContextModelTrainingAllowed"])
        self.assertEqual(first["rollback"]["authorizationScope"], "automatic_activation_compensation")
        self.assertEqual(first["rollback"]["trigger"], "downstream_release_gate_failure")
        serialized = json.dumps(first, sort_keys=True)
        self.assertNotIn("currentRecord", serialized)
        self.assertNotIn("postgresql://", serialized)
        self.assertFalse(first["secretValuesExposed"])
        self.assertEqual(validate_activation_plan(first), first)

    def test_product_capabilities_do_not_leak_across_tracks(self) -> None:
        plan = activation_plan("plant")
        self.assertIn("production.write", plan["ownerCapabilities"])
        self.assertNotIn("commerce.write", plan["ownerCapabilities"])
        self.assertNotIn("website.write", plan["ownerCapabilities"])

    def test_plan_rejects_missing_evidence_secrets_and_tampering(self) -> None:
        for label, mutate in (
            ("no records", lambda value: value.__setitem__("localRecords", 0)),
            ("not ready", lambda value: value.__setitem__("pilotReady", False)),
            ("database secret", lambda value: value.__setitem__("database_url", "postgresql://owner:secret@host/db")),
            ("access token", lambda value: value.__setitem__("accessToken", "must-not-enter-an-activation-plan")),
            ("missing pilot outcome", lambda value: value.__setitem__("pilotOutcomeReport", None)),
            ("missing approved context", lambda value: value.__setitem__("approvedAiContext", None)),
            ("tampered context digest", lambda value: value["approvedAiContext"].__setitem__("contextDigest", "sha256:" + "9" * 64)),
            ("raw behavior context", lambda value: value["approvedAiContext"]["privacyBoundary"].__setitem__("rawBehaviorEntriesIncluded", True)),
            ("wrong context owner", lambda value: value["approvedAiContext"]["ownerReview"].__setitem__("reviewedBy", "Another owner")),
        ):
            with self.subTest(label=label):
                request = managed_trial_request()
                mutate(request)
                with self.assertRaises(ManagedActivationError):
                    compile_activation_plan(
                        request,
                        workspace_id="mingalar-fresh-mart",
                        owner_actor_id=OWNER_ID,
                        approval_id=APPROVAL_ID,
                        approved_by="Swan Htet",
                        approved_at=_fixture_timestamp(5),
                        project_ref=PROJECT_REF,
                        release_commit=RELEASE_COMMIT,
                        admin_ca_sha256=ADMIN_CA_SHA256,
                        now=NOW,
                    )
        forged = activation_plan()
        forged["ownerCapabilities"].append("production.write")
        with self.assertRaises(ManagedActivationError):
            validate_activation_plan(forged)

        tampered_outcome = managed_trial_request()
        tampered_outcome["pilotOutcomeReport"]["current"]["value"] = 2  # type: ignore[index]
        with self.assertRaises(ManagedActivationError):
            compile_activation_plan(
                tampered_outcome,
                workspace_id="mingalar-fresh-mart",
                owner_actor_id=OWNER_ID,
                approval_id=APPROVAL_ID,
                approved_by="Swan Htet",
                approved_at=_fixture_timestamp(5),
                project_ref=PROJECT_REF,
                release_commit=RELEASE_COMMIT,
                admin_ca_sha256=ADMIN_CA_SHA256,
                now=NOW,
            )

    def test_context_reapproval_changes_the_activation_plan_digest(self) -> None:
        request = managed_trial_request()
        first = activation_plan()
        updated = deepcopy(request)
        updated_context = updated["approvedAiContext"]
        updated_context["ownerReview"]["reviewedAt"] = _fixture_timestamp(23)  # type: ignore[index]
        updated_context["contextDigest"] = managed_ai_context_export_digest(updated_context)  # type: ignore[index]
        second = compile_activation_plan(
            updated,
            workspace_id="mingalar-fresh-mart",
            owner_actor_id=OWNER_ID,
            approval_id=APPROVAL_ID,
            approved_by="Swan Htet",
            approved_at=_fixture_timestamp(5),
            project_ref=PROJECT_REF,
            release_commit=RELEASE_COMMIT,
            admin_ca_sha256=ADMIN_CA_SHA256,
            now=NOW,
        )
        self.assertNotEqual(first["evidence"]["approvedContextDigest"], second["evidence"]["approvedContextDigest"])
        self.assertNotEqual(first["planDigest"], second["planDigest"])

    def test_expired_plan_cannot_activate(self) -> None:
        plan = activation_plan()
        with self.assertRaises(ManagedActivationError):
            validate_activation_plan(plan, now=NOW + timedelta(days=8), require_current=True)


class ManagedWorkspaceProvisionerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.database = FakeDatabase()
        self.plan = activation_plan()
        self.provisioner = ManagedWorkspaceProvisioner(
            "postgresql://ignored",
            connection_factory=self.database.connect,
        )

    def authorize(self) -> dict[str, object]:
        return self.provisioner.authorize(
            self.plan,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            decision_note="Owner reviewed the exact workspace, release, and plan digest.",
        )

    def test_revoked_owner_session_cannot_authorize_activation(self) -> None:
        self.database.session_active = False
        with self.assertRaisesRegex(ManagedActivationError, "session is no longer active"):
            self.authorize()
        self.assertEqual(self.database.approvals, [])

    def test_multi_product_plan_applies_one_membership_with_union_capabilities(self) -> None:
        self.plan = compile_multi_product_activation_plan(
            [managed_trial_request_for("shop"), managed_trial_request_for("plant")],
            workspace_id="mingalar-fresh-mart",
            owner_actor_id=OWNER_ID,
            approval_id=APPROVAL_ID,
            approved_by="Swan Htet",
            approved_at=_fixture_timestamp(5),
            project_ref=PROJECT_REF,
            release_commit=RELEASE_COMMIT,
            admin_ca_sha256=ADMIN_CA_SHA256,
            now=NOW,
        )
        self.authorize()
        activated = self.provisioner.apply(self.plan)
        self.assertEqual(activated["contract"], ACTIVATION_RECEIPT_CONTRACT)
        self.assertEqual(len(self.database.memberships), 1)
        capabilities = self.database.memberships[0]["capabilities"]
        self.assertIn("commerce.write", capabilities)
        self.assertIn("production.write", capabilities)
        event = next(iter(self.database.events.values()))
        self.assertEqual(event["payload_json"]["products"], ["shop", "plant"])
        evidence = build_activation_requery_evidence(
            self.plan,
            activated,
            self.provisioner.inspect(self.plan),
            observed_at=NOW,
        )
        self.assertEqual(evidence["activation"]["products"], ["shop", "plant"])

    def test_activation_receipt_requires_a_matching_read_only_database_requery(self) -> None:
        self.authorize()
        receipt = self.provisioner.apply(self.plan)
        inspection = self.provisioner.inspect(self.plan)
        evidence = build_activation_requery_evidence(
            self.plan,
            receipt,
            inspection,
            observed_at=NOW,
        )

        self.assertEqual(evidence["contract"], ACTIVATION_REQUERY_EVIDENCE_CONTRACT)
        self.assertEqual(evidence["status"], "database_activation_verified")
        self.assertEqual(evidence["activation"]["receiptDigest"], receipt["projectionDigest"])
        self.assertEqual(evidence["activation"]["products"], ["shop"])
        self.assertEqual(
            evidence["activation"]["ownerApprovalDigest"],
            f"sha256:{sha256(APPROVAL_ID.encode('utf-8')).hexdigest()}",
        )
        self.assertEqual(evidence["proofs"]["databaseMutationStatementsExecuted"], 0)
        self.assertTrue(evidence["controls"]["hostedDatabaseReadPerformed"])
        self.assertTrue(evidence["controls"]["databaseReadOnly"])
        self.assertFalse(evidence["controls"]["portalSmokePerformed"])
        self.assertFalse(evidence["controls"]["activationMutationPerformedByThisCommand"])
        self.assertEqual(
            evidence["remainingGates"],
            [
                "exact_release_live_verification_required",
                "named_owner_portal_smoke_required",
                "cross_tenant_denial_smoke_required",
            ],
        )

        tampered_receipt = deepcopy(receipt)
        tampered_receipt["workspaceId"] = "another-workspace"
        with self.assertRaisesRegex(ManagedActivationError, "does not match"):
            validate_activation_receipt(tampered_receipt, self.plan)
        with self.assertRaisesRegex(ManagedActivationError, "exact active tenant"):
            build_activation_requery_evidence(
                self.plan,
                receipt,
                {**inspection, "membershipCount": 2},
                observed_at=NOW,
            )

    def test_apply_replay_suspend_and_suspension_replay_are_idempotent(self) -> None:
        preflight = self.provisioner.inspect(self.plan)
        self.assertEqual(preflight["status"], "authorization_required")
        self.assertEqual(preflight["mutationStatementsExecuted"], 0)
        authorization = self.authorize()
        self.assertFalse(authorization["replayed"])
        proposal = self.database.approvals[0]["proposal_json"]
        self.assertEqual(proposal["contract"], "decision_packet.v1")
        self.assertEqual(
            proposal["subject"],
            {
                "kind": "managed_workspace_activation",
                "id": self.plan["activationId"],
                "version": 1,
            },
        )
        self.assertEqual(len(proposal["claims"]), 4)
        self.assertEqual(
            {claim["id"] for claim in proposal["claims"]},
            {
                "named-owner-authorized-exact-plan",
                "release-and-database-target-bound",
                "source-request-bound",
                "automatic-compensation-authorized",
            },
        )
        self.assertIn(self.plan["rollback"]["authorizationId"], proposal["acceptance"])
        self.assertTrue(all(claim["status"] == "verified" for claim in proposal["claims"]))
        self.assertTrue(self.authorize()["replayed"])
        self.assertEqual(self.provisioner.inspect(self.plan)["status"], "ready_to_apply")

        activated = self.provisioner.apply(self.plan)
        self.assertEqual(activated["contract"], ACTIVATION_RECEIPT_CONTRACT)
        self.assertFalse(activated["replayed"])
        self.assertEqual(len(self.database.memberships), 1)
        self.assertEqual(self.database.access_controls[str(self.plan["workspaceId"])]["status"], "active")
        self.assertEqual(len(self.database.events), 1)
        self.assertFalse(activated["localProjectionTrusted"])
        self.assertEqual(activated["authority"]["verification"], "requery_required")

        replay = self.provisioner.apply(self.plan)
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["activatedAt"], activated["activatedAt"])
        self.assertEqual(len(self.database.memberships), 1)
        self.assertEqual(len(self.database.events), 1)

        suspended = self.provisioner.suspend(
            self.plan,
            suspension_approval_id=self.plan["rollback"]["authorizationId"],
            suspended_by=OWNER_ID,
            reason="Activation compensation after a downstream release gate failure.",
        )
        self.assertEqual(suspended["contract"], SUSPENSION_RECEIPT_CONTRACT)
        self.assertFalse(suspended["replayed"])
        self.assertFalse(suspended["customerDataDeleted"])
        self.assertEqual(self.database.memberships[0]["status"], "suspended")
        self.assertEqual(self.database.access_controls[str(self.plan["workspaceId"])]["status"], "suspended")
        self.assertEqual(len(self.database.events), 2)

        suspension_replay = self.provisioner.suspend(
            self.plan,
            suspension_approval_id=self.plan["rollback"]["authorizationId"],
            suspended_by=OWNER_ID,
            reason="Activation compensation after a downstream release gate failure.",
        )
        self.assertTrue(suspension_replay["replayed"])
        self.assertEqual(len(self.database.events), 2)

    def test_conflicting_membership_blocks_activation_without_writes(self) -> None:
        self.authorize()
        self.database.memberships.append(
            {
                "workspace_id": self.plan["workspaceId"],
                "actor_id": "b90445d0-3eef-45ec-a36d-f093856084b0",
                "actor_kind": "human",
                "status": "active",
                "capabilities": ["company.read"],
            }
        )
        with self.assertRaises(ManagedActivationConflict):
            self.provisioner.apply(self.plan)
        self.assertEqual(len(self.database.memberships), 1)
        self.assertEqual(len(self.database.events), 0)

    def test_runtime_or_nonprivileged_connection_cannot_provision(self) -> None:
        for current_user, privileged in (("supermega_trial_login", True), ("operator", False)):
            with self.subTest(current_user=current_user, privileged=privileged):
                database = FakeDatabase()
                database.current_user = current_user
                database.provisioning_role_privileged = privileged
                provisioner = ManagedWorkspaceProvisioner(
                    "postgresql://ignored",
                    connection_factory=database.connect,
                )
                with self.assertRaises(ManagedActivationError):
                    provisioner.apply(self.plan)
                self.assertEqual(database.memberships, [])
                self.assertEqual(database.events, {})

    def test_apply_requires_durable_owner_authorization(self) -> None:
        with self.assertRaisesRegex(ManagedActivationConflict, "Durable owner authorization"):
            self.provisioner.apply(self.plan)
        self.assertEqual(self.database.memberships, [])
        self.assertEqual(self.database.access_controls, {})

    def test_suspension_cannot_be_attributed_to_a_different_person(self) -> None:
        self.authorize()
        self.provisioner.apply(self.plan)
        with self.assertRaises(ManagedActivationError):
            self.provisioner.suspend(
                self.plan,
                suspension_approval_id=self.plan["rollback"]["authorizationId"],
                suspended_by="b90445d0-3eef-45ec-a36d-f093856084b0",
                reason="Activation compensation after a downstream release gate failure.",
            )
        self.assertEqual(self.database.memberships[0]["status"], "active")

    def test_suspension_requires_the_pre_authorized_compensation_command(self) -> None:
        self.authorize()
        self.provisioner.apply(self.plan)
        with self.assertRaisesRegex(ManagedActivationError, "owner-authorized compensation"):
            self.provisioner.suspend(
                self.plan,
                suspension_approval_id="af2b74cf-4974-4f0f-b3aa-5a7f129a706c",
                suspended_by=OWNER_ID,
                reason="Activation compensation after a downstream release gate failure.",
            )
        with self.assertRaisesRegex(ManagedActivationError, "authorized compensation trigger"):
            self.provisioner.suspend(
                self.plan,
                suspension_approval_id=self.plan["rollback"]["authorizationId"],
                suspended_by=OWNER_ID,
                reason="Unreviewed manual suspension.",
            )
        self.assertEqual(self.database.access_controls[str(self.plan["workspaceId"])]["status"], "active")

    def test_sql_is_static_and_customer_values_are_parameters(self) -> None:
        self.authorize()
        self.provisioner.apply(self.plan)
        statements = "\n".join(statement for statement, _params in self.database.statements)
        self.assertNotIn(str(self.plan["workspaceId"]), statements)
        self.assertNotIn(str(self.plan["ownerActorId"]), statements)
        self.assertIn("pg_advisory_xact_lock", statements)
        self.assertIn("insert into app_private.approval_requests", statements)
        self.assertIn("insert into app_private.workspace_access_controls", statements)
        self.assertIn("insert into app_private.workspace_memberships", statements)
        self.assertIn("insert into app_private.workspace_events", statements)


class ManagedActivationCliTests(unittest.TestCase):
    def test_requery_writes_create_only_read_only_activation_evidence(self) -> None:
        database = FakeDatabase()
        plan = activation_plan()
        provisioner = ManagedWorkspaceProvisioner(
            "postgresql://ignored",
            connection_factory=database.connect,
        )
        provisioner.authorize(
            plan,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            decision_note="Owner reviewed the exact workspace, release, and plan digest.",
        )
        receipt = provisioner.apply(plan)
        inspection = provisioner.inspect(plan)

        class StubProvisioner:
            def __init__(self, _database_url: str) -> None:
                pass

            def inspect(self, _plan: object) -> dict[str, object]:
                return inspection

        with tempfile.TemporaryDirectory() as directory:
            plan_path = Path(directory) / "plan.json"
            receipt_path = Path(directory) / "receipt.json"
            database_url_path = Path(directory) / "admin-url.txt"
            output_path = Path(directory) / "requery.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            database_url_path.write_text(
                "postgresql://postgres:secret@db.example.invalid:5432/postgres?sslmode=require",
                encoding="utf-8",
            )
            output = io.StringIO()
            with (
                mock.patch("supermega_runtime.managed_activation._validate_admin_target"),
                mock.patch("supermega_runtime.managed_activation.ManagedWorkspaceProvisioner", StubProvisioner),
                contextlib.redirect_stdout(output),
            ):
                exit_code = main(
                    [
                        "requery",
                        "--plan-file", str(plan_path),
                        "--database-url-file", str(database_url_path),
                        "--receipt-file", str(receipt_path),
                        "--output", str(output_path),
                    ]
                )
            result = json.loads(output.getvalue())
            evidence = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 0)
            self.assertEqual(result["status"], "database_activation_verified")
            self.assertEqual(result["remainingGateCount"], 3)
            self.assertNotIn("workspaceId", result)
            self.assertNotIn("ownerActorId", result)
            self.assertEqual(evidence["contract"], ACTIVATION_REQUERY_EVIDENCE_CONTRACT)
            self.assertFalse(evidence["controls"]["tenantWritesPerformed"])

            with (
                mock.patch("supermega_runtime.managed_activation._validate_admin_target"),
                mock.patch("supermega_runtime.managed_activation.ManagedWorkspaceProvisioner", StubProvisioner),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                second_exit_code = main(
                    [
                        "requery",
                        "--plan-file", str(plan_path),
                        "--database-url-file", str(database_url_path),
                        "--receipt-file", str(receipt_path),
                        "--output", str(output_path),
                    ]
                )
            self.assertEqual(second_exit_code, 1)

    def test_pre_authorized_compensation_does_not_depend_on_mutable_release_aliases(self) -> None:
        class StubProvisioner:
            def __init__(self, _database_url: str) -> None:
                pass

            def suspend(self, _plan: object, **_kwargs: object) -> dict[str, object]:
                return {"status": "suspended", "replayed": False}

        with tempfile.TemporaryDirectory() as directory:
            plan = activation_plan()
            plan_path = Path(directory) / "plan.json"
            database_url_path = Path(directory) / "admin-url.txt"
            receipt_path = Path(directory) / "receipt.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            database_url_path.write_text(
                "postgresql://postgres:secret@db.example.invalid:5432/postgres?sslmode=require",
                encoding="utf-8",
            )
            with (
                mock.patch("supermega_runtime.managed_activation._validate_admin_target"),
                mock.patch("supermega_runtime.managed_activation._require_release_checkout") as provenance,
                mock.patch("supermega_runtime.managed_activation.ManagedWorkspaceProvisioner", StubProvisioner),
                mock.patch("supermega_runtime.managed_activation._write_receipt"),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                exit_code = main(
                    [
                        "suspend",
                        "--plan-file",
                        str(plan_path),
                        "--database-url-file",
                        str(database_url_path),
                        "--confirm-owner-approval",
                        APPROVAL_ID,
                        "--production-handoff",
                        "--receipt-file",
                        str(receipt_path),
                        "--suspension-approval-id",
                        str(plan["rollback"]["authorizationId"]),
                        "--suspended-by",
                        OWNER_ID,
                        "--reason",
                        "Activation compensation after a downstream release gate failure.",
                    ]
                )
            self.assertEqual(exit_code, 0)
            provenance.assert_not_called()

    def test_apply_reports_committed_mutation_when_local_receipt_write_fails(self) -> None:
        class StubProvisioner:
            def __init__(self, _database_url: str) -> None:
                pass

            def apply(self, _plan: object) -> dict[str, object]:
                return {"status": "active", "replayed": False}

        with tempfile.TemporaryDirectory() as directory:
            plan_path = Path(directory) / "plan.json"
            database_url_path = Path(directory) / "admin-url.txt"
            receipt_path = Path(directory) / "receipt.json"
            plan_path.write_text(json.dumps(activation_plan()), encoding="utf-8")
            database_url_path.write_text(
                "postgresql://postgres:secret@db.example.invalid:5432/postgres?sslmode=require",
                encoding="utf-8",
            )
            output = io.StringIO()
            with (
                mock.patch("supermega_runtime.managed_activation._validate_admin_target"),
                mock.patch("supermega_runtime.managed_activation._require_release_checkout"),
                mock.patch("supermega_runtime.managed_activation.ManagedWorkspaceProvisioner", StubProvisioner),
                mock.patch(
                    "supermega_runtime.managed_activation._write_receipt",
                    side_effect=ManagedActivationError("simulated local receipt failure"),
                ),
                contextlib.redirect_stdout(output),
            ):
                exit_code = main(
                    [
                        "apply",
                        "--plan-file",
                        str(plan_path),
                        "--database-url-file",
                        str(database_url_path),
                        "--confirm-owner-approval",
                        APPROVAL_ID,
                        "--production-handoff",
                        "--receipt-file",
                        str(receipt_path),
                    ]
                )
            result = json.loads(output.getvalue().strip().splitlines()[-1])
            self.assertEqual(exit_code, 1)
            self.assertTrue(result["externalMutationPerformed"])
            self.assertEqual(result["status"], "blocked")

    def test_remote_admin_target_requires_hostname_verification_and_reviewed_ca(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            certificate = Path(directory) / "supabase-ca.crt"
            certificate.write_text(
                "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n",
                encoding="ascii",
            )
            certificate_digest = f"sha256:{sha256(certificate.read_bytes()).hexdigest()}"
            base = f"postgresql://postgres:secret@db.{PROJECT_REF}.supabase.co:5432/postgres"
            with self.assertRaisesRegex(ManagedActivationError, "sslmode=verify-full"):
                _validate_admin_target(f"{base}?sslmode=require", PROJECT_REF, certificate_digest)
            with self.assertRaisesRegex(ManagedActivationError, "sslmode=verify-full"):
                _validate_admin_target(f"{base}?sslmode=verify-full", PROJECT_REF, certificate_digest)
            reviewed_url = f"{base}?sslmode=verify-full&sslrootcert={quote(str(certificate), safe='')}"
            with self.assertRaisesRegex(ManagedActivationError, "owner-reviewed activation plan"):
                _validate_admin_target(reviewed_url, PROJECT_REF, "sha256:" + "0" * 64)
            _validate_admin_target(
                reviewed_url,
                PROJECT_REF,
                certificate_digest,
            )

    def test_prepare_command_writes_only_a_sanitized_plan(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            request_path = Path(directory) / "request.json"
            output_path = Path(directory) / "plan.json"
            certificate_path = Path(directory) / "supabase-ca.crt"
            request_path.write_text(json.dumps(managed_trial_request()), encoding="utf-8")
            certificate_path.write_text(
                "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n",
                encoding="ascii",
            )
            result = main(
                [
                    "prepare",
                    "--request-file",
                    str(request_path),
                    "--workspace-id",
                    "mingalar-fresh-mart",
                    "--owner-actor-id",
                    OWNER_ID,
                    "--approval-id",
                    APPROVAL_ID,
                    "--approved-by",
                    "Swan Htet",
                    "--approved-at",
                    datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    "--project-ref",
                    PROJECT_REF,
                    "--release-commit",
                    RELEASE_COMMIT,
                    "--admin-ca-file",
                    str(certificate_path),
                    "--output",
                    str(output_path),
                ]
            )
            self.assertEqual(result, 0)
            plan = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(plan["contract"], ACTIVATION_PLAN_CONTRACT)
            self.assertFalse(plan["secretValuesExposed"])

    def test_prepare_command_accepts_four_reviewed_products_for_one_tenant(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request_paths = []
            for product in ("shop", "plant", "website", "ecommerce"):
                path = root / f"{product}.json"
                path.write_text(
                    json.dumps(managed_trial_request_for(product)),
                    encoding="utf-8",
                )
                request_paths.append(path)
            output_path = root / "tenant-plan.json"
            certificate_path = root / "supabase-ca.crt"
            certificate_path.write_text(
                "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n",
                encoding="ascii",
            )
            arguments = ["prepare"]
            for request_path in request_paths:
                arguments.extend(("--request-file", str(request_path)))
            arguments.extend(
                (
                    "--workspace-id", "mingalar-fresh-mart",
                    "--owner-actor-id", OWNER_ID,
                    "--approval-id", APPROVAL_ID,
                    "--approved-by", "Swan Htet",
                    "--approved-at", datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    "--project-ref", PROJECT_REF,
                    "--release-commit", RELEASE_COMMIT,
                    "--admin-ca-file", str(certificate_path),
                    "--output", str(output_path),
                )
            )
            self.assertEqual(main(arguments), 0)
            plan = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(plan["contract"], MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT)
            self.assertEqual(plan["products"], ["shop", "plant", "website", "ecommerce"])
            self.assertEqual(len(plan["sourcePlans"]), 4)
            self.assertIn("commerce.write", plan["ownerCapabilities"])
            self.assertIn("production.write", plan["ownerCapabilities"])
            self.assertIn("website.write", plan["ownerCapabilities"])


if __name__ == "__main__":
    unittest.main()
