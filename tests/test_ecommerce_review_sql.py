"""Isolated committed-transaction catalog tests; generated loopback database only."""
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from uuid import uuid4
import json
import os
import time
import unittest
from tests import test_website_customer_review_sql as fixture
from tools import rehearse_supermega_postgres17 as pg

WORKSPACE, OWNER, RECIPIENT = fixture.WORKSPACE, fixture.OWNER, fixture.RECIPIENT

@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_REVIEW_SQL') == '1', 'explicit local SQL rehearsal only')
class CatalogReviewSqlTests(unittest.TestCase):
    # Reuse lifecycle helpers, never inherit the Website test cases or database.
    setUpClass = classmethod(fixture.WebsiteReviewSqlTests.setUpClass.__func__)
    stop = classmethod(fixture.WebsiteReviewSqlTests.stop.__func__)
    context = fixture.WebsiteReviewSqlTests.context
    transaction = fixture.WebsiteReviewSqlTests.transaction

    def test_preparation_and_source_save_serialize_in_both_orders(self):
        # Committed test data belongs only to this isolated disposable cluster.
        from tests.test_commerce_runtime import catalog_state, storefront_configuration
        from supermega_runtime.commerce_runtime import commerce_storefront_preview,commerce_storefront_preview_digest
        source=catalog_state();source['storefrontConfiguration']=storefront_configuration(source)
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_memberships set capabilities=array['ecommerce.review'] where workspace_id=%s and actor_id=%s",(WORKSPACE,RECIPIENT))
            connection.execute("""insert into app_private.workspace_events
                (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
                values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human','{"products":["ecommerce"]}'::jsonb,'{}'::jsonb)""",(uuid4(),WORKSPACE,uuid4(),'a'*64,OWNER))
            self.context(connection,OWNER)
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'commerce',1,%s::jsonb,%s) on conflict(workspace_id,surface) do update set state_json=excluded.state_json,version=app_private.workspace_state.version+1",(WORKSPACE,json.dumps(source),OWNER))
            version=connection.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'",(WORKSPACE,)).fetchone()[0]
        started=Queue()
        def prepare():
            with pg._connect(self.runtime_url) as writer:
                writer.execute("set statement_timeout='8s'")
                self.context(writer,OWNER)
                started.put(writer.info.backend_pid)
                try:
                    writer.execute("""insert into app_private.ecommerce_customer_reviews
                        (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                        values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                        (uuid4(),WORKSPACE,RECIPIENT,OWNER,version,json.dumps(commerce_storefront_preview(source)),commerce_storefront_preview_digest(source)))
                except self.db_error as error:
                    writer.rollback()
                    return error.sqlstate
                return 'unexpected_success'
        with pg._connect(self.runtime_url) as blocker:
            self.context(blocker,OWNER)
            blocker.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce' for update",(WORKSPACE,))
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(prepare)
                try:
                    pid=started.get(timeout=5)
                    waiting=False
                    with pg._connect(self.admin_url,autocommit=True) as observer:
                        deadline=time.monotonic()+5
                        while time.monotonic()<deadline:
                            row=observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s",(pid,)).fetchone()
                            if row and row[0]:
                                waiting=True
                                break
                            time.sleep(0.02)
                    self.assertTrue(waiting,'preparation must actually wait on the source row')
                    blocker.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'",(WORKSPACE,))
                    blocker.commit()
                    self.assertEqual(pending.result(timeout=10),'40001')
                finally:
                    blocker.rollback()
        with pg._connect(self.admin_url) as connection:
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_reviews').fetchone()[0],0)

        def save_source():
            with pg._connect(self.runtime_url) as writer:
                writer.execute("set statement_timeout='8s'")
                self.context(writer,OWNER)
                started.put(writer.info.backend_pid)
                writer.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'",(WORKSPACE,))
            return 'committed'
        with pg._connect(self.runtime_url) as preparer:
            self.context(preparer,OWNER)
            current_version=preparer.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'",(WORKSPACE,)).fetchone()[0]
            preparer.execute("""insert into app_private.ecommerce_customer_reviews
                (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                (uuid4(),WORKSPACE,RECIPIENT,OWNER,current_version,json.dumps(commerce_storefront_preview(source)),commerce_storefront_preview_digest(source)))
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(save_source)
                try:
                    pid=started.get(timeout=5)
                    waiting=False
                    with pg._connect(self.admin_url,autocommit=True) as observer:
                        deadline=time.monotonic()+5
                        while time.monotonic()<deadline:
                            row=observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s",(pid,)).fetchone()
                            if row and row[0]:
                                waiting=True
                                break
                            time.sleep(0.02)
                    self.assertTrue(waiting,'source save must wait for preparation commit')
                    preparer.commit()
                    self.assertEqual(pending.result(timeout=10),'committed')
                finally:
                    preparer.rollback()
        with self.transaction(OWNER) as connection:
            self.assertEqual(connection.execute('select status from app_private.ecommerce_customer_reviews').fetchall(),[('stale',)])
        with self.transaction(RECIPIENT) as connection:
            self.assertEqual(connection.execute('select preview from app_private.ecommerce_customer_reviews').fetchall(),[])

        from supermega_runtime.ecommerce_customer_review_store import EcommerceCustomerReviewStore
        from supermega_runtime.trial_store import PostgresTrialStore,TrialPrincipal,TrialPermissionDenied,TrialNotReadyError
        review_id=uuid4()
        with self.transaction(OWNER) as connection:
            version=connection.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'",(WORKSPACE,)).fetchone()[0]
            connection.execute("""insert into app_private.ecommerce_customer_reviews
                (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                (review_id,WORKSPACE,RECIPIENT,OWNER,version,json.dumps(commerce_storefront_preview(source)),commerce_storefront_preview_digest(source)))
            connection.commit()
        adapter=EcommerceCustomerReviewStore(PostgresTrialStore(self.runtime_url,reducer=lambda *args:{},write_enabled=False))
        actor=TrialPrincipal(WORKSPACE,RECIPIENT,'human')
        packet=adapter.preview(actor,str(review_id))
        self.assertEqual(packet['preview'],commerce_storefront_preview(source))
        self.assertEqual(set(packet),{'reviewId','contentRevision','preview','previewDigest','expiresAt','status','publicationAuthorized','deploymentAuthorized'})
        with self.assertRaises(TrialPermissionDenied): adapter.preview(actor,str(uuid4()))
        from datetime import datetime,timedelta,timezone
        from supermega_runtime.trial_store import TrialValidationError
        operator=TrialPrincipal(WORKSPACE,OWNER,'human')
        writer=EcommerceCustomerReviewStore(PostgresTrialStore(self.runtime_url,reducer=lambda *args:{},write_enabled=True))
        args=dict(review_id=str(uuid4()),recipient_actor_id=RECIPIENT,expected_version=version,
                  expires_at=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
        for change in (dict(expected_version=version+1),dict(expected_version=True),dict(expected_version=0)):
            with self.subTest(change=change),self.assertRaises(TrialValidationError):
                writer.prepare(operator,**(args|change))
        with self.assertRaises(TrialPermissionDenied):
            writer.prepare(operator,**(args|dict(recipient_actor_id=str(uuid4()))))
        with self.assertRaises(TrialNotReadyError): adapter.prepare(operator,**args)
        with self.assertRaises(TrialPermissionDenied): writer.prepare(actor,**args)
        created=writer.prepare(operator,**args)
        replay=writer.prepare(operator,**args)
        self.assertTrue(created['persisted']);self.assertFalse(created['replayed']);self.assertTrue(replay['replayed'])
        self.assertEqual(created['preparedAt'],replay['preparedAt'])
        self.assertEqual(adapter.preview(actor,args['review_id'])['previewDigest'],created['previewDigest'])
        with self.assertRaises(TrialValidationError): writer.prepare(operator,**(args|dict(expires_at=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat())))
        with self.assertRaises(TrialPermissionDenied): writer.revoke(actor,args['review_id'])
        self.assertFalse(writer.revoke(operator,args['review_id'])['replayed'])
        self.assertTrue(writer.revoke(operator,args['review_id'])['replayed'])
        with self.assertRaises(TrialPermissionDenied): adapter.preview(actor,args['review_id'])
        with self.assertRaises(TrialValidationError): writer.prepare(operator,**args)
        # Both callers rendezvous before entering the actual adapter. Source and
        # advisory locks must serialize them into one insert and one exact replay.
        from threading import Barrier
        rendezvous=Barrier(2)
        concurrent_args=args|dict(review_id=str(uuid4()))
        def same_preparation():
            rendezvous.wait(timeout=5)
            return writer.prepare(operator,**concurrent_args)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(same_preparation)
            second=pool.submit(same_preparation)
            receipts=[first.result(timeout=15),second.result(timeout=15)]
        self.assertEqual(sorted(receipt['replayed'] for receipt in receipts),[False,True])
        self.assertEqual(receipts[0]['preparedAt'],receipts[1]['preparedAt'])
        with self.transaction(OWNER) as connection:
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_reviews where review_id=%s',(concurrent_args['review_id'],)).fetchone()[0],1)
        class ObservedStore(PostgresTrialStore):
            def _connect(inner):
                connection=super()._connect()
                connection.execute("set statement_timeout='8s'")
                started.put(connection.info.backend_pid)
                return connection
        waiting_adapter=EcommerceCustomerReviewStore(ObservedStore(self.runtime_url,reducer=lambda *args:{},write_enabled=False))
        def assert_revoked_during_wait(principal,revoke_sql,revoke_params,error_type):
            with pg._connect(self.runtime_url) as blocker:
                self.context(blocker,OWNER)
                blocker.execute("select pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || %s,0))",(WORKSPACE,))
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pending=pool.submit(waiting_adapter.preview,principal,str(review_id))
                    try:
                        pid=started.get(timeout=5)
                        waiting=False
                        with pg._connect(self.admin_url,autocommit=True) as observer:
                            deadline=time.monotonic()+5
                            while time.monotonic()<deadline:
                                row=observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s",(pid,)).fetchone()
                                if row and row[0]:
                                    waiting=True
                                    break
                                time.sleep(0.02)
                            self.assertTrue(waiting,'preview must reach the review lock before revocation')
                            observer.execute(revoke_sql,revoke_params)
                        blocker.commit()
                        with self.assertRaises(error_type): pending.result(timeout=10)
                    finally:
                        blocker.rollback()
        assert_revoked_during_wait(actor,
            "update app_private.workspace_memberships set capabilities=array[]::text[] where workspace_id=%s and actor_id=%s",
            (WORKSPACE,RECIPIENT),TrialPermissionDenied)
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_memberships set capabilities=array['ecommerce.review'] where workspace_id=%s and actor_id=%s",(WORKSPACE,RECIPIENT))
        self.assertEqual(adapter.preview(actor,str(review_id))['reviewId'],str(review_id))
        session=str(uuid4())
        managed_actor=TrialPrincipal(WORKSPACE,RECIPIENT,'human',session_id=session,identity_provider='supabase')
        with pg._connect(self.admin_url) as connection:
            connection.execute('insert into auth.sessions(id,user_id) values (%s,%s)',(session,RECIPIENT))
        self.assertEqual(adapter.preview(managed_actor,str(review_id))['reviewId'],str(review_id))
        assert_revoked_during_wait(managed_actor,'delete from auth.sessions where id=%s',(session,),TrialNotReadyError)
        with self.assertRaises(TrialNotReadyError): adapter.preview(managed_actor,str(review_id))
        from datetime import datetime, timedelta, timezone
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.trial_runtime import create_trial_router
        principals = {'operator': TrialPrincipal(WORKSPACE, OWNER, 'human'),
                      'customer': actor, 'other': TrialPrincipal('other-workspace', RECIPIENT, 'human'),
                      'agent': TrialPrincipal(WORKSPACE, OWNER, 'agent')}
        app = FastAPI()
        app.include_router(create_trial_router(store=PostgresTrialStore(self.runtime_url,
            reducer=lambda *_: None, write_enabled=True),
            resolve_principal=lambda request: principals.get(request.headers.get('x-test-actor'))))
        with pg._connect(self.admin_url) as connection:
            http_version = connection.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'", (WORKSPACE,)).fetchone()[0]
        body = dict(reviewId=str(uuid4()), recipientActorId=RECIPIENT, expectedVersion=http_version,
                    expiresAt=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
        base = '/api/trial/v1/ecommerce-reviews'
        url = base + '/' + body['reviewId']
        owner_headers = {'x-test-actor': 'operator'}
        customer_headers = {'x-test-actor': 'customer'}
        with TestClient(app) as client:
            preparation_url = '/api/trial/v1/ecommerce-review-preparation'
            with pg._connect(self.admin_url) as connection:
                before = connection.execute('select count(*) from app_private.ecommerce_customer_reviews').fetchone()[0]
            saved = client.get(preparation_url, headers=owner_headers)
            self.assertEqual(saved.status_code, 200, saved.text)
            saved = saved.json()
            self.assertEqual(saved['sourceVersion'], http_version)
            self.assertEqual(saved['preview'], commerce_storefront_preview(source))
            self.assertEqual(saved['previewDigest'], commerce_storefront_preview_digest(source))
            self.assertFalse(saved['reviewCreated'])
            self.assertFalse(saved['publicationAuthorized'])
            self.assertFalse(saved['deploymentAuthorized'])
            for headers, status in (({}, 401), (customer_headers, 403), ({'x-test-actor':'other'}, 403)):
                self.assertEqual(client.get(preparation_url, headers=headers).status_code, status)
            self.assertEqual(client.get(preparation_url+'?workspaceId=other', headers=owner_headers).status_code, 422)
            readonly = EcommerceCustomerReviewStore(PostgresTrialStore(self.runtime_url, reducer=lambda *_: None, write_enabled=False))
            self.assertEqual(readonly.preparation_preview(principals['operator'])['preview'], saved['preview'])
            with pg._connect(self.admin_url) as connection:
                self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_reviews').fetchone()[0], before)
            for headers, status in (({}, 401), ({'x-test-actor': 'agent'}, 403), (customer_headers, 403)):
                response = client.post(base, json=body, headers=headers)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')
            for invalid in (dict(body, workspaceId=WORKSPACE), dict(body, expectedVersion=True), {}):
                self.assertEqual(client.post(base, json=invalid, headers=owner_headers).status_code, 422)
            prepared = client.post(base, json=body, headers=owner_headers)
            self.assertEqual(prepared.status_code, 200, prepared.text)
            self.assertTrue(prepared.json()['persisted'])
            self.assertTrue(client.post(base, json=body, headers=owner_headers).json()['replayed'])
            preview = client.get(url, headers=customer_headers)
            self.assertEqual(preview.status_code, 200, preview.text)
            self.assertEqual(preview.json(), adapter.preview(actor, body['reviewId']))
            self.assertEqual(preview.headers['cache-control'], 'private, no-store')
            self.assertEqual(client.get(url, headers={'x-test-actor': 'other'}).status_code, 403)
            self.assertEqual(client.get(url+'?workspaceId=other', headers=customer_headers).status_code, 422)
            self.assertEqual(client.post(url+'/withdraw', json={}, headers=customer_headers).status_code, 403)
            self.assertEqual(client.post(url+'/withdraw', json={'actorId': OWNER}, headers=owner_headers).status_code, 422)
            self.assertEqual(client.post(url+'/withdraw', json={}, headers=owner_headers).status_code, 200)
            self.assertEqual(client.get(url, headers=customer_headers).status_code, 403)
        with pg._connect(self.admin_url) as connection:
            connection.execute('grant execute on function app_private.ecommerce_review_recipient_ready(text) to public')
        with self.assertRaises(TrialNotReadyError): adapter.preview(actor,str(review_id))

@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_REVIEW_SQL') == '1', 'explicit local SQL rehearsal only')
class CatalogEnrollmentSqlTests(unittest.TestCase):
    # Committed enrollment evidence has its own cluster, separate from source-race fixtures.
    setUpClass = classmethod(fixture.WebsiteReviewSqlTests.setUpClass.__func__)
    stop = classmethod(fixture.WebsiteReviewSqlTests.stop.__func__)

    def test_enrollment_review_and_revocation_use_real_local_provisioners(self):
        import psycopg
        from psycopg.rows import dict_row
        from datetime import datetime, timedelta, timezone
        from supermega_runtime.managed_activation import ManagedWorkspaceProvisioner, ManagedActivationConflict, _timestamp_text
        from supermega_runtime.managed_staff_access import ManagedStaffAccessProvisioner, compile_staff_access_plan
        from supermega_runtime.ecommerce_customer_review_store import EcommerceCustomerReviewStore
        from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialPermissionDenied, TrialNotReadyError
        from tests.test_managed_activation import activation_plan, OWNER_ID, OWNER_SESSION_ID
        from tests.test_commerce_runtime import catalog_state, storefront_configuration
        activation = activation_plan('ecommerce')
        workspace, recipient, session = activation['workspaceId'], str(uuid4()), str(uuid4())
        connect = lambda url: psycopg.connect(url, row_factory=dict_row)
        with pg._connect(self.admin_url) as connection:
            connection.execute('create table if not exists auth.users (id uuid primary key, is_anonymous boolean not null)')
            connection.execute('insert into auth.users values (%s,false)', (recipient,))
            connection.execute('insert into auth.sessions(id,user_id) values (%s,%s),(%s,%s)',
                               (OWNER_SESSION_ID, OWNER_ID, session, recipient))
        owner = ManagedWorkspaceProvisioner(self.admin_url, connection_factory=connect)
        owner.authorize(activation, verified_owner_actor_id=OWNER_ID, verified_owner_session_id=OWNER_SESSION_ID,
                        decision_note='Synthetic disposable enrollment only.')
        owner.apply(activation)
        now = datetime.now(timezone.utc)
        plan = compile_staff_access_plan(activation, member_actor_id=recipient, member_label='Synthetic catalog reviewer',
            role_id='ecommerce-reviewer', approval_id=str(uuid4()), approved_at=_timestamp_text(now),
            expires_at=_timestamp_text(now+timedelta(hours=1)), now=now)
        provisioner = ManagedStaffAccessProvisioner(self.admin_url, connection_factory=connect)
        with self.assertRaises(ManagedActivationConflict): provisioner.apply(plan, activation)
        provisioner.authorize(plan, activation, verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID, decision_note='Synthetic review-only enrollment.')
        granted = provisioner.apply(plan, activation)
        self.assertFalse(granted['authUserCreated'])
        self.assertFalse(granted['invitationEmailSent'])
        self.assertTrue(provisioner.apply(plan, activation)['replayed'])
        source = catalog_state(); source['storefrontConfiguration'] = storefront_configuration(source)
        with pg._connect(self.admin_url) as connection:
            self.assertEqual(connection.execute('select capabilities from app_private.workspace_memberships where workspace_id=%s and actor_id=%s',
                (workspace, recipient)).fetchone()[0], ['ecommerce.review'])
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'commerce',1,%s::jsonb,%s)",
                (workspace,json.dumps(source),OWNER_ID))
        store = PostgresTrialStore(self.runtime_url, reducer=lambda *_: None, write_enabled=True)
        adapter = EcommerceCustomerReviewStore(store)
        customer = TrialPrincipal(workspace,recipient,'human',identity_provider='supabase',session_id=session)
        writer = TrialPrincipal(workspace,OWNER_ID,'human',identity_provider='supabase',session_id=OWNER_SESSION_ID)
        self.assertEqual(store.readiness(customer).capabilities, frozenset({'ecommerce.review'}))
        with self.assertRaises(TrialPermissionDenied): store.get_state(customer,'commerce')
        with self.assertRaises(TrialPermissionDenied): adapter.preparation_preview(customer)
        choices=adapter.list_recipients(writer)
        self.assertEqual(choices['recipients'],[{'grantId':plan['grantId'],'label':'Synthetic catalog reviewer'}])
        self.assertNotIn(recipient,json.dumps(choices))
        self.assertEqual(adapter.list_recipients(writer,after=plan['grantId'])['recipients'],[])
        with self.assertRaises(TrialPermissionDenied): adapter.list_recipients(customer)
        with self.assertRaises(TrialPermissionDenied):
            adapter.prepare(writer,review_id=str(uuid4()),recipient_grant_id=str(uuid4()),
                expected_version=1,expires_at=(now+timedelta(hours=1)).isoformat())
        review = adapter.prepare(writer, review_id=str(uuid4()),recipient_grant_id=plan['grantId'],
            expected_version=1,expires_at=(now+timedelta(hours=1)).isoformat())
        self.assertEqual(adapter.preview(customer,review['reviewId'])['previewDigest'],review['previewDigest'])
        args=dict(verified_owner_actor_id=OWNER_ID,verified_owner_session_id=OWNER_SESSION_ID,reason='Synthetic review ended.')
        self.assertEqual(provisioner.revoke(plan,activation,**args)['status'],'revoked')
        self.assertTrue(provisioner.revoke(plan,activation,**args)['replayed'])
        with self.assertRaises(TrialNotReadyError): adapter.preview(customer,review['reviewId'])
        self.assertEqual(store.readiness(customer).capabilities,frozenset())
        self.assertEqual(adapter.list_recipients(writer)['recipients'],[])
        with self.assertRaises(TrialPermissionDenied):
            adapter.prepare(writer,review_id=str(uuid4()),recipient_grant_id=plan['grantId'],
                expected_version=1,expires_at=(now+timedelta(hours=1)).isoformat())
