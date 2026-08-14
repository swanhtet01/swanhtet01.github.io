import type { ProductionState } from './production-workspace.ts'

export type PlantEventShiftUnitsBrief = {
  totalEvents: number
  eventsWithGoodUnits: number
  totalGoodUnits: number
  averageGoodUnits: number
  eventsWithScrapUnits: number
  totalScrapUnits: number
  averageScrapUnits: number
}

export function projectPlantEventShiftUnitsBrief(
  production: ProductionState,
): PlantEventShiftUnitsBrief {
  let totalEvents = 0
  let eventsWithGoodUnits = 0
  let totalGoodUnits = 0
  let eventsWithScrapUnits = 0
  let totalScrapUnits = 0

  for (const event of production.events) {
    totalEvents++
    if (event.goodUnits !== undefined) {
      eventsWithGoodUnits++
      totalGoodUnits += event.goodUnits
    }
    if (event.scrapUnits !== undefined) {
      eventsWithScrapUnits++
      totalScrapUnits += event.scrapUnits
    }
  }

  return {
    totalEvents,
    eventsWithGoodUnits,
    totalGoodUnits,
    averageGoodUnits: eventsWithGoodUnits > 0 ? Math.round(totalGoodUnits / eventsWithGoodUnits) : 0,
    eventsWithScrapUnits,
    totalScrapUnits,
    averageScrapUnits:
      eventsWithScrapUnits > 0 ? Math.round(totalScrapUnits / eventsWithScrapUnits) : 0,
  }
}
