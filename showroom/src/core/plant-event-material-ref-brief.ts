import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaterialRefBrief = {
  totalMaterialEvents: number
  uniqueMaterialRefs: number
  topMaterialRefsByCount: Array<{ ref: string; count: number }>
  unitKg: number
  unitG: number
  unitL: number
  unitMl: number
  unitPcs: number
  unitPack: number
  unitBag: number
  unitRoll: number
  unitSheet: number
  unitM: number
  unitCm: number
}

export function projectPlantEventMaterialRefBrief(
  production: ProductionState,
): PlantEventMaterialRefBrief {
  let totalMaterialEvents = 0
  let unitKg = 0
  let unitG = 0
  let unitL = 0
  let unitMl = 0
  let unitPcs = 0
  let unitPack = 0
  let unitBag = 0
  let unitRoll = 0
  let unitSheet = 0
  let unitM = 0
  let unitCm = 0
  const refMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.materialRef === undefined) continue
    totalMaterialEvents++
    refMap.set(event.materialRef, (refMap.get(event.materialRef) ?? 0) + 1)
    if (event.materialUnit === 'kg') unitKg++
    else if (event.materialUnit === 'g') unitG++
    else if (event.materialUnit === 'l') unitL++
    else if (event.materialUnit === 'ml') unitMl++
    else if (event.materialUnit === 'pcs') unitPcs++
    else if (event.materialUnit === 'pack') unitPack++
    else if (event.materialUnit === 'bag') unitBag++
    else if (event.materialUnit === 'roll') unitRoll++
    else if (event.materialUnit === 'sheet') unitSheet++
    else if (event.materialUnit === 'm') unitM++
    else if (event.materialUnit === 'cm') unitCm++
  }

  const topMaterialRefsByCount = Array.from(refMap.entries())
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => b.count - a.count || a.ref.localeCompare(b.ref))
    .slice(0, 5)

  return {
    totalMaterialEvents,
    uniqueMaterialRefs: refMap.size,
    topMaterialRefsByCount,
    unitKg,
    unitG,
    unitL,
    unitMl,
    unitPcs,
    unitPack,
    unitBag,
    unitRoll,
    unitSheet,
    unitM,
    unitCm,
  }
}
