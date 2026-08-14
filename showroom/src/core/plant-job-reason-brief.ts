import type { ProductionState } from './production-workspace.ts'

export type PlantJobReasonBrief = {
  totalJobs: number
  jobsWithQualityHold: number
  qualityHoldRate: number
  uniqueQualityHoldReasons: number
  topQualityHoldReasonsByCount: Array<{ reason: string; count: number }>
  jobsWithClosure: number
  closureRate: number
  uniqueClosureReasons: number
  topClosureReasonsByCount: Array<{ reason: string; count: number }>
  totalRemainingUnits: number
  averageRemainingUnits: number
}

export function projectPlantJobReasonBrief(production: ProductionState): PlantJobReasonBrief {
  let totalJobs = 0
  let jobsWithQualityHold = 0
  let jobsWithClosure = 0
  let totalRemainingUnits = 0
  const qualityHoldReasonMap = new Map<string, number>()
  const closureReasonMap = new Map<string, number>()

  for (const job of production.jobs) {
    totalJobs++
    if (job.qualityHold !== undefined) {
      jobsWithQualityHold++
      qualityHoldReasonMap.set(
        job.qualityHold.reason,
        (qualityHoldReasonMap.get(job.qualityHold.reason) ?? 0) + 1,
      )
    }
    if (job.closure !== undefined) {
      jobsWithClosure++
      closureReasonMap.set(
        job.closure.reason,
        (closureReasonMap.get(job.closure.reason) ?? 0) + 1,
      )
      totalRemainingUnits += job.closure.remainingUnits
    }
  }

  const topQualityHoldReasonsByCount = Array.from(qualityHoldReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  const topClosureReasonsByCount = Array.from(closureReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalJobs,
    jobsWithQualityHold,
    qualityHoldRate: totalJobs > 0 ? Math.round((jobsWithQualityHold / totalJobs) * 100) : 0,
    uniqueQualityHoldReasons: qualityHoldReasonMap.size,
    topQualityHoldReasonsByCount,
    jobsWithClosure,
    closureRate: totalJobs > 0 ? Math.round((jobsWithClosure / totalJobs) * 100) : 0,
    uniqueClosureReasons: closureReasonMap.size,
    topClosureReasonsByCount,
    totalRemainingUnits,
    averageRemainingUnits:
      jobsWithClosure > 0 ? Math.round(totalRemainingUnits / jobsWithClosure) : 0,
  }
}
