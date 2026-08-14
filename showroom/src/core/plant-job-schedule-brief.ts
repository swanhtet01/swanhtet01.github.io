import type { ProductionState } from './production-workspace.ts'

export type PlantJobScheduleBrief = {
  totalJobs: number
  jobsWithDueAt: number
  jobsWithoutDueAt: number
  scheduledRate: number
  openJobs: number
  openScheduled: number
  overdueJobs: number
  dueSoonJobs: number
  futureJobs: number
  overdueRate: number
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export function projectPlantJobScheduleBrief(production: ProductionState, asOf: string): PlantJobScheduleBrief {
  if (production.jobs.length === 0) {
    return {
      totalJobs: 0,
      jobsWithDueAt: 0,
      jobsWithoutDueAt: 0,
      scheduledRate: 0,
      openJobs: 0,
      openScheduled: 0,
      overdueJobs: 0,
      dueSoonJobs: 0,
      futureJobs: 0,
      overdueRate: 0,
    }
  }

  const asOfMs = Date.parse(asOf)
  const soonMs = asOfMs + TWENTY_FOUR_HOURS_MS

  let jobsWithDueAt = 0
  let jobsWithoutDueAt = 0
  let openJobs = 0
  let openScheduled = 0
  let overdueJobs = 0
  let dueSoonJobs = 0
  let futureJobs = 0

  for (const job of production.jobs) {
    if (job.dueAt !== undefined) {
      jobsWithDueAt++
    } else {
      jobsWithoutDueAt++
    }

    if (!job.closure) {
      openJobs++
      if (job.dueAt !== undefined) {
        openScheduled++
        const dueMs = Date.parse(job.dueAt)
        if (dueMs < asOfMs) {
          overdueJobs++
        } else if (dueMs < soonMs) {
          dueSoonJobs++
        } else {
          futureJobs++
        }
      }
    }
  }

  const totalJobs = production.jobs.length
  return {
    totalJobs,
    jobsWithDueAt,
    jobsWithoutDueAt,
    scheduledRate: Math.round((jobsWithDueAt / totalJobs) * 100),
    openJobs,
    openScheduled,
    overdueJobs,
    dueSoonJobs,
    futureJobs,
    overdueRate: openScheduled > 0 ? Math.round((overdueJobs / openScheduled) * 100) : 0,
  }
}
