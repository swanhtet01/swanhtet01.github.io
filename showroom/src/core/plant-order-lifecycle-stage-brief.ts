import type { ProductionState } from './production-workspace.ts'

export type PlantOrderLifecycleStageBrief = {
  totalEntries: number
  unplanned: number
  planned: number
  released: number
  inProcess: number
  inspectionDone: number
  releasedToStock: number
  withQualityRework: number
  withSubstitution: number
}

export function projectPlantOrderLifecycleStageBrief(production: ProductionState): PlantOrderLifecycleStageBrief {
  const portfolio = production.orderPortfolio
  if (portfolio === undefined || portfolio.entries.length === 0) {
    return {
      totalEntries: 0,
      unplanned: 0, planned: 0, released: 0, inProcess: 0,
      inspectionDone: 0, releasedToStock: 0, withQualityRework: 0, withSubstitution: 0,
    }
  }

  let unplanned = 0
  let planned = 0
  let released = 0
  let inProcess = 0
  let inspectionDone = 0
  let releasedToStock = 0
  let withQualityRework = 0
  let withSubstitution = 0

  for (const entry of portfolio.entries) {
    const kinds = new Set(entry.execution.commands.map((cmd) => cmd.payload.kind))

    if (kinds.has('release_batch')) releasedToStock++
    else if (kinds.has('inspect_output')) inspectionDone++
    else if (kinds.has('record_output')) inProcess++
    else if (kinds.has('release_order')) released++
    else if (kinds.has('import_plan')) planned++
    else unplanned++

    if (kinds.has('record_quality_rework')) withQualityRework++
    if (kinds.has('approve_material_substitution')) withSubstitution++
  }

  return {
    totalEntries: portfolio.entries.length,
    unplanned, planned, released, inProcess,
    inspectionDone, releasedToStock, withQualityRework, withSubstitution,
  }
}
