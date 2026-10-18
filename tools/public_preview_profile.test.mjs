import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindPreviewNavigation } from './public_preview_navigation.mjs'
import { previewProfile, validatePreviewContact, validatePreviewLinks, validatePreviewDeployment } from './public_preview_profile.mjs'
const root = resolve(import.meta.dirname, '..')
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const staticDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`, 'static')
  : resolve(root, '.vercel/output/static')
const commit = 'a'.repeat(40)
const app = { origin: 'https://megaos-123456789-swanhtet01s-projects.vercel.app',
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', deploymentId: 'dpl_12345678', commit }
const policy = previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify(app) })
const products = ['shop', 'website', 'ecommerce', 'plant'].map(id => ({ id }))
const html = `<a href="${app.origin}/login">Login</a>`
test('requires explicit profile, exact SHA and app binding', () => {
  for (const input of [{}, { profile: 'isolated-pair', expectedCommit: commit },
    { profile: 'isolated-pair', expectedCommit: 'main' }, { profile: 'unknown', expectedCommit: commit }]) assert.throws(() => previewProfile(input))
  assert.throws(() => previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify({ ...app, commit: 'b'.repeat(40) }) }))
})
test('paired active actions exclude Plant and production escapes', () => {
  assert.equal(validatePreviewLinks(html, policy, products).activeProducts.length, 3)
  for (const wrong of [html.replace('/login', '/shop/?tab=counter'), html.replace(app.origin, 'https://app.supermega.dev'),
    html + '<a href="/plant/">Plant</a>', html + '<a href="/settings/?product=production">Setup</a>',
    html.replace(app.origin, 'https://other.vercel.app')]) assert.throws(() => validatePreviewLinks(wrong, policy, products))
})
test('isolated contact cannot accept while production contract still requires acceptance', () => {
  const contact = { service: 'supermega-contact', status: 'attention', accepting: false,
    controls: { idempotency: 'required', edge_rate_limit: 'required' } }
  validatePreviewContact(contact, policy)
  const production = previewProfile({ profile: 'production-contract', expectedCommit: commit })
  assert.throws(() => validatePreviewContact(contact, production))
  const accepting = { ...contact, status: 'ready', accepting: true }
  validatePreviewContact(accepting, production)
  assert.throws(() => validatePreviewContact(accepting, policy))
})
test('provider readback must bind exact immutable app identity', () => {
  const deployed = { id: app.deploymentId, projectId: app.projectId, url: app.origin.slice(8), readyState: 'READY', target: null, meta: { githubCommitSha: commit } }
  validatePreviewDeployment(deployed, app)
  for (const bad of [{ ...deployed, target: 'production' }, { ...deployed, projectId: 'other' },
    { ...deployed, url: 'megaos.vercel.app' }, { ...deployed, meta: {} }, { ...deployed, id: 'other' },
    { ...deployed, target: undefined }, { ...deployed, target: {} }, { ...deployed, target: 'custom' }]) {
    assert.throws(() => validatePreviewDeployment(bad, app), /binding_mismatch/)
  }
})
test('rejects extra escape links even when all good actions remain', () => {
  for (const href of ['https://evil.example/shop/', 'https://supermega.dev/shop/', '//app.supermega.dev/shop/',
    `${app.origin.replace('https://', 'https://user@')}/shop/?tab=today`, `${app.origin}/shop/?tab=wrong`,
    'javascript:alert(1)', '&#47;&#47;app.supermega.dev/shop/', '/%70lant/', '/settings/?product=plant']) {
    assert.throws(() => validatePreviewLinks(html + `<A HREF='${href}'>Open</A>`, policy, products,
      { publicOrigin: 'https://public-preview.example' }), undefined, href)
  }
})
test('rejects all external retail-price links from the public preview', () => {
  const options = { publicOrigin: 'https://public-preview.example' }
  for (const href of ['https://www.makropro.com.mm/en', 'https://www.makropro.com.mm/en?next=/',
    'https://www.makropro.com.mm/products', 'https://makropro.com.mm/en', 'https://evil.example/en']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${href}">External</a>`, policy, products, options), undefined, href)
  }
})
test('all-page mode permits informational tombstone but not a retired tool action', () => {
  const options = { requireActions: false, publicOrigin: 'https://public-preview.example' }
  validatePreviewLinks('<h1>Plant retained records</h1><a href="/#products">View current products</a>', policy, products, options)
  assert.throws(() => validatePreviewLinks(`<a href="${app.origin}/plant/">Open retained workspace</a>`, policy, products, options))
  validatePreviewLinks('<a href="mailto:swanhtet@supermega.dev">Contact</a>', policy, products, options)
})

test('full-size gallery links stay on exact static public PNGs', () => {
  const options = { publicOrigin: 'https://public-preview.example' }
  for (const path of ['/images/actual-shop-today.png', '/images/actual-shop-today-tablet.png', '/images/actual-shop-today-mobile.png',
    '/images/actual-shop-sell-tablet.png', '/images/actual-shop-orders-tablet.png', '/images/actual-shop-inventory-tablet.png',
    '/images/actual-shop-inventory.png', '/images/actual-shop-inventory-mobile.png',
    '/images/actual-sites-inquiries.png', '/images/actual-sites-inquiries-mobile.png',
    '/images/actual-commerce-order-request.png', '/images/actual-commerce-order-request-mobile.png']) {
    assert.equal(validatePreviewLinks(html + `<a href="${path}">View full size</a>`, policy, products, options).pairedOrigin, app.origin)
  }
  for (const path of ['/images/actual-shop-today.svg', '/images/actual-shop-today.png?download=1',
    '/images/actual-shop-today.png#other', '/images/actual-shop-inventory.png?download=1',
    '/images/unreviewed.png', 'https://supermega.dev/images/actual-shop-today.png']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${path}">View full size</a>`, policy, products, options), undefined, path)
  }
})


test('public site rejects product pickers and setup routes but keeps Shop login intent', () => {
  validatePreviewLinks(html.replace('/login', '/login?product=shop'), policy, products)
  for (const suffix of ['/?choose=1', '/shop/?tab=today', '/settings/?product=website', '/login?product=website', '/login?product=shop&next=/shop/']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${app.origin}${suffix}">Open</a>`, policy, products))
  }
  assert.throws(() => validatePreviewLinks(html + `<a href="${app.origin}/login">Open</a>`, policy, products), /action_missing/)
  assert.throws(() => validatePreviewLinks('<h1>Products</h1>', policy, products), /action_missing/)
})

test('Shop primary sign-in stays exact and cannot permit duplicate or mixed login actions', () => {
  const shopLogin = html.replace('/login', '/login?product=shop')
  const primary = `<a class="button button-primary" href="${app.origin}/login?product=shop">Sign in to Shop</a>`
  validatePreviewLinks(shopLogin + primary, policy, products)
  for (const wrong of [html + primary, shopLogin + primary + primary,
    shopLogin + primary.replace('button-primary', 'button-secondary'),
    shopLogin + primary.replace('Sign in to Shop', 'Open Shop'),
    shopLogin + primary.replace('product=shop', 'product=website')]) {
    assert.throws(() => validatePreviewLinks(wrong, policy, products))
  }
})

test('current generated pages bind isolated Login actions without production escapes', () => {
  for (const path of ['index.html', 'shop/index.html', 'website/index.html', 'ecommerce/index.html', 'contact/index.html', 'privacy/index.html']) {
    const source = readFileSync(resolve(staticDir, path), 'utf8')
    const bound = bindPreviewNavigation(source, app)
    assert.equal(validatePreviewLinks(bound, policy, products, { publicOrigin: 'https://public-preview.example' }).pairedOrigin, app.origin)
    assert.ok(!bound.includes('href="https://app.supermega.dev/'))
  }
})
