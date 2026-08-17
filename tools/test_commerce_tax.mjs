// Contract guard for the Ecommerce order tax calculation.
//
// This is the highest-consequence pure function in the product: it decides what a
// shop charges a customer. It had no test. A rounding or mode error here does not
// crash anything -- it silently overcharges or undercharges every order, and the
// shop only finds out when it reconciles.
//
// Same harness as tools/test_website_export.mjs: showroom has no test runner, so
// this uses plain node:assert with esbuild loading the real module.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { commerceOrderCalculation, commerceTaxDecision } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/tax-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { commerceOrderCalculation } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const CAPTURED_AT = '2026-01-01T00:00:00.000Z'
const AT_TIME = '2026-06-01T00:00:00.000Z'

const stateWith = (mode, rateBasisPoints) => ({
  catalogChanges: [],
  taxConfigurations: [{
    revision: 1,
    code: 'CT',
    label: 'Commercial tax',
    rateBasisPoints,
    mode,
    jurisdictionCode: 'MM',
    effectiveFrom: CAPTURED_AT,
    proof: { actionId: 'ACT-TAX-1', capturedAt: CAPTURED_AT },
  }],
})

// A spread of listed amounts chosen to land on and around rounding boundaries at
// the rates below, plus values a Yangon counter would actually ring up.
const AMOUNTS = [1, 2, 3, 7, 99, 100, 101, 333, 999, 1000, 1001, 12_000, 18_500, 37_000,
  99_999, 100_001, 1_234_567, 9_999_999, 123_456_789]
const RATES = [1, 50, 300, 500, 700, 1000, 1500, 2500]

// --- the invariant that must never break -------------------------------------
// subtotal + tax === total, in both modes, at every rate and amount. This is what
// a reconciliation depends on; if it drifts the books do not balance.
let invariantCases = 0
for (const mode of ['exclusive', 'inclusive']) {
  for (const rate of RATES) {
    for (const listed of AMOUNTS) {
      const calculation = commerceOrderCalculation(stateWith(mode, rate), listed, AT_TIME)
      assert.ok(calculation, `${mode} ${rate}bp ${listed} must produce a calculation`)
      assert.equal(
        calculation.subtotalMmk + calculation.taxMmk,
        calculation.totalMmk,
        `${mode} ${rate}bp on ${listed}: subtotal + tax must equal total`,
      )
      assert.ok(calculation.taxMmk >= 0, `${mode} ${rate}bp on ${listed}: tax must never be negative`)
      assert.ok(calculation.subtotalMmk >= 0, `${mode} ${rate}bp on ${listed}: subtotal must never be negative`)
      assert.ok(Number.isSafeInteger(calculation.totalMmk), `${mode} ${rate}bp on ${listed}: total must stay an exact integer`)

      // Mode is the difference between a price tag that is honoured and one that is not.
      if (mode === 'inclusive') {
        assert.equal(calculation.totalMmk, listed, `inclusive ${rate}bp on ${listed}: the listed price IS the total`)
      } else {
        assert.equal(calculation.subtotalMmk, listed, `exclusive ${rate}bp on ${listed}: the listed price IS the net`)
        assert.ok(calculation.totalMmk >= listed, `exclusive ${rate}bp on ${listed}: total must not fall below the listed price`)
      }
      invariantCases += 1
    }
  }
}
checks += 1
console.log(`  tax invariant held across ${invariantCases} mode/rate/amount combinations`)

// --- rounding ----------------------------------------------------------------
// Round-half-up, verified against hand-computed exact values rather than against
// the implementation's own arithmetic.
const exclusiveTax = (listed, rate) => commerceOrderCalculation(stateWith('exclusive', rate), listed, AT_TIME).taxMmk
// 5% of 101 = 5.05 -> 5;  5% of 110 = 5.5 -> 6 (half rounds up);  5% of 130 = 6.5 -> 7
check(exclusiveTax(101, 500) === 5, '5% of 101 rounds down to 5')
check(exclusiveTax(110, 500) === 6, '5% of 110 is exactly 5.5 and rounds up to 6')
check(exclusiveTax(130, 500) === 7, '5% of 130 is exactly 6.5 and rounds up to 7')
check(exclusiveTax(1, 1) === 0, 'a rate small enough to round to zero yields zero tax, not a fraction')

// Inclusive extraction: at 5%, a 10,500 gross has an exact 500 tax and 10,000 net.
const inclusive = commerceOrderCalculation(stateWith('inclusive', 500), 10_500, AT_TIME)
check(inclusive.taxMmk === 500, 'inclusive 5% on 10,500 extracts exactly 500 tax')
check(inclusive.subtotalMmk === 10_000, 'inclusive 5% on 10,500 leaves exactly 10,000 net')

// --- guards ------------------------------------------------------------------
// A refusal is the correct answer for input that cannot produce an honest total.
for (const bad of [0, -1, -100, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
  check(
    commerceOrderCalculation(stateWith('exclusive', 500), bad, AT_TIME) === null,
    `a listed subtotal of ${bad} is refused rather than priced`,
  )
}

// --- unconfigured tax --------------------------------------------------------
// A shop that has not configured tax must be charged the listed price exactly,
// and the calculation must say so rather than implying a zero-rated tax was applied.
const unconfigured = commerceOrderCalculation({ catalogChanges: [], taxConfigurations: [] }, 37_000, AT_TIME)
check(unconfigured.taxMode === 'not_configured', 'an unconfigured shop is reported as not_configured, not as 0%')
check(unconfigured.totalMmk === 37_000, 'an unconfigured shop charges exactly the listed price')
check(unconfigured.taxMmk === 0, 'an unconfigured shop adds no tax')

// --- effective dating --------------------------------------------------------
// A tax configuration must not apply to orders placed before it took effect, or
// a rate change silently rewrites the price of every historical order.
const future = stateWith('exclusive', 500)
future.taxConfigurations[0].effectiveFrom = '2026-07-01T00:00:00.000Z'
const beforeEffect = commerceOrderCalculation(future, 10_000, '2026-06-01T00:00:00.000Z')
check(beforeEffect.taxMode === 'not_configured', 'an order placed before the tax took effect is not taxed by it')
const afterEffect = commerceOrderCalculation(future, 10_000, '2026-08-01T00:00:00.000Z')
check(afterEffect.taxMmk === 500, 'an order placed after it took effect is taxed at the configured rate')

console.log(`commerce tax contract: ${checks} checks passed`)
