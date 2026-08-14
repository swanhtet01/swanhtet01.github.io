import type { ProductionState } from './production-workspace.ts'

export type PlantLineMetrics = {
  total: number
  closed: number
  onHold: number
  target: number
  scrap: number
}

export type PlantOeeSummary = {
  asOf: string
  totalJobs: number
  closedJobs: number
  openJobs: number
  onHoldJobs: number
  overdueJobs: number
  totalTarget: number
  totalGoodOutput: number
  totalScrap: number
  qualityRate: number
  avgJobProgress: number
  byLine: Record<string, PlantLineMetrics>
}

export function projectPlantOeeSummary(production: ProductionState, asOf: string): PlantOeeSummary {
  let closedJobs = 0, openJobs = 0, onHoldJobs = 0, overdueJobs = 0
  let totalTarget = 0, totalGoodOutput = 0, totalScrap = 0, totalProgress = 0
  const byLine: Record<string, PlantLineMetrics> = {}

  for (const job of production.jobs) {
    const entry = byLine[job.line] ?? { total: 0, closed: 0, onHold: 0, target: 0, scrap: 0 }
    entry.total += 1

    const isClosed = !!job.closure
    const isOnHold = !isClosed && !!job.qualityHold

    if (isClosed) {
      closedJobs += 1
      entry.closed += 1
      totalTarget += job.target
      const scrap = job.scrap ?? 0
      totalScrap += scrap
      totalGoodOutput += job.output - scrap
      entry.target += job.target
      entry.scrap += scrap
    } else if (isOnHold) {
      onHoldJobs += 1
      entry.onHold += 1
    } else {
      openJobs += 1
    }

    if (!isClosed && job.dueAt && job.dueAt < asOf) overdueJobs += 1

    totalProgress += job.target > 0 ? Math.min(100, Math.round((job.output / job.target) * 100)) : 0
    byLine[job.line] = entry
  }

  const totalJobs = production.jobs.length
  return {
    asOf,
    totalJobs,
    closedJobs,
    openJobs,
    onHoldJobs,
    overdueJobs,
    totalTarget,
    totalGoodOutput,
    totalScrap,
    qualityRate: totalTarget > 0 ? Math.round((totalGoodOutput / totalTarget) * 100) : 0,
    avgJobProgress: totalJobs > 0 ? Math.round(totalProgress / totalJobs) : 0,
    byLine,
  }
}
