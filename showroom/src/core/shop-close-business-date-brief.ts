import type { CommerceState } from './commerce-workspace.ts'

export type ShopCloseBusinessDateBrief = {
  totalCloses: number
  closesWithBusinessDate: number
  closesWithoutBusinessDate: number
  businessDateCoverage: number
  uniqueBusinessDates: number
}

export function projectShopCloseBusinessDateBrief(commerce: CommerceState): ShopCloseBusinessDateBrief {
  const dateSet = new Set<string>()
  let closesWithBusinessDate = 0

  for (const close of commerce.closes) {
    if (close.businessDate !== undefined) {
      closesWithBusinessDate++
      dateSet.add(close.businessDate)
    }
  }

  const totalCloses = commerce.closes.length
  return {
    totalCloses,
    closesWithBusinessDate,
    closesWithoutBusinessDate: totalCloses - closesWithBusinessDate,
    businessDateCoverage: totalCloses > 0 ? Math.round((closesWithBusinessDate / totalCloses) * 100) : 0,
    uniqueBusinessDates: dateSet.size,
  }
}
