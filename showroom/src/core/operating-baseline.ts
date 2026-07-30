export type OperatingProduct = 'shop' | 'plant' | 'website' | 'ecommerce'
export type OperatingProductStatus = 'missing' | 'invalid' | 'ready'

type BaselineCommon = {
  status: OperatingProductStatus
  attentionLevel: number
  reviewLoad: number
}

export type OperatingBaseline = {
  contract: 'supermega.operating_baseline.v1'
  version: 1
  workspaceId: string
  sourceVersions: Array<{
    surface: 'commerce' | 'production' | 'website'
    version: number
    updatedAt: string
    projectionDigest: string
  }>
  coverage: {
    readyProducts: number
    missingProducts: number
    invalidProducts: number
  }
  products: {
    shop: BaselineCommon & {
      itemCount: number
      lowStock: number
      activeOrders: number
      moneyExceptions: number
      incomingRequests: number
    }
    plant: BaselineCommon & {
      jobCount: number
      unfinishedJobs: number
      heldJobs: number
      criticalIssues: number
      highIssues: number
      openIssues: number
      stoppedMachines: number
    }
    website: BaselineCommon & {
      pageCount: number
      readyPages: number
      approved: boolean
      released: boolean
    }
    ecommerce: BaselineCommon & {
      selectedSkus: number
      incomingRequests: number
      shopSourceReady: boolean
    }
  }
  rawRecordsIncluded: false
  baselineDigest: string
}

export type OperatingBaselineChange = {
  contract: 'supermega.operating_baseline_change.v1'
  version: 1
  status: 'first_checkpoint' | 'changed' | 'unchanged'
  currentBaselineDigest: string
  previousBaselineDigest: string | null
  changedProducts: OperatingProduct[]
  attentionIncreased: OperatingProduct[]
  attentionDecreased: OperatingProduct[]
  coverageChanged: boolean
  rawRecordsIncluded: false
  changeDigest: string
}

const PRODUCTS = ['shop', 'plant', 'website', 'ecommerce'] as const
const PRODUCT_STATUSES = new Set<OperatingProductStatus>(['missing', 'invalid', 'ready'])
const SOURCE_SURFACES = new Set(['commerce', 'production', 'website'])
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

function count(value: unknown, maximum = 1_000_000) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
}

function productList(value: unknown): value is OperatingProduct[] {
  return Array.isArray(value)
    && value.length <= PRODUCTS.length
    && new Set(value).size === value.length
    && value.every((product) => PRODUCTS.includes(product as OperatingProduct))
    && value.every((product, index) => PRODUCTS.indexOf(product) >= (index ? PRODUCTS.indexOf(value[index - 1]) : -1))
}

function commonProduct(value: Record<string, unknown>) {
  return PRODUCT_STATUSES.has(value.status as OperatingProductStatus)
    && count(value.attentionLevel, 5)
    && count(value.reviewLoad)
}

function countFields(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => count(value[field]))
}

function unavailableProductIsEmpty(value: Record<string, unknown>, counts: readonly string[], booleans: readonly string[] = []) {
  if (value.status === 'ready') return true
  return value.attentionLevel === (value.status === 'invalid' ? 5 : 0)
    && value.reviewLoad === 0
    && counts.every((field) => value[field] === 0)
    && booleans.every((field) => value[field] === false)
}

export function structurallyValidOperatingBaseline(
  value: unknown,
  workspaceId: string,
): value is OperatingBaseline {
  if (!isRecord(value)
    || !exactKeys(value, [
      'baselineDigest', 'contract', 'coverage', 'products', 'rawRecordsIncluded', 'sourceVersions',
      'version', 'workspaceId',
    ])
    || value.contract !== 'supermega.operating_baseline.v1'
    || value.version !== 1
    || value.workspaceId !== workspaceId
    || value.rawRecordsIncluded !== false
    || typeof value.baselineDigest !== 'string'
    || !SHA256_DIGEST.test(value.baselineDigest)
    || !Array.isArray(value.sourceVersions)
    || value.sourceVersions.length > 3
    || new Set(value.sourceVersions.map((source) => isRecord(source) ? source.surface : '')).size !== value.sourceVersions.length
    || !value.sourceVersions.every((source) => isRecord(source)
      && exactKeys(source, ['projectionDigest', 'surface', 'updatedAt', 'version'])
      && SOURCE_SURFACES.has(String(source.surface))
      && count(source.version)
      && typeof source.updatedAt === 'string'
      && source.updatedAt.length <= 64
      && typeof source.projectionDigest === 'string'
      && SHA256_DIGEST.test(source.projectionDigest))
    || !isRecord(value.coverage)
    || !exactKeys(value.coverage, ['invalidProducts', 'missingProducts', 'readyProducts'])
    || !count(value.coverage.readyProducts, 4)
    || !count(value.coverage.missingProducts, 4)
    || !count(value.coverage.invalidProducts, 4)
    || !isRecord(value.products)
    || !exactKeys(value.products, PRODUCTS)) return false

  const shop = value.products.shop
  const plant = value.products.plant
  const website = value.products.website
  const ecommerce = value.products.ecommerce
  if (!isRecord(shop)
    || !exactKeys(shop, ['activeOrders', 'attentionLevel', 'incomingRequests', 'itemCount', 'lowStock', 'moneyExceptions', 'reviewLoad', 'status'])
    || !commonProduct(shop)
    || !countFields(shop, ['itemCount', 'lowStock', 'activeOrders', 'moneyExceptions', 'incomingRequests'])
    || !unavailableProductIsEmpty(shop, ['itemCount', 'lowStock', 'activeOrders', 'moneyExceptions', 'incomingRequests'])
    || (shop.status === 'ready' && Number(shop.lowStock) > Number(shop.itemCount))
    || !isRecord(plant)
    || !exactKeys(plant, ['attentionLevel', 'criticalIssues', 'heldJobs', 'highIssues', 'jobCount', 'openIssues', 'reviewLoad', 'status', 'stoppedMachines', 'unfinishedJobs'])
    || !commonProduct(plant)
    || !countFields(plant, ['jobCount', 'unfinishedJobs', 'heldJobs', 'criticalIssues', 'highIssues', 'openIssues', 'stoppedMachines'])
    || !unavailableProductIsEmpty(plant, ['jobCount', 'unfinishedJobs', 'heldJobs', 'criticalIssues', 'highIssues', 'openIssues', 'stoppedMachines'])
    || (plant.status === 'ready' && (
      Number(plant.unfinishedJobs) > Number(plant.jobCount)
      || Number(plant.heldJobs) > Number(plant.jobCount)
      || Number(plant.criticalIssues) + Number(plant.highIssues) > Number(plant.openIssues)
    ))
    || !isRecord(website)
    || !exactKeys(website, ['approved', 'attentionLevel', 'pageCount', 'readyPages', 'released', 'reviewLoad', 'status'])
    || !commonProduct(website)
    || !countFields(website, ['pageCount', 'readyPages'])
    || typeof website.approved !== 'boolean'
    || typeof website.released !== 'boolean'
    || !unavailableProductIsEmpty(website, ['pageCount', 'readyPages'], ['approved', 'released'])
    || (website.status === 'ready' && Number(website.readyPages) > Number(website.pageCount))
    || !isRecord(ecommerce)
    || !exactKeys(ecommerce, ['attentionLevel', 'incomingRequests', 'reviewLoad', 'selectedSkus', 'shopSourceReady', 'status'])
    || !commonProduct(ecommerce)
    || !countFields(ecommerce, ['selectedSkus', 'incomingRequests'])
    || typeof ecommerce.shopSourceReady !== 'boolean'
    || !unavailableProductIsEmpty(ecommerce, ['selectedSkus', 'incomingRequests'], ['shopSourceReady'])) return false

  const statuses = PRODUCTS.map((product) => (value.products as Record<OperatingProduct, BaselineCommon>)[product].status)
  return value.coverage.readyProducts === statuses.filter((status) => status === 'ready').length
    && value.coverage.missingProducts === statuses.filter((status) => status === 'missing').length
    && value.coverage.invalidProducts === statuses.filter((status) => status === 'invalid').length
}

export function structurallyValidOperatingBaselineChange(
  value: unknown,
  baseline: OperatingBaseline,
): value is OperatingBaselineChange {
  if (!isRecord(value)
    || !exactKeys(value, [
      'attentionDecreased', 'attentionIncreased', 'changeDigest', 'changedProducts', 'contract',
      'coverageChanged', 'currentBaselineDigest', 'previousBaselineDigest', 'rawRecordsIncluded',
      'status', 'version',
    ])
    || value.contract !== 'supermega.operating_baseline_change.v1'
    || value.version !== 1
    || !['first_checkpoint', 'changed', 'unchanged'].includes(String(value.status))
    || value.currentBaselineDigest !== baseline.baselineDigest
    || !(value.previousBaselineDigest === null
      || (typeof value.previousBaselineDigest === 'string' && SHA256_DIGEST.test(value.previousBaselineDigest)))
    || !productList(value.changedProducts)
    || !productList(value.attentionIncreased)
    || !productList(value.attentionDecreased)
    || !(value.attentionIncreased as OperatingProduct[]).every((product) => (value.changedProducts as OperatingProduct[]).includes(product))
    || !(value.attentionDecreased as OperatingProduct[]).every((product) => (value.changedProducts as OperatingProduct[]).includes(product))
    || (value.attentionIncreased as OperatingProduct[]).some((product) => (value.attentionDecreased as OperatingProduct[]).includes(product))
    || typeof value.coverageChanged !== 'boolean'
    || value.rawRecordsIncluded !== false
    || typeof value.changeDigest !== 'string'
    || !SHA256_DIGEST.test(value.changeDigest)) return false

  if (value.status === 'first_checkpoint') {
    return value.previousBaselineDigest === null
      && value.changedProducts.length === 0
      && value.attentionIncreased.length === 0
      && value.attentionDecreased.length === 0
      && value.coverageChanged === false
  }
  if (value.status === 'unchanged') {
    return value.previousBaselineDigest !== null
      && value.changedProducts.length === 0
      && value.attentionIncreased.length === 0
      && value.attentionDecreased.length === 0
      && value.coverageChanged === false
  }
  return value.previousBaselineDigest !== null && (value.changedProducts.length > 0 || value.coverageChanged)
}

function productNames(products: OperatingProduct[]) {
  return products.map((product) => product === 'ecommerce' ? 'Ecommerce' : product[0].toUpperCase() + product.slice(1)).join(', ')
}

export function operatingChangeCopy(change: OperatingBaselineChange) {
  if (change.status === 'first_checkpoint') {
    return {
      label: 'First operating baseline',
      detail: 'Retain this checkpoint before SuperMega explains later changes.',
    }
  }
  if (change.status === 'unchanged') {
    return {
      label: 'No operating change',
      detail: 'Validated aggregate signals match the previous distinct checkpoint.',
    }
  }
  const movements = [
    change.attentionIncreased.length ? `more review pressure: ${productNames(change.attentionIncreased)}` : '',
    change.attentionDecreased.length ? `less review pressure: ${productNames(change.attentionDecreased)}` : '',
    change.coverageChanged ? 'source coverage changed' : '',
  ].filter(Boolean)
  return {
    label: `${change.changedProducts.length} product${change.changedProducts.length === 1 ? '' : 's'} changed`,
    detail: movements.join(' / ') || `Aggregate signals changed in ${productNames(change.changedProducts)}.`,
  }
}
