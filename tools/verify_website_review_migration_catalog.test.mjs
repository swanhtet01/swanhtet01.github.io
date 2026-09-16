import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { verifyWebsiteReviewMigrationCatalog } from './verify_website_review_migration_catalog.mjs'

const root = resolve(import.meta.dirname, '..')
const verify = db => verifyWebsiteReviewMigrationCatalog(db, (name, ok) => assert.ok(ok, name))

test('complete migration chain and adversarial private catalog changes', async t => {
  const db = new PGlite()
  await db.waitReady
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin; create schema auth authorization postgres;
      create table auth.sessions(id uuid primary key,user_id uuid not null);`)
    const names = (await readdir(resolve(root, 'supabase/migrations')))
      .filter(name => name.endsWith('.sql') && name !== '20260711081300_public_legacy_baseline.sql').sort()
    for (const name of names) await db.exec(await readFile(resolve(root, 'supabase/migrations', name), 'utf8'))
    await t.test('exact full catalog accepted', async () => { await verify(db) })
    const mutations = [
      ['forced RLS removed', 'alter table app_private.website_customer_reviews no force row level security'],
      ['browser table grant', 'grant select on app_private.website_customer_reviews to authenticated'],
      ['permissive tenant policy', 'alter policy website_reviews_read on app_private.website_customer_reviews using (true)'],
      ['privileged function publicly callable', 'grant execute on function app_private.website_review_entitled() to public'],
      ['entitlement function forged', `create or replace function app_private.website_review_entitled() returns boolean language sql stable security definer set search_path=pg_catalog,app_private as 'select true'`],
      ['review immutability trigger disabled', 'alter table app_private.website_customer_reviews disable trigger website_review_guard'],
      ['review index removed', 'drop index app_private.website_customer_reviews_active_idx'],
      ['new unverified private table', 'create table app_private.unverified_private_data(id text)'],
      ['column constraint weakened', 'alter table app_private.website_customer_reviews alter column recipient_actor_id drop not null'],
      ['foreign key removed', 'alter table app_private.website_customer_reviews drop constraint website_customer_reviews_workspace_id_recipient_actor_id_fkey'],
      ['earlier security policy weakened', 'alter policy workspace_state_access_gate on app_private.workspace_state using (true)'],
    ]
    for (const [name, sql] of mutations) {
      await t.test(name, async () => {
        await db.exec('begin')
        try {
          await db.exec(sql)
          await assert.rejects(verify(db), /Website review complete private catalog/)
        } finally { await db.exec('rollback') }
        await verify(db)
      })
    }
  } finally { await db.close() }
})
