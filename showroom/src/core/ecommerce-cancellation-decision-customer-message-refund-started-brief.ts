import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessageRefundStartedBrief = {
  totalDecisions: number
  messageSentRefundStartedCount: number
  messageSentNoRefundCount: number
  noMessageRefundStartedCount: number
  noMessageNoRefundCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessageRefundStartedBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
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

  for (const decision of buying.cancellationDecisions) {
    if (decision.customerMessageSent) {
      if (decision.refundStarted) messageSentRefundStartedCount++
      else messageSentNoRefundCount++
    } else {
      if (decision.refundStarted) noMessageRefundStartedCount++
      else noMessageNoRefundCount++
    }
  }

  return {
    totalDecisions: total,
    messageSentRefundStartedCount,
    messageSentNoRefundCount,
    noMessageRefundStartedCount,
    noMessageNoRefundCount,
    messageSentCount: messageSentRefundStartedCount + messageSentNoRefundCount,
    noMessageCount: noMessageRefundStartedCount + noMessageNoRefundCount,
  }
}
