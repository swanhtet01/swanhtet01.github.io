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
  const requests = []
  const request = runInNewContext(`${code}\nauthorizedRequest`, {
    Headers,
    sessionForRequest: async expected => {
      if (expected && expected.workspaceId !== current) throw new Error('managed_identity_changed')
      return { session: { access_token: 'synthetic-only' }, workspaceId: current }
    },
    withTraceHeaders: () => {},
    fetch: async (path, init) => { requests.push({ path, init }); return responses[fetches++]() },
    authClient: async () => ({ auth: { refreshSession: async () => { refreshes++; return { data: { session: {} } } } } }),
    parseError: async () => new Error('request_failed'),
  })
  return { request: (init = {}) => request('/synthetic', init, true, { workspaceId: 'company-a' }), requests,
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


const sessionStart = source.indexOf('async function sessionForRequest(')
assert.ok(sessionStart >= 0 && sessionStart < start)
const sessionCode = transformSync(source.slice(sessionStart, start), { loader: 'ts', format: 'cjs' }).code

test('real session resolver rejects workspace and user changes across awaited authentication', async () => {
  for (const stage of ['get', 'refresh']) {
    for (const change of ['workspace', 'user', 'none']) {
      let workspace = 'company-a', release, started
      const waiting = new Promise(resolve => { started = resolve })
      const delayed = new Promise(resolve => { release = resolve })
      const expected = { workspaceId: 'company-a', userId: 'user-a' }
      const makeSession = (userId, expiring = false) => ({ user: { id: userId, is_anonymous: false },
        expires_at: Math.floor(Date.now() / 1000) + (expiring ? 0 : 3600), access_token: 'synthetic-only' })
      const invoke = runInNewContext(`${sessionCode}\nsessionForRequest`, {
        authClient: async () => ({ auth: {
          getSession: async () => stage === 'get' ? (started(), delayed) : { data: { session: makeSession('user-a', true) } },
          refreshSession: async () => { started(); return delayed },
        } }),
        currentManagedWorkspace: () => workspace, normalizeWorkspaceId: value => value,
        identity: (session, workspaceId) => ({ workspaceId, userId: session.user.id }),
        sameManagedIdentity: (a, b) => a.workspaceId === b.workspaceId && a.userId === b.userId,
        ManagedTrialError: class extends Error {}, managedError: message => new Error(message),
        errorAuthRequired: message => new Error(message), errorAuthNotConfigured: message => new Error(message),
      })
      const pending = invoke(expected)
      await waiting
      if (change === 'workspace') workspace = 'company-b'
      release({ data: { session: makeSession(change === 'user' ? 'user-b' : 'user-a') }, error: null })
      if (change === 'none') assert.equal((await pending).workspaceId, 'company-a')
      else await assert.rejects(pending, /company account changed/)
    }
  }
})


test('uncertain POST transport and body failures never automatically resend a command', async () => {
  for (const stage of ['transport', 'body']) {
    const failure = new Error('synthetic connection interrupted')
    const run = harness([() => {
      if (stage === 'transport') throw failure
      return { status: 200, ok: true, json: async () => { throw failure } }
    }])
    await assert.rejects(run.request({ method: 'POST', body: '{"command_id":"synthetic-command"}' }), /synthetic connection interrupted/)
    assert.deepEqual(run.counts(), { fetches: 1, refreshes: 0 })
  }
})

test('POST authentication retry preserves the exact reviewed command and workspace', async () => {
  const body = JSON.stringify({ command_id: 'synthetic-command', expected_version: 7, state: { synthetic: true } })
  const run = harness([() => ({ status: 401 }), () => ({ status: 200, ok: true, json: async () => ({ accepted: true }) })])
  await run.request({ method: 'POST', body })
  assert.deepEqual(run.counts(), { fetches: 2, refreshes: 1 })
  for (const sent of run.requests) {
    assert.equal(sent.path, '/synthetic')
    assert.equal(sent.init.method, 'POST')
    assert.equal(sent.init.body, body)
    assert.equal(sent.init.headers.get('x-supermega-workspace-id'), 'company-a')
    assert.equal(sent.init.headers.get('content-type'), 'application/json')
  }
})
