import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportCaseSummary = {
  ordersWithSupportCases: number
  totalCases: number
  openCases: number
  resolvedCases: number
  byCategory: {
    order_status: number
    delivery_issue: number
    payment_question: number
    item_issue: number
    other: number
  }
}

export function projectShopOrderSupportCaseSummary(commerce: CommerceState): ShopOrderSupportCaseSummary {
  const byCategory = {
    order_status: 0,
    delivery_issue: 0,
    payment_question: 0,
    item_issue: 0,
    other: 0,
  }
  let ordersWithSupportCases = 0
  let totalCases = 0
  let openCases = 0
  let resolvedCases = 0

  for (const order of commerce.orders) {
    if (!order.supportCases || order.supportCases.length === 0) continue
    ordersWithSupportCases++
    for (const sc of order.supportCases) {
      totalCases++
      if (sc.status === 'open') openCases++
      else resolvedCases++
      byCategory[sc.category]++
    }
  }

  return { ordersWithSupportCases, totalCases, openCases, resolvedCases, byCategory }
}
