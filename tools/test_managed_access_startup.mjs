import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/CoreShell.tsx', 'utf8')
const start = source.indexOf('function useManagedPortalAccess(')
const end = source.indexOf('\nfunction PortalAccessPanel(', start)
assert.ok(start >= 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code

function render(enabled, workspace, resolved) {
  const local = { status: 'local', products: [], workspaceId: '' }
  return runInNewContext(`${code}\nuseManagedPortalAccess(enabled, workspace, '/')`, {
    enabled, workspace, localPortalAccess: local,
    useState: initial => [resolved ?? initial, () => { throw Error('Unexpected state write during render') }],
    // This harness exercises synchronous render gating; it never performs identity/network work.
    useEffect: () => {},
  })
}

test('selected managed company stays checking before runtime health resolves', () => {
  const result = render(false, 'synthetic-company')
  assert.equal(result.status, 'checking')
  assert.equal(result.products.length, 0)
})

test('only a matching resolved company can expose assigned products', () => {
  const access = { status: 'ready', products: ['commerce'], workspaceId: 'synthetic-company' }
  assert.equal(render(true, 'synthetic-company').status, 'checking')
  assert.equal(render(true, 'synthetic-company', { key: 'other:/', access }).status, 'checking')
  assert.equal(render(true, 'synthetic-company', { key: 'synthetic-company:/', access }), access)
  assert.equal(render(false, 'synthetic-company', { key: 'synthetic-company:/', access }).status, 'checking')
})

test('unselected local workspace remains available', () => {
  assert.equal(render(false, '').status, 'local')
  assert.equal(render(true, '').status, 'local')
})

// Run the actual effect body with a controlled portal-client import. No React
// scheduler, browser storage or network is used by this bounded race harness.
const effectSource = source.slice(start, end).replace("import('./managed-portal-client')", 'Promise.resolve(client)')
assert.notEqual(effectSource, source.slice(start, end))
const effectCode = transformSync(effectSource, { loader: 'ts', format: 'cjs' }).code
const settle = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function startEffect(overrides = {}) {
  const writes = []
  let cleanup
  const client = {
    currentManagedIdentity: async () => ({ workspaceId: 'company-a', userId: 'user-a' }),
    loadManagedBootstrap: async () => ({}),
    discoverManagedWorkspacesForCurrentSession: async () => ({ userId: 'user-a', email: 'synthetic@example.invalid', workspaces: [{ workspaceId: 'company-a', label: 'Synthetic A', access: 'owner' }] }),
    managedProductsFromBootstrap: () => ['commerce'],
    ...overrides,
  }
  runInNewContext(`${effectCode}\nuseManagedPortalAccess(true, 'company-a', '/')`, {
    client, localPortalAccess: { status: 'local', products: [], workspaceId: '' },
    useState: initial => [initial, next => writes.push(next)],
    useEffect: effect => { cleanup = effect() },
  })
  return { writes, cancel: () => cleanup() }
}

test('late identity cannot start bootstrap after effect cleanup', async () => {
  const identity = deferred()
  let bootstrapCalls = 0
  const run = startEffect({ currentManagedIdentity: () => identity.promise, loadManagedBootstrap: async () => { bootstrapCalls++; return {} } })
  await settle()
  run.cancel()
  identity.resolve({ workspaceId: 'company-a', userId: 'user-a' })
  await settle()
  assert.equal(bootstrapCalls, 0)
  assert.equal(run.writes.length, 0)
})

for (const fails of [false, true]) {
  test(`late bootstrap ${fails ? 'failure' : 'success'} cannot restore cancelled access`, async () => {
    const bootstrap = deferred()
    const run = startEffect({ loadManagedBootstrap: () => bootstrap.promise })
    await settle()
    run.cancel()
    if (fails) bootstrap.reject(new Error('Synthetic failure'))
    else bootstrap.resolve({})
    await settle()
    assert.equal(run.writes.length, 0)
  })
}

test('current bootstrap failure and changed directory identity fail closed', async () => {
  for (const overrides of [
    { loadManagedBootstrap: async () => { throw new Error('Synthetic failure') } },
    { discoverManagedWorkspacesForCurrentSession: async () => ({ userId: 'user-b', workspaces: [{ workspaceId: 'company-a' }] }) },
  ]) {
    const run = startEffect(overrides)
    await settle()
    assert.equal(run.writes.length, 1)
    assert.equal(run.writes[0].access.status, 'error')
    assert.equal(run.writes[0].access.products.length, 0)
    run.cancel()
  }
})

test('matching current company resolves normally', async () => {
  const run = startEffect()
  await settle()
  assert.equal(run.writes.length, 1)
  assert.equal(run.writes[0].access.status, 'ready')
  assert.equal(run.writes[0].access.workspaceId, 'company-a')
  run.cancel()
})
