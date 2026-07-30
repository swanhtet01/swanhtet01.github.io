from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.managed_context import (
    MANAGED_CONTEXT_ALLOWED_USES,
    MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
    build_managed_context_profile,
    company_state_with_context_profile,
    managed_ai_context_export_digest,
    managed_context_from_company_state,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialValidationError


def context_package() -> dict[str, object]:
    body: dict[str, object] = {
        "contract": "supermega.ai_context_export.v1",
        "version": 1,
        "product": "shop",
        "templateId": "social-commerce",
        "sourceCounts": {
            "selectedProductRecords": 7,
            "behaviorSignals": 3,
            "reviewedDecisions": 1,
        },
        "behaviorPreference": {
            "product": "commerce",
            "chosenCount": 2,
        },
        "outcome": {
            "status": "improved",
            "digest": "sha256:" + "b" * 64,
            "accepted": True,
        },
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "handoff": {"route": "managed_activation_review", "activationRequired": True},
        "ownerReview": {
            "status": "approved_for_managed_review",
            "reviewedBy": "Business owner",
            "reviewedAt": "2026-07-30T12:00:00.000Z",
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


def redigest(package: dict[str, object]) -> dict[str, object]:
    package["contextDigest"] = managed_ai_context_export_digest(package)
    return package


class ManagedContextUnitTests(unittest.TestCase):
    def test_profile_is_deterministic_tenant_and_actor_bound_and_summary_only(self) -> None:
        package = context_package()
        first = build_managed_context_profile(package, workspace_id="workspace-a", actor_id="owner-a")
        second = build_managed_context_profile(package, workspace_id="workspace-a", actor_id="owner-a")
        other_actor = build_managed_context_profile(package, workspace_id="workspace-a", actor_id="owner-b")
        other_tenant = build_managed_context_profile(package, workspace_id="workspace-b", actor_id="owner-a")

        self.assertEqual(first, second)
        self.assertRegex(str(first["profileDigest"]), r"^sha256:[0-9a-f]{64}$")
        self.assertNotEqual(first["profileDigest"], other_actor["profileDigest"])
        self.assertNotEqual(first["profileDigest"], other_tenant["profileDigest"])
        self.assertEqual(first["contract"], "supermega.managed_context_profile.v2")
        self.assertEqual(first["approvedContextDigest"], package["contextDigest"])
        self.assertEqual(first["outcome"]["digest"], package["outcome"]["digest"])
        self.assertEqual(first["rawProductRecordsIncluded"], False)
        self.assertEqual(first["rawBehaviorEntriesIncluded"], False)
        self.assertEqual(first["rawDecisionRecordsIncluded"], False)
        self.assertEqual(first["modelTrainingAllowed"], False)
        self.assertNotIn("customerRows", str(first))

    def test_context_contract_rejects_extra_fields_raw_rows_training_and_incomplete_proof(self) -> None:
        cases = []
        extra = context_package()
        extra["customerRows"] = [{"name": "Must not cross the boundary"}]
        cases.append(extra)
        training = context_package()
        training["privacyBoundary"]["modelTrainingAllowed"] = True
        cases.append(training)
        raw = context_package()
        raw["privacyBoundary"]["rawProductRecordsIncluded"] = True
        cases.append(raw)
        no_decision = context_package()
        no_decision["sourceCounts"]["reviewedDecisions"] = 0
        cases.append(no_decision)
        expanded_use = context_package()
        expanded_use["allowedUses"].append("send_customer_messages")
        cases.append(expanded_use)
        reordered_boundary = context_package()
        reordered_boundary["forbiddenActions"].reverse()
        cases.append(reordered_boundary)
        arbitrary_template = context_package()
        arbitrary_template["templateId"] = "customer-entered-secret"
        cases.append(arbitrary_template)
        free_form_behavior = context_package()
        free_form_behavior["behaviorPreference"]["detail"] = "Must never be retained"
        cases.append(free_form_behavior)
        control_character = context_package()
        control_character["templateId"] = "social-commerce\nprivate"
        cases.append(control_character)
        tampered_digest = context_package()
        tampered_digest["contextDigest"] = "sha256:" + "c" * 64
        cases.append(tampered_digest)
        unaccepted = context_package()
        unaccepted["outcome"]["accepted"] = False
        cases.append(unaccepted)

        for case in cases:
            with self.subTest(case=case):
                with self.assertRaises(TrialValidationError):
                    build_managed_context_profile(case, workspace_id="workspace-a", actor_id="owner-a")

    def test_company_state_retains_latest_profile_and_bounded_receipt_without_clobbering_history(self) -> None:
        profile = build_managed_context_profile(context_package(), workspace_id="workspace-a", actor_id="owner-a")
        current = {"tasks": [{"id": "TASK-1"}], "briefReceipts": [{"briefDigest": "sha256:" + "a" * 64}]}
        retained = company_state_with_context_profile(current, profile)
        replay = company_state_with_context_profile(retained, profile)

        self.assertEqual(retained["tasks"], current["tasks"])
        self.assertEqual(retained["briefReceipts"], current["briefReceipts"])
        self.assertEqual(retained["managedContextProfile"], profile)
        self.assertEqual(len(retained["managedContextReceipts"]), 1)
        self.assertEqual(replay, retained)

    def test_receipt_history_rolls_over_and_cross_tenant_profile_fails_closed(self) -> None:
        state: dict[str, object] = {"tasks": [], "briefReceipts": []}
        for index in range(35):
            package = context_package()
            package["sourceCounts"]["selectedProductRecords"] = index + 1
            redigest(package)
            profile = build_managed_context_profile(package, workspace_id="workspace-a", actor_id="owner-a")
            state = company_state_with_context_profile(state, profile)
        self.assertEqual(len(state["managedContextReceipts"]), 30)
        self.assertEqual(state["managedContextProfile"]["sourceCounts"]["selectedProductRecords"], 35)
        self.assertIsNotNone(managed_context_from_company_state(state, workspace_id="workspace-a"))
        self.assertIsNone(managed_context_from_company_state(state, workspace_id="workspace-b"))

        malformed = deepcopy(state)
        malformed["managedContextReceipts"] = [
            {"rawCustomerRows": [{"secret": "must not survive"}]},
            *malformed["managedContextReceipts"],
        ]
        next_package = context_package()
        next_package["sourceCounts"]["selectedProductRecords"] = 40
        redigest(next_package)
        next_profile = build_managed_context_profile(next_package, workspace_id="workspace-a", actor_id="owner-a")
        recovered = company_state_with_context_profile(malformed, next_profile)
        self.assertEqual(len(recovered["managedContextReceipts"]), 30)
        self.assertNotIn("rawCustomerRows", str(recovered["managedContextReceipts"]))

    def test_legacy_profile_remains_read_only_compatible(self) -> None:
        legacy_request = {
            "product": "shop",
            "templateId": "social-commerce",
            "sourceCounts": {"selectedProductRecords": 2, "behaviorSignals": 2, "reviewedDecisions": 1},
            "behaviorPreference": {"product": "commerce", "chosenCount": 2},
        }
        projection = [
            "supermega.managed_context_profile.v1", 1, "workspace-a", "owner-a",
            legacy_request["product"], legacy_request["templateId"], 2, 2, 1, "commerce", 2,
            *MANAGED_CONTEXT_ALLOWED_USES, "|", *MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
        ]
        profile = {
            "contract": "supermega.managed_context_profile.v1",
            "version": 1,
            "workspaceId": "workspace-a",
            "retainedBy": "owner-a",
            **legacy_request,
            "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
            "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
            "profileDigest": "sha256:" + sha256(json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest(),
            "rawProductRecordsIncluded": False,
            "modelTrainingAllowed": False,
        }
        retained = managed_context_from_company_state({"managedContextProfile": profile}, workspace_id="workspace-a")
        self.assertEqual(retained, profile)


class ManagedContextRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        sessions = {
            "human": TrialPrincipal("workspace-a", "owner-a", "human"),
            "agent": TrialPrincipal("workspace-a", "agent-a", "agent"),
            "writer": TrialPrincipal("workspace-a", "writer-a", "human"),
            "limited": TrialPrincipal("workspace-a", "viewer-a", "human"),
        }
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="owner-a",
            actor_kind="human",
            capabilities=("company.control.approve", "company.write"),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="agent-a",
            actor_kind="agent",
            capabilities=("company.write",),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="writer-a",
            actor_kind="human",
            capabilities=("company.write",),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="viewer-a",
            actor_kind="human",
            capabilities=("company.read",),
        )

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=resolve_principal))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def validate(self, session: str = "human", package: dict[str, object] | None = None):
        return self.client.post(
            "/api/trial/v1/managed-context/validate",
            headers={"x-test-session": session},
            json={"package": package or context_package()},
        )

    def test_zero_write_validation_then_human_retention_is_audited_and_idempotent(self) -> None:
        before = deepcopy((self.store._states, self.store._events))
        validation = self.validate()
        self.assertEqual(validation.status_code, 200)
        payload = validation.json()
        self.assertEqual(payload["validation"]["contract"], "supermega.managed_context_profile_validation.v2")
        self.assertEqual(payload["validation"]["companyVersion"], 0)
        self.assertEqual(payload["validation"]["internalWritePerformed"], False)
        self.assertEqual(payload["validation"]["externalWritesPerformed"], False)
        self.assertEqual((self.store._states, self.store._events), before)

        command_id = str(uuid4())
        body = {
            "command_id": command_id,
            "expected_company_version": 0,
            "profile_digest": payload["profile"]["profileDigest"],
            "validation_digest": payload["validation"]["validationDigest"],
            "package": context_package(),
        }
        retained = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=body,
        )
        self.assertEqual(retained.status_code, 200)
        retained_payload = retained.json()
        self.assertEqual(retained_payload["retention"]["contract"], "supermega.managed_context_profile_retention.v2")
        self.assertEqual(retained_payload["retention"]["companyVersion"], 1)
        self.assertEqual(retained_payload["retention"]["internalWritePerformed"], True)
        self.assertEqual(retained_payload["retention"]["externalWritesPerformed"], False)
        self.assertEqual(retained_payload["result"]["state"]["managedContextProfile"]["retainedBy"], "owner-a")
        self.assertEqual(len(retained_payload["result"]["state"]["managedContextReceipts"]), 1)
        receipt = retained_payload["result"]["state"]["managedContextReceipts"][0]
        self.assertEqual(receipt["approvedContextDigest"], context_package()["contextDigest"])
        self.assertEqual(receipt["acceptedOutcomeDigest"], context_package()["outcome"]["digest"])
        self.assertNotIn("customerRows", str(receipt))

        replay = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["result"]["version"], 1)
        self.assertEqual(replay.json()["retention"]["idempotentReplay"], True)

        changed_package = context_package()
        changed_package["sourceCounts"]["selectedProductRecords"] = 8
        redigest(changed_package)
        changed_validation = self.validate(package=changed_package).json()
        conflicting_replay = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json={
                "command_id": command_id,
                "expected_company_version": 1,
                "profile_digest": changed_validation["profile"]["profileDigest"],
                "validation_digest": changed_validation["validation"]["validationDigest"],
                "package": changed_package,
            },
        )
        self.assertEqual(conflicting_replay.status_code, 409)
        self.assertEqual(conflicting_replay.json()["detail"]["code"], "trial_idempotency_conflict")

        brief = self.client.post(
            "/api/trial/v1/company-brief",
            headers={"x-test-session": "human"},
            json={"intent": "attention"},
        )
        self.assertEqual(brief.status_code, 200)
        self.assertEqual(
            brief.json()["brief"]["ownerContext"]["profileDigest"],
            payload["profile"]["profileDigest"],
        )
        self.assertEqual(
            set(brief.json()["brief"]["ownerContext"]),
            {"contract", "version", "profileDigest", "approvedContextDigest", "acceptedOutcomeDigest", "preferredProduct"},
        )

    def test_legacy_counts_only_package_cannot_create_new_managed_memory(self) -> None:
        approved = context_package()
        legacy = {
            "contract": "supermega.managed_context_profile_request.v1",
            "version": 1,
            "product": approved["product"],
            "templateId": approved["templateId"],
            "sourceCounts": approved["sourceCounts"],
            "behaviorPreference": approved["behaviorPreference"],
            "allowedUses": approved["allowedUses"],
            "forbiddenActions": approved["forbiddenActions"],
            "ownerApproved": True,
            "rawProductRecordsIncluded": False,
            "modelTrainingAllowed": False,
        }
        response = self.validate(package=legacy)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "trial_validation_error")

    def test_tamper_stale_version_agent_and_missing_capability_fail_closed(self) -> None:
        validation = self.validate().json()
        base = {
            "command_id": str(uuid4()),
            "expected_company_version": 0,
            "profile_digest": validation["profile"]["profileDigest"],
            "validation_digest": validation["validation"]["validationDigest"],
            "package": context_package(),
        }
        tampered = deepcopy(base)
        tampered["profile_digest"] = "sha256:" + "a" * 64
        changed = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=tampered,
        )
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(changed.json()["detail"]["code"], "managed_context_profile_changed")

        invalid_validation = deepcopy(base)
        invalid_validation["validation_digest"] = "sha256:" + "b" * 64
        invalid_validation_response = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=invalid_validation,
        )
        self.assertEqual(invalid_validation_response.status_code, 409)
        self.assertEqual(invalid_validation_response.json()["detail"]["code"], "managed_context_validation_changed")

        agent_validate = self.validate("agent")
        self.assertEqual(agent_validate.status_code, 403)
        self.assertEqual(agent_validate.json()["detail"]["code"], "trial_human_approval_required")
        limited_validate = self.validate("limited")
        self.assertEqual(limited_validate.status_code, 403)
        self.assertEqual(limited_validate.json()["detail"]["code"], "trial_capability_required")

        writer_retain = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "writer"},
            json=base,
        )
        self.assertEqual(writer_retain.status_code, 403)
        self.assertEqual(writer_retain.json()["detail"]["required_capability"], "company.control.approve")

        retained = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=base,
        )
        self.assertEqual(retained.status_code, 200)
        stale = deepcopy(base)
        stale["command_id"] = str(uuid4())
        stale["profile_digest"] = validation["profile"]["profileDigest"]
        stale_response = self.client.post(
            "/api/trial/v1/managed-context/retain",
            headers={"x-test-session": "human"},
            json=stale,
        )
        self.assertEqual(stale_response.status_code, 409)
        self.assertEqual(stale_response.json()["detail"]["code"], "trial_version_conflict")


if __name__ == "__main__":
    unittest.main()
