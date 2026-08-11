import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceDeliveryAddressLine1Brief = {
  totalDeliveryRequests: number
  blankLine1Count: number
  blankLine1Rate: number
  populatedLine1Count: number
  averageLine1Length: number
  minLine1Length: number | null
  maxLine1Length: number | null
}

export function projectEcommerceDeliveryAddressLine1Brief(
  buying: EcommerceBuyingState,
): EcommerceDeliveryAddressLine1Brief {
  let totalDeliveryRequests = 0
  let blankLine1Count = 0
  let totalLength = 0
  let minLine1Length: number | null = null
  let maxLine1Length: number | null = null

  for (const req of buying.requests) {
    if (req.deliveryAddress == null) continue
    totalDeliveryRequests++
    const len = req.deliveryAddress.line1.length
    totalLength += len
    if (minLine1Length === null || len < minLine1Length) minLine1Length = len
    if (maxLine1Length === null || len > maxLine1Length) maxLine1Length = len
    if (len === 0) blankLine1Count++
  }

  return {
    totalDeliveryRequests,
    blankLine1Count,
    blankLine1Rate: totalDeliveryRequests > 0 ? Math.round((blankLine1Count / totalDeliveryRequests) * 100) : 0,
    populatedLine1Count: totalDeliveryRequests - blankLine1Count,
    averageLine1Length: totalDeliveryRequests > 0 ? Math.round(totalLength / totalDeliveryRequests) : 0,
    minLine1Length,
    maxLine1Length,
  }
}
