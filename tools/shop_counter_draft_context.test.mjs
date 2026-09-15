import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shopCounterDraftContext } from '../showroom/src/core/shop-counter-draft-context.ts'

test('only confirmed local mode can read and write the legacy local basket', () => {
  assert.deepEqual(shopCounterDraftContext(true, null), { key: 'local', persistLocalDraft: true })
  assert.equal(shopCounterDraftContext(false, null).persistLocalDraft, false)
  assert.equal(shopCounterDraftContext(true, { workspaceId: 'A', userId: 'one' }).persistLocalDraft, false)
})
test('checking, local, company and user switches reset in-memory basket identity', () => {
  const contexts = [shopCounterDraftContext(false, null), shopCounterDraftContext(true, null),
    shopCounterDraftContext(false, { workspaceId: 'A', userId: 'one' }),
    shopCounterDraftContext(false, { workspaceId: 'B', userId: 'one' }),
    shopCounterDraftContext(false, { workspaceId: 'B', userId: 'two' })]
  assert.equal(new Set(contexts.map(c => c.key)).size, contexts.length)
})
test('Counter applies policy before recovery or persistence, with synchronous keyed remount', () => {
  const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  assert.ok(source.includes('useState(() => persistLocalDraft ? readShopCounterDraft() : null)'))
  assert.match(source, /useEffect\(\(\) => \{\s+if \(!persistLocalDraft\) return\s+try \{\s+if \(liveCartJson/)
  assert.ok(source.includes('<ShopCounter key={counterDraftContext.key} persistLocalDraft={counterDraftContext.persistLocalDraft}'))
  assert.ok(source.includes('shopCounterDraftContext(confirmedLocalShop, managedIdentity)'))
})
