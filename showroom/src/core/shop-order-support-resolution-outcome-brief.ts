import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportResolutionOutcomeBrief = {
  totalCases: number
  resolvedCases: number
  unresolvedCases: number
  resolutionRate: number
  byOutcome: {
    informationProvided: number
    replacementReviewRequired: number
    refundReviewRequired: number
    noAction: number
  }
  refundReviewRate: number
  followUpResolutionCases: number
}

export function projectShopOrderSupportResolutionOutcomeBrief(commerce: CommerceState): ShopOrderSupportResolutionOutcomeBrief {
  let totalCases = 0
  let resolvedCases = 0
  let followUpResolutionCases = 0
  const byOutcome = { informationProvided: 0, replacementReviewRequired: 0, refundReviewRequired: 0, noAction: 0 }

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      if (sc.resolution !== undefined) {
        resolvedCases++
        if (sc.resolution.outcome === 'information_provided') byOutcome.informationProvided++
        else if (sc.resolution.outcome === 'replacement_review_required') byOutcome.replacementReviewRequired++
        else if (sc.resolution.outcome === 'refund_review_required') byOutcome.refundReviewRequired++
        else if (sc.resolution.outcome === 'no_action') byOutcome.noAction++
      }
      if (sc.followUpResolution !== undefined) followUpResolutionCases++
    }
  }

  return {
    totalCases,
    resolvedCases,
    unresolvedCases: totalCases - resolvedCases,
    resolutionRate: totalCases > 0 ? Math.round((resolvedCases / totalCases) * 100) : 0,
    byOutcome,
    refundReviewRate: resolvedCases > 0 ? Math.round((byOutcome.refundReviewRequired / resolvedCases) * 100) : 0,
    followUpResolutionCases,
  }
}
