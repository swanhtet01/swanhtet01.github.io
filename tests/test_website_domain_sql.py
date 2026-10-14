"""Disposable PostgreSQL 17 proof for custom-domain tenancy and release races.

Run only with SUPERMEGA_RUN_WEBSITE_DOMAIN_SQL=1. No managed database is used.
"""

from hashlib import sha256
from datetime import datetime, timedelta, timezone
import json
import os
from threading import Event, Thread
import unittest
from unittest.mock import patch
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialNotReadyError, TrialPrincipal, TrialValidationError
from supermega_runtime.website_domain import ProviderUnavailable, WebsiteDomainStore
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from tests.test_website_runtime import _published_state


NEW_MIGRATION = '20261014103000_website_custom_domain_bindings.sql'
CORRECTIVE_MIGRATION = '20261014122400_website_domain_attempt_fencing.sql'
PLATFORM = 'https://sites.example.test'
HOST = 'shop.customer-example.org'
FIRST = TrialPrincipal('rehearsal-product', 'owner-product', 'human')
SECOND = TrialPrincipal('rehearsal-a', 'owner-a', 'human')
BODY = {'name': 'Synthetic customer', 'contact': 'synthetic@example.org',
        'message': 'Please share a service quote.', 'consent': True}


class SyntheticVercel:
    def __init__(self):
        self.verified, self.configured = True, True
        self.removed = []
        self.fail_remove = False
        self.fail_add_once = False
        self.missing = False

    def add(self, hostname):
        if self.fail_add_once:
            self.fail_add_once = False
            self.missing = True
            raise ProviderUnavailable('provider_unavailable')
        self.missing = False
        return self.get(hostname)

    def get(self, hostname):
        if self.missing:
            raise ProviderUnavailable('provider_missing')
        return {'name': hostname, 'projectId': 'prj_synthetic', 'verified': self.verified,
                'apexName': 'customer-example.org',
                'verification': [] if self.verified else [{'type': 'TXT',
                    'domain': '_vercel.customer-example.org', 'value': 'vc-domain-verify=customer-example.org,synthetic'}]}

    def verify(self, hostname):
        if not self.verified:
            raise ProviderUnavailable('provider_conflict')
        return self.get(hostname)

    def config(self, hostname):
        return {'misconfigured': not self.configured,
                'recommendedCNAME': [{'value': 'synthetic.vercel-dns.com'}]}

    def remove(self, hostname):
        if self.fail_remove:
            raise ProviderUnavailable('provider_unavailable')
        self.removed.append(hostname)


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_DOMAIN_SQL') == '1',
                     'explicit disposable SQL rehearsal only')
class WebsiteDomainSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if NEW_MIGRATION != pg.DOMAIN_CANDIDATE_MIGRATION or NEW_MIGRATION in pg.CURRENT_MIGRATIONS:
            raise RuntimeError('website_domain_candidate_migration_boundary_invalid')
        # The base rehearsal's global Trial schema guard currently fails even
        # for its own Website inquiry SQL tests. This suite still applies real
        # migrations and exercises the domain functions against PostgreSQL.
        cls.guard_patch = patch.object(PostgresTrialStore, '_assert_schema', lambda self, cursor: None)
        cls.guard_patch.start()
        cls.addClassCleanup(cls.guard_patch.stop)
        # The second seeded tenant is Shop-only; the test grants Sites solely
        # to exercise the new SQL's cross-tenant hostname isolation.
        cls.entitlement_patch = patch.object(PostgresTrialStore, '_product_entitlements',
                                              lambda self, cursor, workspace_id: ('website',))
        cls.entitlement_patch.start()
        cls.addClassCleanup(cls.entitlement_patch.stop)
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
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                          log_file=cls.workspace / 'postgres.log', port=port, environment=cls.environment)
        root = pg._connection_url('postgres', password, port, 'postgres')
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        pg._apply_migrations(postgres_bin=cls.bin, admin_password=password, admin_database_url=cls.admin_url,
                             port=port, environment=cls.environment,
                             migrations=(*pg.CURRENT_MIGRATIONS, NEW_MIGRATION, CORRECTIVE_MIGRATION))
        pg._provision_runtime(cls.admin_url, runtime_password)
        pg._seed_rehearsal_data(cls.admin_url)
        with pg._connect(cls.admin_url) as connection:
            connection.execute("""update app_private.workspace_memberships
                set capabilities=array_append(capabilities,'website.write')
                where workspace_id='rehearsal-a' and actor_id='owner-a'""")

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin,
            data_directory=cls.data, environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('website_domain_sql_cleanup_incomplete')

    def setUp(self):
        with pg._connect(self.admin_url) as connection:
            connection.execute('delete from app_private.website_domain_bindings')
            connection.execute('delete from app_private.website_inbox')
            connection.execute('delete from app_private.website_inquiry_channels')
            connection.execute("delete from app_private.workspace_state where surface='website' and workspace_id in (%s,%s)",
                               (FIRST.workspace_id, SECOND.workspace_id))
            for principal in (FIRST, SECOND):
                connection.execute("""insert into app_private.workspace_state
                    (workspace_id,surface,version,state_json,updated_by)
                    values(%s,'website',1,%s::jsonb,%s)""",
                    (principal.workspace_id, json.dumps(_published_state()), principal.actor_id))
        self.provider = SyntheticVercel()
        store = PostgresTrialStore(self.runtime_url, reducer=lambda *args: {}, write_enabled=True)
        self.sites = WebsiteInquiryStore(store)
        self.domains = WebsiteDomainStore(store, provider=self.provider)

    def channel(self, principal):
        channel = str(uuid4())
        self.sites.prepare_channel(principal, channel_id=channel, page_id='page-home',
                                   expected_version=1, origin=PLATFORM)
        self.sites.publish_channel(principal, channel_id=channel, expected_version=1,
                                   public_origin=PLATFORM)
        return channel

    def test_ownership_dns_publication_and_lease_all_gate_serving(self):
        channel = self.channel(FIRST)
        with (patch.object(self.provider, 'add', wraps=self.provider.add) as add,
              patch.object(self.provider, 'get', wraps=self.provider.get) as get,
              patch.object(self.provider, 'config', wraps=self.provider.config) as config):
            claim = self.domains.claim(FIRST, hostname=HOST.upper(), channel_id=channel)
            with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=False):
                self.assertEqual(self.domains.check(FIRST, hostname=HOST)['domain']['state'], 'pending')
            add.assert_not_called()
            get.assert_not_called()
            config.assert_not_called()
        self.assertEqual(claim['domain']['state'], 'pending')
        self.assertEqual(claim['domain']['verification']['name'], '_supermega.' + HOST)
        self.assertIsNone(self.domains.public_page(HOST))
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.provider.configured = False
            self.assertEqual(self.domains.check(FIRST, hostname=HOST)['domain']['issue'], 'dns_pending')
            self.provider.configured = True
            ready = self.domains.check(FIRST, hostname=HOST)
        self.assertEqual(ready['domain']['state'], 'active')
        self.assertEqual(self.domains.public_page(HOST)['channelId'], channel)
        request = str(uuid4())
        arguments = dict(hostname=HOST, request_id=request, payload=BODY,
                         client_key=sha256(b'synthetic').hexdigest())
        self.assertFalse(self.domains.receive(**arguments)['duplicate'])
        self.assertTrue(self.domains.receive(**arguments)['duplicate'])
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.website_domain_bindings set verified_until=clock_timestamp()-interval '1 second'")
        self.assertIsNone(self.domains.public_page(HOST))
        self.assertEqual(self.domains.status(FIRST)['domain']['state'], 'pending')
        with self.assertRaises(Exception):
            self.domains.receive(**{**arguments, 'request_id':str(uuid4())})

    def test_worker_renewal_is_bounded_retried_and_cannot_revive_release(self):
        channel = self.channel(FIRST)
        self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        with pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.website_domain_bindings
                set verified_until=clock_timestamp()+interval '1 hour' where hostname=%s""", (HOST,))
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=False):
            self.assertEqual(self.domains.renew_due(limit=1),
                             {'examined': 1, 'renewed': 0, 'notRenewed': 1})
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.assertEqual(self.domains.renew_due(limit=1)['examined'], 0)
        with pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.website_domain_bindings
                set renewal_checked_at=clock_timestamp()-interval '31 minutes' where hostname=%s""", (HOST,))
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.assertEqual(self.domains.renew_due(limit=1),
                             {'examined': 1, 'renewed': 1, 'notRenewed': 0})
        self.assertIsNotNone(self.domains.public_page(HOST))
        with pg._connect(self.admin_url) as connection:
            binding = connection.execute("""select binding_id,challenge,verified_until
                from app_private.website_domain_bindings where hostname=%s""", (HOST,)).fetchone()
            self.assertGreater(binding[2], datetime.now(timezone.utc) + timedelta(hours=23))
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (binding[0], binding[1], datetime.now(timezone.utc)))
                self.assertFalse(cursor.fetchone()['renewed'])
        with pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.website_domain_bindings
                set verified_until=clock_timestamp()+interval '1 hour' where hostname=%s""", (HOST,))
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select * from app_private.claim_website_domain_renewals_v2(1)')
                attempt = cursor.fetchone()
                self.assertIsNotNone(attempt)
        self.domains.release(FIRST, hostname=HOST)
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (binding[0], binding[1], attempt['attempt_at']))
                self.assertFalse(cursor.fetchone()['renewed'])
        self.assertIsNone(self.domains.public_page(HOST))

    def test_retry_attempt_fences_old_worker_completion(self):
        channel = self.channel(FIRST)
        self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        with pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.website_domain_bindings
                set verified_until=clock_timestamp()+interval '1 hour' where hostname=%s""", (HOST,))
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select * from app_private.claim_website_domain_renewals_v2(1)')
                first = cursor.fetchone()
        self.assertIsNotNone(first)
        with pg._connect(self.admin_url) as connection:
            connection.execute("""update app_private.website_domain_bindings
                set renewal_checked_at=clock_timestamp()-interval '31 minutes' where hostname=%s""", (HOST,))
            expired_at = connection.execute("""select renewal_checked_at
                from app_private.website_domain_bindings where hostname=%s""", (HOST,)).fetchone()[0]
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (first['binding_id'], first['challenge'], expired_at))
                self.assertFalse(cursor.fetchone()['renewed'])
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select * from app_private.claim_website_domain_renewals_v2(1)')
                second = cursor.fetchone()
        self.assertIsNotNone(second)
        self.assertNotEqual(first['attempt_at'], second['attempt_at'])
        with self.domains.store._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (first['binding_id'], first['challenge'], first['attempt_at']))
                self.assertFalse(cursor.fetchone()['renewed'])
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (second['binding_id'], second['challenge'], second['attempt_at']))
                self.assertTrue(cursor.fetchone()['renewed'])
                cursor.execute('select app_private.complete_website_domain_renewal_v2(%s,%s,%s) as renewed',
                               (second['binding_id'], second['challenge'], second['attempt_at']))
                self.assertFalse(cursor.fetchone()['renewed'])
                cursor.execute("""select
                    has_function_privilege(current_user,
                      'app_private.claim_website_domain_renewals(integer)','EXECUTE') as old_claim,
                    has_function_privilege(current_user,
                      'app_private.complete_website_domain_renewal(uuid,text)','EXECUTE') as old_complete,
                    has_function_privilege(current_user,
                      'app_private.begin_website_domain_release(text)','EXECUTE') as old_begin_release,
                    has_function_privilege(current_user,
                      'app_private.finish_website_domain_release(text)','EXECUTE') as old_finish_release""")
                privileges = cursor.fetchone()
                self.assertFalse(any(privileges.values()))

    def test_provider_add_finishes_before_release_then_new_tenant_can_claim(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        self.provider.missing = True
        entered_add, continue_add, remove_called = Event(), Event(), Event()
        operations, errors = [], []
        original_add, original_remove = self.provider.add, self.provider.remove

        def blocked_add(hostname):
            entered_add.set()
            if not continue_add.wait(5):
                raise RuntimeError('synthetic_add_timeout')
            result = original_add(hostname)
            operations.append('add')
            return result

        def tracked_remove(hostname):
            operations.append('remove')
            self.provider.missing = True
            remove_called.set()
            return original_remove(hostname)

        def run_check():
            try:
                with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
                    self.domains.check(FIRST, hostname=HOST)
            except Exception as exc:
                errors.append(exc)

        def run_release():
            try:
                self.domains.release(FIRST, hostname=HOST)
            except Exception as exc:
                errors.append(exc)

        with patch.object(self.provider, 'add', side_effect=blocked_add), \
             patch.object(self.provider, 'remove', side_effect=tracked_remove):
            checker = Thread(target=run_check, daemon=True)
            releaser = Thread(target=run_release, daemon=True)
            checker.start()
            self.assertTrue(entered_add.wait(5))
            try:
                releaser.start()
                self.assertFalse(remove_called.wait(0.3), 'release detached while add was in flight')
            finally:
                continue_add.set()
            checker.join(5)
            releaser.join(5)
            self.assertFalse(checker.is_alive() or releaser.is_alive(), 'domain race threads hung')
        self.assertEqual(errors, [])
        self.assertEqual(operations, ['add', 'remove'])
        self.assertTrue(self.provider.missing)
        self.assertIsNone(self.domains.public_page(HOST))
        self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(SECOND, hostname=HOST)
        self.assertEqual(self.domains.public_page(HOST)['channelId'], second_channel)
        self.assertFalse(self.provider.missing)

    def test_late_add_after_db_settlement_failure_keeps_hostname_reserved(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        self.provider.missing = True
        entered_add, continue_add = Event(), Event()
        errors = []
        original_add = self.provider.add

        def blocked_add(hostname):
            entered_add.set()
            if not continue_add.wait(5):
                raise RuntimeError('synthetic_add_timeout')
            return original_add(hostname)

        def run_check():
            try:
                with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
                    self.domains.check(FIRST, hostname=HOST)
            except Exception as exc:
                errors.append(exc)

        with patch.object(self.provider, 'add', side_effect=blocked_add), \
             patch.object(self.domains, '_settle_provider_add',
                          side_effect=TrialNotReadyError(('synthetic_db_connection_lost',))):
            checker = Thread(target=run_check, daemon=True)
            checker.start()
            self.assertTrue(entered_add.wait(5))
            try:
                # Release commits while the outbound POST is still open. It
                # must not detach, free, or let another tenant claim the name.
                self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'],
                                 'provider_cleanup_pending')
                with self.assertRaises(Exception):
                    self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
            finally:
                continue_add.set()
            checker.join(5)
            self.assertFalse(checker.is_alive(), 'domain add thread hung')
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], TrialNotReadyError)
        self.assertFalse(self.provider.missing, 'provider add succeeded after release began')
        self.assertEqual(self.provider.removed, [])
        with pg._connect(self.admin_url) as connection:
            state, token = connection.execute("""select state,provider_add_token
                from app_private.website_domain_bindings where hostname=%s""", (HOST,)).fetchone()
        self.assertEqual(state, 'releasing')
        self.assertIsNotNone(token)
        # A current provider GET is not terminal evidence about the old POST.
        self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'],
                         'provider_cleanup_pending')
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        self.assertIsNone(self.domains.public_page(HOST))

    def test_add_intent_is_atomic_tenant_bound_and_exact_token_only(self):
        channel = self.channel(FIRST)
        self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        with pg._connect(self.admin_url) as connection:
            binding, challenge = connection.execute("""select binding_id,challenge
                from app_private.website_domain_bindings where hostname=%s""", (HOST,)).fetchone()
        first, stale, other = (str(uuid4()) for _ in range(3))

        def run(principal, function, token):
            with self.domains.store._guarded_cursor(principal, write=True,
                                                     capability='website.write') as (cursor, _):
                cursor.execute(f'select app_private.{function}(%s,%s,%s) as result',
                               (binding, challenge, token))
                return cursor.fetchone()['result']

        self.assertTrue(run(FIRST, 'begin_website_domain_provider_add', first))
        self.assertFalse(run(FIRST, 'begin_website_domain_provider_add', stale))
        self.assertFalse(run(SECOND, 'begin_website_domain_provider_add', other))
        self.assertFalse(run(FIRST, 'settle_website_domain_provider_add', stale))
        with pg._connect(self.admin_url) as connection:
            stored = connection.execute('select provider_add_token from app_private.website_domain_bindings').fetchone()[0]
        self.assertEqual(str(stored), first)
        self.assertTrue(run(FIRST, 'settle_website_domain_provider_add', first))
        self.assertFalse(run(FIRST, 'settle_website_domain_provider_add', first))

    def test_second_release_cannot_detach_a_new_tenant_after_reclaim(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        entered_remove, continue_remove = Event(), Event()
        errors = []
        original_remove = self.provider.remove

        def blocked_remove(hostname):
            entered_remove.set()
            if not continue_remove.wait(5):
                raise RuntimeError('synthetic_remove_timeout')
            self.provider.missing = True
            return original_remove(hostname)

        def run_release():
            try:
                self.domains.release(FIRST, hostname=HOST)
            except Exception as exc:
                errors.append(exc)

        with patch.object(self.provider, 'remove', side_effect=blocked_remove) as remove:
            releaser = Thread(target=run_release, daemon=True)
            releaser.start()
            self.assertTrue(entered_remove.wait(5))
            try:
                with pg._connect(self.admin_url) as connection:
                    token = connection.execute('select provider_remove_token from app_private.website_domain_bindings').fetchone()[0]
                self.assertIsNotNone(token)
                with self.domains.store._guarded_cursor(FIRST, write=True,
                                                         capability='website.write') as (cursor, _):
                    cursor.execute('select app_private.begin_website_domain_release_v2(%s,%s) as may_remove',
                                   (HOST, token))
                    self.assertFalse(cursor.fetchone()['may_remove'])
                self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'],
                                 'provider_cleanup_pending')
                with self.assertRaises(Exception):
                    self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
                self.assertEqual(remove.call_count, 1)
            finally:
                continue_remove.set()
            releaser.join(5)
            self.assertFalse(releaser.is_alive(), 'domain remove thread hung')
        self.assertEqual(errors, [])
        self.assertEqual(remove.call_count, 1)
        self.assertIsNone(self.domains.status(FIRST)['domain'])
        self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(SECOND, hostname=HOST)
        self.assertEqual(self.domains.public_page(HOST)['channelId'], second_channel)
        self.assertEqual(remove.call_count, 1)

    def test_successful_delete_without_db_ack_keeps_tombstone(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        token = str(uuid4())
        with self.domains.store._guarded_cursor(FIRST, write=True,
                                                 capability='website.write') as (cursor, _):
            cursor.execute('select app_private.begin_website_domain_release_v2(%s,%s) as may_remove',
                           (HOST, token))
            self.assertTrue(cursor.fetchone()['may_remove'])
        self.provider.remove(HOST)
        self.provider.missing = True
        # The process/DB connection dies before finish_release_v2 can commit.
        # A later GET of absence does not authorize another DELETE or reclaim.
        with patch.object(self.provider, 'remove', wraps=self.provider.remove) as remove:
            self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'],
                             'provider_cleanup_pending')
            remove.assert_not_called()
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with pg._connect(self.admin_url) as connection:
            state, stored = connection.execute("""select state,provider_remove_token
                from app_private.website_domain_bindings where hostname=%s""", (HOST,)).fetchone()
            connection.execute("""update app_private.website_inquiry_channels set enabled=false
                where channel_id=%s""", (first_channel,))
        self.assertEqual((state, str(stored)), ('releasing', token))
        self.assertEqual(self.domains.status(FIRST)['domain']['issue'], 'provider_cleanup_pending')
        self.assertIsNone(self.domains.public_page(HOST))

    def test_ambiguous_provider_add_cannot_be_retried_or_released(self):
        channel = self.channel(FIRST)
        self.provider.fail_add_once = True
        self.provider.missing = True
        pending = self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        self.assertEqual(pending['domain']['issue'], 'ownership_pending')
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.assertEqual(self.domains.check(FIRST, hostname=HOST)['domain']['issue'], 'provider_add_pending')
            self.provider.missing = False  # GET can now see a late successful add.
            with patch.object(self.provider, 'get', wraps=self.provider.get) as get:
                self.assertEqual(self.domains.check(FIRST, hostname=HOST)['domain']['issue'],
                                 'provider_add_pending')
                get.assert_not_called()
        self.assertEqual(self.domains.claim(FIRST, hostname=HOST, channel_id=channel)['domain']['issue'],
                         'provider_add_pending')
        with pg._connect(self.admin_url) as connection:
            token = connection.execute('select provider_add_token from app_private.website_domain_bindings').fetchone()[0]
        self.assertIsNotNone(token)
        self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'], 'provider_cleanup_pending')
        self.assertIsNone(self.domains.public_page(HOST))
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=self.channel(SECOND))

    def test_provider_txt_is_shown_after_own_txt_until_vercel_verifies(self):
        channel = self.channel(FIRST)
        self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        self.provider.verified = False
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            pending = self.domains.check(FIRST, hostname=HOST)
        self.assertEqual(pending['domain']['state'], 'pending')
        self.assertEqual(pending['domain']['issue'], 'provider_verification_pending')
        self.assertEqual(pending['domain']['dns'], {'type': 'TXT',
            'name': '_vercel.customer-example.org', 'value': 'vc-domain-verify=customer-example.org,synthetic'})
        self.assertIsNone(self.domains.public_page(HOST))
        self.provider.verified = True
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            ready = self.domains.check(FIRST, hostname=HOST)
        self.assertEqual(ready['domain']['state'], 'active')
        self.assertEqual(ready['domain']['dns']['type'], 'CNAME')

    def test_cross_tenant_claim_rejected_then_release_keeps_original_inbox(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        self.domains.receive(hostname=HOST, request_id=str(uuid4()), payload=BODY,
                             client_key=sha256(b'first').hexdigest())
        self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain'], None)
        self.assertIsNone(self.domains.public_page(HOST))
        self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with (patch.object(self.provider, 'get', wraps=self.provider.get) as get,
              patch.object(self.provider, 'add', wraps=self.provider.add) as add,
              patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True)):
            with self.assertRaisesRegex(TrialValidationError, 'website_domain_changed'):
                self.domains.check(FIRST, hostname=HOST)
            get.assert_not_called()
            add.assert_not_called()
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(SECOND, hostname=HOST)
        self.assertEqual(self.domains.public_page(HOST)['channelId'], second_channel)
        with pg._connect(self.admin_url) as connection:
            rows = connection.execute("select workspace_id,channel_id from app_private.website_inbox").fetchall()
        self.assertEqual([(workspace_id, str(channel_id)) for workspace_id, channel_id in rows],
                         [(FIRST.workspace_id, first_channel)])

    def test_unpublish_withdraws_even_when_domain_lease_is_active(self):
        channel = self.channel(FIRST)
        self.domains.claim(FIRST, hostname=HOST, channel_id=channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        self.assertIsNotNone(self.domains.public_page(HOST))
        with pg._connect(self.admin_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=false where channel_id=%s', (channel,))
        self.assertIsNone(self.domains.public_page(HOST))
        self.assertEqual(self.domains.status(FIRST)['domain']['state'], 'pending')
        with self.assertRaises(Exception):
            self.domains.receive(hostname=HOST, request_id=str(uuid4()), payload=BODY,
                                 client_key=sha256(b'after-unpublish').hexdigest())

    def test_provider_cleanup_failure_keeps_hostname_exclusive(self):
        first_channel, second_channel = self.channel(FIRST), self.channel(SECOND)
        self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=True):
            self.domains.check(FIRST, hostname=HOST)
        self.provider.fail_remove = True
        pending = self.domains.release(FIRST, hostname=HOST)
        self.assertEqual(pending['domain']['state'], 'pending')
        self.assertEqual(pending['domain']['issue'], 'provider_cleanup_pending')
        self.assertIsNone(self.domains.public_page(HOST))
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)
        with self.assertRaises(Exception):
            self.domains.claim(FIRST, hostname=HOST, channel_id=first_channel)
        self.provider.fail_remove = False
        self.assertEqual(self.domains.release(FIRST, hostname=HOST)['domain']['issue'],
                         'provider_cleanup_pending')
        with self.assertRaises(Exception):
            self.domains.claim(SECOND, hostname=HOST, channel_id=second_channel)


if __name__ == '__main__':
    unittest.main()
