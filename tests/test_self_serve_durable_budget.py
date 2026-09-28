"""Focused admission proof; never accepts an existing database URL.

Unit wiring always runs. Opt-in SUPERMEGA_TEST_DISPOSABLE_PG17=1 starts ONE
new loopback/TLS/SCRAM cluster using the repo's existing rehearsal helpers and
removes only that temporary cluster after stopping it. Tests exercise actual
SQL, runtime-role checks and session checks; the unrelated v13 schema probe is
stubbed because this is a capability test, not the full migration rehearsal.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from supermega_runtime.trial_store import (
    PostgresTrialStore, TrialNotReadyError, TrialPrincipal, TrialRateLimited,
    TrialClaimConflict,
)
from tests.test_self_serve_store_schema_conformance import (
    _RecordingStore, _FakeConnection, _DuplicateKeyConnection,
    ACTOR_ID, SESSION_ID, CLAIM_CODE, BUSINESS_NAME, PROJECT_REF, RELEASE_COMMIT,
)

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260907024457_self_serve_durable_attempt_budget.sql"
STAMP = datetime(2026, 9, 7, tzinfo=timezone.utc)


class DurableBudgetWiringTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "SUPERMEGA_SUPABASE_PROJECT_REF": PROJECT_REF,
            "SUPERMEGA_RELEASE_COMMIT": RELEASE_COMMIT,
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def create(self, store):
        return store.create_self_serve_workspace(
            actor_id=ACTOR_ID, claim_code=CLAIM_CODE, business_name=BUSINESS_NAME,
            session_id=SESSION_ID, identity_provider="supabase",
        )

    def test_denied_admission_never_connects_for_workspace(self):
        store = _RecordingStore(_FakeConnection(created_at=STAMP, read_back={}))
        with patch.object(store, "_self_serve_budget_transaction", return_value=None), \
             patch.object(store, "_connect") as connection:
            with self.assertRaises(TrialRateLimited):
                self.create(store)
        connection.assert_not_called()
        self.assertFalse(hasattr(store, "_self_serve_attempts"))

    def test_invalid_admission_shape_fails_closed(self):
        store = _RecordingStore(_FakeConnection(created_at="not-server-time", read_back={}))
        with self.assertRaises(TrialNotReadyError):
            self.create(store)
        self.assertFalse(any("workspace_access_controls" in sql
                             for sql, _ in store._fake_connection.calls))

    def test_uncertain_admission_commit_never_connects_for_workspace(self):
        class CommitFailure(_FakeConnection):
            def __exit__(self, *_exc):
                raise RuntimeError("synthetic sensitive driver detail")
        conn = CommitFailure(created_at=STAMP, read_back={})
        store = _RecordingStore(conn)
        with self.assertRaises(TrialNotReadyError) as raised:
            self.create(store)
        self.assertNotIn("driver detail", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)
        self.assertFalse(any("workspace_access_controls" in sql for sql, _ in conn.calls))

    def test_conflict_mark_follows_rolled_back_workspace_transaction(self):
        events = []
        class TrackingConnection(_DuplicateKeyConnection):
            def __exit__(self, exc_type, *_exc):
                events.append("rollback" if exc_type else "commit")
                return False
        conn = TrackingConnection(created_at=STAMP, read_back={})
        store = _RecordingStore(conn)
        original = store._self_serve_budget_transaction
        def track(principal, *, conflict_at=None):
            if conflict_at is not None:
                self.assertEqual(events, ["commit", "rollback"])
                self.assertEqual(conflict_at, STAMP)
            return original(principal, conflict_at=conflict_at)
        with patch.object(store, "_self_serve_budget_transaction", side_effect=track):
            with self.assertRaises(TrialClaimConflict):
                self.create(store)
        self.assertEqual(events, ["commit", "rollback", "commit"])


@unittest.skipUnless(os.getenv("SUPERMEGA_TEST_DISPOSABLE_PG17") == "1",
                     "explicit disposable loopback SQL test only")
class DurableBudgetPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from tools import rehearse_supermega_postgres17 as pg
        import psycopg
        from psycopg import sql
        cls.pg = pg
        cls.psycopg = psycopg
        cls.bin = pg._default_postgres_bin()
        if not (cls.bin / ("postgres.exe" if os.name == "nt" else "postgres")).is_file():
            raise RuntimeError("Existing local PostgreSQL 17 required; no install or remote fallback")
        cls.temp = tempfile.TemporaryDirectory(prefix="supermega-budget-pg17-")
        cls.root = Path(cls.temp.name).resolve()
        if cls.root.parent != Path(tempfile.gettempdir()).resolve() or not cls.root.name.startswith("supermega-budget-pg17-"):
            raise RuntimeError("Unexpected disposable cluster path")
        cls.data = cls.root / "data"
        cls.environment = pg._clean_environment(cls.bin)
        cls.port = pg._free_loopback_port()
        cls.started = False
        cls.addClassCleanup(cls.cleanup_cluster)
        admin_secret = secrets.token_urlsafe(32)
        runtime_secret = secrets.token_urlsafe(32)
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(),
            data_directory=cls.data, admin_password=admin_secret,
            port=cls.port, environment=cls.environment)
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data,
            log_file=cls.root / "postgres.log", port=cls.port, environment=cls.environment)
        cls.started = True
        cls.admin = pg._connection_url("postgres", admin_secret, cls.port, "postgres")
        cls.runtime = pg._connection_url("budget_runtime", runtime_secret, cls.port, "postgres")
        with psycopg.connect(cls.admin, autocommit=True) as conn:
            conn.execute("create role anon nologin; create role authenticated nologin; "
                         "create role supermega_trial_backend nologin nobypassrls; "
                         "create schema app_private; "
                         "grant usage on schema app_private to supermega_trial_backend")
            conn.execute(sql.SQL("create role budget_runtime login nosuperuser nobypassrls "
                                 "nocreatedb nocreaterole noreplication password {}")
                         .format(sql.Literal(runtime_secret)))
            conn.execute("grant supermega_trial_backend to budget_runtime "
                         "with inherit true, set false, admin false")
            # Synthetic session registry; production method still performs its real
            # active-session SQL call, but this is not hosted Supabase session proof.
            conn.execute("create table app_private.test_sessions(actor uuid, session uuid); "
                         "grant select on app_private.test_sessions to supermega_trial_backend")
            conn.execute("""create function app_private.supabase_session_is_active(uuid, uuid)
                returns boolean language sql security invoker set search_path = '' as
                'select exists(select 1 from app_private.test_sessions where actor=$1 and session=$2)';
                revoke all on function app_private.supabase_session_is_active(uuid,uuid) from public;
                grant execute on function app_private.supabase_session_is_active(uuid,uuid) to supermega_trial_backend""")
            conn.execute(MIGRATION.read_text(encoding="utf-8"))

    @classmethod
    def cleanup_cluster(cls):
        if cls.data.exists():
            stopped = cls.pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                                          environment=cls.environment)
            if not stopped:
                # Do not remove live data; leave exact isolated path for recovery.
                cls.temp._finalizer.detach()
                raise RuntimeError("Disposable cluster stop failed; data retained")
        if cls.root.parent != Path(tempfile.gettempdir()).resolve() or not cls.root.name.startswith("supermega-budget-pg17-"):
            raise RuntimeError("Refusing unexpected cleanup path")
        cls.temp.cleanup()

    def setUp(self):
        self.actor, self.session = str(uuid4()), str(uuid4())
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("insert into app_private.test_sessions values (%s::uuid,%s::uuid)",
                         (self.actor, self.session))

    def principal(self, *, actor=None, session=None, kind="human"):
        return TrialPrincipal(workspace_id=str(uuid4()), actor_id=actor or self.actor,
            actor_kind=kind, authenticated=True, session_id=session or self.session,
            identity_provider="supabase").normalized()

    def store(self):
        class CapabilityStore(PostgresTrialStore):
            @staticmethod
            def _assert_schema(cursor):
                pass  # Explicitly not the unrelated full v13 schema rehearsal.
        return CapabilityStore(self.runtime, reducer=lambda *_: None, write_enabled=True)

    def reserve(self, principal=None):
        return self.store()._self_serve_budget_transaction(principal or self.principal())

    def row(self):
        with self.psycopg.connect(self.admin) as conn:
            return conn.execute("select attempts,claim_conflicts from app_private.self_serve_attempt_budgets "
                                "where actor_id=%s::uuid", (self.actor,)).fetchone()

    def test_budget_persists_across_new_store_instances_and_workspaces(self):
        for _ in range(5):
            self.assertIsInstance(self.reserve(), datetime)
        self.assertIsNone(self.reserve())
        self.assertEqual(len(self.row()[0]), 5)

    def test_budget_survives_actual_database_restart(self):
        for _ in range(5):
            self.reserve()
        self.assertTrue(self.pg._stop_cluster(postgres_bin=self.bin, data_directory=self.data,
                                             environment=self.environment))
        self.pg._start_cluster(postgres_bin=self.bin, data_directory=self.data,
            log_file=self.root / "postgres.log", port=self.port, environment=self.environment)
        self.assertIsNone(self.reserve())
        self.assertEqual(len(self.row()[0]), 5)

    def test_simultaneous_workers_admit_exactly_five(self):
        # Deliberate bounded concurrency test, not parallel build/model workers.
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.reserve(), range(8)))
        self.assertEqual(sum(item is not None for item in results), 5)
        self.assertEqual(len(set(item for item in results if item is not None)), 5)
        self.assertEqual(len(self.row()[0]), 5)

    def test_rolling_expiry_prunes_only_expired_slots(self):
        for _ in range(5):
            self.reserve()
        with self.psycopg.connect(self.admin) as conn:
            # Deterministic server-time fixture; no caller timestamp input exists.
            conn.execute("update app_private.self_serve_attempt_budgets set attempts = "
                         "array[clock_timestamp()-interval '25 hours'] || attempts[2:5] "
                         "where actor_id=%s::uuid", (self.actor,))
        self.assertIsNotNone(self.reserve())
        self.assertIsNone(self.reserve())
        self.assertEqual(len(self.row()[0]), 5)

    def test_conflict_is_bound_idempotent_and_does_not_refund(self):
        stamp = self.reserve()
        for _ in range(2):
            self.store()._self_serve_budget_transaction(self.principal(), conflict_at=stamp)
        self.assertEqual(self.row(), ([stamp], [stamp]))
        with self.assertRaises(TrialNotReadyError):
            self.store()._self_serve_budget_transaction(self.principal(), conflict_at=STAMP)
        self.assertEqual(self.row(), ([stamp], [stamp]))

    def test_expiry_prunes_conflict_marks_with_admissions(self):
        stamp = self.reserve()
        self.store()._self_serve_budget_transaction(self.principal(), conflict_at=stamp)
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("with old as (select clock_timestamp()-interval '25 hours' as stamp) "
                         "update app_private.self_serve_attempt_budgets set attempts = "
                         "array[old.stamp], claim_conflicts=array[old.stamp] from old "
                         "where actor_id=%s::uuid", (self.actor,))
        self.assertIsNotNone(self.reserve())
        self.assertEqual(len(self.row()[0]), 1)
        self.assertEqual(self.row()[1], [])

    def test_other_actor_cannot_read_or_update_budget_and_has_own_quota(self):
        for _ in range(5):
            self.reserve()
        other, session = str(uuid4()), str(uuid4())
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("insert into app_private.test_sessions values (%s::uuid,%s::uuid)", (other,session))
        principal = self.principal(actor=other, session=session)
        self.assertIsNotNone(self.reserve(principal))
        with self.store()._connect() as conn:
            with conn.cursor() as cursor:
                self.store()._set_context(cursor, principal)
                cursor.execute("select actor_id from app_private.self_serve_attempt_budgets")
                self.assertEqual([str(r["actor_id"]) for r in cursor.fetchall()], [other])
                cursor.execute("update app_private.self_serve_attempt_budgets set attempts='{}', "
                               "claim_conflicts='{}' where actor_id=%s::uuid", (self.actor,))
                self.assertEqual(cursor.rowcount, 0)
        self.assertIsNone(self.reserve())

    def test_missing_revoked_and_nonhuman_sessions_cannot_consume(self):
        with self.assertRaises(TrialNotReadyError):
            self.reserve(self.principal(session=str(uuid4())))
        with self.assertRaises(TrialNotReadyError):
            self.reserve(self.principal(kind="agent"))
        self.assertIsNone(self.row())

    def test_revoking_a_previously_valid_session_does_not_spend_or_bypass_budget(self):
        stamp = self.reserve()
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("delete from app_private.test_sessions where actor=%s::uuid", (self.actor,))
        with self.assertRaises(TrialNotReadyError):
            self.reserve()
        self.assertEqual(self.row(), ([stamp], []))

    def test_real_admission_survives_workspace_transaction_failure(self):
        store = self.store()
        with patch.dict(os.environ, {
            "SUPERMEGA_SUPABASE_PROJECT_REF": PROJECT_REF,
            "SUPERMEGA_RELEASE_COMMIT": RELEASE_COMMIT,
        }), patch.object(store, "_assert_audit", side_effect=TrialClaimConflict(CLAIM_CODE)):
            # Inject a claim failure INSIDE the actual second SQL transaction.
            # Admission and conflict marking use unmocked SQL and commits.
            for _ in range(5):
                with self.assertRaises(TrialClaimConflict):
                    store.create_self_serve_workspace(actor_id=self.actor,
                        claim_code=CLAIM_CODE, business_name=BUSINESS_NAME,
                        session_id=self.session, identity_provider="supabase")
            with self.assertRaises(TrialRateLimited):
                store.create_self_serve_workspace(actor_id=self.actor,
                    claim_code=CLAIM_CODE, business_name=BUSINESS_NAME,
                    session_id=self.session, identity_provider="supabase")
        attempts, conflicts = self.row()
        self.assertEqual(len(attempts), 5)
        self.assertEqual(attempts, conflicts)

    def test_missing_context_and_cross_actor_insert_fail(self):
        with self.assertRaises(self.psycopg.Error):
            with self.store()._connect() as conn:
                conn.execute("select app_private.reserve_self_serve_attempt()")
        with self.assertRaises(self.psycopg.errors.InsufficientPrivilege):
            with self.store()._connect() as conn:
                with conn.cursor() as cursor:
                    self.store()._set_context(cursor, self.principal())
                    cursor.execute("insert into app_private.self_serve_attempt_budgets(actor_id) "
                                   "values (%s::uuid)", (str(uuid4()),))

    def test_future_budget_timestamp_fails_closed(self):
        self.reserve()
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("update app_private.self_serve_attempt_budgets set attempts="
                         "array[clock_timestamp()+interval '1 hour'] where actor_id=%s::uuid", (self.actor,))
        with self.assertRaises(TrialNotReadyError):
            self.reserve()

    def test_missing_capability_fails_closed_without_process_fallback(self):
        with self.psycopg.connect(self.admin) as conn:
            conn.execute("alter function app_private.reserve_self_serve_attempt() rename to hidden_budget")
        try:
            with self.assertRaises(TrialNotReadyError):
                self.reserve()
            self.assertIsNone(self.row())
        finally:
            with self.psycopg.connect(self.admin) as conn:
                conn.execute("alter function app_private.hidden_budget() rename to reserve_self_serve_attempt")

    def test_grants_forced_rls_and_functions_have_no_public_privilege(self):
        with self.psycopg.connect(self.admin) as conn:
            self.assertEqual(conn.execute("select relrowsecurity,relforcerowsecurity from pg_class "
                "where oid='app_private.self_serve_attempt_budgets'::regclass").fetchone(), (True,True))
            for role in ("anon", "authenticated"):
                self.assertFalse(conn.execute("select has_table_privilege(%s, "
                    "'app_private.self_serve_attempt_budgets','SELECT,INSERT,UPDATE,DELETE')", (role,)).fetchone()[0])
                self.assertFalse(conn.execute("select has_function_privilege(%s, "
                    "'app_private.reserve_self_serve_attempt()','EXECUTE')", (role,)).fetchone()[0])
            self.assertFalse(conn.execute("select has_table_privilege('budget_runtime', "
                "'app_private.self_serve_attempt_budgets','DELETE')").fetchone()[0])
            functions = conn.execute("select prosecdef, proconfig from pg_proc where oid in "
                "('app_private.reserve_self_serve_attempt()'::regprocedure, "
                "'app_private.mark_self_serve_claim_conflict(timestamptz)'::regprocedure)").fetchall()
            self.assertEqual(len(functions), 2)
            self.assertTrue(all(not row[0] and row[1] == ['search_path=""'] for row in functions))


if __name__ == "__main__":
    unittest.main()
