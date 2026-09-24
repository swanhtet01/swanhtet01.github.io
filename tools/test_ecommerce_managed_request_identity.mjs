import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function recordManagedBuyingRequest(')
const end = source.indexOf('\n  function openShopDraft', start)
assert.ok(start >= 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts', target: 'es2022' }).code
for (const changeAt of [2, 3, Infinity]) test(`account switch at identity read ${changeAt} rejects stale managed request`, async () => {
  const identity = { workspaceId: 'company-a', userId: 'user-a' }
  const request = { id: 'ECR-test', idempotencyKey: 'key', createdAt: 'now', sourcePreviewDigest: 'digest' }
  const state = {}
  let reads = 0, applied = 0, writes = 0
  const context = {
    managedIdentity: identity, managedCanWrite: true, crypto: { randomUUID: () => 'id' },
    currentManagedIdentity: async () => ++reads >= changeAt ? { workspaceId: 'company-b', userId: 'user-b' } : identity,
    loadManagedBootstrap: async () => ({}), managedBootstrapHasCapability: () => true,
    setManagedCanWrite: () => { applied++ }, setManagedInbox: () => { applied++ }, setCatalog: () => { applied++ },
    requireManagedSurfaceState: () => state,
    resolveManagedStorefront: () => ({ saved: true, inbox: { state, version: 1 } }),
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
