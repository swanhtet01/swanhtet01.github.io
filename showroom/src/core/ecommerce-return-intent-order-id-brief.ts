import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceReturnIntentOrderIdBrief = {
  totalIntents: number; uniqueOrders: number; topOrder: string | null; topOrderCount: number
}
export function projectEcommerceReturnIntentOrderIdBrief(buying: EcommerceBuyingState) {
  const total = buying.returnIntents.length
  if (total === 0) return { totalIntents: 0, uniqueOrders: 0, topOrder: null, topOrderCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.returnIntents) {
    counts.set(intent.orderId, (counts.get(intent.orderId) ?? 0) + 1)
  }
  let topOrder: string | null = null; let topOrderCount = 0
  for (const [key, count] of counts) { if (count > topOrderCount) { topOrderCount = count; topOrder = key } }
  return { totalIntents: total, uniqueOrders: counts.size, topOrder, topOrderCount }
}
