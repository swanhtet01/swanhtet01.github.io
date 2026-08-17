import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageOrderChangedBrief = {
  totalIntents: number
  messageSentOrderChangedCount: number
  messageSentNoOrderChangeCount: number
  noMessageOrderChangedCount: number
  noMessageNoOrderChangeCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentOrderChangedCount: 0,
      messageSentNoOrderChangeCount: 0,
      noMessageOrderChangedCount: 0,
      noMessageNoOrderChangeCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentOrderChangedCount = 0
  let messageSentNoOrderChangeCount = 0
  let noMessageOrderChangedCount = 0
  let noMessageNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.orderChanged) messageSentOrderChangedCount++
      else messageSentNoOrderChangeCount++
    } else {
      if (intent.orderChanged) noMessageOrderChangedCount++
      else noMessageNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    messageSentOrderChangedCount,
    messageSentNoOrderChangeCount,
    noMessageOrderChangedCount,
    noMessageNoOrderChangeCount,
    messageSentCount: messageSentOrderChangedCount + messageSentNoOrderChangeCount,
    noMessageCount: noMessageOrderChangedCount + noMessageNoOrderChangeCount,
  }
}
