import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createReviewAccessBoundary } from '../showroom/src/products/website/customer-review-access.ts'
import * as recovery from '../showroom/src/products/ecommerce/pending-catalog-decision.ts'
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
function harness({ identity = { actor: 'customer', userId: 'customer', workspaceId: 'company' }, changed = false, denied = false, wait = null, expiresAt = review.expiresAt, decisionKind = null, decisionWait = null, invalidDecision = false, uncertainWrite = false, writeWait = null, storage = new Map(), retainedDecision = null, transformSaved = value => value, decisionPages = null } = {}) {
  const states = [], effects = [], listeners = new Map(), timers = new Map()
  let index = 0, reads = 0, calls = 0, timerId = 0, savedItem = retainedDecision
  const writes = []
  const exports = {}
  vm.runInNewContext(compiled + '; exports.Content = CatalogReviewContent;', { exports, crypto: globalThis.crypto,
    window: { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
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
      if (name === './pending-catalog-decision') return recovery
      if (name === './PreparedCatalog') return { PreparedCatalog: () => React.createElement('section', null, 'Synthetic catalog') }
      if (name === '../../core/managed-trial') return {
        currentManagedIdentity: async () => ++reads > 1 && changed ? { actor: 'other' } : identity,
        sameManagedIdentity: (a, b) => a.actor === b.actor,
        loadManagedEcommerceDecisions: async (_reviewId, _identity, after) => {
          if (decisionPages) return decisionPages(after)
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
          savedItem = transformSaved(savedItem)
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


test('lost write response plus identity change clears private content without offering retry', async () => {
  let release; const writeWait = new Promise(resolve => { release = resolve })
  const h = harness({ writeWait, uncertainWrite: true }); h.render(); const cleanup = h.effects[0](); await flush()
  h.control('Accept catalog').props.onClick(); await flush(); assert.equal(h.writes.length, 1)
  h.changeIdentity(); release(); await flush()
  assert.doesNotMatch(h.render(), /Synthetic catalog|Catalog accepted|Retry response/)
  assert.match(h.render(), /Your access changed/); cleanup()
})


test('reload recovers the exact uncertain response before server commit', async () => {
  const storage = new Map()
  const h = harness({ uncertainWrite: true, storage }); h.render(); const cleanup = h.effects[0](); await flush()
  h.control('Request changes').props.onClick(); h.field().props.onChange({ target: { value: 'Change price' } })
  h.form().props.onSubmit({ preventDefault() {} }); await flush(); cleanup()
  assert.equal(storage.size, 1)
  const reopened = harness({ storage }); reopened.render(); const close = reopened.effects[0](); await flush()
  assert.match(reopened.render(), /Retry response/); assert.doesNotMatch(reopened.render(), /Accept catalog/)
  reopened.control('Retry response').props.onClick(); await flush()
  assert.deepEqual(reopened.writes[0], h.writes[0]); assert.equal(storage.size, 0)
  assert.match(reopened.render(), /Changes requested/); close()
})


test('recovery is actor/workspace scoped and malformed storage prevents a fresh submission', async () => {
  const storage = new Map()
  const h = harness({ uncertainWrite: true, storage }); h.render(); const cleanup = h.effects[0](); await flush()
  h.control('Accept catalog').props.onClick(); await flush(); cleanup()
  assert.equal(storage.size, 1)
  for (const identity of [{ actor: 'other', userId: 'other', workspaceId: 'company' },
                          { actor: 'customer', userId: 'customer', workspaceId: 'other-company' }]) {
    const other = harness({ storage, identity }); other.render(); const close = other.effects[0](); await flush()
    assert.doesNotMatch(other.render(), /Retry response/); close()
  }
  storage.set([...storage.keys()][0], '{broken')
  const broken = harness({ storage }); broken.render(); const close = broken.effects[0](); await flush()
  assert.doesNotMatch(broken.render(), /Synthetic catalog|Accept catalog|Retry response/)
  assert.equal(broken.writes.length, 0); close()
})


test('reload after server commit confirms retained command without sending again', async () => {
  for (const kind of ['acceptance', 'feedback']) {
    const storage = new Map()
    const h = harness({ storage, uncertainWrite: true }); h.render(); const cleanup = h.effects[0](); await flush()
    if (kind === 'acceptance') h.control('Accept catalog').props.onClick()
    else {
      h.control('Request changes').props.onClick(); h.field().props.onChange({ target: { value: 'Change price' } })
      h.form().props.onSubmit({ preventDefault() {} })
    }
    await flush(); cleanup()
    const command = h.writes[0]
    const reopened = harness({ storage, retainedDecision: { commandId: command.commandId, kind,
      note: command.note ?? null, createdAt: '2026-01-01T00:00:00Z' } })
    reopened.render(); const close = reopened.effects[0](); await flush()
    assert.equal(reopened.writes.length, 0); assert.equal(storage.size, 0)
    assert.match(reopened.render(), kind === 'acceptance' ? /Catalog accepted/ : /Changes requested/)
    assert.doesNotMatch(reopened.render(), /Retry response/); close()
  }
})

test('unavailable tab storage prevents a decision from being sent', async () => {
  for (const mode of ['throws', 'drops']) {
    const storage = new Map()
    storage.set = () => { if (mode === 'throws') throw Error('quota'); return storage }
    const h = harness({ storage }); h.render(); const close = h.effects[0](); await flush()
    h.control('Accept catalog').props.onClick(); await flush()
    assert.equal(h.writes.length, 0); assert.match(h.render(), /Retry response/); close()
  }
})

test('expired or altered recovery records cannot be used to construct a retry', () => {
  const identity = { userId: 'customer', workspaceId: 'company', email: '' }
  const payload = { reviewId: id, commandId: id, previewDigest: review.previewDigest, note: 'Change price' }
  const storage = new Map()
  const api = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  recovery.retainCatalogDecision(api, identity, review, payload)
  const key = [...storage.keys()][0], original = JSON.parse(storage.get(key))
  for (const change of [v => v.expiresAt = '2000-01-01T00:00:00Z', v => v.payload.reviewId = 'other',
    v => v.payload.previewDigest = 'wrong', v => v.payload.commandId = '../bad', v => v.payload.note = '',
    v => v.payload.extra = true, v => v.payload.note = 'x'.repeat(2001)]) {
    const value = structuredClone(original); change(value); storage.set(key, JSON.stringify(value))
    assert.throws(() => recovery.recoverCatalogDecision(api, identity, review))
  }
})


test('verified expiry removes the pending tab note and never enables a replacement write', async () => {
  const storage = new Map()
  const h = harness({ storage, uncertainWrite: true }); h.render(); const cleanup = h.effects[0](); await flush()
  h.control('Request changes').props.onClick(); h.field().props.onChange({ target: { value: 'Private synthetic note' } })
  h.form().props.onSubmit({ preventDefault() {} }); await flush(); assert.equal(storage.size, 1)
  h.render(); const stopTimer = h.effects[1](); [...h.timers.values()][0].callback()
  assert.equal(storage.size, 0)
  assert.doesNotMatch(h.render(), /Synthetic catalog|Retry response|Accept catalog|Private synthetic note/)
  assert.match(h.render(), /review expired/); assert.equal(h.writes.length, 1)
  stopTimer(); cleanup()
})


test('fresh instance discards only its expired recovery record even when review access is denied', async () => {
  const scopedKey = 'supermega.catalog-response:' + JSON.stringify(['customer', 'company', id])
  const expired = JSON.stringify({ expiresAt: '2000-01-01T00:00:00Z', payload: { reviewId: id, commandId: id, previewDigest: review.previewDigest, note: 'Private synthetic note' } })
  const storage = new Map([[scopedKey, expired], [scopedKey + ':other', expired]])
  const h = harness({ storage, denied: true }); h.render(); const close = h.effects[0](); await flush()
  assert.equal(storage.has(scopedKey), false); assert.equal(storage.get(scopedKey + ':other'), expired)
  assert.equal(h.writes.length, 0); assert.doesNotMatch(h.render(), /Synthetic catalog|Retry response|Accept catalog/); close()
})

test('cleanup preserves unexpired, invalid-date and mismatched records; storage failure stays closed', async () => {
  const scopedKey = 'supermega.catalog-response:' + JSON.stringify(['customer', 'company', id])
  for (const [expiresAt, reviewId, failDelete] of [[review.expiresAt, id, false], ['invalid', id, false], ['2000-01-01T00:00:00Z', 'other', false], ['2000-01-01T00:00:00Z', id, true]]) {
    const raw = JSON.stringify({ expiresAt, payload: { reviewId, note: 'Private synthetic note' } })
    const storage = new Map([[scopedKey, raw]])
    if (failDelete) storage.delete = () => { throw Error('storage unavailable') }
    const h = harness({ storage, denied: true }); h.render(); const close = h.effects[0](); await flush()
    assert.equal(storage.get(scopedKey), raw); assert.equal(h.writes.length, 0)
    assert.doesNotMatch(h.render(), /Synthetic catalog|Retry response|Accept catalog/); close()
  }
})


test('successful send cannot confirm missing or mismatched response readback', async () => {
  for (const transformSaved of [
    () => null,
    value => ({ ...value, commandId: id }),
    value => ({ ...value, kind: 'acceptance', note: null }),
    value => ({ ...value, note: 'Different feedback' }),
  ]) {
    const storage = new Map()
    const h = harness({ storage, transformSaved })
    h.render(); const cleanup = h.effects[0](); await flush()
    h.control('Request changes').props.onClick()
    h.field().props.onChange({ target: { value: 'Change price' } })
    h.form().props.onSubmit({ preventDefault() {} }); await flush()
    assert.equal(h.writes.length, 1)
    assert.match(h.render(), /Response unconfirmed/)
    assert.doesNotMatch(h.render(), /Catalog accepted|Changes requested/)
    assert.equal(storage.size, 1)
    h.control('Retry response').props.onClick(); await flush()
    assert.equal(h.writes.length, 2)
    assert.deepEqual(h.writes[1], h.writes[0])
    assert.match(h.render(), /Response unconfirmed/)
    cleanup()
  }
})


test('paginated recovery confirms only the exact response under unchanged access', async () => {
  for (const mode of ['matching', 'missing', 'wrong-note', 'invalid-cursor', 'identity-change']) {
  const storage = new Map(), identity = { userId: 'customer', workspaceId: 'company' }
  const commandId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  recovery.retainCatalogDecision({ setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) }, identity, review,
    { reviewId: id, commandId, previewDigest: review.previewDigest, note: 'Change price' })
  const items = Array.from({ length: 50 }, (_, n) => ({ commandId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'feedback', note: 'Earlier feedback', createdAt: '2026-01-01T00:00:00Z' }))
  const cursor = items.at(-1).commandId, reads = []
  const h = harness({ storage, decisionPages: after => {
    reads.push(after)
    if (after && mode === 'identity-change') h.changeIdentity()
    return { reviewId: id, contentRevision: 1, previewDigest: review.previewDigest, sourceVersion: 1,
      publicationAuthorized: false, deploymentAuthorized: false, nextAfter: after ? null : mode === 'invalid-cursor' ? id : cursor,
      decisions: after ? mode === 'missing' ? [] : [{ commandId, kind: 'feedback', note: mode === 'wrong-note' ? 'Other feedback' : 'Change price', createdAt: '2026-01-01T00:00:00Z' }] : items }
  } })
  h.render(); const close = h.effects[0](); await flush()
  assert.deepEqual(reads, mode === 'invalid-cursor' ? [undefined] : [undefined, cursor])
  assert.equal(h.writes.length, 0)
  assert.equal(storage.size, mode === 'matching' ? 0 : 1)
  if (mode === 'matching') assert.match(h.render(), /Changes requested/)
  else assert.doesNotMatch(h.render(), /Changes requested|Catalog accepted/)
  close()
  }
})
