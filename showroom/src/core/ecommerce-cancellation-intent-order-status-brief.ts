import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderStatusBrief = {
  totalIntents: number
  confirmed: number
  preparing: number
  ready: number
  confirmedRate: number
  preparingRate: number
  readyRate: number
}

export function projectEcommerceCancellationIntentOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0)
    return {
      totalIntents: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      confirmedRate: 0,
      preparingRate: 0,
      readyRate: 0,
    }
  let confirmed = 0
  let preparing = 0
  let ready = 0
  for (const intent of buying.cancellationIntents) {
    if (intent.orderStatus === 'confirmed') confirmed++
    else if (intent.orderStatus === 'preparing') preparing++
    else if (intent.orderStatus === 'ready') ready++
  }
  return {
    totalIntents: total,
    confirmed,
    preparing,
    ready,
    confirmedRate: Math.round((confirmed / total) * 100),
    preparingRate: Math.round((preparing / total) * 100),
    readyRate: Math.round((ready / total) * 100),
  }
}
