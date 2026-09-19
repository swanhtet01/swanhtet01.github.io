import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RETIRED_PRODUCT_PREVIEW_POLICY as policy, RETIRED_PRODUCT_CASES as cases,
  RETIRED_STORAGE_KEYS as keys, validateRetiredProductObservation as validate } from './retired_product_preview_policy.mjs'

function fixture(spec = cases[0]) {
  const retainedBefore = Object.fromEntries(keys.map(key => [key, `synthetic-preserved:${key}`]))
  const state = { origin: 'https://isolated.example', path: '/?choose=1', hash: '',
    viewportWidth: spec.width, viewportHeight: spec.height,
    launcherLinks: [{ name: 'Shop', href: '/shop/' }, { name: 'Ecommerce', href: '/ecommerce/' }, { name: 'Website', href: '/website/' }],
    retiredToolVisible: false, retiredActionVisible: false, retained: { ...retainedBefore } }
  return { policy, caseId: spec.id, origin: state.origin, before: structuredClone(state), after: structuredClone(state), retainedBefore }
}
test('all seven retired entry routes have distinct desktop/mobile cases', () => {
  assert.equal(cases.length, 14)
  assert.equal(new Set(cases.map(item => item.id)).size, 14)
  for (const spec of cases) assert.equal(validate(fixture(spec)).retainedDataUnchanged, true)
})
test('old policy and unknown cases cannot be relabelled', () => {
  assert.throws(() => validate({ ...fixture(), policy: 'old-plant-rendered' }), /policy_mismatch/)
  assert.throws(() => validate({ ...fixture(), caseId: 'plant_desktop' }), /case_unknown/)
})
test('both screenshot-adjacent observations must preserve location, chooser and data', () => {
  for (const phase of ['before', 'after']) {
    for (const mutate of [s => { s.path = '/plant/' }, s => { s.origin = 'https://production.example' },
      s => { s.hash = '#plant' }, s => { s.viewportWidth = 1 },
      s => { s.launcherLinks.push({ name: 'Plant', href: '/plant/' }) },
      s => { s.retiredToolVisible = true }, s => { delete s.retiredActionVisible },
      s => { s.retained[keys[0]] = null }, s => { delete s.retained[keys[1]] }]) {
      const input = fixture(); mutate(input[phase]); assert.throws(() => validate(input), /retired_product_preview_/)
    }
  }
})
test('absent storage remains absent and evidence never includes raw records', () => {
  const input = fixture()
  for (const key of keys) input.retainedBefore[key] = input.before.retained[key] = input.after.retained[key] = null
  const result = validate(input)
  assert.equal(result.retainedDataUnchanged, true)
  assert.equal(JSON.stringify(result).includes('synthetic-preserved'), false)
  delete input.retainedBefore[keys[0]]
  assert.throws(() => validate(input), /baseline_missing/)
})
