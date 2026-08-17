import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportReopenBrief = {
  totalCases: number
  reopenedCases: number
  notReopenedCases: number
  reopenRate: number
  byReopenPriority: {
    urgent: number
    high: number
    normal: number
    low: number
  }
  casesWithFollowUpResolution: number
  casesOpenAfterReopen: number
}

export function projectShopOrderSupportReopenBrief(commerce: CommerceState): ShopOrderSupportReopenBrief {
  let totalCases = 0
  let reopenedCases = 0
  let casesWithFollowUpResolution = 0
  let casesOpenAfterReopen = 0
  const byReopenPriority = { urgent: 0, high: 0, normal: 0, low: 0 }

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      if (sc.reopen !== undefined) {
        reopenedCases++
        byReopenPriority[sc.reopen.priority as keyof typeof byReopenPriority]++
        if (sc.followUpResolution !== undefined) casesWithFollowUpResolution++
        else casesOpenAfterReopen++
      }
    }
  }

  return {
    totalCases,
    reopenedCases,
    notReopenedCases: totalCases - reopenedCases,
    reopenRate: totalCases > 0 ? Math.round((reopenedCases / totalCases) * 100) : 0,
    byReopenPriority,
    casesWithFollowUpResolution,
    casesOpenAfterReopen,
  }
}
