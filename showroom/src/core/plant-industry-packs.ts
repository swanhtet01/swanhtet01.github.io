export type PlantIndustryPackId =
  | 'general-manufacturing'
  | 'batch-process'
  | 'food-beverage'
  | 'apparel'
  | 'assembly'

// The sample floor a client is shown has to be their floor. A sewing room with a
// mixer and a press on it, reporting temperature drift, reads as somebody else's
// factory, so the equipment and the opening issue travel with the pack.
export type PlantPackMachine = {
  id: string
  name: string
  state: 'running' | 'attention' | 'stopped'
}

export type PlantPackIssue = {
  area: string
  summary: string
}

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
    machines: readonly PlantPackMachine[]
    issue: PlantPackIssue
  }
}

export const plantIndustryPacks: readonly PlantIndustryPack[] = [
  {
    id: 'general-manufacturing',
    name: 'General manufacturing',
    description: 'Jobs, material issue, routing, output, quality and cost evidence.',
    firstWorkflow: 'Plan and run one controlled order',
    capabilities: ['BOM', 'Routing', 'Capacity', 'Quality', 'Costing'],
    setup: {
      outputPrefix: 'BATCH', materialId: 'MAT-PRIMARY-001', materialName: 'Primary material', materialUnit: 'pcs',
      workCentrePrefix: 'WC-LINE', workCentreName: 'Production line',
      machines: [
        { id: 'MC-01', name: 'Production line 01', state: 'running' },
        { id: 'MC-02', name: 'Production line 02', state: 'attention' },
        { id: 'MC-03', name: 'Finishing 01', state: 'running' },
      ],
      issue: { area: 'Production line 02', summary: 'Output rate below plan requires supervisor review' },
    },
  },
  {
    id: 'batch-process',
    name: 'Batch and process',
    description: 'Batch inputs, process routing, yield, holds and release evidence.',
    firstWorkflow: 'Make and release one controlled batch',
    capabilities: ['Batch inputs', 'Routing', 'Yield', 'Quality hold', 'Genealogy'],
    setup: {
      outputPrefix: 'LOT', materialId: 'MAT-BATCH-INPUT-001', materialName: 'Primary batch input', materialUnit: 'kg',
      workCentrePrefix: 'WC-PROCESS', workCentreName: 'Process line',
      machines: [
        { id: 'MC-01', name: 'Mixer 01', state: 'running' },
        { id: 'MC-02', name: 'Reactor 02', state: 'attention' },
        { id: 'MC-03', name: 'Filling line 01', state: 'running' },
      ],
      issue: { area: 'Reactor 02', summary: 'Temperature drift requires supervisor review' },
    },
  },
  {
    id: 'food-beverage',
    name: 'Food and beverage',
    description: 'Ingredient lots, process steps, inspection and released batch trace.',
    firstWorkflow: 'Make, inspect and release one food batch',
    capabilities: ['Ingredient lots', 'Batch routing', 'Inspection', 'Release', 'Traceability'],
    setup: {
      outputPrefix: 'FOOD-LOT', materialId: 'MAT-INGREDIENT-001', materialName: 'Primary ingredient', materialUnit: 'kg',
      workCentrePrefix: 'WC-KITCHEN', workCentreName: 'Batch kitchen',
      machines: [
        { id: 'MC-01', name: 'Batch kettle 01', state: 'running' },
        { id: 'MC-02', name: 'Filling line 02', state: 'attention' },
        { id: 'MC-03', name: 'Packing line 01', state: 'running' },
      ],
      issue: { area: 'Filling line 02', summary: 'Fill weight drift requires supervisor review' },
    },
  },
  {
    id: 'apparel',
    name: 'Apparel',
    description: 'Style orders, fabric issue, cut-and-sew routing and quality evidence.',
    firstWorkflow: 'Run one style order through production',
    capabilities: ['Style order', 'Fabric issue', 'Routing', 'WIP', 'Inspection'],
    setup: {
      outputPrefix: 'STYLE', materialId: 'MAT-FABRIC-001', materialName: 'Primary fabric', materialUnit: 'm',
      workCentrePrefix: 'WC-SEW', workCentreName: 'Sewing line',
      machines: [
        { id: 'MC-01', name: 'Cutting table 01', state: 'running' },
        { id: 'MC-02', name: 'Sewing line 02', state: 'attention' },
        { id: 'MC-03', name: 'Finishing and press 01', state: 'running' },
      ],
      issue: { area: 'Sewing line 02', summary: 'Seam strength below specification requires supervisor review' },
    },
  },
  {
    id: 'assembly',
    name: 'Assembly',
    description: 'Component issue, assembly routing, serial-ready inspection and release.',
    firstWorkflow: 'Build and inspect one assembly order',
    capabilities: ['Components', 'Assembly routing', 'Capacity', 'Inspection', 'Genealogy'],
    setup: {
      outputPrefix: 'BUILD', materialId: 'MAT-COMPONENT-001', materialName: 'Primary component', materialUnit: 'pcs',
      workCentrePrefix: 'WC-ASSEMBLY', workCentreName: 'Assembly cell',
      machines: [
        { id: 'MC-01', name: 'Assembly cell 01', state: 'running' },
        { id: 'MC-02', name: 'Assembly cell 02', state: 'attention' },
        { id: 'MC-03', name: 'Test bench 01', state: 'running' },
      ],
      issue: { area: 'Assembly cell 02', summary: 'Torque check out of tolerance requires supervisor review' },
    },
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
