import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentQuantityReasonLengthBrief = {
  totalIntents: number
  singleShortCount: number
  singleDetailedCount: number
  multiShortCount: number
  multiDetailedCount: number
  singleCount: number
  multiCount: number
}

export function projectEcommerceReturnIntentQuantityReasonLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentQuantityReasonLengthBrief {
  const total = buying.returnIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      singleShortCount: 0,
      singleDetailedCount: 0,
      multiShortCount: 0,
      multiDetailedCount: 0,
      singleCount: 0,
      multiCount: 0,
    }
  }

  let singleShortCount = 0
  let singleDetailedCount = 0
  let multiShortCount = 0
  let multiDetailedCount = 0

  for (const intent of buying.returnIntents) {
    const isSingle = intent.quantity === 1
    const isShort = intent.reason.length <= 40
    if (isSingle) {
      if (isShort) singleShortCount++
      else singleDetailedCount++
    } else {
      if (isShort) multiShortCount++
      else multiDetailedCount++
    }
  }

  return {
    totalIntents: total,
    singleShortCount,
    singleDetailedCount,
    multiShortCount,
    multiDetailedCount,
    singleCount: singleShortCount + singleDetailedCount,
    multiCount: multiShortCount + multiDetailedCount,
  }
}
