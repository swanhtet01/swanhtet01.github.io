import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { installShopSaleFocus, SHOP_SALE_OVERLAY_QUERY } from '../showroom/src/core/shop-sale-focus.ts'

function fixture(narrow = true) {
  const handlers = new Map()
  const media = { matches: narrow, addEventListener: (_, fn) => { media.changed = fn }, removeEventListener: () => { media.changed = null } }
  const doc = {
    nativeModal: false,
    defaultView: { matchMedia: query => { assert.equal(query, SHOP_SALE_OVERLAY_QUERY); return media }, getComputedStyle: el => ({ visibility: el.hidden ? 'hidden' : 'visible' }) },
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name),
    querySelector: selector => { assert.equal(selector, 'dialog:modal'); return doc.nativeModal ? {} : null },
  }
  const element = (id, inside = true) => ({ id, inside, isConnected: true, hidden: false, disabled: false, tabIndex: 0,
    getClientRects() { return this.noLayout ? [] : [{}] }, matches() { return this.disabled || this.inert },
    focus() { doc.activeElement = this; handlers.get('focusin')?.() },
  })
  const opener = element('opener', false)
  const search = element('search', false)
  const first = element('first')
  const last = element('last')
  const attrs = new Map()
  const panel = Object.assign(element('panel'), { ownerDocument: doc, tabIndex: -1, children: [first, last],
    getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
    contains: el => Boolean(el?.inside), querySelectorAll() { return this.children },
  })
  doc.activeElement = opener
  let closed = 0
  const cleanup = installShopSaleFocus(panel, () => closed++, () => search)
  const key = (name, shiftKey = false) => {
    const event = { key: name, shiftKey, prevented: false, preventDefault() { this.prevented = true }, stopPropagation() {} }
    handlers.get('keydown')?.(event)
    return event
  }
  return { doc, media, panel, opener, search, first, last, attrs, handlers, cleanup, key, element, closed: () => closed }
}

test('narrow sale is a dialog, receives focus and wraps Tab in both directions', () => {
  const f = fixture()
  assert.equal(f.attrs.get('role'), 'dialog')
  assert.equal(f.attrs.get('aria-modal'), 'true')
  assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.key('Tab', true).prevented, true)
  assert.equal(f.doc.activeElement, f.last)
  assert.equal(f.key('Tab').prevented, true)
  assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.key('Tab').prevented, false)
})
test('background focus is redirected and Escape requests close once', () => {
  const f = fixture()
  f.opener.focus()
  assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.key('Escape').prevented, true)
  assert.equal(f.closed(), 1)
})
test('native confirmation keeps its own focus and Escape; outer trap resumes afterward', () => {
  const f = fixture()
  f.doc.nativeModal = true
  f.opener.focus()
  assert.equal(f.doc.activeElement, f.opener)
  assert.equal(f.key('Escape').prevented, false)
  assert.equal(f.key('Tab').prevented, false)
  assert.equal(f.closed(), 0)
  f.doc.nativeModal = false
  assert.equal(f.key('Tab').prevented, true)
  assert.equal(f.doc.activeElement, f.first)
})
test('desktop sidebar does not acquire modal semantics, trap or Escape handling', () => {
  const f = fixture(false)
  assert.equal(f.attrs.size, 0)
  assert.equal(f.doc.activeElement, f.opener)
  assert.equal(f.key('Tab').prevented, false)
  assert.equal(f.key('Escape').prevented, false)
  f.media.matches = true; f.media.changed()
  assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.attrs.get('role'), 'dialog')
  f.media.matches = false; f.media.changed()
  assert.equal(f.attrs.size, 0)
  assert.equal(f.key('Tab').prevented, false)
})
test('hidden, disabled, inert and negative-tabindex controls are excluded dynamically', () => {
  const f = fixture()
  const hidden = f.element('hidden'); hidden.hidden = true
  const disabled = f.element('disabled'); disabled.disabled = true
  const inert = f.element('inert'); inert.inert = true
  const negative = f.element('negative'); negative.tabIndex = -1
  f.panel.children = [hidden, disabled, inert, negative, f.first]
  assert.equal(f.key('Tab').prevented, true)
  assert.equal(f.doc.activeElement, f.first)
  f.panel.children = []
  assert.equal(f.key('Tab').prevented, true)
  assert.equal(f.doc.activeElement, f.panel)
})
test('cleanup restores opener or search fallback after cart trigger disappears, and removes listeners', () => {
  for (const removed of [false, true]) {
    const f = fixture()
    f.opener.isConnected = !removed
    f.cleanup()
    assert.equal(f.doc.activeElement, removed ? f.search : f.opener)
    assert.equal(f.handlers.size, 0)
    assert.equal(f.attrs.size, 0)
    assert.equal(f.media.changed, null)
  }
})
test('cleanup never steals focus from a native confirmation', () => {
  const f = fixture()
  f.doc.nativeModal = true
  f.doc.activeElement = f.opener
  f.cleanup()
  assert.equal(f.doc.activeElement, f.opener)
})
test('Shop wires focus only for open panel, with a focusable fallback and matching CSS breakpoint', () => {
  const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
  assert.match(source, /if \(!cartOpen \|\| !salePanelRef.current\) return/)
  assert.match(source, /installShopSaleFocus\(salePanelRef.current, \(\) => setCartOpen\(false\), \(\) => saleSearchRef.current\)/)
  assert.match(source, /id="shop-current-sale" ref=\{salePanelRef\} tabIndex=\{-1\}/)
  assert.match(source, /input ref=\{saleSearchRef\} autoComplete="off"/)
  assert.match(css, /@media \(max-width: 840px\) \{[\s\S]*?\.shop-current-sale \{ position: fixed;/)
})
