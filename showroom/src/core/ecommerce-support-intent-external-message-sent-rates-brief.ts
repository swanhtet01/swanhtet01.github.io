import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentExternalMessageSentRatesBrief = {
  totalIntents: number
  externalMessageSentCount: number
  externalMessageSentRate: number
  notExternalMessageSentCount: number
  notExternalMessageSentRate: number
}

export function projectEcommerceSupportIntentExternalMessageSentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentExternalMessageSentRatesBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      externalMessageSentCount: 0,
      externalMessageSentRate: 0,
      notExternalMessageSentCount: 0,
      notExternalMessageSentRate: 0,
    }
  }

  let externalMessageSentCount = 0

  for (const intent of buying.supportIntents) {
    if (intent.externalMessageSent) externalMessageSentCount++
  }

  const notExternalMessageSentCount = total - externalMessageSentCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    externalMessageSentCount,
    externalMessageSentRate: rate(externalMessageSentCount),
    notExternalMessageSentCount,
    notExternalMessageSentRate: rate(notExternalMessageSentCount),
  }
}
