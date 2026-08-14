import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentReasonOrderStatusBrief = {
  totalIntents: number
  changedMindCount: number
  duplicateOrderCount: number
  orderErrorCount: number
  deliveryTooSlowCount: number
  otherReasonCount: number
  changedMindRate: number
  duplicateOrderRate: number
  orderErrorRate: number
  deliveryTooSlowRate: number
  otherReasonRate: number
  confirmedOrderStatusCount: number
  preparingOrderStatusCount: number
  readyOrderStatusCount: number
  confirmedOrderStatusRate: number
  preparingOrderStatusRate: number
  readyOrderStatusRate: number
}

export function projectEcommerceCancellationIntentReasonOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentReasonOrderStatusBrief {
  let changedMindCount = 0
  let duplicateOrderCount = 0
  let orderErrorCount = 0
  let deliveryTooSlowCount = 0
  let otherReasonCount = 0
  let confirmedOrderStatusCount = 0
  let preparingOrderStatusCount = 0
  let readyOrderStatusCount = 0

  for (const intent of buying.cancellationIntents) {
    switch (intent.reasonCode) {
      case 'changed_mind': changedMindCount++; break
      case 'duplicate_order': duplicateOrderCount++; break
      case 'order_error': orderErrorCount++; break
      case 'delivery_too_slow': deliveryTooSlowCount++; break
      default: otherReasonCount++; break
    }
    switch (intent.orderStatus) {
      case 'confirmed': confirmedOrderStatusCount++; break
      case 'preparing': preparingOrderStatusCount++; break
      default: readyOrderStatusCount++; break
    }
  }

  const totalIntents = buying.cancellationIntents.length

  return {
    totalIntents,
    changedMindCount,
    duplicateOrderCount,
    orderErrorCount,
    deliveryTooSlowCount,
    otherReasonCount,
    changedMindRate: totalIntents > 0 ? Math.round((changedMindCount / totalIntents) * 100) : 0,
    duplicateOrderRate: totalIntents > 0 ? Math.round((duplicateOrderCount / totalIntents) * 100) : 0,
    orderErrorRate: totalIntents > 0 ? Math.round((orderErrorCount / totalIntents) * 100) : 0,
    deliveryTooSlowRate: totalIntents > 0 ? Math.round((deliveryTooSlowCount / totalIntents) * 100) : 0,
    otherReasonRate: totalIntents > 0 ? Math.round((otherReasonCount / totalIntents) * 100) : 0,
    confirmedOrderStatusCount,
    preparingOrderStatusCount,
    readyOrderStatusCount,
    confirmedOrderStatusRate: totalIntents > 0 ? Math.round((confirmedOrderStatusCount / totalIntents) * 100) : 0,
    preparingOrderStatusRate: totalIntents > 0 ? Math.round((preparingOrderStatusCount / totalIntents) * 100) : 0,
    readyOrderStatusRate: totalIntents > 0 ? Math.round((readyOrderStatusCount / totalIntents) * 100) : 0,
  }
}
