import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageRefundStartedBrief = {
  totalIntents: number
  messageSentRefundStartedCount: number
  messageSentNoRefundCount: number
  noMessageRefundStartedCount: number
  noMessageNoRefundCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageRefundStartedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentRefundStartedCount: 0,
      messageSentNoRefundCount: 0,
      noMessageRefundStartedCount: 0,
      noMessageNoRefundCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentRefundStartedCount = 0
  let messageSentNoRefundCount = 0
  let noMessageRefundStartedCount = 0
  let noMessageNoRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.refundStarted) messageSentRefundStartedCount++
      else messageSentNoRefundCount++
    } else {
      if (intent.refundStarted) noMessageRefundStartedCount++
      else noMessageNoRefundCount++
    }
  }

  return {
    totalIntents: total,
    messageSentRefundStartedCount,
    messageSentNoRefundCount,
    noMessageRefundStartedCount,
    noMessageNoRefundCount,
    messageSentCount: messageSentRefundStartedCount + messageSentNoRefundCount,
    noMessageCount: noMessageRefundStartedCount + noMessageNoRefundCount,
  }
}
