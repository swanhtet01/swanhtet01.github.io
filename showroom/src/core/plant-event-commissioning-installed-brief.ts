import type { ProductionState } from './production-workspace.ts'

export type PlantEventCommissioningInstalledBrief = {
  totalCommissioningEvents: number
  eventsWithInstalledAt: number
  installedAtPresenceRate: number
  earliestInstalledAt: string | null
  latestInstalledAt: string | null
  uniqueCommissionedEquipment: number
  topCommissionedEquipmentByCount: Array<{ subjectId: string; count: number }>
}

export function projectPlantEventCommissioningInstalledBrief(
  production: ProductionState,
): PlantEventCommissioningInstalledBrief {
  let totalCommissioningEvents = 0
  let eventsWithInstalledAt = 0
  let earliestInstalledAt: string | null = null
  let latestInstalledAt: string | null = null
  const subjectMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'equipment_commissioned') continue
    totalCommissioningEvents++

    if (event.installedAt !== undefined) {
      eventsWithInstalledAt++
      if (earliestInstalledAt === null || event.installedAt < earliestInstalledAt)
        earliestInstalledAt = event.installedAt
      if (latestInstalledAt === null || event.installedAt > latestInstalledAt)
        latestInstalledAt = event.installedAt
    }

    subjectMap.set(event.subjectId, (subjectMap.get(event.subjectId) ?? 0) + 1)
  }

  const topCommissionedEquipmentByCount = Array.from(subjectMap.entries())
    .map(([subjectId, count]) => ({ subjectId, count }))
    .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId))
    .slice(0, 5)

  return {
    totalCommissioningEvents,
    eventsWithInstalledAt,
    installedAtPresenceRate:
      totalCommissioningEvents > 0
        ? Math.round((eventsWithInstalledAt / totalCommissioningEvents) * 100)
        : 0,
    earliestInstalledAt,
    latestInstalledAt,
    uniqueCommissionedEquipment: subjectMap.size,
    topCommissionedEquipmentByCount,
  }
}
