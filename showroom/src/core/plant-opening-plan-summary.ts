import type { PlantIndustryPackId } from './plant-industry-packs.ts'
import type { ProductionState } from './production-workspace.ts'

export type PlantOpeningPlanSummary = {
  loaded: boolean
  jobCount: number
  machineCount: number
  hasIndustryPack: boolean
  industryPackId: PlantIndustryPackId | null
  confirmedAt: string | null
}

export function projectPlantOpeningPlanSummary(production: ProductionState): PlantOpeningPlanSummary {
  const plan = production.openingPlan

  if (plan === undefined) {
    return {
      loaded: false,
      jobCount: 0,
      machineCount: 0,
      hasIndustryPack: false,
      industryPackId: null,
      confirmedAt: null,
    }
  }

  return {
    loaded: true,
    jobCount: plan.jobIds.length,
    machineCount: plan.machineIds.length,
    hasIndustryPack: plan.industryPackId !== undefined,
    industryPackId: plan.industryPackId ?? null,
    confirmedAt: plan.confirmedAt,
  }
}
