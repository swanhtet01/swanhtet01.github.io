import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentRatesBrief = {
  totalIntents: number
  externalMessageCount: number
  externalMessageRate: number
  refundStartedCount: number
  refundStartedRate: number
}

export function projectEcommerceSupportIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentRatesBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      externalMessageCount: 0,
      externalMessageRate: 0,
      refundStartedCount: 0,
      refundStartedRate: 0,
    }
  }

  let externalMessageCount = 0
  let refundStartedCount = 0

  for (const intent of buying.supportIntents) {
    if (intent.externalMessageSent) externalMessageCount++
    if (intent.refundStarted) refundStartedCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    externalMessageCount,
    externalMessageRate: rate(externalMessageCount),
    refundStartedCount,
    refundStartedRate: rate(refundStartedCount),
  }
}
