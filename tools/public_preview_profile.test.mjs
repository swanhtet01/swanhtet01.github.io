import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindPreviewNavigation } from './public_preview_navigation.mjs'
import { companyShopFooterHtml, companyShopHeaderHtml } from './public_company_shop_design.mjs'
import { previewProfile, validatePreviewContact, validatePreviewLinks, validatePreviewDeployment } from './public_preview_profile.mjs'
const root = resolve(import.meta.dirname, '..')
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const staticDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`, 'static')
  : resolve(root, '.vercel/output/static')
const readCurrentRelease = () => JSON.parse(readFileSync(resolve(staticDir, '__release.json'), 'utf8'))
const commit = 'a'.repeat(40)
const app = { origin: 'https://megaos-123456789-swanhtet01s-projects.vercel.app',
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', deploymentId: 'dpl_12345678', commit }
const policy = previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify(app) })
const products = ['shop', 'website', 'ecommerce', 'plant'].map(id => ({ id }))
const html = `<a class="button button-primary" href="/contact/?product=shop&plan=shop-pilot">Request a Shop pilot</a><a class="nav-sign-in" href="${app.origin}/login">Sign in</a>`
test('requires explicit profile, exact SHA and app binding', () => {
  for (const input of [{}, { profile: 'isolated-pair', expectedCommit: commit },
    { profile: 'isolated-pair', expectedCommit: 'main' }, { profile: 'unknown', expectedCommit: commit }]) assert.throws(() => previewProfile(input))
  assert.throws(() => previewProfile({ profile: 'isolated-pair', expectedCommit: commit, appBinding: JSON.stringify({ ...app, commit: 'b'.repeat(40) }) }))
})
test('paired Shop action permits only scoped merchant sign-in and excludes internal products', () => {
  assert.deepEqual(validatePreviewLinks(html, policy, products).activeProducts, ['shop'])
  for (const wrong of [html + `<a href="${app.origin}/shop/?tab=counter">Open app</a>`, html + '<a href="https://app.supermega.dev/login?product=shop">Login</a>',
    html + '<a href="/">Company</a>', html + '<a href="/plant/">Plant</a>', html + '<a href="/settings/?product=production">Setup</a>',
    html + '<a href="https://other.vercel.app">External</a>']) assert.throws(() => validatePreviewLinks(wrong, policy, products))
})

test('public chrome leads to Shop and keeps SuperMega as the company identity', () => {
  for (const [locale, shopHref, contactHref, forbiddenLabel, statement] of [
    ['en', '/shop/', '/contact/', '>Company<', 'SuperMega is a Myanmar software company and the maker of Shop.'],
    ['my', '/my/shop/', '/my/contact/', '>ကုမ္ပဏီ<', 'SuperMega သည် မြန်မာနိုင်ငံမှ ဆော့ဖ်ဝဲကုမ္ပဏီဖြစ်ပြီး Shop အက်ပ်ကို ဖန်တီးပါသည်။'],
  ]) {
    const header = companyShopHeaderHtml(shopHref, locale)
    const footer = companyShopFooterHtml(shopHref, 2026, locale)
    assert.match(header, new RegExp(`href="${shopHref.replaceAll('/', '\\/')}"`))
    assert.match(header, new RegExp(`href="${contactHref.replaceAll('/', '\\/')}"`))
    assert.doesNotMatch(header, new RegExp(forbiddenLabel))
    assert.doesNotMatch(header, /href="\/"/)
    assert.match(footer, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(companyShopHeaderHtml('/website/', 'en'), /data-language-switch/)
  assert.doesNotMatch(companyShopHeaderHtml('/ecommerce/', 'en'), /data-language-switch/)
  assert.doesNotMatch(companyShopHeaderHtml('/plant/', 'en'), /data-language-switch/)
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
  validatePreviewLinks('<h1>Plant retained records</h1><a href="/shop/">View current products</a>', policy, products, options)
  assert.throws(() => validatePreviewLinks(`<a href="${app.origin}/plant/">Open retained workspace</a>`, policy, products, options))
  validatePreviewLinks('<a href="mailto:swanhtet@supermega.dev">Contact</a>', policy, products, options)
})

test('native gallery is read-only and no image is a preview navigation action', () => {
  const options = { publicOrigin: 'https://public-preview.example' }
  for (const path of ['/images/native-shop/shop_checkout_1200_en.png',
    '/images/native-shop/shop_stock_820_my.png', '/images/unreviewed.png']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${path}">View full size</a>`, policy, products, options), undefined, path)
  }
})


test('public site keeps Shop walkthrough and a single safe sign-in link', () => {
  validatePreviewLinks(html, policy, products)
  for (const suffix of ['/login?product=shop', '/?choose=1', '/shop/?tab=today', '/settings/?product=website', '/login?product=website', '/login?product=shop&next=/shop/']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${app.origin}${suffix}">Open</a>`, policy, products))
  }
  assert.throws(() => validatePreviewLinks(html + `<a href="${app.origin}/login">Login</a>`, policy, products), /action_missing:single_login/)
  assert.throws(() => validatePreviewLinks('<h1>Products</h1>', policy, products), /action_missing/)
})

test('public preview rejects extra or unbound sign-in actions', () => {
  for (const href of [`${app.origin}/login`, `${app.origin}/login?product=shop`, 'https://app.supermega.dev/login?product=shop']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${href}">Login</a>`, policy, products))
  }
})

test('Burmese routes stay within the preview boundary', () => {
  const options = { publicOrigin: 'https://public-preview.example' }
  for (const href of ['/my/shop/', '/my/contact/?product=shop', '/my/privacy/']) {
    validatePreviewLinks(html + `<a href="${href}">Continue</a>`, policy, products, options)
  }
  for (const href of ['/my/plant/', '/my/website/', '/my/ecommerce/',
    'https://commons.wikimedia.org/wiki/File:Unreviewed_photo.jpg']) {
    assert.throws(() => validatePreviewLinks(html + `<a href="${href}">Continue</a>`, policy, products, options))
  }
})

test('current generated Shop, Contact and Privacy pages bind one sign-in without production escapes', () => {
  const currentRelease = readCurrentRelease()
  for (const path of ['shop/index.html', 'contact/index.html', 'privacy/index.html', 'my/shop/index.html', 'my/contact/index.html', 'my/privacy/index.html']) {
    const source = readFileSync(resolve(staticDir, path), 'utf8')
    const canonicalSource = currentRelease.previewNavigation
      ? source.replaceAll(`href="${currentRelease.previewNavigation.origin}/`, 'href="https://app.supermega.dev/')
      : source
    const bound = bindPreviewNavigation(canonicalSource, app)
    assert.equal(validatePreviewLinks(bound, policy, products, { publicOrigin: 'https://public-preview.example', requireActions: path === 'shop/index.html' }).pairedOrigin, app.origin)
    assert.ok(!bound.includes('href="https://app.supermega.dev/'))
    assert.equal((bound.match(new RegExp(`href="${app.origin}/login"`, 'g')) ?? []).length, 1)
  }
})
