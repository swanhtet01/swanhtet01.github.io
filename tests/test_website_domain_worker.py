"""Local-only guard checks for the bounded custom-domain maintenance command."""

from contextlib import redirect_stdout
from io import StringIO
import json
import unittest
from unittest.mock import patch

from tools.run_website_domain_renewal import main


PREVIEW_REF = 'abcdefghijklmnopqrst'
DATABASE_URL = f'postgresql://user:password@db.{PREVIEW_REF}.supabase.co:5432/postgres?sslmode=require'


def environment():
    return {
        'SUPERMEGA_WEBSITE_DOMAIN_RENEWAL_TARGET': 'preview',
        'SUPERMEGA_WEBSITE_DOMAIN_PROJECT_REF': PREVIEW_REF,
        'SUPERMEGA_TRIAL_SCHEMA_VERSION': '13',
        'SUPERMEGA_DATABASE_URL': DATABASE_URL,
        'SUPERMEGA_WEBSITE_DOMAIN_RENEWAL_ENABLED': 'true',
        'SUPERMEGA_WEBSITE_DOMAINS_ENABLED': 'true',
        'SUPERMEGA_WEBSITE_PUBLISHING_ENABLED': 'true',
        'SUPERMEGA_WEBSITE_INGRESS': 'vercel',
        'SUPERMEGA_TRIAL_WRITES_ENABLED': 'true',
        'VERCEL_PROJECT_ID': 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
        'VERCEL_ORG_ID': 'team_wI4l7ZgSxcEztQPSlCCYVeJ5',
        'VERCEL_TOKEN': 'synthetic-token',
    }


class FakeAdapter:
    def renew_due(self, *, limit):
        assert limit == 2
        return {'examined': 2, 'renewed': 1, 'notRenewed': 1}


class WebsiteDomainWorkerTests(unittest.TestCase):
    def run_command(self, argv, env):
        output = StringIO()
        with patch('tools.validate_supermega_database_url.validate_supabase_activation_target',
                   return_value='direct'), redirect_stdout(output):
            code = main(argv, environ=env, adapter_factory=lambda *_: FakeAdapter())
        return code, json.loads(output.getvalue())

    def test_requires_explicit_target_and_enablement_before_claiming(self):
        env = environment()
        code, receipt = self.run_command(['--expected-target', 'preview'], env)
        self.assertEqual(code, 0)
        self.assertFalse(receipt['databaseWritesPerformed'])
        env['SUPERMEGA_WEBSITE_DOMAIN_RENEWAL_ENABLED'] = 'false'
        code, receipt = self.run_command(['--expected-target', 'preview', '--apply'], env)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'renewal_apply_disabled')
        self.assertFalse(receipt['databaseWritesPerformed'])

    def test_bounded_run_reports_counts_only_and_fails_attention(self):
        code, receipt = self.run_command(
            ['--expected-target', 'preview', '--apply', '--limit', '2'], environment())
        self.assertEqual(code, 2)
        self.assertEqual((receipt['examined'], receipt['renewed'], receipt['notRenewed']), (2, 1, 1))
        self.assertNotIn('hostname', str(receipt))
        self.assertNotIn('synthetic-token', str(receipt))
        code, receipt = self.run_command(
            ['--expected-target', 'production', '--apply', '--limit', '2'], environment())
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'renewal_target_mismatch')
        self.assertFalse(receipt['databaseWritesPerformed'])


if __name__ == '__main__':
    unittest.main()
