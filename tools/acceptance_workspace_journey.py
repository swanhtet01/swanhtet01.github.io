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
    PostgresTrialStore, TrialPrincipal, TrialNotReadyError, self_serve_workspace_id,
)
from tests.test_commerce_runtime import catalog_state, action_evidence
from tests.test_website_runtime import _state as website_state, _command as website_command

PRODUCTS = ('commerce', 'website', 'ecommerce')


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
    if len(users) != 2 or len(claims) != 3 or len(set(claims)) != 3:
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
    for product, claim in zip(PRODUCTS, claims):
        require_authority(project, approved)
        workspace = self_serve_workspace_id(claim)
        # Register deterministic ID BEFORE any write, including ambiguous commits.
        register_cleanup(workspace, users[0]['id'])
        created = store().create_self_serve_workspace(actor_id=users[0]['id'],
            claim_code=claim, business_name='Synthetic acceptance ' + product,
            product=product, session_id=sessions[0], identity_provider='supabase')
        if created.workspace_id != workspace:
            raise RuntimeError('acceptance_workspace_identity_mismatch')
        surface = 'website' if product == 'website' else 'commerce'
        payload = payload_for(product)
        command = dict(command_id=str(uuid4()), surface=surface,
            event_type=surface + '.workspace.initialized', expected_version=0, payload=payload)
        written = store().apply_command(principal(workspace), **command)
        reloaded = store().get_state(principal(workspace), surface)
        if reloaded.version != written.version or reloaded.state != payload['state']:
            raise RuntimeError('acceptance_reload_mismatch')
        replay = store().apply_command(principal(workspace), **command)
        if not replay.idempotent_replay or replay.version != written.version:
            raise RuntimeError('acceptance_retry_not_idempotent')
        for operation in ('read', 'write'):
            try:
                if operation == 'read':
                    store().get_state(principal(workspace, 1), surface)
                else:
                    store().apply_command(principal(workspace, 1), **command)
            except TrialNotReadyError as error:
                if error.reasons != ('membership_ready',):
                    raise RuntimeError('acceptance_denial_not_proven') from None
            else:
                raise RuntimeError('acceptance_cross_user_' + operation + '_allowed')
        unchanged = store().get_state(principal(workspace), surface)
        if unchanged.state != reloaded.state or unchanged.version != reloaded.version:
            raise RuntimeError('acceptance_denial_changed_state')
        results.append({'product': product, 'save_reload': True, 'idempotent_retry': True,
                        'cross_user_read_denied': True, 'cross_user_write_denied': True})
    return {'scope': 'hosted_database_runtime', 'browser_acceptance': False, 'products': results}
