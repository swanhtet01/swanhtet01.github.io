import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyBusinessBrief, readBusinessBrief, saveBusinessBrief } from '../showroom/src/products/business-brief-draft.ts'
function memory() {
  const data = new Map()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}
const draft = { company: 'QA tea shop', description: 'Tea and snacks', reference: 'Public menu' }
test('reload restores a bounded draft without mixing products', () => {
  const storage = memory()
  assert.equal(saveBusinessBrief(storage, 'website', draft, 1000), true)
  assert.deepEqual(readBusinessBrief(storage, 'website', 2000), draft)
  assert.deepEqual(readBusinessBrief(storage, 'ecommerce', 2000), emptyBusinessBrief())
})
test('expired, future, malformed and oversized drafts are discarded', () => {
  for (const raw of ['{', JSON.stringify({...draft, savedAt: 5000}), JSON.stringify({...draft, savedAt: -3600000}), JSON.stringify({...draft, savedAt: 1000, company: 'a'.repeat(181)}), 'a'.repeat(24001)]) {
    const storage = memory()
    storage.setItem('supermega.business-brief.website.v1', raw)
    assert.deepEqual(readBusinessBrief(storage, 'website', 2000), emptyBusinessBrief())
    assert.equal(storage.data.size, 0)
  }
})
test('clearing all fields removes retained text', () => {
  const storage = memory()
  saveBusinessBrief(storage, 'website', draft)
  saveBusinessBrief(storage, 'website', emptyBusinessBrief())
  assert.equal(storage.data.size, 0)
})
test('blocked storage returns a usable empty draft and reports save failure', () => {
  const storage = { getItem() {throw Error('blocked')}, setItem() {throw Error('blocked')}, removeItem() {throw Error('blocked')} }
  assert.deepEqual(readBusinessBrief(storage, 'website'), emptyBusinessBrief())
  assert.equal(saveBusinessBrief(storage, 'website', draft), false)
})
