import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentSwitchLineCountBrief = {
  totalIntents: number
  sameModeCount: number
  switchModeCount: number
  sameModeSingleLineCount: number
  sameModeMultiLineCount: number
  switchModeSingleLineCount: number
  switchModeMultiLineCount: number
}

export function projectEcommerceAmendmentIntentSwitchLineCountBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentSwitchLineCountBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      sameModeCount: 0,
      switchModeCount: 0,
      sameModeSingleLineCount: 0,
      sameModeMultiLineCount: 0,
      switchModeSingleLineCount: 0,
      switchModeMultiLineCount: 0,
    }
  }

  let sameModeSingleLineCount = 0
  let sameModeMultiLineCount = 0
  let switchModeSingleLineCount = 0
  let switchModeMultiLineCount = 0

  for (const intent of buying.amendmentIntents) {
    const isSameMode = intent.fromFulfilment === intent.toFulfilment
    const isSingleLine = intent.lineChanges.length === 1
    if (isSameMode) {
      if (isSingleLine) sameModeSingleLineCount++
      else sameModeMultiLineCount++
    } else {
      if (isSingleLine) switchModeSingleLineCount++
      else switchModeMultiLineCount++
    }
  }

  const sameModeCount = sameModeSingleLineCount + sameModeMultiLineCount
  const switchModeCount = switchModeSingleLineCount + switchModeMultiLineCount

  return {
    totalIntents: total,
    sameModeCount,
    switchModeCount,
    sameModeSingleLineCount,
    sameModeMultiLineCount,
    switchModeSingleLineCount,
    switchModeMultiLineCount,
  }
}
