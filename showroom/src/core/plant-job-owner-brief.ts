import type { ProductionState } from './production-workspace.ts'

export type PlantJobOwnerEntry = {
  owner: string
  jobCount: number
  openJobs: number
  completedJobs: number
}

export type PlantJobOwnerBrief = {
  totalJobs: number
  jobsWithOwner: number
  jobsWithoutOwner: number
  uniqueOwners: number
  topOwners: PlantJobOwnerEntry[]
  openJobsWithoutOwner: number
}

export function projectPlantJobOwnerBrief(production: ProductionState): PlantJobOwnerBrief {
  const ownerMap = new Map<string, { jobCount: number; openJobs: number; completedJobs: number }>()
  let jobsWithoutOwner = 0
  let openJobsWithoutOwner = 0

  for (const job of production.jobs) {
    const isComplete = job.closure !== undefined
    if (job.owner !== undefined) {
      const entry = ownerMap.get(job.owner)
      if (entry) {
        entry.jobCount++
        if (isComplete) entry.completedJobs++
        else entry.openJobs++
      } else {
        ownerMap.set(job.owner, {
          jobCount: 1,
          openJobs: isComplete ? 0 : 1,
          completedJobs: isComplete ? 1 : 0,
        })
      }
    } else {
      jobsWithoutOwner++
      if (!isComplete) openJobsWithoutOwner++
    }
  }

  const topOwners: PlantJobOwnerEntry[] = Array.from(ownerMap.entries())
    .map(([owner, data]) => ({ owner, ...data }))
    .sort((a, b) => b.jobCount - a.jobCount)
    .slice(0, 5)

  return {
    totalJobs: production.jobs.length,
    jobsWithOwner: production.jobs.length - jobsWithoutOwner,
    jobsWithoutOwner,
    uniqueOwners: ownerMap.size,
    topOwners,
    openJobsWithoutOwner,
  }
}
