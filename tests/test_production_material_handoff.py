from __future__ import annotations

from copy import deepcopy
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.plant_order_foundation import (
    check_plant_order_availability,
    issue_plant_order_material,
    plant_order_evidence_digest,
    record_plant_order_operation,
    release_plant_order,
)
from supermega_runtime.production_material_handoff import (
    production_material_requests,
    require_shop_issue_before_plant_progress,
    require_shop_issue_matches_plant,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialPrincipal,
    TrialState,
    TrialValidationError,
)
from tests.test_commerce_runtime import catalog_state, movement
from tests.test_production_runtime import (
    action_evidence,
    planned_order_execution,
    starting_workspace,
)
from tests.test_shop_inventory_runtime import (
    opening_inventory,
    production_issue_movement,
    production_issued_inventory,
    production_returned_inventory,
)


def issued_production() -> dict[str, object]:
    production = starting_workspace(target=10)
    execution = planned_order_execution(
        production,
        action_evidence("ACT-HANDOFF-PLAN-001"),
    )
    execution = check_plant_order_availability(
        execution,
        check_id="CHK-HANDOFF-001",
        source_digest=plant_order_evidence_digest({"warehouse": "observed"}),
        materials=[
            {
                "materialId": "MAT-MANAGED-001",
                "inputLotId": "LOT-MANAGED-001",
                "availableQuantityMilli": 10_000,
            }
        ],
        work_centres=[
            {"workCentreId": "WC-MANAGED-001", "availableMinutes": 10}
        ],
        proof=action_evidence(
            "ACT-HANDOFF-CHECK-001",
            captured_at="2026-07-24T09:15:00.000Z",
        ),
        expected_head_digest=execution["headDigest"],
    )["state"]
    execution = release_plant_order(
        execution,
        release_id="REL-HANDOFF-001",
        availability_check_id="CHK-HANDOFF-001",
        proof=action_evidence(
            "ACT-HANDOFF-RELEASE-001",
            captured_at="2026-07-24T09:30:00.000Z",
        ),
        expected_head_digest=execution["headDigest"],
    )["state"]
    execution = issue_plant_order_material(
        execution,
        issue_id="ISSUE-HANDOFF-001",
        material_id="MAT-MANAGED-001",
        input_lot_id="LOT-MANAGED-001",
        quantity_milli=10_000,
        proof=action_evidence(
            "ACT-HANDOFF-ISSUE-001",
            captured_at="2026-07-24T09:45:00.000Z",
        ),
        expected_head_digest=execution["headDigest"],
    )["state"]
    production["orderExecution"] = execution
    return production


def issued_commerce(request: dict[str, object]) -> dict[str, object]:
    commerce = catalog_state()
    stock_issue = movement(
        "production_issue",
        "ACT-WAREHOUSE-ISSUE-001",
        -2,
        created_at="2026-07-24T10:00:00.000Z",
    )
    stock_issue.update(
        {
            "productionRequestId": request["requestId"],
            "productionCommandDigest": request["sourceCommandDigest"],
            "productionJobId": request["jobId"],
            "productionMaterialId": request["materialId"],
            "productionInputLotId": request["inputLotId"],
            "productionQuantityMilli": request["quantityMilli"],
            "productionUnit": request["unit"],
            "conversionNote": "2 Shop units provide the reviewed Plant material quantity.",
        }
    )
    commerce["items"][0]["onHand"] = 8  # type: ignore[index]
    commerce["movements"] = [stock_issue]
    return commerce


def located_issued_commerce(request: dict[str, object]) -> dict[str, object]:
    current = catalog_state()
    current["inventoryFoundation"] = opening_inventory(
        action_evidence(
            "ACT-WAREHOUSE-OPENING-LOCATED-001",
            captured_at="2026-07-24T09:50:00.000Z",
        )
    )
    proof = action_evidence(
        "ACT-WAREHOUSE-ISSUE-LOCATED-001",
        captured_at="2026-07-24T10:00:00.000Z",
    )
    candidate = deepcopy(current)
    candidate["items"][0]["onHand"] = 8  # type: ignore[index]
    candidate["movements"] = [production_issue_movement(proof, request)]
    candidate["inventoryFoundation"] = production_issued_inventory(
        current["inventoryFoundation"], proof, request
    )
    return reduce_trial_state(
        "commerce",
        "commerce.production_material.issued",
        current,
        {"state": candidate, "evidence": proof},
    )


def production_return_movement(
    issue: dict[str, object],
    proof: dict[str, str],
    *,
    production_quantity_milli: int = 5_000,
    stock_quantity: int = 1,
    stock_unit_id: str = "LOT-SKU1-OPENING-001",
    location_id: str = "LOC-MAIN",
) -> dict[str, object]:
    record = movement(
        "production_return",
        proof["actionId"],
        stock_quantity,
        created_at=proof["capturedAt"],
    )
    record.update(
        {
            "actor": proof["actor"],
            "reason": proof["reason"],
            "evidenceReference": proof["evidenceReference"],
            "productionRequestId": issue["productionRequestId"],
            "productionCommandDigest": issue["productionCommandDigest"],
            "productionJobId": issue["productionJobId"],
            "productionMaterialId": issue["productionMaterialId"],
            "productionInputLotId": issue["productionInputLotId"],
            "productionQuantityMilli": issue["productionQuantityMilli"],
            "productionUnit": issue["productionUnit"],
            "conversionNote": issue["conversionNote"],
            "productionIssueActionId": issue["actionId"],
            "productionReturnedQuantityMilli": production_quantity_milli,
            "productionReturnStockUnitId": stock_unit_id,
            "productionReturnLocationId": location_id,
        }
    )
    return record


class ProductionMaterialHandoffTests(unittest.TestCase):
    def test_shop_issue_must_match_exact_plant_command_digest(self) -> None:
        production = issued_production()
        request = production_material_requests(production)[0]
        current = catalog_state()
        accepted = issued_commerce(request)

        require_shop_issue_matches_plant(current, accepted, production)

        spoofed = deepcopy(accepted)
        spoofed["movements"][0]["productionCommandDigest"] = f"sha256:{'b' * 64}"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            require_shop_issue_matches_plant(current, spoofed, production)

    def test_plant_progress_requires_linked_shop_issue(self) -> None:
        production = issued_production()
        request = production_material_requests(production)[0]
        execution = production["orderExecution"]
        operated_execution = record_plant_order_operation(
            execution,
            operation_run_id="OPRUN-HANDOFF-001",
            operation_id="OP-MANAGED-10",
            quantity=10,
            actual_minutes_milli=9_500,
            proof=action_evidence(
                "ACT-HANDOFF-OPERATION-001",
                captured_at="2026-07-24T10:15:00.000Z",
            ),
            expected_head_digest=execution["headDigest"],
        )["state"]
        operated = deepcopy(production)
        operated["orderExecution"] = operated_execution

        with self.assertRaises(TrialValidationError):
            require_shop_issue_before_plant_progress(operated, catalog_state())

        require_shop_issue_before_plant_progress(
            operated,
            issued_commerce(request),
        )

    def test_reviewed_material_return_restores_exact_shop_lot(self) -> None:
        production = issued_production()
        request = production_material_requests(production)[0]
        issued = located_issued_commerce(request)
        issue = issued["movements"][0]
        proof = action_evidence(
            "ACT-WAREHOUSE-RETURN-001",
            captured_at="2026-07-24T10:15:00.000Z",
            actor="warehouse-return-operator",
        )
        candidate = deepcopy(issued)
        candidate["items"][0]["onHand"] = 9  # type: ignore[index]
        candidate["movements"] = [
            production_return_movement(issue, proof),
            *issued["movements"],
        ]
        candidate["inventoryFoundation"] = production_returned_inventory(
            issued["inventoryFoundation"],
            proof,
            production_quantity_milli=5_000,
            stock_quantity=1,
        )
        accepted = reduce_trial_state(
            "commerce",
            "commerce.production_material.returned",
            issued,
            {"state": candidate, "evidence": proof},
        )
        self.assertEqual(accepted["items"][0]["onHand"], 9)  # type: ignore[index]
        self.assertEqual(accepted["movements"][0]["kind"], "production_return")  # type: ignore[index]
        self.assertEqual(
            accepted["inventoryFoundation"]["commands"][-1]["payload"]["kind"],  # type: ignore[index]
            "production_return",
        )

        aggregate_only = deepcopy(candidate)
        aggregate_only["inventoryFoundation"] = issued["inventoryFoundation"]
        with self.assertRaisesRegex(TrialValidationError, "location command"):
            reduce_trial_state(
                "commerce",
                "commerce.production_material.returned",
                issued,
                {"state": aggregate_only, "evidence": proof},
            )

        wrong_ratio = deepcopy(candidate)
        wrong_ratio["movements"][0]["productionReturnedQuantityMilli"] = 4_000  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "conversion ratio"):
            reduce_trial_state(
                "commerce",
                "commerce.production_material.returned",
                issued,
                {"state": wrong_ratio, "evidence": proof},
            )

        wrong_source = deepcopy(candidate)
        wrong_source["movements"][0]["productionIssueActionId"] = "ACT-UNKNOWN-ISSUE"  # type: ignore[index]
        with self.assertRaisesRegex(TrialValidationError, "retained Plant issue"):
            reduce_trial_state(
                "commerce",
                "commerce.production_material.returned",
                issued,
                {"state": wrong_source, "evidence": proof},
            )

    def test_managed_api_checks_related_states_atomically(self) -> None:
        principal = TrialPrincipal("workspace-handoff", "actor-operator", "human")
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=(
                "commerce.read",
                "commerce.write",
                "production.read",
                "production.write",
            ),
        )
        production = starting_workspace(target=10)
        initialized_production = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={
                "state": production,
                "evidence": action_evidence("ACT-HANDOFF-API-INIT"),
            },
        )
        final_execution = issued_production()["orderExecution"]
        production_result = initialized_production
        for command_count in range(1, 5):
            commands = deepcopy(final_execution["commands"][:command_count])
            execution = {
                "schema": final_execution["schema"],
                "revision": command_count,
                "headDigest": commands[-1]["digest"],
                "commands": commands,
            }
            candidate = deepcopy(production_result.state)
            candidate["orderExecution"] = execution
            evidence = dict(commands[-1]["payload"]["proof"])
            production_result = store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="production",
                event_type="production.order_execution.recorded",
                expected_version=production_result.version,
                payload={"state": candidate, "evidence": evidence},
            )

        commerce_evidence = action_evidence(
            "ACT-HANDOFF-COMMERCE-INIT",
            captured_at="2026-07-24T09:50:00.000Z",
        )
        commerce_result = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.workspace.initialized",
            expected_version=0,
            payload={"state": catalog_state(), "evidence": commerce_evidence},
        )
        opening = opening_inventory(
            action_evidence(
                "ACT-HANDOFF-INVENTORY-INIT",
                captured_at="2026-07-24T09:55:00.000Z",
            )
        )
        with patch(
            "supermega_runtime.trial_store._utc_now",
            return_value="2026-07-24T09:55:00+00:00",
        ):
            located_commerce = store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.inventory.initialized",
                expected_version=commerce_result.version,
                payload={
                    "state": {**commerce_result.state, "inventoryFoundation": opening},
                    "evidence": opening["commands"][-1]["payload"]["proof"],  # type: ignore[index]
                },
            )

        operation_evidence = action_evidence(
            "ACT-HANDOFF-API-OPERATION",
            captured_at="2026-07-24T10:15:00.000Z",
        )
        operated_execution = record_plant_order_operation(
            production_result.state["orderExecution"],
            operation_run_id="OPRUN-HANDOFF-API-001",
            operation_id="OP-MANAGED-10",
            quantity=10,
            actual_minutes_milli=9_500,
            proof=operation_evidence,
            expected_head_digest=production_result.state["orderExecution"]["headDigest"],
        )["state"]
        operated = deepcopy(production_result.state)
        operated["orderExecution"] = operated_execution
        operation_body = {
            "command_id": str(uuid4()),
            "surface": "production",
            "event_type": "production.order_execution.recorded",
            "expected_version": production_result.version,
            "payload": {"state": operated, "evidence": operation_evidence},
        }

        def resolve_principal(_request: Request) -> TrialPrincipal:
            return principal

        app = FastAPI()
        app.include_router(
            create_trial_router(store=store, resolve_principal=resolve_principal)
        )
        with TestClient(app) as client:
            blocked = client.post("/api/trial/v1/commands", json=operation_body)
            self.assertEqual(blocked.status_code, 422)
            self.assertEqual(
                blocked.json()["detail"]["code"], "trial_validation_error"
            )

            request = production_material_requests(production_result.state)[0]
            issue_proof = action_evidence(
                "ACT-WAREHOUSE-ISSUE-001",
                captured_at="2099-01-01T00:00:00.000Z",
                actor="fabricated-warehouse-operator",
            )
            next_commerce = deepcopy(located_commerce.state)
            next_commerce["items"][0]["onHand"] = 8  # type: ignore[index]
            next_commerce["movements"] = [
                production_issue_movement(issue_proof, request)
            ]
            next_commerce["inventoryFoundation"] = production_issued_inventory(
                located_commerce.state["inventoryFoundation"], issue_proof, request
            )
            issue_evidence = {
                "actionId": next_commerce["movements"][0]["actionId"],  # type: ignore[index]
                "capturedAt": next_commerce["movements"][0]["createdAt"],  # type: ignore[index]
                "actor": principal.actor_id,
                "reason": next_commerce["movements"][0]["reason"],  # type: ignore[index]
                "evidenceReference": next_commerce["movements"][0]["evidenceReference"],  # type: ignore[index]
            }
            issue_command_id = str(uuid4())
            issue_body = {
                "command_id": issue_command_id,
                "surface": "commerce",
                "event_type": "commerce.production_material.issued",
                "expected_version": located_commerce.version,
                "payload": {
                    "state": next_commerce,
                    "evidence": issue_evidence,
                },
            }
            with patch(
                "supermega_runtime.trial_store._utc_now",
                return_value="2026-07-24T10:00:00+00:00",
            ):
                issued = client.post(
                    "/api/trial/v1/commands",
                    json=issue_body,
                )
            self.assertEqual(issued.status_code, 200)
            self.assertEqual(issued.json()["result"]["version"], 3)
            retained = issued.json()["result"]["state"]
            self.assertEqual(retained["movements"][0]["actor"], principal.actor_id)
            self.assertEqual(
                retained["inventoryFoundation"]["commands"][-1]["payload"]["proof"][
                    "actor"
                ],
                principal.actor_id,
            )
            self.assertEqual(
                retained["inventoryFoundation"]["commands"][-1]["payload"]["proof"][
                    "capturedAt"
                ],
                "2026-07-24T10:00:00+00:00",
            )
            self.assertEqual(
                retained["inventoryFoundation"]["commands"][-1]["payload"]["kind"],
                "production_issue",
            )
            replay = client.post("/api/trial/v1/commands", json=issue_body)
            self.assertEqual(replay.status_code, 200)
            self.assertTrue(replay.json()["result"]["idempotent_replay"])

            return_proof = action_evidence(
                "ACT-WAREHOUSE-RETURN-API-001",
                captured_at="2099-01-01T00:00:00.000Z",
                actor="fabricated-return-operator",
            )
            returned_commerce = deepcopy(retained)
            returned_commerce["items"][0]["onHand"] = 9
            returned_commerce["movements"] = [
                production_return_movement(
                    retained["movements"][0],
                    return_proof,
                ),
                *retained["movements"],
            ]
            returned_commerce["inventoryFoundation"] = production_returned_inventory(
                retained["inventoryFoundation"],
                return_proof,
                production_quantity_milli=5_000,
                stock_quantity=1,
            )
            return_evidence = {
                "actionId": return_proof["actionId"],
                "capturedAt": return_proof["capturedAt"],
                "actor": principal.actor_id,
                "reason": return_proof["reason"],
                "evidenceReference": return_proof["evidenceReference"],
            }
            return_command_id = str(uuid4())
            return_body = {
                "command_id": return_command_id,
                "surface": "commerce",
                "event_type": "commerce.production_material.returned",
                "expected_version": 3,
                "payload": {
                    "state": returned_commerce,
                    "evidence": return_evidence,
                },
            }
            with patch(
                "supermega_runtime.trial_store._utc_now",
                return_value="2026-07-24T10:05:00+00:00",
            ):
                returned = client.post("/api/trial/v1/commands", json=return_body)
            self.assertEqual(returned.status_code, 200)
            self.assertEqual(returned.json()["result"]["version"], 4)
            retained_return = returned.json()["result"]["state"]
            self.assertEqual(
                retained_return["movements"][0]["actor"], principal.actor_id
            )
            self.assertEqual(
                retained_return["movements"][0]["createdAt"],
                "2026-07-24T10:05:00+00:00",
            )
            self.assertEqual(
                retained_return["inventoryFoundation"]["commands"][-1]["payload"]["kind"],
                "production_return",
            )
            self.assertEqual(
                retained_return["inventoryFoundation"]["commands"][-1]["payload"]["proof"]["actor"],
                principal.actor_id,
            )
            replayed_return = client.post(
                "/api/trial/v1/commands", json=return_body
            )
            self.assertEqual(replayed_return.status_code, 200)
            self.assertTrue(
                replayed_return.json()["result"]["idempotent_replay"]
            )

            stale_proof = action_evidence(
                "ACT-WAREHOUSE-RETURN-STALE-001",
                captured_at="2026-07-24T10:10:00.000Z",
                actor=principal.actor_id,
            )
            stale_candidate = deepcopy(retained_return)
            stale_candidate["items"][0]["onHand"] = 10
            stale_candidate["movements"] = [
                production_return_movement(
                    retained["movements"][0], stale_proof
                ),
                *retained_return["movements"],
            ]
            stale_candidate["inventoryFoundation"] = production_returned_inventory(
                retained_return["inventoryFoundation"],
                stale_proof,
                production_quantity_milli=5_000,
                stock_quantity=1,
            )
            production_key = (principal.workspace_id, "production")
            retained_production_state = store._states[production_key]
            store._states[production_key] = TrialState(
                workspace_id=principal.workspace_id,
                surface="production",
                version=retained_production_state.version,
                state=starting_workspace(target=10),
                updated_by=retained_production_state.updated_by,
                updated_at=retained_production_state.updated_at,
            )
            stale_body = {
                "command_id": str(uuid4()),
                "surface": "commerce",
                "event_type": "commerce.production_material.returned",
                "expected_version": 4,
                "payload": {
                    "state": stale_candidate,
                    "evidence": stale_proof,
                },
            }
            stale = client.post("/api/trial/v1/commands", json=stale_body)
            self.assertEqual(stale.status_code, 422)
            self.assertEqual(
                stale.json()["detail"]["code"], "trial_validation_error"
            )
            store._states[production_key] = retained_production_state

            accepted = client.post("/api/trial/v1/commands", json=operation_body)
            self.assertEqual(accepted.status_code, 200)
            self.assertEqual(accepted.json()["result"]["version"], 6)


if __name__ == "__main__":
    unittest.main()
