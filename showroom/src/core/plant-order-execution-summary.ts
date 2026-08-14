import type { ProductionState } from './production-workspace.ts'

export type PlantOrderExecutionSummary = {
  loaded: boolean
  revision: number
  commandCount: number
}

export function projectPlantOrderExecutionSummary(production: ProductionState): PlantOrderExecutionSummary {
  const execution = production.orderExecution

  if (execution === undefined) {
    return { loaded: false, revision: 0, commandCount: 0 }
  }

  return {
    loaded: true,
    revision: execution.revision,
    commandCount: execution.commands.length,
  }
}
