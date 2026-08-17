import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceRequestSourceStorefrontRevisionBrief = {
  totalRequests: number; nonNullRevisionCount: number; minSourceStorefrontRevision: number | null; maxSourceStorefrontRevision: number | null
}
export function projectEcommerceRequestSourceStorefrontRevisionBrief(buying: EcommerceBuyingState) {
  const total = buying.requests.length
  if (total === 0) return { totalRequests: 0, nonNullRevisionCount: 0, minSourceStorefrontRevision: null, maxSourceStorefrontRevision: null }
  let min: number | null = null; let max: number | null = null; let nonNullRevisionCount = 0
  for (const request of buying.requests) {
    if (request.sourceStorefrontRevision !== null) {
      nonNullRevisionCount++
      if (min === null || request.sourceStorefrontRevision < min) min = request.sourceStorefrontRevision
      if (max === null || request.sourceStorefrontRevision > max) max = request.sourceStorefrontRevision
    }
  }
  return { totalRequests: total, nonNullRevisionCount, minSourceStorefrontRevision: min, maxSourceStorefrontRevision: max }
}
