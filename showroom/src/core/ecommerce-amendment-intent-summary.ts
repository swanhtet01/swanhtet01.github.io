import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type AmendmentFulfilmentTransition = {
  fromFulfilment: string
  toFulfilment: string
  count: number
}

export type EcommerceAmendmentIntentSummary = {
  totalAmendments: number
  uniqueOrders: number
  totalOriginalValueMmk: number
  fulfilmentChangedCount: number
  byFulfilmentTransition: AmendmentFulfilmentTransition[]
}

export function projectEcommerceAmendmentIntentSummary(buying: EcommerceBuyingState): EcommerceAmendmentIntentSummary {
  const orderSet = new Set<string>()
  const transitionMap = new Map<string, number>()

  let totalOriginalValueMmk = 0
  let fulfilmentChangedCount = 0

  for (const amendment of buying.amendmentIntents) {
    orderSet.add(amendment.orderId)
    totalOriginalValueMmk += amendment.originalTotalMmk

    if (amendment.fromFulfilment !== amendment.toFulfilment) fulfilmentChangedCount++

    const key = `${amendment.fromFulfilment}→${amendment.toFulfilment}`
    transitionMap.set(key, (transitionMap.get(key) ?? 0) + 1)
  }

  const byFulfilmentTransition: AmendmentFulfilmentTransition[] = Array.from(transitionMap.entries())
    .map(([key, count]) => {
      const arrowIdx = key.indexOf('→')
      return { fromFulfilment: key.slice(0, arrowIdx), toFulfilment: key.slice(arrowIdx + 1), count }
    })
    .sort((a, b) => b.count - a.count || a.fromFulfilment.localeCompare(b.fromFulfilment))

  return {
    totalAmendments: buying.amendmentIntents.length,
    uniqueOrders: orderSet.size,
    totalOriginalValueMmk,
    fulfilmentChangedCount,
    byFulfilmentTransition,
  }
}
