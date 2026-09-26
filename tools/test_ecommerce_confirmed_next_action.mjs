import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
const context = {
  importNeeded: false, storefrontSetupRequired: false, ecommerceRefundAttentionCount: 0,
  ecommercePaymentAttentionCount: 0, pendingManagedRequests: [], customerRequestState: 'confirmed',
  ecommerceTodayCartUnits: 1, ecommerceActiveOrderCount: 1, managedIdentity: null, orderImportReview: null,
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
  assert.equal(value('ecommerceTodayAction', 'ecommerceTodayMetrics', { pendingManagedRequests: [{}] }), 'Review orders in Shop')
})
test('confirmed action opens and focuses tracking without preparing another quote', () => {
  const body = source.slice(source.indexOf('  function runOrderAutopilot() {'), source.indexOf('\n  useEffect(() => {', source.indexOf('  function runOrderAutopilot() {')))
  const calls = []
  const tracking = { focus: () => calls.push('focus'), scrollIntoView: () => calls.push('scroll') }
  runInNewContext(`${body.replaceAll('<HTMLElement>', '')}; runOrderAutopilot()`, {
    ...context, recordBehaviorSignal() {}, window: { localStorage: {} }, location: { pathname: '/', search: '' },
    orderAutopilotStage: 'Continue fulfilment', openBuyingWorkspace: () => calls.push('open'),
    document: { querySelector: () => tracking }, requestAnimationFrame: fn => fn(),
    prepareQuoteRecovery: () => calls.push('unexpected quote'),
  })
  assert.deepEqual(calls, ['open', 'focus', 'scroll'])
})
