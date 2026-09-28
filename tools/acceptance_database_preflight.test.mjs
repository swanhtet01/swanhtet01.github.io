import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const sql = await readFile(new URL('./acceptance_database_preflight.sql', import.meta.url), 'utf8')
test('preflight distinguishes missing prerequisites and unsafe role reuse without application writes', async () => {
  const db = new PGlite()
  const inspect = async () => (await db.exec(sql)).find(result => result.rows?.[0]?.preflight)?.rows[0].preflight
  try {
    const empty = await inspect()
    assert.equal(empty.application_schema_present, false)
    assert.equal(empty.platform_roles_present, false)
    assert.equal(empty.auth_sessions_uuid_columns, false)
    assert.equal(empty.backend_role_state, 'absent')
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.sessions(id uuid, user_id text); create role supermega_trial_backend nologin inherit;')
    const partial = await inspect()
    assert.equal(partial.platform_roles_present, true)
    assert.equal(partial.auth_sessions_uuid_columns, false)
    assert.equal(partial.backend_role_state, 'unused_group_role')
    await db.exec('alter table auth.sessions alter column user_id type uuid using user_id::uuid; alter role supermega_trial_backend login;')
    const unsafe = await inspect()
    assert.equal(unsafe.auth_sessions_uuid_columns, true)
    assert.equal(unsafe.backend_role_state, 'requires_review')
    await db.exec('alter role supermega_trial_backend nologin; create schema app_private authorization supermega_trial_backend;')
    const collision = await inspect()
    assert.equal(collision.application_schema_present, true)
    assert.equal(collision.backend_role_state, 'requires_review')
    assert.equal(collision.public_table_count, 0)
    assert.equal(collision.migration_history_present, false)
  } finally { await db.close() }
})
