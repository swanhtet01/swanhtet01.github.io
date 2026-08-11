import type { ProductionState } from './production-workspace.ts'

export type ShiftPerformanceRecord = {
  shiftRef: string
  closedAt: string
  goodUnits: number
  scrapUnits: number
  qualityRate: number
  outputEntryCount: number
  materialEntryCount: number
}

export type PlantShiftPerformanceSummary = {
  totalShiftsClosed: number
  totalGoodUnits: number
  totalScrapUnits: number
  overallQualityRate: number
  averageGoodUnitsPerShift: number
  byShift: ShiftPerformanceRecord[]
}

export function projectPlantShiftPerformanceSummary(
  production: ProductionState,
  date?: string,
): PlantShiftPerformanceSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  let totalGoodUnits = 0
  let totalScrapUnits = 0
  const byShift: ShiftPerformanceRecord[] = []

  for (const event of production.events) {
    if (event.kind !== 'shift_closed') continue
    if (!filter(event.createdAt)) continue
    const good = (event.goodUnits as number) ?? 0
    const scrap = (event.scrapUnits as number) ?? 0
    const produced = good + scrap
    const qualityRate = produced > 0 ? Math.round((good / produced) * 100) : 0
    totalGoodUnits += good
    totalScrapUnits += scrap
    byShift.push({
      shiftRef: event.subjectId as string,
      closedAt: event.createdAt,
      goodUnits: good,
      scrapUnits: scrap,
      qualityRate,
      outputEntryCount: (event.outputEntryCount as number) ?? 0,
      materialEntryCount: (event.materialEntryCount as number) ?? 0,
    })
  }

  byShift.sort((a, b) => b.closedAt.localeCompare(a.closedAt))

  const totalShiftsClosed = byShift.length
  const totalProduced = totalGoodUnits + totalScrapUnits
  return {
    totalShiftsClosed,
    totalGoodUnits,
    totalScrapUnits,
    overallQualityRate: totalProduced > 0 ? Math.round((totalGoodUnits / totalProduced) * 100) : 0,
    averageGoodUnitsPerShift:
      totalShiftsClosed > 0 ? Math.round(totalGoodUnits / totalShiftsClosed) : 0,
    byShift,
  }
}
