import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { seedScript, renderedStateScript } from './verify_app_entry_rendered.mjs'
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
test('exact generated seed executes all retained keys and is repeat-call idempotent', () => {
  const backing = new Map(); let clears = 0
  const localStorage = { clear() { clears++; backing.clear() }, setItem(k, v) { backing.set(k, String(v)) }, getItem(k) { return backing.get(k) ?? null } }
  const session = new Map()
  const context = { localStorage, sessionStorage: { getItem: k => session.get(k), setItem: (k, v) => session.set(k, v) }, window: {} }
  const retained = Object.fromEntries(keys.map(k => [k, JSON.stringify({ synthetic: 'quote" newline\n backslash\\', key: k })]))
  const script = seedScript({ retained })
  runInNewContext(script, context)
  for (const key of keys) assert.equal(localStorage.getItem(key), retained[key])
  localStorage.setItem(keys[0], 'subsequent-user-change')
  runInNewContext(script, context)
  assert.equal(clears, 1)
  assert.equal(localStorage.getItem(keys[0]), 'subsequent-user-change')
  assert.equal(context.window.__supermegaSeedError, undefined)
})
test('exact generated observation script detects rendered retired headings and actions', () => {
  let headings = []; let actions = []
  const element = (text, href = '', visible = true) => ({ textContent: text,
    getClientRects: () => visible ? [1] : [], getAttribute: () => href })
  const context = { location: { origin: 'https://isolated.example', pathname: '/', search: '?choose=1', hash: '' },
    window: { innerWidth: 1280, innerHeight: 900 }, localStorage: { getItem: () => null },
    getComputedStyle: () => ({ visibility: 'visible' }), document: { body: { innerText: 'Shop Website Ecommerce' },
      documentElement: { scrollWidth: 1280 }, querySelector: () => null,
      querySelectorAll: selector => selector === 'a,button' ? actions : selector.startsWith('h1,') ? headings : [] } }
  const observe = () => runInNewContext(renderedStateScript(true), context)
  assert.equal(observe().retiredActionVisible, false)
  for (const href of ['/plant/', '/operations/production/', '/?demo=factory', '/settings/?product=production']) {
    actions = [element('Open', href)]; assert.equal(observe().retiredActionVisible, true, href)
  }
  actions = [element('Open Plant')]; assert.equal(observe().retiredActionVisible, true)
  actions = [element('Open Plant', '/plant/', false)]; assert.equal(observe().retiredActionVisible, false)
  headings = [element('Plant')]; assert.equal(observe().retiredToolVisible, true)
  assert.equal(Object.keys(observe().retained).length, 4)
  assert.equal(Object.hasOwn(runInNewContext(renderedStateScript(false), context), 'retained'), false)
})
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
