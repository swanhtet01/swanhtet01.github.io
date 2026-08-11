import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionLinkBrief = {
  totalRequisitions: number
  requisitionsWithBudgetEnvelope: number
  budgetEnvelopeRate: number
  requisitionsWithSourcingDecision: number
  sourcingDecisionRate: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  earliestExpectedAt: string | null
  latestExpectedAt: string | null
}

export function projectShopPurchaseRequisitionLinkBrief(
  commerce: CommerceState,
): ShopPurchaseRequisitionLinkBrief {
  let totalRequisitions = 0
  let requisitionsWithBudgetEnvelope = 0
  let requisitionsWithSourcingDecision = 0
  let earliestCreatedAt: string | null = null
  let latestCreatedAt: string | null = null
  let earliestExpectedAt: string | null = null
  let latestExpectedAt: string | null = null

  for (const req of commerce.purchaseRequisitions ?? []) {
    totalRequisitions++
    if (req.budgetEnvelopeId !== undefined) requisitionsWithBudgetEnvelope++
    if (req.sourceSourcingDecisionId !== undefined) requisitionsWithSourcingDecision++

    const created = req.createdAt
    if (earliestCreatedAt === null || created < earliestCreatedAt) earliestCreatedAt = created
    if (latestCreatedAt === null || created > latestCreatedAt) latestCreatedAt = created

    const expected = req.expectedAt
    if (earliestExpectedAt === null || expected < earliestExpectedAt) earliestExpectedAt = expected
    if (latestExpectedAt === null || expected > latestExpectedAt) latestExpectedAt = expected
  }

  return {
    totalRequisitions,
    requisitionsWithBudgetEnvelope,
    budgetEnvelopeRate:
      totalRequisitions > 0
        ? Math.round((requisitionsWithBudgetEnvelope / totalRequisitions) * 100)
        : 0,
    requisitionsWithSourcingDecision,
    sourcingDecisionRate:
      totalRequisitions > 0
        ? Math.round((requisitionsWithSourcingDecision / totalRequisitions) * 100)
        : 0,
    earliestCreatedAt,
    latestCreatedAt,
    earliestExpectedAt,
    latestExpectedAt,
  }
}
