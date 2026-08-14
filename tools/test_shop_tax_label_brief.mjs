// Shop tax label brief: CommerceTaxConfiguration.label text distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopTaxLabelBrief } from './shop-tax-label-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopTaxLabelBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', actorId: 'user-1', timestamp: '2026-08-12T08:00:00Z' }

let configSeq = 0
function taxConfig({ label = 'Standard Rate', code = 'TAX-STD', rateBasisPoints = 500 } = {}) {
  configSeq++
  return {
    revision: configSeq,
    code,
    label,
    rateBasisPoints,
    mode: 'inclusive',
    proof: PROOF,
  }
}

function state(taxConfigurations = []) {
  return { schema: SCHEMA, items: [], orders: [], movements: [], closes: [], taxConfigurations }
}

// 1. No configurations → zeros
{
  const r = projectShopTaxLabelBrief(state([]))
  check(r.totalConfigurations === 0, 'empty: totalConfigurations 0')
  check(r.uniqueLabels === 0, 'empty: uniqueLabels 0')
  check(r.topLabelsByCount.length === 0, 'empty: topLabelsByCount empty')
}

// 2. No taxConfigurations field → zeros
{
  const r = projectShopTaxLabelBrief({ schema: SCHEMA, items: [], orders: [], movements: [], closes: [] })
  check(r.totalConfigurations === 0, 'no-field: totalConfigurations 0')
}

// 3. Single configuration
{
  const r = projectShopTaxLabelBrief(state([taxConfig({ label: 'Commercial Tax 5%' })]))
  check(r.totalConfigurations === 1, 'single: totalConfigurations 1')
  check(r.uniqueLabels === 1, 'single: uniqueLabels 1')
  check(r.topLabelsByCount[0].label === 'Commercial Tax 5%', 'single: top label')
  check(r.topLabelsByCount[0].count === 1, 'single: count 1')
}

// 4. Multiple configurations with distinct labels
{
  const r = projectShopTaxLabelBrief(state([
    taxConfig({ label: 'Standard Rate' }),
    taxConfig({ label: 'Reduced Rate' }),
    taxConfig({ label: 'Zero Rate' }),
  ]))
  check(r.totalConfigurations === 3, 'distinct: totalConfigurations 3')
  check(r.uniqueLabels === 3, 'distinct: uniqueLabels 3')
}

// 5. Repeated labels: count accumulation
{
  const r = projectShopTaxLabelBrief(state([
    taxConfig({ label: 'Standard Rate', code: 'TAX-A' }),
    taxConfig({ label: 'Reduced Rate', code: 'TAX-B' }),
    taxConfig({ label: 'Standard Rate', code: 'TAX-C' }),
  ]))
  check(r.totalConfigurations === 3, 'repeated: totalConfigurations 3')
  check(r.uniqueLabels === 2, 'repeated: uniqueLabels 2')
  check(r.topLabelsByCount[0].label === 'Standard Rate', 'repeated: Standard Rate first')
  check(r.topLabelsByCount[0].count === 2, 'repeated: count 2')
  check(r.topLabelsByCount[1].label === 'Reduced Rate', 'repeated: Reduced Rate second')
}

// 6. Alphabetical tie-break
{
  const r = projectShopTaxLabelBrief(state([
    taxConfig({ label: 'Zebra Tax', code: 'Z' }),
    taxConfig({ label: 'Apple Tax', code: 'A' }),
  ]))
  check(r.topLabelsByCount[0].label === 'Apple Tax', 'tiebreak: Apple before Zebra')
}

// 7. Top-5 cap
{
  const configs = ['A', 'B', 'C', 'D', 'E', 'F'].map((l, i) =>
    taxConfig({ label: `${l} Rate`, code: `TAX-${i}` }),
  )
  const r = projectShopTaxLabelBrief(state(configs))
  check(r.topLabelsByCount.length === 5, 'top5: capped at 5')
  check(r.totalConfigurations === 6, 'top5: totalConfigurations 6')
  check(r.uniqueLabels === 6, 'top5: uniqueLabels 6')
}

console.log(JSON.stringify({ ok: true, checks }))
