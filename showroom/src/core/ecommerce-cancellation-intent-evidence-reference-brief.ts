import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentEvidenceReferenceBrief = {
  totalIntents: number
  uniqueReferences: number
  topReference: string | null
  topReferenceCount: number
}

export function projectEcommerceCancellationIntentEvidenceReferenceBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentEvidenceReferenceBrief {
  const total = buying.cancellationIntents.length
  if (total === 0)
    return { totalIntents: 0, uniqueReferences: 0, topReference: null, topReferenceCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.cancellationIntents) {
    counts.set(intent.evidenceReference, (counts.get(intent.evidenceReference) ?? 0) + 1)
  }
  let topReference: string | null = null
  let topReferenceCount = 0
  for (const [key, count] of counts) {
    if (count > topReferenceCount) {
      topReferenceCount = count
      topReference = key
    }
  }
  return { totalIntents: total, uniqueReferences: counts.size, topReference, topReferenceCount }
}
