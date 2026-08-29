import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const loaderBundle = await build({
  entryPoints: ['showroom/src/core/shop-bakery-demo-loader.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const loader = await import(`data:text/javascript;base64,${Buffer.from(loaderBundle.outputFiles[0].contents).toString('base64')}`)
const {
  SHOP_BAKERY_BATCH_DEMO_CLASSIFICATION,
  SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST,
  SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST,
  SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS,
  SHOP_BAKERY_DEMO_CLASSIFICATION,
  SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST,
  SHOP_BAKERY_DEMO_FIXTURE_DIGEST,
  computeShopBakeryDemoExpectedProjectionDigest,
  computeShopBakeryDemoFixtureDigest,
  computeShopBakeryBatchDemoExpectedProjectionDigest,
  computeShopBakeryBatchDemoInputDigest,
  loadShopBakeryBatchProfitDemo,
  loadShopBakeryMarginDemo,
  shopBakeryBatchDemoInputForVerification,
  shopBakeryDemoSourceForVerification,
  verifyShopBakeryBatchDemoInput,
  verifyShopBakeryBatchDemoProjection,
  verifyShopBakeryDemoProjection,
  verifyShopBakeryDemoSource,
} = loader

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

check(
  SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS.scenarioFileSha256 === 'sha256:d0f94e8a709f541d4ca59045f7af23cf51789176d74aaf92962c0956b56eaf8b',
  'source binds the accepted synthetic scenario artifact',
)
check(
  SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS.validationReceiptSha256 === 'sha256:a6a3fe7ef4be7dbd69e574687e668884d007d8a503f5381373b03ce68f61b787',
  'source binds the accepted validation receipt',
)
check(
  SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS.runSheetSha256 === 'sha256:e540b6a3adc36e5125ca224cdd26de81c2c30d38e819f1922a164a2c4d63e565',
  'source binds the accepted run sheet',
)
check(await computeShopBakeryDemoFixtureDigest() === SHOP_BAKERY_DEMO_FIXTURE_DIGEST, 'embedded fixture digest is exact')
check(await computeShopBakeryDemoExpectedProjectionDigest() === SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST, 'expected projection digest is exact')

const result = await loadShopBakeryMarginDemo()
check(result.contract === 'supermega.shop-bakery-margin-demo.v1', 'loader emits the exact demo contract')
check(result.classification === SHOP_BAKERY_DEMO_CLASSIFICATION, 'loader retains the permanent synthetic classification')
check(result.classification.includes('never pilot, customer, or commercial proof'), 'classification closes evidence overclaim')
check(result.businessLabel === 'Synthetic Yangon bakery demo', 'loader exposes the synthetic business label')
check(result.sourceDigest === SHOP_BAKERY_DEMO_FIXTURE_DIGEST, 'result binds the fixture digest')
check(result.expectedProjectionDigest === SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST, 'result binds the expected projection digest')
check(result.projection.state === 'margin_at_risk', 'projection reaches the expected state')
check(result.projection.costCoverage.coverageBasisPoints === 10_000, 'cost coverage is complete')
check(result.projection.costCoverage.soldValueMmk === 63_000, 'sold value is exact')
check(result.projection.costCoverage.coveredSoldValueMmk === 63_000, 'covered sold value is exact')
check(result.projection.costCoverage.retainedNonSampleCompletedSaleCount === 1, 'one retained non-sample completed sale is counted')
check(result.projection.costCoverage.countedLineCount === 3, 'three completed-sale lines are counted')
check(result.projection.costCoverage.fullyCostedLineCount === 3, 'all three lines have reviewed retained cost evidence')
check(result.projection.profit.grossProfitMmk === 5_600, 'gross profit is exact after complete coverage')
check(result.projection.profit.marginBasisPoints === 888, 'aggregate margin basis points are exact')
check(result.projection.marginAtRiskMmk === 6_600, 'margin at risk is exact')
check(result.projection.priorities.map((priority) => priority.sku).join(',') === 'BAK-CROISSANT,BAK-MILK-BREAD', 'priority order is exact')
check(result.projection.priorities[0].marginMmk === -1_800 && result.projection.priorities[0].exposureMmk === 5_400, 'croissant negative-margin exposure is exact')
check(result.projection.priorities[1].marginMmk === 2_400 && result.projection.priorities[1].exposureMmk === 1_200, 'milk-bread below-floor exposure is exact')
check(!result.projection.priorities.some((priority) => priority.sku === 'BAK-TEA-BUN'), 'healthy Tea Bun is excluded from the risk ranking')
check(Object.values(result.projection.authority).every((value) => value === false), 'projection authority flags are all false')
check(result.controls.syntheticFixture === true, 'result is explicitly marked synthetic')
check(Object.entries(result.controls).every(([key, value]) => key === 'syntheticFixture' ? value === true : value === false), 'every external-action and evidence authority flag is false')
check(Object.isFrozen(result) && Object.isFrozen(result.projection) && Object.isFrozen(result.controls), 'loaded result is deeply immutable at its public roots')

check(await computeShopBakeryBatchDemoInputDigest() === SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST, 'Batch demo input digest is exact')
check(await computeShopBakeryBatchDemoExpectedProjectionDigest() === SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST, 'Batch demo expected projection digest is exact')
const batchResult = await loadShopBakeryBatchProfitDemo()
check(batchResult.contract === 'supermega.shop-bakery-batch-profit-demo.v1', 'Batch loader emits the exact demo contract')
check(batchResult.classification === SHOP_BAKERY_BATCH_DEMO_CLASSIFICATION, 'Batch loader retains the permanent synthetic classification')
check(batchResult.classification.includes('never baseline, pilot, customer, commercial, or accounting proof'), 'Batch classification closes every evidence overclaim')
check(batchResult.businessLabel === 'Synthetic Yangon bakery batch demo', 'Batch loader exposes only a synthetic business label')
assert.deepEqual(batchResult.acceptedArtifacts, SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS, 'Batch loader binds the accepted scenario, validation, and run-sheet artifacts')
check(batchResult.inputDigest === SHOP_BAKERY_BATCH_DEMO_INPUT_DIGEST, 'Batch result binds the immutable input digest')
check(batchResult.expectedProjectionDigest === SHOP_BAKERY_BATCH_DEMO_EXPECTED_PROJECTION_DIGEST, 'Batch result binds the exact projection digest')
check(batchResult.projection.contractSourceSha256 === 'd2968009e5eb18c44420e2fbbe6b40072e59b9bac0cda1e9ff531a4cae7b5910', 'Batch result binds the accepted R&D contract')
check(batchResult.projection.state === 'batch_margin_at_risk', 'synthetic Batch arithmetic reaches the expected estimate state')
check(batchResult.projection.totals.producedUnits === 36 && batchResult.projection.totals.completedSaleUnits === 30, 'Batch produced and completed units are exact')
check(batchResult.projection.totals.leftoverUnits === 4 && batchResult.projection.totals.wastedUnits === 2 && batchResult.projection.totals.remakeUnits === 1, 'Batch disposition is exact')
check(batchResult.projection.totals.totalCompletedSaleValueMmk === 63_000, 'Batch sold value is exact')
check(batchResult.projection.totals.totalReviewedProductionCostEstimateMmk === 68_550, 'Batch reviewed production-cost estimate is exact')
check(batchResult.projection.totals.totalBatchOverheadMmk === 9_000 && batchResult.projection.totals.totalBatchCostEstimateMmk === 77_550, 'Batch overhead and total cost estimates are exact')
check(batchResult.projection.estimatePreview?.batchContributionEstimateMmk === -14_550, 'Batch contribution estimate is exact')
check(batchResult.projection.estimatePreview?.aggregateContributionEstimateBasisPoints === -2_310, 'Batch contribution-estimate rate is exact')
check(batchResult.projection.estimatePreview?.estimatedBreakEvenSoldValueMmk === 77_550 && batchResult.projection.estimatePreview?.remainingToEstimatedBreakEvenMmk === 14_550, 'Batch break-even sold-value estimates are exact')
check(batchResult.projection.estimatePreview?.observedAverageNetSalePerUnitMmk === 2_100 && batchResult.projection.estimatePreview?.breakEvenEquivalentCompletedUnits === 37, 'Batch exact-rational break-even units are exact')
check(JSON.stringify(batchResult.projection.estimatePreview?.overheadAllocationMmkBySku) === JSON.stringify({ 'BAK-CROISSANT': 3_429, 'BAK-MILK-BREAD': 3_428, 'BAK-TEA-BUN': 2_143 }), 'Batch largest-remainder overhead allocation is exact')
check(batchResult.projection.estimatePreview?.estimatedMarginAtRiskMmk === 24_000, 'Batch estimated margin at risk is exact')
check(batchResult.projection.priorities.map((priority) => priority.sku).join(',') === 'BAK-CROISSANT,BAK-MILK-BREAD,BAK-TEA-BUN', 'Batch priority order is exact')
check(batchResult.projection.evidenceStatus.profitStatus === 'withheld' && batchResult.projection.evidenceStatus.withheldReasonCodes.join(',') === 'synthetic_or_sample_evidence_excluded', 'synthetic Batch arithmetic never becomes operating evidence')
check(batchResult.projection.evidenceStatus.retainedSalesEvidenceComplete === false, 'synthetic Batch sales never become retained real-sale evidence')
check(batchResult.projection.truthBoundary.costLabel === 'Owner-reviewed production-cost estimate' && /never actual accounting cost/i.test(batchResult.projection.truthBoundary.boundary), 'Batch estimate semantics remain permanent')
check(Object.values(batchResult.projection.authority).every((value) => value === false), 'Batch projection authority flags are all false')
check(Object.values(batchResult.controls).every((value) => value === false), 'Batch demo evidence and write controls are all false')
check(Object.isFrozen(batchResult) && Object.isFrozen(batchResult.projection) && Object.isFrozen(batchResult.controls), 'Batch result is deeply immutable at its public roots')

const repeat = await loadShopBakeryMarginDemo()
assert.deepEqual(repeat, result, 'repeat load is deterministic')
check(repeat !== result, 'repeat load creates a distinct isolated view')
const batchRepeat = await loadShopBakeryBatchProfitDemo()
assert.deepEqual(batchRepeat, batchResult, 'repeat Batch load is deterministic')
check(batchRepeat !== batchResult, 'repeat Batch load creates a distinct isolated view')

const existingWorkspace = {
  schema: 'supermega.commerce.workspace.v2',
  items: [{ sku: 'OWNER-SKU', name: 'Owner item', stockOnHand: 7 }],
  orders: [{ id: 'OWNER-ORDER', status: 'open', total: 1_234 }],
  movements: [],
  closes: [],
  purchaseOrders: [],
}
const existingBefore = JSON.stringify(existingWorkspace)
await loadShopBakeryMarginDemo()
await loadShopBakeryBatchProfitDemo()
check(JSON.stringify(existingWorkspace) === existingBefore, 'an existing Shop workspace remains byte-equivalent and untouched')

const tamperedSource = shopBakeryDemoSourceForVerification()
tamperedSource.workspace.orders[0].total += 1
await assert.rejects(() => verifyShopBakeryDemoSource(tamperedSource), /shop_bakery_demo_fixture_binding_mismatch/)
checks += 1

const tamperedProjection = structuredClone(result.projection)
tamperedProjection.profit.grossProfitMmk += 1
await assert.rejects(() => verifyShopBakeryDemoProjection(tamperedProjection), /shop_bakery_demo_projection_binding_mismatch/)
checks += 1

const tamperedBatchInput = await shopBakeryBatchDemoInputForVerification()
tamperedBatchInput.dispositionCore.items[0].producedUnits += 1
await assert.rejects(() => verifyShopBakeryBatchDemoInput(tamperedBatchInput), /shop_bakery_batch_demo_input_binding_mismatch/)
checks += 1

const tamperedBatchProjection = structuredClone(batchResult.projection)
tamperedBatchProjection.totals.totalCompletedSaleValueMmk += 1
await assert.rejects(() => verifyShopBakeryBatchDemoProjection(tamperedBatchProjection), /shop_bakery_batch_demo_projection_binding_mismatch/)
checks += 1

const loaderSource = await readFile('showroom/src/core/shop-bakery-demo-loader.ts', 'utf8')
const todaySource = await readFile('showroom/src/core/ShopToday.tsx', 'utf8')
const coreCss = await readFile('showroom/src/core/core-app.css', 'utf8')
const packageSource = await readFile('package.json', 'utf8')
for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'OneDrive', 'C:\\\\Users', 'saveCommerce', 'setItem(']) {
  check(!loaderSource.includes(forbidden), `loader excludes runtime dependency or write primitive: ${forbidden}`)
}
check(todaySource.includes("import type { ShopBakeryMarginDemoResult } from './shop-bakery-demo-loader'"), 'Shop Today uses a type-only static loader import')
check(todaySource.includes("await import('./shop-bakery-demo-loader')"), 'Shop Today loads the fixture module only after the explicit action')
check(!todaySource.includes("import { loadShopBakeryMarginDemo } from './shop-bakery-demo-loader'"), 'Shop Today has no eager loader value import')
check(!todaySource.includes("import { loadShopBakeryBatchProfitDemo } from './shop-bakery-demo-loader'"), 'Shop Today has no eager Batch loader value import')
check(todaySource.includes('Open exact synthetic bakery demo'), 'user-visible open action is exact')
check(todaySource.includes('Reload exact synthetic demo'), 'user-visible repeat action is exact')
check(todaySource.includes('Synthetic local demo only — never pilot, customer, or commercial proof.'), 'permanent demo classification is visible before load')
check(todaySource.includes('never replaces or merges with your Shop workspace'), 'existing workspace isolation is visible')
check(todaySource.includes('Your current Shop workspace above remains authoritative and unchanged.'), 'real Shop workspace remains visibly authoritative')
check(todaySource.includes('no payment, stock, supplier, accounting, customer, hosted, model, provider, or production action'), 'all forbidden action boundaries are visible')
check(todaySource.includes('Open exact synthetic Batch demo'), 'user-visible Batch open action is exact')
check(todaySource.includes('Reload exact synthetic Batch demo'), 'user-visible Batch repeat action is exact')
check(todaySource.includes('Synthetic local Batch calculation only — never baseline, pilot, customer, commercial, or accounting proof.'), 'permanent Batch classification is visible before load')
check(todaySource.includes('never replaces, merges with, or writes to your current Shop workspace'), 'Batch demo visibly refuses workspace replacement or merge')
check(todaySource.includes('The current Shop Batch panel above remains authoritative and unchanged.'), 'real Batch view remains visibly authoritative')
check(todaySource.includes('Batch demo binding check failed closed.'), 'Batch loader failure is visibly fail closed')
check((coreCss.match(/\.shop-quantity-stepper \{ grid-template-columns: 44px 30px 44px; \}/g) ?? []).length === 2, 'both effective mobile quantity-stepper ranges retain 44px columns')
check((coreCss.match(/\.shop-quantity-stepper button \{ width: 44px; min-height: 44px; \}/g) ?? []).length === 2, 'both effective mobile quantity-stepper ranges retain 44 by 44 buttons')
check(packageSource.includes('"shop:bakery-demo:verify": "node tools/test_shop_bakery_demo_loader.mjs"'), 'focused loader verifier is registered')
check(packageSource.includes('"shop:profit-control:verify": "node tools/test_shop_profit_control.mjs && node tools/test_shop_bakery_demo_loader.mjs"'), 'full serial gate runs the loader verifier with Profit Control')

const splitBuild = await build({
  entryPoints: ['showroom/src/core/ShopToday.tsx'],
  bundle: true,
  splitting: true,
  platform: 'browser',
  format: 'esm',
  outdir: 'shop-bakery-demo-loader-test-dist',
  write: false,
  metafile: true,
  logLevel: 'error',
  external: ['react', 'react-router'],
})
const outputs = Object.entries(splitBuild.metafile.outputs)
const entryOutput = outputs.find(([, output]) => output.entryPoint?.replaceAll('\\\\', '/') === 'showroom/src/core/ShopToday.tsx')
check(Boolean(entryOutput), 'Shop Today split-build entry exists')
check(!Object.keys(entryOutput[1].inputs).some((input) => input.endsWith('shop-bakery-demo-loader.ts')), 'loader fixture is absent from the Shop Today initial static entry')
check(outputs.some(([outputPath, output]) => outputPath !== entryOutput[0] && Object.keys(output.inputs).some((input) => input.endsWith('shop-bakery-demo-loader.ts'))), 'loader fixture is emitted in a separate conditional chunk')

console.log(`shop bakery demo loader checks passed: ${checks}`)
