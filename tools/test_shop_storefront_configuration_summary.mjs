// Shop storefront configuration summary: configured, revision, selectedSkuCount,
// merchandisingCount, isActivated, workflowTemplate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontConfigurationSummary } from './shop-storefront-configuration-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/storefront-configuration-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopStorefrontConfigurationSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'r', evidenceReference: 'e' }
const SCHEMA = 'supermega.ecommerce.storefront.v1'

function merch(sku) {
  return { sku, featured: false, collection: 'main', displayName: sku, note: '' }
}

function activation(workflowTemplateId, skus = []) {
  return {
    contract: 'supermega.ecommerce.activation.v1',
    packageDigest: 'pkg',
    workflowTemplateId,
    confirmedAt: '2026-08-11T08:00:00.000Z',
    skus,
  }
}

function cfg({ revision = 1, selectedSkus = [], merchandising = undefined, act = undefined } = {}) {
  return {
    schema: SCHEMA,
    revision,
    shopCatalogSnapshotRevision: 1,
    shopCatalogDigest: 'cat-digest',
    storeName: 'Test Store',
    summary: 'Test summary',
    selectedSkus,
    ...(merchandising !== undefined ? { merchandising } : {}),
    ...(act !== undefined ? { activation: act } : {}),
    saved: PROOF,
  }
}

function state(storefrontConfiguration = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(storefrontConfiguration !== undefined ? { storefrontConfiguration } : {}),
  }
}

// 1. No storefrontConfiguration → all defaults
{
  const r = projectShopStorefrontConfigurationSummary(state())
  check(r.configured === false, 'none: configured false')
  check(r.revision === 0, 'none: revision 0')
  check(r.selectedSkuCount === 0, 'none: selectedSkuCount 0')
  check(r.merchandisingCount === 0, 'none: merchandisingCount 0')
  check(r.isActivated === false, 'none: isActivated false')
  check(r.workflowTemplate === null, 'none: workflowTemplate null')
}

// 2. Configured, no activation, no merchandising, 3 skus, revision 2
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ revision: 2, selectedSkus: ['SKU-A', 'SKU-B', 'SKU-C'] }),
  ))
  check(r.configured === true, 'basic: configured true')
  check(r.revision === 2, 'basic: revision 2')
  check(r.selectedSkuCount === 3, 'basic: selectedSkuCount 3')
  check(r.merchandisingCount === 0, 'basic: merchandisingCount 0 (no merch field)')
  check(r.isActivated === false, 'basic: isActivated false')
  check(r.workflowTemplate === null, 'basic: workflowTemplate null')
}

// 3. With 2 merchandising entries
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ selectedSkus: ['SKU-1', 'SKU-2'], merchandising: [merch('SKU-1'), merch('SKU-2')] }),
  ))
  check(r.merchandisingCount === 2, 'merch: merchandisingCount 2')
  check(r.selectedSkuCount === 2, 'merch: selectedSkuCount still 2')
}

// 4. With activation social-storefront
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ act: activation('social-storefront') }),
  ))
  check(r.isActivated === true, 'social: isActivated true')
  check(r.workflowTemplate === 'social-storefront', 'social: workflowTemplate social-storefront')
}

// 5. With activation pickup-preorder
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ act: activation('pickup-preorder') }),
  ))
  check(r.workflowTemplate === 'pickup-preorder', 'pickup: workflowTemplate pickup-preorder')
}

// 6. With activation wholesale-request
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ act: activation('wholesale-request') }),
  ))
  check(r.workflowTemplate === 'wholesale-request', 'wholesale: workflowTemplate wholesale-request')
}

// 7. selectedSkuCount 0 when empty selectedSkus
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({ selectedSkus: [] }),
  ))
  check(r.selectedSkuCount === 0, 'no-skus: selectedSkuCount 0')
  check(r.configured === true, 'no-skus: still configured')
}

// 8. Full config: 5 skus, 3 merch, pickup-preorder activation, revision 7
{
  const r = projectShopStorefrontConfigurationSummary(state(
    cfg({
      revision: 7,
      selectedSkus: ['S1', 'S2', 'S3', 'S4', 'S5'],
      merchandising: [merch('S1'), merch('S2'), merch('S3')],
      act: activation('pickup-preorder', ['S1', 'S2']),
    }),
  ))
  check(r.configured === true, 'full: configured true')
  check(r.revision === 7, 'full: revision 7')
  check(r.selectedSkuCount === 5, 'full: selectedSkuCount 5')
  check(r.merchandisingCount === 3, 'full: merchandisingCount 3')
  check(r.isActivated === true, 'full: isActivated true')
  check(r.workflowTemplate === 'pickup-preorder', 'full: workflowTemplate pickup-preorder')
}

console.log(JSON.stringify({ ok: true, checks }))
