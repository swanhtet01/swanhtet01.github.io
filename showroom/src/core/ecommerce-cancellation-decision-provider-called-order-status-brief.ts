import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionProviderCalledOrderStatusBrief = {
  totalDecisions: number
  providerCalledConfirmedCount: number
  providerCalledPreparingCount: number
  providerCalledReadyCount: number
  noProviderConfirmedCount: number
  noProviderPreparingCount: number
  noProviderReadyCount: number
}

export function projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionProviderCalledOrderStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      providerCalledConfirmedCount: 0,
      providerCalledPreparingCount: 0,
      providerCalledReadyCount: 0,
      noProviderConfirmedCount: 0,
      noProviderPreparingCount: 0,
      noProviderReadyCount: 0,
    }
  }

  let providerCalledConfirmedCount = 0
  let providerCalledPreparingCount = 0
  let providerCalledReadyCount = 0
  let noProviderConfirmedCount = 0
  let noProviderPreparingCount = 0
  let noProviderReadyCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.providerCalled) {
      if (decision.orderStatus === 'confirmed') providerCalledConfirmedCount++
      else if (decision.orderStatus === 'preparing') providerCalledPreparingCount++
      else providerCalledReadyCount++
    } else {
      if (decision.orderStatus === 'confirmed') noProviderConfirmedCount++
      else if (decision.orderStatus === 'preparing') noProviderPreparingCount++
      else noProviderReadyCount++
    }
  }

  return {
    totalDecisions: total,
    providerCalledConfirmedCount,
    providerCalledPreparingCount,
    providerCalledReadyCount,
    noProviderConfirmedCount,
    noProviderPreparingCount,
    noProviderReadyCount,
  }
}
