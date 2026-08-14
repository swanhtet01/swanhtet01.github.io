import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRatesBrief = {
  totalIntents: number
  complianceCount: number
  complianceRate: number
  customerNotificationCount: number
  customerNotificationRate: number
  providerEscalationCount: number
  providerEscalationRate: number
  refundInitiatedCount: number
  refundInitiationRate: number
  refundSettledCount: number
  refundSettlementRate: number
  pendingRefundCount: number
  pendingRefundRate: number
}

export function projectEcommerceCorrectionIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRatesBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      complianceCount: 0,
      complianceRate: 0,
      customerNotificationCount: 0,
      customerNotificationRate: 0,
      providerEscalationCount: 0,
      providerEscalationRate: 0,
      refundInitiatedCount: 0,
      refundInitiationRate: 0,
      refundSettledCount: 0,
      refundSettlementRate: 0,
      pendingRefundCount: 0,
      pendingRefundRate: 0,
    }
  }

  let complianceCount = 0
  let customerNotificationCount = 0
  let providerEscalationCount = 0
  let refundInitiatedCount = 0
  let refundSettledCount = 0
  let pendingRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted && intent.taxFiled) complianceCount++
    if (intent.customerMessageSent) customerNotificationCount++
    if (intent.providerCalled) providerEscalationCount++
    if (intent.refundStarted) refundInitiatedCount++
    if (intent.refundStatus === 'settled') refundSettledCount++
    if (intent.refundStatus === 'due') pendingRefundCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    complianceCount,
    complianceRate: rate(complianceCount),
    customerNotificationCount,
    customerNotificationRate: rate(customerNotificationCount),
    providerEscalationCount,
    providerEscalationRate: rate(providerEscalationCount),
    refundInitiatedCount,
    refundInitiationRate: rate(refundInitiatedCount),
    refundSettledCount,
    refundSettlementRate: rate(refundSettledCount),
    pendingRefundCount,
    pendingRefundRate: rate(pendingRefundCount),
  }
}
