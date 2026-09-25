import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/managed-trial.ts', 'utf8')
const start = source.indexOf('async function authorizedRequest<T>(')
const end = source.indexOf('\nexport async function validateManagedClientImport(', start)
assert.ok(start >= 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code

function harness(responses) {
  let current = 'company-a', fetches = 0, refreshes = 0
  const request = runInNewContext(`${code}\nauthorizedRequest`, {
    Headers,
    sessionForRequest: async expected => {
      if (expected && expected.workspaceId !== current) throw new Error('managed_identity_changed')
      return { session: { access_token: 'synthetic-only' }, workspaceId: current }
    },
    withTraceHeaders: () => {},
    fetch: async () => responses[fetches++](),
    authClient: async () => ({ auth: { refreshSession: async () => { refreshes++; return { data: { session: {} } } } } }),
    parseError: async () => new Error('request_failed'),
  })
  return { request: () => request('/synthetic', {}, true, { workspaceId: 'company-a' }),
    change: () => { current = 'company-b' }, counts: () => ({ fetches, refreshes }) }
}

test('session change during JSON body delivery rejects old-company data', async () => {
  let release, bodyStarted
  const started = new Promise(resolve => { bodyStarted = resolve })
  const body = new Promise(resolve => { release = resolve })
  const run = harness([() => ({ status: 200, ok: true, json: () => { bodyStarted(); return body } })])
  const pending = run.request()
  await started
  run.change()
  release({ private: 'synthetic company-a' })
  await assert.rejects(pending, /managed_identity_changed/)
  assert.equal(run.counts().fetches, 1)
})

test('unchanged identity returns parsed data with at most one authentication retry', async () => {
  const body = { synthetic: true }
  const run = harness([() => ({ status: 401 }), () => ({ status: 200, ok: true, json: async () => body })])
  assert.equal(await run.request(), body)
  assert.deepEqual(run.counts(), { fetches: 2, refreshes: 1 })
  const denied = harness([() => ({ status: 401 }), () => ({ status: 401, ok: false })])
  await assert.rejects(denied.request(), /request_failed/)
  assert.deepEqual(denied.counts(), { fetches: 2, refreshes: 1 })
})

test('authentication retry retains the original company and never resends after a switch', async () => {
  const run = harness([() => {
    run.change()
    return { status: 401 }
  }])
  await assert.rejects(run.request(), /managed_identity_changed/)
  assert.deepEqual(run.counts(), { fetches: 1, refreshes: 1 })
})


test('account switched during caller preparation prevents the initial request', async () => {
  const run = harness([])
  run.change()
  await assert.rejects(run.request(), /managed_identity_changed/)
  assert.deepEqual(run.counts(), { fetches: 0, refreshes: 0 })
})
