import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessageOrderStatusBrief = {
  totalDecisions: number
  messageSentConfirmedCount: number
  messageSentPreparingCount: number
  messageSentReadyCount: number
  noMessageConfirmedCount: number
  noMessagePreparingCount: number
  noMessageReadyCount: number
}

export function projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessageOrderStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      messageSentConfirmedCount: 0,
      messageSentPreparingCount: 0,
      messageSentReadyCount: 0,
      noMessageConfirmedCount: 0,
      noMessagePreparingCount: 0,
      noMessageReadyCount: 0,
    }
  }

  let messageSentConfirmedCount = 0
  let messageSentPreparingCount = 0
  let messageSentReadyCount = 0
  let noMessageConfirmedCount = 0
  let noMessagePreparingCount = 0
  let noMessageReadyCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.customerMessageSent) {
      if (decision.orderStatus === 'confirmed') messageSentConfirmedCount++
      else if (decision.orderStatus === 'preparing') messageSentPreparingCount++
      else messageSentReadyCount++
    } else {
      if (decision.orderStatus === 'confirmed') noMessageConfirmedCount++
      else if (decision.orderStatus === 'preparing') noMessagePreparingCount++
      else noMessageReadyCount++
    }
  }

  return {
    totalDecisions: total,
    messageSentConfirmedCount,
    messageSentPreparingCount,
    messageSentReadyCount,
    noMessageConfirmedCount,
    noMessagePreparingCount,
    noMessageReadyCount,
  }
}
