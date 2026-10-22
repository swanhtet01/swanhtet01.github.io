import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const fixture = readFileSync(new URL('./build_shop_browser_fixture.mjs', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('./qa-assets/shop-products/sources.json', import.meta.url), 'utf8'))
const expected = [
  ['SM-1001', 'Red apple (each)', 'ပန်းသီးနီ (တစ်လုံး)', 'apple.png', 2800],
  ['SM-1002', 'Bananas (bunch)', 'ငှက်ပျောသီး (တစ်ဖီး)', 'banana.png', 2500],
  ['SM-1003', 'Red tomato (each)', 'ခရမ်းချဉ်သီးနီ (တစ်လုံး)', 'tomato.png', 1300],
  ['SM-1004', 'Red onions (500 g)', 'ကြက်သွန်နီ (၅၀၀ ဂရမ်)', 'onion.png', 2400],
  ['SM-1005', 'Mango (each)', 'သရက်သီး (တစ်လုံး)', 'mango.png', 3500],
]

assert.equal(manifest.schemaVersion, 'supermega.shop-image-rights.v1')
assert.equal(manifest.status, 'cleared_for_publication')
assert.equal(manifest.products.length, expected.length)
assert.match(manifest.source_fixture, /^https:\/\/github\.com\/swanhtet01\/swanhtet01\.github\.io\/tree\/[0-9a-f]{40}\/mobile\/shop_pos\/test\/assets\/grocery_photos$/)
assert.match(fixture, /seed\.items=catalog/)
assert.match(fixture, /createCommerceCatalogBaseline\(item,baselineProof\)/)
assert.match(fixture, /seed\.orders=seed\.orders\.filter[\s\S]*?unitPriceMmk:item\.price/)
assert.match(fixture, /file\.endsWith\('\.png'\) \? 'image\/png'/)
assert.match(fixture, /productSources\.products\s*\.filter\(product => product\.file\)/)
assert.doesNotMatch(fixture, /KAUNG 90 Days Rice|seed\.items\.unshift/)

for (const [index, product] of manifest.products.entries()) {
  const [sku, name, nameMy, file, price] = expected[index]
  assert.equal(product.sku, sku)
  assert.equal(product.name, name)
  assert.equal(product.name_my, nameMy)
  assert.equal(product.file, file)
  assert.equal(product.sample_catalog_price_mmk, price)
  assert.equal(product.price_status, 'synthetic_illustration_only_not_a_market_or_live_price')
  assert.ok(Number.isSafeInteger(product.sample_opening_stock) && product.sample_opening_stock > 0)
  assert.ok(Number.isSafeInteger(product.sample_reorder_at) && product.sample_reorder_at > 0)
  assert.match(product.source_page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
  assert.match(product.source_image, /^https:\/\/upload\.wikimedia\.org\//)
  assert.match(product.original_image_sha256, /^[0-9a-f]{64}$/)
  assert.equal(product.photo_status, 'source_license_checked_gallery_review_pending')
  assert.equal(product.publication_rights.status, 'cleared_for_publication')
  assert.equal(product.publication_rights.evidence_sha256, product.image_sha256)
  assert.equal(product.publication_rights.original_author, product.source_author)
  if (product.publication_rights.basis === 'cc0-1.0') {
    assert.equal(product.publication_rights.license_url, 'https://creativecommons.org/publicdomain/zero/1.0/')
  } else {
    assert.equal(product.publication_rights.basis, 'author-public-domain-dedication')
    assert.equal(product.publication_rights.license_url, product.source_page)
  }
  const bytes = readFileSync(new URL(`./qa-assets/shop-products/${file}`, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), product.image_sha256)
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(bytes.readUInt32BE(16), 192)
  assert.equal(bytes.readUInt32BE(20), 192)
  const chunks = []
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    chunks.push(bytes.subarray(offset + 4, offset + 8).toString('ascii'))
    offset += length + 12
  }
  assert.equal(chunks[0], 'IHDR')
  assert.equal(chunks.at(-1), 'IEND')
  assert.ok(chunks.every(chunk => ['IHDR', 'IDAT', 'IEND'].includes(chunk)), `${file} has metadata`)
}

console.log('Five photographed synthetic products match the pinned native fixture and rights ledger.')
