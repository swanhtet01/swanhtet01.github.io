import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishReadinessSummary = {
  totalEvidence: number
  totalApprovals: number
  localPublishCount: number
  latestPublishAt: string | null
  latestApprovalAt: string | null
  latestPublishHasApproval: boolean
  latestPublishReadyPageCount: number
}

export function projectWebsitePublishReadinessSummary(
  workspace: WebsiteWorkspace,
): WebsitePublishReadinessSummary {
  const latestPublish =
    workspace.localPublishes.length > 0
      ? workspace.localPublishes.reduce((latest, p) => (p.recordedAt > latest.recordedAt ? p : latest))
      : null

  const latestApprovalAt =
    workspace.approvals.length > 0
      ? workspace.approvals.reduce((latest, a) => (a.approvedAt > latest.approvedAt ? a : latest)).approvedAt
      : null

  return {
    totalEvidence: workspace.evidence.length,
    totalApprovals: workspace.approvals.length,
    localPublishCount: workspace.localPublishes.length,
    latestPublishAt: latestPublish?.recordedAt ?? null,
    latestApprovalAt,
    latestPublishHasApproval: latestPublish?.approvalId != null,
    latestPublishReadyPageCount: latestPublish?.readyPageIds.length ?? 0,
  }
}
