import type { CommerceState } from './commerce-workspace.ts'

export type ShopTaxLabelBrief = {
  totalConfigurations: number
  uniqueLabels: number
  topLabelsByCount: Array<{ label: string; count: number }>
}

export function projectShopTaxLabelBrief(commerce: CommerceState): ShopTaxLabelBrief {
  let totalConfigurations = 0
  const labelMap = new Map<string, number>()
  for (const taxConfig of commerce.taxConfigurations ?? []) {
    totalConfigurations++
    labelMap.set(taxConfig.label, (labelMap.get(taxConfig.label) ?? 0) + 1)
  }
  const topLabelsByCount = Array.from(labelMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)
  return { totalConfigurations, uniqueLabels: labelMap.size, topLabelsByCount }
}
