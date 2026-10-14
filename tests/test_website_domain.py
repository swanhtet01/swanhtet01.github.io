"""Custom-domain HTTP and provider contract without live DNS or provider calls."""

import os
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.trial_store import TrialPrincipal, TrialValidationError
from supermega_runtime.website_domain import (
    ProviderUnavailable, VercelDomainProvider, normalize_hostname, recommended_dns, tenant_txt_proven,
)
from supermega_runtime.website_inquiry_api import create_website_inquiry_router
from supermega_runtime.website_public_page import render_website_inquiry_page
from supermega_runtime.website_runtime import _website_artifact
from tests.test_website_inquiry_sql import _multipage_state


HOST = 'shop.customer-example.org'
CHANNEL = '00000000-0000-4000-8000-000000000001'
PUBLIC_ORIGIN = 'https://sites.example.test'


class HostnameTests(unittest.TestCase):
    def test_normalize_accepts_canonical_dns_ascii_and_rejects_reserved_or_ambiguous(self):
        self.assertEqual(normalize_hostname('Shop.Customer-Example.ORG.'), HOST)
        for value in ('http://example.org', 'example.org:443', '*.example.org', 'example..org',
                      'localhost', '127.0.0.1', 'customer.supermega.dev', 'a.vercel.app',
                      'example.test', ' example.org ', 'xn--broken-.org', 'single'):
            with self.subTest(value=value), self.assertRaises(TrialValidationError):
                normalize_hostname(value)

    def test_tenant_txt_requires_exact_owner_challenge_name_and_value(self):
        challenge = 'supermega-domain=v1:' + 'x' * 32
        result = {'Status': 0, 'TC': False, 'Answer': [
            {'type': 16, 'name': '_supermega.' + HOST + '.', 'data': '"' + challenge + '"'}]}
        with patch('supermega_runtime.website_domain._read_json', return_value=result) as read:
            self.assertTrue(tenant_txt_proven(HOST, challenge))
            self.assertIn('dns.google/resolve?', read.call_args.args[0])
        for changed in ({**result, 'Status': 2}, {**result, 'TC': True},
                        {**result, 'Answer': [{'type': 16, 'name': 'other.org.', 'data': '"'+challenge+'"'}]},
                        {**result, 'Answer': [{'type': 16, 'name': '_supermega.'+HOST+'.', 'data': '"old"'}]}):
            with patch('supermega_runtime.website_domain._read_json', return_value=changed):
                self.assertFalse(tenant_txt_proven(HOST, challenge))

    def test_vercel_adapter_pins_project_and_reads_separate_ownership_dns_results(self):
        provider = VercelDomainProvider(project_id='prj_test', team_id='team_test', token='synthetic')
        domain = {'name': HOST, 'projectId': 'prj_test', 'verified': True, 'apexName': 'customer-example.org'}
        with patch('supermega_runtime.website_domain._read_json', return_value=domain) as call:
            self.assertEqual(provider.add(HOST), domain)
            self.assertIn('/v10/projects/prj_test/domains?', call.call_args.args[0])
            self.assertEqual(call.call_args.kwargs['body'], {'name': HOST})
        with patch('supermega_runtime.website_domain._read_json', return_value={**domain, 'projectId': 'prj_other'}):
            with self.assertRaises(ProviderUnavailable):
                provider.get(HOST)
        with patch('supermega_runtime.website_domain._read_json', return_value={'misconfigured': False, 'recommendedCNAME': [{'value':'target.vercel-dns.com'}]}):
            config = provider.config(HOST)
            self.assertIs(config['misconfigured'], False)
            self.assertEqual(recommended_dns(HOST, domain, config),
                             {'type': 'CNAME', 'name': HOST, 'value': 'target.vercel-dns.com'})
            self.assertIsNone(recommended_dns(HOST, {**domain, 'apexName': HOST}, config))
            self.assertEqual(recommended_dns(HOST, {**domain, 'apexName': HOST},
                             {'recommendedIPv4':[{'value':'192.0.2.80'}]}),
                             {'type': 'A', 'name': HOST, 'value': '192.0.2.80'})
        with patch('supermega_runtime.website_domain._read_json', return_value={'misconfigured': 'false'}):
            with self.assertRaises(ProviderUnavailable):
                provider.config(HOST)

    def test_environment_defaults_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(VercelDomainProvider.from_environment())

    def test_custom_domain_renders_root_navigation_and_host_bound_assets(self):
        record = {'channelId': CHANNEL, 'pageId': 'page-contact',
                  'artifact': _website_artifact(_multipage_state())}
        home = render_website_inquiry_page(record, custom_domain=True).body.decode()
        contact = render_website_inquiry_page(record, '/contact', custom_domain=True).body.decode()
        self.assertIn('href="/services"', home)
        self.assertIn('href="/contact#inquiry-form"', home)
        self.assertIn('action="/api/public/domain-inquiries"', contact)
        self.assertNotIn('/sites/' + CHANNEL, home + contact)


class DomainRouterTests(unittest.TestCase):
    def client(self):
        app = FastAPI()
        platform = Mock()
        domain = Mock()
        domain.status.return_value = {'enabled': True, 'domain': None}
        domain.claim.return_value = domain.status.return_value
        domain.check.return_value = domain.status.return_value
        domain.release.return_value = domain.status.return_value
        app.include_router(create_website_inquiry_router(
            store=platform, enabled=True, resolve_principal=lambda _: TrialPrincipal('workspace','owner','human'),
            resolve_client_address=lambda _: '192.0.2.9', abuse_key=bytes(range(32)),
            public_origin=PUBLIC_ORIGIN, domain_store=domain))
        return TestClient(app, base_url='https://' + HOST), platform, domain

    def test_custom_host_never_reads_channel_selected_platform_route(self):
        client, platform, domain = self.client()
        self.assertEqual(client.get('/sites/' + CHANNEL).status_code, 404)
        self.assertEqual(client.get('/api/public/sites/' + CHANNEL + '/media/' + 'a'*64 + '.webp').status_code, 404)
        self.assertEqual(client.post('/api/public/sites/' + CHANNEL + '/inquiries',
                                    headers={'Origin': PUBLIC_ORIGIN}, json={}).status_code, 404)
        platform.public_page.assert_not_called()
        platform.public_photo.assert_not_called()
        platform.receive.assert_not_called()
        domain.public_page.return_value = None
        self.assertEqual(client.get('/__site-domain').status_code, 404)
        domain.public_page.assert_called_once_with(HOST)

    def test_domain_inquiry_requires_exact_host_origin_and_no_channel(self):
        client, _, domain = self.client()
        body = {'requestId': CHANNEL, 'name':'Test', 'contact':'test@example.org',
                'message':'Hello', 'consent':True}
        for origin in ('', PUBLIC_ORIGIN, 'https://other.org'):
            with self.subTest(origin=origin):
                self.assertEqual(client.post('/api/public/domain-inquiries', headers={'Origin':origin},
                                             json=body).status_code, 404)
        domain.receive.return_value = {'status':'received','requestId':CHANNEL,'duplicate':False}
        sent = client.post('/api/public/domain-inquiries', headers={'Origin':'https://'+HOST}, json=body)
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(domain.receive.call_args.kwargs['hostname'], HOST)
        self.assertNotIn('channel_id', domain.receive.call_args.kwargs)

    def test_domain_management_contract_is_authenticated_and_same_shape(self):
        client, _, domain = self.client()
        self.assertEqual(client.get('/api/trial/v1/website-domains').json(), {'enabled':True,'domain':None})
        self.assertEqual(client.post('/api/trial/v1/website-domains', json={'hostname':HOST,'channelId':CHANNEL}).json(),
                         domain.claim.return_value)
        self.assertEqual(client.post('/api/trial/v1/website-domains/check', json={'hostname':HOST}).json(),
                         domain.check.return_value)
        self.assertEqual(client.post('/api/trial/v1/website-domains/release', json={'hostname':HOST}).json(),
                         domain.release.return_value)
        self.assertEqual(client.post('/api/trial/v1/website-domains/check', json={'hostname':HOST,'extra':'bad'}).status_code, 422)

    def test_domain_status_exposes_disabled_without_provider_configuration(self):
        app = FastAPI()
        app.include_router(create_website_inquiry_router(
            store=Mock(), enabled=False,
            resolve_principal=lambda _: TrialPrincipal('workspace','owner','human')))
        client = TestClient(app)
        self.assertEqual(client.get('/api/trial/v1/website-domains').json(),
                         {'enabled': False, 'domain': None})
        self.assertEqual(client.post('/api/trial/v1/website-domains',
                                     json={'hostname': HOST, 'channelId': CHANNEL}).status_code, 503)


if __name__ == '__main__':
    unittest.main()
