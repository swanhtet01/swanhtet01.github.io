"""Opt-in real loopback PostgreSQL tests. Never accepts a supplied database URL.

Run with SUPERMEGA_RUN_WEBSITE_REVIEW_SQL=1 and SUPERMEGA_TRIAL_SCHEMA_VERSION=13.
"""

from contextlib import contextmanager
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from queue import Queue
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialPermissionDenied, TrialValidationError, TrialNotReadyError
from supermega_runtime.website_customer_review_store import WebsiteCustomerReviewStore
from supermega_runtime.website_runtime import _website_artifact
from tests.test_website_runtime import _state

REVIEW_MIGRATIONS = (
    "20260915184728_website_customer_review_storage.sql",
    "20260915191528_website_review_entitlement_proof.sql",
)
WORKSPACE = "rehearsal-product"
OWNER = "owner-product"
RECIPIENT = "22222222-2222-4222-8222-222222222222"
DIGEST = "sha256:" + "a" * 64


@unittest.skipUnless(os.environ.get("SUPERMEGA_RUN_WEBSITE_REVIEW_SQL") == "1", "explicit local SQL rehearsal only")
class WebsiteReviewSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if pg.CURRENT_MIGRATIONS[-2:] != REVIEW_MIGRATIONS:
            raise RuntimeError("website_review_complete_migration_chain_required")
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

    def test_release_validator_reads_exact_partial_index_predicate(self):
        from tools.validate_supermega_database_url import _index_predicate_matches
        with pg._connect(self.admin_url) as connection:
            connection.execute("set transaction read only")
            rows = connection.execute("""
                select c.relname, i.indpred is null,
                       pg_get_expr(i.indpred, i.indrelid, false)
                from pg_index i join pg_class c on c.oid=i.indexrelid
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='app_private' and c.relname in
                  ('website_customer_reviews_active_idx','website_customer_reviews_recipient_idx')
                order by c.relname
            """).fetchall()
        self.assertEqual(len(rows), 2)
        for name, absent, expression in rows:
            row = {"no_predicate": absent, "predicate_expression": expression}
            expected = {"predicate_expression": "(status = 'active'::text)"} if name.endswith('active_idx') else {}
            self.assertTrue(_index_predicate_matches(row, expected))
            if expected:
                self.assertFalse(_index_predicate_matches(row, {}))
                self.assertFalse(_index_predicate_matches(row, {"predicate_expression": "(status = 'ACTIVE'::text)"}))

    def test_rehearsal_retains_nonempty_runtime_review_and_feedback(self):
        from tools import rehearse_self_serve_v13 as proof
        with patch.dict(os.environ, {"SUPERMEGA_BILLING_SCHEMA_VERSION": "13"}):
            retained = proof.exercise(self.admin_url, self.runtime_url, "a" * 40)
            before = proof.snapshot(self.admin_url)
            proof.verify_website_review(self.runtime_url, retained)
            self.assertEqual(proof.snapshot(self.admin_url), before)
            for field, replacement, code in (
                ("preview", {}, "restored_website_preview_mismatch"),
                ("feedback", {"requests": []}, "restored_website_feedback_mismatch"),
            ):
                invalid = deepcopy(retained)
                invalid["website"][field] = replacement
                with self.subTest(field=field), self.assertRaisesRegex(pg.RehearsalFailure, code):
                    proof.verify_website_review(self.runtime_url, invalid)
            with pg._connect(self.admin_url) as connection:
                connection.execute("set transaction read only")
                for table in ("website_customer_reviews", "website_customer_feedback"):
                    self.assertEqual(connection.execute(f"select count(*) from app_private.{table} where workspace_id=%s",
                        (retained["website"]["workspace"],)).fetchone()[0], 1)

    @contextmanager
    def transaction(self, actor=OWNER, workspace=WORKSPACE, isolation=None):
        connection = pg._connect(self.runtime_url)
        try:
            if isolation == "repeatable read":
                connection.execute("set transaction isolation level repeatable read")
            elif isolation == "serializable":
                connection.execute("set transaction isolation level serializable")
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

    def adapter(self, *, write=True):
        return WebsiteCustomerReviewStore(PostgresTrialStore(self.runtime_url, reducer=lambda *args: {}, write_enabled=write))

    def retained_assignment(self):
        with self.transaction() as connection:
            review = self.prepare(connection)
            connection.commit()
        return review

    def preparation_arguments(self):
        with self.transaction() as connection:
            version = connection.execute("select version from app_private.workspace_state where workspace_id=%s and surface='website'", (WORKSPACE,)).fetchone()[0]
        return dict(review_id=str(uuid4()), recipient_actor_id=RECIPIENT, expected_version=version,
                    expires_at=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())

    def http_client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.trial_runtime import create_trial_router
        principals = {"operator": TrialPrincipal(WORKSPACE, OWNER, "human"),
                      "customer": TrialPrincipal(WORKSPACE, RECIPIENT, "human"),
                      "other": TrialPrincipal("rehearsal-b", "owner-b", "human"),
                      "agent": TrialPrincipal(WORKSPACE, RECIPIENT, "agent")}
        app = FastAPI()
        # Synthetic resolver only: production continues using its existing
        # server-validated authentication. No header-based auth is added there.
        app.include_router(create_trial_router(store=self.adapter().store,
            resolve_principal=lambda request: principals.get(request.headers.get("x-test-actor"))))
        return TestClient(app)

    def test_http_prepare_customer_feedback_retry_and_withdraw_real_database(self):
        args = self.preparation_arguments()
        body = dict(reviewId=args["review_id"], recipientActorId=args["recipient_actor_id"],
                    expectedVersion=args["expected_version"], expiresAt=args["expires_at"])
        base = "/api/trial/v1/website-reviews"
        owner = {"x-test-actor": "operator"}
        customer = {"x-test-actor": "customer"}
        with self.http_client() as client:
            prepared = client.post(base, headers=owner, json=body)
            self.assertEqual(prepared.status_code, 200, prepared.text)
            url = base + "/" + args["review_id"]
            preview = client.get(url, headers=customer)
            self.assertEqual(preview.status_code, 200, preview.text)
            self.assertEqual(preview.headers["cache-control"], "private, no-store")
            self.assertNotIn("recipientActorId", preview.json())
            payload = dict(commandId=str(uuid4()), reviewId=args["review_id"],
                           previewDigest=preview.json()["previewDigest"], note="ပိုတိုအောင်ရေးပေးပါ")
            sent = client.post(url+"/change-requests", headers=customer, json=payload)
            self.assertEqual(sent.status_code, 200, sent.text)
            self.assertTrue(sent.json()["persisted"])
            self.assertTrue(client.post(url+"/change-requests", headers=customer, json=payload).json()["replayed"])
            self.assertEqual(client.post(url+"/withdraw", headers=customer, json={}).status_code, 403)
            self.assertEqual(client.post(url+"/withdraw", headers=owner, json={}).status_code, 200)
            denied = client.get(url, headers=customer)
            self.assertEqual(denied.status_code, 403)
            self.assertEqual(denied.headers["cache-control"], "private, no-store")

    def test_http_staff_review_list_is_bounded_private_and_read_only(self):
        with self.transaction() as connection:
            prepared = [self.prepare(connection) for _ in range(52)]
            connection.commit()
        with self.transaction(RECIPIENT) as connection:
            self.feedback(connection, prepared[0], note="Private customer correction")
            connection.commit()
        owner = TrialPrincipal(WORKSPACE, OWNER, "human")
        self.adapter().revoke(owner, str(prepared[1][0]))
        # An all-zero UUID is accepted by the existing ID contract; the first
        # page must not accidentally omit it by using an exclusive sentinel.
        zero = "00000000-0000-0000-0000-000000000000"
        self.adapter().prepare(owner, **(self.preparation_arguments() | {"review_id": zero}))
        with pg._connect(self.admin_url) as connection:
            before = connection.execute("select (select count(*) from app_private.website_customer_reviews),(select count(*) from app_private.website_customer_feedback)").fetchone()
        base = "/api/trial/v1/website-reviews"
        headers = {"x-test-actor": "operator"}
        with self.http_client() as client:
            for actor, status in ((None, 401), ("customer", 403), ("agent", 403), ("other", 403)):
                response = client.get(base, headers={"x-test-actor": actor} if actor else {})
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
            rows, after = [], None
            for _ in range(10):
                response = client.get(base, headers=headers, params={"after": after} if after else {})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
                body = response.json()
                self.assertEqual(set(body), {"reviews", "nextAfter", "order", "publicationAuthorized"})
                self.assertFalse(body["publicationAuthorized"])
                self.assertEqual(body["order"], "review_id_ascending")
                self.assertLessEqual(len(body["reviews"]), 50)
                for row in body["reviews"]:
                    self.assertEqual(set(row), {"reviewId", "contentRevision", "sourceVersion", "preparedAt", "expiresAt", "status", "hasChangeRequests"})
                self.assertNotIn("Private customer correction", response.text)
                self.assertNotIn(RECIPIENT, response.text)
                rows.extend(body["reviews"])
                if not body["nextAfter"]:
                    break
                self.assertEqual(len(body["reviews"]), 50)
                self.assertEqual(body["nextAfter"], body["reviews"][-1]["reviewId"])
                after = body["nextAfter"]
            else:
                self.fail("pagination did not terminate")
            ids = [row["reviewId"] for row in rows]
            self.assertEqual(ids, sorted(set(ids)))
            self.assertEqual(ids[0], zero)
            self.assertTrue({str(review[0]) for review in prepared}.issubset(ids))
            indexed = {row["reviewId"]: row for row in rows}
            self.assertTrue(indexed[str(prepared[0][0])]["hasChangeRequests"])
            self.assertFalse(indexed[str(prepared[1][0])]["hasChangeRequests"])
            self.assertEqual(indexed[str(prepared[1][0])]["status"], "revoked")
            for query in ("?after=bad", "?after=", f"?after={uuid4()}", f"?after={zero}&after={zero}", "?workspace=other"):
                response = client.get(base + query, headers=headers)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
        with pg._connect(self.admin_url) as connection:
            after_counts = connection.execute("select (select count(*) from app_private.website_customer_reviews),(select count(*) from app_private.website_customer_feedback)").fetchone()
        self.assertEqual(before, after_counts)

    def test_http_review_auth_identity_size_and_method_boundaries(self):
        review = self.retained_assignment()
        url = "/api/trial/v1/website-reviews/" + str(review[0])
        customer = {"x-test-actor": "customer"}
        with self.http_client() as client:
            for headers, status in (({}, 401), ({"x-test-actor": "other"}, 403), ({"x-test-actor": "agent"}, 403)):
                result = client.get(url, headers=headers)
                self.assertEqual(result.status_code, status)
                self.assertEqual(result.headers["cache-control"], "private, no-store")
            payload = dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=review[2], note="Shorten title")
            for invalid in (payload | {"actorId": "forged"}, payload | {"reviewId": str(uuid4())}, payload | {"note": "x"*2001}):
                response = client.post(url+"/change-requests", headers=customer, json=invalid)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("forged", response.text)
            oversized = client.post(url+"/change-requests", headers=customer, json=payload | {"note": "x"*17000})
            self.assertEqual(oversized.status_code, 413)
            self.assertEqual(oversized.headers["cache-control"], "private, no-store")
            self.assertEqual(client.delete(url, headers=customer).status_code, 405)

    def test_http_staff_reads_retained_feedback_without_customer_or_tenant_leak(self):
        review = self.retained_assignment()
        url = "/api/trial/v1/website-reviews/" + str(review[0])
        payload = dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=review[2], note="ပိုတိုအောင်ရေးပေးပါ")
        with self.http_client() as client:
            self.assertEqual(client.post(url+"/change-requests", headers={"x-test-actor": "customer"}, json=payload).status_code, 200)
            for headers, status in (({}, 401), ({"x-test-actor": "customer"}, 403),
                                    ({"x-test-actor": "other"}, 403), ({"x-test-actor": "agent"}, 403)):
                denied = client.get(url+"/change-requests", headers=headers)
                self.assertEqual(denied.status_code, status)
                self.assertEqual(denied.headers["cache-control"], "private, no-store")
                self.assertNotIn(payload["note"], denied.text)
            owner = {"x-test-actor": "operator"}
            result = client.get(url+"/change-requests", headers=owner)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.headers["cache-control"], "private, no-store")
            self.assertEqual(result.json()["requests"][0]["note"], payload["note"])
            self.assertEqual(set(result.json()), {"reviewId", "contentRevision", "sourceVersion", "previewDigest", "reviewStatus", "publicationAuthorized", "requests", "nextAfter"})
            self.assertEqual(set(result.json()["requests"][0]), {"commandId", "note", "createdAt"})
            for query in ("?after=bad", "?after=", "?workspaceId=other", "?after="+payload["commandId"]+"&after="+payload["commandId"]):
                self.assertEqual(client.get(url+"/change-requests"+query, headers=owner).status_code, 422)
            self.assertEqual(client.post(url+"/withdraw", headers=owner, json={}).status_code, 200)
            retained = client.get(url+"/change-requests", headers=owner).json()
            self.assertEqual(retained["reviewStatus"], "revoked")
            self.assertFalse(retained["publicationAuthorized"])
            self.assertEqual(retained["requests"], result.json()["requests"])

    def test_staff_feedback_pagination_handles_equal_timestamps_and_bound_cursors(self):
        from uuid import UUID
        review = self.retained_assignment()
        with self.transaction(RECIPIENT) as connection:
            # Deliberately scramble physical insertion order, so time/insertion
            # order cannot accidentally substitute for the UUID tie-breaker.
            for number in [*range(1, 54, 2), *range(2, 54, 2)]:
                self.feedback(connection, review, UUID(int=number), note=f"Correction {number}")
            connection.commit()
        # Synthetic fixture only in this test's disposable loopback cluster.
        # The real trigger assigns clock_timestamp() on every insert. Pin all
        # timestamps explicitly, restore the exact guard before the adapter
        # runs its normal catalog checks, and prove equality rather than assume.
        with pg._connect(self.admin_url) as connection:
            connection.execute("alter table app_private.website_customer_feedback disable trigger website_feedback_guard")
            connection.execute("""update app_private.website_customer_feedback set created_at=(
                select max(created_at) from app_private.website_customer_feedback where review_id=%s)
                where review_id=%s""", (review[0], review[0]))
            connection.execute("alter table app_private.website_customer_feedback enable trigger website_feedback_guard")
            self.assertEqual(connection.execute("select count(distinct created_at),count(*) from app_private.website_customer_feedback where review_id=%s", (review[0],)).fetchone(), (1, 53))
        adapter = self.adapter(write=False)
        operator = TrialPrincipal(WORKSPACE, OWNER, "human")
        first = adapter.feedback(operator, str(review[0]))
        self.assertEqual(len(first["requests"]), 50)
        self.assertEqual([row["commandId"] for row in first["requests"]], [str(UUID(int=i)) for i in range(53, 3, -1)])
        self.assertEqual(first["nextAfter"], str(UUID(int=4)))
        second = adapter.feedback(operator, str(review[0]), after=first["nextAfter"])
        self.assertEqual([row["commandId"] for row in second["requests"]], [str(UUID(int=i)) for i in (3, 2, 1)])
        self.assertIsNone(second["nextAfter"])
        self.assertEqual(len({row["commandId"] for row in first["requests"] + second["requests"]}), 53)
        other_review = self.retained_assignment()
        with self.assertRaises(TrialValidationError):
            adapter.feedback(operator, str(other_review[0]), after=first["nextAfter"])
        with self.assertRaises(TrialValidationError):
            adapter.feedback(operator, str(review[0]), after=str(uuid4()))
        with self.transaction() as connection:
            self.assertEqual(connection.execute("select count(*) from app_private.website_customer_feedback where review_id=%s", (review[0],)).fetchone()[0], 53)

    def test_staff_feedback_retains_expired_and_stale_revision_without_reopening_it(self):
        operator = TrialPrincipal(WORKSPACE, OWNER, "human")
        with self.transaction() as connection:
            expired = self.prepare(connection, expiry="1 second")
            connection.commit()
        time.sleep(1.05)
        result = self.adapter(write=False).feedback(operator, str(expired[0]))
        self.assertEqual(result["reviewStatus"], "expired")
        self.assertEqual(result["requests"], [])
        review = self.retained_assignment()
        with self.transaction() as connection:
            self.edit(connection)
            connection.commit()
        result = self.adapter(write=False).feedback(operator, str(review[0]))
        self.assertEqual(result["reviewStatus"], "stale")
        self.assertFalse(result["publicationAuthorized"])

    def test_operator_prepares_customer_reviews_and_withdraws_without_state_mutation(self):
        adapter = self.adapter()
        operator = TrialPrincipal(WORKSPACE, OWNER, "human")
        recipient = TrialPrincipal(WORKSPACE, RECIPIENT, "human")
        arguments = self.preparation_arguments()
        with self.transaction() as connection:
            before = connection.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='website'", (WORKSPACE,)).fetchone()
        created = adapter.prepare(operator, **arguments)
        self.assertTrue(created["persisted"])
        self.assertFalse(created["replayed"])
        self.assertTrue(adapter.prepare(operator, **arguments)["replayed"])
        preview = adapter.preview(recipient, created["reviewId"])
        self.assertEqual(preview["previewDigest"], created["previewDigest"])
        self.assertEqual(adapter.revoke(operator, created["reviewId"])["status"], "revoked")
        self.assertTrue(adapter.revoke(operator, created["reviewId"])["replayed"])
        with self.assertRaises(TrialPermissionDenied):
            adapter.preview(recipient, created["reviewId"])
        with self.assertRaises(TrialValidationError):
            adapter.prepare(operator, **arguments)
        with self.transaction() as connection:
            self.assertEqual(connection.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='website'", (WORKSPACE,)).fetchone(), before)

    def test_preparation_denies_customer_wrong_recipient_stale_and_conflicting_input(self):
        adapter = self.adapter()
        operator = TrialPrincipal(WORKSPACE, OWNER, "human")
        arguments = self.preparation_arguments()
        with self.assertRaises(TrialPermissionDenied):
            adapter.prepare(TrialPrincipal(WORKSPACE, RECIPIENT, "human"), **arguments)
        with self.assertRaises(TrialPermissionDenied):
            adapter.prepare(operator, **(arguments | {"recipient_actor_id": str(uuid4())}))
        for changed in ({"expected_version": arguments["expected_version"]+1}, {"expected_version": True},
                        {"expires_at": (datetime.now(timezone.utc)+timedelta(days=8)).isoformat()},
                        {"expires_at": (datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}):
            with self.subTest(changed=changed), self.assertRaises(TrialValidationError):
                adapter.prepare(operator, **(arguments | changed))
        created = adapter.prepare(operator, **arguments)
        with self.assertRaises(TrialValidationError):
            adapter.prepare(operator, **(arguments | {"expires_at": (datetime.now(timezone.utc)+timedelta(days=2)).isoformat()}))
        with self.assertRaises(TrialPermissionDenied):
            adapter.revoke(TrialPrincipal(WORKSPACE, RECIPIENT, "human"), created["reviewId"])

    def test_adapter_preview_feedback_replay_and_conflict_real_transactions(self):
        review = self.retained_assignment()
        actor = TrialPrincipal(WORKSPACE, RECIPIENT, actor_kind="human")
        adapter = self.adapter()
        preview = adapter.preview(actor, str(review[0]))
        self.assertEqual(preview["previewDigest"], review[2])
        self.assertNotIn("recipientActorId", preview)
        payload = dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=review[2], note="Shorten the title")
        result = adapter.request_changes(actor, payload)
        self.assertTrue(result["persisted"])
        self.assertFalse(result["replayed"])
        replay = adapter.request_changes(actor, payload)
        self.assertTrue(replay["replayed"])
        self.assertEqual(result["createdAt"], replay["createdAt"])
        with self.assertRaises(TrialValidationError):
            adapter.request_changes(actor, payload | {"note": "Different title"})
        with self.transaction(RECIPIENT) as connection:
            self.assertEqual(connection.execute("select count(*) from app_private.website_customer_feedback where command_id=%s", (payload["commandId"],)).fetchone()[0], 1)
        with self.transaction() as connection:
            connection.execute("update app_private.website_customer_reviews set status='revoked' where review_id=%s", (review[0],))
            connection.commit()
        with self.assertRaises(TrialPermissionDenied):
            adapter.preview(actor, str(review[0]))
        with self.assertRaises(TrialPermissionDenied):
            adapter.request_changes(actor, payload)

    def test_adapter_rechecks_real_supabase_session_before_retry(self):
        review = self.retained_assignment()
        session = str(uuid4())
        actor = TrialPrincipal(WORKSPACE, RECIPIENT, "human", session_id=session, identity_provider="supabase")
        with pg._connect(self.admin_url) as connection:
            connection.execute("insert into auth.sessions(id,user_id) values (%s,%s)", (session, RECIPIENT))
        adapter = self.adapter()
        payload = dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=review[2], note="Simplify wording")
        self.assertTrue(adapter.request_changes(actor, payload)["persisted"])
        with pg._connect(self.admin_url) as connection:
            connection.execute("delete from auth.sessions where id=%s", (session,))
        with self.assertRaises(TrialNotReadyError):
            adapter.request_changes(actor, payload)
        with self.assertRaises(TrialNotReadyError):
            adapter.preview(actor, str(review[0]))

    def test_adapter_denies_wrong_recipient_workspace_kind_and_write_disabled(self):
        review = self.retained_assignment()
        for actor in (TrialPrincipal(WORKSPACE, OWNER, "human"), TrialPrincipal("rehearsal-b", "owner-b", "human"), TrialPrincipal(WORKSPACE, RECIPIENT, "agent")):
            with self.subTest(actor=actor), self.assertRaises(TrialPermissionDenied):
                self.adapter().preview(actor, str(review[0]))
        with self.assertRaises(TrialNotReadyError):
            self.adapter(write=False).request_changes(TrialPrincipal(WORKSPACE, RECIPIENT, "human"),
                dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=review[2], note="Shorten title"))

    def test_adapter_rejects_expired_and_corrupt_request_identity(self):
        review = self.retained_assignment()
        actor = TrialPrincipal(WORKSPACE, RECIPIENT, "human")
        adapter = self.adapter()
        payload = dict(commandId=str(uuid4()), reviewId=str(review[0]), previewDigest=DIGEST, note="Shorten title")
        with self.assertRaises(TrialValidationError):
            adapter.request_changes(actor, payload)
        with self.assertRaises(TrialValidationError):
            adapter.request_changes(actor, payload | {"actorId": RECIPIENT})
        with self.transaction() as connection:
            expired = self.prepare(connection, expiry="20 milliseconds")
            connection.commit()
        time.sleep(0.03)
        with self.assertRaises(TrialPermissionDenied):
            adapter.preview(actor, str(expired[0]))

    def test_runtime_catalog_rejects_partial_or_disabled_review_guards(self):
        from psycopg.rows import dict_row
        for sql in ("drop trigger website_review_guard on app_private.website_customer_reviews",
                    "alter table app_private.website_customer_feedback disable trigger website_feedback_guard"):
            with self.subTest(sql=sql), pg._connect(self.admin_url) as connection:
                try:
                    connection.execute(sql)
                    with connection.cursor(row_factory=dict_row) as cursor, self.assertRaises(TrialNotReadyError):
                        PostgresTrialStore._assert_schema(cursor)
                finally:
                    connection.rollback()

    def test_reviewer_entitlement_proves_boolean_without_company_event_access(self):
        with self.transaction(RECIPIENT) as connection:
            self.assertEqual(connection.execute("select payload_json from app_private.workspace_events where surface='company'").fetchall(), [])
            self.assertTrue(connection.execute("select app_private.website_review_entitled()").fetchone()[0])
            self.assertEqual(connection.execute("select has_function_privilege('anon','app_private.website_review_entitled()','execute'), has_function_privilege('authenticated','app_private.website_review_entitled()','execute'), has_function_privilege('service_role','app_private.website_review_entitled()','execute')").fetchone(), (False, False, False))
        with self.transaction(OWNER) as connection:
            self.assertFalse(connection.execute("select app_private.website_review_entitled()").fetchone()[0])
        with self.transaction("owner-b", "rehearsal-b") as connection:
            self.assertFalse(connection.execute("select app_private.website_review_entitled()").fetchone()[0])

    def test_reviewer_entitlement_requires_canonical_current_activation(self):
        vectors = (({"products": ["website"]}, True), ({"product": "website"}, True),
                   ({"products": ["ecommerce"]}, False), ({"products": []}, False),
                   ({"products": ["website", "shop"]}, False), ({"products": ["website", "website"]}, False),
                   ({"products": ["website", "unknown"]}, False), ({"products": "website"}, False))
        for payload, expected in vectors:
            with self.subTest(payload=payload), pg._connect(self.admin_url) as connection:
                try:
                    connection.execute("""insert into app_private.workspace_events
                        (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
                        values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human',%s::jsonb,'{}'::jsonb)""",
                        (uuid4(), WORKSPACE, uuid4(), 'a'*64, OWNER, json.dumps(payload)))
                    self.context(connection, RECIPIENT)
                    self.assertEqual(connection.execute("select app_private.website_review_entitled()").fetchone()[0], expected)
                finally:
                    connection.rollback()

    def test_reviewer_entitlement_denies_suspended_removed_and_nonhuman_members(self):
        changes = (("update app_private.workspace_access_controls set status='suspended' where workspace_id=%s", (WORKSPACE,)),
                   ("update app_private.workspace_memberships set status='revoked' where workspace_id=%s and actor_id=%s", (WORKSPACE, RECIPIENT)),
                   ("update app_private.workspace_memberships set capabilities=array[]::text[] where workspace_id=%s and actor_id=%s", (WORKSPACE, RECIPIENT)),
                   ("update app_private.workspace_memberships set actor_kind='agent' where workspace_id=%s and actor_id=%s", (WORKSPACE, RECIPIENT)))
        for sql, params in changes:
            with self.subTest(sql=sql), pg._connect(self.admin_url) as connection:
                try:
                    connection.execute(sql, params)
                    self.context(connection, RECIPIENT)
                    self.assertFalse(connection.execute("select app_private.website_review_entitled()").fetchone()[0])
                finally:
                    connection.rollback()

    def test_reviewer_activation_has_precedence_over_newer_creation_event(self):
        with pg._connect(self.admin_url) as connection:
            try:
                connection.execute("""insert into app_private.workspace_events
                    (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
                    values (%s,%s,%s,%s,'company','company.workspace.created',%s,'human','{"products":["shop"]}'::jsonb,'{}'::jsonb)""",
                    (uuid4(), WORKSPACE, uuid4(), 'b'*64, OWNER))
                self.context(connection, RECIPIENT)
                self.assertTrue(connection.execute("select app_private.website_review_entitled()").fetchone()[0])
            finally:
                connection.rollback()

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

    def test_repeatable_read_old_snapshot_cannot_submit_after_edit_or_revoke(self):
        for change in ("edit", "revoke"):
            with self.subTest(change=change):
                with self.transaction() as setup:
                    review = self.prepare(setup)
                    setup.commit()
                with self.transaction(RECIPIENT, isolation="repeatable read") as customer:
                    self.assertEqual(customer.execute("select status from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchone()[0], "active")
                    with self.transaction() as editor:
                        if change == "edit":
                            self.edit(editor)
                        else:
                            editor.execute("update app_private.website_customer_reviews set status='revoked' where review_id=%s", (review[0],))
                        editor.commit()
                    # Establish the precise stale-snapshot condition, not a new transaction.
                    self.assertEqual(customer.execute("select status from app_private.website_customer_reviews where review_id=%s", (review[0],)).fetchone()[0], "active")
                    with self.assertRaises(self.db_error) as caught:
                        self.feedback(customer, review)
                    self.assertEqual(caught.exception.sqlstate, "0A000")

    def test_preparation_and_website_edit_require_read_committed(self):
        for isolation in ("repeatable read", "serializable"):
            for action in (self.prepare, self.edit):
                with self.subTest(isolation=isolation, action=action.__name__), self.transaction(isolation=isolation) as connection:
                    with self.assertRaises(self.db_error) as caught:
                        action(connection)
                    self.assertEqual(caught.exception.sqlstate, "0A000")

    def test_read_committed_wait_then_resume_rechecks_assignment(self):
        with self.transaction() as setup:
            review = self.prepare(setup)
            setup.commit()
        pid_queue = Queue(maxsize=1)

        def submit():
            with self.transaction(RECIPIENT) as customer:
                customer.execute("set local lock_timeout='3s'")
                pid_queue.put(customer.execute("select pg_backend_pid()").fetchone()[0])
                try:
                    self.feedback(customer, review)
                except self.db_error as error:
                    return error.sqlstate
                return "unexpected_success"

        # One bounded SQL worker is necessary to test a waiting statement. This
        # is not parallel product/test-suite execution or a second agent.
        with self.transaction() as editor, ThreadPoolExecutor(max_workers=1) as worker:
            self.edit(editor)
            pending = worker.submit(submit)
            try:
                pid = pid_queue.get(timeout=2)
                deadline, waiting = time.monotonic() + 2, False
                with pg._connect(self.admin_url, autocommit=True) as observer:
                    while time.monotonic() < deadline:
                        waiting = observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s", (pid,)).fetchone()[0]
                        if waiting:
                            break
                        time.sleep(0.01)
                self.assertTrue(waiting, "feedback must actually wait on the edit")
                editor.commit()
                self.assertEqual(pending.result(timeout=3), "42501")
            finally:
                editor.rollback()


    def test_zzz_acceptance_extension_is_private_immutable_and_exclusive_with_feedback(self):
        # Install only in this disposable test cluster, after baseline adapter tests.
        # The candidate extension is deliberately absent from the release chain.
        extension = pg.ROOT / 'supabase/rehearsal/website_customer_acceptance.sql'
        with pg._connect(self.admin_url) as connection:
            connection.execute(extension.read_text(encoding='utf-8'))

        def accept(connection, review, *, actor=RECIPIENT, digest=None, fingerprint=None):
            review_id, version, prepared_digest = review
            revision = connection.execute('select content_revision from app_private.website_customer_reviews where review_id=%s', (review_id,)).fetchone()[0]
            command = uuid4()
            identity = dict(contract='supermega.website.customer-acceptance.v1', workspaceId=WORKSPACE,
                            actorId=actor, reviewId=str(review_id), commandId=str(command),
                            contentRevision=revision, previewDigest=digest or prepared_digest,
                            decision='accept_preview_for_release_review')
            expected = 'sha256:' + sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False,
                                                     separators=(',', ':')).encode()).hexdigest()
            return connection.execute('''insert into app_private.website_customer_acceptances
                (workspace_id,actor_id,command_id,review_id,source_version,content_revision,
                 preview_digest,command_fingerprint,decision,accepted_at)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,'2000-01-01') returning accepted_at''',
                (WORKSPACE, actor, command, review_id, version, revision, digest or prepared_digest,
                 fingerprint or expected, identity['decision'])).fetchone()[0]

        with self.transaction() as connection:
            review = self.prepare(connection)
            self.context(connection, RECIPIENT)
            stamp = accept(connection, review)
            self.assertGreater(stamp, datetime(2026, 1, 1, tzinfo=timezone.utc))
            with self.assertRaises(self.db_error):
                accept(connection, review)

        for mutation in ('feedback_first', 'feedback_after', 'update', 'delete', 'forged_digest', 'forged_fingerprint'):
            with self.subTest(mutation=mutation), self.transaction() as connection:
                review = self.prepare(connection)
                self.context(connection, RECIPIENT)
                if mutation == 'feedback_first':
                    self.feedback(connection, review)
                    with self.assertRaisesRegex(self.db_error, 'website_acceptance_changes_pending'):
                        accept(connection, review)
                elif mutation.startswith('forged'):
                    with self.assertRaises(self.db_error):
                        accept(connection, review, **({'digest': DIGEST} if mutation == 'forged_digest' else {'fingerprint': DIGEST}))
                else:
                    accept(connection, review)
                    with self.assertRaises(self.db_error):
                        if mutation == 'feedback_after':
                            self.feedback(connection, review)
                        else:
                            connection.execute(('update app_private.website_customer_acceptances set accepted_at=clock_timestamp()'
                                                if mutation == 'update' else 'delete from app_private.website_customer_acceptances'))

        for mode in ('wrong_actor', 'wrong_workspace', 'expired', 'revoked', 'stale'):
            with self.subTest(mode=mode), self.transaction(isolation=mode) as connection:
                review = self.prepare(connection, expiry='200 milliseconds' if mode == 'expired' else '1 day')
                if mode == 'expired':
                    connection.execute('select pg_sleep(0.25)')
                elif mode == 'revoked':
                    connection.execute("update app_private.website_customer_reviews set status='revoked' where review_id=%s", (review[0],))
                elif mode == 'stale':
                    self.edit(connection)
                self.context(connection, OWNER if mode == 'wrong_actor' else RECIPIENT,
                             'rehearsal-b' if mode == 'wrong_workspace' else WORKSPACE)
                if mode == 'wrong_workspace':
                    self.assertEqual(connection.execute('select * from app_private.website_customer_acceptances').fetchall(), [])
                    with self.assertRaises(self.db_error):
                        connection.execute('''insert into app_private.website_customer_acceptances
                            (workspace_id,actor_id,command_id,review_id,source_version,content_revision,
                             preview_digest,command_fingerprint,decision)
                            values (%s,%s,%s,%s,%s,0,%s,%s,'accept_preview_for_release_review')''',
                            (WORKSPACE, RECIPIENT, uuid4(), review[0], review[1], review[2], DIGEST))
                    continue
                with self.assertRaises(self.db_error):
                    accept(connection, review)

        review = self.retained_assignment()
        for isolation in ('repeatable read', 'serializable'):
            with self.subTest(isolation=isolation), self.transaction(RECIPIENT, isolation=isolation) as connection:
                with self.assertRaisesRegex(self.db_error, 'website_review_requires_read_committed'):
                    accept(connection, review)

        # Observe a real lock wait, then commit the winning transaction. A single
        # bounded worker is required for the race; suites still run serially.
        for first, second, expected_error in (
            ('feedback', 'accept', 'website_acceptance_changes_pending'),
            ('accept', 'feedback', 'website_review_already_accepted'),
            ('edit', 'accept', 'website_acceptance_assignment_denied'),
            ('revoke', 'accept', 'website_acceptance_assignment_denied'),
        ):
            with self.subTest(first=first, second=second):
                review = self.retained_assignment()
                pid_queue = Queue(maxsize=1)

                def waiting_customer():
                    with self.transaction(RECIPIENT) as customer:
                        customer.execute("set local lock_timeout='5s'")
                        pid_queue.put(customer.execute('select pg_backend_pid()').fetchone()[0])
                        try:
                            if second == 'accept':
                                accept(customer, review)
                            else:
                                self.feedback(customer, review)
                            customer.commit()
                            return 'unexpected_success'
                        except self.db_error as error:
                            return str(error)

                with self.transaction(OWNER if first in ('edit', 'revoke') else RECIPIENT) as leader:
                    if first == 'feedback':
                        self.feedback(leader, review)
                    elif first == 'accept':
                        accept(leader, review)
                    elif first == 'edit':
                        self.edit(leader)
                    else:
                        leader.execute("update app_private.website_customer_reviews set status='revoked' where review_id=%s", (review[0],))
                    with ThreadPoolExecutor(max_workers=1) as worker:
                        pending = worker.submit(waiting_customer)
                        try:
                            pid = pid_queue.get(timeout=2)
                            deadline, waiting = time.monotonic() + 2, False
                            with pg._connect(self.admin_url, autocommit=True) as observer:
                                while time.monotonic() < deadline:
                                    row = observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s", (pid,)).fetchone()
                                    waiting = bool(row and row[0])
                                    if waiting:
                                        break
                                    time.sleep(0.01)
                            self.assertTrue(waiting, 'second decision must actually wait on the first')
                            leader.commit()
                            self.assertIn(expected_error, pending.result(timeout=4))
                        finally:
                            leader.rollback()
                with self.transaction(OWNER) as inspect:
                    counts = inspect.execute('''select
                        (select count(*) from app_private.website_customer_acceptances where review_id=%s),
                        (select count(*) from app_private.website_customer_feedback where review_id=%s)''',
                        (review[0], review[0])).fetchone()
                    self.assertEqual(counts, (1, 0) if first == 'accept' else (0, 1) if first == 'feedback' else (0, 0))

        with pg._connect(self.admin_url) as connection:
            row = connection.execute("select relrowsecurity,relforcerowsecurity from pg_class where oid='app_private.website_customer_acceptances'::regclass").fetchone()
            self.assertEqual(row, (True, True))
            for role in ('anon', 'authenticated', 'service_role'):
                self.assertFalse(connection.execute("select has_table_privilege(%s,'app_private.website_customer_acceptances','select,insert,update,delete')", (role,)).fetchone()[0])


if __name__ == "__main__":
    unittest.main()
