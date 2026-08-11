import type { ProductionState } from './production-workspace.ts'

export type PlantWipSummary = {
  openJobCount: number
  totalTargetUnits: number
  totalOutputSoFar: number
  totalScrapSoFar: number
  completionRate: number
  overdueJobCount: number
  onHoldCount: number
  byPriority: { urgent: number; normal: number; low: number; unspecified: number }
}

export function projectPlantWipSummary(production: ProductionState, asOf: string): PlantWipSummary {
  const today = asOf.slice(0, 10)

  let totalTargetUnits = 0
  let totalOutputSoFar = 0
  let totalScrapSoFar = 0
  let overdueJobCount = 0
  let onHoldCount = 0
  const byPriority = { urgent: 0, normal: 0, low: 0, unspecified: 0 }

  for (const job of production.jobs) {
    if (job.closure) continue
    totalTargetUnits += job.target
    totalOutputSoFar += job.output
    totalScrapSoFar += job.scrap ?? 0
    if (job.dueAt && job.dueAt.slice(0, 10) < today) overdueJobCount++
    if (job.qualityHold) onHoldCount++
    const p = job.priority ?? 'unspecified'
    byPriority[p as keyof typeof byPriority] += 1
  }

  const openJobCount = production.jobs.filter((j) => !j.closure).length

  return {
    openJobCount,
    totalTargetUnits,
    totalOutputSoFar,
    totalScrapSoFar,
    completionRate: totalTargetUnits > 0 ? Math.round((totalOutputSoFar / totalTargetUnits) * 100) : 0,
    overdueJobCount,
    onHoldCount,
    byPriority,
  }
}
