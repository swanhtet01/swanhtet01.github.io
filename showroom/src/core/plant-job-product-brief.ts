import type { ProductionState } from './production-workspace.ts'

export type PlantJobProductBrief = {
  totalJobs: number
  uniqueProducts: number
  topProductsByCount: Array<{ product: string; count: number }>
}

export function projectPlantJobProductBrief(
  production: ProductionState,
): PlantJobProductBrief {
  let totalJobs = 0
  const productMap = new Map<string, number>()

  for (const job of production.jobs) {
    totalJobs++
    productMap.set(job.product, (productMap.get(job.product) ?? 0) + 1)
  }

  const topProductsByCount = Array.from(productMap.entries())
    .map(([product, count]) => ({ product, count }))
    .sort((a, b) => b.count - a.count || a.product.localeCompare(b.product))
    .slice(0, 5)

  return {
    totalJobs,
    uniqueProducts: productMap.size,
    topProductsByCount,
  }
}
