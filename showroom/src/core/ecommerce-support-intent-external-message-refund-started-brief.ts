import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentExternalMessageRefundStartedBrief = {
  totalIntents: number
  externalSentRefundStartedCount: number
  externalSentNoRefundCount: number
  noExternalRefundStartedCount: number
  noExternalNoRefundCount: number
  externalSentCount: number
  noExternalCount: number
}

export function projectEcommerceSupportIntentExternalMessageRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentExternalMessageRefundStartedBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      externalSentRefundStartedCount: 0,
      externalSentNoRefundCount: 0,
      noExternalRefundStartedCount: 0,
      noExternalNoRefundCount: 0,
      externalSentCount: 0,
      noExternalCount: 0,
    }
  }

  let externalSentRefundStartedCount = 0
  let externalSentNoRefundCount = 0
  let noExternalRefundStartedCount = 0
  let noExternalNoRefundCount = 0

  for (const intent of buying.supportIntents) {
    if (intent.externalMessageSent) {
      if (intent.refundStarted) externalSentRefundStartedCount++
      else externalSentNoRefundCount++
    } else {
      if (intent.refundStarted) noExternalRefundStartedCount++
      else noExternalNoRefundCount++
    }
  }

  return {
    totalIntents: total,
    externalSentRefundStartedCount,
    externalSentNoRefundCount,
    noExternalRefundStartedCount,
    noExternalNoRefundCount,
    externalSentCount: externalSentRefundStartedCount + externalSentNoRefundCount,
    noExternalCount: noExternalRefundStartedCount + noExternalNoRefundCount,
  }
}
