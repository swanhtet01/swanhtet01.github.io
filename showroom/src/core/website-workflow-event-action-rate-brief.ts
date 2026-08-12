import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventActionRateBrief = {
  totalEvents: number
  publishEvidenceRecorded: number
  websiteRevisionApproved: number
  localSnapshotRecorded: number
  publishEvidenceRate: number
  websiteRevisionApprovedRate: number
  localSnapshotRate: number
}

export function projectWebsiteWorkflowEventActionRateBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventActionRateBrief {
  const total = workspace.events.length
  if (total === 0)
    return {
      totalEvents: 0,
      publishEvidenceRecorded: 0,
      websiteRevisionApproved: 0,
      localSnapshotRecorded: 0,
      publishEvidenceRate: 0,
      websiteRevisionApprovedRate: 0,
      localSnapshotRate: 0,
    }
  let publishEvidenceRecorded = 0
  let websiteRevisionApproved = 0
  let localSnapshotRecorded = 0
  for (const event of workspace.events) {
    if (event.action === 'publish_evidence_recorded') publishEvidenceRecorded++
    else if (event.action === 'website_revision_approved') websiteRevisionApproved++
    else if (event.action === 'local_snapshot_recorded') localSnapshotRecorded++
  }
  return {
    totalEvents: total,
    publishEvidenceRecorded,
    websiteRevisionApproved,
    localSnapshotRecorded,
    publishEvidenceRate: Math.round((publishEvidenceRecorded / total) * 100),
    websiteRevisionApprovedRate: Math.round((websiteRevisionApproved / total) * 100),
    localSnapshotRate: Math.round((localSnapshotRecorded / total) * 100),
  }
}
