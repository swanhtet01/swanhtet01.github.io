import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceBuyingEventActionBrief = {
  totalEvents: number
  requestRecordedCount: number
  returnIntentRecordedCount: number
  supportIntentRecordedCount: number
  correctionIntentRecordedCount: number
  cancellationIntentRecordedCount: number
  cancellationDecisionRecordedCount: number
  orderAmendmentIntentRecordedCount: number
  orderRescheduleIntentRecordedCount: number
  requestRecordedRate: number
  exceptionEventRate: number
}

export function projectEcommerceBuyingEventActionBrief(
  buying: EcommerceBuyingState,
): EcommerceBuyingEventActionBrief {
  let requestRecordedCount = 0
  let returnIntentRecordedCount = 0
  let supportIntentRecordedCount = 0
  let correctionIntentRecordedCount = 0
  let cancellationIntentRecordedCount = 0
  let cancellationDecisionRecordedCount = 0
  let orderAmendmentIntentRecordedCount = 0
  let orderRescheduleIntentRecordedCount = 0

  for (const event of buying.events) {
    switch (event.action) {
      case 'request_recorded': requestRecordedCount++; break
      case 'return_intent_recorded': returnIntentRecordedCount++; break
      case 'support_intent_recorded': supportIntentRecordedCount++; break
      case 'correction_intent_recorded': correctionIntentRecordedCount++; break
      case 'cancellation_intent_recorded': cancellationIntentRecordedCount++; break
      case 'cancellation_decision_recorded': cancellationDecisionRecordedCount++; break
      case 'order_amendment_intent_recorded': orderAmendmentIntentRecordedCount++; break
      case 'order_reschedule_intent_recorded': orderRescheduleIntentRecordedCount++; break
    }
  }

  const totalEvents = buying.events.length
  const exceptionEventCount =
    returnIntentRecordedCount +
    supportIntentRecordedCount +
    correctionIntentRecordedCount +
    cancellationIntentRecordedCount +
    cancellationDecisionRecordedCount +
    orderAmendmentIntentRecordedCount +
    orderRescheduleIntentRecordedCount

  return {
    totalEvents,
    requestRecordedCount,
    returnIntentRecordedCount,
    supportIntentRecordedCount,
    correctionIntentRecordedCount,
    cancellationIntentRecordedCount,
    cancellationDecisionRecordedCount,
    orderAmendmentIntentRecordedCount,
    orderRescheduleIntentRecordedCount,
    requestRecordedRate: totalEvents > 0 ? Math.round((requestRecordedCount / totalEvents) * 100) : 0,
    exceptionEventRate: totalEvents > 0 ? Math.round((exceptionEventCount / totalEvents) * 100) : 0,
  }
}
