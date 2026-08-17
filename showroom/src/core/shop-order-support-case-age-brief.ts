import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportCaseAgeBrief = {
  totalCases: number
  openCases: number
  resolvedCases: number
  earliestOpenCaseRequestedAt: string | null
  latestOpenCaseRequestedAt: string | null
  earliestResolvedCaseRequestedAt: string | null
  latestResolvedCaseRequestedAt: string | null
}

export function projectShopOrderSupportCaseAgeBrief(commerce: CommerceState): ShopOrderSupportCaseAgeBrief {
  let totalCases = 0
  let openCases = 0
  let resolvedCases = 0
  let earliestOpen: string | null = null
  let latestOpen: string | null = null
  let earliestResolved: string | null = null
  let latestResolved: string | null = null

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      const at = sc.customerRequestedAt
      if (sc.status === 'open') {
        openCases++
        if (earliestOpen === null || at < earliestOpen) earliestOpen = at
        if (latestOpen === null || at > latestOpen) latestOpen = at
      } else {
        resolvedCases++
        if (earliestResolved === null || at < earliestResolved) earliestResolved = at
        if (latestResolved === null || at > latestResolved) latestResolved = at
      }
    }
  }

  return {
    totalCases,
    openCases,
    resolvedCases,
    earliestOpenCaseRequestedAt: earliestOpen,
    latestOpenCaseRequestedAt: latestOpen,
    earliestResolvedCaseRequestedAt: earliestResolved,
    latestResolvedCaseRequestedAt: latestResolved,
  }
}
