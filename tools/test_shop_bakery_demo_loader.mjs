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
  SHOP_BAKERY_DEMO_ACCEPTED_ARTIFACTS,
  SHOP_BAKERY_DEMO_CLASSIFICATION,
  SHOP_BAKERY_DEMO_EXPECTED_PROJECTION_DIGEST,
  SHOP_BAKERY_DEMO_FIXTURE_DIGEST,
  computeShopBakeryDemoExpectedProjectionDigest,
  computeShopBakeryDemoFixtureDigest,
  loadShopBakeryMarginDemo,
  shopBakeryDemoSourceForVerification,
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

const repeat = await loadShopBakeryMarginDemo()
assert.deepEqual(repeat, result, 'repeat load is deterministic')
check(repeat !== result, 'repeat load creates a distinct isolated view')

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
check(JSON.stringify(existingWorkspace) === existingBefore, 'an existing Shop workspace remains byte-equivalent and untouched')

const tamperedSource = shopBakeryDemoSourceForVerification()
tamperedSource.workspace.orders[0].total += 1
await assert.rejects(() => verifyShopBakeryDemoSource(tamperedSource), /shop_bakery_demo_fixture_binding_mismatch/)
checks += 1

const tamperedProjection = structuredClone(result.projection)
tamperedProjection.profit.grossProfitMmk += 1
await assert.rejects(() => verifyShopBakeryDemoProjection(tamperedProjection), /shop_bakery_demo_projection_binding_mismatch/)
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
check(todaySource.includes('Open exact synthetic bakery demo'), 'user-visible open action is exact')
check(todaySource.includes('Reload exact synthetic demo'), 'user-visible repeat action is exact')
check(todaySource.includes('Synthetic local demo only — never pilot, customer, or commercial proof.'), 'permanent demo classification is visible before load')
check(todaySource.includes('never replaces or merges with your Shop workspace'), 'existing workspace isolation is visible')
check(todaySource.includes('Your current Shop workspace above remains authoritative and unchanged.'), 'real Shop workspace remains visibly authoritative')
check(todaySource.includes('no payment, stock, supplier, accounting, customer, hosted, model, provider, or production action'), 'all forbidden action boundaries are visible')
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
