from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.plant_equipment_import import (
    PLANT_EQUIPMENT_IMPORT_SCHEMA,
    PlantEquipmentImportError,
    validate_plant_equipment_import,
)
from supermega_runtime.production_runtime import (
    reduce_production_state,
    validate_production_state,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialPrincipal,
    TrialValidationError,
)


SAMPLE_CSV = (
    "equipment_id,name,work_centre_id,criticality\n"
    "EQ-MIX-01,Rubber mixer,WC-MIXING,critical\n"
    "EQ-PRESS-02,Curing press,WC-CURING,high\n"
)


def _package() -> dict[str, object]:
    return {
        "contract": PLANT_EQUIPMENT_IMPORT_SCHEMA,
        "workspace": "Golden Manufacturing",
        "owner": "Plant engineering owner",
        "source": {
            "name": "equipment.csv",
            "digest": f"sha256:{sha256(SAMPLE_CSV.encode('utf-8')).hexdigest()}",
        },
        "rows": [
            {
                "sourceRow": 2,
                "key": "EQ-MIX-01",
                "values": {
                    "equipmentId": "EQ-MIX-01",
                    "name": "Rubber mixer",
                    "workCentreId": "WC-MIXING",
                    "criticality": "critical",
                },
            },
            {
                "sourceRow": 3,
                "key": "EQ-PRESS-02",
                "values": {
                    "equipmentId": "EQ-PRESS-02",
                    "name": "Curing press",
                    "workCentreId": "WC-CURING",
                    "criticality": "high",
                },
            },
        ],
        "controls": {
            "rowCount": 2,
            "humanReviewRequired": True,
            "externalWritesPerformed": False,
            "commissioningPerformed": False,
            "activationStatus": "staged_not_applied",
        },
    }


def _opening_state() -> dict[str, object]:
    digest = f"sha256:{'a' * 64}"
    confirmed_at = "2026-07-30T06:00:00.000Z"
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-OPEN-1",
                "line": "Line A",
                "product": "Opening batch",
                "target": 100,
                "output": 0,
                "owner": "Plant owner",
                "priority": "normal",
                "dueAt": "2099-08-15T17:29:59.999Z",
            }
        ],
        "issues": [],
        "machines": [],
        "events": [],
        "openingPlan": {
            "contract": "supermega.production.opening-plan.v1",
            "packageDigest": digest,
            "confirmedAt": confirmed_at,
            "industryPackId": "general-manufacturing",
            "jobIds": ["JOB-OPEN-1"],
            "machineIds": [],
        },
    }


def _equipment_payload(package_digest: str) -> dict[str, object]:
    return {
        "equipment": [
            {
                "id": "EQ-MIX-01",
                "name": "Rubber mixer",
                "workCentreId": "WC-MIXING",
                "criticality": "critical",
                "owner": "Plant engineering owner",
            },
            {
                "id": "EQ-PRESS-02",
                "name": "Curing press",
                "workCentreId": "WC-CURING",
                "criticality": "high",
                "owner": "Plant engineering owner",
            },
        ],
        "evidence": {
            "actionId": "ACT-EQUIPMENT-IMPORT-00000000-0000-4000-8000-000000000301",
            "capturedAt": "2026-07-30T07:00:00.000Z",
            "actor": "plant-owner",
            "reason": "Imported reviewed Plant equipment master",
            "evidenceReference": package_digest,
        },
    }


class PlantEquipmentImportValidatorTests(unittest.TestCase):
    def test_package_is_canonical_digest_bound_and_zero_commissioning(self) -> None:
        validation, canonical = validate_plant_equipment_import(_package())
        self.assertRegex(validation.package_digest, r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(validation.row_count, 2)
        self.assertEqual(canonical["controls"]["commissioningPerformed"], False)
        self.assertEqual(validation.to_dict()["activation"]["commissioning_performed"], False)

        reordered = json.loads(json.dumps(_package()))
        reordered = {key: reordered[key] for key in reversed(tuple(reordered))}
        reordered_validation, _ = validate_plant_equipment_import(reordered)
        self.assertEqual(reordered_validation.package_digest, validation.package_digest)

    def test_unsafe_identity_duplicates_and_commissioning_claims_fail(self) -> None:
        cases: list[dict[str, object]] = []
        unsafe = deepcopy(_package())
        unsafe["rows"][0]["values"]["equipmentId"] = "=CMD()"
        unsafe["rows"][0]["key"] = "=CMD()"
        cases.append(unsafe)
        duplicate = deepcopy(_package())
        duplicate["rows"][1]["values"]["equipmentId"] = "EQ-MIX-01"
        duplicate["rows"][1]["key"] = "EQ-MIX-01"
        cases.append(duplicate)
        commissioned = deepcopy(_package())
        commissioned["controls"]["commissioningPerformed"] = True
        cases.append(commissioned)
        extra = deepcopy(_package())
        extra["rows"][0]["values"]["state"] = "running"
        cases.append(extra)
        for candidate in cases:
            with self.subTest(candidate=candidate):
                with self.assertRaises(PlantEquipmentImportError):
                    validate_plant_equipment_import(candidate)


class PlantEquipmentProductionRuntimeTests(unittest.TestCase):
    def test_import_adds_master_records_and_one_event_without_runtime_machines(self) -> None:
        validation, _ = validate_plant_equipment_import(_package())
        current = validate_production_state(_opening_state())
        next_state = reduce_production_state(
            "production.equipment_master.imported",
            current,
            _equipment_payload(validation.package_digest),
        )
        self.assertEqual(next_state["revision"], 1)
        self.assertEqual(next_state["machines"], [])
        self.assertEqual(next_state["jobs"], current["jobs"])
        self.assertEqual(next_state["issues"], current["issues"])
        self.assertEqual(next_state["openingPlan"], current["openingPlan"])
        self.assertEqual(
            [asset["id"] for asset in next_state["equipmentMaster"]["assets"]],
            ["EQ-MIX-01", "EQ-PRESS-02"],
        )
        self.assertTrue(
            all(
                asset["commissioningStatus"] == "not_commissioned"
                for asset in next_state["equipmentMaster"]["assets"]
            )
        )
        self.assertEqual(next_state["events"][0]["kind"], "equipment_master_imported")

    def test_tampering_and_duplicate_or_machine_identity_fail_closed(self) -> None:
        validation, _ = validate_plant_equipment_import(_package())
        current = validate_production_state(_opening_state())
        state = reduce_production_state(
            "production.equipment_master.imported",
            current,
            _equipment_payload(validation.package_digest),
        )
        tampered = deepcopy(state)
        tampered["equipmentMaster"]["assets"][0]["commissioningStatus"] = "commissioned"
        with self.assertRaises(TrialValidationError):
            validate_production_state(tampered)
        invented_machine = deepcopy(state)
        invented_machine["machines"] = [
            {"id": "EQ-MIX-01", "name": "Rubber mixer", "state": "running"}
        ]
        invented_machine["openingPlan"]["machineIds"] = ["EQ-MIX-01"]
        with self.assertRaises(TrialValidationError):
            validate_production_state(invented_machine)
        duplicate_payload = _equipment_payload(validation.package_digest)
        duplicate_payload["evidence"]["actionId"] = (
            "ACT-EQUIPMENT-IMPORT-00000000-0000-4000-8000-000000000302"
        )
        with self.assertRaises(TrialValidationError):
            reduce_production_state(
                "production.equipment_master.imported",
                state,
                duplicate_payload,
            )


class PlantEquipmentImportRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.writer = TrialPrincipal(
            workspace_id="workspace-equipment",
            actor_id="plant-owner",
            actor_kind="human",
        )
        self.reader = TrialPrincipal(
            workspace_id="workspace-equipment",
            actor_id="setup-reader",
            actor_kind="human",
        )
        self.sessions = {"writer": self.writer, "reader": self.reader}
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        self.store.provision_membership(
            workspace_id=self.writer.workspace_id,
            actor_id=self.writer.actor_id,
            actor_kind="human",
            capabilities=("setup.write", "production.write"),
        )
        self.store.provision_membership(
            workspace_id=self.reader.workspace_id,
            actor_id=self.reader.actor_id,
            actor_kind="human",
            capabilities=("setup.read",),
        )
        opening = _opening_state()
        opening["openingPlan"]["confirmedAt"] = "server-assigned"
        self.store.apply_command(
            self.writer,
            command_id="00000000-0000-4000-8000-000000000300",
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={
                "state": opening,
                "evidence": {
                    "actionId": "ACT-PLANT-OPENING",
                    "capturedAt": "server-assigned",
                    "actor": self.writer.actor_id,
                    "reason": "Initialized reviewed Plant jobs",
                    "evidenceReference": opening["openingPlan"]["packageDigest"],
                },
            },
        )

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(store=self.store, resolve_principal=resolve_principal)
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_review_apply_and_exact_replay_are_atomic_and_zero_commissioning(self) -> None:
        package = _package()
        validation_response = self.client.post(
            "/api/trial/v1/imports/plant-equipment/validate",
            headers={"x-test-session": "reader"},
            json=package,
        )
        self.assertEqual(validation_response.status_code, 200)
        validation = validation_response.json()["validation"]
        self.assertEqual(validation["workspace_id"], self.writer.workspace_id)
        self.assertFalse(validation["activation"]["commissioning_performed"])
        self.assertEqual(len(self.store._events), 1)

        body = {
            "command_id": "00000000-0000-4000-8000-000000000301",
            "expected_version": 1,
            "confirmation": f"APPLY {validation['package_digest']}",
            "package": package,
        }
        applied = self.client.post(
            "/api/trial/v1/imports/plant-equipment/apply",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(applied.status_code, 200, applied.text)
        response = applied.json()
        self.assertEqual(response["result"]["version"], 2)
        self.assertFalse(response["result"]["idempotent_replay"])
        self.assertFalse(response["activation"]["commissioning_performed"])
        state = response["result"]["state"]
        self.assertEqual(state["machines"], [])
        self.assertEqual(len(state["equipmentMaster"]["assets"]), 2)
        self.assertNotEqual(state["equipmentMaster"]["assets"][0]["importedAt"], "server-assigned")
        self.assertEqual(state["events"][0]["actor"], self.writer.actor_id)
        self.assertEqual(len(self.store._events), 2)

        replay = self.client.post(
            "/api/trial/v1/imports/plant-equipment/apply",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(replay.json()["result"]["state"], state)
        self.assertEqual(len(self.store._events), 2)

    def test_direct_agent_equipment_import_is_rejected_by_store(self) -> None:
        agent = TrialPrincipal(
            workspace_id=self.writer.workspace_id,
            actor_id="plant-agent",
            actor_kind="agent",
        )
        self.store.provision_membership(
            workspace_id=agent.workspace_id,
            actor_id=agent.actor_id,
            actor_kind="agent",
            capabilities=("setup.write", "production.write"),
        )
        validation, _ = validate_plant_equipment_import(_package())
        payload = _equipment_payload(validation.package_digest)
        payload["evidence"]["actor"] = agent.actor_id
        with self.assertRaises(TrialHumanApprovalRequired):
            self.store.apply_command(
                agent,
                command_id="00000000-0000-4000-8000-000000000399",
                surface="production",
                event_type="production.equipment_master.imported",
                expected_version=1,
                payload=payload,
            )


if __name__ == "__main__":
    unittest.main()
