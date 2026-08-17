import type { ProductionState } from './production-workspace.ts'

export type PlantMachineStateBrief = {
  totalMachines: number
  runningCount: number
  attentionCount: number
  stoppedCount: number
  runningRate: number
  attentionRate: number
  stoppedRate: number
}

export function projectPlantMachineStateBrief(
  production: ProductionState,
): PlantMachineStateBrief {
  let totalMachines = 0
  let runningCount = 0
  let attentionCount = 0
  let stoppedCount = 0

  for (const machine of production.machines) {
    totalMachines++
    if (machine.state === 'running') runningCount++
    else if (machine.state === 'attention') attentionCount++
    else stoppedCount++
  }

  return {
    totalMachines,
    runningCount,
    attentionCount,
    stoppedCount,
    runningRate: totalMachines > 0 ? Math.round((runningCount / totalMachines) * 100) : 0,
    attentionRate: totalMachines > 0 ? Math.round((attentionCount / totalMachines) * 100) : 0,
    stoppedRate: totalMachines > 0 ? Math.round((stoppedCount / totalMachines) * 100) : 0,
  }
}
