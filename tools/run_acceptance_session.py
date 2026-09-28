"""One owner-approved acceptance session; environment-only credentials, safe output."""
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.parse import urlsplit, parse_qs, unquote
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['SUPERMEGA_TRIAL_SCHEMA_VERSION'] = '13'
os.environ['SUPERMEGA_BILLING_SCHEMA_VERSION'] = '13'
os.environ['SUPERMEGA_OTEL_DISABLED'] = '1'

import psycopg
from tools.acceptance_auth_fixture import AuthApi, PROJECT, require_authority, temporary_users
from tools.acceptance_workspace_journey import require_runtime_target, exercise_workspaces
from tools.acceptance_workspace_cleanup import cleanup_workspaces, verify_cleanup, TABLES


def run():
    require_authority(PROJECT, os.environ.get('SUPERMEGA_ACCEPTANCE_APPROVED') == '20260929T1103Z')
    admin_url, runtime_url = os.environ['ACCEPTANCE_ADMIN_URL'], os.environ['ACCEPTANCE_RUNTIME_URL']
    require_runtime_target(runtime_url)
    url = urlsplit(admin_url)
    direct = url.hostname == 'db.' + PROJECT + '.supabase.co'
    pooler = bool(url.hostname and url.hostname.endswith('.pooler.supabase.com'))
    if (url.scheme not in ('postgres', 'postgresql') or not (direct or pooler)
            or unquote(url.username or '') != 'postgres' + ('.' + PROJECT if pooler else '')
            or parse_qs(url.query).get('sslmode') not in (['require'], ['verify-full'])):
        raise ValueError('acceptance_admin_target_invalid')
    def connect():
        return psycopg.connect(admin_url, autocommit=True, connect_timeout=15)
    with connect() as connection:
        if connection.execute("select schema_version from app_private.trial_schema_meta where component='private_trial_backend'").fetchone() != (13,):
            raise RuntimeError('acceptance_schema_invalid')
        # The approved branch was empty. Refuse to touch a subsequently-used branch.
        for table in (*('app_private.' + name for name in TABLES), 'auth.users', 'auth.sessions', 'app_private.self_serve_attempt_budgets'):
            if connection.execute('select count(*) from ' + table).fetchone() != (0,):
                raise RuntimeError('acceptance_branch_not_empty')
    api = AuthApi(os.environ['ACCEPTANCE_ADMIN_KEY'], os.environ['ACCEPTANCE_PUBLIC_KEY'])
    run_id = str(uuid4())
    registrations = []
    alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    claims = ['SM-' + ''.join(secrets.choice(alphabet) for _ in range(4)) + '-' +
              ''.join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    with temporary_users(api, project=PROJECT, approved=True, run_id=run_id) as users:
        actors = [user['id'] for user in users]
        try:
            result = exercise_workspaces(api, users, runtime_url, claims, project=PROJECT,
                approved=True, register_cleanup=lambda *pair: registrations.append(pair))
        finally:
            with connect() as connection:
                cleanup_workspaces(connection, registrations, actors, project=PROJECT)
            with connect() as connection:
                verify_cleanup(connection, [pair[0] for pair in registrations], actors)
    with connect() as connection:
        if connection.execute('select count(*) from auth.users').fetchone() != (0,) or connection.execute('select count(*) from auth.sessions').fetchone() != (0,):
            raise RuntimeError('acceptance_auth_records_remaining')
    return dict(result, ok=True, cleanup_verified=True, production_changed=False)


if __name__ == '__main__':
    try:
        print(json.dumps(run()))
    except Exception as error:
        # Driver/Auth exception strings can embed secrets or row values.
        print(json.dumps({'ok': False, 'error_type': type(error).__name__,
                          'cleanup_requires_verification': True, 'production_changed': False}))
        raise SystemExit(1)
