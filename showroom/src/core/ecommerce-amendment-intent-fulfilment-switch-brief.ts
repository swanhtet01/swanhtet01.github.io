import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceAmendmentIntentFulfilmentSwitchBrief = {
  totalIntents: number; sameModeCount: number; modeSwitchCount: number
}
export function projectEcommerceAmendmentIntentFulfilmentSwitchBrief(buying: EcommerceBuyingState): EcommerceAmendmentIntentFulfilmentSwitchBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) return { totalIntents: 0, sameModeCount: 0, modeSwitchCount: 0 }
  let sameModeCount = 0; let modeSwitchCount = 0
  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment === intent.toFulfilment) sameModeCount++
    else modeSwitchCount++
  }
  return { totalIntents: total, sameModeCount, modeSwitchCount }
}
