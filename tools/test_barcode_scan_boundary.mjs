#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { resolve } from 'node:path'
import { findCommerceItemByScanCode, incrementPurchaseOrderReceiveFromScan, resolveCommerceItemByScanCode } from '../showroom/src/core/commerce-workspace.ts'
import { CAMERA_BARCODE_REARM_ABSENCE_MS, createCameraBarcodeScanSession, nextCameraBarcodeScan, nextCameraBarcodeScans } from '../showroom/src/core/shop-camera-scan-session.ts'
import { cappedShopBarcodeLabelCopies, isPrintableShopBarcode, MAX_SHOP_BARCODE_LABELS_PER_PRINT } from '../showroom/src/core/shop-barcode-labels.ts'
import { unmatchedBarcodeForCreation } from '../showroom/src/core/shop-unmatched-scan.ts'

const root = resolve(import.meta.dirname, '..')
const componentPath = resolve(root, 'showroom', 'src', 'core', 'BarcodeScanButton.tsx')
const scannerDialogPath = resolve(root, 'showroom', 'src', 'core', 'BarcodeScannerDialog.tsx')
const coreAppPath = resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx')
const labelsPath = resolve(root, 'showroom', 'src', 'core', 'ShopBarcodeLabels.tsx')
const cssPath = resolve(root, 'showroom', 'src', 'core', 'core-app.css')
const vercelPath = resolve(root, 'vercel.json')
const packagePath = resolve(root, 'showroom', 'package.json')

const component = readFileSync(componentPath, 'utf8')
const scannerDialog = readFileSync(scannerDialogPath, 'utf8')
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
check(componentImports.length === 1 && componentImports[0] === "import { Component, lazy, Suspense, useState, type ReactNode } from 'react'", 'barcode_component_dependency_boundary_changed')
check(scannerDialog.includes("import { useEffect, useRef, useState } from 'react'"), 'barcode_scanner_dialog_dependency_boundary_changed')
check(component.includes("lazy(() => import('./BarcodeScannerDialog')"), 'barcode_scanner_must_split_into_on_demand_chunk')
check(component.includes('{open && cameraAvailable ? <BarcodeScannerErrorBoundary')
  && component.includes('onClick={() => cameraAvailable ? setOpen(true) : setFallbackOpen((value) => !value)}')
  && component.includes('<Suspense fallback='), 'barcode_scanner_chunk_must_load_after_user_action')
check(component.includes('class BarcodeScannerErrorBoundary extends Component')
  && component.includes('static getDerivedStateFromError()')
  && component.includes('Camera scanner could not load. Type the code manually.'), 'barcode_lazy_chunk_failure_must_preserve_manual_entry')
check(component.includes('Opening camera scanner…') && component.includes('role="status"'), 'barcode_lazy_load_status_missing')
check(component.includes('onClose={() => setOpen(false)}'), 'barcode_dialog_must_close_its_lazy_boundary')
check(scannerDialog.includes('interface Window { BarcodeDetector?: BarcodeDetectorConstructor }'), 'barcode_detector_window_contract_missing')
check(scannerDialog.includes('const DETECT_INTERVAL_MS = 400'), 'barcode_detect_interval_changed')
check(component.includes("typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'")
  && component.includes("if (typeof window === 'undefined') return null"), 'barcode_camera_feature_detection_missing')
check(component.includes("Camera scan unavailable; show scanner options")
  && component.includes('Camera scanning is unavailable in this browser. Use a connected scanner in the code field, or type the code.')
  && component.includes('setFallbackOpen((value) => !value)'), 'barcode_unsupported_browser_must_explain_manual_and_keyboard_scanner_paths')
check(scannerDialog.includes("!navigator.mediaDevices?.getUserMedia"), 'barcode_get_user_media_feature_detect_missing')
check(scannerDialog.includes("getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })"), 'barcode_camera_constraints_changed')
check(scannerDialog.includes('async function start(activeVideo: HTMLVideoElement)') && scannerDialog.includes('void start(video)'), 'barcode_camera_element_must_be_non_null_before_async_start')
const permissionsPolicy = vercel.routes?.find((route) => route.src === '/(.*)')?.headers?.['Permissions-Policy'] ?? ''
check(permissionsPolicy === 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()', 'barcode_camera_blocked_by_deployment_policy')
check(scannerDialog.includes('if (detecting || cancelled || activeVideo.readyState < 2) return'), 'barcode_in_flight_or_not_ready_guard_missing')
check(scannerDialog.includes('barcodes.map((barcode) => barcode.rawValue.trim()).filter(Boolean)'), 'barcode_raw_value_trim_missing')
check(scannerDialog.includes('nextCameraBarcodeScan(scanSessionRef.current, values, Date.now())'), 'continuous_camera_scan_must_track_every_visible_label_and_count_once_per_presentation')
check(scannerDialog.includes('onDetectedRef.current(value)') && scannerDialog.includes('onCloseRef.current()'), 'barcode_detected_value_must_close_dialog')
check(scannerDialog.includes('onDetectedRef.current(value)') && scannerDialog.includes('Remove the label before scanning another unit.'), 'continuous_scan_feedback_must_explain_rearming')
check(component.includes("continuousMode = 'receiving'")
  && component.includes('<BarcodeScannerDialog continuous={continuous} continuousMode={continuousMode}')
  && scannerDialog.includes("continuousMode === 'sale' ? 'Scan items into this sale'")
  && scannerDialog.includes('Added to this sale. Remove the label before scanning it again.'), 'continuous_sale_scanner_must_keep_sale_and_receiving_copy_distinct')
check(scannerDialog.includes('stream?.getTracks().forEach((track) => track.stop())'), 'barcode_stream_cleanup_missing')
check(scannerDialog.includes('if (timer !== undefined) window.clearInterval(timer)'), 'barcode_interval_cleanup_missing')
check(scannerDialog.includes('video.srcObject = null'), 'barcode_video_detach_missing')
check(scannerDialog.includes('if (dialog.open) dialog.close()'), 'barcode_dialog_cleanup_missing')
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'mutateCommerce', 'mutateProduction', 'queueAction(']) {
  check(!component.includes(forbidden) && !scannerDialog.includes(forbidden), `barcode_component_external_or_domain_write_boundary_changed:${forbidden}`)
}

check(coreApp.includes("import { BarcodeScanButton } from './BarcodeScanButton'"), 'core_app_barcode_import_missing')
// Managed setup always renders the same catalogForm; optional template setup follows it.
// Eight source sites cover catalog setup/edit, sale, stock count, purchase receiving, and Plant.
check(count(coreApp, '<BarcodeScanButton') === 8, 'barcode_call_site_count_changed')
const catalogFormStart = coreApp.indexOf('const catalogForm = <form')
const catalogFormEnd = coreApp.indexOf('</form>', catalogFormStart)
check(catalogFormStart >= 0 && catalogFormEnd > catalogFormStart, 'barcode_shared_catalog_form_missing')
const catalogForm = coreApp.slice(catalogFormStart, catalogFormEnd)
check(count(catalogForm, '<BarcodeScanButton') === 1
  && catalogForm.includes('label="Scan the product barcode" onDetected={(value) => setCatalogDraft((current) => ({ ...current, barcode: value }))}')
  && !catalogForm.includes('onDetected={(value) => setCatalogDraft((current) => ({ ...current, sku: value }))}'), 'barcode_shared_catalog_scan_must_fill_barcode_not_sku')
check(count(coreApp, '{catalogForm}') === 1
  && coreApp.indexOf('{catalogForm}') < coreApp.indexOf('{managedTemplate ? <details className="secondary-setup-path">')
  && !coreApp.includes('</details> : catalogForm}'),
  'barcode_shared_catalog_entry_must_precede_optional_template_setup')
check(coreApp.includes("placeholder={uiText('Search products or scan barcode')}"), 'shop_counter_keyboard_wedge_placeholder_missing')
check(coreApp.includes('onKeyDown={addSearchMatch}'), 'shop_counter_keyboard_wedge_handler_missing')
check(coreApp.includes("continuous continuousMode=\"sale\" label={uiText('Find or scan an item')} onDetected={addCameraScan}"), 'shop_counter_camera_scanner_must_stay_open_for_repeated_sales_scans')
check(coreApp.includes('onClick={() => onCreateFromBarcode(unmatchedBarcode)}'), 'unmatched_barcode_must_offer_an_explicit_add_action')
check(count(coreApp, 'label="Scan the product barcode" onDetected=') >= 3,
  'shop_product_barcode_scan_controls_missing')
check(coreApp.includes('label="Scan the product barcode" onDetected={(value) => setCatalogDraft((current) => ({ ...current, barcode: value }))}'), 'shop_managed_catalog_scan_must_fill_barcode')
check(coreApp.includes('label="Scan the product barcode" onDetected={(value) => setItemDraft((current) => ({ ...current, barcode: value }))}'), 'shop_first_product_scan_must_only_fill_barcode')
check(coreApp.includes('label="Scan the job card to choose this job" onDetected={selectScannedJob}'), 'plant_job_scan_handler_missing')
check(coreApp.includes('label="Scan the material label into the material field" onDetected={applyScannedMaterialRef}'), 'plant_material_scan_handler_missing')

const addSearchMatch = functionBody(coreApp, 'addSearchMatch')
const addCameraScan = functionBody(coreApp, 'addCameraScan')
const openCatalogCreateFromBarcode = functionBody(coreApp, 'openCatalogCreateFromBarcode')
let testLocale = 'en'
const testUiLocale = () => testLocale
const testUiText = (english) => testLocale === 'my' && english === 'added to this sale.'
  ? 'ဤအရောင်းထဲ ထည့်ပြီးပါပြီ။' : english
const addScannedValue = new Function('items', 'resolveCommerceItemByScanCode', 'addItem', 'setQuery', 'setScanFeedback', 'setUnmatchedBarcode', 'unmatchedBarcodeForCreation', 'readUiLocale', 'uiText', 'value', 'source', functionBody(coreApp, 'addScannedValue'))
const addCounterItem = new Function('tickets', 'setCart', 'setScanFeedback', 'item', functionBody(coreApp, 'addItem'))
const searchHandler = new Function('event', 'items', 'normalizedQuery', 'query', 'resolveCommerceItemByScanCode', 'addItem', 'addScannedValue', 'setCatalogPage', 'setScanFeedback', 'setUnmatchedBarcode', 'setQuery', 'readUiLocale', 'uiText', addSearchMatch)
check(openCatalogCreateFromBarcode.includes("setItemDraft({ sku: '', barcode, name: '', nameMy: '', category: '', onHand: '', reorderAt: '0', price: '' })")
  && openCatalogCreateFromBarcode.includes('setCatalogCreateOpen(true)')
  && openCatalogCreateFromBarcode.includes("navigate('/shop/?tab=inventory#shop-catalog-create')"),
  'unmatched_barcode_add_action_must_prefill_the_review_form')
check(!/queueAction\(|mutateCommerce\(|registerCommerceItem\(/.test(openCatalogCreateFromBarcode),
  'scanning_an_unknown_barcode_must_not_create_a_product')
check(functionBody(coreApp, 'updateBasket').includes('return tickets.dispatch(')
  && functionBody(coreApp, 'setCart').includes('return updateBasket('), 'counter_save_rejection_must_reach_scan_handler')
function runCounterScan(items, value) {
  const added = []
  const queries = []
  const feedback = []
  const createCandidates = []
  const matched = addScannedValue(items, resolveCommerceItemByScanCode, (item) => { added.push(item.sku); feedback.push(''); return true }, (query) => queries.push(query), (message) => feedback.push(message), (code) => createCandidates.push(code), unmatchedBarcodeForCreation, testUiLocale, testUiText, value, 'keyboard')
  return { matched, added, queries, feedback, createCandidates }
}
const counterItems = [
  { sku: 'MUG-10', barcode: '00012345', name: 'Ceramic Mug', nameMy: 'ကြွေခွက်', onHand: 4 },
  { sku: 'LAMP-02', name: 'Desk Lamp', onHand: 0 },
]
function runCounterSearch(query, items = counterItems) {
  const added = []
  const feedback = []
  const resetQueries = []
  const scanQueries = []
  const pages = []
  searchHandler({ key: 'Enter', preventDefault() {} }, items, query.trim().toLocaleLowerCase(), query, resolveCommerceItemByScanCode,
    item => { added.push(item.sku); return true }, value => { scanQueries.push(value); return false },
    page => pages.push(page), message => feedback.push(message), () => {}, value => resetQueries.push(value), testUiLocale, testUiText)
  return { added, feedback, resetQueries, scanQueries, pages }
}
const exactNameSearch = runCounterSearch('Ceramic Mug')
check(exactNameSearch.added.join() === 'MUG-10' && exactNameSearch.resetQueries.join() === ''
  && exactNameSearch.feedback.at(-1)?.includes('Ceramic Mug added to this sale.'), 'enter_exact_product_name_must_add_one_item_and_confirm_the_english_name')
const exactBurmeseNameSearch = runCounterSearch('ကြွေခွက်')
check(exactBurmeseNameSearch.added.join() === 'MUG-10', 'enter_exact_burmese_product_name_must_add_one_item')
const duplicateNameSearch = runCounterSearch('Ceramic Mug', [...counterItems, { sku: 'MUG-12', name: 'Ceramic Mug', onHand: 2 }])
check(duplicateNameSearch.added.length === 0 && duplicateNameSearch.feedback.at(-1)?.includes('More than one product'), 'duplicate_exact_product_names_must_not_choose_arbitrarily')
const partialNameSearch = runCounterSearch('Ceramic')
check(partialNameSearch.added.length === 0 && partialNameSearch.scanQueries.join() === 'Ceramic', 'partial_product_search_must_remain_a_choice_not_an_automatic_sale')
const exactCounterScan = runCounterScan(counterItems, ' mug-10 ')
check(exactCounterScan.matched && exactCounterScan.added.join() === 'MUG-10' && exactCounterScan.queries.join() === '' && exactCounterScan.feedback.at(-1)?.includes('Ceramic Mug added to this sale.'), 'exact_case_insensitive_counter_scan_must_confirm_the_english_item_name_and_clear_search')
const exactBarcodeScan = runCounterScan(counterItems, '00012345')
check(exactBarcodeScan.matched && exactBarcodeScan.added.join() === 'MUG-10' && exactBarcodeScan.queries.join() === '' && exactBarcodeScan.feedback.at(-1)?.includes('Ceramic Mug added to this sale.'), 'barcode_scan_must_preserve_leading_zeroes_and_confirm_the_english_item_name')
testLocale = 'my'
const burmeseCounterScan = runCounterScan(counterItems, '00012345')
check(burmeseCounterScan.matched && burmeseCounterScan.feedback.at(-1)?.includes('ကြွေခွက် ဤအရောင်းထဲ ထည့်ပြီးပါပြီ။'), 'burmese_mode_scan_confirms_burmese_name_without_english_copy')
testLocale = 'en'
const duplicateCodeItems = [...counterItems, { sku: 'MUG-11', barcode: '00012345', name: 'Travel Mug', onHand: 6 }]
const ambiguousBarcodeScan = runCounterScan(duplicateCodeItems, '00012345')
check(!ambiguousBarcodeScan.matched && ambiguousBarcodeScan.added.length === 0 && ambiguousBarcodeScan.queries.length === 0
  && !ambiguousBarcodeScan.createCandidates.some(Boolean) && ambiguousBarcodeScan.feedback[0]?.includes('more than one product'),
'duplicate_barcode_must_explain_ambiguity_without_adding_or_creating')
check(resolveCommerceItemByScanCode(duplicateCodeItems, '00012345').kind === 'ambiguous'
  && resolveCommerceItemByScanCode(counterItems, '00012345').kind === 'matched'
  && resolveCommerceItemByScanCode(counterItems, 'MISSING-01').kind === 'not_found',
'scan_resolver_must_distinguish_duplicate_exact_and_missing_codes')
const unmatchedBarcodeScan = runCounterScan(counterItems, '0009988776655')
check(!unmatchedBarcodeScan.matched && unmatchedBarcodeScan.createCandidates.join() === '0009988776655', 'unmatched_barcode_scan_must_offer_exact_code_for_reviewed_product_creation')
for (const value of ['MUG', 'UG-10', 'Ceramic Mug', 'MUG-1', 'UNKNOWN']) {
  const miss = runCounterScan(counterItems, value)
  check(!miss.matched && miss.added.length === 0 && miss.queries.length === 0 && miss.feedback[0]?.includes('SKU or barcode'), `counter_scan_must_not_auto_add_fuzzy_or_unknown_match:${value}`)
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
  const scan = (value) => addScannedValue(counterItems, resolveCommerceItemByScanCode,
    (item) => addCounterItem(tickets, setCart, (message) => feedback.push(message), item),
    (query) => queries.push(query), (message) => feedback.push(message), () => {}, unmatchedBarcodeForCreation, testUiLocale, testUiText, value, 'keyboard')
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
const scannedBarcodeSale = runRealCounterScan(0)
check(scannedBarcodeSale.scan('00012345') && scannedBarcodeSale.cart()['MUG-10'] === 1,
  'barcode_scan_must_increment_only_the_matching_sale_line')
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
check(selectStockCountBarcode.includes('findCommerceItemByScanCode(commerce.items, code)')
  && selectStockCountBarcode.includes('balances.length === 1')
  && selectStockCountBarcode.includes('balances.find((candidate) => candidate.stockUnitId === stockCountDraft?.stockUnitId')
  && selectStockCountBarcode.includes('Choose the location and lot to count.'), 'stock_count_scan_must_resolve_exact_sku_and_preserve_ambiguous_location_review')
for (const forbidden of ['queueAction(', 'mutateCommerce(', 'countCommerceStock(']) {
  check(!selectStockCountBarcode.includes(forbidden), `stock_count_scan_must_not_write_inventory:${forbidden}`)
}
check(coreApp.includes('<BarcodeScanButton continuous')
  && coreApp.includes('label="Scan items for this purchase receipt" onDetected={scanPurchaseOrderReceivedUnit}'), 'purchase_receipt_continuous_scan_control_missing')
check(coreApp.includes('onKeyDown={handlePurchaseOrderScanKeyDown}')
  && coreApp.includes('placeholder="Scan barcode or type SKU" value={purchaseOrderScanCode}'), 'purchase_receipt_hid_scanner_field_missing')
check(coreApp.includes('quantity: String(result.acceptedUnits)'), 'purchase_receipt_scan_must_increment_accepted_units_only')
check(coreApp.includes('Review the receipt before stock changes.'), 'purchase_receipt_scan_must_keep_stock_write_behind_review')
const purchaseOrderScanHandler = functionBody(coreApp, 'scanPurchaseOrderReceivedUnit')
for (const forbidden of ['queueAction(', 'mutateCommerce(', 'receiveCommercePurchaseOrder(']) {
  check(!purchaseOrderScanHandler.includes(forbidden), `purchase_receipt_scan_must_only_update_draft:${forbidden}`)
}

const receiveItems = [
  { sku: 'RICE-25', barcode: '000042', name: 'Premium rice', onHand: 8 },
  { sku: 'SOAP-01', barcode: '000043', name: 'Soap', onHand: 12 },
]
const purchaseOrderItem = receiveItems[0]
const receivedFirst = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: '000042', acceptedUnits: 0, maximumAcceptedUnits: 5 })
check(receivedFirst.ok && receivedFirst.acceptedUnits === 1, 'purchase_receipt_barcode_must_add_one_exact_unit')
const receivedNext = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: 'rice-25', acceptedUnits: 1, maximumAcceptedUnits: 5 })
check(receivedNext.ok && receivedNext.acceptedUnits === 2, 'purchase_receipt_scans_must_accumulate_in_draft')
const receiveWrongItem = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: '000043', acceptedUnits: 1, maximumAcceptedUnits: 5 })
check(!receiveWrongItem.ok && receiveWrongItem.reason === 'wrong_purchase_order_item', 'wrong_purchase_order_barcode_must_not_increment_count')
const receiveUnknown = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: 'UNKNOWN', acceptedUnits: 1, maximumAcceptedUnits: 5 })
check(!receiveUnknown.ok && receiveUnknown.reason === 'item_not_found', 'unrecognized_purchase_receipt_code_must_not_increment_count')
const receiveAtLimit = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: '000042', acceptedUnits: 5, maximumAcceptedUnits: 5 })
check(!receiveAtLimit.ok && receiveAtLimit.reason === 'receipt_limit_reached', 'purchase_receipt_scan_must_stop_at_ordered_quantity')
const receiveInvalidCount = incrementPurchaseOrderReceiveFromScan({ items: receiveItems, purchaseOrderItem, rawCode: '000042', acceptedUnits: 2.5, maximumAcceptedUnits: 5 })
check(!receiveInvalidCount.ok && receiveInvalidCount.reason === 'invalid_count', 'invalid_purchase_receipt_count_must_fail_closed')

const cameraSession = createCameraBarcodeScanSession()
check(CAMERA_BARCODE_REARM_ABSENCE_MS >= 3 * 400, 'camera_scan_rearm_window_must_cover_multiple_detector_frames')
check(nextCameraBarcodeScans(cameraSession, [' 000042 ', '000042'], 1000).join() === '000042', 'camera_scan_must_trim_and_deduplicate_one_visible_label')
check(nextCameraBarcodeScans(cameraSession, ['000042'], 1400).length === 0, 'camera_scan_must_not_repeat_a_held_label')
check(nextCameraBarcodeScans(cameraSession, [], 1800).length === 0, 'camera_scan_must_wait_for_label_to_leave_view')
check(nextCameraBarcodeScans(cameraSession, [], 2600).length === 0, 'camera_scan_must_not_emit_while_label_is_absent')
check(nextCameraBarcodeScans(cameraSession, ['000042'], 3000).join() === '000042', 'camera_scan_must_rearm_after_label_is_absent_long_enough')
const unstableCameraSession = createCameraBarcodeScanSession()
nextCameraBarcodeScans(unstableCameraSession, ['SKU-1'], 1000)
nextCameraBarcodeScans(unstableCameraSession, [], 1400)
check(nextCameraBarcodeScans(unstableCameraSession, ['SKU-1'], 2400).length === 0, 'camera_scan_must_not_rearm_after_a_brief_detection_gap')
const multiLabelSession = createCameraBarcodeScanSession()
check(nextCameraBarcodeScan(multiLabelSession, ['SKU-A', 'SKU-B'], 1000) === 'SKU-A', 'camera_scan_must_emit_only_one_of_two_new_labels_per_frame')
check(nextCameraBarcodeScan(multiLabelSession, ['SKU-B', 'SKU-A'], 1400) === 'SKU-B', 'camera_scan_must_offer_second_label_without_rearming_first_on_detector_reorder')
check(nextCameraBarcodeScan(multiLabelSession, ['SKU-A', 'SKU-B'], 1800) === undefined, 'camera_scan_must_not_repeat_held_labels_after_detector_reorder')
check(nextCameraBarcodeScan(multiLabelSession, ['SKU-A'], 2200) === undefined, 'camera_scan_must_not_rearm_first_label_when_second_leaves')

const recordOutput = functionBody(coreApp, 'recordOutput')
const closeSelectedJobShort = functionBody(coreApp, 'closeSelectedJobShort')
const handleOutputDialogKeyDown = functionBody(coreApp, 'handleOutputDialogKeyDown')

check(addSearchMatch.includes("addScannedValue(query, 'keyboard')"), 'keyboard_wedge_must_share_counter_resolution_path')
check(addCameraScan.includes('setQuery(value)') && addCameraScan.includes("addScannedValue(value, 'camera')"), 'camera_scan_must_share_counter_resolution_path')
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
const printableSku = isPrintableShopBarcode
const barcodeCopies = cappedShopBarcodeLabelCopies
check(code128Bars.length === 107 && code128Bars.every((pattern, index) => pattern.length === (index === 106 ? 13 : 11)), 'code128_symbol_table_shape_invalid')
check(MAX_SHOP_BARCODE_LABELS_PER_PRINT === 50, 'shop_barcode_label_batch_cap_changed')
check(printableSku('SKU-014') && printableSku('rice 25kg'), 'valid_ascii_skus_must_use_code128b')
check(!printableSku('') && !printableSku(' leading') && !printableSku('trailing ') && !printableSku('tea\nbox') && !printableSku('茶'), 'invalid_code128b_skus_must_be_rejected')
check(printableSku('x'.repeat(80)) && !printableSku('x'.repeat(81)), 'barcode_input_length_limit_changed')
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
