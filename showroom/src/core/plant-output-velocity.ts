import type { ProductionState } from './production-workspace.ts'

export type OutputVelocityWindow = {
  closedJobs: number
  totalOutput: number
  totalScrap: number
}

export type PlantOutputVelocity = {
  last7Days: OutputVelocityWindow
  last30Days: OutputVelocityWindow
  velocityTrend: 'accelerating' | 'steady' | 'decelerating' | null
  byDay: Array<{ date: string; closedJobs: number; totalOutput: number; totalScrap: number }>
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function projectPlantOutputVelocity(
  production: ProductionState,
  asOf: string,
): PlantOutputVelocity {
  const today = asOf.slice(0, 10)
  const start7 = subtractDays(today, 6)
  const start30 = subtractDays(today, 29)

  const dayMap = new Map<string, { closedJobs: number; totalOutput: number; totalScrap: number }>()
  const last7: OutputVelocityWindow = { closedJobs: 0, totalOutput: 0, totalScrap: 0 }
  const last30: OutputVelocityWindow = { closedJobs: 0, totalOutput: 0, totalScrap: 0 }

  for (const job of production.jobs) {
    if (!job.closure) continue
    const date = job.closure.closedAt.slice(0, 10)
    if (date < start30 || date > today) continue
    const output = job.output ?? 0
    const scrap = job.scrap ?? 0
    last30.closedJobs += 1
    last30.totalOutput += output
    last30.totalScrap += scrap
    const entry = dayMap.get(date) ?? { closedJobs: 0, totalOutput: 0, totalScrap: 0 }
    entry.closedJobs += 1
    entry.totalOutput += output
    entry.totalScrap += scrap
    dayMap.set(date, entry)
    if (date >= start7) {
      last7.closedJobs += 1
      last7.totalOutput += output
      last7.totalScrap += scrap
    }
  }

  let velocityTrend: PlantOutputVelocity['velocityTrend'] = null
  if (last30.closedJobs > 0) {
    const rate7 = last7.totalOutput / 7
    const rate30 = last30.totalOutput / 30
    if (rate30 === 0) {
      velocityTrend = last7.totalOutput > 0 ? 'accelerating' : 'steady'
    } else if (rate7 > rate30 * 1.1) {
      velocityTrend = 'accelerating'
    } else if (rate7 < rate30 * 0.9) {
      velocityTrend = 'decelerating'
    } else {
      velocityTrend = 'steady'
    }
  }

  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { last7Days: last7, last30Days: last30, velocityTrend, byDay }
}
