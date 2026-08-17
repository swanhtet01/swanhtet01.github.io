import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishApprovalEvidenceBrief = {
  totalApprovals: number
  totalEvidenceIds: number
  averageEvidenceIdsPerApproval: number
  minEvidenceIds: number | null
  maxEvidenceIds: number | null
  uniqueReviewers: number
  migratedCount: number
  migratedRate: number
}

export function projectWebsitePublishApprovalEvidenceBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishApprovalEvidenceBrief {
  const approvals = workspace.approvals
  const totalApprovals = approvals.length

  let totalEvidenceIds = 0
  let minEvidenceIds: number | null = null
  let maxEvidenceIds: number | null = null
  let migratedCount = 0
  const reviewers = new Set<string>()

  for (const approval of approvals) {
    const count = approval.evidenceIds.length
    totalEvidenceIds += count
    if (minEvidenceIds === null || count < minEvidenceIds) minEvidenceIds = count
    if (maxEvidenceIds === null || count > maxEvidenceIds) maxEvidenceIds = count
    if (approval.migratedFromV1) migratedCount++
    reviewers.add(approval.reviewer)
  }

  return {
    totalApprovals,
    totalEvidenceIds,
    averageEvidenceIdsPerApproval: totalApprovals > 0 ? Math.round(totalEvidenceIds / totalApprovals) : 0,
    minEvidenceIds,
    maxEvidenceIds,
    uniqueReviewers: reviewers.size,
    migratedCount,
    migratedRate: totalApprovals > 0 ? Math.round((migratedCount / totalApprovals) * 100) : 0,
  }
}
