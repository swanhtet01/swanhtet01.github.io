import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT,
  assessShopReceiptPrintGeometry,
  sampleShopReceiptPrintGeometrySource,
  validateShopReceiptPrintGeometry,
} from './verify_shop_receipt_print_geometry.mjs'

test('accepts the css-only roll geometry with the hardware claim boundary intact', () => {
  const report = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource(),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(report.contract, SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT)
  assert.equal(report.ok, true)
  assert.equal(report.status, 'guarded_css_only_roll_geometry')
  assert.equal(report.checks.invalidPageSizeAbsent, true)
  assert.equal(report.checks.rollBranchConstrainsBodyForRoll, true)
  assert.equal(report.checks.narrowRollBranchTightensFor58mmClass, true)
  assert.equal(report.checks.sheetBranchRestoresSheetGeometry, true)
  assert.equal(report.claimBoundary.thermalHardwareClaimed, false)
  assert.equal(report.claimBoundary.founderDeviceTestRequiredBeforeSalesClaim, true)
  assert.equal(validateShopReceiptPrintGeometry(report), report)
})

test('rejects invalid css page-size shortcuts that silently fall back to sheet geometry', () => {
  const source = sampleShopReceiptPrintGeometrySource()
    .replace('@page { margin: 3mm 0; }', '@page { size: 80mm auto; margin: 3mm 0; }')
  const report = assessShopReceiptPrintGeometry({ source, generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('shop_receipt_print_geometry_invalid_page_size_declared'))
})

test('does not mistake background-size for an @page size declaration', () => {
  const source = sampleShopReceiptPrintGeometrySource()
    .replace('pre { white-space: pre-wrap;', 'pre { background-size: 40mm auto; white-space: pre-wrap;')
  const report = assessShopReceiptPrintGeometry({ source, generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(report.ok, true)
  assert.equal(report.checks.invalidPageSizeAbsent, true)
})

test('rejects unreviewed direct printer transports in this receipt geometry slice', () => {
  const report = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource('navigator.bluetooth.requestDevice({ filters: [] })'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('shop_receipt_print_geometry_unreviewed_transport_added'))
})

test('rejects missing roll, narrow-roll, sheet, and language boundaries', () => {
  const noRollBody = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource()
      .replace('body { margin: 0; padding: 0 4mm; font-size: 0.7rem; line-height: 1.35; }', ''),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(noRollBody.ok, false)
  assert.ok(noRollBody.failures.includes('shop_receipt_print_geometry_roll_body_missing'))

  const noNarrow = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource()
      .replace('@media print and (max-width: 65mm) {', '@media print and (max-width: 75mm) {'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(noNarrow.ok, false)
  assert.ok(noNarrow.failures.includes('shop_receipt_print_geometry_narrow_roll_branch_missing'))

  const noSheet = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource()
      .replace('@media print and (min-width: 90mm) {', '@media print and (min-width: 120mm) {'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(noSheet.ok, false)
  assert.ok(noSheet.failures.includes('shop_receipt_print_geometry_sheet_branch_missing'))

  const noLanguage = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource().replace('<html lang="en">', '<html>'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.equal(noLanguage.ok, false)
  assert.ok(noLanguage.failures.includes('shop_receipt_print_geometry_language_boundary_missing'))
})

test('rejects reports whose claim boundary or digest is tampered', () => {
  const report = assessShopReceiptPrintGeometry({
    source: sampleShopReceiptPrintGeometrySource(),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  assert.throws(
    () => validateShopReceiptPrintGeometry({ ...report, claimBoundary: { ...report.claimBoundary, thermalHardwareClaimed: true } }),
    /shop_receipt_print_geometry_digest_invalid/,
  )
  assert.throws(
    () => validateShopReceiptPrintGeometry({ ...report, digest: `sha256:${'f'.repeat(64)}` }),
    /shop_receipt_print_geometry_digest_invalid/,
  )
})
