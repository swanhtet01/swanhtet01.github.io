"""Opt-in disposable loopback PG17 role-guard tests; no supplied DB URLs."""

import os
import unittest

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialNotReadyError


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_ROLE_GUARD_SQL') == '1', 'explicit local SQL only')
class RuntimeSchemaPrivilegeSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data = cls.workspace / 'primary-data'
        cls.started = False
        cls.addClassCleanup(cls.stop)
        port, password, runtime_password = pg._free_loopback_port(), pg._password(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(),
                               data_directory=cls.data, admin_password=password,
                               port=port, environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                          log_file=cls.workspace / 'postgres.log', port=port, environment=cls.environment)
        root = pg._connection_url('postgres', password, port, 'postgres')
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        with pg._connect(cls.admin_url) as connection:
            connection.execute('create role supermega_trial_backend nologin nosuperuser nobypassrls')
            connection.execute('create schema app_private authorization postgres')
            connection.execute('revoke all on schema app_private from public')
            connection.execute('grant usage on schema app_private to supermega_trial_backend')
            connection.execute('create table app_private.guard_fixture(id integer)')
            connection.execute('create function app_private.guard_fixture_fn() returns integer language sql as $$select 1$$')
        pg._provision_runtime(cls.admin_url, runtime_password)

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data,
                                                      environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('role_guard_sql_cleanup_unreconciled')

    def assert_guard(self, rejected=False):
        from psycopg.rows import dict_row
        with pg._connect(self.runtime_url) as connection:
            connection.execute('set transaction read only')
            with connection.cursor(row_factory=dict_row) as cursor:
                if rejected:
                    with self.assertRaises(TrialNotReadyError) as error:
                        PostgresTrialStore._assert_runtime_role(cursor)
                    self.assertEqual(error.exception.reasons, ('role_ready',))
                else:
                    PostgresTrialStore._assert_runtime_role(cursor)

    def test_real_direct_inherited_create_and_ownership_fail_closed(self):
        from psycopg import sql
        self.assert_guard()
        cases = [(sql.SQL('grant create on schema app_private to public'),
                  sql.SQL('revoke create on schema app_private from public'))]
        for role in (pg.RUNTIME_ROLE, 'supermega_trial_backend'):
            identifier = sql.Identifier(role)
            cases.append((sql.SQL('grant create on schema app_private to {}').format(identifier),
                          sql.SQL('revoke create on schema app_private from {}').format(identifier)))
            for object_name in ('database ' + pg.DATABASE_NAME,
                                'schema app_private', 'table app_private.guard_fixture',
                                'function app_private.guard_fixture_fn()'):
                cases.append((sql.SQL('alter ' + object_name + ' owner to {}').format(identifier),
                              sql.SQL('alter ' + object_name + ' owner to postgres')))
        for index, (mutate, restore) in enumerate(cases):
            with self.subTest(case=index):
                with pg._connect(self.admin_url, autocommit=True) as admin:
                    try:
                        admin.execute(mutate)
                        self.assert_guard(rejected=True)
                    finally:
                        admin.execute(restore)
                self.assert_guard()

        for mutate, restore in (
            ('alter schema app_private rename to guard_missing',
             'alter schema guard_missing rename to app_private'),
            ('alter role supermega_trial_backend rename to guard_missing_backend',
             'alter role guard_missing_backend rename to supermega_trial_backend'),
        ):
            with pg._connect(self.admin_url, autocommit=True) as admin:
                try:
                    admin.execute(mutate)
                    self.assert_guard(rejected=True)
                finally:
                    admin.execute(restore)
            self.assert_guard()

        # Other owners and another database must not produce a false rejection.
        with pg._connect(self.admin_url, autocommit=True) as admin:
            admin.execute('create role unrelated_fixture_owner nologin')
            admin.execute('alter table app_private.guard_fixture owner to unrelated_fixture_owner')
            admin.execute(sql.SQL('create database guard_other_database owner {}').format(
                sql.Identifier(pg.RUNTIME_ROLE)))
        self.assert_guard()


if __name__ == '__main__':
    unittest.main()
