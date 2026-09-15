"""Opt-in real loopback PostgreSQL tests. Never accepts a supplied database URL."""

from contextlib import contextmanager
from hashlib import sha256
import json
import os
import unittest
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal
from supermega_runtime.website_runtime import _website_artifact
from tests.test_website_runtime import _state

MIGRATION = "20260915184728_website_customer_review_storage.sql"
WORKSPACE = "rehearsal-product"
OWNER = "owner-product"
RECIPIENT = "22222222-2222-4222-8222-222222222222"
DIGEST = "sha256:" + "a" * 64


@unittest.skipUnless(os.environ.get("SUPERMEGA_RUN_WEBSITE_REVIEW_SQL") == "1", "explicit local SQL rehearsal only")
class WebsiteReviewSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.db_error = psycopg.Error
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data = cls.workspace / "primary-data"
        cls.started = False
        cls.addClassCleanup(cls.stop)
        port, password, runtime_password = pg._free_loopback_port(), pg._password(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(), data_directory=cls.data,
                               admin_password=password, port=port, environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data, log_file=cls.workspace / "postgres.log",
                          port=port, environment=cls.environment)
        root = pg._connection_url("postgres", password, port, "postgres")
        cls.admin_url = pg._connection_url("postgres", password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        pg._apply_migrations(postgres_bin=cls.bin, admin_password=password, admin_database_url=cls.admin_url,
                             port=port, environment=cls.environment, migrations=pg.CURRENT_MIGRATIONS)
        pg._provision_runtime(cls.admin_url, runtime_password)
        pg._seed_rehearsal_data(cls.admin_url)
        with pg._connect(cls.admin_url) as connection:
            connection.execute((pg.MIGRATION_DIRECTORY / MIGRATION).read_text(encoding="utf-8"))
            connection.execute("insert into app_private.workspace_memberships(workspace_id,actor_id,status,capabilities,actor_kind) values (%s,%s,'active',array['website.review'],'human')", (WORKSPACE, RECIPIENT))
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'website',1,%s::jsonb,%s)", (WORKSPACE, json.dumps(_state()), OWNER))

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data, environment=cls.environment)
        cls.cleanup["stopped"] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError("website_review_sql_cleanup_unreconciled")

    def context(self, connection, actor=OWNER, workspace=WORKSPACE):
        with connection.cursor() as cursor:
            PostgresTrialStore._set_context(cursor, TrialPrincipal(workspace, actor, actor_kind="human"))

    @contextmanager
    def transaction(self, actor=OWNER, workspace=WORKSPACE):
        connection = pg._connect(self.runtime_url)
        try:
            self.context(connection, actor, workspace)
            yield connection
        finally:
            connection.rollback()
            connection.close()

    def prepare(self, connection, recipient=RECIPIENT, *, forged_digest=False, expiry="1 day"):
        review_id = uuid4()
        version, state = connection.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='website'", (WORKSPACE,)).fetchone()
        artifact = _website_artifact(state)
        preview = {"siteName": artifact["siteName"], "pages": artifact["pages"]}
        digest = "sha256:" + sha256(json.dumps(preview, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        connection.execute("insert into app_private.website_customer_reviews(review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at) values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+%s::interval)",
                           (review_id, WORKSPACE, recipient, OWNER, version, json.dumps(preview), DIGEST if forged_digest else digest, expiry))
        return review_id, version, digest

    def feedback(self, connection, review, command=None, note="Shorten the headline"):
        review_id, version, digest = review
        connection.execute("insert into app_private.website_customer_feedback(workspace_id,actor_id,command_id,review_id,source_version,preview_digest,command_fingerprint,note) values (%s,%s,%s,%s,%s,%s,%s,%s)",
                           (WORKSPACE, RECIPIENT, command or uuid4(), review_id, version, digest, DIGEST, note))

    def edit(self, connection):
        connection.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='website'", (WORKSPACE,))

    def test_recipient_can_read_prepared_preview_but_not_workspace_or_directory(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            self.context(connection, RECIPIENT)
            self.assertEqual(connection.execute("select review_id from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchall(), [(review[0],)])
            self.assertEqual(connection.execute("select workspace_id from app_private.workspace_state").fetchall(), [])
            self.assertEqual(connection.execute("select actor_id from app_private.workspace_memberships").fetchall(), [(RECIPIENT,)])
            self.feedback(connection, review)
            self.assertEqual(connection.execute("select count(*) from app_private.website_customer_feedback where review_id=%s", (review[0],)).fetchone()[0], 1)

    def test_forged_preview_digest_is_rejected_by_database(self):
        with self.transaction() as connection, self.assertRaises(self.db_error):
            self.prepare(connection, forged_digest=True)

    def test_expired_assignment_cannot_accept_feedback(self):
        with self.transaction() as connection:
            review = self.prepare(connection, expiry="20 milliseconds")
            self.context(connection, RECIPIENT)
            connection.execute("select pg_sleep(0.03)")
            with self.assertRaises(self.db_error):
                self.feedback(connection, review)

    def test_database_expiry_window_is_bounded(self):
        with self.transaction() as connection, self.assertRaises(self.db_error):
            self.prepare(connection, expiry="8 days")

    def test_feedback_blank_note_is_rejected(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            self.context(connection, RECIPIENT)
            with self.assertRaises(self.db_error):
                self.feedback(connection, review, note="\n\t")

    def test_content_revision_is_captured_from_server_state(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            self.assertEqual(connection.execute("select content_revision from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchone()[0], 0)

    def test_canonical_unicode_projection_matches_python(self):
        value = {"z": [True, False, "ဆိုင်", "line\nnext", "quote\""], "a": {"label": "Name"}}
        with self.transaction() as connection:
            actual = connection.execute("select app_private.website_review_json(%s::jsonb)", (json.dumps(value),)).fetchone()[0]
            self.assertEqual(actual, json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))

    def test_cross_tenant_and_unassigned_reads_are_empty(self):
        with self.transaction() as connection:
            self.prepare(connection)
            self.context(connection, "owner-b", "rehearsal-b")
            self.assertEqual(connection.execute("select review_id from app_private.website_customer_reviews").fetchall(), [])

    def test_operator_cannot_assign_unknown_or_ungranted_recipient(self):
        for recipient in (str(uuid4()), "website-reader"):
            with self.subTest(recipient=recipient), self.transaction() as connection:
                with self.assertRaises(self.db_error):
                    self.prepare(connection, recipient)

    def test_customer_cannot_use_privileged_recipient_predicate(self):
        with self.transaction(RECIPIENT) as connection:
            self.assertFalse(connection.execute("select app_private.website_review_recipient_ready(%s)", (RECIPIENT,)).fetchone()[0])

    def test_source_update_invalidates_and_blocks_feedback(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            self.edit(connection)
            self.assertEqual(connection.execute("select status from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchone()[0], "stale")
            self.context(connection, RECIPIENT)
            with self.assertRaises(self.db_error):
                self.feedback(connection, review)

    def test_revocation_blocks_feedback(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            connection.execute("update app_private.website_customer_reviews set status='revoked' where review_id=%s", (review[0],))
            self.context(connection, RECIPIENT)
            with self.assertRaises(self.db_error):
                self.feedback(connection, review)

    def test_feedback_uniqueness_and_immutability(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            self.context(connection, RECIPIENT)
            command = uuid4()
            self.feedback(connection, review, command)
            with connection.transaction(force_rollback=True):
                with self.assertRaises(self.db_error):
                    self.feedback(connection, review, command)
            with self.assertRaises(self.db_error):
                connection.execute("update app_private.website_customer_feedback set note='changed'")

    def test_assignment_content_is_immutable(self):
        with self.transaction() as connection:
            self.prepare(connection)
            with self.assertRaises(self.db_error):
                connection.execute("update app_private.website_customer_reviews set preview_digest=%s", ("sha256:" + "b" * 64,))

    def test_forced_rls_and_no_browser_grants(self):
        with pg._connect(self.admin_url) as connection:
            flags = connection.execute("select relrowsecurity,relforcerowsecurity from pg_class where oid in ('app_private.website_customer_reviews'::regclass,'app_private.website_customer_feedback'::regclass)").fetchall()
            self.assertEqual(flags, [(True, True), (True, True)])
            for role in ("anon", "authenticated", "service_role"):
                self.assertFalse(connection.execute("select has_table_privilege(%s,'app_private.website_customer_reviews','SELECT')", (role,)).fetchone()[0])
                self.assertFalse(connection.execute("select has_function_privilege(%s,'app_private.website_review_recipient_ready(text)','EXECUTE')", (role,)).fetchone()[0])

    def test_edit_feedback_serialization_blocks_then_rejects_stale(self):
        with self.transaction() as setup:
            review = self.prepare(setup)
            setup.commit()
        with self.transaction() as editor, self.transaction(RECIPIENT) as customer:
            self.edit(editor)
            customer.execute("set local lock_timeout='200ms'")
            with self.assertRaises(self.db_error):
                self.feedback(customer, review)
            customer.rollback()
            editor.commit()
            self.context(customer, RECIPIENT)
            with self.assertRaises(self.db_error):
                self.feedback(customer, review)

    def test_feedback_before_edit_remains_immutable_history(self):
        with self.transaction() as setup:
            review = self.prepare(setup)
            setup.commit()
        with self.transaction(RECIPIENT) as customer, self.transaction() as editor:
            self.feedback(customer, review)
            editor.execute("set local lock_timeout='200ms'")
            with self.assertRaises(self.db_error):
                self.edit(editor)
            editor.rollback()
            customer.commit()
            self.context(editor)
            self.edit(editor)
            editor.commit()
        with self.transaction() as connection:
            self.assertEqual(connection.execute("select count(*) from app_private.website_customer_feedback where review_id=%s", (review[0],)).fetchone()[0], 1)
            self.assertEqual(connection.execute("select status from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchone()[0], "stale")


if __name__ == "__main__":
    unittest.main()
