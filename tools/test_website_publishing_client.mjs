import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const { build } = createRequire(new URL('../showroom/package.json', import.meta.url))('esbuild')
const bundle = await build({ stdin: { contents: `export * from './website-publishing-client'`, loader: 'ts',
  resolveDir: fileURLToPath(new URL('../showroom/src/products/website', import.meta.url)) }, bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent', plugins: [{ name: 'auth-double', setup(build) {
    build.onResolve({ filter: /core\/managed-trial$/ }, () => ({ path: 'auth', namespace: 'synthetic' }))
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: 'export const sessionForRequest=(...args)=>globalThis.publishingAuth(...args)' }))
  } }] })
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const identity = { userId: 'synthetic-user', workspaceId: 'synthetic-workspace', email: '' }
let active = identity
globalThis.publishingAuth = async expected => {
  assert.deepEqual(expected, active, 'changed identity cannot receive prior response')
  return { session: { access_token: 'synthetic-token' }, workspaceId: identity.workspaceId }
}
const client = api.createPublishingClient(identity)
const channelId = '11111111-1111-4111-8111-111111111111'
const source = { version: 4, snapshotId: 'snapshot-qa', artifactDigest: 'sha256:' + 'a'.repeat(64) }
const publication = { channelId, pageId: 'home', sourceVersion: 4, enabled: true, artifactDigest: source.artifactDigest, snapshotId: source.snapshotId, publishedAt: '2026-10-10T09:00:00Z' }
const status = { publicOrigin: 'https://sites.example.test', source, publications: [publication] }
const inbox = { inquiries: [{ channelId, requestId: channelId, name: 'Daw Su', contact: 'qa@example.test', message: 'ဈေးနှုန်း သိချင်ပါတယ်။', siteName: 'Synthetic café', sourcePage: '/', receivedAt: publication.publishedAt, status: 'new', revision: 1, assignedTo: null, updatedBy: null, updatedAt: null, note: '' }], nextBefore: null, counts: { open: 1, done: 0 } }
const signal = () => new AbortController().signal
const original = globalThis.fetch
let count = 0
try {
  for (const malformed of [{ ...status, publicOrigin: 'javascript:alert(1)' }, { ...status, publicOrigin: 'https://user:pass@example.test' },
    { ...status, publicOrigin: 'https://sites.example.test/path' }, { ...status, source: { ...source, version: 1.5 } },
    { ...status, publications: [{ ...publication, channelId: '../escape' }] }, { ...status, publications: [{ ...publication, enabled: 'true' }] }]) {
    assert.throws(() => api.parsePublicationStatus(malformed)); count++
  }
  for (const malformed of [{ ...inbox, nextBefore: ['bad'] }, { ...inbox, inquiries: Array(51).fill(inbox.inquiries[0]) },
    { ...inbox, inquiries: [{ ...inbox.inquiries[0], receivedAt: 'invalid' }] }]) {
    assert.throws(() => api.parseInboxPage(malformed)); count++
  }
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/trial/v1/website-publications')
    assert.equal(init.headers.authorization, 'Bearer synthetic-token')
    assert.equal(init.headers['x-supermega-workspace-id'], identity.workspaceId)
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit')
    return Response.json(status)
  }
  assert.deepEqual(await client.status(signal()), status); count++
  const calls = []
  globalThis.fetch = async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body), method: init.method })
    return Response.json(path.endsWith('/publish') ? { channelId, enabled: true, artifactDigest: source.artifactDigest } : { channelId, enabled: false })
  }
  await client.publish(channelId, 'home', status, signal())
  assert.deepEqual(calls.map(c => c.path), ['/api/trial/v1/website-inquiry-channels', `/api/trial/v1/website-inquiry-channels/${channelId}/publish`])
  assert.equal(calls[0].body.expectedVersion, 4); assert.equal(calls[0].body.origin, status.publicOrigin); count++
  let attempts = 0
  globalThis.fetch = async () => { attempts++; throw new Error('connection interrupted') }
  await assert.rejects(client.publish(channelId, 'home', status, signal()), /interrupted/)
  assert.equal(attempts, 1, 'never automatically repeat a write'); count++
  globalThis.fetch = async () => Response.json({ channelId, enabled: false })
  await client.withdraw(publication, signal()); count++
  globalThis.fetch = async path => { assert.ok(path.includes('beforeChannel=')); return Response.json(inbox) }
  assert.deepEqual(await client.inbox(signal(), [publication.publishedAt, channelId, channelId]), inbox); count++
  globalThis.fetch = async path => { assert.equal(path, '/api/trial/v1/website-inbox?view=done'); return Response.json(inbox) }
  await client.inbox(signal(), null, 'done'); count++
  const actionId = '44444444-4444-4444-8444-444444444444'
  const receipt = { channelId, requestId: channelId, actionId, revision: 2, status: 'in_progress', assignedTo: identity.userId, updatedBy: identity.userId, updatedAt: publication.publishedAt }
  globalThis.fetch = async (path, init) => {
    assert.equal(path, `/api/trial/v1/website-inbox/${channelId}/${channelId}/actions`)
    assert.deepEqual(JSON.parse(init.body), { actionId, expectedRevision: 1, operation: 'claim', note: '' })
    assert.equal(init.headers['x-supermega-workspace-id'], identity.workspaceId)
    return Response.json(receipt)
  }
  assert.equal((await client.changeInquiry(inbox.inquiries[0], 'claim', actionId, '', signal())).revision, 2); count++
  for (const invalidReceipt of [{ ...receipt, actionId: channelId }, { ...receipt, revision: 3 }, { ...receipt, assignedTo: null }, { ...receipt, requestId: actionId }]) {
    globalThis.fetch = async () => Response.json(invalidReceipt)
    await assert.rejects(client.changeInquiry(inbox.inquiries[0], 'claim', actionId, '', signal())); count++
  }
  globalThis.fetch = async () => new Response('', { status: 409 })
  await assert.rejects(client.changeInquiry(inbox.inquiries[0], 'claim', actionId, '', signal()), /inquiry changed/); count++
  for (const invalidInbox of [{ ...inbox, counts: { open: -1, done: 0 } }, { ...inbox, inquiries: [{ ...inbox.inquiries[0], status: 'done' }] }, { ...inbox, inquiries: [{ ...inbox.inquiries[0], note: 'x'.repeat(801) }] }]) {
    assert.throws(() => api.parseInboxPage(invalidInbox)); count++
  }
  globalThis.fetch = async () => { active = { ...identity, workspaceId: 'different-workspace' }; return Response.json(inbox) }
  await assert.rejects(client.inbox(signal()), /changed identity/); active = identity; count++
  for (const response of [new Response('unavailable', { status: 503 }), new Response('denied', { status: 403 }),
    new Response('HTML', { headers: { 'content-type': 'text/html' } }),
    new Response(new Uint8Array(192 * 1024 + 1), { headers: { 'content-type': 'application/json' } })]) {
    globalThis.fetch = async () => response
    await assert.rejects(client.status(signal())); count++
  }
  const aborted = new AbortController(); aborted.abort(); attempts = 0
  globalThis.fetch = async () => { attempts++; return Response.json(status) }
  await assert.rejects(client.status(aborted.signal)); assert.equal(attempts, 0); count++
  console.log(JSON.stringify({ ok: true, cases: count, evidence: 'synthetic_transport_identity_and_receipt_checks' }))
} finally { globalThis.fetch = original; delete globalThis.publishingAuth }
