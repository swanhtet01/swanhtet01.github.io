"""Disposable source-migration catalog evidence; never accepts a database URL."""
import os
import unittest

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.core_security_catalog import core_security_catalog_digest, CORE_SECURITY_DIGESTS
from supermega_runtime.trial_store import PostgresTrialStore, TrialNotReadyError


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_CORE_SECURITY_SQL') == '1', 'explicit local SQL only')
class CoreSecurityCatalogSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data = cls.workspace / 'primary-data'
        cls.started = False
        cls.addClassCleanup(cls.stop)
        port, password = pg._free_loopback_port(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(),
                               data_directory=cls.data, admin_password=password,
                               port=port, environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                          log_file=cls.workspace / 'postgres.log', port=port, environment=cls.environment)
        root = pg._connection_url('postgres', password, port, 'postgres')
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        cls.digests = {}
        for migration in pg.CURRENT_MIGRATIONS:
            pg._apply_migrations(postgres_bin=cls.bin, admin_password=password,
                                 admin_database_url=cls.admin_url, port=port,
                                 environment=cls.environment, migrations=(migration,))
            with pg._connect(cls.admin_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("select to_regclass('app_private.trial_schema_meta')")
                    if cursor.fetchone()[0] is None:
                        continue
                    cursor.execute("select schema_version from app_private.trial_schema_meta where component='private_trial_backend'")
                    version = cursor.fetchone()[0]
                    if version >= 10:
                        digest = core_security_catalog_digest(cursor)
                        if version in cls.digests and cls.digests[version] != digest:
                            raise AssertionError('same-version core security contract changed')
                        cls.digests[version] = digest
        runtime_password = pg._password()
        pg._provision_runtime(cls.admin_url, runtime_password)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                                                      environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('core_security_sql_cleanup_unreconciled')

    def test_source_catalog_and_tampering(self):
        self.assertEqual(set(self.digests), {10, 11, 12, 13})
        self.assertEqual(self.digests, CORE_SECURITY_DIGESTS)
        baseline = self.digests[13]
        from psycopg.rows import dict_row
        with pg._connect(self.runtime_url) as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute('set transaction read only')
                PostgresTrialStore._assert_schema(cursor)
        with pg._connect(self.admin_url) as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                PostgresTrialStore._assert_schema(cursor)
        for statement in (
            'alter table app_private.workspace_state disable row level security',
            'alter table app_private.workspace_state no force row level security',
            'alter policy workspace_state_member_read on app_private.workspace_state using (true)',
            'create policy injected_read on app_private.workspace_state for select using (true)',
            "create or replace function app_private.supabase_session_is_active(target_user_id uuid,target_session_id uuid) returns boolean language sql stable security definer set search_path='' as $$select true$$",
            "alter function app_private.supabase_session_is_active(uuid,uuid) set search_path=public",
            'alter function app_private.supabase_session_is_active(uuid,uuid) owner to supabase_admin',
            'grant execute on function app_private.supabase_session_is_active(uuid,uuid) to public',
            'grant select on app_private.workspace_state to authenticated',
        ):
            with self.subTest(statement=statement):
                with pg._connect(self.admin_url) as connection:
                    with connection.cursor(row_factory=dict_row) as cursor:
                        cursor.execute(statement)
                        self.assertNotEqual(core_security_catalog_digest(cursor), baseline)
                        with self.assertRaises(TrialNotReadyError) as error:
                            PostgresTrialStore._assert_schema(cursor)
                        self.assertEqual(error.exception.reasons, ('schema_ready',))
                    connection.rollback()
        with pg._connect(self.admin_url) as connection:
            with connection.cursor() as cursor:
                self.assertEqual(core_security_catalog_digest(cursor), baseline)


if __name__ == '__main__':
    unittest.main()
