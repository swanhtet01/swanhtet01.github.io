import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const source = new URL('./qa-assets/shop-products/sources.json', import.meta.url)
const fixture = readFileSync(new URL('./build_shop_browser_fixture.mjs', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(source, 'utf8'))

assert.equal(manifest.products.length, 6)
assert.match(manifest.license_status, /MAMA package photo and four retailer photos removed/)
assert.match(fixture, /file\.endsWith\('\.jpg'\) \? 'image\/jpeg' : 'image\/webp'/)
assert.match(fixture, /type:productPhotoMimes\[sku\]/)
assert.equal(manifest.products.filter(product => product.file).length, 1)
for (const product of manifest.products) {
  assert.match(product.source_page, /^https:\/\//)
  assert.ok(product.variant)
  assert.ok(Number.isSafeInteger(product.sample_catalog_price_mmk))
  if (!product.file) {
    assert.match(product.photo_status, /^not_included_(?:no_public_reuse_grant|package_artwork_unreviewed)$/)
    assert.equal(product.source_image, undefined)
    assert.equal(product.image_sha256, undefined)
    assert.equal(product.observed_listing_price_mmk, undefined)
    assert.ok(!fixture.includes(`'${product.sku}':`))
    continue
  }
  assert.equal(product.name, 'Red apple (each)')
  assert.equal(product.name_my, 'ပန်းသီးနီ (တစ်လုံး)')
  assert.equal(product.price_status, 'synthetic_illustration_only_not_a_market_or_live_price')
  assert.match(product.source_image, /^https:\/\//)
  assert.match(product.image_sha256, /^[0-9a-f]{64}$/)
  const bytes = readFileSync(new URL(`./qa-assets/shop-products/${product.file}`, import.meta.url))
  assert.equal(product.photo_status, 'cc0_candidate_capture_only_not_publication_approval')
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff')
  assert.equal(product.photo_license?.name, 'CC0 1.0')
  assert.equal(product.photo_license?.url, 'https://creativecommons.org/publicdomain/zero/1.0/')
  assert.equal(product.photo_license?.photographer, 'Fructibus')
  assert.match(product.photo_license?.crop, /original JPEG bytes retained;.*CSS object-fit cropping/)
  assert.match(product.photo_license?.attribution, /Fructibus.*Wikimedia Commons/)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), product.image_sha256)
  assert.ok(fixture.includes(`'${product.sku}': '${product.file}'`))
}

console.log('One CC0 exact-match apple photo remains a candidate; the MAMA pack and four retailer photos are excluded.')
