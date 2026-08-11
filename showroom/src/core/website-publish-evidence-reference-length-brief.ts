import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishEvidenceReferenceLengthBrief = {
  totalEvidence: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRate: number
  mediumRate: number
  longRate: number
  minReferenceLength: number | null
  maxReferenceLength: number | null
  averageReferenceLength: number
}

export function projectWebsitePublishEvidenceReferenceLengthBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishEvidenceReferenceLengthBrief {
  const total = workspace.evidence.length
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let min: number | null = null
  let max: number | null = null

  for (const e of workspace.evidence) {
    const len = e.reference.length
    totalLength += len
    if (min === null || len < min) min = len
    if (max === null || len > max) max = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  return {
    totalEvidence: total,
    shortCount,
    mediumCount,
    longCount,
    shortRate: total > 0 ? Math.round((shortCount / total) * 100) : 0,
    mediumRate: total > 0 ? Math.round((mediumCount / total) * 100) : 0,
    longRate: total > 0 ? Math.round((longCount / total) * 100) : 0,
    minReferenceLength: min,
    maxReferenceLength: max,
    averageReferenceLength: total > 0 ? Math.round(totalLength / total) : 0,
  }
}
