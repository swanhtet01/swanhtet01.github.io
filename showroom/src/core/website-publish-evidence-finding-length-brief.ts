import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishEvidenceFindingLengthBrief = {
  totalEvidence: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRate: number
  mediumRate: number
  longRate: number
  minFindingLength: number | null
  maxFindingLength: number | null
  averageFindingLength: number
}

export function projectWebsitePublishEvidenceFindingLengthBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishEvidenceFindingLengthBrief {
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let minFindingLength: number | null = null
  let maxFindingLength: number | null = null

  for (const item of workspace.evidence) {
    const len = item.finding.length
    totalLength += len
    if (minFindingLength === null || len < minFindingLength) minFindingLength = len
    if (maxFindingLength === null || len > maxFindingLength) maxFindingLength = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  const totalEvidence = workspace.evidence.length

  return {
    totalEvidence,
    shortCount,
    mediumCount,
    longCount,
    shortRate: totalEvidence > 0 ? Math.round((shortCount / totalEvidence) * 100) : 0,
    mediumRate: totalEvidence > 0 ? Math.round((mediumCount / totalEvidence) * 100) : 0,
    longRate: totalEvidence > 0 ? Math.round((longCount / totalEvidence) * 100) : 0,
    minFindingLength,
    maxFindingLength,
    averageFindingLength: totalEvidence > 0 ? Math.round(totalLength / totalEvidence) : 0,
  }
}
