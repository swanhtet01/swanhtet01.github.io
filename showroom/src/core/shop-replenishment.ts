import {
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  validateCommerceState,
  type CommerceState,
} from './commerce-workspace.ts'
import { plantOrderEvidenceDigest } from './plant-order-foundation.ts'
import { projectProductionMaterialRequirements } from './production-material-handoff.ts'
import { productionOrderPortfolioEntries } from './production-order-portfolio.ts'
import { validateProductionState, type ProductionState } from './production-workspace.ts'
import { projectShopInventory } from './shop-inventory-foundation.ts'

export const SHOP_REPLENISHMENT_PLAN_CONTRACT = 'supermega.shop.replenishment_plan.v1' as const

export type ShopReplenishmentStatus = 'terms_required' | 'order_required' | 'supply_at_risk' | 'covered_by_open_po' | 'stock_ready'

export type ShopReplenishmentRow = {
  sku: string
  itemName: string
  onHandUnits: number
  reorderFloorUnits: number
  operatingTargetUnits: number
  productionDemandUnits: number
  openPurchaseUnits: number
  atRiskPurchaseUnits: number
  recommendedOrderUnits: number
  jobIds: string[]
  earliestNeedAt: string | null
  nextExpectedAt: string | null
  suggestedSupplier: string | null
  suggestedUnitCostMmk: number | null
  status: ShopReplenishmentStatus
}

export type ShopReplenishmentPlan = {
  contract: typeof SHOP_REPLENISHMENT_PLAN_CONTRACT
  source: {
    commerceDigest: string
    productionOrders: Array<{ jobId: string; headDigest: string }>
  }
  rows: ShopReplenishmentRow[]
  summary: {
    reviewedSkus: number
    orderRequired: number
    termsRequired: number
    supplyAtRisk: number
    productionDemandUnits: number
    recommendedOrderUnits: number
  }
  authority: {
    purchaseCreated: false
    supplierContacted: false
    paymentCreated: false
    inventoryChanged: false
    productionChanged: false
    providerCalled: false
  }
  digest: string
}

function safeAdd(left: number, right: number, field: string) {
  const value = left + right
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds the supported quantity range.`)
  return value
}

function safeDouble(value: number, field: string) {
  const result = value * 2
  if (!Number.isSafeInteger(result)) throw new Error(`${field} exceeds the supported quantity range.`)
  return result
}

export function projectShopReplenishment(
  commerceValue: CommerceState,
  productionValue: ProductionState,
): ShopReplenishmentPlan {
  const commerce = validateCommerceState(commerceValue)
  const production = validateProductionState(productionValue)
  const portfolio = productionOrderPortfolioEntries(production)
  const jobsById = new Map(production.jobs.map((job) => [job.id, job]))
  const demandBySku = new Map<string, { units: number; jobs: Set<string>; dueAt: string[] }>()

  for (const entry of portfolio) {
    const requirements = projectProductionMaterialRequirements(entry.execution, commerce)
    if (!requirements) continue
    const job = jobsById.get(entry.jobId)
    for (const requirement of requirements.rows) {
      if (!requirement.shopSupply || requirement.status === 'fulfilled') continue
      const current = demandBySku.get(requirement.shopSupply.sku) ?? { units: 0, jobs: new Set<string>(), dueAt: [] }
      current.units = safeAdd(current.units, requirement.shopSupply.requiredStockUnits, `Plant demand for ${requirement.shopSupply.sku}`)
      current.jobs.add(entry.jobId)
      const dueAt = job?.dueAt ?? requirements.job.effectiveUntil
      if (dueAt) current.dueAt.push(dueAt)
      demandBySku.set(requirement.shopSupply.sku, current)
    }
  }

  const purchaseOrders = commercePurchaseOrders(commerce)
  const activeOrders = purchaseOrders.map((purchaseOrder) => ({
    purchaseOrder,
    progress: commercePurchaseOrderProgress(commerce, purchaseOrder),
  })).filter(({ progress }) => progress.status === 'open' || progress.status === 'partially_received')
  const retainedVendors = commerce.inventoryFoundation
    ? projectShopInventory(commerce.inventoryFoundation, commerce.items.map((item) => item.sku).sort()).vendors
    : []

  const rows = commerce.items.flatMap((item): ShopReplenishmentRow[] => {
    const demand = demandBySku.get(item.sku) ?? { units: 0, jobs: new Set<string>(), dueAt: [] }
    const skuOrders = activeOrders.filter(({ purchaseOrder }) => purchaseOrder.sku === item.sku)
    const openPurchaseUnits = skuOrders.reduce((total, { progress }) => safeAdd(total, progress.remaining, `Open purchases for ${item.sku}`), 0)
    const earliestNeedAt = [...demand.dueAt].sort()[0] ?? null
    const atRiskPurchaseUnits = skuOrders.filter(({ purchaseOrder }) => !purchaseOrder.expectedAt
      || (earliestNeedAt !== null && Date.parse(purchaseOrder.expectedAt) > Date.parse(earliestNeedAt)))
      .reduce((total, { progress }) => safeAdd(total, progress.remaining, `At-risk purchases for ${item.sku}`), 0)
    const nextExpectedAt = skuOrders.map(({ purchaseOrder }) => purchaseOrder.expectedAt)
      .filter((value): value is string => Boolean(value)).sort()[0] ?? null
    const operatingTargetUnits = Math.max(
      safeDouble(item.reorderAt, `Operating target for ${item.sku}`),
      safeAdd(item.reorderAt, demand.units, `Protected Plant target for ${item.sku}`),
    )
    const availableSupply = safeAdd(item.onHand, openPurchaseUnits, `Available supply for ${item.sku}`)
    const recommendedOrderUnits = Math.max(operatingTargetUnits - availableSupply, 0)
    if (!demand.units && item.onHand > item.reorderAt && !openPurchaseUnits) return []

    const recentOrders = purchaseOrders.filter((purchaseOrder) => purchaseOrder.sku === item.sku && !purchaseOrder.cancellation)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || (left.id < right.id ? -1 : 1))
    const supplierOrder = recentOrders.find((purchaseOrder) => purchaseOrder.supplier.trim())
    const costOrder = recentOrders.find((purchaseOrder) => purchaseOrder.unitCostMmk !== undefined)
    const suggestedSupplier = supplierOrder?.supplier ?? (retainedVendors.length === 1 ? retainedVendors[0].name : null)
    const suggestedUnitCostMmk = costOrder?.unitCostMmk ?? null
    const status: ShopReplenishmentStatus = recommendedOrderUnits
      ? suggestedSupplier && suggestedUnitCostMmk ? 'order_required' : 'terms_required'
      : atRiskPurchaseUnits ? 'supply_at_risk'
        : openPurchaseUnits ? 'covered_by_open_po' : 'stock_ready'
    return [{
      sku: item.sku,
      itemName: item.name,
      onHandUnits: item.onHand,
      reorderFloorUnits: item.reorderAt,
      operatingTargetUnits,
      productionDemandUnits: demand.units,
      openPurchaseUnits,
      atRiskPurchaseUnits,
      recommendedOrderUnits,
      jobIds: [...demand.jobs].sort(),
      earliestNeedAt,
      nextExpectedAt,
      suggestedSupplier,
      suggestedUnitCostMmk,
      status,
    }]
  }).sort((left, right) => {
    const rank: Record<ShopReplenishmentStatus, number> = { terms_required: 0, order_required: 1, supply_at_risk: 2, covered_by_open_po: 3, stock_ready: 4 }
    return rank[left.status] - rank[right.status]
      || (left.earliestNeedAt ?? '9999').localeCompare(right.earliestNeedAt ?? '9999')
      || left.sku.localeCompare(right.sku)
  })
  const source = {
    commerceDigest: plantOrderEvidenceDigest({
      items: commerce.items.map(({ sku, name, onHand, reorderAt }) => ({ sku, name, onHand, reorderAt })).sort((left, right) => left.sku.localeCompare(right.sku)),
      purchaseOrders: purchaseOrders.map(({ id, createdAt, expectedAt, supplier, sku, quantityOrdered, unitCostMmk, cancellation }) => ({ id, createdAt, expectedAt: expectedAt ?? null, supplier, sku, quantityOrdered, unitCostMmk: unitCostMmk ?? null, cancelled: Boolean(cancellation), remaining: commercePurchaseOrderProgress(commerce, purchaseOrders.find((candidate) => candidate.id === id)!).remaining })).sort((left, right) => left.id.localeCompare(right.id)),
      vendors: retainedVendors.map(({ id, name }) => ({ id, name })).sort((left, right) => left.id.localeCompare(right.id)),
    }),
    productionOrders: portfolio.map((entry) => ({ jobId: entry.jobId, headDigest: entry.execution.headDigest })),
  }
  const summary = {
    reviewedSkus: rows.length,
    orderRequired: rows.filter((row) => row.recommendedOrderUnits > 0).length,
    termsRequired: rows.filter((row) => row.status === 'terms_required').length,
    supplyAtRisk: rows.filter((row) => row.status === 'supply_at_risk').length,
    productionDemandUnits: rows.reduce((total, row) => safeAdd(total, row.productionDemandUnits, 'Total Plant demand'), 0),
    recommendedOrderUnits: rows.reduce((total, row) => safeAdd(total, row.recommendedOrderUnits, 'Total recommended order'), 0),
  }
  const body = {
    contract: SHOP_REPLENISHMENT_PLAN_CONTRACT,
    source,
    rows,
    summary,
    authority: { purchaseCreated: false, supplierContacted: false, paymentCreated: false, inventoryChanged: false, productionChanged: false, providerCalled: false } as const,
  }
  return { ...body, digest: plantOrderEvidenceDigest(body) }
}

export function validateShopReplenishment(value: unknown, commerce: CommerceState, production: ProductionState) {
  const expected = projectShopReplenishment(commerce, production)
  if (!value || typeof value !== 'object'
    || (value as { contract?: unknown }).contract !== SHOP_REPLENISHMENT_PLAN_CONTRACT
    || plantOrderEvidenceDigest(value) !== plantOrderEvidenceDigest(expected)) {
    throw new Error('Shop replenishment plan does not match current Shop and Plant evidence.')
  }
  return expected
}
