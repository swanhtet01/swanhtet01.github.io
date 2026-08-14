import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentComplianceBreakdownBrief = {
  totalIntents: number
  bothCompliantCount: number
  bothCompliantRate: number
  ledgerOnlyCount: number
  ledgerOnlyRate: number
  taxOnlyCount: number
  taxOnlyRate: number
  neitherCompliantCount: number
  neitherCompliantRate: number
}

export function projectEcommerceCorrectionIntentComplianceBreakdownBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentComplianceBreakdownBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      bothCompliantCount: 0,
      bothCompliantRate: 0,
      ledgerOnlyCount: 0,
      ledgerOnlyRate: 0,
      taxOnlyCount: 0,
      taxOnlyRate: 0,
      neitherCompliantCount: 0,
      neitherCompliantRate: 0,
    }
  }

  let bothCompliantCount = 0
  let ledgerOnlyCount = 0
  let taxOnlyCount = 0
  let neitherCompliantCount = 0

  for (const intent of buying.correctionIntents) {
    const l = intent.ledgerPosted
    const t = intent.taxFiled
    if (l && t) bothCompliantCount++
    else if (l && !t) ledgerOnlyCount++
    else if (!l && t) taxOnlyCount++
    else neitherCompliantCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    bothCompliantCount,
    bothCompliantRate: rate(bothCompliantCount),
    ledgerOnlyCount,
    ledgerOnlyRate: rate(ledgerOnlyCount),
    taxOnlyCount,
    taxOnlyRate: rate(taxOnlyCount),
    neitherCompliantCount,
    neitherCompliantRate: rate(neitherCompliantCount),
  }
}
