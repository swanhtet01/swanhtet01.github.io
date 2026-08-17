import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaterialLotBrief = {
  totalMaterialEvents: number
  eventsWithLot: number
  lotPresenceRate: number
  uniqueLots: number
  topLotsByCount: Array<{ lot: string; count: number }>
}

export function projectPlantEventMaterialLotBrief(
  production: ProductionState,
): PlantEventMaterialLotBrief {
  let totalMaterialEvents = 0
  let eventsWithLot = 0
  const lotMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'material_consumed') continue
    totalMaterialEvents++
    if (event.materialLot !== undefined) {
      eventsWithLot++
      lotMap.set(event.materialLot, (lotMap.get(event.materialLot) ?? 0) + 1)
    }
  }

  const topLotsByCount = Array.from(lotMap.entries())
    .map(([lot, count]) => ({ lot, count }))
    .sort((a, b) => b.count - a.count || a.lot.localeCompare(b.lot))
    .slice(0, 5)

  return {
    totalMaterialEvents,
    eventsWithLot,
    lotPresenceRate: totalMaterialEvents > 0 ? Math.round((eventsWithLot / totalMaterialEvents) * 100) : 0,
    uniqueLots: lotMap.size,
    topLotsByCount,
  }
}
