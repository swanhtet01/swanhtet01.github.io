#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
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
const stockCountScanSource = readFileSync(resolve(root, 'showroom', 'src', 'core', 'shop-stock-count-scan.ts'), 'utf8')
const strippedStockCountScan = stripTypeScriptTypes(stockCountScanSource, { mode: 'strip' })
const stockCountScanModule = await import(`data:text/javascript;base64,${Buffer.from(strippedStockCountScan).toString('base64')}`)
const { applyStockCountScan } = stockCountScanModule

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
check(count(coreApp, 'label="Scan the product barcode into the SKU field" onDetected=') === 1
  && count(coreApp, 'label="Scan a product code into the SKU field" onDetected=') === 1,
  'shop_catalog_sku_scan_controls_missing_or_duplicated')
check(coreApp.includes('label="Scan the product barcode into the SKU field" onDetected={(value) => setCatalogDraft((current) => ({ ...current, sku: value }))}'), 'shop_managed_catalog_scan_must_only_fill_sku')
check(coreApp.includes('label="Scan a product code into the SKU field" onDetected={(value) => setItemDraft((current) => ({ ...current, sku: value }))}'), 'shop_first_product_scan_must_only_fill_sku')
check(coreApp.includes('label="Scan the job card to choose this job" onDetected={selectScannedJob}'), 'plant_job_scan_handler_missing')
check(coreApp.includes('label="Scan the material label into the material field" onDetected={applyScannedMaterialRef}'), 'plant_material_scan_handler_missing')

const addSearchMatch = functionBody(coreApp, 'addSearchMatch')
const addCameraScan = functionBody(coreApp, 'addCameraScan')
const addScannedValue = new Function('items', 'addItem', 'setQuery', 'setScanFeedback', 'value', functionBody(coreApp, 'addScannedValue'))
const addCounterItem = new Function('tickets', 'setCart', 'setScanFeedback', 'item', functionBody(coreApp, 'addItem'))
check(functionBody(coreApp, 'updateBasket').includes('return tickets.dispatch(')
  && functionBody(coreApp, 'setCart').includes('return updateBasket('), 'counter_save_rejection_must_reach_scan_handler')
function runCounterScan(items, value) {
  const added = []
  const queries = []
  const feedback = []
  const matched = addScannedValue(items, (item) => { added.push(item.sku); feedback.push(''); return true }, (query) => queries.push(query), (message) => feedback.push(message), value)
  return { matched, added, queries, feedback }
}
const counterItems = [
  { sku: 'MUG-10', name: 'Ceramic Mug', onHand: 4 },
  { sku: 'LAMP-02', name: 'Desk Lamp', onHand: 0 },
]
const exactCounterScan = runCounterScan(counterItems, ' mug-10 ')
check(exactCounterScan.matched && exactCounterScan.added.join() === 'MUG-10' && exactCounterScan.queries.join() === '' && exactCounterScan.feedback.join() === '', 'exact_case_insensitive_counter_scan_must_add_one_item_and_clear_search')
for (const value of ['MUG', 'UG-10', 'Ceramic Mug', 'MUG-1', 'UNKNOWN']) {
  const miss = runCounterScan(counterItems, value)
  check(!miss.matched && miss.added.length === 0 && miss.queries.length === 0 && miss.feedback[0]?.includes('exact SKU'), `counter_scan_must_not_auto_add_fuzzy_or_unknown_match:${value}`)
}
const outOfStockCounterScan = runCounterScan(counterItems, 'LAMP-02')
check(!outOfStockCounterScan.matched && outOfStockCounterScan.added.length === 0, 'out_of_stock_counter_scan_must_not_add_item')
const ambiguousCounterScan = runCounterScan([{ sku: 'MUG-10', onHand: 4 }, { sku: 'mug-10', onHand: 4 }], 'MUG-10')
check(!ambiguousCounterScan.matched && ambiguousCounterScan.added.length === 0, 'duplicate_counter_skus_must_fail_closed')
function runRealCounterScan(initialQuantity, saveAccepted = true) {
  let cart = initialQuantity ? { 'MUG-10': initialQuantity } : {}
  const queries = []
  const feedback = []
  const tickets = { getSnapshot: () => ({ state: { cart } }) }
  const setCart = (value) => {
    if (!saveAccepted) return false
    cart = typeof value === 'function' ? value(cart) : value
    return true
  }
  const scan = (value) => addScannedValue(counterItems,
    (item) => addCounterItem(tickets, setCart, (message) => feedback.push(message), item),
    (query) => queries.push(query), (message) => feedback.push(message), value)
  return { scan, cart: () => cart, queries, feedback }
}
const cappedCounter = runRealCounterScan(3)
check(cappedCounter.scan('MUG-10') && cappedCounter.cart()['MUG-10'] === 4, 'scan_must_add_last_available_item')
check(!cappedCounter.scan('MUG-10') && cappedCounter.cart()['MUG-10'] === 4
  && cappedCounter.queries.length === 1 && cappedCounter.feedback.at(-1)?.includes('Stock limit'),
  'scan_at_stock_cap_must_not_clear_code_or_report_success')
const refusedCounter = runRealCounterScan(0, false)
check(!refusedCounter.scan('MUG-10') && !refusedCounter.cart()['MUG-10']
  && refusedCounter.queries.length === 0 && refusedCounter.feedback.at(-1)?.includes('saving paused'),
  'rejected_counter_save_must_not_look_like_added_item')
check(coreApp.includes('disabled={item.onHand < 1 || quantity >= item.onHand}'), 'product_tile_must_disable_at_sale_stock_cap')
const selectScannedJob = functionBody(coreApp, 'selectScannedJob')
const applyScannedMaterialRef = functionBody(coreApp, 'applyScannedMaterialRef')
const selectStockCountBarcode = functionBody(coreApp, 'selectStockCountBarcode')
const firstStockScan = applyStockCountScan(null, { sku: 'RICE-01' })
check(firstStockScan.status === 'selected' && firstStockScan.draft?.quantity === '1', 'stock_count_scan_must_start_uncommitted_count_at_one')
const repeatStockScan = applyStockCountScan(firstStockScan.draft, { sku: 'RICE-01' })
check(repeatStockScan.status === 'incremented' && repeatStockScan.draft?.quantity === '2', 'repeated_stock_scan_must_increment_only_the_draft')
const manualStockScan = applyStockCountScan({ sku: 'RICE-01', stockUnitId: '', locationId: '', quantity: '12' }, { sku: 'RICE-01' })
check(manualStockScan.status === 'incremented' && manualStockScan.draft?.quantity === '13', 'scanner_must_increment_valid_manual_count')
const protectedStockScan = applyStockCountScan({ sku: 'RICE-01', stockUnitId: 'LOT-1', locationId: 'STORE-1', quantity: '4' }, { sku: 'SOAP-02' })
check(protectedStockScan.status === 'finish-current' && protectedStockScan.draft?.quantity === '4', 'different_product_scan_must_preserve_current_count')
const emptySwitchScan = applyStockCountScan({ sku: 'RICE-01', stockUnitId: '', locationId: '', quantity: '' }, { sku: 'SOAP-02' })
check(emptySwitchScan.status === 'selected' && emptySwitchScan.draft?.sku === 'SOAP-02' && emptySwitchScan.draft.quantity === '1', 'empty_count_must_allow_a_new_scanned_product')
const serialStockScan = applyStockCountScan(firstStockScan.draft, { sku: 'RICE-01', serial: true })
check(serialStockScan.status === 'serial-limit', 'serial_item_duplicate_scan_must_fail_closed')
const invalidStockScan = applyStockCountScan({ sku: 'RICE-01', stockUnitId: '', locationId: '', quantity: '3x' }, { sku: 'RICE-01' })
check(invalidStockScan.status === 'invalid-current' && invalidStockScan.draft?.quantity === '3x', 'invalid_count_must_be_preserved')
const overflowStockScan = applyStockCountScan({ sku: 'RICE-01', stockUnitId: '', locationId: '', quantity: String(Number.MAX_SAFE_INTEGER) }, { sku: 'RICE-01' })
check(overflowStockScan.status === 'count-overflow', 'unsafe_count_overflow_must_fail_closed')
check(!/fetch\(|XMLHttpRequest|mutateCommerce|countCommerceStock|queueAction\(/.test(stockCountScanSource), 'stock_count_scan_helper_must_not_write_or_call_network')
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
