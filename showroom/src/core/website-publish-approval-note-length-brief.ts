import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishApprovalNoteLengthBrief = {
  totalApprovals: number
  withNoteCount: number
  withNoteRate: number
  shortCount: number
  mediumCount: number
  longCount: number
  averageNoteLength: number
  minNoteLength: number | null
  maxNoteLength: number | null
}

export function projectWebsitePublishApprovalNoteLengthBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishApprovalNoteLengthBrief {
  let withNoteCount = 0
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let minNoteLength: number | null = null
  let maxNoteLength: number | null = null

  for (const approval of workspace.approvals) {
    const len = approval.note.length
    if (len > 0) {
      withNoteCount++
      totalLength += len
      if (minNoteLength === null || len < minNoteLength) minNoteLength = len
      if (maxNoteLength === null || len > maxNoteLength) maxNoteLength = len
      if (len <= 40) shortCount++
      else if (len <= 120) mediumCount++
      else longCount++
    }
  }

  const totalApprovals = workspace.approvals.length

  return {
    totalApprovals,
    withNoteCount,
    withNoteRate: totalApprovals > 0 ? Math.round((withNoteCount / totalApprovals) * 100) : 0,
    shortCount,
    mediumCount,
    longCount,
    averageNoteLength: withNoteCount > 0 ? Math.round(totalLength / withNoteCount) : 0,
    minNoteLength,
    maxNoteLength,
  }
}
