import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportCasePriorityBrief = {
  totalCases: number
  casesWithPriority: number
  casesWithoutPriority: number
  priorityCoverage: number
  byPriority: { urgent: number; high: number; normal: number; low: number }
  urgentOpenCases: number
}

export function projectShopOrderSupportCasePriorityBrief(commerce: CommerceState): ShopOrderSupportCasePriorityBrief {
  let totalCases = 0
  let casesWithPriority = 0
  let urgentOpenCases = 0
  const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 }

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      if (sc.priority !== undefined) {
        casesWithPriority++
        byPriority[sc.priority as keyof typeof byPriority]++
        if (sc.priority === 'urgent' && sc.status === 'open') urgentOpenCases++
      }
    }
  }

  return {
    totalCases,
    casesWithPriority,
    casesWithoutPriority: totalCases - casesWithPriority,
    priorityCoverage: totalCases > 0 ? Math.round((casesWithPriority / totalCases) * 100) : 0,
    byPriority,
    urgentOpenCases,
  }
}
