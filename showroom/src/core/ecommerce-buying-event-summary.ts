import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceBuyingEventSummary = {
  totalEvents: number
  byAction: {
    request_recorded: number
    return_intent_recorded: number
    support_intent_recorded: number
    correction_intent_recorded: number
    cancellation_intent_recorded: number
    cancellation_decision_recorded: number
    order_amendment_intent_recorded: number
    order_reschedule_intent_recorded: number
  }
  uniqueSubjects: number
  latestSequence: number | null
}

export function projectEcommerceBuyingEventSummary(buying: EcommerceBuyingState): EcommerceBuyingEventSummary {
  const subjectSet = new Set<string>()
  const byAction = {
    request_recorded: 0,
    return_intent_recorded: 0,
    support_intent_recorded: 0,
    correction_intent_recorded: 0,
    cancellation_intent_recorded: 0,
    cancellation_decision_recorded: 0,
    order_amendment_intent_recorded: 0,
    order_reschedule_intent_recorded: 0,
  }
  let latestSequence: number | null = null

  for (const event of buying.events) {
    byAction[event.action]++
    subjectSet.add(event.subjectId)
    if (latestSequence === null || event.sequence > latestSequence) latestSequence = event.sequence
  }

  return {
    totalEvents: buying.events.length,
    byAction,
    uniqueSubjects: subjectSet.size,
    latestSequence,
  }
}
