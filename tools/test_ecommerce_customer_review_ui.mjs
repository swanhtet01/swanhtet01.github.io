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
function harness({ identity = { actor: 'customer' }, changed = false, denied = false } = {}) {
  const states = [], effects = [], listeners = new Map()
  let index = 0, reads = 0, calls = 0
  const exports = {}
  vm.runInNewContext(compiled + '; exports.Content = CatalogReviewContent;', { exports,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
      setTimeout: () => 1, clearTimeout: () => {} },
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
          if (denied) throw Error('denied'); return review
        },
      }
      return require(name)
    },
  })
  const render = () => { index = 0; effects.length = 0; return renderToStaticMarkup(React.createElement(exports.Content, { reviewId: id })) }
  return { states, effects, listeners, render, calls: () => calls }
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
