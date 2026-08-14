import type { ProductionState } from './production-workspace.ts'

export type PlantJobShortCloseBrief = {
  totalJobs: number
  closedShortJobs: number
  totalTargetUnits: number
  totalUnitsLost: number
  unitLossRate: number
  averageUnitsLostPerClose: number
  largestSingleLoss: number
}

export function projectPlantJobShortCloseBrief(production: ProductionState): PlantJobShortCloseBrief {
  let closedShortJobs = 0
  let totalTargetUnits = 0
  let totalUnitsLost = 0
  let largestSingleLoss = 0

  for (const job of production.jobs) {
    totalTargetUnits += job.target
    if (job.closure !== undefined) {
      closedShortJobs++
      totalUnitsLost += job.closure.remainingUnits
      if (job.closure.remainingUnits > largestSingleLoss) {
        largestSingleLoss = job.closure.remainingUnits
      }
    }
  }

  return {
    totalJobs: production.jobs.length,
    closedShortJobs,
    totalTargetUnits,
    totalUnitsLost,
    unitLossRate: totalTargetUnits > 0 ? Math.round((totalUnitsLost / totalTargetUnits) * 100) : 0,
    averageUnitsLostPerClose: closedShortJobs > 0 ? Math.round(totalUnitsLost / closedShortJobs) : 0,
    largestSingleLoss,
  }
}
