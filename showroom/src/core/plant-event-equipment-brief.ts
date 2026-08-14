import type { ProductionState } from './production-workspace.ts'

export type PlantEventEquipmentBrief = {
  totalEvents: number
  eventsWithEquipment: number
  eventsWithoutEquipment: number
  equipmentCoverage: number
  uniqueEquipmentIds: number
  topEquipmentByEvents: Array<{ equipmentId: string; count: number }>
}

export function projectPlantEventEquipmentBrief(production: ProductionState): PlantEventEquipmentBrief {
  let totalEvents = 0
  let eventsWithEquipment = 0
  const equipmentMap = new Map<string, number>()

  for (const event of production.events ?? []) {
    totalEvents++
    const ids = event.equipmentIds
    if (ids !== undefined && ids.length > 0) {
      eventsWithEquipment++
      for (const id of ids) {
        equipmentMap.set(id, (equipmentMap.get(id) ?? 0) + 1)
      }
    }
  }

  const topEquipmentByEvents = Array.from(equipmentMap.entries())
    .map(([equipmentId, count]) => ({ equipmentId, count }))
    .sort((a, b) => b.count - a.count || a.equipmentId.localeCompare(b.equipmentId))
    .slice(0, 5)

  return {
    totalEvents,
    eventsWithEquipment,
    eventsWithoutEquipment: totalEvents - eventsWithEquipment,
    equipmentCoverage: totalEvents > 0 ? Math.round((eventsWithEquipment / totalEvents) * 100) : 0,
    uniqueEquipmentIds: equipmentMap.size,
    topEquipmentByEvents,
  }
}
