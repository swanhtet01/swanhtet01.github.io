import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteLocalPublishReadyPagesBrief = {
  totalPublishes: number
  totalReadyPages: number
  averageReadyPagesPerPublish: number
  minReadyPages: number | null
  maxReadyPages: number | null
  withApprovalCount: number
  withApprovalRate: number
  totalEvidenceIds: number
  averageEvidenceIdsPerPublish: number
  migratedCount: number
  migratedRate: number
  uniquePublishers: number
}

export function projectWebsiteLocalPublishReadyPagesBrief(
  workspace: WebsiteWorkspace,
): WebsiteLocalPublishReadyPagesBrief {
  const publishes = workspace.localPublishes
  const totalPublishes = publishes.length

  let totalReadyPages = 0
  let minReadyPages: number | null = null
  let maxReadyPages: number | null = null
  let withApprovalCount = 0
  let totalEvidenceIds = 0
  let migratedCount = 0
  const publishers = new Set<string>()

  for (const record of publishes) {
    const readyCount = record.readyPageIds.length
    totalReadyPages += readyCount
    if (minReadyPages === null || readyCount < minReadyPages) minReadyPages = readyCount
    if (maxReadyPages === null || readyCount > maxReadyPages) maxReadyPages = readyCount
    if (record.approvalId !== null) withApprovalCount++
    totalEvidenceIds += record.evidenceIds.length
    if (record.migratedFromV1) migratedCount++
    publishers.add(record.recordedBy)
  }

  return {
    totalPublishes,
    totalReadyPages,
    averageReadyPagesPerPublish: totalPublishes > 0 ? Math.round(totalReadyPages / totalPublishes) : 0,
    minReadyPages,
    maxReadyPages,
    withApprovalCount,
    withApprovalRate: totalPublishes > 0 ? Math.round((withApprovalCount / totalPublishes) * 100) : 0,
    totalEvidenceIds,
    averageEvidenceIdsPerPublish: totalPublishes > 0 ? Math.round(totalEvidenceIds / totalPublishes) : 0,
    migratedCount,
    migratedRate: totalPublishes > 0 ? Math.round((migratedCount / totalPublishes) * 100) : 0,
    uniquePublishers: publishers.size,
  }
}
