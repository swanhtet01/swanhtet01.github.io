from __future__ import annotations

from collections.abc import Mapping
import unittest
from uuid import uuid4

from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialIdempotencyConflict,
    TrialHumanApprovalRequired,
    TrialInvalidTransition,
    TrialNotFound,
    TrialNotReadyError,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialValidationError,
    TrialVersionConflict,
)


def _decision_packet(release: str = "catalog-v1") -> dict[str, object]:
    return {
        "contract": "decision_packet.v1",
        "subject": {"kind": "release", "id": release, "version": 1},
        "decision": f"Release {release}",
        "claims": [
            {
                "id": "claim-catalog-review",
                "claim_type": "fact",
                "statement": "The catalog passed the bounded trial review.",
                "source_reference": "review://catalog/1",
                "captured_at": "2026-07-22T00:00:00+00:00",
                "status": "verified",
                "uncertainty": "low",
                "visibility": "private",
                "digest": "sha256:" + "0" * 64,
            }
        ],
        "baseline": "Catalog is not released.",
        "target": f"{release} is available to the trial workspace.",
        "result": "The bounded review passed.",
        "acceptance": "The release record and owner decision are preserved.",
        "artifact_reference": "artifact://catalog/release-v1",
    }


class RecordingReducer:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(
        self,
        surface: str,
        event_type: str,
        current: Mapping[str, object],
        payload: Mapping[str, object],
    ) -> Mapping[str, object]:
        self.calls += 1
        next_state = dict(current)
        changes = payload.get("changes", {})
        if isinstance(changes, Mapping):
            next_state.update(changes)
        next_state["last_surface"] = surface
        next_state["last_event_type"] = event_type
        return next_state


class TrialStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reducer = RecordingReducer()
        self.store = InMemoryTrialStore(reducer=self.reducer)
        self.operator = TrialPrincipal("workspace-a", "actor-operator", "human")
        self.manager = TrialPrincipal("workspace-a", "actor-manager", "human")
        self.agent_manager = TrialPrincipal("workspace-a", "actor-agent-manager", "agent")
        self.other_operator = TrialPrincipal("workspace-b", "actor-other", "human")
        self.other_manager = TrialPrincipal("workspace-b", "actor-other-manager", "human")
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=("commerce.write", "website.write", "approvals.request"),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-manager",
            actor_kind="human",
            capabilities=("approvals.decide",),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("approvals.decide",),
        )
        self.store.provision_membership(
            workspace_id="workspace-b",
            actor_id="actor-other",
            actor_kind="human",
            capabilities=("commerce.write", "approvals.request"),
        )
        self.store.provision_membership(
            workspace_id="workspace-b",
            actor_id="actor-other-manager",
            actor_kind="human",
            capabilities=("approvals.decide",),
        )

    def _apply(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str,
        expected_version: int = 0,
        sku: str = "sku-a",
    ):
        return self.store.apply_command(
            principal,
            command_id=command_id,
            surface="commerce",
            event_type="commerce.order.saved",
            expected_version=expected_version,
            payload={"changes": {"sku": sku}},
        )

    def test_state_and_command_ids_are_scoped_to_workspace(self) -> None:
        shared_command_id = str(uuid4())

        first = self._apply(self.operator, command_id=shared_command_id, sku="workspace-a-sku")
        second = self._apply(self.other_operator, command_id=shared_command_id, sku="workspace-b-sku")

        self.assertEqual(first.version, 1)
        self.assertEqual(second.version, 1)
        self.assertEqual(self.store.get_state(self.operator, "commerce").state["sku"], "workspace-a-sku")
        self.assertEqual(
            self.store.get_state(self.other_operator, "commerce").state["sku"],
            "workspace-b-sku",
        )
        self.assertEqual(self.store.get_state(self.operator, "commerce").updated_by, "actor-operator")

    def test_idempotency_replays_immutable_result_and_rejects_reuse(self) -> None:
        command_id = str(uuid4())
        first = self._apply(self.operator, command_id=command_id)
        first.state["sku"] = "client-tamper"

        replay = self._apply(self.operator, command_id=command_id)

        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(replay.version, 1)
        self.assertEqual(replay.state["sku"], "sku-a")
        self.assertEqual(self.reducer.calls, 1)
        with self.assertRaises(TrialIdempotencyConflict):
            self._apply(self.operator, command_id=command_id, sku="different-input")

    def test_optimistic_version_conflict_does_not_change_state(self) -> None:
        self._apply(self.operator, command_id=str(uuid4()))

        with self.assertRaises(TrialVersionConflict) as raised:
            self._apply(self.operator, command_id=str(uuid4()), expected_version=0, sku="stale")

        self.assertEqual(raised.exception.expected_version, 0)
        self.assertEqual(raised.exception.current_version, 1)
        self.assertEqual(self.store.get_state(self.operator, "commerce").state["sku"], "sku-a")

    def test_related_state_precondition_is_atomic_and_fails_before_reducer(self) -> None:
        website = self.store.apply_command(
            self.operator,
            command_id=str(uuid4()),
            surface="website",
            event_type="website.content.saved",
            expected_version=0,
            payload={"changes": {"fingerprint": "web-1234abcd"}},
        )
        observed: list[tuple[dict[str, object], dict[str, object]]] = []

        def require_website(
            current: Mapping[str, object],
            related: Mapping[str, Mapping[str, object]],
        ) -> None:
            observed.append((dict(current), dict(related["website"])))
            if related["website"].get("fingerprint") != "web-1234abcd":
                raise TrialValidationError("Website proof changed.")

        created = self.store.apply_command(
            self.operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.website_intake.created",
            expected_version=0,
            payload={"changes": {"intake": "retained"}},
            related_surfaces=("website",),
            state_precondition=require_website,
        )
        self.assertEqual(website.version, 1)
        self.assertEqual(created.version, 1)
        self.assertEqual(observed, [({}, {"fingerprint": "web-1234abcd", "last_surface": "website", "last_event_type": "website.content.saved"})])

        calls_before_rejection = self.reducer.calls

        def reject_changed_proof(
            _current: Mapping[str, object],
            _related: Mapping[str, Mapping[str, object]],
        ) -> None:
            raise TrialValidationError("Website proof changed.")

        with self.assertRaises(TrialValidationError):
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.website_intake.created",
                expected_version=1,
                payload={"changes": {"intake": "not-written"}},
                related_surfaces=("website",),
                state_precondition=reject_changed_proof,
            )
        self.assertEqual(self.reducer.calls, calls_before_rejection)
        self.assertEqual(self.store.get_state(self.operator, "commerce").state["intake"], "retained")

    def test_store_enforces_human_only_consequential_commerce_events(self) -> None:
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("commerce.write",),
        )
        calls_before_rejection = self.reducer.calls
        human_only_events = (
            "commerce.workspace.initialized",
            "commerce.item.created",
            "commerce.order.created",
            "commerce.order.advanced",
            "commerce.order.cancelled",
            "commerce.payment.reconciled",
            "commerce.stock.received",
            "commerce.close.saved",
            "commerce.website_intake.converted",
        )
        for event_type in human_only_events:
            with self.subTest(event_type=event_type), self.assertRaises(TrialHumanApprovalRequired):
                self.store.apply_command(
                    self.agent_manager,
                    command_id=str(uuid4()),
                    surface="commerce",
                    event_type=event_type,
                    expected_version=0,
                    payload={"changes": {"status": "agent-write-blocked"}},
                )
        self.assertEqual(self.reducer.calls, calls_before_rejection)

    def test_write_requires_explicit_surface_capability(self) -> None:
        with self.assertRaises(TrialPermissionDenied) as raised:
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="production",
                event_type="run.started",
                expected_version=0,
                payload={},
            )

        self.assertEqual(raised.exception.required_capability, "production.write")
        self.assertEqual(self.store.get_state(self.operator, "production").version, 0)

    def test_each_infrastructure_write_gate_fails_closed(self) -> None:
        for blocked_check in ("database_ready", "role_ready", "schema_ready", "audit_ready", "write_enabled"):
            with self.subTest(blocked_check=blocked_check):
                options = {blocked_check: False}
                reducer = RecordingReducer()
                store = InMemoryTrialStore(reducer=reducer, **options)
                store.provision_membership(
                    workspace_id="workspace-a",
                    actor_id="actor-operator",
                    actor_kind="human",
                    capabilities=("commerce.write",),
                )
                with self.assertRaises(TrialNotReadyError) as raised:
                    store.apply_command(
                        self.operator,
                        command_id=str(uuid4()),
                        surface="commerce",
                        event_type="commerce.order.saved",
                        expected_version=0,
                        payload={},
                    )
                self.assertIn(blocked_check, raised.exception.reasons)
                self.assertEqual(reducer.calls, 0)

    def test_postgres_runtime_role_gate_rejects_every_privileged_or_unencrypted_shape(self) -> None:
        required = (
            "session_role_stable",
            "dedicated_login",
            "can_login",
            "no_superuser",
            "no_bypassrls",
            "no_create_role",
            "no_create_db",
            "no_replication",
            "inherits_backend",
            "no_elevated_membership",
            "tls_active",
        )

        class RoleCursor:
            def __init__(self, row: dict[str, bool]):
                self.row = row
                self.query = ""

            def execute(self, query: str) -> None:
                self.query = query

            def fetchone(self) -> dict[str, bool]:
                return self.row

        safe = {name: True for name in required}
        safe_cursor = RoleCursor(safe)
        PostgresTrialStore._assert_runtime_role(safe_cursor)
        self.assertIn("rolbypassrls", safe_cursor.query.lower())
        self.assertIn("pg_stat_ssl", safe_cursor.query.lower())

        for failed_check in required:
            with self.subTest(failed_check=failed_check):
                cursor = RoleCursor({**safe, failed_check: False})
                with self.assertRaises(TrialNotReadyError) as error:
                    PostgresTrialStore._assert_runtime_role(cursor)
                self.assertEqual(error.exception.reasons, ("role_ready",))

    def test_postgres_schema_probe_requires_version_3_and_decision_constraints(self) -> None:
        class SchemaCursor:
            def __init__(self, row: dict[str, object] | None):
                self.row = row
                self.query = ""
                self.parameters: tuple[object, ...] = ()

            def execute(self, query: str, parameters: tuple[object, ...]) -> None:
                self.query = query
                self.parameters = parameters

            def fetchone(self) -> dict[str, object] | None:
                return self.row

        ready = {
            "schema_version": 3,
            "actor_decision_columns_ready": True,
            "decision_constraints_ready": True,
        }
        cursor = SchemaCursor(ready)
        PostgresTrialStore._assert_schema(cursor)
        self.assertIn("information_schema.columns", cursor.query.lower())
        self.assertIn("approval_requests_terminal_decision_v2_check", cursor.query)
        self.assertEqual(cursor.parameters, ("private_trial_backend",))

        for field, value in (
            ("schema_version", 1),
            ("actor_decision_columns_ready", False),
            ("decision_constraints_ready", False),
        ):
            with self.subTest(field=field):
                with self.assertRaises(TrialNotReadyError) as error:
                    PostgresTrialStore._assert_schema(SchemaCursor({**ready, field: value}))
                self.assertEqual(error.exception.reasons, ("schema_ready",))

    def test_auth_and_active_membership_are_required_for_writes(self) -> None:
        unauthenticated = TrialPrincipal("workspace-a", "actor-operator", "human", authenticated=False)
        with self.assertRaises(TrialNotReadyError) as unauthenticated_error:
            self._apply(unauthenticated, command_id=str(uuid4()))
        self.assertIn("auth_ready", unauthenticated_error.exception.reasons)

        missing = TrialPrincipal("workspace-a", "missing-actor", "human")
        with self.assertRaises(TrialNotReadyError) as missing_error:
            self._apply(missing, command_id=str(uuid4()))
        self.assertIn("membership_ready", missing_error.exception.reasons)

        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="suspended-actor",
            actor_kind="human",
            capabilities=("commerce.write",),
            status="suspended",
        )
        suspended = TrialPrincipal("workspace-a", "suspended-actor", "human")
        with self.assertRaises(TrialNotReadyError) as suspended_error:
            self._apply(suspended, command_id=str(uuid4()))
        self.assertIn("membership_ready", suspended_error.exception.reasons)

    def test_reads_do_not_bypass_database_schema_auth_or_membership(self) -> None:
        for blocked_check in ("database_ready", "role_ready", "schema_ready"):
            with self.subTest(blocked_check=blocked_check):
                store = InMemoryTrialStore(reducer=RecordingReducer(), **{blocked_check: False})
                store.provision_membership(
                    workspace_id="workspace-a",
                    actor_id="actor-operator",
                    actor_kind="human",
                    capabilities=(),
                )
                with self.assertRaises(TrialNotReadyError):
                    store.get_state(self.operator, "commerce")

        read_only = InMemoryTrialStore(
            reducer=RecordingReducer(),
            audit_ready=False,
            write_enabled=False,
        )
        read_only.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=(),
        )
        self.assertEqual(read_only.get_state(self.operator, "commerce").version, 0)

    def test_approval_transition_is_controlled_and_workspace_scoped(self) -> None:
        approval = self.store.create_approval(
            self.operator,
            command_id=str(uuid4()),
            title="Release trial catalog",
            proposal=_decision_packet(),
            evidence_refs=("review://catalog/1",),
        )
        approval.proposal["decision"] = "client-tamper"
        stored = self.store.list_approvals(self.operator)[0]
        self.assertEqual(stored.status, "pending")
        self.assertEqual(stored.version, 0)
        self.assertEqual(stored.requested_by, "actor-operator")
        self.assertEqual(stored.requested_actor_kind, "human")
        self.assertEqual(stored.proposal["decision"], "Release catalog-v1")

        for blank_note in ("", "   \t\n"):
            with self.subTest(blank_note=repr(blank_note)):
                with self.assertRaises(TrialValidationError):
                    self.store.decide_approval(
                        self.manager,
                        approval_id=approval.approval_id,
                        command_id=str(uuid4()),
                        decision="approved",
                        note=blank_note,
                    )

        postgres_store = PostgresTrialStore("", reducer=self.reducer, write_enabled=True)
        with self.assertRaises(TrialValidationError):
            postgres_store.decide_approval(
                self.manager,
                approval_id=approval.approval_id,
                command_id=str(uuid4()),
                decision="approved",
                note=" ",
            )

        with self.assertRaises(TrialPermissionDenied):
            self.store.decide_approval(
                self.operator,
                approval_id=approval.approval_id,
                command_id=str(uuid4()),
                decision="approved",
                note="Operator requested approval.",
            )
        with self.assertRaises(TrialNotFound):
            self.store.decide_approval(
                self.other_manager,
                approval_id=approval.approval_id,
                command_id=str(uuid4()),
                decision="approved",
                note="Cross-workspace attempt.",
            )
        with self.assertRaises(TrialHumanApprovalRequired):
            self.store.decide_approval(
                self.agent_manager,
                approval_id=approval.approval_id,
                command_id=str(uuid4()),
                decision="approved",
                note="Agent attempted approval.",
            )

        decision_command_id = str(uuid4())
        decided = self.store.decide_approval(
            self.manager,
            approval_id=approval.approval_id,
            command_id=decision_command_id,
            decision="approved",
            note="  Reviewed by the named owner.  ",
        )
        replay = self.store.decide_approval(
            self.manager,
            approval_id=approval.approval_id,
            command_id=decision_command_id,
            decision="approved",
            note="  Reviewed by the named owner.  ",
        )
        self.assertEqual(decided.status, "approved")
        self.assertEqual(decided.version, 1)
        self.assertEqual(decided.decided_by, "actor-manager")
        self.assertEqual(decided.decided_actor_kind, "human")
        self.assertEqual(decided.decision_note, "Reviewed by the named owner.")
        self.assertTrue(replay.idempotent_replay)
        with self.assertRaises(TrialInvalidTransition):
            self.store.decide_approval(
                self.manager,
                approval_id=approval.approval_id,
                command_id=str(uuid4()),
                decision="declined",
                note="A second terminal decision is forbidden.",
            )

    def test_validation_rejects_malformed_commands_and_decisions(self) -> None:
        with self.assertRaises(TrialValidationError):
            self.store.apply_command(
                self.operator,
                command_id="not-a-uuid",
                surface="commerce",
                event_type="commerce.order.saved",
                expected_version=0,
                payload={},
            )
        with self.assertRaises(TrialValidationError):
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="not allowed!",
                expected_version=0,
                payload={},
            )
        with self.assertRaises(TrialValidationError):
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.order.saved",
                expected_version=-1,
                payload={},
            )
        with self.assertRaises(TrialValidationError):
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.order.saved",
                expected_version=0,
                payload={"invalid": float("nan")},
            )
        with self.assertRaises(TrialValidationError):
            self.store.create_approval(
                self.operator,
                command_id=str(uuid4()),
                title="Missing evidence",
                proposal={},
                evidence_refs=(),
            )
        with self.assertRaises(TrialValidationError):
            self.store.create_approval(
                self.operator,
                command_id=str(uuid4()),
                title="Opaque proposal",
                proposal={"release": "catalog-v1"},
                evidence_refs=("review://catalog/1",),
            )
        verified_without_digest = _decision_packet()
        del verified_without_digest["claims"][0]["digest"]  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            self.store.create_approval(
                self.operator,
                command_id=str(uuid4()),
                title="Unverifiable claim",
                proposal=verified_without_digest,
                evidence_refs=("review://catalog/1",),
            )
        with self.assertRaises(TrialValidationError):
            self.store.create_approval(
                self.operator,
                command_id=str(uuid4()),
                title="Mismatched provenance",
                proposal=_decision_packet(),
                evidence_refs=("review://different/1",),
            )


if __name__ == "__main__":
    unittest.main()
