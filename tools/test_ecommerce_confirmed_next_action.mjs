import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
const context = {
  sampleCatalogPreview: false, importNeeded: false, storefrontSetupRequired: false, ecommerceRefundAttentionCount: 0,
  ecommercePaymentAttentionCount: 0, pendingManagedRequests: [], customerRequestState: 'confirmed',
  ecommerceTodayCartUnits: 1, ecommerceActiveOrderCount: 1, managedIdentity: null, orderImportReview: null,
  ecommerceAttention: null, ecommerceAttentionRequest: null,
  actionablePendingManagedRequests: [],
}
function value(name, next, overrides = {}) {
  const start = source.indexOf(`  const ${name} = `) + `  const ${name} = `.length
  const end = source.indexOf(`  const ${next} = `, start)
  assert.ok(start > name.length && end > start)
  return runInNewContext(source.slice(start, end).trim(), { ...context, ...overrides })
}
test('confirmed retained cart leads to tracking, not duplicate checkout', () => {
  assert.equal(value('ecommerceTodayHeadline', 'ecommerceTodaySummary'), 'Your order is confirmed')
  assert.equal(value('ecommerceTodaySummary', 'ecommerceTodayAction'), 'Track this order, or use Reorder to review another purchase.')
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics'), 'View order')
})
test('unsubmitted cart still leads to checkout and setup keeps priority', () => {
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics', { customerRequestState: 'idle' }), 'Review checkout')
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics', { importNeeded: true }), 'Connect products')
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics', {
    customerRequestState: 'idle',
    ecommerceAttention: { action: 'Review next request' },
    pendingManagedRequests: [{}],
  }), 'Review next request')
})
test('confirmed action requests controlled tracking without preparing another quote', () => {
  const body = source.slice(source.indexOf('  function runOrderAutopilot(event: ReactMouseEvent<HTMLButtonElement>) {'), source.indexOf('\n  useEffect(() => {', source.indexOf('  function runOrderAutopilot(event: ReactMouseEvent<HTMLButtonElement>) {')))
  const calls = []
  runInNewContext(`${body.replaceAll('<HTMLElement>', '').replace('event: ReactMouseEvent<HTMLButtonElement>', 'event')}; runOrderAutopilot()`, {
    ...context, recordBehaviorSignal() {}, window: { localStorage: {} }, location: { pathname: '/', search: '' },
    orderAutopilotStage: 'Continue fulfilment', openBuyingWorkspace: () => calls.push('open'),
    focusCurrentRequestReceipt: () => calls.push('focus'), navigate: () => calls.push('navigate'),
    setTrackingRequest: update => calls.push(update(3)),
    prepareQuoteRecovery: () => calls.push('unexpected quote'),
  })
  assert.deepEqual(calls, [4])
})

test('sample storefront routes to replacement and rejects sellable actions', async () => {
  assert.equal(value('ecommerceTodayHeadline', 'ecommerceTodaySummary', { sampleCatalogPreview: true }), 'Sample storefront is preview-only')
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics', { sampleCatalogPreview: true }), 'Replace sample products')

  const autopilotStart = source.indexOf('  function runOrderAutopilot(event: ReactMouseEvent<HTMLButtonElement>) {')
  const autopilotBody = source.slice(autopilotStart, source.indexOf('\n  useEffect(() => {', autopilotStart))
  const routes = []
  runInNewContext(`${autopilotBody.replace('event: ReactMouseEvent<HTMLButtonElement>', 'event')}; runOrderAutopilot({ timeStamp: 1 })`, {
    ...context,
    sampleCatalogPreview: true,
    orderAutopilotStage: 'Replace sample products',
    recordBehaviorSignal() {},
    window: { localStorage: {} },
    location: { pathname: '/ecommerce/', search: '' },
    navigate: route => routes.push(route),
  })
  assert.deepEqual(routes, ['/shop/?tab=inventory'])

  const saveStart = source.indexOf('  async function saveCurrentStorefront() {')
  const saveBody = source.slice(saveStart, source.indexOf('\n  function discardStorefrontChanges()', saveStart))
  const notices = []
  await runInNewContext(`(async () => { ${saveBody}; await saveCurrentStorefront() })()`, {
    sampleCatalogPreview: true,
    setDraftNotice: notice => notices.push(notice),
  })
  assert.deepEqual(notices, ['Replace the example products in Shop before saving a live store.'])

  const requestStart = source.indexOf('  async function recordManagedBuyingRequest(request: EcommerceOrderRequestV2) {')
  const requestEnd = source.indexOf('\n  function openShopDraft', requestStart)
  const requestBody = source.slice(requestStart, requestEnd)
  const refreshedSampleGuard = requestBody.indexOf("classifyStorefrontCatalogSource(view.inbox.state, 'managed') === 'sample'")
  const managedWrite = requestBody.indexOf('recordCommerceStorefrontRequest(view.inbox.state')
  assert.ok(refreshedSampleGuard > 0 && managedWrite > refreshedSampleGuard, 'managed sample rejection must precede the Shop write')

  const managedSaveStart = source.indexOf('  async function saveManagedStorefront(identity: ManagedIdentity) {')
  const managedSaveEnd = source.indexOf('\n  async function saveCurrentStorefront()', managedSaveStart)
  const managedSaveBody = source.slice(managedSaveStart, managedSaveEnd)
  const refreshedSaveGuard = managedSaveBody.indexOf("classifyStorefrontCatalogSource(view.inbox.state, 'managed') === 'sample'")
  const managedSavePreparation = managedSaveBody.indexOf('prepareManagedStorefrontSave(')
  const managedSaveWrite = managedSaveBody.indexOf('saveManagedCommerceCommand({')
  assert.ok(refreshedSaveGuard > 0
    && managedSavePreparation > refreshedSaveGuard
    && managedSaveWrite > managedSavePreparation,
  'managed sample rejection must precede save preparation and the managed write')

  const importReviewStart = source.indexOf('  function reviewOrderImportBatch() {')
  const importReviewEnd = source.indexOf('\n  async function uploadOrderImportCsv', importReviewStart)
  assert.match(source.slice(importReviewStart, importReviewEnd), /if \(sampleCatalogPreview\)[\s\S]*return/)
  assert.match(source, /disabled=\{sampleCatalogPreview \|\| !orderImportText\.trim\(\)\}/)
  assert.match(source, /function downloadOrderImportReviewPacket\(\) \{\s*if \(sampleCatalogPreview \|\| !orderImportReview\) return/)
})

test('quote recovery ignores expired-only history and opens the customer store', () => {
  const start = source.indexOf('  function prepareQuoteRecovery(event: ReactMouseEvent<HTMLButtonElement>) {')
  const body = source.slice(start, source.indexOf('\n  // The cart and checkout', start))
  const calls = []
  runInNewContext(`${body.replace('event: ReactMouseEvent<HTMLButtonElement>', 'event')}; prepareQuoteRecovery({ timeStamp: 7 })`, {
    actionablePendingManagedRequests: [],
    buyingReady: true,
    customerPreviewItems: [{ sku: 'FRESH-SKU' }],
    finishStorefrontSetup: () => calls.push('setup'),
    globalThis: { performance: { timeOrigin: 100 } },
    navigate: () => calls.push('navigate'),
    setOrderOpsNow() {},
    showWorkspace: workspace => calls.push(`workspace:${workspace}`),
  })
  assert.deepEqual(calls, ['workspace:preview'])
})

test('filtered request inbox excludes expired history from Shop actions', () => {
  assert.match(source, /const requestInboxFilteredRequests = actionablePendingManagedRequests\.filter/)
  assert.doesNotMatch(source, /const requestInboxFilteredRequests = pendingManagedRequests\.filter/)
  assert.match(source, /expiredPendingRequestCount\s*\? 'New customer quote needed'/)
  assert.match(source, /Expired history needs a fresh customer quote\./)
  assert.match(source, /const actionNow = Math\.round\(globalThis\.performance\.timeOrigin \+ event\.timeStamp\)/)
  assert.match(source, /requestQuoteIsExpired\(requestInboxNextRequest, actionNow\)/)
  assert.match(source, /const deliveryReviewCount = actionablePendingManagedRequests\.filter/)
  assert.match(source, /const pickupReviewCount = actionablePendingManagedRequests\.filter/)
  assert.match(source, /requestQuoteIsExpired\(ecommerceAttentionRequest, actionNow\)/)
  assert.match(source, /requestQuoteIsExpired\(customerFollowUpRequest\)[\s\S]*previous quote expired/)
  assert.match(source, /requestQuoteIsExpired\(recoveryRequest, actionNow\)/)
})
