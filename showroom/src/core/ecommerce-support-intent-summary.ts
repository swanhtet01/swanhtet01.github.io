import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportCategoryBreakdown = {
  order_status: number
  delivery_issue: number
  payment_question: number
  item_issue: number
  other: number
}

export type EcommerceSupportIntentSummary = {
  totalIntents: number
  byCategory: EcommerceSupportCategoryBreakdown
  uniqueOrders: number
  uniqueSourceRequests: number
  topCategory: keyof EcommerceSupportCategoryBreakdown | null
}

export function projectEcommerceSupportIntentSummary(buying: EcommerceBuyingState): EcommerceSupportIntentSummary {
  const byCategory: EcommerceSupportCategoryBreakdown = {
    order_status: 0,
    delivery_issue: 0,
    payment_question: 0,
    item_issue: 0,
    other: 0,
  }
  const orderSet = new Set<string>()
  const requestSet = new Set<string>()

  for (const intent of buying.supportIntents) {
    byCategory[intent.category as keyof EcommerceSupportCategoryBreakdown] += 1
    orderSet.add(intent.orderId)
    requestSet.add(intent.sourceRequestId)
  }

  let topCategory: keyof EcommerceSupportCategoryBreakdown | null = null
  if (buying.supportIntents.length > 0) {
    const categories = Object.keys(byCategory) as (keyof EcommerceSupportCategoryBreakdown)[]
    topCategory = categories.reduce((best, cat) => {
      const bestCount = byCategory[best]
      const catCount = byCategory[cat]
      return catCount > bestCount || (catCount === bestCount && cat < best) ? cat : best
    })
  }

  return {
    totalIntents: buying.supportIntents.length,
    byCategory,
    uniqueOrders: orderSet.size,
    uniqueSourceRequests: requestSet.size,
    topCategory,
  }
}
