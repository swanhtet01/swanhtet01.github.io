"""Opt-in development integration tests against disposable PostgreSQL 17.

Run with SUPERMEGA_TEST_POSTGRES=1, SUPERMEGA_TRIAL_SCHEMA_VERSION=13 and
(optionally) SUPERMEGA_TEST_POSTGRES_BIN.
No existing database URL or credentials are accepted. The real current migration
chain, runtime role, RLS and command reducer run over loopback TLS. Object storage
is an explicit in-memory double: this is not hosted Supabase or release evidence.
Unlike the canonical clean-commit rehearsal, these tests support a dirty checkout.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
from threading import Event, Lock
from time import monotonic, sleep
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

from supermega_runtime.trial_store import (
    PostgresTrialStore, TrialNotFound, TrialNotReadyError,
    TrialPermissionDenied, TrialPrincipal, TrialValidationError, TRIAL_SCHEMA_VERSION,
)
from supermega_runtime.website_media import prepare_photo
from supermega_runtime.website_media_store import MEDIA_EVENT, WebsiteMediaStore
from supermega_runtime.website_runtime import reduce_website_state
from tests.test_website_runtime import _command, _state
from tools import rehearse_supermega_postgres17 as pg


@contextmanager
def _local_database():
    default = (Path.home() / ".cache/supermega-postgresql/17.10-2/pgsql/bin"
               if os.name == "nt" else Path(shutil.which("postgres") or "/usr/bin/postgres").parent)
    binary = Path(os.environ.get("SUPERMEGA_TEST_POSTGRES_BIN", default)).resolve()
    environment = pg._clean_environment(binary)
    _, major = pg._postgres_version(pg._binary(binary, "postgres"), environment)
    if major != 17:
        raise RuntimeError("These integration tests require PostgreSQL 17.")
    admin_password, runtime_password = pg._password(), pg._password()
    with pg._disposable_workspace() as (workspace, cleanup):
        data = workspace / "data"
        attempted_start = False
        try:
            port = pg._free_loopback_port()
            pg._initialize_cluster(
                postgres_bin=binary, openssl=pg._resolve_executable(pg._default_openssl()),
                data_directory=data, admin_password=admin_password, port=port,
                environment=environment,
            )
            with (data / "postgresql.conf").open("a", encoding="utf-8") as config:
                config.write("\nshared_buffers = '32MB'\nmax_connections = 12\nwork_mem = '2MB'\n")
            attempted_start = True
            pg._start_cluster(postgres_bin=binary, data_directory=data,
                              log_file=workspace / "postgres.log", port=port,
                              environment=environment)
            admin = pg._connection_url("postgres", admin_password, port, pg.DATABASE_NAME)
            runtime = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
            pg._create_database_and_roles(
                pg._connection_url("postgres", admin_password, port, "postgres"), pg.DATABASE_NAME)
            pg._create_auth_session_fixture(admin)
            pg._create_public_browser_fixture(admin)
            pg._apply_public_browser_quarantine(postgres_bin=binary, admin_password=admin_password,
                                                port=port, database_name=pg.DATABASE_NAME,
                                                environment=environment)
            pg._apply_migrations(postgres_bin=binary, admin_password=admin_password,
                                 admin_database_url=admin, port=port, environment=environment,
                                 migrations=pg.CURRENT_MIGRATIONS)
            pg._provision_runtime(admin, runtime_password)
            # Only an ephemeral local login is changed; no provider credentials.
            from psycopg import sql
            with pg._connect(admin, autocommit=True) as connection:
                connection.execute(
                    sql.SQL("alter role {} valid until {}").format(
                        sql.Identifier(pg.RUNTIME_ROLE),
                        sql.Literal((datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())))
            yield admin, runtime
        finally:
            cleanup["stopped"] = (not attempted_start or pg._stop_cluster(
                postgres_bin=binary, data_directory=data, environment=environment))
            if not cleanup["stopped"]:
                raise RuntimeError("Local PostgreSQL shutdown failed; its directory was preserved.")


class MemoryObjects:
    """Deliberately synthetic provider with hooks at the network-call boundary."""

    def __init__(self):
        self.objects = {}
        self.put_count = 0
        self.get_count = 0
        self.after_put = None
        self.after_get = None
        self.lock = Lock()

    def put(self, workspace, photo):
        with self.lock:
            self.put_count += 1
            self.objects[workspace, photo.asset_id] = photo.data
        if self.after_put:
            self.after_put()
        return photo.receipt()

    def get(self, workspace, asset_id):
        with self.lock:
            self.get_count += 1
            data = self.objects[workspace, asset_id]
        if self.after_get:
            self.after_get()
        return data


@unittest.skipUnless(os.environ.get("SUPERMEGA_TEST_POSTGRES") == "1",
                     "Set SUPERMEGA_TEST_POSTGRES=1 for disposable local PostgreSQL.")
class LocalWebsiteDatabaseCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if TRIAL_SCHEMA_VERSION != pg.CURRENT_SCHEMA_VERSION:
            raise RuntimeError("Run in a fresh process with SUPERMEGA_TRIAL_SCHEMA_VERSION=13.")
        cls.admin, runtime = cls.enterClassContext(_local_database())
        cls.store = PostgresTrialStore(
            runtime, reducer=lambda surface, event, state, payload: reduce_website_state(event, state, payload),
            write_enabled=True)

    def setUp(self):
        self.owner = self._principal()
        self.storage = MemoryObjects()
        self.media = WebsiteMediaStore(self.store, self.storage)
        self.photo = self._photo("#ab6633")

    @staticmethod
    def _photo(color):
        from PIL import Image
        raw = BytesIO()
        with Image.new("RGB", (32, 24), color) as image:
            image.save(raw, format="PNG")
        return prepare_photo(raw.getvalue(), "image/png")

    def _sql(self, statement, parameters=()):
        with pg._connect(self.admin) as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, parameters)
                return cursor.fetchall() if cursor.description else []

    def _principal(self, workspace=None, *, viewer=False):
        actor, session = str(uuid4()), str(uuid4())
        if workspace is None:
            workspace = "media-test-" + str(uuid4())
            self._sql("""insert into app_private.workspace_access_controls
                (workspace_id, activation_id, authorization_id, authorization_contract,
                 plan_digest, owner_actor_id, project_ref, release_commit, status)
                values (%s,%s,%s,'legacy_migration_v1',%s,%s,%s,%s,'active')""",
                (workspace, str(uuid4()), str(uuid4()), "0" * 64, actor, "0" * 20, "0" * 40))
            self._sql("""insert into app_private.workspace_events
                (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,
                 actor_id,actor_kind,payload_json,result_json)
                values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human',%s::jsonb,%s::jsonb)""",
                (str(uuid4()), workspace, str(uuid4()), "0" * 64, actor,
                 json.dumps({"products": ["website"]}), json.dumps({"status": "activated"})))
        self._sql("""insert into app_private.workspace_memberships
            (workspace_id,actor_id,status,capabilities,actor_kind)
            values (%s,%s,'active',%s,'human')""",
            (workspace, actor, ["company.read", "website.read" if viewer else "website.write"]))
        self._sql("insert into auth.sessions (id,user_id) values (%s,%s)", (session, actor))
        return TrialPrincipal(workspace, actor, actor_kind="human", session_id=session,
                              identity_provider="supabase")

    def _receipts(self, owner=None):
        return self._sql("""select result_json from app_private.workspace_events
            where workspace_id=%s and event_type=%s""",
            ((owner or self.owner).workspace_id, MEDIA_EVENT))

    def _apply(self, state, *, owner=None, version=0, command_id=None):
        actor = owner or self.owner
        payload = _command(state, action_id="media-integration", reason="Synthetic local test",
                           reference="local-postgres")
        payload["evidence"]["actor"] = actor.actor_id
        return self.store.apply_command(
            actor, command_id=command_id or str(uuid4()), surface="website",
            event_type="website.workspace.initialized" if version == 0 else "website.content.saved",
            expected_version=version, payload=payload)

    def _state_with_photo(self):
        state = _state()
        state["pages"][0]["sections"][0]["image"] = {
            "assetId": self.photo.asset_id, "alt": "Synthetic photo", "decorative": False}
        return state

    def _wait_for_database_lock_waiter(self):
        deadline = monotonic() + 5
        while monotonic() < deadline:
            rows = self._sql("""select count(*) from pg_locks locks
                join pg_stat_activity activity on activity.pid=locks.pid
                where locks.locktype='advisory' and not locks.granted and activity.usename=%s""",
                (pg.RUNTIME_ROLE,))
            if rows[0][0] == 1:
                return
            sleep(0.05)
        self.fail("The second upload did not wait on the real PostgreSQL advisory lock.")

class WebsiteMediaPostgresTests(LocalWebsiteDatabaseCase):
    def test_upload_save_reload_and_command_replay(self):
        self.assertEqual(self.media.put(self.owner, self.photo), self.photo.receipt())
        state, command_id = self._state_with_photo(), str(uuid4())
        result = self._apply(state, command_id=command_id)
        self.assertEqual(result.version, 1)
        self.assertEqual(self.store.get_state(self.owner, "website").state, state)
        self.assertEqual(self.media.get(self.owner, self.photo.asset_id),
                         (self.photo.data, self.photo.receipt()))
        self.assertTrue(self._apply(state, command_id=command_id).idempotent_replay)
        self.assertEqual(len(self._receipts()), 1)

    def test_other_workspace_reference_cannot_initialize_or_change_saved_page(self):
        self.media.put(self.owner, self.photo)
        other = self._principal()
        with self.assertRaises(TrialValidationError):
            self._apply(self._state_with_photo(), owner=other)
        self.assertEqual(self.store.get_state(other, "website").version, 0)
        original = _state()
        self._apply(original, owner=other)
        changed = self._state_with_photo()
        changed.update(revision=1, contentRevision=1)
        with self.assertRaises(TrialValidationError):
            self._apply(changed, owner=other, version=1)
        reloaded = self.store.get_state(other, "website")
        self.assertEqual((reloaded.version, reloaded.state), (1, original))
        with self.assertRaises(TrialNotFound):
            self.media.get(other, self.photo.asset_id)
        self.assertEqual(self.storage.get_count, 0)
        # Identical bytes are allowed after the second tenant's own upload receipt.
        self.media.put(other, self.photo)
        self.assertEqual(self._apply(changed, owner=other, version=1).version, 2)

    def test_runtime_rls_hides_other_workspaces(self):
        self.media.put(self.owner, self.photo)
        other = self._principal()
        with self.store._guarded_cursor(other, write=False) as (cursor, _):
            cursor.execute("select result_json from app_private.workspace_events where event_type=%s",
                           (MEDIA_EVENT,))
            self.assertEqual(cursor.fetchall(), [])
        with self.store._guarded_cursor(self.owner, write=False) as (cursor, _):
            cursor.execute("select result_json from app_private.workspace_events where event_type=%s",
                           (MEDIA_EVENT,))
            self.assertEqual(len(cursor.fetchall()), 1)

    def test_viewer_reads_but_cannot_upload(self):
        self.media.put(self.owner, self.photo)
        viewer = self._principal(self.owner.workspace_id, viewer=True)
        self.assertEqual(self.media.get(viewer, self.photo.asset_id)[0], self.photo.data)
        with self.assertRaises(TrialPermissionDenied):
            self.media.put(viewer, self.photo)
        self.assertEqual(self.storage.put_count, 1)

    def test_session_revoked_during_upload_rolls_back_receipt_and_retry_recovers(self):
        self.storage.after_put = lambda: self._sql(
            "delete from auth.sessions where id=%s", (self.owner.session_id,))
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.owner, self.photo)
        self.assertEqual(self._receipts(), [])
        self.assertIn((self.owner.workspace_id, self.photo.asset_id), self.storage.objects)
        self._sql("insert into auth.sessions (id,user_id) values (%s,%s)",
                  (self.owner.session_id, self.owner.actor_id))
        self.storage.after_put = None
        with self.assertRaises(TrialNotFound):
            self.media.get(self.owner, self.photo.asset_id)
        self.media.put(self.owner, self.photo)
        self.assertEqual(len(self._receipts()), 1)

    def test_membership_revoked_during_read_returns_no_bytes(self):
        self.media.put(self.owner, self.photo)
        self.storage.after_get = lambda: self._sql(
            "delete from app_private.workspace_memberships where workspace_id=%s and actor_id=%s",
            (self.owner.workspace_id, self.owner.actor_id))
        with self.assertRaises(TrialNotReadyError):
            self.media.get(self.owner, self.photo.asset_id)

    def test_workspace_suspension_blocks_read_and_upload_before_provider(self):
        self.media.put(self.owner, self.photo)
        self._sql("update app_private.workspace_access_controls set status='suspended' where workspace_id=%s",
                  (self.owner.workspace_id,))
        with self.assertRaises(TrialNotReadyError):
            self.media.get(self.owner, self.photo.asset_id)
        with self.assertRaises(TrialNotReadyError):
            self.media.put(self.owner, self.photo)
        self.assertEqual((self.storage.put_count, self.storage.get_count), (1, 0))

    def test_concurrent_same_asset_has_one_receipt_and_one_provider_write(self):
        provider_entered, release_provider, second_started = Event(), Event(), Event()

        def hold_provider():
            provider_entered.set()
            if not release_provider.wait(10):
                raise RuntimeError("Timed out waiting for concurrent upload test.")

        def second_upload():
            second_started.set()
            return self.media.put(self.owner, self.photo)

        self.storage.after_put = hold_provider
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.media.put, self.owner, self.photo)
            try:
                self.assertTrue(provider_entered.wait(10))
                second = executor.submit(second_upload)
                self.assertTrue(second_started.wait(10))
                self._wait_for_database_lock_waiter()
            finally:
                release_provider.set()
            self.assertEqual(first.result(timeout=15), self.photo.receipt())
            self.assertEqual(second.result(timeout=15), self.photo.receipt())
        self.assertEqual((len(self._receipts()), self.storage.put_count), (1, 1))

    def test_revocation_while_waiting_on_upload_lock_is_rechecked(self):
        waiting_actor = self._principal(self.owner.workspace_id)
        provider_entered, release_provider = Event(), Event()

        def hold_provider():
            provider_entered.set()
            if not release_provider.wait(10):
                raise RuntimeError("Timed out waiting for revocation test.")

        self.storage.after_put = hold_provider
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.media.put, self.owner, self.photo)
            try:
                self.assertTrue(provider_entered.wait(10))
                second = executor.submit(self.media.put, waiting_actor, self.photo)
                self._wait_for_database_lock_waiter()
                self._sql("delete from auth.sessions where id=%s", (waiting_actor.session_id,))
            finally:
                release_provider.set()
            self.assertEqual(first.result(timeout=15), self.photo.receipt())
            with self.assertRaises(TrialNotReadyError):
                second.result(timeout=15)
        self.assertEqual((len(self._receipts()), self.storage.put_count, self.storage.get_count), (1, 1, 0))

    def test_database_insert_failure_leaves_inaccessible_orphan_then_retry_recovers(self):
        from psycopg.errors import UniqueViolation
        self.media.put(self.owner, self.photo)
        existing_event = self._sql("""select event_id from app_private.workspace_events
            where workspace_id=%s and event_type=%s""", (self.owner.workspace_id, MEDIA_EVENT))[0][0]
        second = self._photo("#00aa11")
        # Force a real PK collision after provider success. Do not mock SQL,
        # transactions, the reducer, role checks, RLS, or database constraints.
        with patch("supermega_runtime.website_media_store.uuid4", return_value=UUID(str(existing_event))):
            with self.assertRaises(UniqueViolation):
                self.media.put(self.owner, second)
        self.assertEqual(len(self._receipts()), 1)
        self.assertIn((self.owner.workspace_id, second.asset_id), self.storage.objects)
        with self.assertRaises(TrialNotFound):
            self.media.get(self.owner, second.asset_id)
        self.media.put(self.owner, second)
        self.assertEqual(len(self._receipts()), 2)
        self.assertEqual(self.media.get(self.owner, second.asset_id)[0], second.data)

    def test_quota_counts_committed_receipts_and_preserves_deduplication(self):
        self.media.put(self.owner, self.photo)
        second = self._photo("#00aa11")
        with patch("supermega_runtime.website_media_store.MAX_HOURLY_UPLOADS", 1):
            self.assertEqual(self.media.put(self.owner, self.photo), self.photo.receipt())
            with self.assertRaises(TrialNotReadyError):
                self.media.put(self.owner, second)
        with patch("supermega_runtime.website_media_store.MAX_WORKSPACE_ASSETS", 1):
            with self.assertRaises(TrialValidationError):
                self.media.put(self.owner, second)
        self.assertEqual((len(self._receipts()), self.storage.put_count), (1, 1))

    def test_runtime_cannot_mutate_committed_receipt(self):
        from psycopg import Error
        self.media.put(self.owner, self.photo)
        for statement in (
            "delete from app_private.workspace_events where workspace_id=%s and event_type=%s",
            "update app_private.workspace_events set result_json='{}'::jsonb where workspace_id=%s and event_type=%s",
        ):
            with self.subTest(statement=statement.split()[0]), self.assertRaises(Error):
                with self.store._guarded_cursor(self.owner, write=True) as (cursor, _):
                    cursor.execute(statement, (self.owner.workspace_id, MEDIA_EVENT))
        self.assertEqual(self._receipts(), [(self.photo.receipt(),)])


if __name__ == "__main__":
    unittest.main()
