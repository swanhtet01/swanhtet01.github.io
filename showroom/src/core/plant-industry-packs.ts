export type PlantIndustryPackId =
  | 'general-manufacturing'
  | 'batch-process'
  | 'food-beverage'
  | 'apparel'
  | 'assembly'

export type PlantIndustryPack = {
  id: PlantIndustryPackId
  name: string
  description: string
  firstWorkflow: string
  capabilities: readonly string[]
  setup: {
    outputPrefix: string
    materialId: string
    materialName: string
    materialUnit: 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | 'bag' | 'roll' | 'sheet' | 'm' | 'cm'
    workCentrePrefix: string
    workCentreName: string
  }
}

export type ManagedPlantStarterPlan = {
  jobId: string
  line: string
  product: string
  target: string
  machineId: string
  machineName: string
}

// Every outputPrefix MUST begin with BATCH. plant-order-foundation.ts validates outputBatchId
// with identifier(..., 'BATCH') in four places -- the execution plan, recording output,
// inspection, and batch release -- so a prefix like STYLE or LOT is rejected before a batch
// can even be planned.
//
// Four of the five packs shipped prefixes the contract refuses (LOT, FOOD-LOT, STYLE, BUILD),
// which meant only general-manufacturing could run a controlled batch at all. The industry
// wording is kept as a second segment -- BATCH-STYLE-001 reads as well as STYLE-001 and
// actually validates.
export const plantIndustryPacks: readonly PlantIndustryPack[] = [
  {
    id: 'general-manufacturing',
    name: 'General manufacturing',
    description: 'Jobs, material issue, routing, output, quality and cost evidence.',
    firstWorkflow: 'Plan and run one controlled order',
    capabilities: ['BOM', 'Routing', 'Capacity', 'Quality', 'Costing'],
    setup: { outputPrefix: 'BATCH', materialId: 'MAT-PRIMARY-001', materialName: 'Primary material', materialUnit: 'pcs', workCentrePrefix: 'WC-LINE', workCentreName: 'Production line' },
  },
  {
    id: 'batch-process',
    name: 'Batch and process',
    description: 'Batch inputs, process routing, yield, holds and release evidence.',
    firstWorkflow: 'Make and release one controlled batch',
    capabilities: ['Batch inputs', 'Routing', 'Yield', 'Quality hold', 'Genealogy'],
    setup: { outputPrefix: 'BATCH-LOT', materialId: 'MAT-BATCH-INPUT-001', materialName: 'Primary batch input', materialUnit: 'kg', workCentrePrefix: 'WC-PROCESS', workCentreName: 'Process line' },
  },
  {
    id: 'food-beverage',
    name: 'Food and beverage',
    description: 'Ingredient lots, process steps, inspection and released batch trace.',
    firstWorkflow: 'Make, inspect and release one food batch',
    capabilities: ['Ingredient lots', 'Batch routing', 'Inspection', 'Release', 'Traceability'],
    setup: { outputPrefix: 'BATCH-FOOD', materialId: 'MAT-INGREDIENT-001', materialName: 'Primary ingredient', materialUnit: 'kg', workCentrePrefix: 'WC-KITCHEN', workCentreName: 'Batch kitchen' },
  },
  {
    id: 'apparel',
    name: 'Apparel',
    description: 'Style orders, fabric issue, cut-and-sew routing and quality evidence.',
    firstWorkflow: 'Run one style order through production',
    capabilities: ['Style order', 'Fabric issue', 'Routing', 'WIP', 'Inspection'],
    setup: { outputPrefix: 'BATCH-STYLE', materialId: 'MAT-FABRIC-001', materialName: 'Primary fabric', materialUnit: 'm', workCentrePrefix: 'WC-SEW', workCentreName: 'Sewing line' },
  },
  {
    id: 'assembly',
    name: 'Assembly',
    description: 'Component issue, assembly routing, serial-ready inspection and release.',
    firstWorkflow: 'Build and inspect one assembly order',
    capabilities: ['Components', 'Assembly routing', 'Capacity', 'Inspection', 'Genealogy'],
    setup: { outputPrefix: 'BATCH-BUILD', materialId: 'MAT-COMPONENT-001', materialName: 'Primary component', materialUnit: 'pcs', workCentrePrefix: 'WC-ASSEMBLY', workCentreName: 'Assembly cell' },
  },
] as const

export function plantIndustryPack(id: PlantIndustryPackId | string) {
  const pack = plantIndustryPacks.find((candidate) => candidate.id === id)
  if (!pack) throw new Error('Choose a supported Plant industry pack.')
  return pack
}

export const PLANT_INDUSTRY_PACK_STORAGE_KEY = 'supermega.plant.industry-pack.v1'

export function readPlantIndustryPackId(storage?: Pick<Storage, 'getItem'>): PlantIndustryPackId {
  try {
    const retained = storage?.getItem(PLANT_INDUSTRY_PACK_STORAGE_KEY) ?? ''
    return plantIndustryPack(retained).id
  } catch {
    return 'general-manufacturing'
  }
}

export function savePlantIndustryPackId(id: PlantIndustryPackId, storage?: Pick<Storage, 'setItem'>) {
  const accepted = plantIndustryPack(id).id
  try {
    storage?.setItem(PLANT_INDUSTRY_PACK_STORAGE_KEY, accepted)
  } catch {
    // A blocked browser storage policy must not prevent a local demo from opening.
  }
  return accepted
}

export function plantIndustryPackManagedPlanPath(id: PlantIndustryPackId) {
  return `/plant/?pack=${encodeURIComponent(plantIndustryPack(id).id)}`
}

export function plantIndustryPackIdFromSearch(search: string): PlantIndustryPackId | null {
  const requested = new URLSearchParams(search).get('pack')
  if (!requested) return null
  try {
    return plantIndustryPack(requested).id
  } catch {
    return null
  }
}

export function managedPlantStarterPlan(id: PlantIndustryPackId): ManagedPlantStarterPlan {
  const pack = plantIndustryPack(id)
  const planByPack: Record<PlantIndustryPackId, Pick<ManagedPlantStarterPlan, 'jobId' | 'product'>> = {
    'general-manufacturing': { jobId: 'JOB-GENERAL-001', product: 'First production order' },
    'batch-process': { jobId: 'JOB-BATCH-001', product: 'First controlled batch' },
    'food-beverage': { jobId: 'JOB-FOOD-001', product: 'First food batch' },
    apparel: { jobId: 'JOB-APPAREL-001', product: 'First style order' },
    assembly: { jobId: 'JOB-ASSEMBLY-001', product: 'First assembly order' },
  }
  return {
    ...planByPack[id],
    line: pack.setup.workCentreName,
    target: '1',
    machineId: `${pack.setup.workCentrePrefix}-01`,
    machineName: `${pack.setup.workCentreName} 01`,
  }
}

function canonicalIdSegment(value: string) {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || '01'
}

export function plantIndustryPackSetup(id: PlantIndustryPackId, job?: { id: string; line: string }) {
  const pack = plantIndustryPack(id)
  const jobSegment = canonicalIdSegment(job?.id.replace(/^JOB-/, '') ?? '001')
  const lineSegment = canonicalIdSegment(job?.line ?? '01')
  return {
    jobId: job?.id ?? '',
    outputBatchId: `${pack.setup.outputPrefix}-${jobSegment}`,
    materialId: pack.setup.materialId,
    materialName: pack.setup.materialName,
    materialUnit: pack.setup.materialUnit,
    quantityPerUnit: '1',
    standardCostPerUnitMmk: '',
    shopSku: '',
    materialQuantityPerStockUnit: '',
    additionalMaterials: '',
    workCentreId: `${pack.setup.workCentrePrefix}-${lineSegment}`.slice(0, 80),
    workCentreName: job?.line || pack.setup.workCentreName,
    minutesPerUnit: '1',
    standardCostPerMinuteMmk: '',
    additionalOperations: '',
  }
}
