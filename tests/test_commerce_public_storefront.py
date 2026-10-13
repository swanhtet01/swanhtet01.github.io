"""Public Commerce intake: strict boundary and optional disposable PostgreSQL proof.

Run the SQL proof only with SUPERMEGA_RUN_COMMERCE_PUBLIC_SQL=1 and
SUPERMEGA_TRIAL_SCHEMA_VERSION=13. It never accepts a hosted database URL.
"""

from copy import deepcopy
from hashlib import sha256
import hmac
import os
import unittest
from unittest.mock import Mock
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.commerce_public_storefront import (
    CommercePublicStorefront, _input, _page_cursor, _parse_page_cursor,
    _shop_request_id, _view,
    create_commerce_public_router,
)
from supermega_runtime.commerce_runtime import (
    _storefront_requests_after_completed_order, commerce_storefront_preview_digest,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import (
    PostgresTrialStore, TrialPrincipal, TrialValidationError,
)
from tests.test_commerce_runtime import catalog_state, storefront_configuration


def _state():
    state = catalog_state()
    state['storefrontConfiguration'] = storefront_configuration(state)
    return state


def _body(request_id=None):
    return {'requestId': request_id or str(uuid4()), 'name': 'မောင်မောင်',
            'phone': '09 123 456 789', 'fulfilment': 'pickup',
            'lines': [{'sku': 'SKU-1', 'quantity': 2}], 'address': None, 'consent': True}


class CommercePublicBoundaryTests(unittest.TestCase):
    def test_page_cursor_is_canonical_and_shop_queue_releases_only_converted_requests(self):
        from datetime import datetime, timezone
        row = {'received_at': datetime.now(timezone.utc), 'handle': str(uuid4()),
               'request_id': str(uuid4())}
        cursor = _page_cursor(row)
        self.assertEqual(_parse_page_cursor(cursor)[1:], (row['handle'], row['request_id']))
        with self.assertRaises(TrialValidationError):
            _parse_page_cursor(cursor + 'x')
        requests = [{'id': f'ECR-{number}'} for number in range(100)]
        with self.assertRaises(TrialValidationError):
            _storefront_requests_after_completed_order({'storefrontRequests': requests, 'orders': []})
        remaining = _storefront_requests_after_completed_order({
            'storefrontRequests': requests, 'orders': [{'sourceRecordId': 'ECR-70'}]})
        self.assertEqual(len(remaining), 99)
        self.assertNotIn('ECR-70', {item['id'] for item in remaining})
        self.assertIn('ECR-71', {item['id'] for item in remaining})

    def test_public_source_rejects_stale_catalog_without_private_state_response(self):
        state = _state()
        configuration = state['storefrontConfiguration']
        source = {'state': state, 'sourceRevision': configuration['revision'],
                  'sourceActionId': configuration['saved']['actionId'],
                  'sourceCatalogDigest': configuration['shopCatalogDigest'],
                  'previewDigest': commerce_storefront_preview_digest(state)}
        _, preview = _view(source)
        self.assertEqual(preview['items'][0]['unitPriceMmk'], 100)
        changed = deepcopy(source)
        changed['state']['items'][0]['price'] = 999
        with self.assertRaises(TrialValidationError):
            _view(changed)

    def test_intake_rejects_duplicate_skus_missing_consent_and_extra_data(self):
        request_id, intent, digest = _input(_body())
        self.assertEqual(len(digest), 64)
        self.assertEqual(intent['lines'], [{'sku': 'SKU-1', 'quantity': 2}])
        self.assertEqual(UUID(request_id).version, 4)
        for change in (
            {'consent': False},
            {'workspaceId': 'another'},
            {'lines': [{'sku': 'SKU-1', 'quantity': 1}, {'sku': 'SKU-1', 'quantity': 1}]},
            {'lines': [{'sku': 'SKU-1', 'quantity': True}]},
        ):
            with self.subTest(change=change), self.assertRaises(TrialValidationError):
                _input({**_body(), **change})

    def test_router_is_disabled_without_explicit_host_configuration(self):
        adapter = Mock()
        app = FastAPI()
        app.include_router(create_commerce_public_router(
            store=adapter, enabled=False, resolve_principal=None,
            resolve_client_address=None, abuse_key=b'', public_origin=''))
        client = TestClient(app)
        response = client.get('/api/public/commerce/' + str(uuid4()))
        self.assertEqual(response.status_code, 503)
        self.assertIn('no-store', response.headers['cache-control'])
        adapter.catalog.assert_not_called()

    def test_public_post_uses_verified_address_and_server_hmac(self):
        adapter = Mock()
        adapter.receive.return_value = {'status': 'received', 'requestId': str(uuid4()), 'duplicate': False}
        app = FastAPI()
        key = bytes(range(32))
        app.include_router(create_commerce_public_router(
            store=adapter, enabled=True,
            resolve_principal=lambda _: TrialPrincipal('synthetic', 'owner', 'human'),
            resolve_client_address=lambda _: '192.0.2.10', abuse_key=key,
            public_origin='https://store.example.test'))
        client = TestClient(app)
        handle = str(uuid4())
        response = client.post(f'/api/public/commerce/{handle}/requests',
            headers={'Origin': 'https://store.example.test', 'X-Forwarded-For': '203.0.113.99'},
            json=_body())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(adapter.receive.call_args.kwargs['client_key'],
            hmac.new(key, b'commerce-public:v1:192.0.2.10', sha256).hexdigest())
        self.assertEqual(client.post(f'/api/public/commerce/{handle}/requests',
            headers={'Origin': 'https://other.example.test'}, json=_body()).status_code, 403)
        self.assertEqual(adapter.receive.call_count, 1)

    def test_close_route_requires_a_reason_and_a_human(self):
        adapter = Mock()
        adapter.close.return_value = {'status': 'closed', 'duplicate': False}
        app = FastAPI()
        app.include_router(create_commerce_public_router(
            store=adapter, enabled=True,
            resolve_principal=lambda _: TrialPrincipal('synthetic', 'owner', 'human'),
            resolve_client_address=lambda _: '192.0.2.10', abuse_key=bytes(range(32)),
            public_origin='https://store.example.test'))
        client = TestClient(app)
        route = f'/api/trial/v1/commerce-public-inbox/{uuid4()}/{uuid4()}/close'
        self.assertEqual(client.post(route, json={}).status_code, 422)
        self.assertEqual(client.post(route, json={'reason': 'spam_or_duplicate'}).status_code, 200)
        self.assertEqual(adapter.close.call_args.kwargs['reason'], 'spam_or_duplicate')

    def test_shop_contact_route_requires_sign_in_and_disables_caching(self):
        adapter = Mock()
        shop_id = _shop_request_id(str(uuid4()), str(uuid4()))
        adapter.shop_contact.return_value = {'shopRequestId': shop_id,
            'contact': {'name': 'Synthetic Buyer', 'phone': '09 12345678', 'address': None}}
        app = FastAPI()
        app.include_router(create_commerce_public_router(
            store=adapter, enabled=True,
            resolve_principal=lambda _: TrialPrincipal('synthetic', 'owner', 'human'),
            resolve_client_address=lambda _: '192.0.2.10', abuse_key=bytes(range(32)),
            public_origin='https://store.example.test'))
        response = TestClient(app).get(
            f'/api/trial/v1/commerce-public-inbox/shop/{shop_id}/contact')
        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response.headers['cache-control'])
        self.assertEqual(adapter.shop_contact.call_args.kwargs['shop_request_id'], shop_id)
        locked = FastAPI()
        locked.include_router(create_commerce_public_router(
            store=adapter, enabled=True, resolve_principal=lambda _: None,
            resolve_client_address=lambda _: '192.0.2.10', abuse_key=bytes(range(32)),
            public_origin='https://store.example.test'))
        self.assertEqual(TestClient(locked).get(
            f'/api/trial/v1/commerce-public-inbox/shop/{shop_id}/contact').status_code, 401)


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_COMMERCE_PUBLIC_SQL') == '1',
                     'explicit disposable PostgreSQL rehearsal only')
class CommercePublicSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json
        from tools import rehearse_supermega_postgres17 as pg
        cls.pg, cls.json = pg, json
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data, cls.started = cls.workspace / 'primary-data', False
        cls.addClassCleanup(cls.stop)
        port, password, runtime_password = pg._free_loopback_port(), pg._password(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(),
            data_directory=cls.data, admin_password=password, port=port,
            environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data,
            log_file=cls.workspace / 'postgres.log', port=port, environment=cls.environment)
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(pg._connection_url('postgres', password, port, 'postgres'), pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        pg._apply_migrations(postgres_bin=cls.bin, admin_password=password, admin_database_url=cls.admin_url,
            port=port, environment=cls.environment, migrations=pg.CURRENT_MIGRATIONS)
        pg._require_success([
            str(pg._binary(cls.bin, 'psql')), '--host', '127.0.0.1', '--port', str(port),
            '--username', 'postgres', '--dbname', pg.DATABASE_NAME, '--no-password',
            '--set', 'ON_ERROR_STOP=1', '--file',
            str(pg.ROOT / 'supabase' / 'rehearsal' / '20261013090000_commerce_public_storefront_intake.sql'),
        ], environment={**cls.environment, 'PGPASSWORD': password},
            failure_code='commerce_public_rehearsal_migration_failed', timeout=120)
        pg._provision_runtime(cls.admin_url, runtime_password)
        pg._seed_rehearsal_data(cls.admin_url)
        cls.workspace_id = 'rehearsal-product'
        cls.owner = TrialPrincipal(cls.workspace_id, 'owner-product', 'human')
        with pg._connect(cls.admin_url) as connection:
            connection.execute("""insert into app_private.workspace_state
                (workspace_id,surface,version,state_json,updated_by)
                values(%s,'commerce',1,%s::jsonb,%s)""",
                (cls.workspace_id, json.dumps(_state()), cls.owner.actor_id))

    @classmethod
    def stop(cls):
        stopped = not cls.started or cls.pg._stop_cluster(
            postgres_bin=cls.bin, data_directory=cls.data, environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('commerce_public_sql_cleanup_incomplete')

    def setUp(self):
        with self.pg._connect(self.admin_url) as connection:
            connection.execute('delete from app_private.commerce_public_requests')
            connection.execute('delete from app_private.commerce_public_storefronts')
            connection.execute("delete from app_private.workspace_state where workspace_id=%s and surface='commerce'",
                               (self.workspace_id,))
            connection.execute("""insert into app_private.workspace_state
                (workspace_id,surface,version,state_json,updated_by)
                values(%s,'commerce',1,%s::jsonb,%s)""",
                (self.workspace_id, self.json.dumps(_state()), self.owner.actor_id))
        self.adapter = CommercePublicStorefront(PostgresTrialStore(
            self.runtime_url, reducer=reduce_trial_state, write_enabled=True))

    def test_buyer_request_arrives_once_in_private_operator_inbox_and_revocation_closes_it(self):
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        self.assertEqual(self.adapter.catalog(handle=handle)['items'][0]['unitPriceMmk'], 100)
        body = _body()
        first = self.adapter.receive(handle=handle, body=body, client_key='a' * 64)
        second = self.adapter.receive(handle=handle, body=body, client_key='a' * 64)
        self.assertEqual(first['status'], 'received')
        self.assertFalse(first['duplicate'])
        self.assertTrue(second['duplicate'])
        inbox = self.adapter.inbox(self.owner)['requests']
        self.assertEqual(len(inbox), 1)
        self.assertEqual(inbox[0]['request']['totalMmk'], 200)
        self.assertEqual(inbox[0]['contact']['phone'], body['phone'])
        self.assertEqual(inbox[0]['contact']['name'], body['name'])
        self.assertNotIn('customerProfile', inbox[0]['request'])
        self.assertEqual(inbox[0]['status'], 'new')
        with self.assertRaises(TrialValidationError):
            self.adapter.shop_contact(self.owner, shop_request_id=inbox[0]['shopRequestId'])
        claim = self.adapter.claim(self.owner, handle=handle, request_id=body['requestId'])
        self.assertEqual(claim['status'], 'in_shop')
        self.assertFalse(claim['priceChanged'])
        self.assertEqual(self.adapter.claim(self.owner, handle=handle, request_id=body['requestId']), claim)
        self.assertEqual(self.adapter.inbox(self.owner)['requests'][0]['status'], 'in_shop')
        self.assertEqual(self.adapter.shop_contact(
            self.owner, shop_request_id=claim['shopRequestId'])['contact']['phone'], body['phone'])
        with self.pg._connect(self.admin_url) as connection:
            private = connection.execute("""select request_json,contact_json
                from app_private.commerce_public_requests where handle=%s and request_id=%s""",
                (handle, body['requestId'])).fetchone()
            journal = connection.execute("""select payload_json,result_json from app_private.workspace_events
                where workspace_id=%s and event_type='commerce.storefront_request.received'""",
                (self.workspace_id,)).fetchone()
            state = connection.execute("""select state_json from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""",
                (self.workspace_id,)).fetchone()[0]
        self.assertEqual(private[1]['phone'], body['phone'])
        for persisted in (private[0], journal[0], journal[1], state):
            contents = self.json.dumps(persisted, ensure_ascii=False)
            self.assertNotIn(body['name'], contents)
            self.assertNotIn(body['phone'], contents)
        conflict = {**body, 'lines': [{'sku': 'SKU-1', 'quantity': 3}]}
        with self.assertRaises(Exception):
            self.adapter.receive(handle=handle, body=conflict, client_key='a' * 64)
        self.adapter.revoke(self.owner, handle=handle, preview_digest=publication['previewDigest'])
        with self.assertRaises(TrialValidationError):
            self.adapter.catalog(handle=handle)
        with self.assertRaises(TrialValidationError):
            self.adapter.receive(handle=handle, body=_body(), client_key='a' * 64)

    def test_public_role_cannot_read_private_customer_table(self):
        with self.pg._connect(self.admin_url) as connection:
            row = connection.execute("""select
                has_table_privilege('anon','app_private.commerce_public_requests','SELECT'),
                has_table_privilege('authenticated','app_private.commerce_public_requests','SELECT'),
                has_function_privilege('anon','app_private.read_commerce_public_source(uuid)','EXECUTE'),
                has_function_privilege('anon','app_private.close_commerce_public_request(text,uuid,uuid,text)','EXECUTE'),
                has_function_privilege('service_role','app_private.inspect_commerce_public_request(text,uuid,uuid)','EXECUTE'),
                has_function_privilege('service_role','app_private.reconcile_commerce_public_closes(uuid,integer)','EXECUTE'),
                has_function_privilege('authenticated','app_private.redact_closed_commerce_public_requests(uuid,integer)','EXECUTE'),
                has_function_privilege('service_role','app_private.commerce_public_redaction_due_count(integer)','EXECUTE'),
                has_table_privilege('service_role','app_private.commerce_public_redaction_runs','SELECT'),
                has_table_privilege('service_role','app_private.commerce_public_reconciliation_runs','SELECT')""").fetchone()
        self.assertEqual(row, (False,) * 10)

    def test_unclaimed_close_and_thirty_day_redaction_leave_an_opaque_tombstone(self):
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        body = _body()
        self.adapter.receive(handle=handle, body=body, client_key='a' * 64)
        with self.assertRaises(Exception):
            self.adapter.close(TrialPrincipal('another-workspace', 'other-owner', 'human'),
                handle=handle, request_id=body['requestId'], reason='other')
        closed = self.adapter.close(self.owner, handle=handle,
                                    request_id=body['requestId'], reason='customer_withdrew')
        self.assertEqual((closed['status'], closed['duplicate']), ('closed', False))
        self.assertTrue(self.adapter.close(self.owner, handle=handle,
            request_id=body['requestId'], reason='customer_withdrew')['duplicate'])
        self.assertEqual(self.adapter.inbox(self.owner)['requests'], [])
        with self.assertRaises(Exception):
            self.adapter.claim(self.owner, handle=handle, request_id=body['requestId'])
        with self.assertRaises(Exception):
            self.adapter.close(self.owner, handle=handle,
                               request_id=body['requestId'], reason='other')
        with self.assertRaises(Exception):
            self.adapter.receive(handle=handle, body=body, client_key='a' * 64)
        self.assertEqual(self.adapter.redaction_due_count(cap=5), 0)
        # The test clock is moved in this disposable database only.
        with self.pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.commerce_public_requests
                set closed_at=clock_timestamp()-interval '31 days'
                where handle=%s and request_id=%s""", (handle, body['requestId']))
        run_id = str(uuid4())
        self.assertEqual(self.adapter.redaction_due_count(cap=5), 1)
        self.assertEqual(self.adapter.redact_due(run_id=run_id, limit=5), 1)
        self.assertEqual(self.adapter.redact_due(run_id=run_id, limit=5), 1)
        self.assertEqual(self.adapter.redaction_due_count(cap=5), 0)
        with self.pg._connect(self.admin_url) as connection:
            row = connection.execute("""select request_json,contact_json,client_key,input_fingerprint,
                close_reason,closed_by,redacted_at from app_private.commerce_public_requests
                where handle=%s and request_id=%s""", (handle, body['requestId'])).fetchone()
            receipts = connection.execute("""select count(*) from app_private.commerce_public_redaction_runs
                where run_id=%s""", (run_id,)).fetchone()[0]
        self.assertEqual(row[0], {})
        self.assertEqual(row[1], {})
        self.assertEqual(row[2], '0' * 64)
        self.assertEqual(row[3], '0' * 64)
        self.assertEqual((row[4], row[5]), ('customer_withdrew', self.owner.actor_id))
        self.assertIsNotNone(row[6])
        self.assertEqual(receipts, 1)

    def test_claimed_close_removes_shop_action_before_starting_retention(self):
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        body = _body()
        self.adapter.receive(handle=handle, body=body, client_key='b' * 64)
        claim = self.adapter.claim(self.owner, handle=handle, request_id=body['requestId'])
        # A direct SQL close must not bypass the Shop queue or its human event.
        with self.assertRaises(Exception):
            with self.adapter.store._guarded_cursor(
                    self.owner, write=True, capability='commerce.write') as (cursor, _):
                cursor.execute('select app_private.close_commerce_public_request(%s,%s,%s,%s)',
                    (self.workspace_id, handle, body['requestId'], 'customer_withdrew'))
        closed = self.adapter.close(self.owner, handle=handle,
                                    request_id=body['requestId'], reason='customer_withdrew')
        self.assertEqual((closed['status'], closed['duplicate']), ('closed', False))
        self.assertTrue(self.adapter.close(self.owner, handle=handle,
            request_id=body['requestId'], reason='customer_withdrew')['duplicate'])
        self.assertEqual(self.adapter.inbox(self.owner)['requests'], [])
        with self.assertRaises(TrialValidationError):
            self.adapter.shop_contact(self.owner, shop_request_id=claim['shopRequestId'])
        with self.pg._connect(self.admin_url) as connection:
            row = connection.execute("""select status,close_reason,closed_by,closed_at,contact_json
                from app_private.commerce_public_requests where handle=%s and request_id=%s""",
                (handle, body['requestId'])).fetchone()
            state = connection.execute("""select state_json from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""", (self.workspace_id,)).fetchone()[0]
            journal = connection.execute("""select payload_json from app_private.workspace_events
                where workspace_id=%s and event_type='commerce.storefront_request.closed'
                  and payload_json #>> '{evidence,evidenceReference}' = %s""",
                (self.workspace_id,
                 f"ECOMMERCE-CLOSE:{claim['shopRequestId']}:customer_withdrew")).fetchone()[0]
        self.assertEqual(row[:3], ('closed', 'customer_withdrew', self.owner.actor_id))
        self.assertIsNotNone(row[3])
        self.assertEqual(row[4]['phone'], body['phone'])
        self.assertNotIn(claim['shopRequestId'], {item['id'] for item in state['storefrontRequests']})
        self.assertEqual(journal['evidence']['evidenceReference'],
            f"ECOMMERCE-CLOSE:{claim['shopRequestId']}:customer_withdrew")
        self.assertNotIn(body['phone'], self.json.dumps(journal, ensure_ascii=False))
        with self.pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.commerce_public_requests
                set closed_at=clock_timestamp()-interval '31 days'
                where handle=%s and request_id=%s""", (handle, body['requestId']))
        self.assertEqual(self.adapter.redact_due(run_id=str(uuid4()), limit=5), 1)
        with self.pg._connect(self.admin_url) as connection:
            self.assertEqual(connection.execute("""select contact_json
                from app_private.commerce_public_requests where handle=%s and request_id=%s""",
                (handle, body['requestId'])).fetchone()[0], {})

    def test_claimed_close_retries_after_shop_event_without_changing_reason(self):
        from datetime import datetime, timezone
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        body = _body()
        self.adapter.receive(handle=handle, body=body, client_key='d' * 64)
        claim = self.adapter.claim(self.owner, handle=handle, request_id=body['requestId'])
        with self.pg._connect(self.admin_url) as connection:
            version = connection.execute("""select version from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""", (self.workspace_id,)).fetchone()[0]
        shop_id = claim['shopRequestId']
        reason = 'no_response'
        self.adapter.store.apply_command(self.owner, command_id=uuid4(),
            surface='commerce', event_type='commerce.storefront_request.closed',
            expected_version=version, payload={
                'intent': {'requestId': shop_id, 'reason': reason},
                'evidence': {'actionId': 'ACT-' + str(uuid4()).upper(),
                    'capturedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                    'actor': self.owner.actor_id, 'reason': reason,
                    'evidenceReference': f'ECOMMERCE-CLOSE:{shop_id}:{reason}'}})
        with self.assertRaises(Exception):
            self.adapter.close(self.owner, handle=handle,
                               request_id=body['requestId'], reason='other')
        result = self.adapter.close(self.owner, handle=handle,
                                    request_id=body['requestId'], reason=reason)
        self.assertEqual((result['status'], result['duplicate']), ('closed', False))
        with self.pg._connect(self.admin_url) as connection:
            closed_at = connection.execute("""select closed_at from app_private.commerce_public_requests
                where handle=%s and request_id=%s""", (handle, body['requestId'])).fetchone()[0]
            event_at = connection.execute("""select created_at from app_private.workspace_events
                where workspace_id=%s and event_type='commerce.storefront_request.closed'
                  and payload_json #>> '{evidence,evidenceReference}' = %s""",
                (self.workspace_id, f'ECOMMERCE-CLOSE:{shop_id}:{reason}')).fetchone()[0]
        self.assertEqual(closed_at, event_at)
        self.assertTrue(self.adapter.close(self.owner, handle=handle,
            request_id=body['requestId'], reason=reason)['duplicate'])

    def test_reconciliation_repairs_only_proven_close_and_replays_its_receipt(self):
        from datetime import datetime, timezone
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        active = _body()
        closed = _body()
        self.adapter.receive(handle=handle, body=active, client_key='e' * 64)
        self.adapter.claim(self.owner, handle=handle, request_id=active['requestId'])
        self.adapter.receive(handle=handle, body=closed, client_key='f' * 64)
        claim = self.adapter.claim(self.owner, handle=handle, request_id=closed['requestId'])
        with self.pg._connect(self.admin_url) as connection:
            version = connection.execute("""select version from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""", (self.workspace_id,)).fetchone()[0]
        shop_id = claim['shopRequestId']
        self.adapter.store.apply_command(self.owner, command_id=uuid4(),
            surface='commerce', event_type='commerce.storefront_request.closed',
            expected_version=version, payload={
                'intent': {'requestId': shop_id, 'reason': 'no_response'},
                'evidence': {'actionId': 'ACT-' + str(uuid4()).upper(),
                    'capturedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                    'actor': self.owner.actor_id, 'reason': 'no_response',
                    'evidenceReference': f'ECOMMERCE-CLOSE:{shop_id}:no_response'}})
        run_id = str(uuid4())
        self.assertEqual(self.adapter.reconcile_closes(run_id=run_id, limit=1), 1)
        self.assertEqual(self.adapter.reconcile_closes(run_id=run_id, limit=1), 1)
        self.assertEqual(self.adapter.reconcile_closes(run_id=str(uuid4()), limit=1), 0)
        with self.pg._connect(self.admin_url) as connection:
            rows = connection.execute("""select request_id,status,close_reason,closed_by,closed_at
                from app_private.commerce_public_requests where handle=%s""", (handle,)).fetchall()
            event_at = connection.execute("""select created_at from app_private.workspace_events
                where workspace_id=%s and event_type='commerce.storefront_request.closed'
                  and payload_json #>> '{evidence,evidenceReference}' = %s""",
                (self.workspace_id, f'ECOMMERCE-CLOSE:{shop_id}:no_response')).fetchone()[0]
            receipts = connection.execute("""select count(*) from app_private.commerce_public_reconciliation_runs
                where run_id=%s""", (run_id,)).fetchone()[0]
        by_id = {str(row[0]): row[1:] for row in rows}
        self.assertEqual(by_id[active['requestId']][0], 'in_shop')
        self.assertEqual(by_id[closed['requestId']],
            ('closed', 'no_response', self.owner.actor_id, event_at))
        self.assertEqual(receipts, 1)

    def test_delivery_contact_stays_private_when_shop_receives_request(self):
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        body = {**_body(), 'name': 'Synthetic Buyer Z', 'phone': '09 777 888 999',
                'fulfilment': 'delivery',
                'address': {'line1': 'Synthetic Private Lane 17', 'township': 'Kamayut',
                            'city': 'Yangon', 'instructions': 'Blue gate'}}
        self.adapter.receive(handle=handle, body=body, client_key='c' * 64)
        self.adapter.claim(self.owner, handle=handle, request_id=body['requestId'])
        with self.pg._connect(self.admin_url) as connection:
            row = connection.execute("""select request_json,contact_json
                from app_private.commerce_public_requests where handle=%s and request_id=%s""",
                (handle, body['requestId'])).fetchone()
            events = connection.execute("""select payload_json,result_json from app_private.workspace_events
                where workspace_id=%s and surface='commerce'""",
                (self.workspace_id,)).fetchall()
            state = connection.execute("""select state_json from app_private.workspace_state
                where workspace_id=%s and surface='commerce'""",
                (self.workspace_id,)).fetchone()[0]
        self.assertEqual(row[1]['address']['line1'], body['address']['line1'])
        self.assertNotIn('customerProfile', row[0])
        self.assertNotIn('deliveryAddress', row[0])
        for persisted in (row[0], state, *(part for event in events for part in event)):
            contents = self.json.dumps(persisted, ensure_ascii=False)
            for private in (body['name'], body['phone'], body['address']['line1']):
                self.assertNotIn(private, contents)

    def test_inbox_keyset_pages_past_fifty_requests(self):
        publication = self.adapter.publish(self.owner, expected_version=1)
        handle = publication['handle']
        with self.pg._connect(self.admin_url) as connection:
            for number in range(51):
                request_id = str(uuid4())
                connection.execute("""insert into app_private.commerce_public_requests
                    (handle,request_id,workspace_id,shop_request_id,request_json,contact_json,input_fingerprint,client_key,received_at)
                    values(%s,%s,%s,%s,'{}'::jsonb,'{}'::jsonb,%s,%s,now() - (%s * interval '1 second'))""",
                    (handle, request_id, self.workspace_id, _shop_request_id(handle, request_id),
                     'a' * 64, 'b' * 64, number))
        first = self.adapter.inbox(self.owner)
        self.assertEqual(len(first['requests']), 50)
        self.assertIsNotNone(first['nextCursor'])
        second = self.adapter.inbox(self.owner, after=first['nextCursor'])
        self.assertEqual(len(second['requests']), 1)
        self.assertIsNone(second['nextCursor'])
        self.assertNotEqual(second['requests'][0]['requestId'], first['requests'][-1]['requestId'])


if __name__ == '__main__':
    unittest.main()
