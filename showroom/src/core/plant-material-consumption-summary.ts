import type { ProductionState } from './production-workspace.ts'

export type MaterialConsumptionRecord = {
  materialRef: string
  materialUnit: string
  totalQuantity: number
  eventCount: number
  shiftCount: number
}

export type PlantMaterialConsumptionSummary = {
  totalEventCount: number
  distinctMaterials: number
  byMaterial: MaterialConsumptionRecord[]
}

export function projectPlantMaterialConsumptionSummary(
  production: ProductionState,
  date?: string,
): PlantMaterialConsumptionSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  type Entry = { materialUnit: string; totalQuantity: number; eventCount: number; shifts: Set<string> }
  const materialMap = new Map<string, Entry>()

  let totalEventCount = 0

  for (const event of production.events) {
    if (event.kind !== 'material_consumed') continue
    if (!filter(event.createdAt)) continue
    totalEventCount++
    const key = event.materialRef as string
    const entry = materialMap.get(key) ?? { materialUnit: event.materialUnit as string, totalQuantity: 0, eventCount: 0, shifts: new Set() }
    entry.totalQuantity += event.quantity as number
    entry.eventCount++
    if (event.shiftRef) entry.shifts.add(event.shiftRef as string)
    materialMap.set(key, entry)
  }

  const byMaterial = Array.from(materialMap.entries())
    .map(([materialRef, v]) => ({
      materialRef,
      materialUnit: v.materialUnit,
      totalQuantity: v.totalQuantity,
      eventCount: v.eventCount,
      shiftCount: v.shifts.size,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.materialRef.localeCompare(b.materialRef))

  return { totalEventCount, distinctMaterials: byMaterial.length, byMaterial }
}
