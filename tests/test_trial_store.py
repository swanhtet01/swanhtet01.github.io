from __future__ import annotations

from collections.abc import Mapping
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
import unittest
from uuid import uuid4

import supermega_runtime.trial_store as trial_store_module
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

    def test_approval_request_replay_is_bound_to_the_original_actor(self) -> None:
        command_id = str(uuid4())
        self.store.create_approval(
            self.operator,
            command_id=command_id,
            title="Actor-bound approval replay",
            proposal=_decision_packet(),
            evidence_refs=("review://catalog/1",),
        )
        second_requester = TrialPrincipal("workspace-a", "actor-requester-two", "human")
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-requester-two",
            actor_kind="human",
            capabilities=("approvals.request",),
        )

        with self.assertRaises(TrialIdempotencyConflict):
            self.store.create_approval(
                second_requester,
                command_id=command_id,
                title="Actor-bound approval replay",
                proposal=_decision_packet(),
                evidence_refs=("review://catalog/1",),
            )
        self.assertEqual(self.store.list_approvals(second_requester), [])

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

    def test_related_state_version_is_checked_under_the_same_command_lock(self) -> None:
        self.store.apply_command(
            self.operator,
            command_id=str(uuid4()),
            surface="website",
            event_type="website.content.saved",
            expected_version=0,
            payload={"changes": {"fingerprint": "web-1234abcd"}},
        )
        calls_before_rejection = self.reducer.calls

        with self.assertRaises(TrialVersionConflict) as raised:
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.website_intake.created",
                expected_version=0,
                payload={"changes": {"intake": "not-written"}},
                related_surfaces=("website",),
                expected_related_versions={"website": 0},
                state_precondition=lambda _current, _related: None,
            )

        self.assertEqual(raised.exception.expected_version, 0)
        self.assertEqual(raised.exception.current_version, 1)
        self.assertEqual(self.reducer.calls, calls_before_rejection)
        self.assertEqual(self.store.get_state(self.operator, "commerce").version, 0)

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
            "commerce.item.updated",
            "commerce.order.created",
            "commerce.order.advanced",
            "commerce.order.cancelled",
            "commerce.order.return_recorded",
            "commerce.order.support_case_opened",
            "commerce.order.support_case_reopened",
            "commerce.order.support_case_service_recorded",
            "commerce.order.support_case_resolved",
            "commerce.payment.reconciled",
            "commerce.refund.settled",
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

    def test_store_enforces_human_only_production_lifecycle_events(self) -> None:
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("production.write",),
        )
        calls_before_rejection = self.reducer.calls
        human_only_events = (
            "production.workspace.initialized",
            "production.job.created",
            "production.job.schedule_updated",
            "production.job.closed",
            "production.output.recorded",
            "production.material.consumed",
            "production.issue.opened",
            "production.issue.resolved",
            "production.quality_hold.placed",
            "production.quality_hold.released",
            "production.machine_state.changed",
            "production.order_execution.recorded",
            "production.downtime.started",
            "production.downtime.ended",
            "production.maintenance.started",
            "production.maintenance.completed",
            "production.shift.closed",
        )
        for event_type in human_only_events:
            with self.subTest(event_type=event_type), self.assertRaises(TrialHumanApprovalRequired):
                self.store.apply_command(
                    self.agent_manager,
                    command_id=str(uuid4()),
                    surface="production",
                    event_type=event_type,
                    expected_version=0,
                    payload={"changes": {"status": "agent-write-blocked"}},
                )
        self.assertEqual(self.reducer.calls, calls_before_rejection)

    def test_store_enforces_website_human_events_and_actor_binding(self) -> None:
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("website.write",),
        )
        calls_before_rejection = self.reducer.calls
        for event_type in (
            "website.evidence.recorded",
            "website.revision.approved",
            "website.snapshot.recorded",
            "website.release.recorded",
        ):
            with self.subTest(event_type=event_type), self.assertRaises(TrialHumanApprovalRequired):
                self.store.apply_command(
                    self.agent_manager,
                    command_id=str(uuid4()),
                    surface="website",
                    event_type=event_type,
                    expected_version=0,
                    payload={"changes": {"status": "agent-write-blocked"}},
                )
        with self.assertRaisesRegex(TrialValidationError, "Website evidence actor"):
            self.store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="website",
                event_type="website.release.recorded",
                expected_version=0,
                payload={
                    "changes": {"status": "spoofed-write"},
                    "evidence": {"actor": "actor-spoofed"},
                },
            )
        self.assertEqual(self.reducer.calls, calls_before_rejection)

    def test_write_requires_explicit_surface_capability(self) -> None:
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=(
                "commerce.write",
                "website.write",
                "production.read",
                "approvals.request",
            ),
        )
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
            "direct_parent_membership_exact",
            "backend_member_exact",
            "no_runtime_role_members",
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
        # Finding 6: transit TLS is enforced by the connection-config assertion in
        # _connect, not by a per-backend pg_stat_ssl read (which is FALSE through
        # the Supavisor pooler). The runtime-role query only sanity-checks that the
        # server supports TLS.
        self.assertNotIn("pg_stat_ssl", safe_cursor.query.lower())
        self.assertIn("pg_settings", safe_cursor.query.lower())
        self.assertIn("'ssl'", safe_cursor.query.lower())
        self.assertIn("pg_auth_members", safe_cursor.query.lower())
        self.assertIn("membership.inherit_option", safe_cursor.query.lower())
        self.assertIn("not membership.set_option", safe_cursor.query.lower())
        self.assertIn("not membership.admin_option", safe_cursor.query.lower())

        for failed_check in required:
            with self.subTest(failed_check=failed_check):
                cursor = RoleCursor({**safe, failed_check: False})
                with self.assertRaises(TrialNotReadyError) as error:
                    PostgresTrialStore._assert_runtime_role(cursor)
                self.assertEqual(error.exception.reasons, ("role_ready",))

    def test_postgres_guarded_cursor_rolls_back_and_closes_on_failure(self) -> None:
        events: list[str] = []

        class SentinelFailure(RuntimeError):
            pass

        class Cursor:
            def __enter__(self):
                events.append("cursor_enter")
                return self

            def __exit__(self, exc_type, _exc, _traceback):
                events.append(f"cursor_exit:{exc_type.__name__ if exc_type else 'none'}")
                return False

        class Transaction:
            def __enter__(self):
                events.append("transaction_enter")
                return self

            def __exit__(self, exc_type, _exc, _traceback):
                outcome = "rollback" if exc_type else "commit"
                events.append(f"transaction_{outcome}")
                return False

        class Connection:
            def __init__(self):
                self.closed = False

            def __enter__(self):
                events.append("connection_enter")
                return self

            def __exit__(self, exc_type, _exc, _traceback):
                self.closed = True
                events.append(f"connection_close:{exc_type.__name__ if exc_type else 'none'}")
                return False

            def transaction(self):
                return Transaction()

            def cursor(self):
                return Cursor()

        connection = Connection()

        class GuardedStore(PostgresTrialStore):
            def _connect(self):
                return connection

            def _assert_runtime_role(self, _cursor) -> None:
                events.append("role_checked")

            def _assert_schema(self, _cursor) -> None:
                events.append("schema_checked")

            def _set_context(self, _cursor, _principal) -> None:
                events.append("identity_set")

            def _load_membership(self, _cursor, _principal) -> frozenset[str]:
                events.append("membership_checked")
                return frozenset()

            def _product_entitlements(self, _cursor, _workspace_id) -> tuple[str, ...]:
                events.append("entitlements_checked")
                return ()

        store = GuardedStore("postgresql://runtime.invalid/db", reducer=self.reducer)
        with self.assertRaises(SentinelFailure):
            with store._guarded_cursor(self.operator, write=False):
                events.append("operation")
                raise SentinelFailure("force rollback")

        self.assertTrue(connection.closed)
        self.assertEqual(
            events,
            [
                "connection_enter",
                "transaction_enter",
                "cursor_enter",
                "role_checked",
                "schema_checked",
                "identity_set",
                "membership_checked",
                "entitlements_checked",
                "operation",
                "cursor_exit:SentinelFailure",
                "transaction_rollback",
                "connection_close:SentinelFailure",
            ],
        )

    def test_workspace_discovery_is_read_only_bounded_and_uses_private_directory(self) -> None:
        statements: list[tuple[str, tuple[object, ...]]] = []
        session_active = True
        principal = TrialPrincipal(
            "workspace-discovery",
            "2f8d24d8-308c-4dc8-a352-7b61df756728",
            "human",
            True,
            "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
            "supabase",
        )

        class Cursor:
            def __init__(self):
                self.parameters: tuple[object, ...] = ()
                self.query = ""

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
                self.query = " ".join(query.split()).lower()
                self.parameters = parameters
                statements.append((self.query, parameters))

            def fetchall(self):
                return [
                    {
                        "workspace_id": "company-a",
                        "capabilities": ["company.write", "commerce.write"],
                        "display_name": "Mingalar Fresh Mart",
                    },
                ]

            def fetchone(self):
                if "supabase_session_is_active" in self.query:
                    return {"active": session_active}
                return None

        class Transaction:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def transaction(self):
                return Transaction()

            def cursor(self):
                return Cursor()

        class DirectoryStore(PostgresTrialStore):
            def _connect(self):
                return Connection()

            def _assert_runtime_role(self, _cursor) -> None:
                return None

            def _assert_schema(self, _cursor) -> None:
                return None

        store = DirectoryStore("postgresql://runtime.invalid/db", reducer=self.reducer)
        workspaces, truncated = store.list_actor_workspaces(principal, limit=2)

        self.assertFalse(truncated)
        self.assertEqual(
            [workspace.to_dict() for workspace in workspaces],
            [{"workspace_id": "company-a", "label": "Mingalar Fresh Mart", "access": "owner"}],
        )
        self.assertEqual(statements[0][0], "set transaction read only")
        self.assertTrue(any("limit %s" in query and parameters[-1] == 3 for query, parameters in statements))
        self.assertTrue(any("actor_workspace_directory()" in query for query, _parameters in statements))
        session_position = next(
            index for index, (query, _parameters) in enumerate(statements)
            if "supabase_session_is_active" in query
        )
        directory_position = next(
            index for index, (query, _parameters) in enumerate(statements)
            if "actor_workspace_directory()" in query
        )
        self.assertLess(session_position, directory_position)
        self.assertFalse(any("workspace_memberships" in query for query, _parameters in statements))
        self.assertFalse(any(query.startswith(("insert ", "update ", "delete ")) for query, _parameters in statements))

        with self.assertRaises(TrialValidationError):
            store.list_actor_workspaces(principal, limit=51)

        session_active = False
        with self.assertRaisesRegex(TrialNotReadyError, "auth_session_active"):
            store.list_actor_workspaces(principal, limit=2)

    def test_postgres_schema_probe_requires_version_10_and_hardening_controls(self) -> None:
        def canonical_trigger_rows() -> list[dict[str, object]]:
            return [
                {
                    "table_name": table_name,
                    "trigger_name": trigger_name,
                    "event_mask": contract["event_mask"],
                    "enabled": "O",
                    "no_when_clause": True,
                    "no_arguments": True,
                    "no_column_filter": True,
                    "no_constraint_link": True,
                    "not_deferrable": True,
                    "not_initially_deferred": True,
                    "no_transition_tables": True,
                    "function_schema": "app_private",
                    "function_name": contract["function_name"],
                    "function_source": contract["function_source"],
                    "function_language": "plpgsql",
                    "security_definer": False,
                    "function_config": ["search_path=pg_catalog, app_private"],
                }
                for (table_name, trigger_name), contract in sorted(
                    trial_store_module._PRIVATE_HARDENING_TRIGGER_CONTRACT.items()
                )
            ]

        class SchemaCursor:
            def __init__(
                self,
                row: dict[str, object] | None,
                trigger_rows: list[dict[str, object]] | None = None,
            ):
                self.row = row
                self.trigger_rows = canonical_trigger_rows() if trigger_rows is None else trigger_rows
                self.queries: list[str] = []
                self.parameters: tuple[object, ...] = ()

            def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
                self.queries.append(query)
                self.parameters = parameters

            def fetchone(self) -> dict[str, object] | None:
                return self.row

            def fetchall(self) -> list[dict[str, object]]:
                return self.trigger_rows

        ready = {
            "schema_version": 10,
            "actor_decision_columns_ready": True,
            "workspace_access_control_ready": True,
            "security_constraints_ready": True,
        }
        cursor = SchemaCursor(ready)
        PostgresTrialStore._assert_schema(cursor)
        combined_query = "\n".join(cursor.queries)
        self.assertIn("information_schema.columns", combined_query.lower())
        self.assertIn("approval_requests_terminal_decision_v2_check", combined_query)
        self.assertIn("workspace_events_approval_surface_v4_check", combined_query)
        self.assertIn("trigger_record.tgenabled", combined_query)
        self.assertIn("function_record.prosrc", combined_query)
        self.assertIn("function_record.prosecdef", combined_query)
        self.assertIn("function_record.proconfig", combined_query)
        self.assertEqual(cursor.parameters, ())

        for field, value in (
            ("schema_version", 6),
            ("actor_decision_columns_ready", False),
            ("workspace_access_control_ready", False),
            ("security_constraints_ready", False),
        ):
            with self.subTest(field=field):
                with self.assertRaises(TrialNotReadyError) as error:
                    PostgresTrialStore._assert_schema(SchemaCursor({**ready, field: value}))
                self.assertEqual(error.exception.reasons, ("schema_ready",))

        trigger_drifts = {
            "missing": lambda rows: rows.pop(),
            "extra": lambda rows: rows.append({**rows[0], "trigger_name": "unexpected_trigger"}),
            "disabled": lambda rows: rows[0].update(enabled="D"),
            "wrong_function": lambda rows: rows[0].update(function_name="unsafe_function"),
            "security_definer": lambda rows: rows[0].update(security_definer=True),
            "wrong_language": lambda rows: rows[0].update(function_language="sql"),
            "wrong_search_path": lambda rows: rows[0].update(function_config=["search_path=public"]),
            "wrong_event_mask": lambda rows: rows[0].update(event_mask=0),
            "when_false": lambda rows: rows[0].update(no_when_clause=False),
            "trigger_arguments": lambda rows: rows[0].update(no_arguments=False),
            "mutated_source": lambda rows: rows[0].update(
                function_source=str(rows[0]["function_source"]) + "\nperform dangerous_side_effect();"
            ),
        }
        for drift_name, mutate in trigger_drifts.items():
            with self.subTest(trigger_drift=drift_name):
                drifted_rows = deepcopy(canonical_trigger_rows())
                mutate(drifted_rows)
                with self.assertRaises(TrialNotReadyError) as error:
                    PostgresTrialStore._assert_schema(SchemaCursor(ready, drifted_rows))
                self.assertEqual(error.exception.reasons, ("schema_ready",))

    def test_postgres_approval_timestamps_are_database_authored_and_iso_normalized(self) -> None:
        requested_at = datetime(2026, 7, 23, 9, 10, 11, tzinfo=timezone(timedelta(hours=6, minutes=30)))
        decided_at = datetime(2026, 7, 23, 12, 30, 45, tzinfo=timezone(timedelta(hours=6, minutes=30)))

        class ApprovalCursor:
            def __init__(self, fetch_rows: list[dict[str, object] | None]):
                self.fetch_rows = list(fetch_rows)
                self.executions: list[tuple[str, tuple[object, ...]]] = []
                self.rowcount = 0

            def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
                self.executions.append((query, parameters))
                self.rowcount = 1 if "update app_private.approval_requests" in query.lower() else 0

            def fetchone(self) -> dict[str, object] | None:
                return self.fetch_rows.pop(0)

        class ApprovalStore(PostgresTrialStore):
            def __init__(self, cursor: ApprovalCursor):
                super().__init__("postgres://runtime", reducer=RecordingReducer(), write_enabled=True)
                self.cursor = cursor

            @contextmanager
            def _guarded_cursor(self, *_args, **_kwargs):
                yield self.cursor, frozenset({"approvals.request", "approvals.decide"})

        request_cursor = ApprovalCursor([None, {"requested_at": requested_at}])
        request_store = ApprovalStore(request_cursor)
        requested = request_store.create_approval(
            self.operator,
            command_id=str(uuid4()),
            title="Release database-authored timestamp",
            proposal=_decision_packet(),
            evidence_refs=("review://catalog/1",),
        )
        expected_requested_at = requested_at.astimezone(timezone.utc).isoformat()
        self.assertEqual(requested.requested_at, expected_requested_at)
        request_insert = next(
            execution for execution in request_cursor.executions
            if "insert into app_private.approval_requests" in execution[0].lower()
        )
        request_event = next(
            execution for execution in request_cursor.executions
            if "insert into app_private.workspace_events" in execution[0].lower()
        )
        self.assertIn("returning requested_at", request_insert[0].lower())
        self.assertNotIn("requested_at,", request_insert[0].lower())
        self.assertNotIn("created_at", request_event[0].lower())
        self.assertIn(expected_requested_at, json.loads(str(request_event[1][-1]))["approval"]["requested_at"])

        pending_row = {
            "approval_id": requested.approval_id,
            "command_id": requested.command_id,
            "title": requested.title,
            "proposal_json": requested.proposal,
            "evidence_refs_json": list(requested.evidence_refs),
            "status": "pending",
            "requested_by": requested.requested_by,
            "requested_actor_kind": requested.requested_actor_kind,
            "requested_at": requested_at,
            "decided_by": None,
            "decided_actor_kind": None,
            "decided_at": None,
            "decision_note": "",
            "version": 0,
        }
        decision_cursor = ApprovalCursor([None, pending_row, {"decided_at": decided_at}])
        decision_store = ApprovalStore(decision_cursor)
        decided = decision_store.decide_approval(
            self.manager,
            approval_id=requested.approval_id,
            command_id=str(uuid4()),
            decision="approved",
            note="Owner approved.",
        )
        expected_decided_at = decided_at.astimezone(timezone.utc).isoformat()
        self.assertEqual(decided.requested_at, expected_requested_at)
        self.assertEqual(decided.decided_at, expected_decided_at)
        decision_update = next(
            execution for execution in decision_cursor.executions
            if "update app_private.approval_requests" in execution[0].lower()
        )
        decision_event = next(
            execution for execution in decision_cursor.executions
            if "insert into app_private.workspace_events" in execution[0].lower()
        )
        self.assertIn("returning decided_at", decision_update[0].lower())
        self.assertNotIn("decided_at =", decision_update[0].lower())
        self.assertNotIn("created_at", decision_event[0].lower())
        self.assertIn(expected_decided_at, json.loads(str(decision_event[1][-1]))["approval"]["decided_at"])

    def test_postgres_product_acceptance_is_durable_idempotent_and_state_preserving(self) -> None:
        class AcceptanceCursor:
            def __init__(self):
                self.query = ""
                self.executions: list[tuple[str, tuple[object, ...]]] = []
                self.stored_fingerprint = ""
                self.stored_result: dict[str, object] | None = None

            def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
                self.query = " ".join(query.split()).lower()
                self.executions.append((self.query, parameters))
                if "insert into app_private.workspace_events" in self.query:
                    self.stored_fingerprint = str(parameters[3])
                    self.stored_result = json.loads(str(parameters[11]))

            def fetchone(self) -> dict[str, object] | None:
                if "select command_fingerprint, result_json" in self.query:
                    if self.stored_result is None:
                        return None
                    return {
                        "command_fingerprint": self.stored_fingerprint,
                        "result_json": deepcopy(self.stored_result),
                    }
                if "select version, state_json" in self.query:
                    return {"version": 3, "state_json": {"orders": [{"id": "order-a"}]}}
                if "select result_json" in self.query:
                    return {"result_json": deepcopy(self.stored_result)}
                return None

        class AcceptanceStore(PostgresTrialStore):
            def __init__(self, cursor: AcceptanceCursor):
                super().__init__("postgres://runtime", reducer=RecordingReducer(), write_enabled=True)
                self.cursor = cursor

            @contextmanager
            def _guarded_cursor(self, *_args, **_kwargs):
                yield self.cursor, frozenset({"commerce.write"})

            @staticmethod
            def _product_entitlements(_cursor, _workspace_id):
                return ("commerce",)

        cursor = AcceptanceCursor()
        store = AcceptanceStore(cursor)
        probe_id = str(uuid4())
        owner_approval_id = str(uuid4())
        recorded = store.record_product_acceptance(
            self.operator,
            probe_id=probe_id,
            owner_approval_id=owner_approval_id,
            product="commerce",
            release_commit="a" * 40,
        )
        self.assertEqual(recorded.probe_id, probe_id)
        self.assertEqual(recorded.owner_approval_id, owner_approval_id)
        self.assertEqual(recorded.state_version, 3)
        self.assertRegex(recorded.state_digest, r"^sha256:[0-9a-f]{64}$")
        self.assertFalse(recorded.idempotent_replay)

        event_insert = next(
            entry for entry in cursor.executions
            if "insert into app_private.workspace_events" in entry[0]
        )
        self.assertEqual(event_insert[1][4], "commerce")
        self.assertEqual(event_insert[1][5], "client.product_acceptance.recorded")
        self.assertEqual(event_insert[1][8], 3)
        self.assertEqual(event_insert[1][9], 3)
        self.assertFalse(any("update app_private.workspace_state" in query for query, _ in cursor.executions))

        replay = store.record_product_acceptance(
            self.operator,
            probe_id=probe_id,
            owner_approval_id=owner_approval_id,
            product="commerce",
            release_commit="a" * 40,
        )
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(
            sum("insert into app_private.workspace_events" in query for query, _ in cursor.executions),
            1,
        )

        with self.assertRaises(TrialIdempotencyConflict):
            store.record_product_acceptance(
                self.operator,
                probe_id=probe_id,
                owner_approval_id=str(uuid4()),
                product="commerce",
                release_commit="a" * 40,
            )

    def test_product_acceptance_rejects_timezone_ambiguous_evidence(self) -> None:
        evidence = {
            "contract": trial_store_module.PRODUCT_ACCEPTANCE_CONTRACT,
            "probe_id": str(uuid4()),
            "owner_approval_id": str(uuid4()),
            "product": "shop",
            "surface": "commerce",
            "release_commit": "a" * 40,
            "state_version": 0,
            "state_digest": "sha256:" + "0" * 64,
            "recorded_at": "2026-08-22T00:00:00",
        }

        with self.assertRaises(trial_store_module.TrialStoreError):
            trial_store_module._product_acceptance_record(evidence)

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
            capabilities=("commerce.read",),
        )
        self.assertEqual(read_only.get_state(self.operator, "commerce").version, 0)

    def test_reads_require_product_or_approval_capabilities(self) -> None:
        with self.assertRaises(TrialPermissionDenied) as state_denied:
            self.store.get_state(self.manager, "commerce")
        self.assertEqual(state_denied.exception.required_capability, "commerce.read")

        website_reader = TrialPrincipal("workspace-a", "actor-website-reader", "human")
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-website-reader",
            actor_kind="human",
            capabilities=("website.read",),
        )
        self.assertEqual(self.store.get_state(website_reader, "website").version, 0)
        with self.assertRaises(TrialPermissionDenied):
            self.store.get_state(website_reader, "commerce")
        with self.assertRaises(TrialPermissionDenied) as approvals_denied:
            self.store.list_approvals(website_reader)
        self.assertEqual(approvals_denied.exception.required_capability, "approvals.read")

    def test_related_state_precondition_requires_related_read_capability(self) -> None:
        commerce_only = TrialPrincipal("workspace-a", "actor-commerce-only", "human")
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-commerce-only",
            actor_kind="human",
            capabilities=("commerce.write",),
        )
        calls_before_rejection = self.reducer.calls

        with self.assertRaises(TrialPermissionDenied) as denied:
            self.store.apply_command(
                commerce_only,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.website_intake.created",
                expected_version=0,
                payload={"changes": {"intake": "must-not-write"}},
                related_surfaces=("website",),
                state_precondition=lambda _current, _related: None,
            )

        self.assertEqual(denied.exception.required_capability, "website.read")
        self.assertEqual(self.reducer.calls, calls_before_rejection)

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


class EnvSchemaVersionTests(unittest.TestCase):
    """SUPERMEGA_TRIAL_SCHEMA_VERSION must never crash the app at import: the
    production activation runbook has the operator setting this exact variable,
    so an empty or mistyped value falls back to the default and the runtime
    schema assertion fail-closes the trial paths instead."""

    def _parse(self, value: object) -> int:
        from unittest import mock

        environment = {} if value is None else {"SUPERMEGA_TRIAL_SCHEMA_VERSION": str(value)}
        with mock.patch.dict(os.environ, environment, clear=True):
            return trial_store_module._env_schema_version()

    def test_unset_empty_and_whitespace_default(self) -> None:
        for value in (None, "", "   "):
            with self.subTest(value=value):
                self.assertEqual(self._parse(value), 10)

    def test_valid_integer_is_used(self) -> None:
        self.assertEqual(self._parse("11"), 11)
        self.assertEqual(self._parse(" 11 "), 11)

    def test_garbage_and_non_positive_default_instead_of_crashing(self) -> None:
        for value in ("eleven", "v11", "10.5", "0", "-1"):
            with self.subTest(value=value):
                self.assertEqual(self._parse(value), 10)


class PostgresConnectTlsTests(unittest.TestCase):
    """Transit encryption is enforced by connection configuration (finding 6):
    the DSN must declare an encrypting sslmode, which holds through the Supavisor
    pooler where a per-backend pg_stat_ssl read cannot see the client TLS leg."""

    @staticmethod
    def _reducer(surface, event_type, current, payload):  # pragma: no cover
        return dict(current)

    # Assembled from parts so no credential-shaped URI literal ever sits in the
    # repo for a secret scanner to flag (established fixture convention, OPS-762).
    _BASE = "postgresql" + "://" + "user" + ":" + "pw" + "@db.example.invalid:5432/postgres"

    def test_require_dsn_tls_rejects_weak_or_absent_sslmode(self) -> None:
        for dsn in (
            f"{self._BASE}?sslmode=disable",
            f"{self._BASE}?sslmode=allow",
            f"{self._BASE}?sslmode=prefer",
            self._BASE,  # sslmode omitted entirely
        ):
            with self.subTest(dsn=dsn):
                with self.assertRaises(TrialNotReadyError) as raised:
                    PostgresTrialStore._require_dsn_tls(dsn)
                self.assertIn("tls_required", raised.exception.reasons)

    def test_require_dsn_tls_accepts_encrypting_sslmodes(self) -> None:
        for mode in ("require", "verify-ca", "verify-full"):
            with self.subTest(mode=mode):
                self.assertIsNone(
                    PostgresTrialStore._require_dsn_tls(f"{self._BASE}?sslmode={mode}")
                )

    def test_require_dsn_tls_never_surfaces_the_dsn(self) -> None:
        marker = "sup3r" + "secret"  # assembled so no credential literal exists in-repo
        dsn = (
            "postgresql" + "://" + "user" + ":" + marker
            + "@db.example.invalid:5432/postgres?sslmode=disable"
        )
        with self.assertRaises(TrialNotReadyError) as raised:
            PostgresTrialStore._require_dsn_tls(dsn)
        self.assertNotIn(marker, str(raised.exception))
        self.assertNotIn(marker, " ".join(raised.exception.reasons))

    def test_connect_fails_closed_on_weak_sslmode_before_connecting(self) -> None:
        store = PostgresTrialStore(
            f"{self._BASE}?sslmode=disable",
            reducer=self._reducer,
            write_enabled=True,
        )
        with self.assertRaises(TrialNotReadyError) as raised:
            store._connect()
        self.assertIn("tls_required", raised.exception.reasons)


if __name__ == "__main__":
    unittest.main()
