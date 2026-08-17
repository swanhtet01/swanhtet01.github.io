import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventReasonLengthBrief = {
  totalEvents: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRate: number
  mediumRate: number
  longRate: number
  minReasonLength: number | null
  maxReasonLength: number | null
  averageReasonLength: number
}

export function projectWebsiteWorkflowEventReasonLengthBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventReasonLengthBrief {
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let minReasonLength: number | null = null
  let maxReasonLength: number | null = null

  for (const event of workspace.events) {
    const len = event.reason.length
    totalLength += len
    if (minReasonLength === null || len < minReasonLength) minReasonLength = len
    if (maxReasonLength === null || len > maxReasonLength) maxReasonLength = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  const totalEvents = workspace.events.length

  return {
    totalEvents,
    shortCount,
    mediumCount,
    longCount,
    shortRate: totalEvents > 0 ? Math.round((shortCount / totalEvents) * 100) : 0,
    mediumRate: totalEvents > 0 ? Math.round((mediumCount / totalEvents) * 100) : 0,
    longRate: totalEvents > 0 ? Math.round((longCount / totalEvents) * 100) : 0,
    minReasonLength,
    maxReasonLength,
    averageReasonLength: totalEvents > 0 ? Math.round(totalLength / totalEvents) : 0,
  }
}
