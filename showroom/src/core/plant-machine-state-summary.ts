import type { ProductionState } from './production-workspace.ts'

export type PlantMachineStateSummary = {
  total: number
  running: number
  attention: number
  stopped: number
  availabilityRate: number
}

export function projectPlantMachineStateSummary(production: ProductionState): PlantMachineStateSummary {
  let running = 0
  let attention = 0
  let stopped = 0

  for (const machine of production.machines) {
    if (machine.state === 'running') running++
    else if (machine.state === 'attention') attention++
    else stopped++
  }

  const total = production.machines.length
  return {
    total,
    running,
    attention,
    stopped,
    availabilityRate: total > 0 ? Math.round((running / total) * 100) : 0,
  }
}
