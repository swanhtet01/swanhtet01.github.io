import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `export { decideEcommerceAttention, ecommerceAttentionRequestRank } from './ecommerce-next-action.ts'`,
    resolveDir: 'showroom/src/products/ecommerce',
    sourcefile: 'showroom/src/products/ecommerce/ecommerce-next-action-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const { decideEcommerceAttention, ecommerceAttentionRequestRank } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
const check = (condition, label) => { checks += 1; assert.ok(condition, label) }
const input = (overrides = {}) => ({
  agedRequestCount: 0,
  expiredQuoteCount: 0,
  expiringQuoteCount: 0,
  paymentAttentionCount: 0,
  paymentRiskCount: 0,
  pendingRequestCount: 0,
  refundAttentionCount: 0,
  stockRiskCount: 0,
  ...overrides,
})

const decisions = [
  decideEcommerceAttention(input({ refundAttentionCount: 1 })),
  decideEcommerceAttention(input({ paymentAttentionCount: 1 })),
  decideEcommerceAttention(input({ stockRiskCount: 1 })),
  decideEcommerceAttention(input({ expiredQuoteCount: 1 })),
  decideEcommerceAttention(input({ expiringQuoteCount: 1 })),
  decideEcommerceAttention(input({ paymentRiskCount: 1 })),
  decideEcommerceAttention(input({ agedRequestCount: 1 })),
  decideEcommerceAttention(input({ pendingRequestCount: 1 })),
]
for (const [index, decision] of decisions.entries()) {
  check(Boolean(decision), `decision ${index + 1} exists`)
  check(Boolean(decision?.headline), `decision ${index + 1} has headline`)
  check(Boolean(decision?.summary), `decision ${index + 1} has summary`)
  check(Boolean(decision?.action), `decision ${index + 1} has action`)
}
check(new Set(decisions.map((decision) => decision?.action)).size === decisions.length, 'every attention path has a distinct action')
check(decideEcommerceAttention(input()) === null, 'clear queue returns null')
check(decideEcommerceAttention(input({ refundAttentionCount: 1, paymentAttentionCount: 1 }))?.action === 'Review refunds in Shop', 'refund outranks payment')
check(decideEcommerceAttention(input({ paymentAttentionCount: 1, stockRiskCount: 1 }))?.action === 'Review payments in Shop', 'payment outranks stock')
check(decideEcommerceAttention(input({ stockRiskCount: 1, expiringQuoteCount: 1 }))?.filter === 'stock', 'stock outranks expiry')
check(decideEcommerceAttention(input({ expiredQuoteCount: 1, expiringQuoteCount: 1 }))?.filter === 'expired', 'expired quote outranks upcoming expiry')
check(decideEcommerceAttention(input({ expiringQuoteCount: 1, agedRequestCount: 1 }))?.filter === 'expiring', 'expiry outranks age')
check(decideEcommerceAttention(input({ paymentRiskCount: 1, agedRequestCount: 1 }))?.filter === 'payment', 'payment request outranks age')
check(decideEcommerceAttention(input({ agedRequestCount: 1, pendingRequestCount: 1 }))?.filter === 'aged', 'age outranks normal queue')
let invalidRejected = false
try { decideEcommerceAttention(input({ expiringQuoteCount: Number.NaN })) } catch { invalidRejected = true }
check(invalidRejected, 'invalid count rejected')
check(
  ecommerceAttentionRequestRank('aged', { createdAt: '2026-09-30T08:00:00.000Z' })
    < ecommerceAttentionRequestRank('aged', { createdAt: '2026-09-30T09:00:00.000Z' }),
  'aged requests rank oldest first',
)
check(
  ecommerceAttentionRequestRank('expiring', { createdAt: '2026-09-30T08:00:00.000Z', expiresAt: '2026-09-30T10:00:00.000Z' })
    < ecommerceAttentionRequestRank('expiring', { createdAt: '2026-09-30T08:00:00.000Z', expiresAt: '2026-09-30T11:00:00.000Z' }),
  'expiring requests rank earliest deadline first',
)

console.log(`\ntest_ecommerce_next_action: ${checks} checks passed\n`)
