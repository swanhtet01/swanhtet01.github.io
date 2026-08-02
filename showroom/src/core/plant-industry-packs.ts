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
    setup: { outputPrefix: 'LOT', materialId: 'MAT-BATCH-INPUT-001', materialName: 'Primary batch input', materialUnit: 'kg', workCentrePrefix: 'WC-PROCESS', workCentreName: 'Process line' },
  },
  {
    id: 'food-beverage',
    name: 'Food and beverage',
    description: 'Ingredient lots, process steps, inspection and released batch trace.',
    firstWorkflow: 'Make, inspect and release one food batch',
    capabilities: ['Ingredient lots', 'Batch routing', 'Inspection', 'Release', 'Traceability'],
    setup: { outputPrefix: 'FOOD-LOT', materialId: 'MAT-INGREDIENT-001', materialName: 'Primary ingredient', materialUnit: 'kg', workCentrePrefix: 'WC-KITCHEN', workCentreName: 'Batch kitchen' },
  },
  {
    id: 'apparel',
    name: 'Apparel',
    description: 'Style orders, fabric issue, cut-and-sew routing and quality evidence.',
    firstWorkflow: 'Run one style order through production',
    capabilities: ['Style order', 'Fabric issue', 'Routing', 'WIP', 'Inspection'],
    setup: { outputPrefix: 'STYLE', materialId: 'MAT-FABRIC-001', materialName: 'Primary fabric', materialUnit: 'm', workCentrePrefix: 'WC-SEW', workCentreName: 'Sewing line' },
  },
  {
    id: 'assembly',
    name: 'Assembly',
    description: 'Component issue, assembly routing, serial-ready inspection and release.',
    firstWorkflow: 'Build and inspect one assembly order',
    capabilities: ['Components', 'Assembly routing', 'Capacity', 'Inspection', 'Genealogy'],
    setup: { outputPrefix: 'BUILD', materialId: 'MAT-COMPONENT-001', materialName: 'Primary component', materialUnit: 'pcs', workCentrePrefix: 'WC-ASSEMBLY', workCentreName: 'Assembly cell' },
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
