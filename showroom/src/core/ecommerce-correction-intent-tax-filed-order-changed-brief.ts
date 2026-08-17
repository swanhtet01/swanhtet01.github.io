import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledOrderChangedBrief = {
  totalIntents: number
  taxFiledOrderChangedCount: number
  taxFiledNoOrderChangeCount: number
  noTaxFiledOrderChangedCount: number
  noTaxFiledNoOrderChangeCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledOrderChangedCount: 0,
      taxFiledNoOrderChangeCount: 0,
      noTaxFiledOrderChangedCount: 0,
      noTaxFiledNoOrderChangeCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledOrderChangedCount = 0
  let taxFiledNoOrderChangeCount = 0
  let noTaxFiledOrderChangedCount = 0
  let noTaxFiledNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.orderChanged) taxFiledOrderChangedCount++
      else taxFiledNoOrderChangeCount++
    } else {
      if (intent.orderChanged) noTaxFiledOrderChangedCount++
      else noTaxFiledNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledOrderChangedCount,
    taxFiledNoOrderChangeCount,
    noTaxFiledOrderChangedCount,
    noTaxFiledNoOrderChangeCount,
    taxFiledCount: taxFiledOrderChangedCount + taxFiledNoOrderChangeCount,
    noTaxFiledCount: noTaxFiledOrderChangedCount + noTaxFiledNoOrderChangeCount,
  }
}
