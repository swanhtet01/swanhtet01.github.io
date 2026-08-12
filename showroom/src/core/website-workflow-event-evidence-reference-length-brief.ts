import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventEvidenceReferenceLengthBrief = {
  totalEvents: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRate: number
  mediumRate: number
  longRate: number
  minLength: number | null
  maxLength: number | null
  averageLength: number
}

export function projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventEvidenceReferenceLengthBrief {
  const total = workspace.events.length
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let min: number | null = null
  let max: number | null = null

  for (const e of workspace.events) {
    const len = e.evidenceReference.length
    totalLength += len
    if (min === null || len < min) min = len
    if (max === null || len > max) max = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  return {
    totalEvents: total,
    shortCount,
    mediumCount,
    longCount,
    shortRate: total > 0 ? Math.round((shortCount / total) * 100) : 0,
    mediumRate: total > 0 ? Math.round((mediumCount / total) * 100) : 0,
    longRate: total > 0 ? Math.round((longCount / total) * 100) : 0,
    minLength: min,
    maxLength: max,
    averageLength: total > 0 ? Math.round(totalLength / total) : 0,
  }
}
