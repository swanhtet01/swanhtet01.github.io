import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseBudgetEnvelopePeriodBrief = {
  totalEnvelopes: number
  totalCeilingMmk: number
  averageCeilingMmk: number
  minCeilingMmk: number | null
  maxCeilingMmk: number | null
  uniqueLabels: number
  topLabelsByCount: Array<{ label: string; count: number }>
}

export function projectShopPurchaseBudgetEnvelopePeriodBrief(
  commerce: CommerceState,
): ShopPurchaseBudgetEnvelopePeriodBrief {
  const envelopes = commerce.purchaseBudgetEnvelopes ?? []
  let totalEnvelopes = 0
  let totalCeilingMmk = 0
  let minCeilingMmk: number | null = null
  let maxCeilingMmk: number | null = null
  const labelMap = new Map<string, number>()

  for (const envelope of envelopes) {
    totalEnvelopes++
    const ceiling = envelope.ceilingMmk
    totalCeilingMmk += ceiling
    if (minCeilingMmk === null || ceiling < minCeilingMmk) minCeilingMmk = ceiling
    if (maxCeilingMmk === null || ceiling > maxCeilingMmk) maxCeilingMmk = ceiling
    labelMap.set(envelope.label, (labelMap.get(envelope.label) ?? 0) + 1)
  }

  const topLabelsByCount = Array.from(labelMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)

  return {
    totalEnvelopes,
    totalCeilingMmk,
    averageCeilingMmk: totalEnvelopes > 0 ? Math.round(totalCeilingMmk / totalEnvelopes) : 0,
    minCeilingMmk,
    maxCeilingMmk,
    uniqueLabels: labelMap.size,
    topLabelsByCount,
  }
}
