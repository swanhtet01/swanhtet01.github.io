import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPreviewScopedAccess } from './preview_scoped_access.mjs'
const publicOrigin = 'https://supermega-public-123456789-swanhtet01s-projects.vercel.app'
const appOrigin = 'https://megaos-123456789-swanhtet01s-projects.vercel.app'
const input = () => ({ publicOrigin, appOrigin, publicToken: 'synthetic-public-fixture-not-a-secret', appToken: 'synthetic-app-fixture-not-a-secret' })
test('credentials remain bound to exact immutable origin and readonly methods', () => {
  const access = createPreviewScopedAccess(input())
  assert.equal(access.headersFor(publicOrigin)['x-vercel-protection-bypass'], input().publicToken)
  assert.equal(access.headersFor(appOrigin)['x-vercel-protection-bypass'], input().appToken)
  for (const url of ['https://app.supermega.dev/', `${appOrigin}.evil.example/`, 'https://evil.example/',
    `${appOrigin}/?token=value`, appOrigin.replace('https://', 'https://user@')]) assert.throws(() => access.headersFor(url), /denied/)
  assert.throws(() => access.headersFor(appOrigin, 'POST'), /denied/)
  assert.equal(JSON.stringify(access).includes(input().appToken), false)
  access.dispose(); assert.throws(() => access.headersFor(appOrigin), /disposed/)
})
test('transport refuses redirect and sanitizes upstream exceptions', async () => {
  const access = createPreviewScopedAccess(input())
  await assert.rejects(() => access.fetchReadOnly(appOrigin, async (_, options) => {
    assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit')
    return { status: 302 }
  }), /redirect_denied/)
  await assert.rejects(() => access.fetchReadOnly(appOrigin, async () => { throw new Error(input().appToken) }), error => error.message === 'preview_access_fetch_failed')
  const result = await access.fetchReadOnly(appOrigin, async () => ({ status: 200 }))
  assert.equal(result.status, 200)
  access.dispose()
})
