import type { ProductionState } from './production-workspace.ts'

export type PlantProductStats = {
  totalJobs: number
  closedJobs: number
  onHoldJobs: number
  openJobs: number
  totalTarget: number
  totalOutput: number
  totalScrap: number
  completionRate: number
  qualityRate: number
}

export type PlantProductMixSummary = {
  totalDistinctProducts: number
  topProductsByOutput: Array<{ product: string; output: number; qualityRate: number }>
  byProduct: Record<string, PlantProductStats>
}

export function projectPlantProductMixSummary(production: ProductionState): PlantProductMixSummary {
  const map = new Map<string, PlantProductStats>()
  for (const job of production.jobs) {
    const isClosed = Boolean(job.closure)
    const isOnHold = !isClosed && Boolean(job.qualityHold)
    const isOpen = !isClosed && !isOnHold
    const output = isClosed ? (job.output ?? 0) : 0
    const scrap = job.scrap ?? 0
    const existing = map.get(job.product)
    if (existing) {
      existing.totalJobs += 1
      existing.closedJobs += isClosed ? 1 : 0
      existing.onHoldJobs += isOnHold ? 1 : 0
      existing.openJobs += isOpen ? 1 : 0
      existing.totalTarget += job.target
      existing.totalOutput += output
      existing.totalScrap += scrap
    } else {
      map.set(job.product, {
        totalJobs: 1,
        closedJobs: isClosed ? 1 : 0,
        onHoldJobs: isOnHold ? 1 : 0,
        openJobs: isOpen ? 1 : 0,
        totalTarget: job.target,
        totalOutput: output,
        totalScrap: scrap,
        completionRate: 0,
        qualityRate: 0,
      })
    }
  }
  const byProduct: Record<string, PlantProductStats> = {}
  for (const [product, stats] of map.entries()) {
    const totalProduced = stats.totalOutput + stats.totalScrap
    stats.completionRate = stats.totalJobs > 0 ? Math.round((stats.closedJobs / stats.totalJobs) * 100) : 0
    stats.qualityRate = totalProduced > 0 ? Math.round((stats.totalOutput / totalProduced) * 100) : 0
    byProduct[product] = stats
  }
  const topProductsByOutput = [...map.entries()]
    .filter(([, s]) => s.totalOutput > 0)
    .sort(([pa, a], [pb, b]) => b.totalOutput - a.totalOutput || pa.localeCompare(pb))
    .slice(0, 5)
    .map(([product, s]) => ({ product, output: s.totalOutput, qualityRate: s.qualityRate }))
  return {
    totalDistinctProducts: map.size,
    topProductsByOutput,
    byProduct,
  }
}
