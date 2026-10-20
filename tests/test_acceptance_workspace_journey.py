import base64
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from tools.acceptance_auth_fixture import APPROVAL_ACTION, APPROVAL_CONTRACT
from tools.acceptance_workspace_journey import (
    PROJECT, PRODUCTS, exercise_workspaces, payload_for, verified_session, require_runtime_target,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import (
    ACTIVATION_PRODUCT_ENTITLEMENTS, TrialNotReadyError, self_serve_workspace_id,
)


class JourneyTests(unittest.TestCase):
    def setUp(self):
        clock = patch('tools.acceptance_auth_fixture.datetime').start()
        clock.now.return_value = datetime(2026, 10, 21, 9, tzinfo=timezone.utc)
        clock.fromisoformat.side_effect = datetime.fromisoformat
        self.addCleanup(patch.stopall)
        patch.dict('os.environ', {'SUPERMEGA_SUPABASE_PROJECT_REF': PROJECT}).start()
        self.approval = dict(contract=APPROVAL_CONTRACT, project_ref=PROJECT,
            action=APPROVAL_ACTION, synthetic_only=True, cleanup_required=True,
            approval_id=str(uuid4()), issued_at='2026-10-21T08:30:00Z',
            expires_at='2026-10-21T09:30:00Z')

    def test_runtime_rejects_production_or_admin_identity(self):
        for url in ('postgresql://postgres@db.' + PROJECT + '.supabase.co/postgres?sslmode=require',
                    'postgresql://supermega_trial_login@db.zvtzwcimpvvtkowflhda.supabase.co/postgres?sslmode=require'):
            with self.assertRaisesRegex(ValueError, 'target_invalid'): require_runtime_target(url)

    def test_all_product_payloads_use_real_reducers(self):
        for product in PRODUCTS:
            surface = ACTIVATION_PRODUCT_ENTITLEMENTS[product]
            payload = payload_for(surface)
            self.assertEqual(reduce_trial_state(surface, surface + '.workspace.initialized', {}, payload), payload['state'])

    def test_acceptance_product_scope_is_shop_only(self):
        self.assertEqual(PRODUCTS, ('shop',))
        self.assertEqual(ACTIVATION_PRODUCT_ENTITLEMENTS['shop'], 'commerce')

    def test_token_claims_cannot_override_verified_identity(self):
        user_id = str(uuid4())
        claims = base64.urlsafe_b64encode(json.dumps({'sub': str(uuid4()), 'session_id': str(uuid4())}).encode()).decode()
        api = SimpleNamespace(request=lambda *a, **k: {'id': user_id})
        with self.assertRaisesRegex(ValueError, 'identity_mismatch'):
            verified_session(api, {'id': user_id, 'access_token': 'header.' + claims + '.signature'})

    def test_database_failure_is_not_counted_as_denial(self):
        self.run_journey('database_ready', should_fail=True)

    def test_cross_tenant_denial_and_reconnect_checks(self):
        self.run_journey('membership_ready', should_fail=False)

    def run_journey(self, denial, should_fail):
        registered, states, owners = [], {}, {}
        users = [{'id': str(uuid4())}, {'id': str(uuid4())}]
        class Store:
            def __init__(self, *args, **kwargs): pass
            def create_self_serve_workspace(self, **kwargs):
                workspace = self_serve_workspace_id(kwargs['claim_code'])
                owner = kwargs['actor_id']
                self_test.assertIn((workspace, owner), registered)
                owners[workspace] = owner
                return SimpleNamespace(workspace_id=workspace)
            def apply_command(self, principal, **command):
                if principal.actor_id != owners.get(principal.workspace_id):
                    raise TrialNotReadyError((denial,))
                replay = principal.workspace_id in states
                states[principal.workspace_id] = command['payload']['state']
                return SimpleNamespace(version=1, idempotent_replay=replay)
            def get_state(self, principal, surface):
                if principal.actor_id != owners.get(principal.workspace_id):
                    raise TrialNotReadyError((denial,))
                return SimpleNamespace(version=1, state=states[principal.workspace_id])
        self_test = self
        with patch('tools.acceptance_workspace_journey.verified_session', return_value=str(uuid4())):
            def run():
                return exercise_workspaces(None, users, 'postgresql://supermega_trial_login@db.' + PROJECT + '.supabase.co/postgres?sslmode=require', ['SM-1234-5678', 'SM-1234-5679'],
                    project=PROJECT, approved=self.approval, register_cleanup=lambda *pair: registered.append(pair), store_factory=Store)
            if should_fail:
                with self.assertRaisesRegex(RuntimeError, 'denial_not_proven'): run()
            else:
                result = run()
                self.assertEqual(len(result['products']), 2)
                for tenant in result['products']:
                    self.assertEqual(tenant['product'], 'shop')
                    self.assertEqual(tenant['surface'], 'commerce')
                    self.assertTrue(tenant['cross_tenant_read_denied'])
                    self.assertTrue(tenant['cross_tenant_write_denied'])
                self.assertFalse(result['browser_acceptance'])


if __name__ == '__main__': unittest.main()
