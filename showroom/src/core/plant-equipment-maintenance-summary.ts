import type { ProductionState } from './production-workspace.ts'

export type WorkCentreMaintenanceRecord = {
  workCentreId: string
  totalAssets: number
  overdueCount: number
}

export type PlantEquipmentMaintenanceSummary = {
  totalAssets: number
  commissionedAssets: number
  withMaintenanceStrategy: number
  overdueCount: number
  dueSoonCount: number
  onTrackCount: number
  criticalOverdueCount: number
  byWorkCentre: WorkCentreMaintenanceRecord[]
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function projectPlantEquipmentMaintenanceSummary(
  production: ProductionState,
  asOf: string,
): PlantEquipmentMaintenanceSummary {
  const today = asOf.slice(0, 10)
  const dueSoonCutoff = addDays(today, 7)

  const assets = production.equipmentMaster?.assets ?? []
  const wcMap = new Map<string, { totalAssets: number; overdueCount: number }>()

  let commissionedAssets = 0
  let withMaintenanceStrategy = 0
  let overdueCount = 0
  let dueSoonCount = 0
  let onTrackCount = 0
  let criticalOverdueCount = 0

  for (const asset of assets) {
    if (asset.commissioningStatus === 'commissioned') commissionedAssets++
    const wc = wcMap.get(asset.workCentreId) ?? { totalAssets: 0, overdueCount: 0 }
    wc.totalAssets++
    wcMap.set(asset.workCentreId, wc)
    if (!asset.maintenanceStrategy) continue
    withMaintenanceStrategy++
    const nextDue = asset.maintenanceStrategy.nextDueAt.slice(0, 10)
    if (nextDue < today) {
      overdueCount++
      wc.overdueCount++
      if (asset.criticality === 'critical') criticalOverdueCount++
    } else if (nextDue <= dueSoonCutoff) {
      dueSoonCount++
    } else {
      onTrackCount++
    }
  }

  const byWorkCentre = Array.from(wcMap.entries())
    .map(([workCentreId, v]) => ({ workCentreId, ...v }))
    .sort((a, b) => b.overdueCount - a.overdueCount || a.workCentreId.localeCompare(b.workCentreId))

  return {
    totalAssets: assets.length,
    commissionedAssets,
    withMaintenanceStrategy,
    overdueCount,
    dueSoonCount,
    onTrackCount,
    criticalOverdueCount,
    byWorkCentre,
  }
}
