import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
  SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
  projectNoBatchProfitControl,
} from '../showroom/src/core/shop-batch-profit-control.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const today = readFileSync(`${root}/showroom/src/core/ShopToday.tsx`, 'utf8')
const css = readFileSync(`${root}/showroom/src/core/core-app.css`, 'utf8')
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
const panelStart = today.indexOf('export function ShopBatchProfitControlPanel')
const start = today.indexOf('return <section aria-label={panelAriaLabel}', panelStart)
const end = today.indexOf('export function ShopToday', start)

let checks = 0
const check = (condition, message) => {
  checks += 1
  assert.ok(condition, message)
}

check(start >= 0 && end > start, 'Batch Profit Control must be a bounded Shop Today section')
const section = today.slice(start, end)
const noBatch = projectNoBatchProfitControl()

assert.equal(noBatch.contract, SHOP_BATCH_PROFIT_CONTROL_CONTRACT); checks += 1
assert.equal(noBatch.contractSourceSha256, SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256); checks += 1
assert.equal(noBatch.state, 'no_batch'); checks += 1
assert.equal(noBatch.estimatePreview, null); checks += 1
assert.deepEqual(noBatch.priorities, []); checks += 1
assert.deepEqual(noBatch.evidenceStatus.withheldReasonCodes, ['no_batch']); checks += 1
check(Object.values(noBatch.authority).every((value) => value === false), 'No-batch authority must stay all false')

check(today.includes('batchProfitControl = projectNoBatchProfitControl()'), 'Shop Today must default through the accepted no-batch projector')
check(today.includes('batchProfitControl?: ShopBatchProfitControlView'), 'A future source-owned projection may be supplied without inventing UI state')
check(today.includes("panelAriaLabel = 'Shop Batch Profit Control'"), 'The primary Batch panel retains its exact accessible label')
check(today.includes("panelId = 'shop-batch-profit-control'"), 'The primary Batch panel retains its exact route anchor')
check(today.includes('batchProfitControl.contract === SHOP_BATCH_PROFIT_CONTROL_CONTRACT'), 'UI must bind the exact projection contract')
check(today.includes('batchProfitControl.contractSourceSha256 === SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256'), 'UI must bind the accepted R&D contract digest')
check(today.includes('Object.values(batchProfitControl.authority).every((value) => value === false)'), 'UI must fail closed if any authority flag is true')
check(section.includes('role="alert"') && section.includes('Batch projection blocked.'), 'Contract or authority mismatch must render a blocking alert')
const boundHeaderStart = section.indexOf('{batchProjectionBound ? <>')
const blockedHeaderCopy = 'Accepted Batch Profit Control binding did not verify. No evidence, estimate, priority, or authority is inferred.'
const blockedHeaderStart = section.indexOf(`</> : '${blockedHeaderCopy}'}`)
check(boundHeaderStart >= 0 && blockedHeaderStart > boundHeaderStart, 'Projection-derived header copy must be inside the verified binding branch')
check(section.slice(boundHeaderStart, blockedHeaderStart).includes('batchProfitControl.truthBoundary.boundary'), 'Only a verified projection may expose its truth-boundary copy')
check(section.includes(": 'blocked'}>{batchProjectionBound ? batchStateLabels[batchProfitControl.state] : 'Blocked'}</b>"), 'An unbound projection must show only the blocked state')

for (const [state, label] of Object.entries({
  no_batch: 'No batch selected',
  collecting_batch_evidence: 'Collecting evidence',
  review_adjustments: 'Review adjustments',
  batch_margin_at_risk: 'Margin at risk',
  batch_controlled: 'Controlled',
})) {
  check(today.includes(`${state}: '${label}'`), `State ${state} must have exact owner-facing copy`)
}

for (const label of [
  'Canonical revision lineage',
  'Whole-line batch allocation',
  'Production-cost estimate coverage',
  'Retained completed sales',
  'Packaging and delivery review',
  'Adjustments and unit reconciliation',
]) check(section.includes(label), `Evidence gate must be visible: ${label}`)

for (const label of [
  'Completed sold value',
  'Total batch cost estimate',
  'Batch contribution estimate',
  'Estimated break-even sold value',
  'Estimated margin at risk',
  'Batch disposition',
]) check(section.includes(label), `Batch output must use exact estimate-safe label: ${label}`)

check(section.includes('batchProfitControl.truthBoundary.boundary'), 'The engine truth boundary must render verbatim')
check(today.includes('Synthetic calculation only — never evidence'), 'Synthetic classification must remain permanent and explicit')
check(today.includes('Retained local operating evidence — not pilot, customer, or commercial proof'), 'Local operating evidence must not become commercial proof')
check(section.includes('Decision estimates withheld.'), 'No-batch state must withhold every decision estimate')
check(section.includes('Unknown is never replaced with zero'), 'Incomplete break-even must not false-green to zero')
check(section.includes('No ranking while decision evidence is incomplete'), 'Incomplete evidence must not expose priorities')
check(section.includes('Rate unavailable — no sold value'), 'Zero-sale contribution rate must remain unavailable')
check(section.includes('<strong>Next:</strong>') && section.includes('<strong>Closed when:</strong>'), 'Every rendered priority must retain action and objective closure')
check(section.includes('payment, stock, supplier, accounting, customer, hosted, provider, model, or production action'), 'The complete no-write boundary must remain visible')

for (const forbidden of ['<button', '<Link', 'onClick=', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest']) {
  check(!section.includes(forbidden), `Batch projection surface must remain read-only: ${forbidden}`)
}

check(css.includes('.shop-batch-evidence { display: grid; grid-template-columns: repeat(3,minmax(0,1fr));'), 'Desktop evidence layout must use bounded columns')
check(css.includes('.shop-batch-priorities { display: grid; grid-template-columns: repeat(2,minmax(0,1fr));'), 'Desktop priorities must use bounded columns')
check(css.includes('.shop-batch-evidence { grid-template-columns: 1fr; }'), 'Mobile evidence must stack to one column')
check(css.includes('.shop-batch-priorities { grid-template-columns: 1fr; }'), 'Mobile priorities must stack to one column')
check(css.includes('overflow-wrap: anywhere'), 'Long safe IDs and labels must not force horizontal overflow')

check(today.includes("import type { ShopBakeryBatchDemoResult } from './shop-bakery-demo-loader'"), 'Batch demo keeps only a type-level static loader dependency')
check(today.includes("const { loadShopBakeryBatchProfitDemo } = await import('./shop-bakery-demo-loader')"), 'Batch demo implementation loads only after the explicit action')
check(!today.includes("import { loadShopBakeryBatchProfitDemo } from './shop-bakery-demo-loader'"), 'Batch demo has no eager value import')
check(today.includes("const [bakeryBatchDemo, setBakeryBatchDemo] = useState<ShopBakeryBatchDemoState>({ status: 'idle' })"), 'Batch demo begins inert')
check(today.includes("if (attempt === bakeryBatchDemoAttempt.current) setBakeryBatchDemo({ status: 'ready', result })"), 'Batch demo ignores stale asynchronous completion')
check(today.includes('<ShopBatchProfitControlPanel batchProfitControl={batchProfitControl} />'), 'current source-owned Batch view remains independently rendered and authoritative')
check(today.includes("{bakeryBatchDemo.status === 'ready' ? <ShopBatchProfitControlPanel"), 'synthetic projection renders only after exact loader success')
check(today.includes('batchProfitControl={bakeryBatchDemo.result.projection}'), 'successful synthetic result is passed through the existing guarded projection panel')
check(today.includes('panelId="shop-batch-profit-control-synthetic-demo"'), 'synthetic view uses a distinct DOM anchor')
check(today.includes('Synthetic local Batch calculation only — never baseline, pilot, customer, commercial, or accounting proof.'), 'synthetic Batch classification is permanent before load')
check(today.includes('never replaces, merges with, or writes to your current Shop workspace'), 'synthetic Batch action visibly refuses workspace mutation')
check(today.includes('The current Shop Batch panel above remains authoritative and unchanged.'), 'current Batch view remains visibly authoritative')
check(today.includes('Batch demo binding check failed closed.'), 'binding failure exposes no synthetic projection')

assert.equal(
  packageJson.scripts['shop:batch-profit-control:verify'],
  'node tools/test_shop_batch_profit_control.mjs && node tools/test_shop_batch_profit_control_ui.mjs',
)
checks += 1

const showroomRequire = createRequire(new URL('../showroom/package.json', import.meta.url))
const [{ createServer }, react, { renderToStaticMarkup }] = await Promise.all([
  import(pathToFileURL(showroomRequire.resolve('vite')).href),
  import(pathToFileURL(showroomRequire.resolve('react')).href),
  import(pathToFileURL(showroomRequire.resolve('react-dom/server')).href),
])
const createElement = react.createElement ?? react.default.createElement
const vite = await createServer({
  appType: 'custom',
  configFile: `${root}/showroom/vite.config.ts`,
  configLoader: 'runner',
  logLevel: 'silent',
  root: `${root}/showroom`,
  server: { hmr: false, middlewareMode: true },
})

try {
  const { ShopBatchProfitControlPanel } = await vite.ssrLoadModule('/src/core/ShopToday.tsx')
  const allFalseAuthority = {
    paymentWrite: false,
    stockWrite: false,
    supplierWrite: false,
    accountingWrite: false,
    customerWrite: false,
    hostedWrite: false,
    providerWrite: false,
    modelUsed: false,
  }
  const untrustedProjection = {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: 'batch_controlled',
    batchIdentity: { batchId: 'UNTRUSTED-BATCH-ID' },
    evidenceStatus: { withheldReasonCodes: [], profitStatus: 'available' },
    totals: { totalCompletedSaleValueMmk: 987654321 },
    estimatePreview: { batchContributionEstimateMmk: 987654321 },
    priorities: [{ sku: 'UNTRUSTED-PRIORITY-SKU' }],
    truthBoundary: {
      costLabel: 'UNTRUSTED COST CONTENT',
      classification: 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof',
      boundary: 'UNTRUSTED TRUTH CONTENT',
    },
    authority: allFalseAuthority,
  }
  const renderProjection = (projection) => renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, { batchProfitControl: projection }))
  const assertBlockedProjection = (markup, reason) => {
    check(markup.includes('Accepted Batch Profit Control binding did not verify.'), `${reason} must show neutral binding copy`)
    check(markup.includes('<b data-state="blocked">Blocked</b>'), `${reason} must show only a blocked state`)
    check(markup.includes('Batch projection blocked.'), `${reason} must show the blocking alert`)
    for (const forbidden of ['Controlled', 'UNTRUSTED COST CONTENT', 'UNTRUSTED TRUTH CONTENT', 'UNTRUSTED-BATCH-ID', 'UNTRUSTED-PRIORITY-SKU', '987,654,321', 'Retained local operating evidence', 'Completed sold value']) {
      check(!markup.includes(forbidden), `${reason} must not expose supplied projection content: ${forbidden}`)
    }
  }

  assertBlockedProjection(renderProjection({ ...untrustedProjection, contractSourceSha256: '0'.repeat(64) }), 'digest mismatch')
  for (const authorityKey of Object.keys(allFalseAuthority)) {
    assertBlockedProjection(renderProjection({
      ...untrustedProjection,
      authority: { ...allFalseAuthority, [authorityKey]: true },
    }), `true authority ${authorityKey}`)
  }

  const { loadShopBakeryBatchProfitDemo } = await vite.ssrLoadModule('/src/core/shop-bakery-demo-loader.ts')
  const syntheticBatchDemo = await loadShopBakeryBatchProfitDemo()
  const syntheticMarkup = renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, {
    batchProfitControl: syntheticBatchDemo.projection,
    panelAriaLabel: 'Verified synthetic bakery Batch Profit Control projection',
    panelId: 'shop-batch-profit-control-synthetic-demo',
  }))
  for (const expected of [
    'aria-label="Verified synthetic bakery Batch Profit Control projection"',
    'id="shop-batch-profit-control-synthetic-demo"',
    '<b data-state="batch_margin_at_risk">Margin at risk</b>',
    'Synthetic calculation only — never evidence',
    'Operating decision status: withheld',
    '63,000 MMK',
    '77,550 MMK',
    '-14,550 MMK',
    '24,000 MMK',
    'BAK-CROISSANT',
    'BAK-MILK-BREAD',
    'BAK-TEA-BUN',
    'never counts as baseline, pilot, customer, or commercial proof',
  ]) check(syntheticMarkup.includes(expected), `verified synthetic Batch render must include: ${expected}`)
  check(!syntheticMarkup.includes('Batch projection blocked.'), 'exact synthetic projection must pass the guarded renderer')
} finally {
  await vite.close()
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.shop.batch_profit_control.ui_contract.v1',
  checks,
  defaultState: noBatch.state,
  authorityAllFalse: true,
}))
