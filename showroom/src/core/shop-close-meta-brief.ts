import type { CommerceState } from './commerce-workspace.ts'

export type ShopCloseMetaBrief = {
  totalCloses: number
  closesWithReason: number
  closesWithoutReason: number
  reasonRate: number
  topReasonsByCount: Array<{ reason: string; count: number }>
  closesWithEvidence: number
  closesWithoutEvidence: number
  evidenceRate: number
}

export function projectShopCloseMetaBrief(commerce: CommerceState): ShopCloseMetaBrief {
  let totalCloses = 0
  let closesWithReason = 0
  let closesWithoutReason = 0
  let closesWithEvidence = 0
  let closesWithoutEvidence = 0
  const reasonMap = new Map<string, number>()

  for (const close of commerce.closes) {
    totalCloses++
    if (close.reason !== undefined) {
      closesWithReason++
      reasonMap.set(close.reason, (reasonMap.get(close.reason) ?? 0) + 1)
    } else {
      closesWithoutReason++
    }
    if (close.evidenceReference !== undefined) {
      closesWithEvidence++
    } else {
      closesWithoutEvidence++
    }
  }

  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalCloses,
    closesWithReason,
    closesWithoutReason,
    reasonRate: totalCloses > 0 ? Math.round((closesWithReason / totalCloses) * 100) : 0,
    topReasonsByCount,
    closesWithEvidence,
    closesWithoutEvidence,
    evidenceRate: totalCloses > 0 ? Math.round((closesWithEvidence / totalCloses) * 100) : 0,
  }
}
