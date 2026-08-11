import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteEvidenceSummary = {
  totalEvidence: number
  byKind: {
    content: number
    responsive: number
    links: number
  }
  uniqueReviewers: number
  latestVerifiedAt: string | null
}

export function projectWebsiteEvidenceSummary(workspace: WebsiteWorkspace): WebsiteEvidenceSummary {
  const byKind = { content: 0, responsive: 0, links: 0 }
  const reviewerSet = new Set<string>()
  let latestVerifiedAt: string | null = null

  for (const ev of workspace.evidence) {
    byKind[ev.kind as keyof typeof byKind] += 1
    reviewerSet.add(ev.verifiedBy)
    if (latestVerifiedAt === null || ev.verifiedAt > latestVerifiedAt) {
      latestVerifiedAt = ev.verifiedAt
    }
  }

  return {
    totalEvidence: workspace.evidence.length,
    byKind,
    uniqueReviewers: reviewerSet.size,
    latestVerifiedAt,
  }
}
