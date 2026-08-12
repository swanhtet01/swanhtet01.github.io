import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentReasonValueBrief = {
  totalIntents: number
  changedMindCount: number
  deliveryTooSlowCount: number
  duplicateOrderCount: number
  orderErrorCount: number
  otherCount: number
  totalMmk: number
  averageMmk: number
}

export function projectEcommerceCancellationIntentReasonValueBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentReasonValueBrief {
  const total = buying.cancellationIntents.length
  if (total === 0)
    return { totalIntents: 0, changedMindCount: 0, deliveryTooSlowCount: 0, duplicateOrderCount: 0, orderErrorCount: 0, otherCount: 0, totalMmk: 0, averageMmk: 0 }
  let changedMindCount = 0; let deliveryTooSlowCount = 0; let duplicateOrderCount = 0
  let orderErrorCount = 0; let otherCount = 0; let totalMmk = 0
  for (const intent of buying.cancellationIntents) {
    totalMmk += intent.totalMmk
    if (intent.reasonCode === 'changed_mind') changedMindCount++
    else if (intent.reasonCode === 'delivery_too_slow') deliveryTooSlowCount++
    else if (intent.reasonCode === 'duplicate_order') duplicateOrderCount++
    else if (intent.reasonCode === 'order_error') orderErrorCount++
    else otherCount++
  }
  return {
    totalIntents: total,
    changedMindCount,
    deliveryTooSlowCount,
    duplicateOrderCount,
    orderErrorCount,
    otherCount,
    totalMmk,
    averageMmk: Math.round(totalMmk / total),
  }
}
