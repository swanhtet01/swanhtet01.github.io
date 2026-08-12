import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRequestedKindRatesBrief = {
  totalIntents: number
  creditCount: number
  creditRate: number
  debitCount: number
  debitRate: number
}

export function projectEcommerceCorrectionIntentRequestedKindRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRequestedKindRatesBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      creditCount: 0,
      creditRate: 0,
      debitCount: 0,
      debitRate: 0,
    }
  }

  let creditCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') creditCount++
  }

  const debitCount = total - creditCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    creditCount,
    creditRate: rate(creditCount),
    debitCount,
    debitRate: rate(debitCount),
  }
}
