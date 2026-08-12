import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentReasonCodeRatesBrief = {
  totalIntents: number
  changedMindCount: number
  changedMindRate: number
  duplicateOrderCount: number
  duplicateOrderRate: number
  orderErrorCount: number
  orderErrorRate: number
  deliveryTooSlowCount: number
  deliveryTooSlowRate: number
  otherReasonCount: number
  otherReasonRate: number
}

export function projectEcommerceCancellationIntentReasonCodeRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentReasonCodeRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      changedMindCount: 0,
      changedMindRate: 0,
      duplicateOrderCount: 0,
      duplicateOrderRate: 0,
      orderErrorCount: 0,
      orderErrorRate: 0,
      deliveryTooSlowCount: 0,
      deliveryTooSlowRate: 0,
      otherReasonCount: 0,
      otherReasonRate: 0,
    }
  }

  let changedMindCount = 0
  let duplicateOrderCount = 0
  let orderErrorCount = 0
  let deliveryTooSlowCount = 0
  let otherReasonCount = 0

  for (const intent of buying.cancellationIntents) {
    switch (intent.reasonCode) {
      case 'changed_mind':
        changedMindCount++
        break
      case 'duplicate_order':
        duplicateOrderCount++
        break
      case 'order_error':
        orderErrorCount++
        break
      case 'delivery_too_slow':
        deliveryTooSlowCount++
        break
      default:
        otherReasonCount++
    }
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    changedMindCount,
    changedMindRate: rate(changedMindCount),
    duplicateOrderCount,
    duplicateOrderRate: rate(duplicateOrderCount),
    orderErrorCount,
    orderErrorRate: rate(orderErrorCount),
    deliveryTooSlowCount,
    deliveryTooSlowRate: rate(deliveryTooSlowCount),
    otherReasonCount,
    otherReasonRate: rate(otherReasonCount),
  }
}
