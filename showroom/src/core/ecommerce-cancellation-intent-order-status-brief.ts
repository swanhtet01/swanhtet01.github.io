import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationIntentOrderStatusBrief = {
  totalIntents: number; confirmedCount: number; preparingCount: number; readyCount: number
}
export function projectEcommerceCancellationIntentOrderStatusBrief(buying: EcommerceBuyingState): EcommerceCancellationIntentOrderStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) return { totalIntents: 0, confirmedCount: 0, preparingCount: 0, readyCount: 0 }
  let confirmedCount = 0; let preparingCount = 0; let readyCount = 0
  for (const intent of buying.cancellationIntents) {
    if (intent.orderStatus === 'confirmed') confirmedCount++
    else if (intent.orderStatus === 'preparing') preparingCount++
    else readyCount++
  }
  return { totalIntents: total, confirmedCount, preparingCount, readyCount }
}
