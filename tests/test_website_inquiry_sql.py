"""Real disposable PostgreSQL only; never uses a supplied or hosted database URL.

Run: SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL=1 SUPERMEGA_TRIAL_SCHEMA_VERSION=13
     python -m unittest tests.test_website_inquiry_sql -v
"""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
import os
from pathlib import Path
import unittest
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialNotReadyError, TrialPermissionDenied, TrialValidationError
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from tests.test_website_runtime import _state

WORKSPACE = 'rehearsal-product'
OWNER = TrialPrincipal(WORKSPACE, 'owner-product', 'human')
ORIGIN = 'https://synthetic.example'
BODY = {'name': 'မောင်မောင်', 'contact': 'synthetic@example.test', 'message': 'စျေးနှုန်း သိချင်ပါတယ်။', 'consent': True}


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL') == '1', 'explicit disposable SQL rehearsal only')
class WebsiteInquirySqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.db_error = psycopg.Error
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data = cls.workspace / 'primary-data'
        cls.started = False
        cls.addClassCleanup(cls.stop)
        port, password, runtime_password = pg._free_loopback_port(), pg._password(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(), data_directory=cls.data,
                               admin_password=password, port=port, environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data, log_file=cls.workspace / 'postgres.log',
                          port=port, environment=cls.environment)
        root = pg._connection_url('postgres', password, port, 'postgres')
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        pg._apply_migrations(postgres_bin=cls.bin, admin_password=password, admin_database_url=cls.admin_url,
                             port=port, environment=cls.environment, migrations=pg.CURRENT_MIGRATIONS)
        pg._provision_runtime(cls.admin_url, runtime_password)
        pg._seed_rehearsal_data(cls.admin_url)
        proposal = Path(__file__).resolve().parents[1] / 'supabase/proposals/website_inquiry_delivery.sql'
        with pg._connect(cls.admin_url, autocommit=True) as connection:
            connection.execute(proposal.read_text(encoding='utf-8'))
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'website',1,%s::jsonb,%s)",
                               (WORKSPACE, json.dumps(_state()), OWNER.actor_id))

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data, environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('website_inquiry_sql_cleanup_incomplete')

    def setUp(self):
        with pg._connect(self.admin_url) as connection:
            connection.execute('delete from app_private.website_inbox')
            connection.execute('delete from app_private.website_inquiry_channels')
        self.adapter = WebsiteInquiryStore(PostgresTrialStore(self.runtime_url, reducer=lambda *args: {}, write_enabled=True))

    def channel(self, *, enabled=True):
        channel = str(uuid4())
        result = self.adapter.prepare_channel(OWNER, channel_id=channel, page_id='page-home', expected_version=1, origin=ORIGIN)
        self.assertEqual(result, {'channelId': channel, 'enabled': False})
        if enabled:
            # Explicitly synthetic fixture ONLY. No production activation API exists.
            with pg._connect(self.admin_url) as connection:
                connection.execute('update app_private.website_inquiry_channels set enabled=true where channel_id=%s', (channel,))
        return channel

    def receive(self, channel, request=None, key='client', **overrides):
        arguments = dict(channel_id=channel, request_id=request or str(uuid4()), origin=ORIGIN,
                         payload=BODY, client_key=sha256(key.encode()).hexdigest())
        arguments.update(overrides)
        return self.adapter.receive(**arguments)

    def test_prepare_is_disabled_idempotent_and_does_not_activate_or_publish(self):
        channel = self.channel(enabled=False)
        self.assertEqual(self.adapter.prepare_channel(OWNER, channel_id=channel, page_id='page-home', expected_version=1, origin=ORIGIN),
                         {'channelId': channel, 'enabled': False})
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
            self.receive(channel)
        with self.assertRaisesRegex(TrialValidationError, 'source_stale'):
            self.adapter.prepare_channel(OWNER, channel_id=str(uuid4()), page_id='page-home', expected_version=2, origin=ORIGIN)
        with self.assertRaisesRegex(TrialValidationError, 'channel_conflict'):
            self.adapter.prepare_channel(OWNER, channel_id=channel, page_id='page-home', expected_version=1, origin='https://other.example')

    def test_committed_delivery_replay_and_private_burmese_inbox(self):
        channel, request = self.channel(), str(uuid4())
        receipt = self.receive(channel, request)
        self.assertEqual(receipt, {'status': 'received', 'requestId': request, 'duplicate': False})
        self.assertTrue(self.receive(channel, request)['duplicate'])
        inbox = self.adapter.inbox(OWNER)
        self.assertEqual(len(inbox['inquiries']), 1)
        self.assertEqual(inbox['inquiries'][0]['message'], BODY['message'])
        self.assertEqual(inbox['inquiries'][0]['sourcePage'], '/')
        self.assertNotIn('client_key', json.dumps(inbox))
        for value in (BODY['name'], BODY['contact'], BODY['message'], WORKSPACE):
            self.assertNotIn(value, json.dumps(receipt, ensure_ascii=False))

    def test_retry_cannot_rewrite_customer_evidence(self):
        channel, request = self.channel(), str(uuid4())
        self.receive(channel, request)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_retry_conflict'):
            self.receive(channel, request, payload={**BODY, 'message': 'changed'})
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'][0]['message'], BODY['message'])

    def test_disabled_wrong_origin_unknown_and_suspended_workspace_reject_before_replay(self):
        channel, request = self.channel(), str(uuid4())
        self.receive(channel, request)
        for arguments in ({'origin': 'https://wrong.example'}, {'channel_id': str(uuid4())}):
            with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
                self.receive(channel, request, **arguments)
        with pg._connect(self.admin_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=false where channel_id=%s', (channel,))
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
            self.receive(channel, request)
        # Suspension is terminal in the real schema. Exercise it in a transaction
        # that rolls back on denial, rather than weakening the guard to reset it.
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'), pg._connect(self.admin_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=true where channel_id=%s', (channel,))
            connection.execute("update app_private.workspace_access_controls set status='suspended' where workspace_id=%s", (WORKSPACE,))
            connection.execute('select app_private.receive_website_inquiry(%s,%s,%s,%s,%s,%s,true,%s)',
                               (channel, request, ORIGIN, BODY['name'], BODY['contact'], BODY['message'], 'a' * 64))

    def test_concurrent_duplicate_submissions_commit_once(self):
        channel, request = self.channel(), str(uuid4())
        with ThreadPoolExecutor(max_workers=4) as pool:
            receipts = list(pool.map(lambda _: self.receive(channel, request), range(4)))
        self.assertEqual(sum(not receipt['duplicate'] for receipt in receipts), 1)
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 1)

    def test_durable_client_budget_shared_between_channels_and_replay_does_not_spend(self):
        first, second = self.channel(), self.channel()
        request = str(uuid4())
        self.receive(first, request)
        for index in range(5):
            self.receive(first if index % 2 else second)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_capacity'):
            self.receive(second)
        self.assertTrue(self.receive(first, request)['duplicate'])
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 6)

    def test_concurrent_channels_cannot_race_the_shared_budget(self):
        channels = [self.channel(), self.channel()]
        def submit(index):
            try:
                self.receive(channels[index % 2])
                return 'received'
            except self.db_error as error:
                self.assertIn('website_inquiry_capacity', str(error))
                return 'limited'
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(submit, range(8)))
        self.assertEqual(results.count('received'), 6)
        self.assertEqual(results.count('limited'), 2)

    def test_inbox_pagination_stays_stable_with_new_arrival(self):
        channel = self.channel()
        for index in range(52):
            self.receive(channel, key=f'client-{index}')
        first = self.adapter.inbox(OWNER)
        self.assertEqual(len(first['inquiries']), 50)
        self.receive(channel, key='late-arrival')
        second = self.adapter.inbox(OWNER, before=tuple(first['nextBefore']))
        self.assertEqual(len(second['inquiries']), 2)
        self.assertIsNone(second['nextBefore'])
        self.assertEqual(len({row['requestId'] for row in first['inquiries'] + second['inquiries']}), 52)

    def test_browser_roles_and_cross_workspace_cannot_read_or_write(self):
        channel = self.channel()
        self.receive(channel)
        with pg._connect(self.admin_url) as connection:
            for role in ('anon', 'authenticated', 'service_role'):
                row = connection.execute("""select has_table_privilege(%s,'app_private.website_inbox','select'),
                    has_function_privilege(%s,'app_private.receive_website_inquiry(uuid,uuid,text,text,text,text,boolean,text)','execute')""", (role, role)).fetchone()
                self.assertEqual(row, (False, False))
        with self.assertRaises((TrialPermissionDenied, TrialNotReadyError)):
            self.adapter.inbox(TrialPrincipal('rehearsal-b', 'owner-b', 'human'))
        with pg._connect(self.runtime_url) as connection:
            connection.execute("select set_config('app.workspace_id','rehearsal-b',true), set_config('app.actor_id','owner-b',true), set_config('app.actor_kind','human',true)")
            self.assertEqual(connection.execute('select count(*) from app_private.website_inbox').fetchone()[0], 0)
        with self.assertRaises(self.db_error), pg._connect(self.runtime_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=true')

    def test_invalid_payload_write_gate_and_no_consent_leave_no_record(self):
        channel = self.channel()
        for body in ({**BODY, 'consent': False}, {**BODY, 'workspaceId': 'other'}, {**BODY, 'name': 'x' * 81}):
            with self.assertRaises(TrialValidationError):
                self.receive(channel, payload=body)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_invalid'):
            self.receive(channel, client_key='browser-value')
        self.adapter.store.write_enabled = False
        with self.assertRaises(TrialNotReadyError):
            self.receive(channel)
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'], [])

    def client(self, *, enabled=True, address='192.0.2.1', principal=OWNER):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.website_inquiry_api import create_website_inquiry_router
        app = FastAPI()
        app.include_router(create_website_inquiry_router(store=self.adapter, enabled=enabled,
            resolve_client_address=lambda request: address, resolve_principal=lambda request: principal,
            abuse_key=bytes(range(32))))
        return TestClient(app)

    def test_http_to_database_to_operator_inbox(self):
        channel = self.channel()
        client = self.client()
        body = {**BODY, 'requestId': str(uuid4())}
        response = client.post(f'/api/public/sites/{channel}/inquiries', json=body, headers={'Origin': ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'received', 'requestId': body['requestId'], 'duplicate': False})
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        inbox = client.get('/api/trial/v1/website-inbox')
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(inbox.json()['inquiries'][0]['message'], BODY['message'])
        anonymous = self.client(principal=None)
        self.assertEqual(anonymous.get('/api/trial/v1/website-inbox').status_code, 401)
        self.assertEqual(client.get('/api/trial/v1/website-inbox?workspace=other').status_code, 422)

    def test_http_bounds_disabled_mode_and_spoofed_rate_key(self):
        channel = self.channel()
        route = f'/api/public/sites/{channel}/inquiries'
        body = {**BODY, 'requestId': str(uuid4())}
        client = self.client()
        self.assertEqual(self.client(enabled=False).post(route, json=body, headers={'Origin': ORIGIN}).status_code, 503)
        self.assertEqual(self.client(address='untrusted').post(route, json=body, headers={'Origin': ORIGIN}).status_code, 503)
        self.assertEqual(client.post(route, json=body).status_code, 422)
        self.assertEqual(client.post(route, content='x' * 4097, headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}).status_code, 413)
        self.assertEqual(client.post(route, content='{"name":"a","name":"b"}', headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}).status_code, 422)
        self.assertEqual(client.post(route, json={**body, 'client_key': 'attacker'}, headers={'Origin': ORIGIN}).status_code, 422)
        for index in range(6):
            response = client.post(route, json={**body, 'requestId': str(uuid4())},
                headers={'Origin': ORIGIN, 'X-Forwarded-For': f'192.0.2.{index + 10}'})
            self.assertEqual(response.status_code, 200)
        response = client.post(route, json=body, headers={'Origin': ORIGIN, 'X-Forwarded-For': '198.51.100.1'})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json(), {'detail': 'try_later'})
        self.assertNotIn(BODY['contact'], response.text)
        # IPv4-mapped IPv6 is the same caller and cannot obtain a fresh budget.
        mapped = self.client(address='::ffff:192.0.2.1')
        self.assertEqual(mapped.post(route, json=body, headers={'Origin': ORIGIN}).status_code, 429)

    def test_http_storage_failure_never_acknowledges_or_exposes_error_detail(self):
        from unittest.mock import patch
        channel = self.channel()
        with patch.object(self.adapter, 'receive', side_effect=RuntimeError('PRIVATE_CUSTOMER_TEXT')):
            response = self.client().post(f'/api/public/sites/{channel}/inquiries',
                json={**BODY, 'requestId': str(uuid4())}, headers={'Origin': ORIGIN})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'detail': 'website_inquiries_unavailable'})
        self.assertNotIn('PRIVATE_CUSTOMER_TEXT', response.text)
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'], [])


if __name__ == '__main__':
    unittest.main()
