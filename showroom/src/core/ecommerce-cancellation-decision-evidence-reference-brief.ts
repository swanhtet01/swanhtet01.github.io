import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionEvidenceReferenceBrief = {
  totalDecisions: number
  uniqueReferences: number
  topReference: string | null
  topReferenceCount: number
}

export function projectEcommerceCancellationDecisionEvidenceReferenceBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionEvidenceReferenceBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return {
      totalDecisions: 0,
      uniqueReferences: 0,
      topReference: null,
      topReferenceCount: 0,
    }
  const counts = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    counts.set(decision.evidenceReference, (counts.get(decision.evidenceReference) ?? 0) + 1)
  }
  let topReference: string | null = null
  let topReferenceCount = 0
  for (const [key, count] of counts) {
    if (count > topReferenceCount) {
      topReferenceCount = count
      topReference = key
    }
  }
  return {
    totalDecisions: total,
    uniqueReferences: counts.size,
    topReference,
    topReferenceCount,
  }
}
