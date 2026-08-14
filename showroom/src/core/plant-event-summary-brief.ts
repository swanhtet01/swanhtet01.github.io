import type { ProductionState } from './production-workspace.ts'

export type PlantEventSummaryBrief = {
  totalEvents: number
  uniqueSummaries: number
  averageSummaryLength: number
}

export function projectPlantEventSummaryBrief(
  production: ProductionState,
): PlantEventSummaryBrief {
  let totalEvents = 0
  let totalSummaryLength = 0
  const summarySet = new Set<string>()

  for (const event of production.events) {
    totalEvents++
    totalSummaryLength += event.summary.length
    summarySet.add(event.summary)
  }

  return {
    totalEvents,
    uniqueSummaries: summarySet.size,
    averageSummaryLength:
      totalEvents > 0 ? Math.round(totalSummaryLength / totalEvents) : 0,
  }
}
