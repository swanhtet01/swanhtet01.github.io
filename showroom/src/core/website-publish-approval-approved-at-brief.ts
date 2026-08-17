import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePublishApprovalApprovedAtBrief = {
  totalApprovals: number
  earliestApprovedAt: string | null
  latestApprovedAt: string | null
  spannedDays: number
}

export function projectWebsitePublishApprovalApprovedAtBrief(
  workspace: WebsiteWorkspace,
): WebsitePublishApprovalApprovedAtBrief {
  const total = workspace.approvals.length
  if (total === 0) {
    return { totalApprovals: 0, earliestApprovedAt: null, latestApprovedAt: null, spannedDays: 0 }
  }

  let earliest = workspace.approvals[0].approvedAt
  let latest = workspace.approvals[0].approvedAt

  for (const a of workspace.approvals) {
    if (a.approvedAt < earliest) earliest = a.approvedAt
    if (a.approvedAt > latest) latest = a.approvedAt
  }

  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0

  return { totalApprovals: total, earliestApprovedAt: earliest, latestApprovedAt: latest, spannedDays }
}
