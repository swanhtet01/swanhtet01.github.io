import type { ProductionState } from './production-workspace.ts'

export type PlantOrderPortfolioSummary = {
  loaded: boolean
  totalEntries: number
  uniqueJobIds: number
  totalCommands: number
  averageCommandsPerEntry: number
}

export function projectPlantOrderPortfolioSummary(production: ProductionState): PlantOrderPortfolioSummary {
  const portfolio = production.orderPortfolio

  if (portfolio === undefined) {
    return { loaded: false, totalEntries: 0, uniqueJobIds: 0, totalCommands: 0, averageCommandsPerEntry: 0 }
  }

  const jobIdSet = new Set<string>()
  let totalCommands = 0

  for (const entry of portfolio.entries) {
    jobIdSet.add(entry.jobId)
    totalCommands += entry.execution.commands.length
  }

  return {
    loaded: true,
    totalEntries: portfolio.entries.length,
    uniqueJobIds: jobIdSet.size,
    totalCommands,
    averageCommandsPerEntry: portfolio.entries.length > 0 ? Math.round(totalCommands / portfolio.entries.length) : 0,
  }
}
