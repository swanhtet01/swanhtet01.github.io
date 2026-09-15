import test from 'node:test'
import assert from 'node:assert/strict'
import { websiteDraftDifference } from '../showroom/src/products/website/website-draft-difference.ts'

const current = { siteName: 'Same sample', pages: [{ id: 'home', internalName: 'Home', hero: { headline: 'Before' } }] }
test('same-name drafts identify changed pages without modifying either version', () => {
  const draft = structuredClone(current)
  draft.pages[0].hero.headline = 'After'
  const before = JSON.stringify([current, draft])
  assert.equal(websiteDraftDifference(current, draft), '1 changed or added page: Home')
  assert.equal(JSON.stringify([current, draft]), before)
})
test('site rename and removed pages remain visible', () => {
  assert.equal(websiteDraftDifference(current, { siteName: 'Renamed', pages: [] }), 'Site name changed · 1 page removed')
})
test('identical pages do not imply the whole draft is identical', () => {
  assert.match(websiteDraftDifference(current, structuredClone(current)), /other review or navigation changes/)
})
