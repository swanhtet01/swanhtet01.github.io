import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionSummary = {
  totalRequisitions: number
  uniqueSuppliers: number
  uniqueSkus: number
  totalQuantityRequested: number
  totalValueMmk: number
  averageUnitCostMmk: number
  topSupplier: string | null
  linkedToBudget: number
}

export function projectShopPurchaseRequisitionSummary(commerce: CommerceState): ShopPurchaseRequisitionSummary {
  const requisitions = commerce.purchaseRequisitions ?? []
  const supplierMap = new Map<string, number>()
  const skuSet = new Set<string>()
  let totalQuantityRequested = 0
  let totalValueMmk = 0
  let totalUnitCostMmk = 0
  let linkedToBudget = 0

  for (const req of requisitions) {
    supplierMap.set(req.supplier, (supplierMap.get(req.supplier) ?? 0) + 1)
    skuSet.add(req.sku)
    totalQuantityRequested += req.quantityRequested
    totalValueMmk += req.totalMmk
    totalUnitCostMmk += req.unitCostMmk
    if (req.budgetEnvelopeId !== undefined) linkedToBudget++
  }

  let topSupplier: string | null = null
  for (const [supplier, count] of supplierMap.entries()) {
    const best = topSupplier !== null ? (supplierMap.get(topSupplier) ?? 0) : -1
    if (topSupplier === null || count > best || (count === best && supplier < topSupplier)) {
      topSupplier = supplier
    }
  }

  return {
    totalRequisitions: requisitions.length,
    uniqueSuppliers: supplierMap.size,
    uniqueSkus: skuSet.size,
    totalQuantityRequested,
    totalValueMmk,
    averageUnitCostMmk: requisitions.length > 0 ? Math.round(totalUnitCostMmk / requisitions.length) : 0,
    topSupplier,
    linkedToBudget,
  }
}
