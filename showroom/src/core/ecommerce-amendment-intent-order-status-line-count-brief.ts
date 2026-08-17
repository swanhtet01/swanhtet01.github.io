import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentOrderStatusLineCountBrief = {
  totalIntents: number
  confirmedSingleCount: number
  confirmedMultiCount: number
  preparingSingleCount: number
  preparingMultiCount: number
  readySingleCount: number
  readyMultiCount: number
}

export function projectEcommerceAmendmentIntentOrderStatusLineCountBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentOrderStatusLineCountBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      confirmedSingleCount: 0,
      confirmedMultiCount: 0,
      preparingSingleCount: 0,
      preparingMultiCount: 0,
      readySingleCount: 0,
      readyMultiCount: 0,
    }
  }

  let confirmedSingleCount = 0
  let confirmedMultiCount = 0
  let preparingSingleCount = 0
  let preparingMultiCount = 0
  let readySingleCount = 0
  let readyMultiCount = 0

  for (const intent of buying.amendmentIntents) {
    const isSingle = intent.lineChanges.length === 1
    if (intent.orderStatus === 'confirmed') {
      if (isSingle) confirmedSingleCount++
      else confirmedMultiCount++
    } else if (intent.orderStatus === 'preparing') {
      if (isSingle) preparingSingleCount++
      else preparingMultiCount++
    } else {
      if (isSingle) readySingleCount++
      else readyMultiCount++
    }
  }

  return {
    totalIntents: total,
    confirmedSingleCount,
    confirmedMultiCount,
    preparingSingleCount,
    preparingMultiCount,
    readySingleCount,
    readyMultiCount,
  }
}
