import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentDescriptionBrief = {
  totalIntents: number
  shortDescriptionCount: number
  mediumDescriptionCount: number
  longDescriptionCount: number
  averageDescriptionLength: number
  minDescriptionLength: number | null
  maxDescriptionLength: number | null
}

export function projectEcommerceSupportIntentDescriptionBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentDescriptionBrief {
  let totalLength = 0
  let shortDescriptionCount = 0
  let mediumDescriptionCount = 0
  let longDescriptionCount = 0
  let minDescriptionLength: number | null = null
  let maxDescriptionLength: number | null = null

  for (const intent of buying.supportIntents) {
    const len = intent.description.length
    totalLength += len
    if (len <= 40) shortDescriptionCount++
    else if (len <= 120) mediumDescriptionCount++
    else longDescriptionCount++
    if (minDescriptionLength === null || len < minDescriptionLength) minDescriptionLength = len
    if (maxDescriptionLength === null || len > maxDescriptionLength) maxDescriptionLength = len
  }

  const totalIntents = buying.supportIntents.length

  return {
    totalIntents,
    shortDescriptionCount,
    mediumDescriptionCount,
    longDescriptionCount,
    averageDescriptionLength: totalIntents > 0 ? Math.round(totalLength / totalIntents) : 0,
    minDescriptionLength,
    maxDescriptionLength,
  }
}
