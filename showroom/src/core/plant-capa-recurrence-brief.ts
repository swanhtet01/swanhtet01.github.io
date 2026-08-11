import type { ProductionState } from './production-workspace.ts'

export type PlantCapaRecurrenceEntry = {
  recurrenceKey: string
  occurrenceCount: number
}

export type PlantCapaRecurrenceBrief = {
  totalQualityCapaIssues: number
  uniqueFailureModes: number
  recurringFailureModes: number
  topFailureModes: PlantCapaRecurrenceEntry[]
  byCauseCategory: {
    material: number
    method: number
    machine: number
    measurement: number
    people: number
    environment: number
  }
  effectivenessOverdue: number
}

export function projectPlantCapaRecurrenceBrief(production: ProductionState, asOf: string): PlantCapaRecurrenceBrief {
  const recurrenceMap = new Map<string, number>()
  const byCategory = { material: 0, method: 0, machine: 0, measurement: 0, people: 0, environment: 0 }
  let effectivenessOverdue = 0

  for (const issue of production.issues) {
    if (issue.kind !== 'quality') continue
    if (issue.status !== 'resolved') continue
    const capa = issue.resolution?.qualityCorrectiveAction
    if (!capa) continue

    const existing = recurrenceMap.get(capa.recurrenceKey) ?? 0
    recurrenceMap.set(capa.recurrenceKey, existing + 1)

    const cat = capa.causeCategory as keyof typeof byCategory
    if (cat in byCategory) byCategory[cat]++

    if (capa.effectivenessDue < asOf) effectivenessOverdue++
  }

  const topFailureModes: PlantCapaRecurrenceEntry[] = Array.from(recurrenceMap.entries())
    .map(([recurrenceKey, occurrenceCount]) => ({ recurrenceKey, occurrenceCount }))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 5)

  let recurringFailureModes = 0
  for (const count of recurrenceMap.values()) {
    if (count > 1) recurringFailureModes++
  }

  return {
    totalQualityCapaIssues: Array.from(recurrenceMap.values()).reduce((sum, n) => sum + n, 0),
    uniqueFailureModes: recurrenceMap.size,
    recurringFailureModes,
    topFailureModes,
    byCauseCategory: byCategory,
    effectivenessOverdue,
  }
}
