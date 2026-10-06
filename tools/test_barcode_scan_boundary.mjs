#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const componentPath = resolve(root, 'showroom', 'src', 'core', 'BarcodeScanButton.tsx')
const coreAppPath = resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx')
const labelsPath = resolve(root, 'showroom', 'src', 'core', 'ShopBarcodeLabels.tsx')
const cssPath = resolve(root, 'showroom', 'src', 'core', 'core-app.css')
const vercelPath = resolve(root, 'vercel.json')
const packagePath = resolve(root, 'showroom', 'package.json')

const component = readFileSync(componentPath, 'utf8')
const coreApp = readFileSync(coreAppPath, 'utf8')
const labels = readFileSync(labelsPath, 'utf8')
const css = readFileSync(cssPath, 'utf8')
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'))
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

let checks = 0

function check(condition, message) {
  checks += 1
  if (!condition) {
    throw new Error(message)
  }
}

function count(source, needle) {
  return source.split(needle).length - 1
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`function_missing:${name}`)
  const bodyStart = source.indexOf('{', start)
  if (bodyStart < 0) throw new Error(`function_body_missing:${name}`)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart + 1, index)
    }
  }
  throw new Error(`function_body_unclosed:${name}`)
}

function importLines(source) {
  return source.split(/\r?\n/).filter((line) => line.startsWith('import '))
}

const componentImports = importLines(component)
check(componentImports.length === 1 && componentImports[0] === "import { useEffect, useRef, useState } from 'react'", 'barcode_component_dependency_boundary_changed')
check(component.includes('interface Window { BarcodeDetector?: BarcodeDetectorConstructor }'), 'barcode_detector_window_contract_missing')
check(component.includes('const DETECT_INTERVAL_MS = 400'), 'barcode_detect_interval_changed')
check(component.includes("typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function') return null"), 'barcode_unsupported_browser_must_render_nothing')
check(component.includes("!navigator.mediaDevices?.getUserMedia"), 'barcode_get_user_media_feature_detect_missing')
check(component.includes("getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })"), 'barcode_camera_constraints_changed')
const permissionsPolicy = vercel.routes?.find((route) => route.src === '/(.*)')?.headers?.['Permissions-Policy'] ?? ''
check(permissionsPolicy === 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()', 'barcode_camera_blocked_by_deployment_policy')
check(component.includes('if (detecting || cancelled || video.readyState < 2) return'), 'barcode_in_flight_or_not_ready_guard_missing')
check(component.includes('barcodes.map((barcode) => barcode.rawValue.trim()).find(Boolean)'), 'barcode_raw_value_trim_missing')
check(component.includes('onDetectedRef.current(value)') && component.includes('setOpen(false)'), 'barcode_detected_value_must_close_dialog')
check(component.includes('stream?.getTracks().forEach((track) => track.stop())'), 'barcode_stream_cleanup_missing')
check(component.includes('if (timer !== undefined) window.clearInterval(timer)'), 'barcode_interval_cleanup_missing')
check(component.includes('video.srcObject = null'), 'barcode_video_detach_missing')
check(component.includes('if (dialog.open) dialog.close()'), 'barcode_dialog_cleanup_missing')
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'mutateCommerce', 'mutateProduction', 'queueAction(']) {
  check(!component.includes(forbidden), `barcode_component_external_or_domain_write_boundary_changed:${forbidden}`)
}

check(coreApp.includes("import { BarcodeScanButton } from './BarcodeScanButton'"), 'core_app_barcode_import_missing')
// Managed setup always renders the same catalogForm; optional template setup follows it.
// Six source sites cover the catalog, sale, stock count, and Plant workflows.
check(count(coreApp, '<BarcodeScanButton') === 6, 'barcode_call_site_count_changed')
const catalogFormStart = coreApp.indexOf('const catalogForm = <form')
const catalogFormEnd = coreApp.indexOf('</form>', catalogFormStart)
check(catalogFormStart >= 0 && catalogFormEnd > catalogFormStart, 'barcode_shared_catalog_form_missing')
const catalogForm = coreApp.slice(catalogFormStart, catalogFormEnd)
check(count(catalogForm, '<BarcodeScanButton') === 1
  && catalogForm.includes('onDetected={(value) => setCatalogDraft((current) => ({ ...current, sku: value }))}'), 'barcode_shared_catalog_scan_must_only_fill_sku')
check(count(coreApp, '{catalogForm}') === 1
  && coreApp.indexOf('{catalogForm}') < coreApp.indexOf('{managedTemplate ? <details className="secondary-setup-path">')
  && !coreApp.includes('</details> : catalogForm}'),
  'barcode_shared_catalog_entry_must_precede_optional_template_setup')
check(coreApp.includes('placeholder="Search or scan SKU"'), 'shop_counter_keyboard_wedge_placeholder_missing')
check(coreApp.includes('onKeyDown={addSearchMatch}'), 'shop_counter_keyboard_wedge_handler_missing')
check(coreApp.includes('label="Scan a barcode with the camera" onDetected={addCameraScan}'), 'shop_counter_camera_handler_missing')
check(count(coreApp, 'label="Scan the product barcode into the SKU field"') === 2, 'shop_catalog_sku_scan_site_count_changed')
check(coreApp.includes('label="Scan the job card to choose this job" onDetected={selectScannedJob}'), 'plant_job_scan_handler_missing')
check(coreApp.includes('label="Scan the material label into the material field" onDetected={applyScannedMaterialRef}'), 'plant_material_scan_handler_missing')

const addSearchMatch = functionBody(coreApp, 'addSearchMatch')
const addCameraScan = functionBody(coreApp, 'addCameraScan')
const selectScannedJob = functionBody(coreApp, 'selectScannedJob')
const applyScannedMaterialRef = functionBody(coreApp, 'applyScannedMaterialRef')
const selectStockCountBarcode = functionBody(coreApp, 'selectStockCountBarcode')
check(coreApp.includes('label="Scan a product barcode for this stock count" onDetected={selectStockCountBarcode}'), 'stock_count_scanner_call_site_missing')
check(selectStockCountBarcode.includes('candidate.sku.toLowerCase() === code.toLowerCase()')
  && selectStockCountBarcode.includes('balances.length === 1')
  && selectStockCountBarcode.includes('balances.find((candidate) => candidate.stockUnitId === stockCountDraft?.stockUnitId')
  && selectStockCountBarcode.includes('Choose the location and lot to count.'), 'stock_count_scan_must_resolve_exact_sku_and_preserve_ambiguous_location_review')
for (const forbidden of ['queueAction(', 'mutateCommerce(', 'countCommerceStock(']) {
  check(!selectStockCountBarcode.includes(forbidden), `stock_count_scan_must_not_write_inventory:${forbidden}`)
}
const recordOutput = functionBody(coreApp, 'recordOutput')
const closeSelectedJobShort = functionBody(coreApp, 'closeSelectedJobShort')
const handleOutputDialogKeyDown = functionBody(coreApp, 'handleOutputDialogKeyDown')

check(addSearchMatch.includes('addScannedValue(query)'), 'keyboard_wedge_must_share_counter_resolution_path')
check(addCameraScan.includes('setQuery(value)') && addCameraScan.includes('addScannedValue(value)'), 'camera_scan_must_share_counter_resolution_path')
check(selectScannedJob.includes('activeJobs.find((job) => job.id.toLocaleLowerCase() === normalized)'), 'plant_job_scan_must_resolve_from_active_jobs')
check(selectScannedJob.includes('if (!match) return setJobScanMiss(scanned.slice(0, 120))'), 'plant_job_scan_miss_must_echo_bounded_code')
check(selectScannedJob.includes("setJobScanMiss('')") && selectScannedJob.includes('setJobId(match.id)'), 'plant_job_scan_success_must_only_select_job')
check(applyScannedMaterialRef.includes('materialRef: value.slice(0, 120)'), 'plant_material_scan_must_share_field_length_cap')
for (const forbidden of ['mutateProduction', 'queueAction', 'setPendingAction', 'setActions']) {
  check(!selectScannedJob.includes(forbidden), `plant_job_scan_must_not_write:${forbidden}`)
  check(!applyScannedMaterialRef.includes(forbidden), `plant_material_scan_must_not_write:${forbidden}`)
}
check(recordOutput.includes('if (jobScanUnresolved) return setNotice('), 'plant_output_submit_guard_missing_after_scan_miss')
check(closeSelectedJobShort.includes('if (jobScanUnresolved) return setNotice('), 'plant_short_close_guard_missing_after_scan_miss')
check(count(coreApp, 'disabled={jobScanUnresolved || !productionCanWrite') >= 2, 'plant_scan_miss_button_disable_boundary_missing')
check(handleOutputDialogKeyDown.includes("closest('dialog[open]')") && handleOutputDialogKeyDown.includes('return'), 'nested_scan_dialog_keyboard_boundary_missing')

check(css.includes('.sku-scan-row { display: flex; align-items: center; gap: var(--space-2); }'), 'sku_scan_row_layout_missing')
check(css.includes('.barcode-scan-button { flex: 0 0 auto; min-width: 44px; min-height: 44px;'), 'barcode_scan_button_touch_target_missing')
check(css.includes('.barcode-scan-video { width: 100%; aspect-ratio: 4 / 3;'), 'barcode_scan_video_stage_missing')
check(css.includes('.plant-job-scan-miss { overflow-wrap: anywhere; }'), 'plant_scan_miss_wrap_missing')

const code128TableSource = labels.match(/const CODE128_BARS = (\[[\s\S]*?\n\])/)
if (!code128TableSource) throw new Error('code128_symbol_table_missing')
const code128Bars = new Function(`return ${code128TableSource[1]}`)()
const code128Path = new Function('CODE128_BARS', 'value', functionBody(labels, 'code128BPath'))
const printableSku = new Function('value', functionBody(labels, 'isPrintableCode128'))
const barcodeCopies = new Function('MAX_LABELS_PER_PRINT', `return function (acceptedQuantity, requestedCopies) { ${functionBody(labels, 'cappedBarcodeCopies')} }`)(50)
check(code128Bars.length === 107 && code128Bars.every((pattern, index) => pattern.length === (index === 106 ? 13 : 11)), 'code128_symbol_table_shape_invalid')
check(printableSku('SKU-014') && printableSku('rice 25kg'), 'valid_ascii_skus_must_use_code128b')
check(!printableSku('') && !printableSku(' leading') && !printableSku('trailing ') && !printableSku('tea\nbox') && !printableSku('茶'), 'invalid_code128b_skus_must_be_rejected')
const encodedHello = code128Path(code128Bars, 'HELLO')
const helloModules = Array(encodedHello.modules).fill('0')
for (const match of encodedHello.path.matchAll(/M(\d+) 0h(\d+)v40h-\d+z/g)) {
  const start = Number(match[1])
  const width = Number(match[2])
  for (let index = start; index < start + width; index += 1) helloModules[index] = '1'
}
check(helloModules.join('') === '110100100001100010100010001101000100011011101000110111010001110110110001010001100011101011', 'code128b_known_hello_vector_mismatch')
const fullAscii = code128Path(code128Bars, Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join(''))
check(fullAscii.modules === 1080 && fullAscii.path.length > 0, 'printable_ascii_code128b_encoding_failed')
check(barcodeCopies(1, 1) === 1 && barcodeCopies(14, 8) === 8, 'label_copies_must_match_request_within_receipt')
check(barcodeCopies(14, 20) === 14 && barcodeCopies(500, 500) === 50, 'label_copies_must_not_exceed_receipt_or_batch_cap')
check(barcodeCopies(0, 1) === 0 && barcodeCopies(1.5, 1) === 0, 'invalid_receipt_quantity_must_not_create_labels')
check(labels.includes('50 × 30 mm') && labels.includes('window.print()'), 'local_browser_print_dimensions_missing')
check(coreApp.includes("movement.kind === 'receipt'") && coreApp.includes('movement.quantityDelta > 0'), 'labels_must_require_positive_accepted_receipt')
check(!labels.includes('dangerouslySetInnerHTML') && !labels.includes('jsbarcode'), 'barcode_svg_must_be_rendered_as_safe_native_markup_without_extra_runtime')
for (const forbidden of ['navigator.usb', 'navigator.serial', 'fetch(', 'mutateCommerce']) {
  check(!labels.includes(forbidden), `label_print_must_not_use_direct_device_or_domain_write:${forbidden}`)
}
check(!packageJson.dependencies?.jsbarcode && !packageJson.devDependencies?.['@types/jsbarcode'], 'unused_multiformat_encoder_dependency_must_not_ship')

console.log(`barcode scan and receipt-label boundary: ${checks} checks passed (CODE128B known vector, printable ASCII and accepted-quantity caps; no scan-triggered writes; keyboard fallback retained)`)
