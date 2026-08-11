// Shop tax configuration summary: totalConfigurations, uniqueCodes, byMode, highestRateBasisPoints,
// withJurisdiction, withEffectiveFrom.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopTaxConfigurationSummary } from './shop-tax-configuration-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/tax-configuration-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopTaxConfigurationSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'r', evidenceReference: 'e' }
let seq = 0

function taxConfig({
  code = 'TAX-MM',
  mode = 'exclusive',
  rateBasisPoints = 500,
  jurisdictionCode = undefined,
  effectiveFrom = undefined,
} = {}) {
  seq++
  return {
    revision: seq,
    code,
    label: `Tax ${code}`,
    rateBasisPoints,
    mode,
    ...(jurisdictionCode !== undefined ? { jurisdictionCode } : {}),
    ...(effectiveFrom !== undefined ? { effectiveFrom } : {}),
    proof: PROOF,
  }
}

function state(taxConfigurations = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(taxConfigurations !== undefined ? { taxConfigurations } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopTaxConfigurationSummary(state())
  check(r.totalConfigurations === 0, 'empty: totalConfigurations 0')
  check(r.uniqueCodes === 0, 'empty: uniqueCodes 0')
  check(r.byMode.exclusive === 0, 'empty: byMode.exclusive 0')
  check(r.byMode.inclusive === 0, 'empty: byMode.inclusive 0')
  check(r.highestRateBasisPoints === 0, 'empty: highestRateBasisPoints 0')
  check(r.withJurisdiction === 0, 'empty: withJurisdiction 0')
  check(r.withEffectiveFrom === 0, 'empty: withEffectiveFrom 0')
}

// 2. Empty array → totalConfigurations 0
{
  const r = projectShopTaxConfigurationSummary(state([]))
  check(r.totalConfigurations === 0, 'empty-array: totalConfigurations 0')
}

// 3. Single exclusive config, with jurisdiction and effectiveFrom
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ code: 'TAX-MM', mode: 'exclusive', rateBasisPoints: 1000, jurisdictionCode: 'MM-RGN', effectiveFrom: '2026-01-01' }),
  ]))
  check(r.totalConfigurations === 1, 'single: totalConfigurations 1')
  check(r.uniqueCodes === 1, 'single: uniqueCodes 1')
  check(r.byMode.exclusive === 1, 'single: byMode.exclusive 1')
  check(r.byMode.inclusive === 0, 'single: byMode.inclusive 0')
  check(r.highestRateBasisPoints === 1000, 'single: highestRateBasisPoints 1000')
  check(r.withJurisdiction === 1, 'single: withJurisdiction 1')
  check(r.withEffectiveFrom === 1, 'single: withEffectiveFrom 1')
}

// 4. Inclusive mode increments inclusive
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ mode: 'inclusive' }),
  ]))
  check(r.byMode.inclusive === 1, 'inclusive: byMode.inclusive 1')
  check(r.byMode.exclusive === 0, 'inclusive: byMode.exclusive stays 0')
}

// 5. uniqueCodes dedup: same code two revisions → 1
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ code: 'TAX-MM' }),
    taxConfig({ code: 'TAX-MM' }),
  ]))
  check(r.uniqueCodes === 1, 'dedup-code: uniqueCodes 1')
  check(r.totalConfigurations === 2, 'dedup-code: totalConfigurations 2')
}

// 6. uniqueCodes: 2 distinct codes → 2
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ code: 'TAX-A' }),
    taxConfig({ code: 'TAX-B' }),
  ]))
  check(r.uniqueCodes === 2, 'dist-code: uniqueCodes 2')
}

// 7. byMode accumulates: 2 exclusive, 1 inclusive
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ mode: 'exclusive' }),
    taxConfig({ mode: 'exclusive' }),
    taxConfig({ mode: 'inclusive' }),
  ]))
  check(r.byMode.exclusive === 2, 'mode-accum: exclusive 2')
  check(r.byMode.inclusive === 1, 'mode-accum: inclusive 1')
}

// 8. highestRateBasisPoints picks max
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ rateBasisPoints: 500 }),
    taxConfig({ rateBasisPoints: 1500 }),
    taxConfig({ rateBasisPoints: 800 }),
  ]))
  check(r.highestRateBasisPoints === 1500, 'rate-max: highestRateBasisPoints 1500')
}

// 9. withJurisdiction partial: 1 with, 1 without → 1
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ jurisdictionCode: 'MM-RGN' }),
    taxConfig({ jurisdictionCode: undefined }),
  ]))
  check(r.withJurisdiction === 1, 'jur-partial: withJurisdiction 1')
}

// 10. withEffectiveFrom partial: 1 with, 1 without → 1
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ effectiveFrom: '2026-01-01' }),
    taxConfig({ effectiveFrom: undefined }),
  ]))
  check(r.withEffectiveFrom === 1, 'eff-partial: withEffectiveFrom 1')
}

// 11. both absent → withJurisdiction 0, withEffectiveFrom 0
{
  const r = projectShopTaxConfigurationSummary(state([
    taxConfig({ jurisdictionCode: undefined, effectiveFrom: undefined }),
  ]))
  check(r.withJurisdiction === 0, 'no-jur: withJurisdiction 0')
  check(r.withEffectiveFrom === 0, 'no-eff: withEffectiveFrom 0')
}

console.log(JSON.stringify({ ok: true, checks }))
