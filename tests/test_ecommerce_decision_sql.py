"""Decision storage on generated loopback PostgreSQL only; no managed target."""
import json
import os
from hashlib import sha256
from uuid import uuid4
import unittest
from tests import test_website_customer_review_sql as fixture
from tools import rehearse_supermega_postgres17 as pg

@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_REVIEW_SQL') == '1', 'explicit disposable SQL only')
class CatalogDecisionSqlTests(unittest.TestCase):
    stop = classmethod(fixture.WebsiteReviewSqlTests.stop.__func__)
    context = fixture.WebsiteReviewSqlTests.context

    @classmethod
    def setUpClass(cls):
        fixture.WebsiteReviewSqlTests.setUpClass.__func__(cls)

    def test_schema_guard_rejects_storage_tampering(self):
        from psycopg.rows import dict_row
        from supermega_runtime.trial_store import PostgresTrialStore, TrialNotReadyError
        mutations = [
            "alter table app_private.ecommerce_customer_decisions disable row level security",
            "drop policy ecommerce_decisions_insert on app_private.ecommerce_customer_decisions",
            "grant select on app_private.ecommerce_customer_decisions to authenticated",
            "alter table app_private.ecommerce_customer_decisions disable trigger ecommerce_decision_guard",
            "alter function app_private.guard_ecommerce_decision() security definer",
        ]
        with pg._connect(self.admin_url) as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                PostgresTrialStore._assert_schema(cursor)
                for mutation in mutations:
                    with self.subTest(mutation=mutation):
                        cursor.execute('savepoint schema_probe')
                        try:
                            cursor.execute(mutation)
                            with self.assertRaises(TrialNotReadyError):
                                PostgresTrialStore._assert_schema(cursor)
                        finally:
                            cursor.execute('rollback to savepoint schema_probe')
                            cursor.execute('release savepoint schema_probe')
                        PostgresTrialStore._assert_schema(cursor)

    def test_decisions_are_private_immutable_and_mutually_exclusive(self):
        from supermega_runtime.ecommerce_decision_schema import acceptance_catalog_digest, ACCEPTANCE_CATALOG_DIGEST
        with pg._connect(self.admin_url) as connection:
            self.assertEqual(acceptance_catalog_digest(connection.cursor()), ACCEPTANCE_CATALOG_DIGEST)
        from tests.test_commerce_runtime import catalog_state, storefront_configuration
        from supermega_runtime.commerce_runtime import commerce_storefront_preview, commerce_storefront_preview_digest
        workspace, owner, recipient = fixture.WORKSPACE, fixture.OWNER, fixture.RECIPIENT
        source = catalog_state(); source['storefrontConfiguration'] = storefront_configuration(source)
        digest = commerce_storefront_preview_digest(source)
        reviews = [str(uuid4()) for _ in range(55)]
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_memberships set capabilities=array['ecommerce.review'] where workspace_id=%s and actor_id=%s", (workspace,recipient))
            connection.execute("""insert into app_private.workspace_events
              (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
              values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human','{"products":["ecommerce"]}'::jsonb,'{}'::jsonb)""", (uuid4(),workspace,uuid4(),'a'*64,owner))
            self.context(connection,owner)
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'commerce',1,%s::jsonb,%s)", (workspace,json.dumps(source),owner))
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,owner)
            for review in reviews:
                connection.execute("""insert into app_private.ecommerce_customer_reviews
                  (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                  values (%s,%s,%s,%s,1,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                  (review,workspace,recipient,owner,json.dumps(commerce_storefront_preview(source)),digest))
        from supermega_runtime.ecommerce_customer_review_store import EcommerceCustomerReviewStore
        from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialValidationError, TrialPermissionDenied, TrialNotReadyError, TrialIdempotencyConflict
        adapter = EcommerceCustomerReviewStore(PostgresTrialStore(self.runtime_url, reducer=lambda *args: {}, write_enabled=True))
        actor = TrialPrincipal(workspace, recipient, 'human')
        operator_actor = TrialPrincipal(workspace, owner, 'human')
        listing = adapter.prepared_reviews(operator_actor)
        listing_tail = adapter.prepared_reviews(operator_actor, after=listing['nextAfter'])
        self.assertEqual(len(listing['reviews']), 50); self.assertEqual(len(listing_tail['reviews']), 5)
        self.assertEqual([r['reviewId'] for r in listing['reviews']+listing_tail['reviews']], sorted(reviews))
        self.assertIsNone(listing_tail['nextAfter'])
        self.assertFalse(listing['publicationAuthorized']); self.assertFalse(listing['deploymentAuthorized'])
        self.assertEqual(set(listing['reviews'][0]), {'reviewId','sourceVersion','contentRevision','previewDigest','preparedAt','expiresAt','status'})
        for denied in (actor, TrialPrincipal(workspace, owner, 'agent')):
            with self.assertRaises(TrialPermissionDenied): adapter.prepared_reviews(denied)
        with self.assertRaises(TrialNotReadyError):
            adapter.prepared_reviews(TrialPrincipal('other-company', owner, 'human'))

        for review_id, kind in [(reviews[3], 'acceptance'), (reviews[4], 'feedback')]:
            payload = dict(commandId=str(uuid4()), reviewId=review_id, previewDigest=digest)
            payload.update(dict(decision='accept_preview_for_release_review') if kind=='acceptance' else dict(note='စျေးနှုန်း ပြင်ပါ'))
            first = adapter.record_decision(actor,payload,kind=kind)
            replay = adapter.record_decision(actor,payload,kind=kind)
            self.assertTrue(first['persisted']); self.assertFalse(first['replayed'])
            self.assertEqual(replay, first | {'replayed': True})
            readback = adapter.decisions(actor, review_id)
            self.assertEqual(readback['decisions'], [dict(commandId=payload['commandId'], kind=kind,
                note=payload.get('note'), createdAt=first['acceptedAt' if kind=='acceptance' else 'createdAt'])])
            self.assertIsNone(readback['nextAfter'])
            operator = adapter.operator_decisions(TrialPrincipal(workspace, owner, 'human'), review_id)
            self.assertEqual(operator['decisions'], readback['decisions'])
            self.assertEqual(operator['status'], 'active')
            self.assertFalse(operator['publicationAuthorized']); self.assertFalse(operator['deploymentAuthorized'])
            with self.assertRaises(TrialPermissionDenied):
                adapter.operator_decisions(actor, review_id)
            with self.assertRaises(TrialPermissionDenied):
                adapter.operator_decisions(TrialPrincipal(workspace, owner, 'agent'), review_id)
            with self.assertRaises(TrialNotReadyError):
                adapter.operator_decisions(TrialPrincipal('other-company', owner, 'human'), review_id)

            self.assertFalse(readback['publicationAuthorized'])
            self.assertEqual(adapter.decisions(actor, review_id, after=payload['commandId'])['decisions'], [])
            with self.assertRaises(TrialPermissionDenied):
                adapter.decisions(TrialPrincipal(workspace, owner, 'human'), review_id)
            with self.assertRaisesRegex(TrialNotReadyError, 'membership_ready'):
                adapter.decisions(TrialPrincipal('other-company', recipient, 'human'), review_id)
            if kind=='feedback':
                with self.assertRaises(TrialIdempotencyConflict):
                    adapter.record_decision(actor,payload | {'note': 'Changed request'},kind=kind)
        with self.assertRaises(TrialValidationError):
            adapter.record_decision(actor,payload | {'extra': True},kind='feedback')
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.trial_runtime import create_trial_router
        app = FastAPI()
        principals = {'customer': actor, 'owner': TrialPrincipal(workspace, owner, 'human'),
                      'agent': TrialPrincipal(workspace, recipient, 'agent')}
        app.include_router(create_trial_router(store=adapter.store,
            resolve_principal=lambda request: principals.get(request.headers.get('x-test-actor'))))
        with TestClient(app) as client:
            headers = {'x-test-actor': 'customer'}
            directory = '/api/trial/v1/ecommerce-reviews'
            listed = client.get(directory, headers={'x-test-actor': 'owner'})
            self.assertEqual(listed.status_code, 200); self.assertEqual(len(listed.json()['reviews']), 50)
            self.assertIn('no-store', listed.headers['cache-control'])
            for denied_actor in ('customer','agent'):
                self.assertEqual(client.get(directory, headers={'x-test-actor': denied_actor}).status_code, 403)
            self.assertEqual(client.get(directory).status_code, 401)
            for query in ('?after=bad','?after='+str(uuid4())+'&after='+str(uuid4()),'?extra=1'):
                self.assertEqual(client.get(directory+query, headers={'x-test-actor': 'owner'}).status_code, 422)

            base = '/api/trial/v1/ecommerce-reviews/' + payload['reviewId']
            operator_url = base + '/operator-decisions'
            operator_read = client.get(operator_url, headers={'x-test-actor': 'owner'})
            self.assertEqual(operator_read.status_code, 200)
            self.assertEqual(operator_read.json()['decisions'][0]['note'], 'စျေးနှုန်း ပြင်ပါ')
            self.assertIn('no-store', operator_read.headers['cache-control'])
            for denied_actor in ('customer', 'agent'):
                self.assertEqual(client.get(operator_url, headers={'x-test-actor': denied_actor}).status_code, 403)
            self.assertEqual(client.get(operator_url).status_code, 401)
            for query in ('?after=bad', '?after='+str(uuid4())+'&after='+str(uuid4()), '?extra=1'):
                self.assertEqual(client.get(operator_url+query, headers={'x-test-actor': 'owner'}).status_code, 422)

            read = client.get(base + '/decisions', headers=headers)
            self.assertEqual(read.status_code, 200)
            self.assertEqual(read.json(), adapter.decisions(actor, payload['reviewId']))
            self.assertEqual(read.headers['cache-control'], 'private, no-store')
            retry = client.post(base + '/change-requests', headers=headers, json=payload)
            self.assertEqual(retry.status_code, 200)
            self.assertTrue(retry.json()['replayed'])
            for suffix in ('?extra=1', '?after=a&after=b'):
                self.assertEqual(client.get(base + '/decisions' + suffix, headers=headers).status_code, 422)
            for invalid in (payload | {'extra': True}, payload | {'reviewId': str(uuid4())}):
                self.assertEqual(client.post(base + '/change-requests', headers=headers, json=invalid).status_code, 422)
            for role in ('owner', 'agent'):
                denied = client.get(base + '/decisions', headers={'x-test-actor': role})
                self.assertEqual(denied.status_code, 403)
                self.assertEqual(denied.headers['cache-control'], 'private, no-store')
            self.assertEqual(client.get(base + '/decisions').status_code, 401)
            # A distinct review allows actual HTTP acceptance, not just replay.
            acceptance = dict(commandId=str(uuid4()), reviewId=reviews[2], previewDigest=digest,
                              decision='accept_preview_for_release_review')
            accepted = client.post('/api/trial/v1/ecommerce-reviews/' + reviews[2] + '/acceptance',
                                   headers=headers, json=acceptance)
            self.assertEqual(accepted.status_code, 200)
            self.assertTrue(accepted.json()['persisted'])
            self.assertFalse(accepted.json()['replayed'])
            for review_id, route, conflict in [
                (reviews[2], 'change-requests', dict(commandId=str(uuid4()), note='Change')),
                (payload['reviewId'], 'acceptance', dict(commandId=str(uuid4()), decision='accept_preview_for_release_review')),
            ]:
                response = client.post('/api/trial/v1/ecommerce-reviews/' + review_id + '/' + route,
                    headers=headers, json=dict(reviewId=review_id, previewDigest=digest, **conflict))
                self.assertEqual(response.status_code, 409)
                self.assertIn('trial_invalid_transition', response.text)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')
                self.assertNotIn('app_private', response.text)
            changed = client.post(base + '/change-requests', headers=headers, json=payload | {'note': 'Different'})
            self.assertEqual(changed.status_code, 409)
            self.assertIn('trial_idempotency_conflict', changed.text)
            session = str(uuid4())
            with pg._connect(self.admin_url) as connection:
                connection.execute('insert into auth.sessions(id,user_id) values (%s,%s)', (session, recipient))
            principals['session'] = TrialPrincipal(workspace, recipient, 'human',
                session_id=session, identity_provider='supabase')
            session_headers = {'x-test-actor': 'session'}
            self.assertEqual(client.get(base + '/decisions', headers=session_headers).status_code, 200)
            with pg._connect(self.admin_url) as connection:
                connection.execute('delete from auth.sessions where id=%s', (session,))
            # The resolver still supplies the old identity: the database must refuse it.
            for response in [client.get(base + '/decisions', headers=session_headers),
                             client.post(base + '/change-requests', headers=session_headers, json=payload),
                             client.post('/api/trial/v1/ecommerce-reviews/' + reviews[2] + '/acceptance',
                                         headers=session_headers, json=acceptance)]:
                self.assertEqual(response.status_code, 503)
                self.assertIn('auth_session_active', response.text)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')
                self.assertNotIn('commandId', response.text)
                self.assertNotIn('createdAt', response.text)


        def insert(connection, review, kind, *, bad_digest=False, source_version=1):
            command = str(uuid4())
            note = 'စျေးနှုန်း ပြင်ပါ' if kind == 'feedback' else None
            identity = dict(contract='supermega.ecommerce.customer-'+('acceptance' if kind=='acceptance' else 'feedback')+'.v1',
              workspaceId=workspace,actorId=recipient,commandId=command,reviewId=review,sourceVersion=source_version,
              contentRevision=source['storefrontConfiguration']['revision'],previewDigest=digest)
            identity.update(dict(decision='accept_preview_for_release_review') if kind=='acceptance' else dict(note=note))
            fingerprint='sha256:'+sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            return connection.execute("""insert into app_private.ecommerce_customer_decisions
              (workspace_id,actor_id,command_id,review_id,source_version,content_revision,preview_digest,command_fingerprint,kind,note)
              values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning command_id""",
              (workspace,recipient,command,review,source_version,identity['contentRevision'],digest,'sha256:'+'0'*64 if bad_digest else fingerprint,kind,note)).fetchone()[0]
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,recipient)
            with self.assertRaises(self.db_error), connection.transaction():
                insert(connection,reviews[0],'acceptance',bad_digest=True)
            with self.assertRaises(self.db_error) as stale, connection.transaction():
                insert(connection,reviews[0],'acceptance',source_version=2)
            self.assertEqual(stale.exception.sqlstate, '42501')
            self.context(connection,owner)
            with self.assertRaises(self.db_error) as wrong_actor, connection.transaction():
                insert(connection,reviews[0],'acceptance')
            self.assertEqual(wrong_actor.exception.sqlstate, '42501')
            connection.execute("update app_private.ecommerce_customer_reviews set status='revoked' where review_id=%s", (reviews[2],))
            self.context(connection,recipient)
            with self.assertRaises(self.db_error) as revoked, connection.transaction():
                insert(connection,reviews[2],'feedback')
            self.assertEqual(revoked.exception.sqlstate, '42501')
            insert(connection,reviews[0],'acceptance')
            insert(connection,reviews[1],'feedback')
            for review, kind in [(reviews[0],'feedback'),(reviews[0],'acceptance'),(reviews[1],'acceptance')]:
                with self.assertRaises(self.db_error), connection.transaction(): insert(connection,review,kind)
            for sql in ["update app_private.ecommerce_customer_decisions set note='changed'", "delete from app_private.ecommerce_customer_decisions"]:
                with self.assertRaises(self.db_error), connection.transaction(): connection.execute(sql)
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],5)
            self.context(connection,recipient,workspace='other-company')
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],0)
        # Even a privileged maintenance role cannot silently rewrite history.
        with pg._connect(self.admin_url) as connection:
            for sql in ["update app_private.ecommerce_customer_decisions set note='changed'", "delete from app_private.ecommerce_customer_decisions"]:
                with self.assertRaises(self.db_error) as immutable, connection.transaction():
                    connection.execute(sql)
                self.assertEqual(immutable.exception.sqlstate, '55000')
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],5)
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,recipient)
            for _ in range(51):
                insert(connection,reviews[1],'feedback')
        page = adapter.decisions(actor, reviews[1])
        tail = adapter.decisions(actor, reviews[1], after=page['nextAfter'])
        self.assertEqual(len(page['decisions']), 50)
        self.assertEqual(len(tail['decisions']), 2)
        self.assertIsNone(tail['nextAfter'])
        commands = [item['commandId'] for item in page['decisions'] + tail['decisions']]
        self.assertEqual(len(set(commands)), 52)
        self.assertEqual(commands, sorted(commands))
        operator_actor = TrialPrincipal(workspace, owner, 'human')
        operator_page = adapter.operator_decisions(operator_actor, reviews[1])
        operator_tail = adapter.operator_decisions(operator_actor, reviews[1], after=operator_page['nextAfter'])
        self.assertEqual(operator_page['decisions'] + operator_tail['decisions'], page['decisions'] + tail['decisions'])
        self.assertIsNone(operator_tail['nextAfter'])

        with pg._connect(self.runtime_url) as connection:
            self.context(connection,owner)
            connection.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'", (workspace,))
            self.context(connection,recipient)
            with self.assertRaises(self.db_error) as stale, connection.transaction():
                insert(connection,reviews[1],'feedback')
            self.assertEqual(stale.exception.sqlstate, '42501')
        with self.assertRaises(TrialPermissionDenied):
            adapter.record_decision(actor,payload,kind='feedback')
        with self.assertRaises(TrialPermissionDenied):
            adapter.decisions(actor, payload['reviewId'])
        history = adapter.operator_decisions(operator_actor, reviews[1])
        self.assertEqual(history['status'], 'stale')
        self.assertEqual(history['decisions'], page['decisions'])
        self.assertFalse(history['publicationAuthorized']); self.assertFalse(history['deploymentAuthorized'])
        historical = adapter.prepared_reviews(operator_actor)
        self.assertTrue(all(r['status'] in ('stale','revoked') for r in historical['reviews']))
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_memberships set capabilities=(select capabilities from app_private.workspace_memberships where workspace_id=%s and actor_id=%s) where workspace_id=%s and actor_id=%s", (workspace,owner,workspace,recipient))
        self.assertEqual(adapter.prepared_reviews(actor)['reviews'], [], 'another entitled operator cannot list the preparer records')
        with pg._connect(self.admin_url) as connection:
            for role in ('anon','authenticated','service_role'):
                self.assertFalse(connection.execute("select has_table_privilege(%s,'app_private.ecommerce_customer_decisions','SELECT,INSERT,UPDATE,DELETE')",(role,)).fetchone()[0])

if __name__ == '__main__': unittest.main()
