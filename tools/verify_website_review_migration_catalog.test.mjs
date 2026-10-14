import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { verifyWebsiteReviewMigrationCatalog } from './verify_website_review_migration_catalog.mjs'

const root = resolve(import.meta.dirname, '..')
const verify = db => verifyWebsiteReviewMigrationCatalog(db, (name, ok) => assert.ok(ok, name))

test('historical Website review catalog and later inquiry migration compatibility', async t => {
  const db = new PGlite()
  await db.waitReady
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin; create schema auth authorization postgres;
      create table auth.sessions(id uuid primary key,user_id uuid not null);`)
    const names = (await readdir(resolve(root, 'supabase/migrations')))
      .filter(name => name.endsWith('.sql') && name !== '20260711081300_public_legacy_baseline.sql').sort()
    const inquiryMigration = '20261014011202_website_inquiry_delivery.sql'
    assert.equal(names.at(-1), inquiryMigration)
    for (const name of names.slice(0, -1)) {
      await db.exec(await readFile(resolve(root, 'supabase/migrations', name), 'utf8'))
    }
    await t.test('exact full catalog accepted', async () => { await verify(db) })
    await t.test('checkout CRLF and LF preserve the same function contract', async () => {
      await db.exec('begin')
      try {
        await db.exec(`do $$ declare definition text; begin
          select pg_get_functiondef('app_private.guard_website_review()'::regprocedure) into definition;
          execute replace(replace(definition, chr(13)||chr(10), chr(10)), chr(10), chr(13)||chr(10));
        end $$`)
        await verify(db)
      } finally { await db.exec('rollback') }
    })
    const mutations = [
      ['acceptance forced RLS removed', 'alter table app_private.website_customer_acceptances no force row level security'],
      ['acceptance browser grant', 'grant select on app_private.website_customer_acceptances to authenticated'],
      ['acceptance cross-tenant policy', 'alter policy website_acceptance_read on app_private.website_customer_acceptances using (true)'],
      ['acceptance immutable guard disabled', 'alter table app_private.website_customer_acceptances disable trigger website_acceptance_guard'],
      ['feedback acceptance exclusion disabled', 'alter table app_private.website_customer_feedback disable trigger website_feedback_acceptance_guard'],
      ['acceptance content binding weakened', 'alter table app_private.website_customer_acceptances alter column preview_digest drop not null'],
      ['forced RLS removed', 'alter table app_private.website_customer_reviews no force row level security'],
      ['browser table grant', 'grant select on app_private.website_customer_reviews to authenticated'],
      ['permissive tenant policy', 'alter policy website_reviews_read on app_private.website_customer_reviews using (true)'],
      ['privileged function publicly callable', 'grant execute on function app_private.website_review_entitled() to public'],
      ['entitlement function forged', `create or replace function app_private.website_review_entitled() returns boolean language sql stable security definer set search_path=pg_catalog,app_private as 'select true'`],
      ['semantically significant literal whitespace changed', `do $$ declare definition text; begin
        select pg_get_functiondef('app_private.guard_website_review()'::regprocedure) into definition;
        execute replace(definition, '''read committed''', '''read  committed''');
      end $$`],
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
    await t.test('inquiry migration adds two RLS-sealed private relations', async () => {
      await db.exec(await readFile(resolve(root, 'supabase/migrations', inquiryMigration), 'utf8'))
      const { rows } = await db.query(`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app_private'
          and c.relname in ('website_inquiry_channels', 'website_inbox')
        order by c.relname
      `)
      assert.deepEqual(rows, [
        { relname: 'website_inbox', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'website_inquiry_channels', relrowsecurity: true, relforcerowsecurity: true },
      ])
    })
  } finally { await db.close() }
})
