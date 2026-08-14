import type { CommerceState } from './commerce-workspace.ts'
import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type CrossChannelSkuEntry = {
  sku: string
  ecommerceRequestedQuantity: number
  shopOnHand: number
  shopReorderAt: number
  supplyGap: number
}

export type CrossChannelDemandSupplyBrief = {
  totalEcommerceRequestedSkus: number
  totalShopCatalogSkus: number
  skusInBothChannels: number
  skusWithSupplyGap: number
  skusAtRisk: CrossChannelSkuEntry[]
}

export function projectCrossChannelDemandSupplyBrief(
  commerce: CommerceState,
  buying: EcommerceBuyingState,
): CrossChannelDemandSupplyBrief {
  const ecommerceQuantityBySku = new Map<string, number>()

  for (const request of buying.requests) {
    for (const line of request.lines) {
      ecommerceQuantityBySku.set(line.sku, (ecommerceQuantityBySku.get(line.sku) ?? 0) + line.quantity)
    }
  }

  const shopItemBySku = new Map(commerce.items.map((item) => [item.sku, item]))

  const skusInBothChannels = [...ecommerceQuantityBySku.keys()].filter((sku) => shopItemBySku.has(sku)).length

  const skusAtRisk: CrossChannelSkuEntry[] = []

  for (const [sku, ecommerceRequestedQuantity] of ecommerceQuantityBySku) {
    const shopItem = shopItemBySku.get(sku)
    if (!shopItem) continue
    const supplyGap = ecommerceRequestedQuantity - shopItem.onHand
    if (supplyGap > 0) {
      skusAtRisk.push({
        sku,
        ecommerceRequestedQuantity,
        shopOnHand: shopItem.onHand,
        shopReorderAt: shopItem.reorderAt,
        supplyGap,
      })
    }
  }

  skusAtRisk.sort((a, b) => b.supplyGap - a.supplyGap)

  return {
    totalEcommerceRequestedSkus: ecommerceQuantityBySku.size,
    totalShopCatalogSkus: shopItemBySku.size,
    skusInBothChannels,
    skusWithSupplyGap: skusAtRisk.length,
    skusAtRisk,
  }
}
