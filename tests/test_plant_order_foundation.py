from __future__ import annotations

from copy import deepcopy
import unittest

from supermega_runtime.plant_order_foundation import (
    EMPTY_PLANT_ORDER_DIGEST,
    PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
    PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
    PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT,
    PLANT_ORDER_PLAN_CONTRACT,
    PlantOrderValidationError,
    apply_plant_order_plan,
    approve_plant_order_material_substitution,
    build_plant_order_execution_plan,
    build_plant_order_controlled_plan,
    build_plant_order_plan,
    check_plant_order_availability,
    create_empty_plant_order_state,
    inspect_plant_order_output,
    issue_plant_order_material,
    plant_order_evidence_digest,
    project_plant_order,
    record_plant_order_effectiveness,
    record_plant_order_calibration,
    record_plant_order_quality_rework,
    record_plant_order_operation,
    record_plant_order_output,
    release_plant_order,
    release_plant_order_batch,
    validate_plant_order_state,
)


def proof(sequence: int, label: str = "reviewed Plant order evidence") -> dict[str, str]:
    return {
        "actionId": f"ACT-20260726-{sequence:03d}",
        "capturedAt": f"2026-07-26T09:{sequence // 60:02d}:{sequence % 60:02d}+06:30",
        "actor": "Plant supervisor",
        "reason": label,
        "evidenceReference": f"WO-2026-0726-{sequence:03d}",
    }


def reviewed_plan(*, target: int = 10) -> dict[str, object]:
    return build_plant_order_plan(
        plan_id="PLN-20260726-001",
        source_digest=plant_order_evidence_digest(
            {"jobId": "JOB-401", "revision": 12, "target": target}
        ),
        job={
            "jobId": "JOB-401",
            "product": "Premium water filter",
            "targetQuantity": target,
            "outputBatchId": "BATCH-20260726-401",
        },
        materials=[
            {
                "materialId": "MAT-FILTER-001",
                "name": "Filter media",
                "unit": "kg",
                "quantityPerUnitMilli": 1_500,
            },
            {
                "materialId": "MAT-SHELL-001",
                "name": "Outer shell",
                "unit": "pcs",
                "quantityPerUnitMilli": 2_000,
            },
        ],
        work_centres=[
            {"workCentreId": "WC-ASSEMBLY-01", "name": "Assembly bench"},
            {"workCentreId": "WC-TEST-01", "name": "Pressure test"},
        ],
        routing=[
            {
                "operationId": "OP-ASSEMBLY-10",
                "sequence": 1,
                "name": "Assemble",
                "workCentreId": "WC-ASSEMBLY-01",
                "minutesPerUnitMilli": 500,
            },
            {
                "operationId": "OP-TEST-20",
                "sequence": 2,
                "name": "Pressure test",
                "workCentreId": "WC-TEST-01",
                "minutesPerUnitMilli": 1_000,
            },
        ],
    )


def controlled_plan(*, target: int = 10) -> dict[str, object]:
    legacy = reviewed_plan(target=target)
    return build_plant_order_controlled_plan(
        plan_id="PLN-20260726-003",
        source_digest=legacy["sourceDigest"],
        job=legacy["job"],
        materials=legacy["materials"],
        work_centres=legacy["workCentres"],
        routing=legacy["routing"],
    )


def reviewed_execution_plan(*, target: int = 10) -> dict[str, object]:
    legacy = reviewed_plan(target=target)
    return build_plant_order_execution_plan(
        plan_id=legacy["planId"],
        source_digest=legacy["sourceDigest"],
        job=legacy["job"],
        materials=legacy["materials"],
        work_centres=legacy["workCentres"],
        routing=legacy["routing"],
    )


def planned_state(*, target: int = 10) -> dict[str, object]:
    state = create_empty_plant_order_state()
    return apply_plant_order_plan(
        state,
        reviewed_plan(target=target),
        proof(1, "approved BOM and routing"),
        expected_head_digest=state["headDigest"],
    )["state"]


def check_state(
    state: dict[str, object],
    *,
    sequence: int = 2,
    check_id: str = "CHK-20260726-001",
    filter_available: int = 15_000,
    shell_available: int = 20_000,
    assembly_minutes: int = 5,
    test_minutes: int = 10,
) -> dict[str, object]:
    return check_plant_order_availability(
        state,
        check_id=check_id,
        source_digest=plant_order_evidence_digest(
            {
                "filter": filter_available,
                "shell": shell_available,
                "assembly": assembly_minutes,
                "test": test_minutes,
            }
        ),
        materials=[
            {
                "materialId": "MAT-FILTER-001",
                "inputLotId": "LOT-FILTER-2407",
                "availableQuantityMilli": filter_available,
            },
            {
                "materialId": "MAT-SHELL-001",
                "inputLotId": "LOT-SHELL-2407",
                "availableQuantityMilli": shell_available,
            },
        ],
        work_centres=[
            {
                "workCentreId": "WC-ASSEMBLY-01",
                "availableMinutes": assembly_minutes,
            },
            {"workCentreId": "WC-TEST-01", "availableMinutes": test_minutes},
        ],
        proof=proof(sequence, "checked material and work-centre availability"),
        expected_head_digest=state["headDigest"],
    )["state"]


def released_state() -> dict[str, object]:
    state = check_state(planned_state())
    return release_plant_order(
        state,
        release_id="REL-20260726-001",
        availability_check_id="CHK-20260726-001",
        proof=proof(3, "released order after reviewed availability"),
        expected_head_digest=state["headDigest"],
    )["state"]


def fully_issued_state() -> dict[str, object]:
    state = released_state()
    state = issue_plant_order_material(
        state,
        issue_id="ISSUE-20260726-001",
        material_id="MAT-FILTER-001",
        input_lot_id="LOT-FILTER-2407",
        quantity_milli=15_000,
        proof=proof(4, "issued reviewed filter-media lot"),
        expected_head_digest=state["headDigest"],
    )["state"]
    return issue_plant_order_material(
        state,
        issue_id="ISSUE-20260726-002",
        material_id="MAT-SHELL-001",
        input_lot_id="LOT-SHELL-2407",
        quantity_milli=20_000,
        proof=proof(5, "issued reviewed shell lot"),
        expected_head_digest=state["headDigest"],
    )["state"]


def fully_issued_execution_state() -> dict[str, object]:
    state = create_empty_plant_order_state()
    state = apply_plant_order_plan(
        state,
        reviewed_execution_plan(),
        proof(1, "approved v2 BOM and routing"),
        expected_head_digest=state["headDigest"],
    )["state"]
    state = check_state(state)
    state = release_plant_order(
        state,
        release_id="REL-20260726-001",
        availability_check_id="CHK-20260726-001",
        proof=proof(3, "released v2 order after reviewed availability"),
        expected_head_digest=state["headDigest"],
    )["state"]
    state = issue_plant_order_material(
        state,
        issue_id="ISSUE-20260726-001",
        material_id="MAT-FILTER-001",
        input_lot_id="LOT-FILTER-2407",
        quantity_milli=15_000,
        proof=proof(4, "issued reviewed filter-media lot"),
        expected_head_digest=state["headDigest"],
    )["state"]
    return issue_plant_order_material(
        state,
        issue_id="ISSUE-20260726-002",
        material_id="MAT-SHELL-001",
        input_lot_id="LOT-SHELL-2407",
        quantity_milli=20_000,
        proof=proof(5, "issued reviewed shell lot"),
        expected_head_digest=state["headDigest"],
    )["state"]


class PlantOrderFoundationTests(unittest.TestCase):
    def test_v3_calibration_gates_release_and_operation_with_renewal(self) -> None:
        state = create_empty_plant_order_state()
        package = controlled_plan()
        self.assertEqual(package["contract"], PLANT_ORDER_CONTROLLED_PLAN_CONTRACT)
        state = apply_plant_order_plan(
            state,
            package,
            proof(1, "approved controlled BOM and routing"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = check_state(state, sequence=2)
        with self.assertRaisesRegex(PlantOrderValidationError, "current calibration"):
            release_plant_order(
                state,
                release_id="REL-CAL-MISSING-001",
                availability_check_id="CHK-20260726-001",
                proof=proof(3, "release without calibration"),
                expected_head_digest=state["headDigest"],
            )

        for sequence, centre in ((3, "WC-ASSEMBLY-01"), (4, "WC-TEST-01")):
            state = record_plant_order_calibration(
                state,
                calibration_id=f"CAL-20260726-{sequence:03d}",
                work_centre_id=centre,
                certificate_id=f"CERT-{centre.removeprefix('WC-')}-001",
                calibrated_at="2026-07-26T08:00:00+06:30",
                valid_until="2026-07-26T10:00:00+06:30",
                standard_reference="Approved reference standard",
                proof=proof(sequence, f"reviewed {centre} calibration"),
                expected_head_digest=state["headDigest"],
            )["state"]
        self.assertEqual(
            [row["workCentreId"] for row in project_plant_order(state)["calibrations"]],
            ["WC-ASSEMBLY-01", "WC-TEST-01"],
        )
        state = release_plant_order(
            state,
            release_id="REL-CAL-001",
            availability_check_id="CHK-20260726-001",
            proof=proof(5, "released calibrated work package"),
            expected_head_digest=state["headDigest"],
        )["state"]
        for sequence, material, lot, quantity in (
            (6, "MAT-FILTER-001", "LOT-FILTER-2407", 15_000),
            (7, "MAT-SHELL-001", "LOT-SHELL-2407", 20_000),
        ):
            state = issue_plant_order_material(
                state,
                issue_id=f"ISSUE-CAL-{sequence:03d}",
                material_id=material,
                input_lot_id=lot,
                quantity_milli=quantity,
                proof=proof(sequence, f"issued {material}"),
                expected_head_digest=state["headDigest"],
            )["state"]

        expired_proof = {
            **proof(8, "attempted operation with expired calibration"),
            "capturedAt": "2026-07-26T10:01:00+06:30",
        }
        with self.assertRaisesRegex(PlantOrderValidationError, "current calibration for WC-ASSEMBLY-01"):
            record_plant_order_operation(
                state,
                operation_run_id="OPRUN-CAL-EXPIRED-001",
                operation_id="OP-ASSEMBLY-10",
                quantity=1,
                actual_minutes_milli=500,
                proof=expired_proof,
                expected_head_digest=state["headDigest"],
            )

        renewal_proof = {
            **proof(9, "reviewed renewed assembly calibration"),
            "capturedAt": "2026-07-26T10:02:00+06:30",
        }
        state = record_plant_order_calibration(
            state,
            calibration_id="CAL-ASSEMBLY-RENEW-001",
            work_centre_id="WC-ASSEMBLY-01",
            certificate_id="CERT-ASSEMBLY-002",
            calibrated_at="2026-07-26T10:01:00+06:30",
            valid_until="2027-07-26T10:00:00+06:30",
            standard_reference="Approved annual reference standard",
            proof=renewal_proof,
            expected_head_digest=state["headDigest"],
        )["state"]
        operation_proof = {
            **proof(10, "recorded calibrated assembly operation"),
            "capturedAt": "2026-07-26T10:03:00+06:30",
        }
        state = record_plant_order_operation(
            state,
            operation_run_id="OPRUN-CAL-001",
            operation_id="OP-ASSEMBLY-10",
            quantity=1,
            actual_minutes_milli=500,
            proof=operation_proof,
            expected_head_digest=state["headDigest"],
        )["state"]
        projection = project_plant_order(state)
        self.assertEqual(projection["operations"][0]["completedQuantity"], 1)
        self.assertEqual(projection["calibrations"][0]["certificateId"], "CERT-ASSEMBLY-002")

    def test_v3_quality_hold_requires_attributed_rework_before_reinspection(self) -> None:
        state = create_empty_plant_order_state()
        state = apply_plant_order_plan(
            state,
            controlled_plan(),
            proof(1, "approved controlled quality plan"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = check_state(state, sequence=2)
        for sequence, centre in ((3, "WC-ASSEMBLY-01"), (4, "WC-TEST-01")):
            state = record_plant_order_calibration(
                state,
                calibration_id=f"CAL-QUALITY-{sequence:03d}",
                work_centre_id=centre,
                certificate_id=f"CERT-{centre.removeprefix('WC-')}-QUALITY",
                calibrated_at="2026-07-26T08:00:00+06:30",
                valid_until="2027-07-26T10:00:00+06:30",
                standard_reference="Approved quality reference standard",
                proof=proof(sequence, f"reviewed {centre} calibration"),
                expected_head_digest=state["headDigest"],
            )["state"]
        state = release_plant_order(
            state,
            release_id="REL-QUALITY-001",
            availability_check_id="CHK-20260726-001",
            proof=proof(5, "released controlled quality package"),
            expected_head_digest=state["headDigest"],
        )["state"]
        for sequence, material, lot, quantity in (
            (6, "MAT-FILTER-001", "LOT-FILTER-2407", 15_000),
            (7, "MAT-SHELL-001", "LOT-SHELL-2407", 20_000),
        ):
            state = issue_plant_order_material(
                state,
                issue_id=f"ISSUE-QUALITY-{sequence:03d}",
                material_id=material,
                input_lot_id=lot,
                quantity_milli=quantity,
                proof=proof(sequence, f"issued {material}"),
                expected_head_digest=state["headDigest"],
            )["state"]
        for sequence, operation, minutes in (
            (8, "OP-ASSEMBLY-10", 5_000),
            (9, "OP-TEST-20", 10_000),
        ):
            state = record_plant_order_operation(
                state,
                operation_run_id=f"OPRUN-QUALITY-{sequence:03d}",
                operation_id=operation,
                quantity=10,
                actual_minutes_milli=minutes,
                proof=proof(sequence, f"completed {operation}"),
                expected_head_digest=state["headDigest"],
            )["state"]
        state = record_plant_order_output(
            state,
            output_id="OUT-QUALITY-001",
            output_batch_id="BATCH-20260726-401",
            quantity=10,
            proof=proof(10, "recorded controlled output"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-QUALITY-FAIL-001",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=10,
            accepted_quantity=8,
            rejected_quantity=2,
            result="fail",
            proof=proof(11, "failed controlled inspection"),
            expected_head_digest=state["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "requires attributable rework"):
            inspect_plant_order_output(
                state,
                inspection_id="INSP-QUALITY-BYPASS-001",
                output_batch_id="BATCH-20260726-401",
                inspected_quantity=10,
                accepted_quantity=10,
                rejected_quantity=0,
                result="pass",
                proof=proof(12, "attempted reinspection without rework"),
                expected_head_digest=state["headDigest"],
            )
        with self.assertRaisesRegex(PlantOrderValidationError, "must equal the current rejected quantity"):
            record_plant_order_quality_rework(
                state,
                rework_id="RWK-QUALITY-WRONG-001",
                inspection_id="INSP-QUALITY-FAIL-001",
                operation_id="OP-TEST-20",
                quantity=1,
                actual_minutes_milli=2_000,
                owner="Quality lead",
                cause="Pressure seal was incomplete.",
                corrective_action="Reset fixture and repeat pressure cycle.",
                proof=proof(12, "wrong rework quantity"),
                expected_head_digest=state["headDigest"],
            )
        state = record_plant_order_quality_rework(
            state,
            rework_id="RWK-QUALITY-001",
            inspection_id="INSP-QUALITY-FAIL-001",
            operation_id="OP-TEST-20",
            quantity=2,
            actual_minutes_milli=2_000,
            owner="Quality lead",
            cause="Pressure seal was incomplete.",
            corrective_action="Reset fixture and repeat pressure cycle.",
            proof=proof(12, "reviewed attributable rework"),
            expected_head_digest=state["headDigest"],
        )["state"]
        projection = project_plant_order(state)
        self.assertEqual(projection["qualityReworks"][0]["owner"], "Quality lead")
        self.assertEqual(projection["operations"][1]["actualMinutesMilli"], 12_000)
        self.assertEqual(projection["metrics"]["actualOperationMinutesMilli"], 17_000)
        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-QUALITY-PASS-001",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=10,
            accepted_quantity=10,
            rejected_quantity=0,
            result="pass",
            proof=proof(13, "passed full reinspection after rework"),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(state)["status"], "ready_to_release")

    def test_effectiveness_window_is_order_bound_and_fail_closed(self) -> None:
        state = released_state()
        evidence = {
            "planId": "PLN-20260726-001",
            "jobId": "JOB-401",
            "windowStart": "2026-07-26T08:00:00+06:30",
            "windowEnd": "2026-07-26T09:00:00+06:30",
            "workCentres": [
                {"workCentreId": "WC-ASSEMBLY-01", "plannedProductiveMinutesMilli": 60_000},
                {"workCentreId": "WC-TEST-01", "plannedProductiveMinutesMilli": 60_000},
            ],
            "downtimeIntervals": [
                {"downtimeId": "DT-ASSEMBLY-01", "workCentreId": "WC-ASSEMBLY-01", "startedAt": "2026-07-26T08:10:00+06:30", "endedAt": "2026-07-26T08:25:00+06:30"},
                {"downtimeId": "DT-TEST-01", "workCentreId": "WC-TEST-01", "startedAt": "2026-07-26T08:35:00+06:30", "endedAt": "2026-07-26T08:50:00+06:30"},
            ],
        }
        with self.assertRaisesRegex(PlantOrderValidationError, "sourceDigest does not match"):
            record_plant_order_effectiveness(
                state,
                effectiveness_id="OEE-BAD-DIGEST",
                **{
                    "plan_id": evidence["planId"],
                    "job_id": evidence["jobId"],
                    "window_start": evidence["windowStart"],
                    "window_end": evidence["windowEnd"],
                    "work_centres": evidence["workCentres"],
                    "downtime_intervals": evidence["downtimeIntervals"],
                },
                source_digest=plant_order_evidence_digest({"wrong": True}),
                proof=proof(4, "bad effectiveness digest"),
                expected_head_digest=state["headDigest"],
            )
        future = {**evidence, "windowEnd": "2026-07-26T10:00:00+06:30"}
        with self.assertRaisesRegex(PlantOrderValidationError, "at or after the closed effectiveness window"):
            record_plant_order_effectiveness(
                state,
                effectiveness_id="OEE-FUTURE-001",
                plan_id=future["planId"],
                job_id=future["jobId"],
                window_start=future["windowStart"],
                window_end=future["windowEnd"],
                work_centres=future["workCentres"],
                downtime_intervals=future["downtimeIntervals"],
                source_digest=plant_order_evidence_digest(future),
                proof=proof(4, "future effectiveness window"),
                expected_head_digest=state["headDigest"],
            )
        result = record_plant_order_effectiveness(
            state,
            effectiveness_id="OEE-20260726-001",
            plan_id=evidence["planId"],
            job_id=evidence["jobId"],
            window_start=evidence["windowStart"],
            window_end=evidence["windowEnd"],
            work_centres=evidence["workCentres"],
            downtime_intervals=evidence["downtimeIntervals"],
            source_digest=plant_order_evidence_digest(evidence),
            proof=proof(4, "reviewed order-bound effectiveness evidence"),
            expected_head_digest=state["headDigest"],
        )
        projection = project_plant_order(result["state"])
        self.assertEqual(projection["effectivenessWindow"]["jobId"], "JOB-401")
        self.assertEqual(len(projection["effectivenessWindow"]["downtimeIntervals"]), 2)

        overlapping = deepcopy(evidence)
        overlapping["downtimeIntervals"] = [
            {"downtimeId": "DT-ASSEMBLY-01", "workCentreId": "WC-ASSEMBLY-01", "startedAt": "2026-07-26T08:10:00+06:30", "endedAt": "2026-07-26T08:30:00+06:30"},
            {"downtimeId": "DT-ASSEMBLY-02", "workCentreId": "WC-ASSEMBLY-01", "startedAt": "2026-07-26T08:20:00+06:30", "endedAt": "2026-07-26T08:35:00+06:30"},
        ]
        with self.assertRaisesRegex(PlantOrderValidationError, "downtime overlaps"):
            record_plant_order_effectiveness(
                state,
                effectiveness_id="OEE-OVERLAP-001",
                plan_id=overlapping["planId"],
                job_id=overlapping["jobId"],
                window_start=overlapping["windowStart"],
                window_end=overlapping["windowEnd"],
                work_centres=overlapping["workCentres"],
                downtime_intervals=overlapping["downtimeIntervals"],
                source_digest=plant_order_evidence_digest(overlapping),
                proof=proof(4, "overlapping downtime"),
                expected_head_digest=state["headDigest"],
            )

    def test_reviewed_plan_is_digest_bound_and_projects_requirements(self) -> None:
        package = reviewed_plan()
        self.assertEqual(package["contract"], PLANT_ORDER_PLAN_CONTRACT)
        self.assertRegex(package["packageDigest"], r"^sha256:[0-9a-f]{64}$")

        state = planned_state()
        projection = project_plant_order(state)
        self.assertEqual(projection["status"], "planned")
        self.assertEqual(projection["plan"]["job"]["jobId"], "JOB-401")
        self.assertEqual(projection["materials"][0]["requiredQuantityMilli"], 15_000)
        self.assertEqual(projection["materials"][1]["requiredQuantityMilli"], 20_000)

    def test_v2_operations_enforce_material_upstream_wip_and_output(self) -> None:
        plan = reviewed_execution_plan()
        self.assertEqual(plan["contract"], PLANT_ORDER_EXECUTION_PLAN_CONTRACT)

        unissued = create_empty_plant_order_state()
        unissued = apply_plant_order_plan(
            unissued,
            plan,
            proof(1, "approved v2 BOM and routing"),
            expected_head_digest=unissued["headDigest"],
        )["state"]
        unissued = check_state(unissued)
        unissued = release_plant_order(
            unissued,
            release_id="REL-UNISSUED-001",
            availability_check_id="CHK-20260726-001",
            proof=proof(3),
            expected_head_digest=unissued["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "lacks issued"):
            record_plant_order_operation(
                unissued,
                operation_run_id="OPRUN-UNISSUED-001",
                operation_id="OP-ASSEMBLY-10",
                quantity=1,
                actual_minutes_milli=500,
                proof=proof(4),
                expected_head_digest=unissued["headDigest"],
            )

        state = fully_issued_execution_state()
        with self.assertRaisesRegex(
            PlantOrderValidationError, "completed final-operation quantity"
        ):
            record_plant_order_output(
                state,
                output_id="OUT-BEFORE-ROUTING-001",
                output_batch_id="BATCH-20260726-401",
                quantity=1,
                proof=proof(6),
                expected_head_digest=state["headDigest"],
            )
        with self.assertRaisesRegex(PlantOrderValidationError, "prior operation"):
            record_plant_order_operation(
                state,
                operation_run_id="OPRUN-TEST-EARLY-001",
                operation_id="OP-TEST-20",
                quantity=1,
                actual_minutes_milli=1_000,
                proof=proof(6),
                expected_head_digest=state["headDigest"],
            )

        state = record_plant_order_operation(
            state,
            operation_run_id="OPRUN-ASSEMBLY-001",
            operation_id="OP-ASSEMBLY-10",
            quantity=4,
            actual_minutes_milli=2_200,
            proof=proof(6, "recorded four assembled units"),
            expected_head_digest=state["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "prior operation"):
            record_plant_order_operation(
                state,
                operation_run_id="OPRUN-TEST-OVERFLOW-001",
                operation_id="OP-TEST-20",
                quantity=5,
                actual_minutes_milli=5_000,
                proof=proof(7),
                expected_head_digest=state["headDigest"],
            )
        state = record_plant_order_operation(
            state,
            operation_run_id="OPRUN-TEST-001",
            operation_id="OP-TEST-20",
            quantity=4,
            actual_minutes_milli=4_000,
            proof=proof(7, "recorded four pressure-tested units"),
            expected_head_digest=state["headDigest"],
        )["state"]
        projection = project_plant_order(state)
        self.assertEqual(
            [operation["completedQuantity"] for operation in projection["operations"]],
            [4, 4],
        )
        self.assertEqual(projection["metrics"]["actualOperationMinutesMilli"], 6_200)
        self.assertEqual(projection["metrics"]["completedOperationCount"], 0)

        state = record_plant_order_output(
            state,
            output_id="OUT-TRANSFER-BATCH-001",
            output_batch_id="BATCH-20260726-401",
            quantity=4,
            proof=proof(8, "recorded routed transfer batch"),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(state)["totalOutput"], 4)

    def test_v2_complete_routing_reaches_existing_quality_release(self) -> None:
        state = fully_issued_execution_state()
        state = record_plant_order_operation(
            state,
            operation_run_id="OPRUN-ASSEMBLY-FULL-001",
            operation_id="OP-ASSEMBLY-10",
            quantity=10,
            actual_minutes_milli=5_000,
            proof=proof(6, "completed assembly operation"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = record_plant_order_operation(
            state,
            operation_run_id="OPRUN-TEST-FULL-001",
            operation_id="OP-TEST-20",
            quantity=10,
            actual_minutes_milli=10_000,
            proof=proof(7, "completed pressure-test operation"),
            expected_head_digest=state["headDigest"],
        )["state"]
        projection = project_plant_order(state)
        self.assertEqual(projection["metrics"]["completedOperationCount"], 2)
        self.assertEqual(
            [operation["status"] for operation in projection["operations"]],
            ["complete", "complete"],
        )

        state = record_plant_order_output(
            state,
            output_id="OUT-V2-001",
            output_batch_id="BATCH-20260726-401",
            quantity=10,
            proof=proof(8, "recorded completed routed output"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-V2-001",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=10,
            accepted_quantity=10,
            rejected_quantity=0,
            result="pass",
            proof=proof(9, "accepted routed output"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = release_plant_order_batch(
            state,
            quality_release_id="QREL-V2-001",
            output_batch_id="BATCH-20260726-401",
            inspection_id="INSP-V2-001",
            proof=proof(10, "released routed batch"),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(state)["status"], "released_to_stock")

    def test_full_lifecycle_retains_genealogy_and_human_releases(self) -> None:
        state = fully_issued_state()
        state = record_plant_order_output(
            state,
            output_id="OUT-20260726-001",
            output_batch_id="BATCH-20260726-401",
            quantity=10,
            proof=proof(6, "confirmed produced batch quantity"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-20260726-001",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=10,
            accepted_quantity=10,
            rejected_quantity=0,
            result="pass",
            proof=proof(7, "accepted complete inspected batch"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = release_plant_order_batch(
            state,
            quality_release_id="QREL-20260726-001",
            output_batch_id="BATCH-20260726-401",
            inspection_id="INSP-20260726-001",
            proof=proof(8, "authorized batch release to stock"),
            expected_head_digest=state["headDigest"],
        )["state"]

        projection = project_plant_order(state)
        self.assertEqual(projection["status"], "released_to_stock")
        self.assertEqual(projection["metrics"]["acceptedQuantity"], 10)
        self.assertEqual(len(projection["genealogy"]), 2)
        self.assertEqual(
            {row["inputLotId"] for row in projection["genealogy"]},
            {"LOT-FILTER-2407", "LOT-SHELL-2407"},
        )
        self.assertEqual(
            {row["outputBatchId"] for row in projection["genealogy"]},
            {"BATCH-20260726-401"},
        )

    def test_material_shortfall_blocks_release_and_fresh_check_recovers(self) -> None:
        state = check_state(planned_state(), filter_available=14_999)
        projection = project_plant_order(state)
        self.assertEqual(projection["status"], "shortfall")
        self.assertEqual(projection["latestAvailability"]["shortfalls"][0]["kind"], "material")
        with self.assertRaisesRegex(PlantOrderValidationError, "shortfall"):
            release_plant_order(
                state,
                release_id="REL-20260726-001",
                availability_check_id="CHK-20260726-001",
                proof=proof(3),
                expected_head_digest=state["headDigest"],
            )

        state = check_state(
            state,
            sequence=3,
            check_id="CHK-20260726-002",
            filter_available=15_000,
        )
        with self.assertRaisesRegex(PlantOrderValidationError, "stale availability"):
            release_plant_order(
                state,
                release_id="REL-20260726-001",
                availability_check_id="CHK-20260726-001",
                proof=proof(4),
                expected_head_digest=state["headDigest"],
            )
        recovered = release_plant_order(
            state,
            release_id="REL-20260726-002",
            availability_check_id="CHK-20260726-002",
            proof=proof(4),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(recovered)["status"], "released")

    def test_capacity_shortfall_blocks_release(self) -> None:
        state = check_state(planned_state(), test_minutes=9)
        projection = project_plant_order(state)
        self.assertEqual(projection["status"], "shortfall")
        self.assertEqual(projection["latestAvailability"]["shortfalls"][0], {
            "kind": "capacity",
            "subjectId": "WC-TEST-01",
            "required": 10_000,
            "available": 9_000,
        })
        with self.assertRaisesRegex(PlantOrderValidationError, "shortfall"):
            release_plant_order(
                state,
                release_id="REL-20260726-001",
                availability_check_id="CHK-20260726-001",
                proof=proof(3),
                expected_head_digest=state["headDigest"],
            )

    def test_material_substitution_is_reviewed_immutable_and_never_auto_issues(self) -> None:
        state = create_empty_plant_order_state()
        state = apply_plant_order_plan(
            state,
            reviewed_execution_plan(),
            proof(1, "approved v2 BOM and routing"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = check_state(state)
        state = release_plant_order(
            state,
            release_id="REL-20260726-001",
            availability_check_id="CHK-20260726-001",
            proof=proof(3, "released v2 order after reviewed availability"),
            expected_head_digest=state["headDigest"],
        )["state"]
        approval_source_digest = plant_order_evidence_digest(
            {
                "certificate": "CERT-FILTER-ALT-2026-07",
                "originalMaterialId": "MAT-FILTER-001",
                "substituteMaterialId": "MAT-FILTER-ALT-001",
                "ratio": [1_500, 1_800],
            }
        )
        approved = approve_plant_order_material_substitution(
            state,
            substitution_id="SUB-20260726-001",
            material_id="MAT-FILTER-001",
            substitute_material_id="MAT-FILTER-ALT-001",
            substitute_name="Approved alternate filter media",
            substitute_unit="kg",
            original_quantity_per_unit_milli=1_500,
            substitute_quantity_per_unit_milli=1_800,
            approval_source_digest=approval_source_digest,
            technical_basis="Engineering review approved 1.8 kg alternate for each 1.5 kg BOM requirement.",
            proof=proof(4, "approved documented alternate without issuing stock"),
            expected_head_digest=state["headDigest"],
        )

        projection = project_plant_order(approved["state"])
        self.assertEqual(projection["status"], "released")
        self.assertEqual(projection["metrics"]["issuedMaterialCount"], 0)
        self.assertTrue(all(row["issuedQuantityMilli"] == 0 for row in projection["materials"]))
        self.assertEqual(
            projection["materialSubstitutions"],
            [
                {
                    "kind": "approve_material_substitution",
                    "contract": PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT,
                    "id": "SUB-20260726-001",
                    "materialId": "MAT-FILTER-001",
                    "substituteMaterialId": "MAT-FILTER-ALT-001",
                    "substituteName": "Approved alternate filter media",
                    "substituteUnit": "kg",
                    "originalQuantityPerUnitMilli": 1_500,
                    "substituteQuantityPerUnitMilli": 1_800,
                    "approvalSourceDigest": approval_source_digest,
                    "technicalBasis": "Engineering review approved 1.8 kg alternate for each 1.5 kg BOM requirement.",
                    "proof": proof(4, "approved documented alternate without issuing stock"),
                }
            ],
        )

        replay = approve_plant_order_material_substitution(
            approved["state"],
            substitution_id="SUB-20260726-001",
            material_id="MAT-FILTER-001",
            substitute_material_id="MAT-FILTER-ALT-001",
            substitute_name="Approved alternate filter media",
            substitute_unit="kg",
            original_quantity_per_unit_milli=1_500,
            substitute_quantity_per_unit_milli=1_800,
            approval_source_digest=approval_source_digest,
            technical_basis="Engineering review approved 1.8 kg alternate for each 1.5 kg BOM requirement.",
            proof=proof(4, "approved documented alternate without issuing stock"),
            expected_head_digest=state["headDigest"],
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["state"], approved["state"])

        with self.assertRaisesRegex(PlantOrderValidationError, "lacks issued"):
            record_plant_order_operation(
                approved["state"],
                operation_run_id="OPRUN-SUBSTITUTE-001",
                operation_id="OP-ASSEMBLY-10",
                quantity=1,
                actual_minutes_milli=500,
                proof=proof(5),
                expected_head_digest=approved["state"]["headDigest"],
            )

        tampered = deepcopy(approved["state"])
        tampered["commands"][-1]["payload"]["technicalBasis"] = "Unreviewed replacement"
        with self.assertRaisesRegex(PlantOrderValidationError, "digest does not match"):
            validate_plant_order_state(tampered)

    def test_material_substitution_fails_closed_on_scope_basis_and_chronology(self) -> None:
        state = released_state()
        approval_source_digest = plant_order_evidence_digest({"certificate": "CERT-ALT-001"})

        def approve(current: dict[str, object], **overrides: object) -> dict[str, object]:
            values: dict[str, object] = {
                "substitution_id": "SUB-20260726-001",
                "material_id": "MAT-FILTER-001",
                "substitute_material_id": "MAT-FILTER-ALT-001",
                "substitute_name": "Approved alternate filter media",
                "substitute_unit": "kg",
                "original_quantity_per_unit_milli": 1_500,
                "substitute_quantity_per_unit_milli": 1_800,
                "approval_source_digest": approval_source_digest,
                "technical_basis": "Reviewed engineering equivalence for this released order only.",
                "proof": proof(4, "reviewed substitute scope and ratio"),
                "expected_head_digest": current["headDigest"],
            }
            values.update(overrides)
            return approve_plant_order_material_substitution(current, **values)

        invalid_cases = (
            ({"material_id": "MAT-UNKNOWN-001"}, "not in the reviewed BOM"),
            ({"substitute_material_id": "MAT-FILTER-001"}, "distinct non-BOM material"),
            ({"substitute_material_id": "MAT-SHELL-001"}, "distinct non-BOM material"),
            ({"original_quantity_per_unit_milli": 1_499}, "match the reviewed BOM basis"),
            ({"substitute_unit": "crate"}, "substituteUnit is unsupported"),
            ({"technical_basis": ""}, "technicalBasis must be nonblank"),
            ({"approval_source_digest": "not-a-digest"}, "approvalSourceDigest"),
            ({"substitute_quantity_per_unit_milli": 9_007_199_254_740_991}, "supported quantity range"),
        )
        for overrides, message in invalid_cases:
            with self.subTest(overrides=overrides):
                with self.assertRaisesRegex(PlantOrderValidationError, message):
                    approve(state, **overrides)

        checked = check_state(planned_state())
        with self.assertRaisesRegex(PlantOrderValidationError, "requires human order release"):
            approve(checked)

        approved = approve(state)["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "second substitute"):
            approve(
                approved,
                substitution_id="SUB-20260726-002",
                substitute_material_id="MAT-FILTER-ALT-002",
                proof=proof(5, "attempted second alternate"),
            )

        issued = issue_plant_order_material(
            state,
            issue_id="ISSUE-20260726-001",
            material_id="MAT-FILTER-001",
            input_lot_id="LOT-FILTER-2407",
            quantity_milli=1_500,
            proof=proof(4, "issued original material before substitution review"),
            expected_head_digest=state["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "must precede material issue"):
            approve(issued, proof=proof(5, "late substitute approval"))

    def test_output_requires_proportional_bom_issue(self) -> None:
        state = released_state()
        state = issue_plant_order_material(
            state,
            issue_id="ISSUE-20260726-001",
            material_id="MAT-FILTER-001",
            input_lot_id="LOT-FILTER-2407",
            quantity_milli=7_500,
            proof=proof(4),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = issue_plant_order_material(
            state,
            issue_id="ISSUE-20260726-002",
            material_id="MAT-SHELL-001",
            input_lot_id="LOT-SHELL-2407",
            quantity_milli=10_000,
            proof=proof(5),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = record_plant_order_output(
            state,
            output_id="OUT-20260726-001",
            output_batch_id="BATCH-20260726-401",
            quantity=5,
            proof=proof(6),
            expected_head_digest=state["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "lacks issued MAT-FILTER"):
            record_plant_order_output(
                state,
                output_id="OUT-20260726-002",
                output_batch_id="BATCH-20260726-401",
                quantity=1,
                proof=proof(7),
                expected_head_digest=state["headDigest"],
            )

    def test_material_issue_is_lot_bound_and_cannot_exceed_bom(self) -> None:
        state = released_state()
        with self.assertRaisesRegex(PlantOrderValidationError, "differs from the released lot"):
            issue_plant_order_material(
                state,
                issue_id="ISSUE-20260726-001",
                material_id="MAT-FILTER-001",
                input_lot_id="LOT-WRONG-001",
                quantity_milli=1,
                proof=proof(4),
                expected_head_digest=state["headDigest"],
            )
        with self.assertRaisesRegex(PlantOrderValidationError, "exceeds the reviewed BOM"):
            issue_plant_order_material(
                state,
                issue_id="ISSUE-20260726-002",
                material_id="MAT-FILTER-001",
                input_lot_id="LOT-FILTER-2407",
                quantity_milli=15_001,
                proof=proof(4),
                expected_head_digest=state["headDigest"],
            )

    def test_failed_inspection_holds_output_until_human_reinspection(self) -> None:
        state = fully_issued_state()
        state = record_plant_order_output(
            state,
            output_id="OUT-20260726-001",
            output_batch_id="BATCH-20260726-401",
            quantity=5,
            proof=proof(6),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-20260726-001",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=5,
            accepted_quantity=4,
            rejected_quantity=1,
            result="fail",
            proof=proof(7, "held batch after failed inspection"),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(state)["status"], "quality_hold")
        with self.assertRaisesRegex(PlantOrderValidationError, "blocked by the failed"):
            record_plant_order_output(
                state,
                output_id="OUT-20260726-002",
                output_batch_id="BATCH-20260726-401",
                quantity=5,
                proof=proof(8),
                expected_head_digest=state["headDigest"],
            )

        state = inspect_plant_order_output(
            state,
            inspection_id="INSP-20260726-002",
            output_batch_id="BATCH-20260726-401",
            inspected_quantity=5,
            accepted_quantity=5,
            rejected_quantity=0,
            result="pass",
            proof=proof(8, "accepted reinspection after containment"),
            expected_head_digest=state["headDigest"],
        )["state"]
        state = record_plant_order_output(
            state,
            output_id="OUT-20260726-002",
            output_batch_id="BATCH-20260726-401",
            quantity=5,
            proof=proof(9),
            expected_head_digest=state["headDigest"],
        )["state"]
        self.assertEqual(project_plant_order(state)["status"], "inspection_due")

    def test_batch_release_requires_complete_current_passing_inspection(self) -> None:
        state = fully_issued_state()
        state = record_plant_order_output(
            state,
            output_id="OUT-20260726-001",
            output_batch_id="BATCH-20260726-401",
            quantity=10,
            proof=proof(6),
            expected_head_digest=state["headDigest"],
        )["state"]
        with self.assertRaisesRegex(PlantOrderValidationError, "latest current inspection"):
            release_plant_order_batch(
                state,
                quality_release_id="QREL-20260726-001",
                output_batch_id="BATCH-20260726-401",
                inspection_id="INSP-20260726-001",
                proof=proof(7),
                expected_head_digest=state["headDigest"],
            )

    def test_exact_command_replay_is_idempotent_and_conflicts_fail(self) -> None:
        state = create_empty_plant_order_state()
        package = reviewed_plan()
        first = apply_plant_order_plan(
            state,
            package,
            proof(1),
            expected_head_digest=state["headDigest"],
        )
        replay = apply_plant_order_plan(
            first["state"],
            package,
            proof(1),
            expected_head_digest=EMPTY_PLANT_ORDER_DIGEST,
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["state"], first["state"])
        with self.assertRaisesRegex(PlantOrderValidationError, "different evidence"):
            apply_plant_order_plan(
                first["state"],
                package,
                proof(2),
                expected_head_digest=first["state"]["headDigest"],
            )

    def test_stale_head_tamper_duplicate_action_and_backward_time_fail_closed(self) -> None:
        state = planned_state()
        with self.assertRaisesRegex(PlantOrderValidationError, "snapshot changed"):
            check_plant_order_availability(
                state,
                check_id="CHK-20260726-001",
                source_digest=plant_order_evidence_digest({"source": "count"}),
                materials=[
                    {"materialId": "MAT-FILTER-001", "inputLotId": "LOT-FILTER-2407", "availableQuantityMilli": 15_000},
                    {"materialId": "MAT-SHELL-001", "inputLotId": "LOT-SHELL-2407", "availableQuantityMilli": 20_000},
                ],
                work_centres=[
                    {"workCentreId": "WC-ASSEMBLY-01", "availableMinutes": 5},
                    {"workCentreId": "WC-TEST-01", "availableMinutes": 10},
                ],
                proof=proof(2),
                expected_head_digest=EMPTY_PLANT_ORDER_DIGEST,
            )

        checked = check_state(state)
        tampered = deepcopy(checked)
        tampered["commands"][1]["payload"]["materials"][0]["availableQuantityMilli"] = 99_999
        with self.assertRaisesRegex(PlantOrderValidationError, "digest does not match"):
            validate_plant_order_state(tampered)

        duplicate_action = deepcopy(checked)
        duplicate_action["commands"][1]["payload"]["proof"]["actionId"] = duplicate_action["commands"][0]["payload"]["proof"]["actionId"]
        body = {key: duplicate_action["commands"][1][key] for key in ("sequence", "previousDigest", "payload")}
        duplicate_action["commands"][1]["digest"] = plant_order_evidence_digest(body)
        duplicate_action["headDigest"] = duplicate_action["commands"][1]["digest"]
        with self.assertRaisesRegex(PlantOrderValidationError, "action IDs.*duplicates"):
            validate_plant_order_state(duplicate_action)

        with self.assertRaisesRegex(PlantOrderValidationError, "moves backwards"):
            check_plant_order_availability(
                state,
                check_id="CHK-20260726-002",
                source_digest=plant_order_evidence_digest({"source": "older count"}),
                materials=[
                    {"materialId": "MAT-FILTER-001", "inputLotId": "LOT-FILTER-2407", "availableQuantityMilli": 15_000},
                    {"materialId": "MAT-SHELL-001", "inputLotId": "LOT-SHELL-2407", "availableQuantityMilli": 20_000},
                ],
                work_centres=[
                    {"workCentreId": "WC-ASSEMBLY-01", "availableMinutes": 5},
                    {"workCentreId": "WC-TEST-01", "availableMinutes": 10},
                ],
                proof={**proof(2), "capturedAt": "2026-07-26T08:59:59+06:30"},
                expected_head_digest=state["headDigest"],
            )

    def test_plan_validation_rejects_unknown_routing_and_unsorted_bom(self) -> None:
        with self.assertRaisesRegex(PlantOrderValidationError, "canonical identifier order"):
            build_plant_order_plan(
                plan_id="PLN-20260726-002",
                source_digest=plant_order_evidence_digest({"source": "plan"}),
                job={"jobId": "JOB-402", "product": "Filter", "targetQuantity": 1, "outputBatchId": "BATCH-402"},
                materials=[
                    {"materialId": "MAT-Z-001", "name": "Z", "unit": "pcs", "quantityPerUnitMilli": 1_000},
                    {"materialId": "MAT-A-001", "name": "A", "unit": "pcs", "quantityPerUnitMilli": 1_000},
                ],
                work_centres=[{"workCentreId": "WC-A-01", "name": "A"}],
                routing=[{"operationId": "OP-A-10", "sequence": 1, "name": "A", "workCentreId": "WC-A-01", "minutesPerUnitMilli": 1_000}],
            )
        with self.assertRaisesRegex(PlantOrderValidationError, "workCentreId is unknown"):
            build_plant_order_plan(
                plan_id="PLN-20260726-003",
                source_digest=plant_order_evidence_digest({"source": "plan"}),
                job={"jobId": "JOB-403", "product": "Filter", "targetQuantity": 1, "outputBatchId": "BATCH-403"},
                materials=[{"materialId": "MAT-A-001", "name": "A", "unit": "pcs", "quantityPerUnitMilli": 1_000}],
                work_centres=[{"workCentreId": "WC-A-01", "name": "A"}],
                routing=[{"operationId": "OP-A-10", "sequence": 1, "name": "A", "workCentreId": "WC-B-01", "minutesPerUnitMilli": 1_000}],
            )


if __name__ == "__main__":
    unittest.main()
