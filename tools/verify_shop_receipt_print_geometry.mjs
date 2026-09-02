#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT = 'supermega.shop.receipt_print_geometry.v1'

const root = resolve(import.meta.dirname, '..')
const RECEIPT_DIALOG_PATH = 'showroom/src/core/ReceiptDialog.tsx'
const REQUIRED_HARDWARE_BOUNDARY_MARKERS = [
  'no SuperMega receipt has ever been printed on a thermal printer',
  'No thermal hardware was involved',
  'direct ESC/POS byte output (S4 proper) stays parked',
]
const FORBIDDEN_RUNTIME_TRANSPORT_MARKERS = [
  'navigator.bluetooth',
  'navigator.usb',
  'navigator.serial',
  'BluetoothDevice',
  'USBDevice',
  'SerialPort',
  'escpos',
  'writeValue(',
  '.transferOut(',
  '.writable.getWriter(',
]

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function compactCss(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sliceBetween(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker)
  const end = endMarker ? value.indexOf(endMarker, Math.max(start, 0) + startMarker.length) : value.length
  if (start < 0 || end <= start) return ''
  return value.slice(start, end)
}

function extractReceiptPrintStyles(source) {
  const stylesStart = source.indexOf('const RECEIPT_PRINT_STYLES = `')
  const stylesEnd = source.indexOf('function openPrintWindow(')
  if (stylesStart < 0 || stylesEnd <= stylesStart) return ''
  return source.slice(stylesStart, stylesEnd)
}

function signedReport(body) {
  const report = { ...body }
  report.digest = digest(JSON.stringify(report))
  return report
}

export function assessShopReceiptPrintGeometry(input = {}) {
  const failures = []
  const source = String(input.source || '')
  const normalizedSource = source.replace(/\r\n?/g, '\n')
  const compactSource = compactCss(normalizedSource)
  const printStyles = extractReceiptPrintStyles(source)
  const rollBranch = sliceBetween(printStyles, '@media print {', '@media print and (max-width: 65mm)')
  const narrowRollBranch = sliceBetween(printStyles, '@media print and (max-width: 65mm) {', '@media print and (min-width: 90mm)')
  const sheetBranch = sliceBetween(printStyles, '@media print and (min-width: 90mm) {', null)
  const compactRoll = compactCss(rollBranch)
  const compactNarrowRoll = compactCss(narrowRollBranch)
  const compactSheet = compactCss(sheetBranch)
  const compactStyles = compactCss(printStyles)

  const checks = {
    styleTemplatePresent: printStyles.length > 0,
    styleInjectedIntoPrintedDocument: source.includes('<style>${RECEIPT_PRINT_STYLES}'),
    printedDocumentDeclaresEnglishEvidenceLanguage: normalizedSource.includes('<!DOCTYPE html>\n<html lang="en">'),
    invalidPageSizeAbsent: !/(^|[^\w-])size\s*:/im.test(printStyles),
    rollBranchPresent: rollBranch.length > 0,
    rollBranchSetsPageMarginOnly: compactRoll.includes('@page { margin: 3mm 0; }'),
    rollBranchConstrainsBodyForRoll: compactRoll.includes('body { margin: 0; padding: 0 4mm; font-size: 0.7rem; line-height: 1.35; }'),
    narrowRollBranchPresent: narrowRollBranch.length > 0,
    narrowRollBranchTightensFor58mmClass: compactNarrowRoll.includes('body { padding: 0 5mm; font-size: 0.6rem; }'),
    sheetBranchPresent: sheetBranch.length > 0,
    sheetBranchRestoresSheetGeometry: compactSheet.includes('@page { margin: 1cm; }')
      && compactSheet.includes('body { margin: 0.5rem; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }'),
    browserPrintOnly: source.includes('win.print()')
      && FORBIDDEN_RUNTIME_TRANSPORT_MARKERS.every((marker) => !source.includes(marker)),
    thermalHardwareClaimBoundaryPresent: REQUIRED_HARDWARE_BOUNDARY_MARKERS.every((marker) => compactSource.includes(marker)),
    cssOnlyReceiptGeometry: compactStyles.includes('@media print')
      && source.includes('new Blob([html], { type: \'text/html\' })'),
  }

  if (!checks.styleTemplatePresent) addFailure(failures, 'shop_receipt_print_geometry_style_template_missing')
  if (!checks.styleInjectedIntoPrintedDocument) addFailure(failures, 'shop_receipt_print_geometry_style_injection_missing')
  if (!checks.printedDocumentDeclaresEnglishEvidenceLanguage) addFailure(failures, 'shop_receipt_print_geometry_language_boundary_missing')
  if (!checks.invalidPageSizeAbsent) addFailure(failures, 'shop_receipt_print_geometry_invalid_page_size_declared')
  if (!checks.rollBranchPresent) addFailure(failures, 'shop_receipt_print_geometry_roll_branch_missing')
  if (!checks.rollBranchSetsPageMarginOnly) addFailure(failures, 'shop_receipt_print_geometry_roll_page_margin_missing')
  if (!checks.rollBranchConstrainsBodyForRoll) addFailure(failures, 'shop_receipt_print_geometry_roll_body_missing')
  if (!checks.narrowRollBranchPresent) addFailure(failures, 'shop_receipt_print_geometry_narrow_roll_branch_missing')
  if (!checks.narrowRollBranchTightensFor58mmClass) addFailure(failures, 'shop_receipt_print_geometry_narrow_roll_body_missing')
  if (!checks.sheetBranchPresent) addFailure(failures, 'shop_receipt_print_geometry_sheet_branch_missing')
  if (!checks.sheetBranchRestoresSheetGeometry) addFailure(failures, 'shop_receipt_print_geometry_sheet_geometry_missing')
  if (!checks.browserPrintOnly) addFailure(failures, 'shop_receipt_print_geometry_unreviewed_transport_added')
  if (!checks.thermalHardwareClaimBoundaryPresent) addFailure(failures, 'shop_receipt_print_geometry_hardware_claim_boundary_missing')
  if (!checks.cssOnlyReceiptGeometry) addFailure(failures, 'shop_receipt_print_geometry_css_only_boundary_missing')

  return signedReport({
    contract: SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    file: input.file || RECEIPT_DIALOG_PATH,
    ok: failures.length === 0,
    status: failures.length ? 'failed' : 'guarded_css_only_roll_geometry',
    failures,
    checks,
    claimBoundary: {
      customerThermalSlipClaimed: false,
      thermalHardwareClaimed: false,
      escposTransportClaimed: false,
      founderDeviceTestRequiredBeforeSalesClaim: true,
      externalWritesPerformed: false,
      productionWritesPerformed: false,
      customerContactPerformed: false,
    },
  })
}

export function validateShopReceiptPrintGeometry(report) {
  const copy = { ...report }
  const actualDigest = copy.digest
  delete copy.digest
  if (actualDigest !== digest(JSON.stringify(copy))) throw new Error('shop_receipt_print_geometry_digest_invalid')
  if (report.contract !== SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT) throw new Error('shop_receipt_print_geometry_contract_invalid')
  if (report.ok !== true || report.status !== 'guarded_css_only_roll_geometry') {
    throw new Error('shop_receipt_print_geometry_not_ready')
  }
  if (report.claimBoundary?.thermalHardwareClaimed !== false
    || report.claimBoundary?.externalWritesPerformed !== false
    || report.claimBoundary?.productionWritesPerformed !== false
    || report.claimBoundary?.founderDeviceTestRequiredBeforeSalesClaim !== true) {
    throw new Error('shop_receipt_print_geometry_claim_boundary_invalid')
  }
  return report
}

function sampleSource(overrides = '') {
  return `// no SuperMega receipt has ever been printed on a thermal printer at all.
// No thermal hardware was involved here.
// direct ESC/POS byte output (S4 proper) stays parked.
const RECEIPT_PRINT_STYLES = \`
    body { font-family: ui-monospace, 'Courier New', monospace; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    @media print {
      @page { margin: 3mm 0; }
      body { margin: 0; padding: 0 4mm; font-size: 0.7rem; line-height: 1.35; }
    }
    @media print and (max-width: 65mm) {
      body { padding: 0 5mm; font-size: 0.6rem; }
    }
    @media print and (min-width: 90mm) {
      @page { margin: 1cm; }
      body { margin: 0.5rem; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    }\`

function openPrintWindow() {
  const html = \`<!DOCTYPE html>
<html lang="en">
<head>
  <style>\${RECEIPT_PRINT_STYLES}
  </style>
</head>
<body></body>
</html>\`
  const blob = new Blob([html], { type: 'text/html' })
  const win = window.open(URL.createObjectURL(blob), '_blank')
  if (win) win.print()
}
${overrides}`
}

export function sampleShopReceiptPrintGeometrySource(overrides = '') {
  return sampleSource(overrides)
}

function runSelfTest() {
  validateShopReceiptPrintGeometry(assessShopReceiptPrintGeometry({ source: sampleSource(), generatedAt: '2026-08-25T00:00:00.000Z' }))

  const withInvalidSize = assessShopReceiptPrintGeometry({
    source: sampleSource().replace('@page { margin: 3mm 0; }', '@page { size: 80mm auto; margin: 3mm 0; }'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  if (withInvalidSize.ok || !withInvalidSize.failures.includes('shop_receipt_print_geometry_invalid_page_size_declared')) {
    throw new Error('shop_receipt_print_geometry_self_test_invalid_size_failed')
  }

  const withRawTransport = assessShopReceiptPrintGeometry({
    source: sampleSource('navigator.bluetooth.requestDevice({ filters: [] })'),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  if (withRawTransport.ok || !withRawTransport.failures.includes('shop_receipt_print_geometry_unreviewed_transport_added')) {
    throw new Error('shop_receipt_print_geometry_self_test_transport_failed')
  }
}

export async function verifyCurrentShopReceiptPrintGeometry() {
  const file = resolve(root, RECEIPT_DIALOG_PATH)
  const source = await readFile(file, 'utf8')
  return assessShopReceiptPrintGeometry({ source, file: RECEIPT_DIALOG_PATH })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    runSelfTest()
    console.log(JSON.stringify({
      ok: true,
      contract: SHOP_RECEIPT_PRINT_GEOMETRY_CONTRACT,
      selfTest: true,
      externalWritesPerformed: false,
    }))
    return
  }

  const fileFlag = args.indexOf('--file')
  const file = fileFlag >= 0 ? resolve(root, args[fileFlag + 1] || '') : resolve(root, RECEIPT_DIALOG_PATH)
  const source = await readFile(file, 'utf8')
  const report = assessShopReceiptPrintGeometry({
    source,
    file: fileFlag >= 0 ? args[fileFlag + 1] : RECEIPT_DIALOG_PATH,
  })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
