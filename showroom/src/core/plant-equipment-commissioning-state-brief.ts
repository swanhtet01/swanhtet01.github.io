import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentCommissioningStateBrief = {
  totalCommissionings: number
  runningCount: number
  attentionCount: number
  stoppedCount: number
  runningRate: number
  attentionRate: number
  stoppedRate: number
}

export function projectPlantEquipmentCommissioningStateBrief(
  production: ProductionState,
): PlantEquipmentCommissioningStateBrief {
  let totalCommissionings = 0
  let runningCount = 0
  let attentionCount = 0
  let stoppedCount = 0

  for (const asset of production.equipmentMaster?.assets ?? []) {
    const commissioning = asset.commissioning
    if (commissioning === undefined) continue
    totalCommissionings++
    if (commissioning.initialState === 'running') runningCount++
    else if (commissioning.initialState === 'attention') attentionCount++
    else stoppedCount++
  }

  return {
    totalCommissionings,
    runningCount,
    attentionCount,
    stoppedCount,
    runningRate: totalCommissionings > 0 ? Math.round((runningCount / totalCommissionings) * 100) : 0,
    attentionRate: totalCommissionings > 0 ? Math.round((attentionCount / totalCommissionings) * 100) : 0,
    stoppedRate: totalCommissionings > 0 ? Math.round((stoppedCount / totalCommissionings) * 100) : 0,
  }
}
