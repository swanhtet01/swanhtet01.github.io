import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentLineCountSwitchBrief = {
  totalIntents: number
  singleSameCount: number
  singleSwitchCount: number
  multiSameCount: number
  multiSwitchCount: number
  singleCount: number
  multiCount: number
}

export function projectEcommerceAmendmentIntentLineCountSwitchBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentLineCountSwitchBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      singleSameCount: 0,
      singleSwitchCount: 0,
      multiSameCount: 0,
      multiSwitchCount: 0,
      singleCount: 0,
      multiCount: 0,
    }
  }

  let singleSameCount = 0
  let singleSwitchCount = 0
  let multiSameCount = 0
  let multiSwitchCount = 0

  for (const intent of buying.amendmentIntents) {
    const isSingle = intent.lineChanges.length === 1
    const isSame = intent.fromFulfilment === intent.toFulfilment
    if (isSingle) {
      if (isSame) singleSameCount++
      else singleSwitchCount++
    } else {
      if (isSame) multiSameCount++
      else multiSwitchCount++
    }
  }

  return {
    totalIntents: total,
    singleSameCount,
    singleSwitchCount,
    multiSameCount,
    multiSwitchCount,
    singleCount: singleSameCount + singleSwitchCount,
    multiCount: multiSameCount + multiSwitchCount,
  }
}
