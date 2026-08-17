import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishEvidenceKindBrief = {
  totalEvidence: number
  contentCount: number
  responsiveCount: number
  linksCount: number
  contentRate: number
  responsiveRate: number
  linksRate: number
  allKindsPresent: boolean
}

export function projectWebsitePublishEvidenceKindBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishEvidenceKindBrief {
  let contentCount = 0
  let responsiveCount = 0
  let linksCount = 0

  for (const ev of workspace.evidence) {
    switch (ev.kind) {
      case 'content': contentCount++; break
      case 'responsive': responsiveCount++; break
      default: linksCount++; break
    }
  }

  const totalEvidence = workspace.evidence.length

  return {
    totalEvidence,
    contentCount,
    responsiveCount,
    linksCount,
    contentRate: totalEvidence > 0 ? Math.round((contentCount / totalEvidence) * 100) : 0,
    responsiveRate: totalEvidence > 0 ? Math.round((responsiveCount / totalEvidence) * 100) : 0,
    linksRate: totalEvidence > 0 ? Math.round((linksCount / totalEvidence) * 100) : 0,
    allKindsPresent: contentCount > 0 && responsiveCount > 0 && linksCount > 0,
  }
}
