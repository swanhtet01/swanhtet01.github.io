import {
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  validateCommerceState,
  type CommerceOrder,
  type CommerceState,
} from './commerce-workspace.ts'
import { plantOrderEvidenceDigest } from './plant-order-foundation.ts'
import { projectShopInventory, type ShopSupplierPolicy } from './shop-inventory-foundation.ts'

export const SHOP_DEMAND_INTELLIGENCE_CONTRACT = 'supermega.shop.demand-intelligence.v1' as const
export const SHOP_DEMAND_LOOKBACK_DAYS = 28 as const

export type ShopDemandConfidence = 'insufficient' | 'emerging' | 'established'
export type ShopDemandStatus = 'stockout_risk' | 'reorder_soon' | 'monitor' | 'insufficient_history'

export type ShopDemandIntelligenceRow = {
  sku: string
  itemName: string
  completedOrderCount: number
  sourceOrderIds: string[]
  sourceReturnActionIds: string[]
  grossDemandUnits: number
  returnedUnits: number
  netDemandUnits: number
  weeklyNetDemandUnits: number[]
  forecastWeeklyUnits: number
  peakWeeklyDemandUnits: number
  averageDailyDemandBasisPoints: number
  planningHorizonDays: number
  planningHorizonSource: 'supplier_policy' | 'planning_default'
  horizonDemandUnits: number
  onHandUnits: number
  openPurchaseUnits: number
  projectedSupplyUnits: number
  projectedDaysOfCover: number | null
  existingSafetyStockUnits: number | null
  recommendedSafetyStockUnits: number | null
  confidence: ShopDemandConfidence
  status: ShopDemandStatus
  reason: string
}

export type ShopDemandIntelligence = {
  contract: typeof SHOP_DEMAND_INTELLIGENCE_CONTRACT
  asOf: string
  lookbackDays: typeof SHOP_DEMAND_LOOKBACK_DAYS
  rows: ShopDemandIntelligenceRow[]
  summary: {
    reviewedSkus: number
    demandSkus: number
    stockoutRisks: number
    reorderSoon: number
    insufficientHistory: number
    netDemandUnits: number
    forecastWeeklyUnits: number
  }
  source: {
    commerceDigest: string
    completedOrderIds: string[]
    returnActionIds: string[]
  }
  authority: {
    recommendationOnly: true
    purchaseCreated: false
    supplierContacted: false
    inventoryChanged: false
    policyChanged: false
    providerCalled: false
  }
  digest: string
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

function safeAdd(left: number, right: number, field: string) {
  const value = left + right
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds the supported quantity range.`)
  return value
}

function safeMultiply(left: number, right: number, field: string) {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds the supported quantity range.`)
  return value
}

function orderLines(order: CommerceOrder) {
  if (order.lines?.length) return order.lines.map(({ sku, quantity }) => ({ sku, quantity }))
  return order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : []
}

function selectPolicy(
  sku: string,
  policies: ShopSupplierPolicy[],
  vendorNames: Map<string, string>,
  recentSupplier: string | null,
) {
  const active = policies.filter((policy) => policy.sku === sku && policy.status === 'active')
  if (recentSupplier) return active.find((policy) => vendorNames.get(policy.vendorId) === recentSupplier) ?? null
  return active.length === 1 ? active[0] : null
}

export function projectShopDemandIntelligence(stateValue: CommerceState, asOfValue: number): ShopDemandIntelligence {
  if (!Number.isFinite(asOfValue)) throw new Error('Shop demand as-of time is invalid.')
  const state = validateCommerceState(stateValue)
  const asOf = new Date(asOfValue).toISOString()
  const windowStart = asOfValue - SHOP_DEMAND_LOOKBACK_DAYS * DAY_MS
  const completedOrders = state.orders.filter((order) => {
    if (order.status !== 'completed' || !order.completion) return false
    const completedAt = Date.parse(order.completion.capturedAt)
    return completedAt > windowStart && completedAt <= asOfValue
  })
  const purchaseOrders = commercePurchaseOrders(state)
  const activePurchaseOrders = purchaseOrders.filter((purchaseOrder) => {
    const status = commercePurchaseOrderProgress(state, purchaseOrder).status
    return status === 'open' || status === 'partially_received'
  })
  const inventory = state.inventoryFoundation
    ? projectShopInventory(state.inventoryFoundation, state.items.map((item) => item.sku).sort())
    : null
  const vendorNames = new Map((inventory?.vendors ?? []).map((vendor) => [vendor.id, vendor.name]))
  const policies = inventory?.supplierPolicies ?? []

  const rows = state.items.map<ShopDemandIntelligenceRow>((item) => {
    const weeklyNetDemandUnits = [0, 0, 0, 0]
    const sourceOrderIds: string[] = []
    const sourceReturnActionIds: string[] = []
    let grossDemandUnits = 0
    let returnedUnits = 0
    for (const order of completedOrders) {
      const quantity = orderLines(order).filter((line) => line.sku === item.sku)
        .reduce((total, line) => safeAdd(total, line.quantity, `Gross demand for ${item.sku}`), 0)
      if (!quantity) continue
      sourceOrderIds.push(order.id)
      grossDemandUnits = safeAdd(grossDemandUnits, quantity, `Gross demand for ${item.sku}`)
      const completedAt = Date.parse(order.completion!.capturedAt)
      const completedBucket = Math.min(3, Math.floor((asOfValue - completedAt) / WEEK_MS))
      weeklyNetDemandUnits[completedBucket] = safeAdd(weeklyNetDemandUnits[completedBucket], quantity, `Weekly demand for ${item.sku}`)
      for (const returned of order.returns ?? []) {
        if (returned.sku !== item.sku || Date.parse(returned.createdAt) > asOfValue) continue
        returnedUnits = safeAdd(returnedUnits, returned.quantity, `Returns for ${item.sku}`)
        sourceReturnActionIds.push(returned.actionId)
        const returnBucket = Math.min(3, Math.max(0, Math.floor((asOfValue - Date.parse(returned.createdAt)) / WEEK_MS)))
        weeklyNetDemandUnits[returnBucket] -= returned.quantity
      }
    }
    const netDemandUnits = Math.max(0, grossDemandUnits - returnedUnits)
    const forecastWeeklyUnits = Math.ceil(netDemandUnits / 4)
    const peakWeeklyDemandUnits = Math.max(0, ...weeklyNetDemandUnits)
    const averageDailyDemandBasisPoints = Math.round(safeMultiply(netDemandUnits, 10_000, `Average demand for ${item.sku}`) / SHOP_DEMAND_LOOKBACK_DAYS)
    const completedOrderCount = sourceOrderIds.length
    const confidence: ShopDemandConfidence = completedOrderCount >= 6
      ? 'established'
      : completedOrderCount >= 2 ? 'emerging' : 'insufficient'
    const recentSupplier = purchaseOrders.filter((purchaseOrder) => purchaseOrder.sku === item.sku && !purchaseOrder.cancellation)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))[0]?.supplier ?? null
    const policy = selectPolicy(item.sku, policies, vendorNames, recentSupplier)
    const planningHorizonDays = policy?.leadTimeDays ?? 7
    const planningHorizonSource = policy ? 'supplier_policy' as const : 'planning_default' as const
    const horizonDemandUnits = Math.ceil(safeMultiply(netDemandUnits, planningHorizonDays, `Planning demand for ${item.sku}`) / SHOP_DEMAND_LOOKBACK_DAYS)
    const openPurchaseUnits = activePurchaseOrders.filter((purchaseOrder) => purchaseOrder.sku === item.sku)
      .reduce((total, purchaseOrder) => safeAdd(total, commercePurchaseOrderProgress(state, purchaseOrder).remaining, `Open purchases for ${item.sku}`), 0)
    const projectedSupplyUnits = safeAdd(item.onHand, openPurchaseUnits, `Projected supply for ${item.sku}`)
    const projectedDaysOfCover = netDemandUnits
      ? Math.floor(safeMultiply(projectedSupplyUnits, SHOP_DEMAND_LOOKBACK_DAYS, `Projected cover for ${item.sku}`) / netDemandUnits)
      : null
    const recommendedSafetyStockUnits = confidence === 'insufficient'
      ? null
      : Math.max(0, peakWeeklyDemandUnits - forecastWeeklyUnits)
    const status: ShopDemandStatus = netDemandUnits > 0 && projectedSupplyUnits < horizonDemandUnits
      ? 'stockout_risk'
      : netDemandUnits > 0 && projectedSupplyUnits < safeAdd(horizonDemandUnits, forecastWeeklyUnits, `Demand threshold for ${item.sku}`)
        ? 'reorder_soon'
        : confidence === 'insufficient' ? 'insufficient_history' : 'monitor'
    const reason = status === 'stockout_risk'
      ? `Projected supply is below ${planningHorizonDays}-day demand.`
      : status === 'reorder_soon'
        ? `Projected supply covers the planning horizon but not one additional forecast week.`
        : status === 'insufficient_history'
          ? 'Fewer than two completed orders are available in the 28-day window.'
          : 'Projected supply covers the planning horizon and one additional forecast week.'
    return {
      sku: item.sku,
      itemName: item.name,
      completedOrderCount,
      sourceOrderIds: sourceOrderIds.sort(),
      sourceReturnActionIds: sourceReturnActionIds.sort(),
      grossDemandUnits,
      returnedUnits,
      netDemandUnits,
      weeklyNetDemandUnits,
      forecastWeeklyUnits,
      peakWeeklyDemandUnits,
      averageDailyDemandBasisPoints,
      planningHorizonDays,
      planningHorizonSource,
      horizonDemandUnits,
      onHandUnits: item.onHand,
      openPurchaseUnits,
      projectedSupplyUnits,
      projectedDaysOfCover,
      existingSafetyStockUnits: policy?.safetyStockUnits ?? null,
      recommendedSafetyStockUnits,
      confidence,
      status,
      reason,
    }
  }).sort((left, right) => {
    const rank: Record<ShopDemandStatus, number> = { stockout_risk: 0, reorder_soon: 1, insufficient_history: 2, monitor: 3 }
    return rank[left.status] - rank[right.status]
      || right.netDemandUnits - left.netDemandUnits
      || left.sku.localeCompare(right.sku)
  })
  const completedOrderIds = completedOrders.map((order) => order.id).sort()
  const returnActionIds = completedOrders.flatMap((order) => order.returns ?? [])
    .filter((returned) => Date.parse(returned.createdAt) <= asOfValue)
    .map((returned) => returned.actionId).sort()
  const source = {
    commerceDigest: plantOrderEvidenceDigest({ asOf, state }),
    completedOrderIds,
    returnActionIds,
  }
  const summary = {
    reviewedSkus: rows.length,
    demandSkus: rows.filter((row) => row.netDemandUnits > 0).length,
    stockoutRisks: rows.filter((row) => row.status === 'stockout_risk').length,
    reorderSoon: rows.filter((row) => row.status === 'reorder_soon').length,
    insufficientHistory: rows.filter((row) => row.confidence === 'insufficient').length,
    netDemandUnits: rows.reduce((total, row) => safeAdd(total, row.netDemandUnits, 'Net demand'), 0),
    forecastWeeklyUnits: rows.reduce((total, row) => safeAdd(total, row.forecastWeeklyUnits, 'Weekly forecast'), 0),
  }
  const body = {
    contract: SHOP_DEMAND_INTELLIGENCE_CONTRACT,
    asOf,
    lookbackDays: SHOP_DEMAND_LOOKBACK_DAYS,
    rows,
    summary,
    source,
    authority: {
      recommendationOnly: true,
      purchaseCreated: false,
      supplierContacted: false,
      inventoryChanged: false,
      policyChanged: false,
      providerCalled: false,
    } as const,
  }
  return { ...body, digest: plantOrderEvidenceDigest(body) }
}

export function validateShopDemandIntelligence(value: unknown, state: CommerceState, asOf: number) {
  const expected = projectShopDemandIntelligence(state, asOf)
  if (!value || typeof value !== 'object'
    || (value as { contract?: unknown }).contract !== SHOP_DEMAND_INTELLIGENCE_CONTRACT
    || plantOrderEvidenceDigest(value) !== plantOrderEvidenceDigest(expected)) {
    throw new Error('Shop demand intelligence does not match retained Commerce evidence.')
  }
  return expected
}
