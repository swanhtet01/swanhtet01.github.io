import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestFulfilmentLineCountBrief = {
  totalRequests: number
  pickupSingleLineCount: number
  pickupMultiLineCount: number
  deliverySingleLineCount: number
  deliveryMultiLineCount: number
}

export function projectEcommerceRequestFulfilmentLineCountBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestFulfilmentLineCountBrief {
  const total = buying.requests.length
  if (total === 0)
    return { totalRequests: 0, pickupSingleLineCount: 0, pickupMultiLineCount: 0, deliverySingleLineCount: 0, deliveryMultiLineCount: 0 }
  let pickupSingleLineCount = 0; let pickupMultiLineCount = 0
  let deliverySingleLineCount = 0; let deliveryMultiLineCount = 0
  for (const req of buying.requests) {
    const isSingle = req.lines.length === 1
    if (req.fulfilment === 'pickup') {
      if (isSingle) pickupSingleLineCount++
      else pickupMultiLineCount++
    } else {
      if (isSingle) deliverySingleLineCount++
      else deliveryMultiLineCount++
    }
  }
  return { totalRequests: total, pickupSingleLineCount, pickupMultiLineCount, deliverySingleLineCount, deliveryMultiLineCount }
}
