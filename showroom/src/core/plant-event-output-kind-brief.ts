import type { ProductionState } from './production-workspace.ts'

export type PlantEventOutputKindBrief = {
  totalOutputEvents: number
  goodOutputEvents: number
  scrapOutputEvents: number
  goodOutputRate: number
}

export function projectPlantEventOutputKindBrief(
  production: ProductionState,
): PlantEventOutputKindBrief {
  let totalOutputEvents = 0
  let goodOutputEvents = 0
  let scrapOutputEvents = 0

  for (const event of production.events) {
    if (event.outputKind === undefined) continue
    totalOutputEvents++
    if (event.outputKind === 'scrap') {
      scrapOutputEvents++
    } else {
      goodOutputEvents++
    }
  }

  return {
    totalOutputEvents,
    goodOutputEvents,
    scrapOutputEvents,
    goodOutputRate:
      totalOutputEvents > 0 ? Math.round((goodOutputEvents / totalOutputEvents) * 100) : 0,
  }
}
