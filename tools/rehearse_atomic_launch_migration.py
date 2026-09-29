"""Prove the exact combined launch batch succeeds and rolls back as one unit locally."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import rehearse_self_serve_v13 as rehearsal
from tools.prepare_atomic_launch_migration import prepare


def run(manifest):
    prepared = prepare(manifest)
    pg = rehearsal.pg
    binary, openssl = pg._default_postgres_bin(), pg._default_openssl()
    if not pg._preflight(binary, openssl).get('ok'):
        raise RuntimeError('local_postgres17_required')
    secret = pg._password()
    with rehearsal.cluster(binary, openssl, secret, 'atomic-launch') as (port, environment):
        admin = pg._connection_url('postgres', secret, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(pg._connection_url('postgres', secret, port, 'postgres'), pg.DATABASE_NAME)
        pg._create_auth_session_fixture(admin)
        pg._create_public_browser_fixture(admin)
        pg._apply_public_browser_quarantine(postgres_bin=binary, admin_password=secret,
            port=port, database_name=pg.DATABASE_NAME, environment=environment)
        pg._apply_migrations(postgres_bin=binary, admin_password=secret,
            admin_database_url=admin, port=port, environment=environment)
        before = rehearsal.migration_catalog(admin)
        from psycopg.errors import DivisionByZero
        try:
            with pg._connect(admin, autocommit=True) as connection:
                connection.execute('begin;\n' + prepared['body'] + '\nselect 1/0;\ncommit;')
        except DivisionByZero:
            pass
        else:
            raise RuntimeError('migration_fault_not_observed')
        if rehearsal.migration_catalog(admin) != before:
            raise RuntimeError('atomic_migration_catalog_not_rolled_back')
        with pg._connect(admin, autocommit=True) as connection:
            if connection.execute("select schema_version from app_private.trial_schema_meta where component='private_trial_backend'").fetchone() != (11,):
                raise RuntimeError('atomic_migration_version_not_rolled_back')
            connection.execute(prepared['sql'])
        with pg._connect(admin) as connection:
            if connection.execute("select schema_version from app_private.trial_schema_meta where component='private_trial_backend'").fetchone() != (13,):
                raise RuntimeError('atomic_migration_version_not_committed')
            names = {row[0] for row in connection.execute("select tablename from pg_tables where schemaname='app_private'").fetchall()}
            if names != set(rehearsal.TABLES):
                raise RuntimeError('atomic_migration_table_inventory_mismatch')
    return {'ok': True, 'scope': 'local_postgres17', 'batch_sha256': prepared['sha256'],
            'migration_count': 9, 'failure_restored_schema11': True, 'success_committed_schema13': True,
            'production_apply_authorized': False}


if __name__ == '__main__':
    try:
        print(json.dumps(run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))))
    except Exception as error:
        print(json.dumps({'ok': False, 'error_type': type(error).__name__, 'production_apply_authorized': False}))
        raise SystemExit(1)
