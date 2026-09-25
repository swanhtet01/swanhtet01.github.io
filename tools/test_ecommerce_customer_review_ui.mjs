import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createReviewAccessBoundary } from '../showroom/src/products/website/customer-review-access.ts'
import { verifyCatalogDecisionPage } from '../showroom/src/products/ecommerce/prepared-catalog-review.ts'
import { customerEcommerceReviewLoginPath } from '../showroom/src/core/account-routes.ts'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript'), React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceCustomerReview.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const id = '11111111-1111-4111-8111-111111111111'
const review = { reviewId: id, contentRevision: 1, previewDigest: 'sha256:' + 'a'.repeat(64), preview: { name: 'Synthetic catalog' }, expiresAt: '2099-01-01T00:00:00Z' }
function harness({ identity = { actor: 'customer' }, changed = false, denied = false, wait = null, expiresAt = review.expiresAt, decisionKind = null, decisionWait = null, invalidDecision = false, uncertainWrite = false, writeWait = null } = {}) {
  const states = [], effects = [], listeners = new Map(), timers = new Map()
  let index = 0, reads = 0, calls = 0, timerId = 0, savedItem = null
  const writes = []
  const exports = {}
  vm.runInNewContext(compiled + '; exports.Content = CatalogReviewContent;', { exports, crypto: globalThis.crypto,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id }, clearTimeout: id => timers.delete(id) },
    require: name => {
      if (name === 'react') return { useState: initial => {
        const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial
        return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value }]
      }, useEffect: effect => effects.push(effect) }
      if (name === 'react-router') return { Link: p => React.createElement('a', { href: p.to }, p.children) }
      if (name === '../../core/account-routes') return { customerEcommerceReviewLoginPath }
      if (name === '../website/customer-review-access') return { createReviewAccessBoundary }
      if (name === './prepared-catalog-review') return { verifyPreparedCatalogReview: async value => value, verifyCatalogDecisionPage }
      if (name === './PreparedCatalog') return { PreparedCatalog: () => React.createElement('section', null, 'Synthetic catalog') }
      if (name === '../../core/managed-trial') return {
        currentManagedIdentity: async () => ++reads > 1 && changed ? { actor: 'other' } : identity,
        sameManagedIdentity: (a, b) => a.actor === b.actor,
        loadManagedEcommerceDecisions: async () => {
          if (decisionWait) await decisionWait
          return { reviewId: invalidDecision ? 'other' : id, contentRevision: 1, previewDigest: review.previewDigest,
            sourceVersion: 1, nextAfter: null, publicationAuthorized: false, deploymentAuthorized: false,
            decisions: savedItem ? [savedItem] : decisionKind ? [{ commandId: id, kind: decisionKind, note: decisionKind === 'feedback' ? 'Change price' : null,
              createdAt: '2026-01-01T00:00:00Z' }] : [] }
        },
        sendManagedEcommerceDecision: async payload => {
          writes.push(structuredClone(payload))
          if (writeWait) await writeWait
          savedItem = { commandId: payload.commandId, kind: payload.decision ? 'acceptance' : 'feedback',
            note: payload.note ?? null, createdAt: '2026-01-01T00:00:00Z' }
          if (uncertainWrite && writes.length === 1) throw Error('response lost')
          return { persisted: true }
        },
        loadManagedEcommerceReview: async (reviewId, actor) => {
          calls++; assert.equal(reviewId, id); assert.equal(actor, identity)
          if (wait) await wait
          if (denied) throw Error('denied'); return { ...review, expiresAt }
        },
      }
      return require(name)
    },
  })
  const render = () => { index = 0; effects.length = 0; return renderToStaticMarkup(React.createElement(exports.Content, { reviewId: id })) }
  const tree = () => { index = 0; effects.length = 0; return exports.Content({ reviewId: id }) }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
    return null
  }
  return { states, effects, listeners, timers, render, writes, changeIdentity: () => { identity = { actor: 'other' } }, calls: () => calls,
    control: label => find(tree(), node => node.type === 'button' && node.props.children === label),
    field: () => find(tree(), node => node.type === 'textarea'),
    form: () => find(tree(), node => node.type === 'form') }

}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('assigned preview appears only after identity recheck, then clears synchronously on focus', async () => {
  const h = harness(); assert.match(h.render(), /Opening/)
  const cleanup = h.effects[0](); await flush()
  assert.match(h.render(), /Synthetic catalog/)
  assert.match(h.render(), /Accept catalog|Request changes/)
  h.listeners.get('focus')(); assert.equal(h.states[0], null)
  cleanup(); assert.equal(h.listeners.size, 0)
})
test('signed-out, denied and changed identities cannot retain a catalog', async () => {
  for (const options of [{ identity: null }, { denied: true }, { changed: true }]) {
    const h = harness(options); h.render(); h.effects[0](); await flush()
    assert.equal(h.states[0], null)
    const html = h.render(); assert.doesNotMatch(html, /Synthetic catalog/)
    assert.match(html, /product=ecommerce&amp;review=/)
    if (options.identity === null) assert.equal(h.calls(), 0)
  }
})
test('unmounted requests cannot reveal late content', async () => {
  const h = harness(); h.render(); const cleanup = h.effects[0](); cleanup(); await flush()
  assert.equal(h.states[0], null)
})


test('delayed catalog response cannot survive focus invalidation or unmount', async () => {
  for (const change of ['focus', 'storage', 'unmount']) {
    let release; const wait = new Promise(resolve => { release = resolve })
    const h = harness({ wait }); h.render(); const cleanup = h.effects[0](); await flush()
    assert.equal(h.calls(), 1)
    if (change === 'unmount') cleanup(); else h.listeners.get(change)()
    release(); await flush()
    assert.equal(h.states[0], null, change)
    assert.doesNotMatch(h.render(), /Synthetic catalog/)
    if (change !== 'unmount') cleanup()
  }
})

test('expiry clears visible catalog and timer cleanup prevents retained callbacks', async () => {
  const h = harness({ expiresAt: new Date(Date.now() + 60000).toISOString() })
  h.render(); const cleanup = h.effects[0](); await flush(); h.render()
  const cancelTimer = h.effects[1](); assert.equal(h.timers.size, 1)
  const timer = [...h.timers.values()][0]
  assert.ok(timer.delay > 0 && timer.delay <= 60000)
  timer.callback(); assert.equal(h.states[0], null)
  assert.match(h.render(), /review expired/); assert.doesNotMatch(h.render(), /Synthetic catalog/)
  cancelTimer(); assert.equal(h.timers.size, 0); cleanup()
})

test('a review expiring during its response never becomes visible', async () => {
  const h = harness({ expiresAt: new Date(Date.now() - 1).toISOString() })
  h.render(); const cleanup = h.effects[0](); await flush()
  assert.equal(h.states[0], null); assert.equal(h.states[2], false)
  assert.doesNotMatch(h.render(), /Synthetic catalog/); cleanup()
})


test('saved acceptance and feedback reopen as short non-publication status', async () => {
  for (const decisionKind of ['acceptance', 'feedback']) {
    const h = harness({ decisionKind }); h.render(); const cleanup = h.effects[0](); await flush()
    assert.match(h.render(), decisionKind === 'acceptance' ? /Catalog accepted/ : /Changes requested/)
    assert.doesNotMatch(h.render(), /<button|<a /)
    h.listeners.get('storage')(); assert.doesNotMatch(h.render(), /Catalog accepted|Changes requested/)
    cleanup()
  }
})

test('invalid or late decision pages cannot expose a review or saved status', async () => {
  const invalid = harness({ invalidDecision: true }); invalid.render(); invalid.effects[0](); await flush()
  assert.doesNotMatch(invalid.render(), /Synthetic catalog|Catalog accepted/)
  let release; const decisionWait = new Promise(resolve => { release = resolve })
  const h = harness({ decisionWait, decisionKind: 'acceptance' }); h.render(); const cleanup = h.effects[0](); await flush()
  h.listeners.get('focus')(); release(); await flush()
  assert.doesNotMatch(h.render(), /Synthetic catalog|Catalog accepted/); cleanup()
})


test('acceptance blocks duplicate clicks and waits for verified saved readback', async () => {
  let release; const writeWait = new Promise(resolve => { release = resolve })
  const h = harness({ writeWait }); h.render(); const cleanup = h.effects[0](); await flush()
  const click = h.control('Accept catalog').props.onClick
  click(); click(); await flush(); assert.equal(h.writes.length, 1)
  assert.match(h.render(), /Saving/); assert.doesNotMatch(h.render(), /Catalog accepted/)
  release(); await flush(); assert.match(h.render(), /Catalog accepted/); cleanup()
})

test('uncertain feedback retry preserves command ID and note', async () => {
  const h = harness({ uncertainWrite: true }); h.render(); const cleanup = h.effects[0](); await flush()
  h.control('Request changes').props.onClick()
  h.field().props.onChange({ target: { value: 'Change price' } })
  h.form().props.onSubmit({ preventDefault() {} }); await flush()
  assert.match(h.render(), /Retry response/); assert.doesNotMatch(h.render(), /Accept catalog/)
  h.control('Retry response').props.onClick(); await flush()
  assert.equal(h.writes.length, 2); assert.deepEqual(h.writes[0], h.writes[1])
  assert.equal(h.writes[0].note, 'Change price'); assert.match(h.render(), /Changes requested/); cleanup()
})


test('pending writes cannot restore content after focus, storage, expiry or unmount', async () => {
  for (const event of ['focus', 'storage', 'expiry', 'unmount']) {
    let release; const writeWait = new Promise(resolve => { release = resolve })
    const h = harness({ writeWait }); h.render(); const cleanup = h.effects[0](); await flush()
    h.render(); const stopTimer = h.effects[1]()
    h.control('Accept catalog').props.onClick(); await flush(); assert.equal(h.writes.length, 1)
    if (event === 'unmount') cleanup()
    else if (event === 'expiry') [...h.timers.values()][0].callback()
    else h.listeners.get(event)()
    release(); await flush()
    assert.doesNotMatch(h.render(), /Catalog accepted/)
    if (event !== 'unmount') assert.doesNotMatch(h.render(), /Synthetic catalog/)
    stopTimer(); if (event !== 'unmount') cleanup()
  }
})

test('identity change before or during submission clears the private review', async () => {
  for (const phase of ['before', 'during']) {
    let release; const writeWait = new Promise(resolve => { release = resolve })
    const h = harness({ writeWait }); h.render(); const cleanup = h.effects[0](); await flush()
    if (phase === 'before') h.changeIdentity()
    h.control('Accept catalog').props.onClick(); await flush()
    if (phase === 'during') h.changeIdentity()
    release(); await flush()
    assert.equal(h.writes.length, phase === 'before' ? 0 : 1)
    assert.doesNotMatch(h.render(), /Synthetic catalog|Catalog accepted/)
    cleanup()
  }
})
