import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceDeliveryAddressRevisionBrief = {
  totalDeliveryRequests: number
  averageRevision: number
  minRevision: number | null
  maxRevision: number | null
  revision1Count: number
  revision2PlusCount: number
}

export function projectEcommerceDeliveryAddressRevisionBrief(
  buying: EcommerceBuyingState,
): EcommerceDeliveryAddressRevisionBrief {
  let total = 0
  let totalRevision = 0
  let min: number | null = null
  let max: number | null = null
  let revision1Count = 0
  let revision2PlusCount = 0

  for (const req of buying.requests) {
    if (req.deliveryAddress == null) continue
    total++
    const rev = req.deliveryAddress.revision
    totalRevision += rev
    if (min === null || rev < min) min = rev
    if (max === null || rev > max) max = rev
    if (rev === 1) revision1Count++
    else revision2PlusCount++
  }

  return {
    totalDeliveryRequests: total,
    averageRevision: total > 0 ? Math.round(totalRevision / total) : 0,
    minRevision: min,
    maxRevision: max,
    revision1Count,
    revision2PlusCount,
  }
}
