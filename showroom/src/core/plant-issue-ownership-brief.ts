import type { ProductionState } from './production-workspace.ts'

export type PlantIssueOwnerEntry = {
  owner: string
  issueCount: number
}

export type PlantIssueOwnershipBrief = {
  totalIssues: number
  issuesWithOwner: number
  uniqueOwners: number
  topOwners: PlantIssueOwnerEntry[]
  openWithoutOwner: number
  issuesWithContainment: number
  issuesWithResolution: number
  issuesFromMaintenance: number
}

export function projectPlantIssueOwnershipBrief(production: ProductionState): PlantIssueOwnershipBrief {
  const ownerMap = new Map<string, number>()
  let issuesWithOwner = 0
  let openWithoutOwner = 0
  let issuesWithContainment = 0
  let issuesWithResolution = 0
  let issuesFromMaintenance = 0

  for (const issue of production.issues) {
    if (issue.owner !== undefined) {
      issuesWithOwner++
      ownerMap.set(issue.owner, (ownerMap.get(issue.owner) ?? 0) + 1)
    } else if (issue.status === 'open') {
      openWithoutOwner++
    }
    if (issue.containment !== undefined) issuesWithContainment++
    if (issue.resolution !== undefined) issuesWithResolution++
    if (issue.maintenanceFindingSource !== undefined) issuesFromMaintenance++
  }

  const topOwners: PlantIssueOwnerEntry[] = Array.from(ownerMap.entries())
    .map(([owner, issueCount]) => ({ owner, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 5)

  return {
    totalIssues: production.issues.length,
    issuesWithOwner,
    uniqueOwners: ownerMap.size,
    topOwners,
    openWithoutOwner,
    issuesWithContainment,
    issuesWithResolution,
    issuesFromMaintenance,
  }
}
