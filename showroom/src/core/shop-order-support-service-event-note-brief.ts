import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportServiceEventNoteBrief = {
  totalServiceEvents: number
  totalNoteLength: number
  averageNoteLength: number
  minNoteLength: number | null
  maxNoteLength: number | null
}

export function projectShopOrderSupportServiceEventNoteBrief(
  commerce: CommerceState,
): ShopOrderSupportServiceEventNoteBrief {
  let totalServiceEvents = 0
  let totalNoteLength = 0
  let minNoteLength: number | null = null
  let maxNoteLength: number | null = null

  for (const order of commerce.orders) {
    for (const supportCase of order.supportCases ?? []) {
      for (const event of [
        ...(supportCase.serviceEvents ?? []),
        ...(supportCase.followUpServiceEvents ?? []),
      ]) {
        totalServiceEvents++
        const len = event.note.length
        totalNoteLength += len
        if (minNoteLength === null || len < minNoteLength) minNoteLength = len
        if (maxNoteLength === null || len > maxNoteLength) maxNoteLength = len
      }
    }
  }

  return {
    totalServiceEvents,
    totalNoteLength,
    averageNoteLength: totalServiceEvents > 0 ? Math.round(totalNoteLength / totalServiceEvents) : 0,
    minNoteLength,
    maxNoteLength,
  }
}
