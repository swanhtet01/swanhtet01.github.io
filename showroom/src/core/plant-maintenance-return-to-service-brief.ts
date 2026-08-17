import type { ProductionState } from './production-workspace.ts'

export type PlantMaintenanceReturnToServiceBrief = {
  totalCompletedEvents: number
  eventsWithReturnToService: number
  eventsWithoutReturnToService: number
  returnToServiceCoverage: number
  byReturnToService: {
    recommended: number
    restricted: number
    notRecommended: number
  }
  restrictedOrNotRecommendedRate: number
}

export function projectPlantMaintenanceReturnToServiceBrief(production: ProductionState): PlantMaintenanceReturnToServiceBrief {
  let totalCompletedEvents = 0
  let eventsWithReturnToService = 0
  const byReturnToService = { recommended: 0, restricted: 0, notRecommended: 0 }

  for (const event of production.events) {
    if (event.kind !== 'maintenance_completed') continue
    totalCompletedEvents++
    if (event.maintenanceReturnToService !== undefined) {
      eventsWithReturnToService++
      if (event.maintenanceReturnToService === 'recommended') byReturnToService.recommended++
      else if (event.maintenanceReturnToService === 'restricted') byReturnToService.restricted++
      else if (event.maintenanceReturnToService === 'not_recommended') byReturnToService.notRecommended++
    }
  }

  const atRisk = byReturnToService.restricted + byReturnToService.notRecommended

  return {
    totalCompletedEvents,
    eventsWithReturnToService,
    eventsWithoutReturnToService: totalCompletedEvents - eventsWithReturnToService,
    returnToServiceCoverage: totalCompletedEvents > 0 ? Math.round((eventsWithReturnToService / totalCompletedEvents) * 100) : 0,
    byReturnToService,
    restrictedOrNotRecommendedRate: eventsWithReturnToService > 0 ? Math.round((atRisk / eventsWithReturnToService) * 100) : 0,
  }
}
