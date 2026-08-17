import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentReasonCodeRatesBrief = {
  totalIntents: number
  pricingErrorCount: number
  pricingErrorRate: number
  serviceRecoveryCount: number
  serviceRecoveryRate: number
  feeAdjustmentCount: number
  feeAdjustmentRate: number
  otherReasonCount: number
  otherReasonRate: number
}

export function projectEcommerceCorrectionIntentReasonCodeRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentReasonCodeRatesBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pricingErrorCount: 0,
      pricingErrorRate: 0,
      serviceRecoveryCount: 0,
      serviceRecoveryRate: 0,
      feeAdjustmentCount: 0,
      feeAdjustmentRate: 0,
      otherReasonCount: 0,
      otherReasonRate: 0,
    }
  }

  let pricingErrorCount = 0
  let serviceRecoveryCount = 0
  let feeAdjustmentCount = 0
  let otherReasonCount = 0

  for (const intent of buying.correctionIntents) {
    switch (intent.reasonCode) {
      case 'pricing_error': pricingErrorCount++; break
      case 'service_recovery': serviceRecoveryCount++; break
      case 'fee_adjustment': feeAdjustmentCount++; break
      default: otherReasonCount++; break
    }
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    pricingErrorCount,
    pricingErrorRate: rate(pricingErrorCount),
    serviceRecoveryCount,
    serviceRecoveryRate: rate(serviceRecoveryCount),
    feeAdjustmentCount,
    feeAdjustmentRate: rate(feeAdjustmentCount),
    otherReasonCount,
    otherReasonRate: rate(otherReasonCount),
  }
}
