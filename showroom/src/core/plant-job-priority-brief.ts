import type { ProductionState } from './production-workspace.ts'

export type PlantJobPriorityBrief = {
  totalJobs: number
  byPriority: { urgent: number; normal: number; low: number; unspecified: number }
  urgentOpenJobs: number
  urgentCompletedJobs: number
  urgentWithQualityHold: number
  urgentRate: number
}

export function projectPlantJobPriorityBrief(production: ProductionState): PlantJobPriorityBrief {
  const byPriority = { urgent: 0, normal: 0, low: 0, unspecified: 0 }
  let urgentOpenJobs = 0
  let urgentCompletedJobs = 0
  let urgentWithQualityHold = 0

  for (const job of production.jobs) {
    const priority = job.priority ?? 'unspecified'
    byPriority[priority as keyof typeof byPriority]++

    if (job.priority === 'urgent') {
      if (job.closure) urgentCompletedJobs++
      else urgentOpenJobs++
      if (job.qualityHold) urgentWithQualityHold++
    }
  }

  const totalJobs = production.jobs.length
  return {
    totalJobs,
    byPriority,
    urgentOpenJobs,
    urgentCompletedJobs,
    urgentWithQualityHold,
    urgentRate: totalJobs > 0 ? Math.round((byPriority.urgent / totalJobs) * 100) : 0,
  }
}
