import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceBuyingEventSequenceBrief = {
  totalEvents: number
  firstSequence: number | null
  lastSequence: number | null
  hasGap: boolean
}

export function projectEcommerceBuyingEventSequenceBrief(
  buying: EcommerceBuyingState,
): EcommerceBuyingEventSequenceBrief {
  const total = buying.events.length
  if (total === 0)
    return { totalEvents: 0, firstSequence: null, lastSequence: null, hasGap: false }
  let first = buying.events[0].sequence
  let last = buying.events[0].sequence
  for (const event of buying.events) {
    if (event.sequence < first) first = event.sequence
    if (event.sequence > last) last = event.sequence
  }
  const hasGap = last - first + 1 !== total
  return { totalEvents: total, firstSequence: first, lastSequence: last, hasGap }
}
