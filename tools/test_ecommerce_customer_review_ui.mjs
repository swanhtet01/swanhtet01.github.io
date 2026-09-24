import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createReviewAccessBoundary } from '../showroom/src/products/website/customer-review-access.ts'
import { customerEcommerceReviewLoginPath } from '../showroom/src/core/account-routes.ts'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript'), React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceCustomerReview.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const id = '11111111-1111-4111-8111-111111111111'
const review = { preview: { name: 'Synthetic catalog' }, expiresAt: '2099-01-01T00:00:00Z' }
function harness({ identity = { actor: 'customer' }, changed = false, denied = false, wait = null, expiresAt = review.expiresAt } = {}) {
  const states = [], effects = [], listeners = new Map(), timers = new Map()
  let index = 0, reads = 0, calls = 0, timerId = 0
  const exports = {}
  vm.runInNewContext(compiled + '; exports.Content = CatalogReviewContent;', { exports,
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
      if (name === './prepared-catalog-review') return { verifyPreparedCatalogReview: async value => value }
      if (name === './PreparedCatalog') return { PreparedCatalog: () => React.createElement('section', null, 'Synthetic catalog') }
      if (name === '../../core/managed-trial') return {
        currentManagedIdentity: async () => ++reads > 1 && changed ? { actor: 'other' } : identity,
        sameManagedIdentity: (a, b) => a.actor === b.actor,
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
  return { states, effects, listeners, timers, render, calls: () => calls }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
test('assigned preview appears only after identity recheck, then clears synchronously on focus', async () => {
  const h = harness(); assert.match(h.render(), /Opening/)
  const cleanup = h.effects[0](); await flush()
  assert.match(h.render(), /Synthetic catalog/)
  assert.doesNotMatch(h.render(), /<button|<a /)
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
