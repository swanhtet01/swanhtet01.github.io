import type { ProductionState } from './production-workspace.ts'

export type PlantJobOutputScrapBrief = {
  totalJobs: number
  totalOutput: number
  averageOutput: number
  minOutput: number | null
  maxOutput: number | null
  jobsWithScrap: number
  scrapRate: number
  totalScrap: number
  averageScrap: number
}

export function projectPlantJobOutputScrapBrief(
  production: ProductionState,
): PlantJobOutputScrapBrief {
  let totalJobs = 0
  let totalOutput = 0
  let minOutput: number | null = null
  let maxOutput: number | null = null
  let jobsWithScrap = 0
  let totalScrap = 0

  for (const job of production.jobs) {
    totalJobs++
    totalOutput += job.output
    if (minOutput === null || job.output < minOutput) minOutput = job.output
    if (maxOutput === null || job.output > maxOutput) maxOutput = job.output
    if (job.scrap !== undefined) {
      jobsWithScrap++
      totalScrap += job.scrap
    }
  }

  return {
    totalJobs,
    totalOutput,
    averageOutput: totalJobs > 0 ? Math.round(totalOutput / totalJobs) : 0,
    minOutput,
    maxOutput,
    jobsWithScrap,
    scrapRate: totalJobs > 0 ? Math.round((jobsWithScrap / totalJobs) * 100) : 0,
    totalScrap,
    averageScrap: jobsWithScrap > 0 ? Math.round(totalScrap / jobsWithScrap) : 0,
  }
}
