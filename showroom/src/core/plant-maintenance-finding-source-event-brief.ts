import type { ProductionState } from './production-workspace.ts'

export type PlantMaintenanceFindingSourceEventBrief = {
  totalIssueOpenedEvents: number
  eventsWithFindingSource: number
  eventsWithoutFindingSource: number
  findingSourceCoverage: number
  uniqueEquipmentIds: number
  byReturnToService: {
    restricted: number
    notRecommended: number
  }
  topEquipmentIds: Array<{ equipmentId: string; issueCount: number }>
}

export function projectPlantMaintenanceFindingSourceEventBrief(production: ProductionState): PlantMaintenanceFindingSourceEventBrief {
  let totalIssueOpenedEvents = 0
  let eventsWithFindingSource = 0
  const byReturnToService = { restricted: 0, notRecommended: 0 }
  const equipmentMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'issue_opened') continue
    totalIssueOpenedEvents++
    if (event.maintenanceFindingSource !== undefined) {
      eventsWithFindingSource++
      if (event.maintenanceFindingSource.returnToService === 'restricted') byReturnToService.restricted++
      else if (event.maintenanceFindingSource.returnToService === 'not_recommended') byReturnToService.notRecommended++
      const eqId = event.maintenanceFindingSource.equipmentId
      equipmentMap.set(eqId, (equipmentMap.get(eqId) ?? 0) + 1)
    }
  }

  const topEquipmentIds = Array.from(equipmentMap.entries())
    .map(([equipmentId, issueCount]) => ({ equipmentId, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount || a.equipmentId.localeCompare(b.equipmentId))
    .slice(0, 5)

  return {
    totalIssueOpenedEvents,
    eventsWithFindingSource,
    eventsWithoutFindingSource: totalIssueOpenedEvents - eventsWithFindingSource,
    findingSourceCoverage: totalIssueOpenedEvents > 0 ? Math.round((eventsWithFindingSource / totalIssueOpenedEvents) * 100) : 0,
    uniqueEquipmentIds: equipmentMap.size,
    byReturnToService,
    topEquipmentIds,
  }
}
