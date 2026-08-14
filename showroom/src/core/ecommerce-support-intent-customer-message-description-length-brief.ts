import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentCustomerMessageDescriptionLengthBrief = {
  totalIntents: number
  messageSentShortCount: number
  messageSentDetailedCount: number
  noMessageShortCount: number
  noMessageDetailedCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentCustomerMessageDescriptionLengthBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentShortCount: 0,
      messageSentDetailedCount: 0,
      noMessageShortCount: 0,
      noMessageDetailedCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentShortCount = 0
  let messageSentDetailedCount = 0
  let noMessageShortCount = 0
  let noMessageDetailedCount = 0

  for (const intent of buying.supportIntents) {
    const isShort = intent.description.length <= 40
    if (intent.externalMessageSent) {
      if (isShort) messageSentShortCount++
      else messageSentDetailedCount++
    } else {
      if (isShort) noMessageShortCount++
      else noMessageDetailedCount++
    }
  }

  return {
    totalIntents: total,
    messageSentShortCount,
    messageSentDetailedCount,
    noMessageShortCount,
    noMessageDetailedCount,
    messageSentCount: messageSentShortCount + messageSentDetailedCount,
    noMessageCount: noMessageShortCount + noMessageDetailedCount,
  }
}
