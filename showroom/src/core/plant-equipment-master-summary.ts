import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentMasterSummary = {
  loaded: boolean
  totalAssets: number
  commissionedAssets: number
  notCommissionedAssets: number
  byCriticality: { critical: number; high: number; medium: number; low: number }
  assetsWithMaintenanceStrategy: number
  uniqueWorkCentres: number
  uniqueOwners: number
}

export function projectPlantEquipmentMasterSummary(production: ProductionState): PlantEquipmentMasterSummary {
  const master = production.equipmentMaster

  if (master === undefined) {
    return {
      loaded: false,
      totalAssets: 0,
      commissionedAssets: 0,
      notCommissionedAssets: 0,
      byCriticality: { critical: 0, high: 0, medium: 0, low: 0 },
      assetsWithMaintenanceStrategy: 0,
      uniqueWorkCentres: 0,
      uniqueOwners: 0,
    }
  }

  const workCentreSet = new Set<string>()
  const ownerSet = new Set<string>()
  const byCriticality = { critical: 0, high: 0, medium: 0, low: 0 }
  let commissionedAssets = 0
  let notCommissionedAssets = 0
  let assetsWithMaintenanceStrategy = 0

  for (const asset of master.assets) {
    if (asset.commissioningStatus === 'commissioned') commissionedAssets++
    else notCommissionedAssets++
    byCriticality[asset.criticality]++
    if (asset.maintenanceStrategy !== undefined) assetsWithMaintenanceStrategy++
    workCentreSet.add(asset.workCentreId)
    ownerSet.add(asset.owner)
  }

  return {
    loaded: true,
    totalAssets: master.assets.length,
    commissionedAssets,
    notCommissionedAssets,
    byCriticality,
    assetsWithMaintenanceStrategy,
    uniqueWorkCentres: workCentreSet.size,
    uniqueOwners: ownerSet.size,
  }
}
