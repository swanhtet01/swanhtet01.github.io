import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync('showroom/src/products/ecommerce/EcommerceProduct.tsx', 'utf8').replace(/\r\n/g, '\n')
const start = source.indexOf('  useEffect(() => {\n    let current = true\n    void currentManagedIdentity()')
const end = source.indexOf('  }, [initialState.catalog.items])', start)
assert.ok(start > 0 && end > start)
const effect = source.slice(start, end) + '  }, []);'
const tick = () => new Promise(resolve => setImmediate(resolve))
for (const mode of ['same', 'other-user', 'other-workspace', 'signed-out', 'unmount-recheck']) {
  const calls = []
  let cleanup, releaseBootstrap, releaseIdentity
  let identityCalls = 0
  const original = { workspaceId: 'company-a', userId: 'user-a' }
  const context = {
    useEffect: callback => { cleanup = callback() },
    currentManagedIdentity: async () => {
      if (++identityCalls === 1) return original
      if (mode === 'unmount-recheck') return new Promise(resolve => { releaseIdentity = resolve })
      return mode === 'same' ? original : mode === 'signed-out' ? null
        : { ...original, [mode === 'other-user' ? 'userId' : 'workspaceId']: 'changed' }
    },
    loadManagedBootstrap: () => new Promise(resolve => { releaseBootstrap = resolve }),
    managedBootstrapHasCapability: () => true,
    requireManagedSurfaceState: () => ({}),
    resolveManagedStorefront: () => ({ saved: {}, fields: {storeName:'QA', summary:'QA', selectedSkus:[], merchandising:null}, inbox:{state:{items:['private-old-catalog']}} }),
  }
  for (const name of new Set(effect.match(/\bset[A-Z]\w+/g))) context[name] = value => calls.push([name, value])
  vm.runInNewContext(effect, context)
  await tick()
  releaseBootstrap({})
  await tick()
  if (mode === 'unmount-recheck') {
    assert.ok(releaseIdentity, 'must recheck identity after bootstrap')
    cleanup(); const count = calls.length; releaseIdentity(original); await tick()
    assert.equal(calls.length, count, 'unmounted effect must not apply the recheck')
  } else {
    const applied = calls.some(([name, value]) => name === 'setCatalog' && value.source === 'managed-shop')
    assert.equal(applied, mode === 'same', mode)
    if (mode !== 'same') assert.ok(calls.some(([name, value]) => name === 'setManagedCanWrite' && value === false))
    cleanup()
  }
}
console.log('PASS: actual Ecommerce hydration identity and unmount checks (5 cases)')
