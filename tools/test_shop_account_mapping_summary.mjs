// Shop account mapping configuration summary: totalConfigurations, latestRevision,
// totalMappingEntries, uniqueRoles, uniqueExternalCodes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopAccountMappingSummary } from './shop-account-mapping-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/account-mapping-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopAccountMappingSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'r', evidenceReference: 'e' }

function entry(accountRole, externalAccountCode) {
  return { accountRole, externalAccountCode }
}

function config(revision, mappings = []) {
  return { revision, mappings, proof: PROOF }
}

function state(accountMappingConfigurations = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(accountMappingConfigurations !== undefined ? { accountMappingConfigurations } : {}),
  }
}

// 1. Empty state (no field) → all zeros, latestRevision null
{
  const r = projectShopAccountMappingSummary(state())
  check(r.totalConfigurations === 0, 'empty: totalConfigurations 0')
  check(r.latestRevision === null, 'empty: latestRevision null')
  check(r.totalMappingEntries === 0, 'empty: totalMappingEntries 0')
  check(r.uniqueRoles === 0, 'empty: uniqueRoles 0')
  check(r.uniqueExternalCodes === 0, 'empty: uniqueExternalCodes 0')
}

// 2. Empty array → totalConfigurations 0
{
  const r = projectShopAccountMappingSummary(state([]))
  check(r.totalConfigurations === 0, 'empty-array: totalConfigurations 0')
}

// 3. Single config revision 1, 2 entries
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [
      entry('payment_clearing', 'EXT-100'),
      entry('sales_revenue', 'EXT-200'),
    ]),
  ]))
  check(r.totalConfigurations === 1, 'single: totalConfigurations 1')
  check(r.latestRevision === 1, 'single: latestRevision 1')
  check(r.totalMappingEntries === 2, 'single: totalMappingEntries 2')
  check(r.uniqueRoles === 2, 'single: uniqueRoles 2')
  check(r.uniqueExternalCodes === 2, 'single: uniqueExternalCodes 2')
}

// 4. Config with 0 entries: totalMappingEntries 0, uniqueRoles 0, uniqueExternalCodes 0
{
  const r = projectShopAccountMappingSummary(state([
    config(1, []),
  ]))
  check(r.totalMappingEntries === 0, 'empty-entries: totalMappingEntries 0')
  check(r.uniqueRoles === 0, 'empty-entries: uniqueRoles 0')
  check(r.uniqueExternalCodes === 0, 'empty-entries: uniqueExternalCodes 0')
}

// 5. latestRevision picks max: revision 3 and 1 → 3
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [entry('tax_payable', 'EXT-T')]),
    config(3, [entry('tax_payable', 'EXT-T2')]),
  ]))
  check(r.latestRevision === 3, 'rev-max: latestRevision 3')
}

// 6. totalConfigurations 2, totalMappingEntries accumulates across configs
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [entry('payment_clearing', 'EXT-A')]),
    config(2, [entry('sales_revenue', 'EXT-B')]),
  ]))
  check(r.totalConfigurations === 2, 'two-configs: totalConfigurations 2')
  check(r.totalMappingEntries === 2, 'two-configs: totalMappingEntries 1+1=2')
}

// 7. uniqueRoles dedup across configs: same role → 1
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [entry('payment_clearing', 'EXT-A')]),
    config(2, [entry('payment_clearing', 'EXT-B')]),
  ]))
  check(r.uniqueRoles === 1, 'role-dedup: uniqueRoles 1')
}

// 8. uniqueExternalCodes dedup: same code in 2 configs → 1
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [entry('payment_clearing', 'EXT-100')]),
    config(2, [entry('sales_revenue', 'EXT-100')]),
  ]))
  check(r.uniqueExternalCodes === 1, 'code-dedup: uniqueExternalCodes 1')
}

// 9. All 7 distinct roles → uniqueRoles 7
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [
      entry('payment_clearing', 'E1'),
      entry('sales_revenue', 'E2'),
      entry('sales_revenue_unverified', 'E3'),
      entry('tax_payable', 'E4'),
      entry('sales_adjustment', 'E5'),
      entry('correction_receivable', 'E6'),
      entry('correction_payable', 'E7'),
    ]),
  ]))
  check(r.uniqueRoles === 7, 'all-roles: uniqueRoles 7')
  check(r.uniqueExternalCodes === 7, 'all-roles: uniqueExternalCodes 7')
  check(r.totalMappingEntries === 7, 'all-roles: totalMappingEntries 7')
}

// 10. Mixed across 2 configs: role A→ext-1, role B→ext-2 in cfg1; role A→ext-3 in cfg2
{
  const r = projectShopAccountMappingSummary(state([
    config(1, [entry('payment_clearing', 'EXT-1'), entry('sales_revenue', 'EXT-2')]),
    config(2, [entry('payment_clearing', 'EXT-3')]),
  ]))
  check(r.uniqueRoles === 2, 'mixed: uniqueRoles 2 (payment_clearing+sales_revenue)')
  check(r.uniqueExternalCodes === 3, 'mixed: uniqueExternalCodes 3')
  check(r.totalMappingEntries === 3, 'mixed: totalMappingEntries 3')
}

console.log(JSON.stringify({ ok: true, checks }))
