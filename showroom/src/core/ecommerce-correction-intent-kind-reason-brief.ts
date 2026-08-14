import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentKindReasonBrief = {
  totalIntents: number
  creditCount: number
  debitCount: number
  creditRate: number
  debitRate: number
  pricingErrorCount: number
  serviceRecoveryCount: number
  feeAdjustmentCount: number
  otherReasonCount: number
  pricingErrorRate: number
  serviceRecoveryRate: number
  feeAdjustmentRate: number
  otherReasonRate: number
}

export function projectEcommerceCorrectionIntentKindReasonBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentKindReasonBrief {
  let creditCount = 0
  let debitCount = 0
  let pricingErrorCount = 0
  let serviceRecoveryCount = 0
  let feeAdjustmentCount = 0
  let otherReasonCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') creditCount++
    else debitCount++

    switch (intent.reasonCode) {
      case 'pricing_error': pricingErrorCount++; break
      case 'service_recovery': serviceRecoveryCount++; break
      case 'fee_adjustment': feeAdjustmentCount++; break
      default: otherReasonCount++; break
    }
  }

  const totalIntents = buying.correctionIntents.length

  return {
    totalIntents,
    creditCount,
    debitCount,
    creditRate: totalIntents > 0 ? Math.round((creditCount / totalIntents) * 100) : 0,
    debitRate: totalIntents > 0 ? Math.round((debitCount / totalIntents) * 100) : 0,
    pricingErrorCount,
    serviceRecoveryCount,
    feeAdjustmentCount,
    otherReasonCount,
    pricingErrorRate: totalIntents > 0 ? Math.round((pricingErrorCount / totalIntents) * 100) : 0,
    serviceRecoveryRate: totalIntents > 0 ? Math.round((serviceRecoveryCount / totalIntents) * 100) : 0,
    feeAdjustmentRate: totalIntents > 0 ? Math.round((feeAdjustmentCount / totalIntents) * 100) : 0,
    otherReasonRate: totalIntents > 0 ? Math.round((otherReasonCount / totalIntents) * 100) : 0,
  }
}
