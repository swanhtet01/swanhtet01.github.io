import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCustomerMessageExternalMessageBrief = {
  totalIntents: number
  messageSentExternalSentCount: number
  messageSentNoExternalCount: number
  noMessageExternalSentCount: number
  noMessageNoExternalCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCustomerMessageExternalMessageBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentExternalSentCount: 0,
      messageSentNoExternalCount: 0,
      noMessageExternalSentCount: 0,
      noMessageNoExternalCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentExternalSentCount = 0
  let messageSentNoExternalCount = 0
  let noMessageExternalSentCount = 0
  let noMessageNoExternalCount = 0

  for (const intent of buying.supportIntents) {
    if (intent.customerMessageSent) {
      if (intent.externalMessageSent) messageSentExternalSentCount++
      else messageSentNoExternalCount++
    } else {
      if (intent.externalMessageSent) noMessageExternalSentCount++
      else noMessageNoExternalCount++
    }
  }

  return {
    totalIntents: total,
    messageSentExternalSentCount,
    messageSentNoExternalCount,
    noMessageExternalSentCount,
    noMessageNoExternalCount,
    messageSentCount: messageSentExternalSentCount + messageSentNoExternalCount,
    noMessageCount: noMessageExternalSentCount + noMessageNoExternalCount,
  }
}
