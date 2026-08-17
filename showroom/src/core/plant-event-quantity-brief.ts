import type { ProductionState } from './production-workspace.ts'

export type PlantEventQuantityBrief = {
  totalEvents: number
  eventsWithQuantity: number
  totalQuantity: number
  averageQuantity: number
  eventsWithRemainingQuantity: number
  totalRemainingQuantity: number
  averageRemainingQuantity: number
}

export function projectPlantEventQuantityBrief(
  production: ProductionState,
): PlantEventQuantityBrief {
  let totalEvents = 0
  let eventsWithQuantity = 0
  let totalQuantity = 0
  let eventsWithRemainingQuantity = 0
  let totalRemainingQuantity = 0

  for (const event of production.events) {
    totalEvents++
    if (event.quantity !== undefined) {
      eventsWithQuantity++
      totalQuantity += event.quantity
    }
    if (event.remainingQuantity !== undefined) {
      eventsWithRemainingQuantity++
      totalRemainingQuantity += event.remainingQuantity
    }
  }

  return {
    totalEvents,
    eventsWithQuantity,
    totalQuantity,
    averageQuantity: eventsWithQuantity > 0 ? Math.round(totalQuantity / eventsWithQuantity) : 0,
    eventsWithRemainingQuantity,
    totalRemainingQuantity,
    averageRemainingQuantity:
      eventsWithRemainingQuantity > 0
        ? Math.round(totalRemainingQuantity / eventsWithRemainingQuantity)
        : 0,
  }
}
