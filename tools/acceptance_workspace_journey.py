"""Real-runtime persistence checks for the explicitly approved acceptance session.

Caller owns the Auth fixture and verified cleanup context. This module never
creates identities, bypasses RLS, publishes content, or sends payment requests.
"""
import base64
import json
import os
from urllib.parse import urlsplit, parse_qs, unquote
from uuid import UUID, uuid4

from tools.acceptance_auth_fixture import PROJECT, require_authority
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import (
    ACTIVATION_PRODUCT_ENTITLEMENTS, PostgresTrialStore, TrialPrincipal,
    TrialNotReadyError, self_serve_workspace_id,
)
from tests.test_commerce_runtime import catalog_state, action_evidence
from tests.test_website_runtime import _state as website_state, _command as website_command

# Customer acceptance is intentionally Shop-only. Shop is the customer
# entitlement backed by the shared commerce surface; Website and Ecommerce are
# not provisioned by this launch fixture.
PRODUCTS = ('shop',)


def require_runtime_target(runtime_url):
    url = urlsplit(runtime_url)
    direct = url.hostname == 'db.' + PROJECT + '.supabase.co'
    pooler = bool(url.hostname and url.hostname.endswith('.pooler.supabase.com'))
    expected_user = 'supermega_trial_login' + ('.' + PROJECT if pooler else '')
    if (url.scheme not in ('postgresql', 'postgres') or not (direct or pooler)
            or unquote(url.username or '') != expected_user
            or parse_qs(url.query).get('sslmode') not in (['require'], ['verify-full'])
            or os.environ.get('SUPERMEGA_SUPABASE_PROJECT_REF') != PROJECT):
        raise ValueError('acceptance_runtime_target_invalid')


def verified_session(api, user):
    # JWT decoding is only extraction AFTER the Auth server verifies this token.
    token = user['access_token']
    verified = api.request('GET', '/user', token=token)
    if verified.get('id') != user['id']:
        raise ValueError('acceptance_identity_mismatch')
    encoded = token.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
    if claims.get('sub') != user['id']:
        raise ValueError('acceptance_identity_mismatch')
    return str(UUID(claims['session_id']))


def payload_for(product):
    if product == 'website':
        return website_command(website_state(), action_id='acceptance-init',
                               reason='Acceptance persistence check', reference='website:revision:0')
    return {'state': catalog_state(), 'evidence': action_evidence('ACT-ACCEPTANCE-INIT')}


def exercise_workspaces(api, users, runtime_url, claims, *, project, approved,
                        register_cleanup, store_factory=PostgresTrialStore):
    require_authority(project, approved)
    require_runtime_target(runtime_url)
    if len(users) != 2 or len(claims) != len(users) or len(set(claims)) != len(claims):
        raise ValueError('acceptance_fixture_count_invalid')
    if users[0]['id'] == users[1]['id']:
        raise ValueError('acceptance_distinct_users_required')
    sessions = [verified_session(api, user) for user in users]
    results = []
    def store():
        return store_factory(runtime_url, reducer=reduce_trial_state, write_enabled=True)
    def principal(workspace, index=0):
        return TrialPrincipal(workspace_id=workspace, actor_id=users[index]['id'],
            actor_kind='human', authenticated=True, session_id=sessions[index], identity_provider='supabase')
    workspaces = set()
    for owner_index, claim in enumerate(claims):
        require_authority(project, approved)
        product = PRODUCTS[0]
        self_serve_product = ACTIVATION_PRODUCT_ENTITLEMENTS[product]
        workspace = self_serve_workspace_id(claim)
        if workspace in workspaces:
            raise ValueError('acceptance_distinct_workspaces_required')
        workspaces.add(workspace)
        owner = users[owner_index]
        # Register the deterministic ID and its actual owner BEFORE any write,
        # including an ambiguous commit.
        register_cleanup(workspace, owner['id'])
        created = store().create_self_serve_workspace(actor_id=owner['id'],
            claim_code=claim, business_name='Synthetic acceptance Shop',
            product=self_serve_product, session_id=sessions[owner_index], identity_provider='supabase')
        if created.workspace_id != workspace:
            raise RuntimeError('acceptance_workspace_identity_mismatch')
        surface = self_serve_product
        payload = payload_for(self_serve_product)
        command = dict(command_id=str(uuid4()), surface=surface,
            event_type=surface + '.workspace.initialized', expected_version=0, payload=payload)
        written = store().apply_command(principal(workspace, owner_index), **command)
        reloaded = store().get_state(principal(workspace, owner_index), surface)
        if reloaded.version != written.version or reloaded.state != payload['state']:
            raise RuntimeError('acceptance_reload_mismatch')
        replay = store().apply_command(principal(workspace, owner_index), **command)
        if not replay.idempotent_replay or replay.version != written.version:
            raise RuntimeError('acceptance_retry_not_idempotent')
        other_index = 1 - owner_index
        for operation in ('read', 'write'):
            try:
                if operation == 'read':
                    store().get_state(principal(workspace, other_index), surface)
                else:
                    store().apply_command(principal(workspace, other_index), **command)
            except TrialNotReadyError as error:
                if error.reasons != ('membership_ready',):
                    raise RuntimeError('acceptance_denial_not_proven') from None
            else:
                raise RuntimeError('acceptance_cross_tenant_' + operation + '_allowed')
        unchanged = store().get_state(principal(workspace, owner_index), surface)
        if unchanged.state != reloaded.state or unchanged.version != reloaded.version:
            raise RuntimeError('acceptance_denial_changed_state')
        results.append({'product': product, 'surface': surface, 'save_reload': True,
                        'idempotent_retry': True, 'cross_tenant_read_denied': True,
                        'cross_tenant_write_denied': True})
    return {'scope': 'hosted_database_runtime', 'browser_acceptance': False, 'products': results}
