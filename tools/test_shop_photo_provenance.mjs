import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const source = new URL('./qa-assets/shop-products/sources.json', import.meta.url)
const fixture = readFileSync(new URL('./build_shop_browser_fixture.mjs', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(source, 'utf8'))

assert.equal(manifest.products.length, 5)
assert.match(manifest.license_status, /four retailer photos removed/)
assert.match(fixture, /file\.endsWith\('\.jpg'\) \? 'image\/jpeg' : 'image\/webp'/)
assert.match(fixture, /type:productPhotoMimes\[sku\]/)
assert.equal(manifest.products.filter(product => product.file).length, 1)
for (const product of manifest.products) {
  assert.match(product.source_page, /^https:\/\//)
  assert.ok(product.variant)
  assert.ok(Number.isSafeInteger(product.sample_catalog_price_mmk))
  if (!product.file) {
    assert.equal(product.photo_status, 'not_included_no_public_reuse_grant')
    assert.equal(product.source_image, undefined)
    assert.equal(product.image_sha256, undefined)
    assert.equal(product.observed_listing_price_mmk, undefined)
    assert.ok(!fixture.includes(`'${product.sku}':`))
    continue
  }
  assert.ok(product.package_visual_check)
  assert.match(product.source_image, /^https:\/\//)
  assert.match(product.image_sha256, /^[0-9a-f]{64}$/)
  const bytes = readFileSync(new URL(`./qa-assets/shop-products/${product.file}`, import.meta.url))
  assert.equal(product.photo_status, 'contributor_photo_license_review_needed_for_public_use')
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff')
  assert.equal(product.photo_license?.name, 'CC BY-SA 3.0')
  assert.match(product.photo_license.credit_page, /^https:\/\/world\.openfoodfacts\.org\//)
  assert.match(product.photo_license.attribution, /twindel.*Open Food Facts/)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), product.image_sha256)
  assert.ok(fixture.includes(`'${product.sku}': '${product.file}'`))
}

console.log('One attributed exact-product photo remains in the synthetic fixture; four uncleared retailer images are excluded.')
