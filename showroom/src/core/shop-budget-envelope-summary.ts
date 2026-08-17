import type { CommerceState } from './commerce-workspace.ts'

export type BudgetCodeRecord = {
  budgetCode: string
  envelopeCount: number
  totalCeilingMmk: number
  latestPeriodEnd: string
}

export type ShopBudgetEnvelopeSummary = {
  totalEnvelopes: number
  totalCeilingMmk: number
  averageCeilingMmk: number
  highestCeilingMmk: number
  uniqueBudgetCodes: number
  byBudgetCode: BudgetCodeRecord[]
}

export function projectShopBudgetEnvelopeSummary(commerce: CommerceState): ShopBudgetEnvelopeSummary {
  const envelopes = commerce.purchaseBudgetEnvelopes ?? []
  const codeMap = new Map<string, { envelopeCount: number; totalCeilingMmk: number; latestPeriodEnd: string }>()

  let totalCeilingMmk = 0
  let highestCeilingMmk = 0

  for (const env of envelopes) {
    totalCeilingMmk += env.ceilingMmk
    if (env.ceilingMmk > highestCeilingMmk) highestCeilingMmk = env.ceilingMmk

    const entry = codeMap.get(env.budgetCode) ?? { envelopeCount: 0, totalCeilingMmk: 0, latestPeriodEnd: env.periodEnd }
    entry.envelopeCount++
    entry.totalCeilingMmk += env.ceilingMmk
    if (env.periodEnd > entry.latestPeriodEnd) entry.latestPeriodEnd = env.periodEnd
    codeMap.set(env.budgetCode, entry)
  }

  const byBudgetCode: BudgetCodeRecord[] = Array.from(codeMap.entries())
    .map(([budgetCode, { envelopeCount, totalCeilingMmk: codeCeiling, latestPeriodEnd }]) => ({
      budgetCode,
      envelopeCount,
      totalCeilingMmk: codeCeiling,
      latestPeriodEnd,
    }))
    .sort((a, b) => b.totalCeilingMmk - a.totalCeilingMmk || a.budgetCode.localeCompare(b.budgetCode))

  return {
    totalEnvelopes: envelopes.length,
    totalCeilingMmk,
    averageCeilingMmk: envelopes.length > 0 ? Math.round(totalCeilingMmk / envelopes.length) : 0,
    highestCeilingMmk,
    uniqueBudgetCodes: codeMap.size,
    byBudgetCode,
  }
}
