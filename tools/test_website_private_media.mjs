import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = require('esbuild')
const bundle = await build({
  stdin: { contents: `export * from './website-media-client'; export * from './website-media-export'; export * from './website-model';`,
    resolveDir: fileURLToPath(new URL('../showroom/src/products/website', import.meta.url)), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
  plugins: [{ name: 'isolated-auth-boundary', setup(build) {
    build.onResolve({ filter: /core\/managed-trial$/ }, () => ({ path: 'auth-double', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const sessionForRequest = (...args) => globalThis.mediaAuth(...args)' }))
  } }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const identity = { userId: 'user-a', workspaceId: 'workspace-a', email: 'example@example.test' }
let active = identity
let calls = 0
globalThis.mediaAuth = async expected => {
  calls++
  assert.deepEqual(expected, active, 'late identity changes must fail')
  return { session: { access_token: 'synthetic-token' }, workspaceId: active.workspaceId }
}
const originalFetch = globalThis.fetch
const client = api.createWebsiteMediaClient(identity, true)
const signal = () => new AbortController().signal
const bytes = Buffer.from('RIFF0000WEBPsynthetic-byte-integrity-fixture')
const digest = createHash('sha256').update(bytes).digest('hex')
const assetId = digest + '.webp'
const receipt = { assetId, sha256: digest, contentType: 'image/webp', visibility: 'private', bytes: bytes.length, width: 32, height: 24 }
const file = new File([bytes], 'chosen.webp', { type: 'image/webp' })
let cases = 0
try {
  for (const bad of [null, {}, { ...receipt, signedUrl: 'https://example.test/token' }, { ...receipt, sha256: 'a'.repeat(64) },
    { ...receipt, bytes: api.MAX_PHOTO_BYTES + 1 }, { ...receipt, width: 0 }, { ...receipt, height: 2049 }, { ...receipt, visibility: 'public' }]) {
    assert.throws(() => api.assertMediaReceipt(bad)); cases++
  }
  for (const bad of [new File([], 'empty.png', { type: 'image/png' }), new File(['svg'], 'photo.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(api.MAX_PHOTO_UPLOAD + 1)], 'large.png', { type: 'image/png' })]) {
    assert.throws(() => api.assertPhotoFile(bad)); cases++
  }
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/trial/v1/website-media')
    assert.equal(init.method, 'POST'); assert.equal(init.body, file)
    assert.equal(init.headers['content-type'], 'image/webp'); assert.equal(init.headers['x-supermega-workspace-id'], 'workspace-a')
    assert.equal(init.headers.authorization, 'Bearer synthetic-token')
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit')
    return Response.json(receipt, { status: 201 })
  }
  assert.equal(await client.upload(file, signal()), assetId); cases++
  assert.equal(api.createWebsiteMediaClient(identity, false).upload, undefined); cases++
  globalThis.fetch = async path => {
    assert.equal(path, `/api/trial/v1/website-media/${assetId}`)
    return new Response(bytes, { headers: { 'content-type': 'image/webp' } })
  }
  assert.deepEqual(Buffer.from(await (await client.load(assetId, signal())).arrayBuffer()), bytes); cases++
  await assert.rejects(client.load('../outside', signal()), /reference is invalid/); cases++
  for (const response of [new Response('denied', { status: 403 }), new Response(bytes, { headers: { 'content-type': 'text/html' } }),
    new Response(bytes, { headers: { 'content-type': 'image/webp', 'content-length': String(api.MAX_PHOTO_BYTES + 1) } }),
    new Response(Buffer.from('RIFF0000WEBPwrong'), { headers: { 'content-type': 'image/webp' } }),
    new Response(new Uint8Array(api.MAX_PHOTO_BYTES + 1), { headers: { 'content-type': 'image/webp' } })]) {
    globalThis.fetch = async () => response
    await assert.rejects(client.load(assetId, signal())); cases++
  }
  globalThis.fetch = async () => { active = { ...identity, workspaceId: 'workspace-b' }; return Response.json(receipt) }
  await assert.rejects(client.upload(file, signal()), /late identity/); cases++
  active = identity
  const canceled = new AbortController(); canceled.abort()
  globalThis.fetch = async () => Response.json(receipt)
  await assert.rejects(client.upload(file, canceled.signal)); cases++
  const workspace = api.createInitialWorkspace()
  workspace.pages[0].hero.image = { assetId, alt: 'Saved photo', decorative: false }
  workspace.pages[0].sections[0].image = { assetId, alt: '', decorative: true }
  const artifact = api.createWebsiteArtifact(workspace)
  const original = JSON.stringify(artifact)
  let loads = 0
  const exportClient = { scopeKey: 'synthetic', assertCurrent: async () => {}, load: async () => { loads++; return new Blob([bytes], { type: 'image/webp' }) } }
  const download = await api.createWebsiteMediaDownload(artifact, exportClient, signal())
  assert.equal(loads, 1, 'duplicate photos fetched once'); assert.equal(JSON.stringify(artifact), original)
  assert.equal(download.content.split(`data:image/webp;base64,${bytes.toString('base64')}`).length - 1, 2)
  assert.ok(!download.content.includes(assetId)); assert.ok(!download.content.includes('synthetic-token')); cases++
  await assert.rejects(api.createWebsiteMediaDownload(artifact, null, signal()), /Sign in/); cases++
  await assert.rejects(api.createWebsiteMediaDownload(artifact, { ...exportClient, load: async () => new Blob(['bad']) }, signal()), /verified/); cases++
  await assert.rejects(api.createWebsiteMediaDownload(artifact, { ...exportClient, assertCurrent: async () => { throw Error('identity changed') } }, signal()), /identity changed/); cases++
  await assert.rejects(api.createWebsiteMediaDownload(artifact, exportClient, canceled.signal)); cases++
  const legacy = api.createWebsiteArtifact(api.createInitialWorkspace())
  assert.ok((await api.createWebsiteMediaDownload(legacy, null, signal())).content.includes('<!doctype html>')); cases++
  assert.equal(JSON.stringify(artifact), original, 'failed exports preserve retained artifact')
  console.log(JSON.stringify({ ok: true, contract: 'website_private_media_client_export', cases, authBoundaryChecks: calls,
    evidence: 'synthetic responses and authentication double; no provider call' }))
} finally { globalThis.fetch = originalFetch; delete globalThis.mediaAuth }
