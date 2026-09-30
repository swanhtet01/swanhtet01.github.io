import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
const context = {
  importNeeded: false, storefrontSetupRequired: false, ecommerceRefundAttentionCount: 0,
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

test('quote recovery ignores expired-only history and starts a fresh cart', () => {
  const start = source.indexOf('  function prepareQuoteRecovery(event: ReactMouseEvent<HTMLButtonElement>) {')
  const body = source.slice(start, source.indexOf('\n  // The cart and checkout', start))
  const calls = []
  runInNewContext(`${body.replace('event: ReactMouseEvent<HTMLButtonElement>', 'event')}; prepareQuoteRecovery({ timeStamp: 7 })`, {
    actionablePendingManagedRequests: [],
    buyingReady: true,
    customerPreviewItems: [{ sku: 'FRESH-SKU' }],
    addToCart: sku => calls.push(`cart:${sku}`),
    finishStorefrontSetup: () => calls.push('setup'),
    globalThis: { performance: { timeOrigin: 100 } },
    navigate: () => calls.push('navigate'),
    setOrderOpsNow() {},
  })
  assert.deepEqual(calls, ['cart:FRESH-SKU'])
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
