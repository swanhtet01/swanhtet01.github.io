import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportCaseOwnerBrief = {
  totalCases: number
  casesWithOwner: number
  casesWithoutOwner: number
  ownershipCoverage: number
  openCasesWithoutOwner: number
  casesWithDueAt: number
  casesWithoutDueAt: number
}

export function projectShopOrderSupportCaseOwnerBrief(commerce: CommerceState): ShopOrderSupportCaseOwnerBrief {
  let totalCases = 0
  let casesWithOwner = 0
  let openCasesWithoutOwner = 0
  let casesWithDueAt = 0

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      if (sc.owner !== undefined) {
        casesWithOwner++
      } else if (sc.status === 'open') {
        openCasesWithoutOwner++
      }
      if (sc.dueAt !== undefined) casesWithDueAt++
    }
  }

  return {
    totalCases,
    casesWithOwner,
    casesWithoutOwner: totalCases - casesWithOwner,
    ownershipCoverage: totalCases > 0 ? Math.round((casesWithOwner / totalCases) * 100) : 0,
    openCasesWithoutOwner,
    casesWithDueAt,
    casesWithoutDueAt: totalCases - casesWithDueAt,
  }
}
