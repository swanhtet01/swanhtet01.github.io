import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentOrderStatusSwitchBrief = {
  totalIntents: number
  confirmedSameCount: number
  confirmedSwitchCount: number
  preparingSameCount: number
  preparingSwitchCount: number
  readySameCount: number
  readySwitchCount: number
}

export function projectEcommerceAmendmentIntentOrderStatusSwitchBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentOrderStatusSwitchBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      confirmedSameCount: 0,
      confirmedSwitchCount: 0,
      preparingSameCount: 0,
      preparingSwitchCount: 0,
      readySameCount: 0,
      readySwitchCount: 0,
    }
  }

  let confirmedSameCount = 0
  let confirmedSwitchCount = 0
  let preparingSameCount = 0
  let preparingSwitchCount = 0
  let readySameCount = 0
  let readySwitchCount = 0

  for (const intent of buying.amendmentIntents) {
    const isSame = intent.fromFulfilment === intent.toFulfilment
    if (intent.orderStatus === 'confirmed') {
      if (isSame) confirmedSameCount++
      else confirmedSwitchCount++
    } else if (intent.orderStatus === 'preparing') {
      if (isSame) preparingSameCount++
      else preparingSwitchCount++
    } else {
      if (isSame) readySameCount++
      else readySwitchCount++
    }
  }

  return {
    totalIntents: total,
    confirmedSameCount,
    confirmedSwitchCount,
    preparingSameCount,
    preparingSwitchCount,
    readySameCount,
    readySwitchCount,
  }
}
