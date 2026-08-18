import {
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  commerceSupplierPerformance,
  validateCommerceState,
  type CommerceState,
} from './commerce-workspace.ts'
import { plantOrderEvidenceDigest } from './plant-order-foundation.ts'
import { projectProductionMaterialRequirements } from './production-material-handoff.ts'
import { productionOrderPortfolioEntries } from './production-order-portfolio.ts'
import { validateProductionState, type ProductionState } from './production-workspace.ts'
import { projectShopInventory } from './shop-inventory-foundation.ts'
import type { ShopSupplierPolicy } from './shop-inventory-foundation.ts'

export const SHOP_REPLENISHMENT_PLAN_CONTRACT = 'supermega.shop.replenishment_plan.v1' as const
export const SHOP_PROCUREMENT_DECISION_CONTRACT = 'supermega.shop.procurement-decision.v1' as const

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
  unroundedOrderUnits: number
  recommendedOrderUnits: number
  jobIds: string[]
  earliestNeedAt: string | null
  nextExpectedAt: string | null
  suggestedSupplier: string | null
  suggestedUnitCostMmk: number | null
  supplierPolicy: Omit<ShopSupplierPolicy, 'commandId' | 'proof'> | null
  latestOrderAt: string | null
  status: ShopReplenishmentStatus
}

// A Plant material's Shop SKU (plant-order-foundation.ts) is free text keyed into a
// BOM row -- nothing validates it against a real Shop item at entry time. When it is
// mistyped, or the Shop item is later renamed or deleted, production-material-handoff.ts
// already detects this per material (status 'mapping_required'), but until now that
// status was silently dropped by the demand loop below along with everything needed
// to name what failed. Plant believed it had flagged real demand; Shop never learned
// it existed. unmatchedDemand surfaces exactly those rows instead of dropping them --
// reported in the material's own unit, since a "Shop stock unit" count is meaningless
// for a SKU that was never actually resolved to a real item.
export type ShopUnmatchedDemand = {
  sku: string
  materialName: string
  unit: string
  requiredQuantityMilli: number
  jobIds: string[]
}

export type ShopReplenishmentPlan = {
  contract: typeof SHOP_REPLENISHMENT_PLAN_CONTRACT
  source: {
    commerceDigest: string
    productionOrders: Array<{ jobId: string; headDigest: string }>
  }
  rows: ShopReplenishmentRow[]
  unmatchedDemand: ShopUnmatchedDemand[]
  summary: {
    reviewedSkus: number
    orderRequired: number
    termsRequired: number
    supplyAtRisk: number
    productionDemandUnits: number
    recommendedOrderUnits: number
    unmatchedSkuCount: number
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

export type ShopSupplierComparison = {
  supplier: string
  unitCostMmk: number | null
  estimatedTotalMmk: number | null
  leadTimeDays: number | null
  serviceLevelBasisPoints: number | null
  completedDeliveries: number
  onTimeRateBasisPoints: number | null
  defectRateBasisPoints: number
  performanceStatus: 'attention' | 'on_track' | 'collecting'
  termsStatus: 'comparable' | 'cost_required'
  sourcePurchaseOrderIds: string[]
  supplierPolicyCommandId: string | null
}

export type ShopProcurementDecision = {
  contract: typeof SHOP_PROCUREMENT_DECISION_CONTRACT
  asOf: string
  rows: Array<{
    requisitionReference: string
    sku: string
    itemName: string
    quantity: number
    desiredAt: string | null
    plantJobIds: string[]
    recommendedSupplier: string | null
    recommendedUnitCostMmk: number | null
    estimatedTotalMmk: number | null
    status: 'ready_for_owner_review' | 'risk_review_required' | 'terms_required'
    selectionReason: string
    supplierOptions: ShopSupplierComparison[]
  }>
  summary: {
    requisitions: number
    readyForReview: number
    riskReviews: number
    termsRequired: number
    comparedSuppliers: number
    knownExposureMmk: number
    unknownExposure: number
  }
  source: { commerceDigest: string; replenishmentDigest: string; purchaseOrderIds: string[] }
  authority: {
    recommendationOnly: true
    requisitionRecorded: false
    purchaseCreated: false
    supplierContacted: false
    paymentCreated: false
    inventoryChanged: false
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

function safeMultiply(left: number, right: number, field: string) {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds the supported quantity range.`)
  return value
}

function roundOrderUnits(required: number, policy: ShopSupplierPolicy | null, sku: string) {
  if (!required || !policy) return required
  const minimum = Math.max(required, policy.minimumOrderUnits)
  const multiples = Math.ceil(minimum / policy.orderMultipleUnits)
  const result = multiples * policy.orderMultipleUnits
  if (!Number.isSafeInteger(result)) throw new Error(`Policy-rounded order for ${sku} exceeds the supported quantity range.`)
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
  const unmatchedBySku = new Map<string, { materialName: string; unit: string; requiredQuantityMilli: number; jobs: Set<string> }>()

  for (const entry of portfolio) {
    const requirements = projectProductionMaterialRequirements(entry.execution, commerce)
    if (!requirements) continue
    const job = jobsById.get(entry.jobId)
    for (const requirement of requirements.rows) {
      if (requirement.status === 'mapping_required' && requirement.attemptedShopSku) {
        const sku = requirement.attemptedShopSku
        const current = unmatchedBySku.get(sku) ?? { materialName: requirement.materialName, unit: requirement.unit, requiredQuantityMilli: 0, jobs: new Set<string>() }
        current.requiredQuantityMilli = safeAdd(current.requiredQuantityMilli, requirement.remainingQuantityMilli, `Unmatched Plant demand for ${sku}`)
        current.jobs.add(entry.jobId)
        unmatchedBySku.set(sku, current)
        continue
      }
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
  const inventory = commerce.inventoryFoundation
    ? projectShopInventory(commerce.inventoryFoundation, commerce.items.map((item) => item.sku).sort())
    : null
  const retainedVendors = inventory?.vendors ?? []
  const retainedVendorNames = new Map(retainedVendors.map((vendor) => [vendor.id, vendor.name]))

  const unmatchedDemand: ShopUnmatchedDemand[] = [...unmatchedBySku.entries()]
    .map(([sku, demand]) => ({ sku, materialName: demand.materialName, unit: demand.unit, requiredQuantityMilli: demand.requiredQuantityMilli, jobIds: [...demand.jobs].sort() }))
    .sort((left, right) => left.sku.localeCompare(right.sku))

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
    const recentOrders = purchaseOrders.filter((purchaseOrder) => purchaseOrder.sku === item.sku && !purchaseOrder.cancellation)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || (left.id < right.id ? -1 : 1))
    const supplierOrder = recentOrders.find((purchaseOrder) => purchaseOrder.supplier.trim())
    const activePolicies = (inventory?.supplierPolicies ?? []).filter((policy) => policy.sku === item.sku && policy.status === 'active')
    const policy = supplierOrder
      ? activePolicies.find((candidate) => retainedVendorNames.get(candidate.vendorId) === supplierOrder.supplier) ?? null
      : activePolicies.length === 1 ? activePolicies[0] : null
    const operatingTargetUnits = Math.max(
      safeDouble(item.reorderAt, `Operating target for ${item.sku}`),
      safeAdd(item.reorderAt, demand.units, `Protected Plant target for ${item.sku}`),
      policy ? safeAdd(safeAdd(item.reorderAt, demand.units, `Policy target for ${item.sku}`), policy.safetyStockUnits, `Policy safety stock for ${item.sku}`) : 0,
    )
    const availableSupply = safeAdd(item.onHand, openPurchaseUnits, `Available supply for ${item.sku}`)
    const unroundedOrderUnits = Math.max(operatingTargetUnits - availableSupply, 0)
    const recommendedOrderUnits = roundOrderUnits(unroundedOrderUnits, policy, item.sku)
    if (!demand.units && item.onHand > item.reorderAt && !openPurchaseUnits) return []

    const costOrder = recentOrders.find((purchaseOrder) => purchaseOrder.unitCostMmk !== undefined)
    const suggestedSupplier = policy ? retainedVendorNames.get(policy.vendorId) ?? null : supplierOrder?.supplier ?? (retainedVendors.length === 1 ? retainedVendors[0].name : null)
    const suggestedUnitCostMmk = costOrder?.unitCostMmk ?? null
    const latestOrderAt = earliestNeedAt && policy
      ? new Date(Date.parse(earliestNeedAt) - policy.leadTimeDays * 86_400_000).toISOString()
      : null
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
      unroundedOrderUnits,
      recommendedOrderUnits,
      jobIds: [...demand.jobs].sort(),
      earliestNeedAt,
      nextExpectedAt,
      suggestedSupplier,
      suggestedUnitCostMmk,
      supplierPolicy: policy ? {
        vendorId: policy.vendorId,
        sku: policy.sku,
        leadTimeDays: policy.leadTimeDays,
        minimumOrderUnits: policy.minimumOrderUnits,
        orderMultipleUnits: policy.orderMultipleUnits,
        safetyStockUnits: policy.safetyStockUnits,
        serviceLevelBasisPoints: policy.serviceLevelBasisPoints,
        status: policy.status,
      } : null,
      latestOrderAt,
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
      supplierPolicies: (inventory?.supplierPolicies ?? []).map((policy) => ({
        vendorId: policy.vendorId,
        sku: policy.sku,
        leadTimeDays: policy.leadTimeDays,
        minimumOrderUnits: policy.minimumOrderUnits,
        orderMultipleUnits: policy.orderMultipleUnits,
        safetyStockUnits: policy.safetyStockUnits,
        serviceLevelBasisPoints: policy.serviceLevelBasisPoints,
        status: policy.status,
      })).sort((left, right) => `${left.sku}|${left.vendorId}`.localeCompare(`${right.sku}|${right.vendorId}`)),
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
    unmatchedSkuCount: unmatchedDemand.length,
  }
  const body = {
    contract: SHOP_REPLENISHMENT_PLAN_CONTRACT,
    source,
    rows,
    unmatchedDemand,
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

const supplierStatusRank = { on_track: 0, collecting: 1, attention: 2 } as const

export function projectShopProcurementDecision(
  commerceValue: CommerceState,
  planValue: ShopReplenishmentPlan,
  asOfValue: number,
): ShopProcurementDecision {
  if (!Number.isFinite(asOfValue)) throw new Error('Shop procurement as-of time is invalid.')
  const commerce = validateCommerceState(commerceValue)
  const { digest: planDigest, ...planBody } = planValue
  if (planValue.contract !== SHOP_REPLENISHMENT_PLAN_CONTRACT || planDigest !== plantOrderEvidenceDigest(planBody)) {
    throw new Error('Shop procurement requires a current, untampered replenishment plan.')
  }
  const purchaseOrders = commercePurchaseOrders(commerce)
  const inventory = commerce.inventoryFoundation
    ? projectShopInventory(commerce.inventoryFoundation, commerce.items.map((item) => item.sku).sort())
    : null
  const performance = new Map(commerceSupplierPerformance(commerce, asOfValue).map((row) => [row.supplier, row]))
  const vendorNames = new Map((inventory?.vendors ?? []).map((vendor) => [vendor.id, vendor.name]))
  const rows = planValue.rows.filter((row) => row.recommendedOrderUnits > 0).map((row) => {
    const suppliers = [...new Set([
      ...purchaseOrders.filter((order) => order.sku === row.sku && !order.cancellation).map((order) => order.supplier),
      ...(inventory?.supplierPolicies ?? []).filter((policy) => policy.sku === row.sku && policy.status === 'active').flatMap((policy) => vendorNames.get(policy.vendorId) ?? []),
      ...(row.suggestedSupplier ? [row.suggestedSupplier] : []),
    ])].sort((left, right) => left.localeCompare(right))
    const supplierOptions = suppliers.map<ShopSupplierComparison>((supplier) => {
      const sourceOrders = purchaseOrders.filter((order) => order.sku === row.sku && order.supplier === supplier && !order.cancellation)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
      const commercialOrder = sourceOrders.find((order) => order.unitCostMmk !== undefined)
      const vendorId = inventory?.vendors.find((vendor) => vendor.name === supplier)?.id
      const policy = inventory?.supplierPolicies.find((candidate) => candidate.vendorId === vendorId && candidate.sku === row.sku && candidate.status === 'active')
      const measured = performance.get(supplier)
      const unitCostMmk = commercialOrder?.unitCostMmk ?? null
      const estimatedTotalMmk = unitCostMmk === null ? null : safeMultiply(row.recommendedOrderUnits, unitCostMmk, `Procurement exposure for ${row.sku}`)
      return {
        supplier,
        unitCostMmk,
        estimatedTotalMmk,
        leadTimeDays: policy?.leadTimeDays ?? null,
        serviceLevelBasisPoints: policy?.serviceLevelBasisPoints ?? null,
        completedDeliveries: measured?.completedDeliveries ?? 0,
        onTimeRateBasisPoints: measured?.onTimeRateBasisPoints ?? null,
        defectRateBasisPoints: measured?.defectRateBasisPoints ?? 0,
        performanceStatus: measured?.status ?? 'collecting',
        termsStatus: unitCostMmk === null ? 'cost_required' : 'comparable',
        sourcePurchaseOrderIds: sourceOrders.map((order) => order.id),
        supplierPolicyCommandId: policy?.commandId ?? null,
      }
    }).sort((left, right) => {
      if (left.termsStatus !== right.termsStatus) return left.termsStatus === 'comparable' ? -1 : 1
      if (supplierStatusRank[left.performanceStatus] !== supplierStatusRank[right.performanceStatus]) return supplierStatusRank[left.performanceStatus] - supplierStatusRank[right.performanceStatus]
      if (Boolean(left.supplierPolicyCommandId) !== Boolean(right.supplierPolicyCommandId)) return left.supplierPolicyCommandId ? -1 : 1
      if (left.completedDeliveries !== right.completedDeliveries) return right.completedDeliveries - left.completedDeliveries
      if ((left.onTimeRateBasisPoints ?? -1) !== (right.onTimeRateBasisPoints ?? -1)) return (right.onTimeRateBasisPoints ?? -1) - (left.onTimeRateBasisPoints ?? -1)
      if (left.defectRateBasisPoints !== right.defectRateBasisPoints) return left.defectRateBasisPoints - right.defectRateBasisPoints
      if ((left.estimatedTotalMmk ?? Number.MAX_SAFE_INTEGER) !== (right.estimatedTotalMmk ?? Number.MAX_SAFE_INTEGER)) return (left.estimatedTotalMmk ?? Number.MAX_SAFE_INTEGER) - (right.estimatedTotalMmk ?? Number.MAX_SAFE_INTEGER)
      return left.supplier.localeCompare(right.supplier)
    })
    const recommended = supplierOptions.find((option) => option.termsStatus === 'comparable') ?? null
    const status = !recommended
      ? 'terms_required' as const
      : recommended.performanceStatus === 'attention' ? 'risk_review_required' as const : 'ready_for_owner_review' as const
    const selectionReason = !recommended
      ? 'Retain supplier cost terms before owner review.'
      : recommended.performanceStatus === 'attention'
        ? 'Best retained commercial option has delivery or quality risk requiring owner review.'
        : recommended.completedDeliveries
          ? 'Ranked by retained terms, delivery evidence, quality, then estimated exposure.'
          : 'Commercial terms are retained; delivery evidence is still collecting.'
    return {
      requisitionReference: `REQ-${planDigest.slice(7, 19).toUpperCase()}-${row.sku}`,
      sku: row.sku,
      itemName: row.itemName,
      quantity: row.recommendedOrderUnits,
      desiredAt: row.earliestNeedAt,
      plantJobIds: row.jobIds,
      recommendedSupplier: recommended?.supplier ?? null,
      recommendedUnitCostMmk: recommended?.unitCostMmk ?? null,
      estimatedTotalMmk: recommended?.estimatedTotalMmk ?? null,
      status,
      selectionReason,
      supplierOptions,
    }
  })
  const summary = {
    requisitions: rows.length,
    readyForReview: rows.filter((row) => row.status === 'ready_for_owner_review').length,
    riskReviews: rows.filter((row) => row.status === 'risk_review_required').length,
    termsRequired: rows.filter((row) => row.status === 'terms_required').length,
    comparedSuppliers: rows.reduce((total, row) => safeAdd(total, row.supplierOptions.length, 'Compared suppliers'), 0),
    knownExposureMmk: rows.reduce((total, row) => safeAdd(total, row.estimatedTotalMmk ?? 0, 'Known procurement exposure'), 0),
    unknownExposure: rows.filter((row) => row.estimatedTotalMmk === null).length,
  }
  const body = {
    contract: SHOP_PROCUREMENT_DECISION_CONTRACT,
    asOf: new Date(asOfValue).toISOString(),
    rows,
    summary,
    source: {
      commerceDigest: planValue.source.commerceDigest,
      replenishmentDigest: planDigest,
      purchaseOrderIds: purchaseOrders.map((order) => order.id).sort(),
    },
    authority: { recommendationOnly: true, requisitionRecorded: false, purchaseCreated: false, supplierContacted: false, paymentCreated: false, inventoryChanged: false, providerCalled: false } as const,
  }
  return { ...body, digest: plantOrderEvidenceDigest(body) }
}

export function validateShopProcurementDecision(value: unknown, commerce: CommerceState, plan: ShopReplenishmentPlan, asOf: number) {
  const expected = projectShopProcurementDecision(commerce, plan, asOf)
  if (!value || typeof value !== 'object'
    || (value as { contract?: unknown }).contract !== SHOP_PROCUREMENT_DECISION_CONTRACT
    || plantOrderEvidenceDigest(value) !== plantOrderEvidenceDigest(expected)) {
    throw new Error('Shop procurement decision does not match current replenishment and supplier evidence.')
  }
  return expected
}
