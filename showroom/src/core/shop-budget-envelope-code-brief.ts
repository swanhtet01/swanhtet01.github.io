import type { CommerceState } from './commerce-workspace.ts'

export type ShopBudgetEnvelopeCodeBrief = {
  totalEnvelopes: number
  uniqueBudgetCodes: number
  topBudgetCodesByCount: Array<{ budgetCode: string; count: number }>
  uniqueLabels: number
  topLabelsByCount: Array<{ label: string; count: number }>
}

export function projectShopBudgetEnvelopeCodeBrief(
  commerce: CommerceState,
): ShopBudgetEnvelopeCodeBrief {
  let totalEnvelopes = 0
  const budgetCodeMap = new Map<string, number>()
  const labelMap = new Map<string, number>()

  for (const envelope of commerce.purchaseBudgetEnvelopes ?? []) {
    totalEnvelopes++
    budgetCodeMap.set(envelope.budgetCode, (budgetCodeMap.get(envelope.budgetCode) ?? 0) + 1)
    labelMap.set(envelope.label, (labelMap.get(envelope.label) ?? 0) + 1)
  }

  const topBudgetCodesByCount = Array.from(budgetCodeMap.entries())
    .map(([budgetCode, count]) => ({ budgetCode, count }))
    .sort((a, b) => b.count - a.count || a.budgetCode.localeCompare(b.budgetCode))
    .slice(0, 5)

  const topLabelsByCount = Array.from(labelMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)

  return {
    totalEnvelopes,
    uniqueBudgetCodes: budgetCodeMap.size,
    topBudgetCodesByCount,
    uniqueLabels: labelMap.size,
    topLabelsByCount,
  }
}
