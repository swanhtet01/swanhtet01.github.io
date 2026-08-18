import type { ProductionJob, ProductionJobPriority, ProductionMachine, ProductionMaterialUnit } from '../../core/production-workspace.ts'
import { productionJobPriorities, productionMachineStates, productionMaterialUnits } from '../../core/production-workspace.ts'
import type { PlantIndustryPackId } from '../../core/plant-industry-packs.ts'
import type { PlantOrderMaterial, PlantOrderRoutingDraft, PlantOrderWorkCentre } from '../../core/plant-order-foundation.ts'
import { shopBusinessTemplate, type ShopBusinessTemplateId } from '../shop/business-templates.ts'

export const PLANT_BUSINESS_TEMPLATE_SCHEMA = 'supermega.plant.business_template.v1' as const

// Subset of ShopBusinessTemplateId -- only a trade whose Plant template has actually shipped
// gets an id here. See hq/strategy/TEMPLATE-EXPANSION.md section (d) for which of Shop's ten
// trades genuinely convert inputs into a countable batch, and why the other eight do not.
export type PlantBusinessTemplateId = 'bakery'

export type PlantBusinessTemplateJob = {
  jobCode: string
  line: string
  // MUST equal a Shop catalog item name from the paired Shop template byte-for-byte --
  // shop-production-demand.ts's jobMatchesProduct links a Shop SKU to a Plant job by exact
  // string equality (case-insensitively on the name, or uppercased on the SKU). Enforced by
  // validatePlantBusinessTemplates below, not just this comment.
  product: string
  shopSku: string
  target: number
  // Materialized against the provisioning instant, never a literal date -- see
  // plantBusinessTemplateJobs.
  dueInDays: number
  priority: ProductionJobPriority
}

// BOM + work centres + routing for jobs[0]. installProductionWorkingSampleJobs itself still
// writes no orderPortfolio/orderExecution -- the plan below is applied separately, as its own
// chain of order-execution commands, by provisionLocalPlantWorkingSample
// (product-onboarding-runtime.ts), after queue item 7 widened isGuidedSampleProduction
// (production-workspace.ts) to accept a populated orderPortfolio whose every command proof
// carries the guided-sample action prefix. See TEMPLATE-EXPANSION.md queue item 8.
export type PlantBusinessTemplatePlan = {
  outputBatchSuffix: string
  materials: readonly PlantOrderMaterial[]
  workCentres: readonly PlantOrderWorkCentre[]
  routing: readonly PlantOrderRoutingDraft[]
}

export type PlantBusinessTemplate = {
  id: PlantBusinessTemplateId
  schema: typeof PLANT_BUSINESS_TEMPLATE_SCHEMA
  name: { en: string; my: string }
  description: string
  // The Shop trade this production line belongs to -- how a device's Plant template is selected.
  // See plantBusinessTemplateForShopTemplateId.
  shopTemplateId: ShopBusinessTemplateId
  // Existing pack (plant-industry-packs.ts); supplies the BATCH- output prefix a later plan
  // would use. Every prefix there already begins with BATCH per the contract documented at
  // plant-industry-packs.ts:24-32.
  industryPackId: PlantIndustryPackId
  machines: readonly ProductionMachine[]
  openingIssue: { area: string; summary: string }
  jobs: readonly PlantBusinessTemplateJob[]
  // The trade's real primary input, named for the guided shift-activity seeder
  // (appendGuidedSampleProductionActivity, production-workspace.ts) -- distinct from the BOM
  // material list `plan.materials` would carry. It only needs a name and a unit, not a full
  // PlantOrderMaterial, so it does not require the deferred plan above.
  primaryMaterial: { ref: string; unit: ProductionMaterialUnit }
  plan?: PlantBusinessTemplatePlan
}

const plantBusinessTemplateSeeds: readonly PlantBusinessTemplate[] = [
  {
    id: 'bakery',
    schema: PLANT_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Bakery production floor', my: 'မုန့်ဖုတ်စက်ရုံ' },
    description: 'Two bakery lines turning flour and dairy into loaves and cakes, on the same trade as the bakery Shop catalog.',
    shopTemplateId: 'bakery',
    industryPackId: 'food-beverage',
    machines: [
      { id: 'MC-BAKE-01', name: 'Deck oven 01', state: 'running' },
      { id: 'MC-BAKE-02', name: 'Dough mixer 01', state: 'running' },
      { id: 'MC-BAKE-03', name: 'Proofing cabinet 01', state: 'attention' },
    ],
    openingIssue: {
      area: 'Bakery Line 02',
      summary: 'Proofing cabinet running warm -- watch dough rise times before the next bake',
    },
    // The bakery's real primary ingredient -- flour, by mass. Feeds appendGuidedSampleProductionActivity's
    // material-issue entry; no BOM exists yet to draw this from (see PlantBusinessTemplatePlan above).
    primaryMaterial: { ref: 'Bread flour', unit: 'kg' },
    jobs: [
      // product/shopSku pair with shopBusinessTemplates 'bakery' catalog (BREAD-WHITE), so a
      // low-stock or over-committed loaf in Shop already surfaces this job via
      // shop-production-demand.ts's jobMatchesProduct, with no code change.
      { jobCode: 'JOB-BAKE-001', line: 'Bakery Line 01', product: 'White sandwich loaf', shopSku: 'BREAD-WHITE', target: 480, dueInDays: 2, priority: 'urgent' },
      // Same pairing against CAKE-BIRTHDAY-1KG.
      { jobCode: 'JOB-BAKE-002', line: 'Bakery Line 02', product: 'Birthday cake 1kg', shopSku: 'CAKE-BIRTHDAY-1KG', target: 12, dueInDays: 4, priority: 'normal' },
    ],
    // BOM + routing for jobs[0] (JOB-BAKE-001, the white sandwich loaf). Five real bakery
    // ingredients by mass/volume per loaf, and four operations across three work centres --
    // mixing, proofing, and a shared baking/packing centre. Every material and routing step
    // carries a standard MMK cost so the cost-driver and financial-cost projections
    // (plant-order-foundation.ts) have something to report the moment the order is released.
    // shopSupply is deliberately left unset on every material: the bakery Shop catalog stocks
    // finished goods (bread, cakes), not raw ingredients, so there is no real Shop SKU a
    // flour/water/yeast/salt/butter line could map onto -- see TEMPLATE-EXPANSION.md section (b).
    plan: {
      outputBatchSuffix: 'BAKE-001',
      materials: [
        { materialId: 'MAT-BUTTER', name: 'Butter', unit: 'g', quantityPerUnitMilli: 15_000, standardCostPerUnitMmk: 12 },
        { materialId: 'MAT-FLOUR', name: 'Bread flour', unit: 'kg', quantityPerUnitMilli: 380, standardCostPerUnitMmk: 2_800 },
        { materialId: 'MAT-SALT', name: 'Salt', unit: 'g', quantityPerUnitMilli: 7_000, standardCostPerUnitMmk: 3 },
        { materialId: 'MAT-WATER', name: 'Water', unit: 'l', quantityPerUnitMilli: 230, standardCostPerUnitMmk: 5 },
        { materialId: 'MAT-YEAST', name: 'Instant yeast', unit: 'g', quantityPerUnitMilli: 6_000, standardCostPerUnitMmk: 25 },
      ],
      workCentres: [
        { workCentreId: 'WC-BAKE', name: 'Baking and packing' },
        { workCentreId: 'WC-MIX', name: 'Mixing' },
        { workCentreId: 'WC-PROOF', name: 'Proofing' },
      ],
      routing: [
        { operationId: 'OP-010', name: 'Mix dough', workCentreId: 'WC-MIX', workCentreName: 'Mixing', minutesPerUnitMilli: 1_500, standardCostPerMinuteMmk: 150 },
        { operationId: 'OP-020', name: 'Proof dough', workCentreId: 'WC-PROOF', workCentreName: 'Proofing', minutesPerUnitMilli: 3_000, standardCostPerMinuteMmk: 80 },
        { operationId: 'OP-030', name: 'Bake loaves', workCentreId: 'WC-BAKE', workCentreName: 'Baking and packing', minutesPerUnitMilli: 4_000, standardCostPerMinuteMmk: 200 },
        { operationId: 'OP-040', name: 'Cool and pack', workCentreId: 'WC-BAKE', workCentreName: 'Baking and packing', minutesPerUnitMilli: 1_000, standardCostPerMinuteMmk: 100 },
      ],
    },
  },
] as const

export const plantBusinessTemplates: readonly PlantBusinessTemplate[] = plantBusinessTemplateSeeds

export function plantBusinessTemplate(id: PlantBusinessTemplateId) {
  const template = plantBusinessTemplates.find((candidate) => candidate.id === id)
  if (!template) throw new Error('Choose a supported Plant business template.')
  return template
}

/**
 * The Plant template paired with a given Shop trade, or null if that trade has no Plant
 * template (which is most of them -- see TEMPLATE-EXPANSION.md section (d)) or no trade was
 * given at all. Never guesses: a caller with an unrecognised or absent Shop trade must fall
 * back to its own default rather than receive a wrong pairing.
 */
export function plantBusinessTemplateForShopTemplateId(
  shopTemplateId: ShopBusinessTemplateId | string | null | undefined,
): PlantBusinessTemplate | null {
  if (!shopTemplateId) return null
  return plantBusinessTemplates.find((template) => template.shopTemplateId === shopTemplateId) ?? null
}

/**
 * Materializes a template's jobs into installable ProductionJob records: dueInDays becomes an
 * absolute dueAt relative to capturedAt (never a literal date baked into the seed), and every
 * job carries the same owner installProductionWorkingSampleJobs' caller already uses for the
 * generic pack path.
 */
export function plantBusinessTemplateJobs(template: PlantBusinessTemplate, capturedAt: string, owner: string): ProductionJob[] {
  const captured = Date.parse(capturedAt)
  if (!Number.isFinite(captured)) throw new Error('plantBusinessTemplateJobs needs a valid capturedAt.')
  const trimmedOwner = owner.trim()
  return template.jobs.map((job) => ({
    id: job.jobCode,
    line: job.line,
    product: job.product,
    target: job.target,
    output: 0,
    owner: trimmedOwner,
    priority: job.priority,
    dueAt: new Date(captured + job.dueInDays * 24 * 60 * 60 * 1000).toISOString(),
  }))
}

export function validatePlantBusinessTemplates() {
  const templateIds = new Set<string>()
  for (const template of plantBusinessTemplates) {
    if (template.schema !== PLANT_BUSINESS_TEMPLATE_SCHEMA) throw new Error(`${template.id} uses an unsupported schema.`)
    if (templateIds.has(template.id)) throw new Error(`Duplicate Plant business template ${template.id}.`)
    templateIds.add(template.id)
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(template.id)) throw new Error(`${template.id} is not a canonical template id.`)
    if (!template.name.en.trim() || !template.name.my.trim()) throw new Error(`${template.id} needs both English and Myanmar display names.`)
    if (!template.description.trim()) throw new Error(`${template.id} needs a description.`)

    const shopTemplate = shopBusinessTemplate(template.shopTemplateId)

    if (template.jobs.length !== 2) throw new Error(`${template.id} must stage exactly 2 starter jobs.`)
    const jobCodes = new Set<string>()
    const lines = new Set<string>()
    for (const job of template.jobs) {
      if (jobCodes.has(job.jobCode)) throw new Error(`${template.id} repeats job code ${job.jobCode}.`)
      jobCodes.add(job.jobCode)
      if (!/^[A-Z][A-Z0-9-]{2,79}$/.test(job.jobCode)) throw new Error(`${template.id} job ${job.jobCode} is not a canonical job code.`)
      if (!job.line.trim()) throw new Error(`${template.id} job ${job.jobCode} needs a line.`)
      lines.add(job.line)
      if (!Number.isSafeInteger(job.target) || job.target < 1) throw new Error(`${template.id} job ${job.jobCode} needs a positive whole target.`)
      if (!Number.isSafeInteger(job.dueInDays) || job.dueInDays < 1) throw new Error(`${template.id} job ${job.jobCode} needs a due date at least one day out.`)
      if (!productionJobPriorities.includes(job.priority)) throw new Error(`${template.id} job ${job.jobCode} priority is invalid.`)
      // The cross-product binding: job.product must be a verbatim copy of a Shop catalog item
      // name from the paired Shop template, and shopSku must be that item's real SKU -- see the
      // comment on PlantBusinessTemplateJob.product above.
      const catalogItem = shopTemplate.catalog.find((item) => item.sku === job.shopSku)
      if (!catalogItem) throw new Error(`${template.id} job ${job.jobCode} shopSku ${job.shopSku} is not in the ${template.shopTemplateId} Shop catalog.`)
      if (catalogItem.name !== job.product) throw new Error(`${template.id} job ${job.jobCode} product must equal Shop item ${job.shopSku}'s catalog name exactly.`)
    }
    if (lines.size !== template.jobs.length) throw new Error(`${template.id} jobs must run on distinct lines.`)

    if (template.machines.length !== 3) throw new Error(`${template.id} must stage exactly 3 machines.`)
    const machineIds = new Set<string>()
    let attentionCount = 0
    for (const machine of template.machines) {
      if (machineIds.has(machine.id)) throw new Error(`${template.id} repeats machine ${machine.id}.`)
      machineIds.add(machine.id)
      if (!machine.name.trim()) throw new Error(`${template.id} machine ${machine.id} needs a name.`)
      if (!productionMachineStates.includes(machine.state)) throw new Error(`${template.id} machine ${machine.id} state is invalid.`)
      if (machine.state === 'attention') attentionCount += 1
    }
    if (attentionCount !== 1) throw new Error(`${template.id} must stage exactly one machine in attention.`)

    if (!template.openingIssue.area.trim() || !template.openingIssue.summary.trim()) throw new Error(`${template.id} needs an opening issue in the trade's own words.`)
    if (template.openingIssue.summary.trim() === 'Temperature drift requires supervisor review') throw new Error(`${template.id} must replace the generic seed opening issue.`)

    const materialRef = template.primaryMaterial.ref.trim()
    if (!materialRef || materialRef.length > 120) throw new Error(`${template.id} needs a primary material reference of 1 to 120 characters.`)
    if (!productionMaterialUnits.includes(template.primaryMaterial.unit)) throw new Error(`${template.id} primary material unit is invalid.`)

    // The deferred BOM + routing plan for jobs[0] (TEMPLATE-EXPANSION.md queue item 8). Optional
    // at the type level -- validated here only when present, so a future template can still ship
    // jobs/floor without a plan the way this one did before item 8.
    if (template.plan) {
      const { outputBatchSuffix, materials, workCentres, routing } = template.plan
      if (!/^[A-Z][A-Z0-9-]{2,79}$/.test(outputBatchSuffix)) throw new Error(`${template.id} plan.outputBatchSuffix is not a canonical identifier segment.`)

      if (materials.length !== 5) throw new Error(`${template.id} plan must carry exactly 5 BOM materials.`)
      const materialIds = materials.map((material) => material.materialId)
      if (new Set(materialIds).size !== materialIds.length) throw new Error(`${template.id} plan repeats a BOM material id.`)
      if (materialIds.some((id, index) => index > 0 && id <= materialIds[index - 1])) throw new Error(`${template.id} plan.materials must be in canonical ascending id order.`)
      for (const material of materials) {
        if (!material.standardCostPerUnitMmk) throw new Error(`${template.id} plan material ${material.materialId} needs a standard MMK cost, or the financial-cost projection cannot report.`)
        if (material.shopSupply) throw new Error(`${template.id} plan material ${material.materialId} must not invent a Shop SKU the bakery catalog does not stock.`)
      }

      if (!workCentres.length) throw new Error(`${template.id} plan needs at least one work centre.`)
      const workCentreIds = workCentres.map((centre) => centre.workCentreId)
      if (new Set(workCentreIds).size !== workCentreIds.length) throw new Error(`${template.id} plan repeats a work-centre id.`)
      if (workCentreIds.some((id, index) => index > 0 && id <= workCentreIds[index - 1])) throw new Error(`${template.id} plan.workCentres must be in canonical ascending id order.`)

      if (routing.length !== 4) throw new Error(`${template.id} plan must carry exactly 4 routing operations.`)
      const workCentreIdSet = new Set(workCentreIds)
      const usedCentreIds = new Set<string>()
      for (const step of routing) {
        if (!workCentreIdSet.has(step.workCentreId)) throw new Error(`${template.id} plan routing step ${step.operationId} references an unknown work centre.`)
        if (!step.standardCostPerMinuteMmk) throw new Error(`${template.id} plan routing step ${step.operationId} needs a standard MMK cost, or the financial-cost projection cannot report.`)
        usedCentreIds.add(step.workCentreId)
      }
      if (usedCentreIds.size !== workCentreIds.length) throw new Error(`${template.id} plan declares a work centre no routing step uses.`)
    }
  }
  if (templateIds.size !== 1) throw new Error('The Plant business template registry must carry exactly 1 template.')
  return plantBusinessTemplates
}
