import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportServiceEventBrief = {
  totalCases: number
  casesWithServiceEvents: number
  totalServiceEvents: number
  byKind: {
    reassigned: number
    escalated: number
    acknowledged: number
    firstResponseReady: number
  }
  escalatedCases: number
  followUpServiceEventCases: number
}

export function projectShopOrderSupportServiceEventBrief(commerce: CommerceState): ShopOrderSupportServiceEventBrief {
  let totalCases = 0
  let casesWithServiceEvents = 0
  let totalServiceEvents = 0
  let escalatedCases = 0
  let followUpServiceEventCases = 0
  const byKind = { reassigned: 0, escalated: 0, acknowledged: 0, firstResponseReady: 0 }

  for (const order of commerce.orders) {
    for (const sc of order.supportCases ?? []) {
      totalCases++
      const events = sc.serviceEvents ?? []
      if (events.length > 0) casesWithServiceEvents++
      let hasEscalation = false
      for (const ev of events) {
        totalServiceEvents++
        if (ev.kind === 'reassigned') byKind.reassigned++
        else if (ev.kind === 'escalated') { byKind.escalated++; hasEscalation = true }
        else if (ev.kind === 'acknowledged') byKind.acknowledged++
        else if (ev.kind === 'first_response_ready') byKind.firstResponseReady++
      }
      const followUpEvents = sc.followUpServiceEvents ?? []
      if (followUpEvents.length > 0) followUpServiceEventCases++
      for (const ev of followUpEvents) {
        totalServiceEvents++
        if (ev.kind === 'reassigned') byKind.reassigned++
        else if (ev.kind === 'escalated') { byKind.escalated++; hasEscalation = true }
        else if (ev.kind === 'acknowledged') byKind.acknowledged++
        else if (ev.kind === 'first_response_ready') byKind.firstResponseReady++
      }
      if (hasEscalation) escalatedCases++
    }
  }

  return {
    totalCases,
    casesWithServiceEvents,
    totalServiceEvents,
    byKind,
    escalatedCases,
    followUpServiceEventCases,
  }
}
