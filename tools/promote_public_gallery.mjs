#!/usr/bin/env node
// Promote a reviewed, clean-source capture into the local public build inputs.
// This does not deploy or change the candidate-only evidence classification.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const assetsRoot = resolve(root, 'tools/public-assets')
const captureFiles = [
  'actual-shop-today.png',
  'actual-shop-first-run.png',
  'actual-shop-sell.png', 'actual-shop-sell-tablet.png', 'actual-shop-sell-mobile.png',
  'actual-shop-order-record.png',
  'actual-shop-today-tablet.png', 'actual-shop-today-mobile.png',
  'actual-shop-orders.png', 'actual-shop-orders-tablet.png', 'actual-shop-orders-mobile.png',
  'actual-shop-inventory.png', 'actual-shop-inventory-tablet.png', 'actual-shop-inventory-mobile.png',
  'actual-shop-sell-my.png', 'actual-shop-sell-my-tablet.png', 'actual-shop-sell-my-mobile.png',
  'actual-sites-editor.png', 'actual-sites-editor-tablet.png', 'actual-sites-editor-mobile.png',
  'actual-sites-inquiries.png', 'actual-sites-inquiries-tablet.png', 'actual-sites-inquiries-mobile.png',
  'actual-commerce-catalog.png', 'actual-commerce-catalog-tablet.png', 'actual-commerce-catalog-mobile.png',
  'actual-commerce-order-request.png', 'actual-commerce-order-request-tablet.png', 'actual-commerce-order-request-mobile.png',
]
const publicFiles = [
  'actual-shop-sell.png', 'actual-shop-sell-tablet.png', 'actual-shop-sell-mobile.png',
  'actual-shop-sell-my.png', 'actual-shop-sell-my-tablet.png', 'actual-shop-sell-my-mobile.png',
  'actual-shop-orders.png', 'actual-shop-orders-tablet.png', 'actual-shop-orders-mobile.png',
  'actual-shop-inventory.png', 'actual-shop-inventory-tablet.png', 'actual-shop-inventory-mobile.png',
]
const reportArg = process.argv.find(argument => argument.endsWith('.json'))
const write = process.argv.includes('--write')
assert(reportArg, 'usage: node tools/promote_public_gallery.mjs <capture-report.json> [--write]')
const report = JSON.parse(await readFile(resolve(root, reportArg), 'utf8'))
const sourceRoot = resolve(root, report.output)
const sourceRelative = relative(resolve(root, '.tmp'), sourceRoot)
assert(sourceRelative && !sourceRelative.startsWith('..' + sep) && sourceRelative !== '..'
  && !isAbsolute(sourceRelative) && sourceRelative.startsWith('gallery-candidate-'),
  'capture output must be a gallery-candidate directory inside .tmp')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
assert.equal(report.sourceCommit, git('rev-parse', 'HEAD'), 'capture commit drift')
assert.equal(report.showroomTree, git('rev-parse', 'HEAD:showroom'), 'capture Shop source drift')
assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', 'showroom'), '', 'Shop source must be clean')
assert.equal(report.ok, true)
assert.equal(report.classification, 'candidate_only_local_real_component_synthetic')
assert.equal(report.captureMode, 'clean-commit-review')
assert.equal(report.publicationReady, false)
assert.equal(report.sourceHasLocalChanges, false)
assert.equal(report.captureHarnessHasLocalChanges, false)
assert.equal(report.deniedExternal, 0)
assert.equal(report.fulfilledSyntheticMedia, 3)
assert.equal(report.completedSale, true)
assert.equal(report.customerReceiptVisible, false)
assert.equal(report.captures?.length, 29, 'review the capture inventory before promotion')
assert.deepEqual(report.captures.map(capture => capture.file), captureFiles, 'capture inventory changed')
assert(/^[0-9a-f]{64}$/.test(report.captureInputsSha256))
const byFile = new Map(report.captures.map(capture => [capture.file, capture]))
const assets = await Promise.all(captureFiles.map(async file => {
  const capture = byFile.get(file)
  assert(capture, `missing capture: ${file}`)
  if (file.startsWith('actual-shop-')) {
    const myanmar = file.startsWith('actual-shop-sell-my')
    assert.equal(capture.fixturePath, myanmar ? '/shop-my/' : '/shop/')
    assert.equal(capture.uiLocale, myanmar ? 'my' : 'en')
    assert.equal(capture.routeState, file.includes('-today') || file.includes('first-run') ? 'today'
      : file.includes('-sell') || file.includes('order-record') ? 'counter'
      : file.includes('-orders') ? 'orders'
        : file.includes('-inventory') ? 'inventory' : 'today')
  } else assert.equal(capture.fixturePath, '/workspaces/')
  assert(capture.visibleSelector)
  const expected = file.endsWith('-mobile.png') ? [390, 844]
    : file.endsWith('-tablet.png') ? [768, 1024]
      : file === 'actual-shop-sell-my.png' ? [1000, 900] : [1440, 900]
  assert.deepEqual([capture.width, capture.height], expected, `dimensions: ${file}`)
  const bytes = await readFile(resolve(sourceRoot, file))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `PNG: ${file}`)
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], expected, `PNG dimensions: ${file}`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256, `digest: ${file}`)
  return { file, bytes, capture }
}))
const provenance = {
  schemaVersion: 'supermega.public-gallery-provenance.v1',
  status: 'local_component_capture',
  records: 'synthetic',
  captureSourceCommit: report.sourceCommit,
  captureSourceTree: report.showroomTree,
  capturedAt: report.capturedAt,
  assets: assets.map(({ file, capture }) => ({
    file,
    width: capture.width,
    height: capture.height,
    sha256: capture.sha256,
    capture: {
      classification: 'local_real_component_synthetic',
      publicationReady: false,
      sourceCommit: report.sourceCommit,
      showroomTree: report.showroomTree,
      captureTool: 'tools/capture_public_gallery.mjs',
      fixturePath: capture.fixturePath,
      routeState: capture.routeState,
      uiLocale: capture.uiLocale,
      visibleSelector: capture.visibleSelector,
      loadedImages: capture.loadedImages,
      deniedExternal: report.deniedExternal,
      captureInputsSha256: report.captureInputsSha256,
      captureMode: report.captureMode,
    },
  })),
  captureInputsSha256: report.captureInputsSha256,
}
if (write) {
  for (const { file, bytes } of assets) await writeFile(resolve(assetsRoot, file), bytes)
  await writeFile(resolve(assetsRoot, 'public-gallery-capture.json'),
    JSON.stringify({ ...report, output: relative(root, sourceRoot).replaceAll('\\', '/') }, null, 2) + '\n')
  await writeFile(resolve(assetsRoot, 'public-gallery-provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
}
console.log(JSON.stringify({ ok: true, write, sourceCommit: report.sourceCommit,
  showroomTree: report.showroomTree, captures: report.captures.length,
  promoted: assets.length, publicShopAssets: publicFiles.length }))
