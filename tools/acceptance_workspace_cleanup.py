"""Exact-fixture cleanup; guard changes are transaction-local behind table locks.

Never a production maintenance utility. The caller must bind the admin connection
to the approved acceptance project and register IDs before issuing test writes.
"""
from uuid import UUID
from psycopg import sql
from tools.acceptance_auth_fixture import PROJECT

TABLES = ('workspace_events', 'workspace_state', 'workspace_memberships', 'workspace_access_controls')
GUARDS = (('workspace_events', 'workspace_events_immutable'),
          ('workspace_access_controls', 'workspace_access_control_guard'))


def cleanup_workspaces(connection, registrations, actor_ids, *, project):
    # Cleanup deliberately remains possible after authority expiry.
    if project != PROJECT or not 1 <= len(actor_ids) <= 2 or len(registrations) > 3:
        raise ValueError('acceptance_cleanup_scope_invalid')
    actors = [str(UUID(value)) for value in actor_ids]
    targets = {str(UUID(workspace)): str(UUID(actor)) for workspace, actor in registrations}
    if len(targets) != len(registrations) or any(actor not in actors for actor in targets.values()):
        raise ValueError('acceptance_cleanup_scope_invalid')
    ids = list(targets)
    with connection.transaction():
        connection.execute("set local lock_timeout = '5s'")
        connection.execute("set local statement_timeout = '20s'")
        # ACCESS EXCLUSIVE lasts until commit/rollback. No other transaction can
        # observe the temporary guard state or modify rows while cleanup runs.
        for table in (*TABLES, 'self_serve_attempt_budgets'):
            connection.execute(sql.SQL('lock table app_private.{} in access exclusive mode').format(sql.Identifier(table)))
        for table, guard in GUARDS:
            row = connection.execute('select tgenabled from pg_trigger where tgrelid=%s::regclass and tgname=%s',
                                     ('app_private.' + table, guard)).fetchone()
            if row != ('O',):
                raise RuntimeError('acceptance_cleanup_guard_posture_invalid')
        for table, actor_column in (('workspace_access_controls', 'owner_actor_id'),
                                    ('workspace_memberships', 'actor_id'), ('workspace_events', 'actor_id')):
            rows = connection.execute(sql.SQL('select workspace_id, {} from app_private.{} where workspace_id=any(%s)').format(
                sql.Identifier(actor_column), sql.Identifier(table)), (ids,)).fetchall()
            if any(targets[workspace] != actor for workspace, actor in rows):
                raise RuntimeError('acceptance_cleanup_owner_mismatch')
        for table, guard in GUARDS:
            connection.execute(sql.SQL('alter table app_private.{} disable trigger {}').format(sql.Identifier(table), sql.Identifier(guard)))
        for table in TABLES:
            connection.execute(sql.SQL('delete from app_private.{} where workspace_id=any(%s)').format(sql.Identifier(table)), (ids,))
        connection.execute('delete from app_private.self_serve_attempt_budgets where actor_id=any(%s::uuid[])', (actors,))
        for table, guard in GUARDS:
            connection.execute(sql.SQL('alter table app_private.{} enable trigger {}').format(sql.Identifier(table), sql.Identifier(guard)))
        verify_cleanup(connection, ids, actors)


def verify_cleanup(connection, ids, actors):
    for table in TABLES:
        if connection.execute(sql.SQL('select count(*) from app_private.{} where workspace_id=any(%s)').format(
                sql.Identifier(table)), (ids,)).fetchone() != (0,):
            raise RuntimeError('acceptance_workspace_cleanup_incomplete')
    if connection.execute('select count(*) from app_private.self_serve_attempt_budgets where actor_id=any(%s::uuid[])',
                          (actors,)).fetchone() != (0,):
        raise RuntimeError('acceptance_budget_cleanup_incomplete')
    for table, guard in GUARDS:
        if connection.execute('select tgenabled from pg_trigger where tgrelid=%s::regclass and tgname=%s',
                              ('app_private.' + table, guard)).fetchone() != ('O',):
            raise RuntimeError('acceptance_cleanup_guard_not_restored')
