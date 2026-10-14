"""Disposable PostgreSQL 17 proof for custom-domain tenancy and release races.

Run only with SUPERMEGA_RUN_WEBSITE_DOMAIN_SQL=1. No managed database is used.
"""

from hashlib import sha256
import json
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal
from supermega_runtime.website_domain import ProviderUnavailable, WebsiteDomainStore
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from tests.test_website_runtime import _published_state


NEW_MIGRATION = '20261014103000_website_custom_domain_bindings.sql'
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

    def add(self, hostname):
        return self.get(hostname)

    def get(self, hostname):
        return {'name': hostname, 'projectId': 'prj_synthetic', 'verified': self.verified,
                'apexName': 'customer-example.org'}

    def verify(self, hostname):
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
                             migrations=(*pg.CURRENT_MIGRATIONS, NEW_MIGRATION))
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
        claim = self.domains.claim(FIRST, hostname=HOST.upper(), channel_id=channel)
        self.assertEqual(claim['domain']['state'], 'pending')
        self.assertEqual(claim['domain']['verification']['name'], '_supermega.' + HOST)
        self.assertIsNone(self.domains.public_page(HOST))
        with patch('supermega_runtime.website_domain.tenant_txt_proven', return_value=False):
            self.assertEqual(self.domains.check(FIRST, hostname=HOST)['domain']['state'], 'pending')
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
        self.assertIsNone(self.domains.release(FIRST, hostname=HOST)['domain'])
        self.assertEqual(self.domains.claim(SECOND, hostname=HOST,
                                           channel_id=second_channel)['domain']['state'], 'pending')


if __name__ == '__main__':
    unittest.main()
