"""Guard the store <-> schema contract for self-serve tenant creation.

The self-serve create path builds an INSERT into
app_private.workspace_access_controls, whose v6 columns are strict: authorization_id
is uuid NOT NULL, and authorization_contract has a CHECK. A regression once passed a
raw "self-serve-claim-<claim>" string for the uuid column (22P02) and a contract
value outside the CHECK set (23514) -- both aborting every real creation and only
surfacing on a hosted branch. These tests drive the REAL
PostgresTrialStore.create_self_serve_workspace through a recording fake connection
and assert the exact parameters it sends conform to the schema, so this bug class
fails a unit test in future, not only a live proof.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import os
import re
import unittest
from unittest.mock import patch
from uuid import UUID

from supermega_runtime.trial_store import (
    SELF_SERVE_ACTIVATION_AUTHORIZATION_CONTRACT,
    SELF_SERVE_OWNER_CAPABILITIES,
    PostgresTrialStore,
    SelfServeWorkspaceResult,
    TrialClaimConflict,
    _self_serve_command_identity,
)


ACTOR_ID = "2f8d24d8-308c-4dc8-a352-7b61df756728"
SESSION_ID = "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3"
CLAIM_CODE = "SM-ABCD-2345"
BUSINESS_NAME = "Yangon Self Serve Pilot"
PROJECT_REF = "eotfoiqjbwfjmfmtwszu"
RELEASE_COMMIT = "0" * 40

_V11_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase"
    / "migrations"
    / "20260816120000_private_trial_backend_v11_self_serve_grants.sql"
)


def _schema_allowed_contracts() -> frozenset[str]:
    """Parse the authorization_contract CHECK admitted by the v6+v11 schema."""

    text = _V11_MIGRATION.read_text(encoding="utf-8")
    match = re.search(
        r"add constraint workspace_access_controls_authorization_contract_check\s*"
        r"check\s*\(\s*authorization_contract in \(([^)]*)\)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError("v11 migration does not re-add the authorization_contract CHECK")
    return frozenset(value.strip().strip("'") for value in match.group(1).split(","))


def _reducer(surface, event_type, current, payload):  # pragma: no cover - never called
    raise AssertionError("reducer must not be invoked by create_self_serve_workspace")


class _FakeCursor:
    def __init__(self, connection: "_FakeConnection") -> None:
        self._connection = connection
        self._last = ""

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False

    def execute(self, sql: str, params: object = None) -> None:
        self._last = sql
        self._connection.calls.append((sql, params))

    def fetchone(self):
        sql = self._last
        if "access_status" in sql:
            return self._connection.read_back
        if "returning created_at" in sql:
            return {"created_at": self._connection.created_at}
        # workspace_events replay lookup and workspace_access_controls existence
        # lookup both return no prior row for a brand-new claim.
        return None

    def fetchall(self):
        # No prior memberships exist for a brand-new self-serve workspace.
        return []


class _FakeTransaction:
    def __enter__(self) -> "_FakeTransaction":
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False


class _FakeConnection:
    def __init__(self, *, created_at: datetime, read_back: dict) -> None:
        self.calls: list[tuple[str, object]] = []
        self.created_at = created_at
        self.read_back = read_back
        self._cursor = _FakeCursor(self)

    def __enter__(self) -> "_FakeConnection":
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction()

    def cursor(self) -> _FakeCursor:
        return self._cursor


class _RecordingStore(PostgresTrialStore):
    """Real store with the connection and server-side asserts stubbed.

    Only the transport is replaced; create_self_serve_workspace's own parameter
    construction (the code under test) is untouched.
    """

    def __init__(self, connection: _FakeConnection) -> None:
        super().__init__("postgresql://fixture/postgres", reducer=_reducer, write_enabled=True)
        self._fake_connection = connection

    def _connect(self):
        return self._fake_connection

    @staticmethod
    def _assert_runtime_role(cursor):
        return None

    @staticmethod
    def _assert_schema(cursor):
        return None

    @staticmethod
    def _assert_active_identity_session(cursor, principal):
        return None

    @staticmethod
    def _assert_audit(cursor):
        return None

    @staticmethod
    def _set_context(cursor, principal):
        return None

    @staticmethod
    def _lock(cursor, key):
        return None


class SelfServeStoreSchemaConformanceTests(unittest.TestCase):
    def _run_create(self) -> tuple[SelfServeWorkspaceResult, _FakeConnection]:
        workspace_id, command_id, fingerprint = _self_serve_command_identity(
            CLAIM_CODE, BUSINESS_NAME
        )
        connection = _FakeConnection(
            created_at=datetime(2026, 8, 16, tzinfo=timezone.utc),
            read_back={
                "access_status": "active",
                "membership_status": "active",
                "capabilities": sorted(SELF_SERVE_OWNER_CAPABILITIES),
                "command_fingerprint": fingerprint,
            },
        )
        store = _RecordingStore(connection)
        with patch.dict(
            os.environ,
            {
                "SUPERMEGA_SUPABASE_PROJECT_REF": PROJECT_REF,
                "SUPERMEGA_RELEASE_COMMIT": RELEASE_COMMIT,
            },
        ):
            result = store.create_self_serve_workspace(
                actor_id=ACTOR_ID,
                claim_code=CLAIM_CODE,
                business_name=BUSINESS_NAME,
                session_id=SESSION_ID,
                identity_provider="supabase",
            )
        self.assertEqual(result.workspace_id, workspace_id)
        self.assertEqual(result.event_id, command_id)
        return result, connection

    def _access_control_insert_params(self, connection: _FakeConnection) -> tuple:
        inserts = [
            params
            for sql, params in connection.calls
            if "insert into app_private.workspace_access_controls" in sql
        ]
        self.assertEqual(len(inserts), 1, "exactly one access-control INSERT expected")
        return inserts[0]

    def test_authorization_id_is_a_valid_uuid(self) -> None:
        _result, connection = self._run_create()
        params = self._access_control_insert_params(connection)
        # Column order: workspace_id, activation_id, authorization_id, ...
        activation_id = params[1]
        authorization_id = params[2]
        # The exact regression guard: a raw non-uuid string here is 22P02 on a
        # real database. str(UUID(...)) round-trips only for canonical uuids.
        self.assertEqual(str(UUID(str(activation_id))), str(activation_id))
        self.assertEqual(str(UUID(str(authorization_id))), str(authorization_id))
        self.assertNotEqual(activation_id, authorization_id)

    def test_authorization_contract_is_in_the_schema_allowed_set(self) -> None:
        _result, connection = self._run_create()
        params = self._access_control_insert_params(connection)
        authorization_contract = params[3]
        allowed = _schema_allowed_contracts()
        self.assertIn(authorization_contract, allowed)
        self.assertEqual(
            authorization_contract, SELF_SERVE_ACTIVATION_AUTHORIZATION_CONTRACT
        )

    def test_module_constant_matches_a_schema_allowed_contract(self) -> None:
        # Independent of any DB call: the constant the store inserts must be one
        # the v6+v11 CHECK admits, and the v11 migration must admit it.
        allowed = _schema_allowed_contracts()
        self.assertIn(SELF_SERVE_ACTIVATION_AUTHORIZATION_CONTRACT, allowed)
        self.assertEqual(
            allowed,
            frozenset(
                {
                    "managed_owner_approval_v1",
                    "legacy_migration_v1",
                    "self_serve_claim_v1",
                }
            ),
        )

    def test_access_control_scalar_fields_match_column_constraints(self) -> None:
        _result, connection = self._run_create()
        params = self._access_control_insert_params(connection)
        plan_digest = params[4]
        owner_actor_id = params[5]
        project_ref = params[6]
        release_commit = params[7]
        self.assertRegex(str(plan_digest), r"^[0-9a-f]{64}$")
        self.assertEqual(owner_actor_id, ACTOR_ID)
        self.assertRegex(str(project_ref), r"^[a-z0-9]{20}$")
        self.assertRegex(str(release_commit), r"^[0-9a-f]{40}$")


class _DuplicateKeyCursor(_FakeCursor):
    """Simulates the unique-constraint rejection a losing concurrent claimant
    hits: the SERIALIZABLE snapshot predates the advisory lock, so the guards
    read nothing and the access-control INSERT collides on workspace_id."""

    def execute(self, sql: str, params: object = None) -> None:
        if "insert into app_private.workspace_access_controls" in sql:
            error = Exception("duplicate key value violates unique constraint")
            error.sqlstate = "23505"
            raise error
        super().execute(sql, params)


class _DuplicateKeyConnection(_FakeConnection):
    def __init__(self, *, created_at: datetime, read_back: dict) -> None:
        super().__init__(created_at=created_at, read_back=read_back)
        self._cursor = _DuplicateKeyCursor(self)


class SelfServeClaimRaceConformanceTests(unittest.TestCase):
    def test_duplicate_key_on_access_control_insert_is_a_claim_conflict(self) -> None:
        connection = _DuplicateKeyConnection(
            created_at=datetime(2026, 8, 16, tzinfo=timezone.utc),
            read_back={},
        )
        store = _RecordingStore(connection)
        with patch.dict(
            os.environ,
            {
                "SUPERMEGA_SUPABASE_PROJECT_REF": PROJECT_REF,
                "SUPERMEGA_RELEASE_COMMIT": RELEASE_COMMIT,
            },
        ):
            with self.assertRaises(TrialClaimConflict) as raised:
                store.create_self_serve_workspace(
                    actor_id=ACTOR_ID,
                    claim_code=CLAIM_CODE,
                    business_name=BUSINESS_NAME,
                    session_id=SESSION_ID,
                    identity_provider="supabase",
                )
        # No driver detail (which can embed key values) may reach the caller.
        self.assertNotIn("duplicate key", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)


if __name__ == "__main__":
    unittest.main()
