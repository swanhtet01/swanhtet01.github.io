import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const source = new URL('./qa-assets/shop-products/sources.json', import.meta.url)
const fixture = readFileSync(new URL('./build_shop_browser_fixture.mjs', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(source, 'utf8'))

assert.equal(manifest.products.length, 5)
assert.match(manifest.license_status, /four retailer photos without verified public reuse permission/)
assert.match(fixture, /file\.endsWith\('\.jpg'\) \? 'image\/jpeg' : 'image\/webp'/)
assert.match(fixture, /type:productPhotoMimes\[sku\]/)
for (const product of manifest.products) {
  assert.match(product.source_page, /^https:\/\//)
  assert.match(product.source_image, /^https:\/\//)
  assert.ok(product.variant && product.package_visual_check)
  assert.match(product.image_sha256, /^[0-9a-f]{64}$/)
  const bytes = readFileSync(new URL(`./qa-assets/shop-products/${product.file}`, import.meta.url))
  if (product.file.endsWith('.jpg')) {
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff')
    assert.equal(product.photo_license?.name, 'CC BY-SA 3.0')
    assert.match(product.photo_license.credit_page, /^https:\/\/world\.openfoodfacts\.org\//)
    assert.match(product.photo_license.attribution, /twindel.*Open Food Facts/)
  } else {
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP')
    assert.equal(product.photo_license, undefined)
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), product.image_sha256)
  assert.ok(fixture.includes(`'${product.sku}': '${product.file}'`))
}

console.log('Five exact-product synthetic QA photos match source records; four public reuse grants remain unverified.')
