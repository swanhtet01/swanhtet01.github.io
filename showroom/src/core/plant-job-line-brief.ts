import type { ProductionState } from './production-workspace.ts'

export type PlantJobLineBrief = {
  totalJobs: number
  uniqueLines: number
  topLinesByCount: Array<{ line: string; count: number }>
}

export function projectPlantJobLineBrief(
  production: ProductionState,
): PlantJobLineBrief {
  let totalJobs = 0
  const lineMap = new Map<string, number>()

  for (const job of production.jobs) {
    totalJobs++
    lineMap.set(job.line, (lineMap.get(job.line) ?? 0) + 1)
  }

  const topLinesByCount = Array.from(lineMap.entries())
    .map(([line, count]) => ({ line, count }))
    .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line))
    .slice(0, 5)

  return {
    totalJobs,
    uniqueLines: lineMap.size,
    topLinesByCount,
  }
}
