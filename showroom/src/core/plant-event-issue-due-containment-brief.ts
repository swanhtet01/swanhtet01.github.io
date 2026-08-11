import type { ProductionState } from './production-workspace.ts'

export type PlantEventIssueDueContainmentBrief = {
  totalIssueEvents: number
  eventsWithDueAt: number
  earliestIssueDueAt: string | null
  latestIssueDueAt: string | null
  eventsWithContainment: number
  containmentRate: number
}

export function projectPlantEventIssueDueContainmentBrief(
  production: ProductionState,
): PlantEventIssueDueContainmentBrief {
  let totalIssueEvents = 0
  let eventsWithDueAt = 0
  let earliestIssueDueAt: string | null = null
  let latestIssueDueAt: string | null = null
  let eventsWithContainment = 0

  for (const event of production.events) {
    if (event.issueSeverity === undefined) continue
    totalIssueEvents++
    if (event.issueDueAt !== undefined) {
      eventsWithDueAt++
      if (earliestIssueDueAt === null || event.issueDueAt < earliestIssueDueAt)
        earliestIssueDueAt = event.issueDueAt
      if (latestIssueDueAt === null || event.issueDueAt > latestIssueDueAt)
        latestIssueDueAt = event.issueDueAt
    }
    if (event.issueContainment !== undefined) eventsWithContainment++
  }

  return {
    totalIssueEvents,
    eventsWithDueAt,
    earliestIssueDueAt,
    latestIssueDueAt,
    eventsWithContainment,
    containmentRate:
      totalIssueEvents > 0 ? Math.round((eventsWithContainment / totalIssueEvents) * 100) : 0,
  }
}
