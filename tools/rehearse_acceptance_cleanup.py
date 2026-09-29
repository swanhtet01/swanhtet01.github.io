"""Local PostgreSQL-only fault injection for the acceptance cleanup transaction."""
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import rehearse_self_serve_v13 as rehearsal
from tools.acceptance_workspace_cleanup import cleanup_workspaces, verify_cleanup, PROJECT


def run():
    pg = rehearsal.pg
    rehearsal.configure_local_schema()
    binary, openssl = pg._default_postgres_bin(), pg._default_openssl()
    if not pg._preflight(binary, openssl).get('ok'):
        raise RuntimeError('local_postgres17_required')
    secret, runtime_secret = pg._password(), pg._password()
    with rehearsal.cluster(binary, openssl, secret, 'cleanup-proof') as (port, environment):
        admin = pg._connection_url('postgres', secret, port, pg.DATABASE_NAME)
        runtime = pg._connection_url(pg.RUNTIME_ROLE, runtime_secret, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(pg._connection_url('postgres', secret, port, 'postgres'), pg.DATABASE_NAME)
        pg._create_auth_session_fixture(admin)
        pg._create_public_browser_fixture(admin)
        pg._apply_public_browser_quarantine(postgres_bin=binary, admin_password=secret,
            port=port, database_name=pg.DATABASE_NAME, environment=environment)
        pg._apply_migrations(postgres_bin=binary, admin_password=secret,
            admin_database_url=admin, port=port, environment=environment)
        pg._provision_runtime(admin, runtime_secret)
        pg._bootstrap_local_storage_catalog_fixture(admin)
        with pg._connect(admin, autocommit=True) as connection:
            for name in rehearsal.EXTRAS:
                connection.execute((ROOT / 'supabase/migrations' / name).read_text(encoding='utf-8'))
        from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal
        from supermega_runtime.runtime import reduce_trial_state
        from tools.acceptance_workspace_journey import payload_for
        os.environ['SUPERMEGA_SUPABASE_PROJECT_REF'] = PROJECT
        os.environ['SUPERMEGA_RELEASE_COMMIT'] = 'a' * 40
        actor, session = str(uuid4()), str(uuid4())
        # LOCAL cluster only. Hosted runner must use real Supabase Auth sessions.
        with pg._connect(admin) as connection:
            connection.execute('insert into auth.sessions(id,user_id) values (%s,%s)', (session, actor))
        store = PostgresTrialStore(runtime, reducer=reduce_trial_state, write_enabled=True)
        registrations = []
        for product, claim in zip(('commerce', 'website', 'ecommerce'), ('SM-TEST-0001', 'SM-TEST-0002', 'SM-TEST-0003')):
            entry = store.create_self_serve_workspace(actor_id=actor, claim_code=claim,
                business_name='Synthetic cleanup', product=product, session_id=session)
            registrations.append((entry.workspace_id, actor))
            surface = 'website' if product == 'website' else 'commerce'
            principal = TrialPrincipal(entry.workspace_id, actor, 'human', True, session, 'supabase')
            store.apply_command(principal, command_id=str(uuid4()), surface=surface,
                event_type=surface + '.workspace.initialized', expected_version=0, payload=payload_for(product))
        before = rehearsal.snapshot(admin)
        class FaultConnection:
            def __init__(self, connection): self.connection = connection
            def transaction(self): return self.connection.transaction()
            def execute(self, statement, parameters=None):
                text = statement.as_string(self.connection) if hasattr(statement, 'as_string') else statement
                if text.startswith('delete from app_private."workspace_state"'):
                    raise RuntimeError('injected_cleanup_failure')
                return self.connection.execute(statement, parameters)
        with pg._connect(admin, autocommit=True) as connection:
            try:
                cleanup_workspaces(FaultConnection(connection), registrations, [actor], project=PROJECT)
            except RuntimeError as error:
                if str(error) != 'injected_cleanup_failure': raise
            else:
                raise RuntimeError('fault_not_injected')
        if rehearsal.snapshot(admin) != before:
            raise RuntimeError('cleanup_rollback_changed_records')
        # Both guards must still reject unscoped mutation after failed cleanup.
        with pg._connect(admin, autocommit=True) as connection:
            for table, guard in (('workspace_events', 'workspace_events_immutable'),
                                  ('workspace_access_controls', 'workspace_access_control_guard')):
                if connection.execute('select tgenabled from pg_trigger where tgrelid=%s::regclass and tgname=%s',
                        ('app_private.' + table, guard)).fetchone() != ('O',):
                    raise RuntimeError('rollback_guard_not_restored')
            cleanup_workspaces(connection, registrations, [actor], project=PROJECT)
        with pg._connect(admin) as connection:
            verify_cleanup(connection, [pair[0] for pair in registrations], [actor])
    return {'ok': True, 'scope': 'local_postgres17', 'products': 3,
            'partial_delete_rolled_back': True, 'guards_restored': True,
            'committed_cleanup_verified_after_reconnect': True, 'hosted_acceptance': False}


if __name__ == '__main__':
    try:
        print(json.dumps(run()))
    except Exception as error:
        print(json.dumps({'ok': False, 'error_type': type(error).__name__, 'hosted_acceptance': False}))
        raise SystemExit(1)
