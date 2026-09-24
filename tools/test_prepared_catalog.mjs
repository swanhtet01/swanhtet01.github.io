import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateStorefrontPreview, STOREFRONT_PREVIEW_SCHEMA } from '../showroom/src/products/ecommerce/storefront-model.ts'
import { COMMERCE_WORKSPACE_SCHEMA } from '../showroom/src/core/commerce-workspace.ts'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/PreparedCatalog.tsx', import.meta.url), 'utf8')
const compiled = require('typescript').transpileModule(source, { compilerOptions: { module: 1, jsx: 4, target: 9 } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, Intl, require: name => name.endsWith('.css') ? {} : name === './storefront-model' ? { validateStorefrontPreview } : require(name) })
const preview = () => ({ schema: STOREFRONT_PREVIEW_SCHEMA, mode: 'browser-local-preview', sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
  storeName: 'ဆိုင်', summary: 'Prepared <catalog>', currency: 'MMK', items: [
    { sku: 'A', name: '<script>item</script>', variant: 'Large', unitPriceMmk: 12500, availability: 'available' },
    { sku: 'B', name: 'Tea', variant: null, unitPriceMmk: 500, availability: 'sold_out' },
  ] })
const render = value => renderToStaticMarkup(React.createElement(exports.PreparedCatalog, { preview: value }))
test('prepared catalog shows exact product facts as inert escaped content', () => {
  const input = preview(), before = structuredClone(input), html = render(input)
  for (const text of ['ဆိုင်', 'Prepared &lt;catalog&gt;', '&lt;script&gt;item&lt;/script&gt;', 'Large', '12,500 MMK', '500 MMK', 'Available', 'Sold out']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /<(?:a|button|input|form|img|script|iframe)\b/)
  assert.deepEqual(input, before)
})
test('malformed catalogs cannot render as customer-ready products', () => {
  for (const mutate of [p => p.currency = 'USD', p => p.items[0].unitPriceMmk = -1, p => p.items = [], p => p.items[0].privateCost = 1]) {
    const p = preview(); mutate(p); assert.throws(() => render(p))
  }
})

test('prepared review binds exact identity, revision, expiry and catalog digest', async () => {
  const { verifyPreparedCatalogReview } = await import('../showroom/src/products/ecommerce/prepared-catalog-review.ts')
  const { storefrontPreviewDigest } = await import('../showroom/src/products/ecommerce/storefront-model.ts')
  const id = '11111111-1111-4111-8111-111111111111', now = Date.parse('2026-09-25T00:00:00Z')
  const catalog = preview()
  const packet = { reviewId: id, contentRevision: 1, preview: catalog, previewDigest: await storefrontPreviewDigest(catalog), expiresAt: '2026-09-26T00:00:00Z', status: 'prepared_preview', publicationAuthorized: false, deploymentAuthorized: false }
  const result = await verifyPreparedCatalogReview(packet, id, now)
  result.preview.items[0].name = 'Local edit'
  assert.notEqual(packet.preview.items[0].name, 'Local edit')
  for (const patch of [{ reviewId: 'other' }, { contentRevision: -1 }, { contentRevision: 1.5 }, { expiresAt: 'invalid' }, { expiresAt: new Date(now).toISOString() }, { previewDigest: 'wrong' }, { status: 'published' }, { publicationAuthorized: true }, { deploymentAuthorized: true }, { recipientEmail: 'private@example.invalid' }]) {
    await assert.rejects(verifyPreparedCatalogReview({ ...packet, ...patch }, id, now))
  }
  for (const edit of [p => p.items[0].unitPriceMmk++, p => p.items[0].name = 'Changed', p => p.items[0].availability = 'sold_out']) {
    const altered = structuredClone(packet); edit(altered.preview)
    await assert.rejects(verifyPreparedCatalogReview(altered, id, now))
  }
  await assert.rejects(verifyPreparedCatalogReview(packet, id + '\n', now))
  await assert.rejects(verifyPreparedCatalogReview(packet, id, NaN))
})


test('Python private review projection validates and renders in the browser contract', async () => {
  // Synthetic state only: production preparation/projection code, no DB or provider.
  const script = `
import json
from dataclasses import replace
from datetime import timedelta
from tests.test_ecommerce_customer_review import CatalogReviewTests
from tests.test_commerce_runtime import storefront_configuration
from supermega_runtime.ecommerce_customer_review import prepare_catalog_review
fixture = CatalogReviewTests()
fixture.setUp()
fixture.state['items'][0]['name'] = '\u101c\u1000\u103a\u1016\u1000\u103a <tea>'
fixture.state['items'][0]['price'] = 12500
fixture.state['storefrontConfiguration'] = storefront_configuration(fixture.state, store_name='\u1006\u102d\u102f\u1004\u103a', revision=3)
fixture.review = prepare_catalog_review(fixture.state, principal=fixture.actor,
    readiness=replace(fixture.ready, capabilities=frozenset({'commerce.write'})),
    review_id=fixture.review['reviewId'], recipient_actor_id=fixture.actor.actor_id,
    expires_at=fixture.now + timedelta(days=1), now=fixture.now, source_version=1)
print(json.dumps(fixture.project(), ensure_ascii=True))
`
  const packet = JSON.parse(execFileSync('python', ['-c', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 15000,
  }))
  const { verifyPreparedCatalogReview } = await import('../showroom/src/products/ecommerce/prepared-catalog-review.ts')
  const now = Date.parse('2026-09-25T00:00:00Z')
  const verified = await verifyPreparedCatalogReview(packet, packet.reviewId, now)
  assert.equal(verified.contentRevision, 3)
  assert.equal(verified.preview.storeName, 'ဆိုင်')
  assert.equal(verified.preview.items[0].unitPriceMmk, 12500)
  const html = render(verified.preview)
  assert.ok(html.includes('&lt;tea&gt;'))
  assert.ok(html.includes('12,500 MMK'))
  assert.doesNotMatch(html, /<(?:a|button|input|form|img|script|iframe)\b/)
  const changed = structuredClone(packet)
  changed.preview.items[0].unitPriceMmk++
  await assert.rejects(verifyPreparedCatalogReview(changed, packet.reviewId, now))
  await assert.rejects(verifyPreparedCatalogReview(packet, packet.reviewId, Date.parse(packet.expiresAt)))
  await assert.rejects(verifyPreparedCatalogReview(packet, '33333333-3333-4333-8333-333333333333', now))
})


test('saved catalog decisions bind the review and reject false acceptance or broken pagination', async () => {
  const { verifyCatalogDecisionPage: verify } = await import('../showroom/src/products/ecommerce/prepared-catalog-review.ts')
  const id = '11111111-1111-4111-8111-111111111111'
  const review = { reviewId: id, contentRevision: 3, previewDigest: 'sha256:' + 'a'.repeat(64), expiresAt: '2026-09-26T00:00:00Z' }
  const item = { commandId: id, kind: 'feedback', note: 'စျေးနှုန်း ပြင်ပါ', createdAt: '2026-09-25T00:00:00Z' }
  const page = { ...review, sourceVersion: 1, decisions: [item], nextAfter: null, publicationAuthorized: false, deploymentAuthorized: false }
  delete page.expiresAt
  assert.deepEqual(verify(page, review), page)
  const accepted = { ...page, decisions: [{ ...item, kind: 'acceptance', note: null }] }
  assert.deepEqual(verify(accepted, review), accepted)
  for (const patch of [{ reviewId: 'other' }, { contentRevision: 4 }, { previewDigest: 'wrong' }, { sourceVersion: 0 },
    { publicationAuthorized: true }, { deploymentAuthorized: true }, { nextAfter: id }, { extra: true },
    { decisions: [item, item] }, { decisions: [{ ...item, kind: 'acceptance' }] },
    { decisions: [{ ...item, createdAt: review.expiresAt }] }, { decisions: [{ ...item, note: '' }] }]) {
    assert.throws(() => verify({ ...page, ...patch }, review))
  }
  assert.throws(() => verify(page, review, id))
  const copy = verify(page, review); copy.decisions[0].note = 'Changed'
  assert.equal(page.decisions[0].note, item.note)
})
