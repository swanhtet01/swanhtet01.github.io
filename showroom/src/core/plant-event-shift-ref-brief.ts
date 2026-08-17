import type { ProductionState } from './production-workspace.ts'

export type PlantEventShiftRefBrief = {
  totalEventsWithShiftRef: number
  uniqueShiftRefs: number
  topShiftRefsByCount: Array<{ shiftRef: string; count: number }>
}

export function projectPlantEventShiftRefBrief(
  production: ProductionState,
): PlantEventShiftRefBrief {
  let totalEventsWithShiftRef = 0
  const refMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.shiftRef === undefined) continue
    totalEventsWithShiftRef++
    refMap.set(event.shiftRef, (refMap.get(event.shiftRef) ?? 0) + 1)
  }

  const topShiftRefsByCount = Array.from(refMap.entries())
    .map(([shiftRef, count]) => ({ shiftRef, count }))
    .sort((a, b) => b.count - a.count || a.shiftRef.localeCompare(b.shiftRef))
    .slice(0, 5)

  return {
    totalEventsWithShiftRef,
    uniqueShiftRefs: refMap.size,
    topShiftRefsByCount,
  }
}
