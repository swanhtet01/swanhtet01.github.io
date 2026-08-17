import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportNoteBrief = {
  totalSupportCases: number
  casesWithResolutionNote: number
  resolutionNoteRate: number
  averageResolutionNoteLength: number
  casesWithReopenNote: number
  reopenNoteRate: number
  averageReopenNoteLength: number
  casesWithFollowUpResolutionNote: number
  followUpResolutionNoteRate: number
}

export function projectShopOrderSupportNoteBrief(
  commerce: CommerceState,
): ShopOrderSupportNoteBrief {
  let totalSupportCases = 0
  let casesWithResolutionNote = 0
  let totalResolutionNoteLength = 0
  let casesWithReopenNote = 0
  let totalReopenNoteLength = 0
  let casesWithFollowUpResolutionNote = 0

  for (const order of commerce.orders) {
    for (const supportCase of order.supportCases ?? []) {
      totalSupportCases++
      if (supportCase.resolution?.note !== undefined) {
        casesWithResolutionNote++
        totalResolutionNoteLength += supportCase.resolution.note.length
      }
      if (supportCase.reopen?.note !== undefined) {
        casesWithReopenNote++
        totalReopenNoteLength += supportCase.reopen.note.length
      }
      if (supportCase.followUpResolution?.note !== undefined) {
        casesWithFollowUpResolutionNote++
      }
    }
  }

  return {
    totalSupportCases,
    casesWithResolutionNote,
    resolutionNoteRate:
      totalSupportCases > 0 ? Math.round((casesWithResolutionNote / totalSupportCases) * 100) : 0,
    averageResolutionNoteLength:
      casesWithResolutionNote > 0 ? Math.round(totalResolutionNoteLength / casesWithResolutionNote) : 0,
    casesWithReopenNote,
    reopenNoteRate:
      totalSupportCases > 0 ? Math.round((casesWithReopenNote / totalSupportCases) * 100) : 0,
    averageReopenNoteLength:
      casesWithReopenNote > 0 ? Math.round(totalReopenNoteLength / casesWithReopenNote) : 0,
    casesWithFollowUpResolutionNote,
    followUpResolutionNoteRate:
      totalSupportCases > 0
        ? Math.round((casesWithFollowUpResolutionNote / totalSupportCases) * 100)
        : 0,
  }
}
