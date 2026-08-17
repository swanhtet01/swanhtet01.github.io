import type { ProductionState } from './production-workspace.ts'

export type PlantEventIssueSnapshotBrief = {
  totalIssueSnapshotEvents: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  uniqueIssueOwners: number
  topIssueOwnersByCount: Array<{ owner: string; count: number }>
}

export function projectPlantEventIssueSnapshotBrief(
  production: ProductionState,
): PlantEventIssueSnapshotBrief {
  let totalIssueSnapshotEvents = 0
  let criticalCount = 0
  let highCount = 0
  let mediumCount = 0
  let lowCount = 0
  const ownerMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.issueSeverity === undefined) continue
    totalIssueSnapshotEvents++
    if (event.issueSeverity === 'critical') criticalCount++
    else if (event.issueSeverity === 'high') highCount++
    else if (event.issueSeverity === 'medium') mediumCount++
    else if (event.issueSeverity === 'low') lowCount++
    if (event.issueOwner !== undefined) {
      ownerMap.set(event.issueOwner, (ownerMap.get(event.issueOwner) ?? 0) + 1)
    }
  }

  const topIssueOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalIssueSnapshotEvents,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    uniqueIssueOwners: ownerMap.size,
    topIssueOwnersByCount,
  }
}
