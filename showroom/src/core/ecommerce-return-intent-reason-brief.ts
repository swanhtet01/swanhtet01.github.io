import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentReasonBrief = {
  totalReturnIntents: number
  uniqueReasons: number
  topReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectEcommerceReturnIntentReasonBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentReasonBrief {
  const reasonMap = new Map<string, number>()

  for (const intent of buying.returnIntents) {
    const r = intent.reason
    reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1)
  }

  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalReturnIntents: buying.returnIntents.length,
    uniqueReasons: reasonMap.size,
    topReasonsByCount,
  }
}
