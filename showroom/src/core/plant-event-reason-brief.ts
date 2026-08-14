import type { ProductionState } from './production-workspace.ts'

export type PlantEventReasonBrief = {
  totalEvents: number
  uniqueReasons: number
  topReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectPlantEventReasonBrief(production: ProductionState): PlantEventReasonBrief {
  let totalEvents = 0
  const reasonMap = new Map<string, number>()
  for (const event of production.events) {
    totalEvents++
    reasonMap.set(event.reason, (reasonMap.get(event.reason) ?? 0) + 1)
  }
  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)
  return { totalEvents, uniqueReasons: reasonMap.size, topReasonsByCount }
}
