import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { createEmptyCommerce, createSeedCommerce, validateCommerceState } from '../showroom/src/core/commerce-workspace.ts'
import { classifyStorefrontCatalogSource } from '../showroom/src/products/ecommerce/storefront-model.ts'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function recordManagedBuyingRequest(')
const end = source.indexOf('\n  function openShopDraft', start)
assert.ok(start >= 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts', target: 'es2022' }).code

function managedCatalogDependencies(...expectedStates) {
  const expected = new Set(expectedStates)
  const requireExpectedState = state => {
    assert.ok(expected.has(state), 'catalog dependency must receive the current managed storefront state')
    return state
  }
  return {
    classifyStorefrontCatalogSource: (state, origin) => {
      assert.equal(origin, 'managed')
      return classifyStorefrontCatalogSource(requireExpectedState(state), origin)
    },
    managedCatalogSnapshot: state => {
      const current = requireExpectedState(state)
      const snapshot = { source: classifyStorefrontCatalogSource(current, 'managed'), items: current.items, error: '' }
      assert.equal(snapshot.source, 'managed-shop')
      return snapshot
    },
  }
}

for (const changeAt of [2, 3, Infinity]) test(changeAt === Infinity ? 'unchanged identity can confirm an already-retained request' : `account switch at identity read ${changeAt} rejects stale managed request`, async () => {
  const identity = { workspaceId: 'company-a', userId: 'user-a' }
  const request = { id: 'ECR-test', idempotencyKey: 'key', createdAt: 'now', sourcePreviewDigest: 'digest' }
  const state = createEmptyCommerce()
  let reads = 0, applied = 0, writes = 0
  const context = {
    setManagedCanDeliverReviews: () => {}, canDeliverCatalogReviews: () => false,
    managedIdentity: identity, managedCanWrite: true, crypto: { randomUUID: () => 'id' },
    currentManagedIdentity: async () => ++reads >= changeAt ? { workspaceId: 'company-b', userId: 'user-b' } : identity,
    loadManagedBootstrap: async () => ({}), managedBootstrapHasCapability: () => true,
    setManagedCanWrite: () => { applied++ }, setManagedInbox: () => { applied++ }, setCatalog: () => { applied++ },
    requireManagedSurfaceState: () => state,
    resolveManagedStorefront: () => ({ saved: true, inbox: { state, version: 1 } }),
    ...managedCatalogDependencies(state),
    recordCommerceStorefrontRequest: async () => state,
    commerceStorefrontRequests: () => [request], commerceStorefrontRequestEquals: () => true,
    saveManagedCommerceCommand: async () => { writes++; throw Error('unexpected write') },
  }
  const handler = runInNewContext(code + '\nrecordManagedBuyingRequest', context)
  if (changeAt === Infinity) await handler(request)
  else await assert.rejects(handler(request), /company account changed/)
  assert.equal(writes, 0)
  if (changeAt === 2) assert.equal(applied, 0, 'stale bootstrap must not update UI')
})

for (const loseResponse of [false, true]) for (const switchAccount of [false, true]) {
  test(`save response boundary: lost=${loseResponse}, account switched=${switchAccount}`, async () => {
    const identity = { workspaceId: 'a', userId: 'user-a' }
    const request = { id: 'ECR-test', idempotencyKey: 'key', createdAt: 'now', sourcePreviewDigest: 'digest' }
    const initial = createEmptyCommerce(), saved = createEmptyCommerce()
    const retainedRequests = new WeakMap([[initial, []], [saved, [request]]])
    let started = false, writes = 0, applied = 0
    const context = {
      setManagedCanDeliverReviews: () => {}, canDeliverCatalogReviews: () => false,
    managedIdentity: identity, managedCanWrite: true, crypto: { randomUUID: () => 'command' },
      currentManagedIdentity: async () => started && switchAccount ? { workspaceId: 'b', userId: 'user-b' } : identity,
      loadManagedBootstrap: async () => ({}), managedBootstrapHasCapability: () => true,
      setManagedCanWrite: () => { applied++ }, setManagedInbox: () => { applied++ }, setCatalog: () => { applied++ },
      requireManagedSurfaceState: () => started ? saved : initial,
      resolveManagedStorefront: (_identity, state) => ({ saved: true, inbox: { state, version: started ? 2 : 1 } }),
      ...managedCatalogDependencies(initial, saved),
      recordCommerceStorefrontRequest: async () => saved,
      commerceStorefrontRequests: state => retainedRequests.get(state) ?? [], commerceStorefrontRequestEquals: (a, b) => a === b,
      validateCommerceState,
      saveManagedCommerceCommand: async input => {
        assert.equal(input.identity, identity)
        started = true; writes++
        if (loseResponse) throw Error('response lost')
        return { command_id: input.commandId, surface: 'commerce', event_type: input.eventType,
          version: 2, idempotent_replay: false, state: saved }
      },
    }
    const handler = runInNewContext(code + '\nrecordManagedBuyingRequest', context)
    if (switchAccount) await assert.rejects(handler(request), /identity changed|response lost/)
    else await handler(request)
    assert.equal(writes, 1, 'recovery must read back rather than issue another command')
    assert.equal(applied, switchAccount ? 3 : 5, 'late old-account results must not replace active UI')
  })
}

for (const recovery of ['missing', 'different', 'duplicate']) {
  test(`lost response cannot confirm ${recovery} recovered request`, async () => {
    const identity = { workspaceId: 'a', userId: 'operator' }
    const request = { id: 'ECR-test', idempotencyKey: 'key', createdAt: 'now', sourcePreviewDigest: 'digest' }
    const initial = createEmptyCommerce(), recovered = createEmptyCommerce(), next = createEmptyCommerce()
    const retainedRequests = new WeakMap([
      [initial, []],
      [next, [request]],
      [recovered, recovery === 'missing' ? [] : recovery === 'duplicate' ? [request, request] : [{ ...request, sourcePreviewDigest: 'other' }]],
    ])
    let writes = 0, applied = 0
    const context = {
      setManagedCanDeliverReviews: () => {}, canDeliverCatalogReviews: () => false,
    managedIdentity: identity, managedCanWrite: true, crypto: { randomUUID: () => 'command' },
      currentManagedIdentity: async () => identity, loadManagedBootstrap: async () => ({}),
      managedBootstrapHasCapability: () => true,
      setManagedCanWrite: () => { applied++ }, setManagedInbox: () => { applied++ }, setCatalog: () => { applied++ },
      requireManagedSurfaceState: () => writes ? recovered : initial,
      resolveManagedStorefront: (_identity, state) => ({ saved: true, inbox: { state, version: writes ? 2 : 1 } }),
      ...managedCatalogDependencies(initial, recovered, next),
      recordCommerceStorefrontRequest: async () => next,
      commerceStorefrontRequests: state => retainedRequests.get(state) ?? [],
      commerceStorefrontRequestEquals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      saveManagedCommerceCommand: async () => { writes++; throw Error('response lost') },
    }
    const handler = runInNewContext(code + '\nrecordManagedBuyingRequest', context)
    await assert.rejects(handler(request), /response lost/)
    assert.equal(writes, 1, 'recovery must never resubmit a command')
    assert.equal(applied, 3, 'unconfirmed readback must not replace the initial UI')
  })
}

test('sample managed catalog is rejected before request recording', async () => {
  const identity = { workspaceId: 'company-a', userId: 'operator' }
  const state = createSeedCommerce()
  let recorded = false, writes = 0, inboxUpdates = 0, catalogUpdates = 0
  const context = {
    setManagedCanDeliverReviews: () => {}, canDeliverCatalogReviews: () => false,
    managedIdentity: identity, managedCanWrite: true, crypto: { randomUUID: () => 'command' },
    currentManagedIdentity: async () => identity,
    loadManagedBootstrap: async () => ({}), managedBootstrapHasCapability: () => true,
    setManagedCanWrite: () => {}, setManagedInbox: () => { inboxUpdates++ }, setCatalog: () => { catalogUpdates++ },
    requireManagedSurfaceState: () => state,
    resolveManagedStorefront: () => ({ saved: true, inbox: { state, version: 1 } }),
    classifyStorefrontCatalogSource: (candidate, origin) => {
      assert.equal(candidate, state)
      assert.equal(origin, 'managed')
      return classifyStorefrontCatalogSource(candidate, origin)
    },
    managedCatalogSnapshot: () => { throw new Error('sample catalog must fail before projection') },
    recordCommerceStorefrontRequest: async () => { recorded = true; return state },
    saveManagedCommerceCommand: async () => { writes++; throw new Error('unexpected write') },
  }
  const handler = runInNewContext(code + '\nrecordManagedBuyingRequest', context)
  await assert.rejects(handler({ id: 'ECR-sample', idempotencyKey: 'sample', createdAt: 'now', sourcePreviewDigest: 'digest' }), /Replace the sample products/)
  assert.equal(recorded, false)
  assert.equal(writes, 0)
  assert.equal(inboxUpdates, 0)
  assert.equal(catalogUpdates, 0)
})
