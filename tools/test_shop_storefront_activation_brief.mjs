// Shop storefront activation brief: activation presence, workflow type, confirmedAt, skuCount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontActivationBrief } from './shop-storefront-activation-brief.ts'`,
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

const { projectShopStorefrontActivationBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const BASE_STORE = {
  revision: 1,
  storeName: 'Test Store',
  summary: 'A store.',
  selectedSkus: [],
  shopCatalogSnapshotRevision: 1,
  saved: { actionId: 'act-1', savedAt: '2026-08-11T08:00:00Z', savedBy: 'admin-01' },
}

function activation({ workflowTemplateId = 'social-storefront', confirmedAt = '2026-08-11T10:00:00Z', skus = [] } = {}) {
  return {
    contract: 'supermega.ecommerce.activation.v1',
    packageDigest: 'digest-01',
    workflowTemplateId,
    confirmedAt,
    skus,
  }
}

function state(storefrontConfiguration) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
    ...(storefrontConfiguration !== undefined && { storefrontConfiguration }),
  }
}

// 1. No storefrontConfiguration → not activated
{
  const r = projectShopStorefrontActivationBrief(state(undefined))
  check(r.hasActivation === false, 'no-config: hasActivation false')
  check(r.workflowTemplateId === null, 'no-config: workflowTemplateId null')
  check(r.confirmedAt === null, 'no-config: confirmedAt null')
  check(r.skuCount === 0, 'no-config: skuCount 0')
}

// 2. storefrontConfiguration without activation
{
  const r = projectShopStorefrontActivationBrief(state({ ...BASE_STORE }))
  check(r.hasActivation === false, 'no-activation: hasActivation false')
  check(r.workflowTemplateId === null, 'no-activation: workflowTemplateId null')
  check(r.confirmedAt === null, 'no-activation: confirmedAt null')
  check(r.skuCount === 0, 'no-activation: skuCount 0')
}

// 3. social-storefront activation, no SKUs
{
  const r = projectShopStorefrontActivationBrief(state({
    ...BASE_STORE,
    activation: activation({ workflowTemplateId: 'social-storefront', confirmedAt: '2026-08-10T09:00:00Z', skus: [] }),
  }))
  check(r.hasActivation === true, 'social: hasActivation true')
  check(r.workflowTemplateId === 'social-storefront', 'social: workflowTemplateId social-storefront')
  check(r.confirmedAt === '2026-08-10T09:00:00Z', 'social: confirmedAt correct')
  check(r.skuCount === 0, 'social: skuCount 0')
}

// 4. pickup-preorder activation with SKUs
{
  const r = projectShopStorefrontActivationBrief(state({
    ...BASE_STORE,
    activation: activation({ workflowTemplateId: 'pickup-preorder', skus: ['SKU-A', 'SKU-B', 'SKU-C'] }),
  }))
  check(r.hasActivation === true, 'pickup: hasActivation true')
  check(r.workflowTemplateId === 'pickup-preorder', 'pickup: workflowTemplateId pickup-preorder')
  check(r.skuCount === 3, 'pickup: skuCount 3')
}

// 5. wholesale-request activation with many SKUs
{
  const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`)
  const r = projectShopStorefrontActivationBrief(state({
    ...BASE_STORE,
    activation: activation({ workflowTemplateId: 'wholesale-request', skus }),
  }))
  check(r.hasActivation === true, 'wholesale: hasActivation true')
  check(r.workflowTemplateId === 'wholesale-request', 'wholesale: workflowTemplateId wholesale-request')
  check(r.skuCount === 10, 'wholesale: skuCount 10')
}

// 6. Single SKU activation
{
  const r = projectShopStorefrontActivationBrief(state({
    ...BASE_STORE,
    activation: activation({ skus: ['SKU-ONLY'] }),
  }))
  check(r.skuCount === 1, 'single-sku: skuCount 1')
}

console.log(JSON.stringify({ ok: true, checks }))
