"""Hosting configuration and canonical route checks; no provider calls."""

import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal
from supermega_runtime.website_publishing_routes import mount_website_publishing_routes, vercel_client_address


class PublishingRouteTests(unittest.TestCase):
    def test_actual_application_mounts_routes_disabled_by_default(self):
        with patch.dict(os.environ, {'OTEL_SDK_DISABLED': 'true'}, clear=True):
            from supermega_runtime.runtime import create_app
            client = TestClient(create_app())
            for path in ('/api/trial/v1/website-publications', '/api/trial/v1/website-inbox',
                         '/sites/00000000-0000-4000-8000-000000000001'):
                response = client.get(path)
                self.assertEqual(response.status_code, 503)
                self.assertIn('no-store', response.headers['cache-control'])
            response = client.post('/api/trial/v1/website-inbox/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001/actions', json={})
            self.assertEqual(response.status_code, 503)
            self.assertIn('no-store', response.headers['cache-control'])

    def app(self, env):
        app = FastAPI()
        with patch.dict(os.environ, env, clear=True):
            mount_website_publishing_routes(app, store=object.__new__(PostgresTrialStore),
                resolve_principal=lambda _: TrialPrincipal('synthetic', 'owner', actor_kind='human'))
        return TestClient(app)

    @staticmethod
    def config():
        return {'SUPERMEGA_WEBSITE_PUBLISHING_ENABLED': 'true', 'SUPERMEGA_WEBSITE_INGRESS': 'vercel',
                'VERCEL': '1', 'VERCEL_ENV': 'preview',
                'SUPERMEGA_WEBSITE_INQUIRY_HMAC_KEY': bytes(range(32)).hex(),
                'SUPERMEGA_WEBSITE_PUBLIC_ORIGIN': 'https://sites.example.test'}

    def test_missing_or_untrusted_configuration_never_calls_storage(self):
        for key in self.config():
            env = self.config(); env.pop(key)
            with self.subTest(key=key), patch('supermega_runtime.website_inquiry_store.WebsiteInquiryStore.publications') as operation:
                response = self.app(env).get('/api/trial/v1/website-publications')
                self.assertEqual(response.status_code, 503)
                self.assertIn('no-store', response.headers['cache-control'])
                operation.assert_not_called()
        for value in ['0'*64, 'not-a-key', 'a'*65]:
            env = self.config(); env['SUPERMEGA_WEBSITE_INQUIRY_HMAC_KEY'] = value
            self.assertEqual(self.app(env).get('/sites/00000000-0000-4000-8000-000000000001').status_code, 503)

    def test_configured_status_uses_authenticated_identity(self):
        with patch('supermega_runtime.website_inquiry_store.WebsiteInquiryStore.publications', return_value={'publications': []}) as read:
            response = self.app(self.config()).get('/api/trial/v1/website-publications')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(read.call_args.args[0].workspace_id, 'synthetic')
            self.assertEqual(read.call_args.kwargs['public_origin'], 'https://sites.example.test')

    def test_prepare_cannot_choose_another_public_origin(self):
        with patch('supermega_runtime.website_inquiry_store.WebsiteInquiryStore.prepare_channel') as prepare:
            response = self.app(self.config()).post('/api/trial/v1/website-inquiry-channels', json={
                'channelId': '00000000-0000-4000-8000-000000000001', 'pageId': 'home',
                'expectedVersion': 1, 'origin': 'https://other.example.test'})
            self.assertEqual(response.status_code, 422)
            prepare.assert_not_called()

    def test_ingress_ignores_spoofable_headers_and_rejects_ambiguous_values(self):
        def request(headers):
            return Request({'type': 'http', 'headers': [(k.encode(), v.encode()) for k,v in headers]})
        for headers in [[], [('x-forwarded-for','192.0.2.1')],
                        [('x-vercel-forwarded-for','192.0.2.1,192.0.2.2')],
                        [('x-vercel-forwarded-for','192.0.2.1')]*2,
                        [('x-vercel-forwarded-for','fe80::1%eth0')]]:
            with self.subTest(headers=headers), self.assertRaises(ValueError):
                vercel_client_address(request(headers))
        self.assertEqual(vercel_client_address(request([
            ('x-forwarded-for','203.0.113.99'), ('x-vercel-forwarded-for','192.0.2.10')])), '192.0.2.10')


if __name__ == '__main__':
    unittest.main()
