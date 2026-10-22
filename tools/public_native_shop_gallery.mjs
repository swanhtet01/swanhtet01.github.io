import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TextDecoder } from 'node:util'

export const NATIVE_SHOP_GALLERY_DIR = 'tools/public-assets/native-shop'
export const NATIVE_SHOP_GALLERY_URL = '/images/native-shop/'
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// Git stores this JSON ledger with LF line endings, while a Windows checkout
// may materialize the same tracked text with CRLF. Seal the canonical text
// rather than checkout-specific newline bytes so the provenance receipt is
// identical on Windows CI, Linux CI, and Vercel. No other whitespace or JSON
// normalization is allowed: any substantive byte change still changes the
// receipt.
export function photoLedgerSha256(bytes) {
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('native_shop_gallery_photo_ledger_utf8_invalid')
  }
  return sha256(Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8'))
}

function check(condition, reason) {
  if (!condition) throw new Error(`native_shop_gallery_${reason}`)
}

// The image bytes come from one GitHub Actions run of the Flutter widget
// capture test. They are synthetic app examples, never hardware QA or live
// merchant records. The CI merge commit and PR source head share this native
// tree; the public commit may change only marketing files.
export function verifyNativeShopGallery(root, { sourceTree = true } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, NATIVE_SHOP_GALLERY_DIR, 'manifest.json'), 'utf8'))
  check(manifest.schema === 'supermega.public-native-shop-gallery.v1', 'schema_changed')
  check(manifest.classification === 'synthetic_flutter_widget_capture'
    && manifest.records === 'synthetic_sample_data'
    && manifest.productionDeviceProof === false, 'classification_changed')
  check(/^[0-9a-f]{40}$/.test(manifest.sourceHead)
    && /^[0-9a-f]{40}$/.test(manifest.ciMergeCommit)
    && /^[0-9a-f]{40}$/.test(manifest.nativeTree)
    && /^[0-9a-f]{64}$/.test(manifest.artifactArchiveSha256)
    && /^[0-9a-f]{64}$/.test(manifest.photoLedgerSha256)
    && Number.isSafeInteger(manifest.workflowRun)
    && Number.isSafeInteger(manifest.artifactId)
    && manifest.artifactName.endsWith(manifest.ciMergeCommit), 'source_receipt_invalid')
  if (sourceTree) {
    let currentTree
    let captureTree
    try {
      currentTree = execFileSync('git', ['rev-parse', 'HEAD:mobile/shop_pos'], {
        cwd: root, encoding: 'utf8', windowsHide: true,
      }).trim()
      captureTree = execFileSync('git', ['rev-parse', `${manifest.sourceHead}:mobile/shop_pos`], {
        cwd: root, encoding: 'utf8', windowsHide: true,
      }).trim()
    } catch {
      throw new Error('native_shop_gallery_source_tree_unavailable')
    }
    check(currentTree === manifest.nativeTree && captureTree === manifest.nativeTree, 'source_tree_drift')
  }
  const ledgerBytes = readFileSync(resolve(root, manifest.photoLedgerPath))
  check(photoLedgerSha256(ledgerBytes) === manifest.photoLedgerSha256, 'photo_ledger_drift')
  const ledger = JSON.parse(ledgerBytes.toString('utf8'))
  check(ledger.schema === 'supermega.native_shop.synthetic_photo_ledger.v1'
    && ledger.items?.length === 5
    && ledger.items.every(item => item.source_page?.startsWith('https://commons.wikimedia.org/wiki/File:')
      && item.author && item.reuse_terms?.startsWith('https://')
      && item.thumbnail_sha256 === sha256(readFileSync(resolve(root, 'mobile/shop_pos/test/assets/grocery_photos', item.thumbnail)))),
  'photo_rights_invalid')
  const expected = [
    'shop_checkout_1200_en.png', 'shop_checkout_1200_my.png', 'shop_checkout_820_en.png', 'shop_checkout_820_my.png',
    'shop_checkout_390_en.png', 'shop_checkout_390_my.png',
    'shop_sell_390_en.png', 'shop_sell_390_my.png',
    'shop_stock_1200_en.png', 'shop_stock_820_en.png', 'shop_stock_820_my.png',
    'shop_stock_390_en.png', 'shop_stock_390_my.png',
    'shop_today_1200_en.png', 'shop_today_820_en.png', 'shop_today_820_my.png',
    'shop_today_390_en.png', 'shop_today_390_my.png',
  ].sort()
  check(manifest.assets?.map(asset => asset.file).join(',') === expected.join(','), 'asset_set_changed')
  for (const asset of manifest.assets) {
    check(asset.sourceFile === `mobile/shop_pos/test/goldens/${asset.file}`, `source_path_invalid:${asset.file}`)
    const bytes = readFileSync(resolve(root, NATIVE_SHOP_GALLERY_DIR, asset.file))
    const expectedSize = asset.file.includes('_1200_') ? [1200, 900]
      : asset.file.includes('_820_') ? [820, 1000] : [390, 844]
    check(bytes.subarray(0, 8).equals(pngSignature)
      && asset.width === expectedSize[0]
      && asset.height === expectedSize[1]
      && bytes.readUInt32BE(16) === asset.width
      && bytes.readUInt32BE(20) === asset.height
      && sha256(bytes) === asset.sha256, `asset_invalid:${asset.file}`)
  }
  return manifest
}
