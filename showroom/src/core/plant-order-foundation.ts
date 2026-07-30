export const PLANT_ORDER_STATE_SCHEMA = 'supermega.plant.order_foundation.v1' as const
export const PLANT_ORDER_PLAN_CONTRACT = 'supermega.plant.reviewed_plan.v1' as const
export const PLANT_ORDER_EXECUTION_PLAN_CONTRACT = 'supermega.plant.reviewed_plan.v2' as const
export const PLANT_ORDER_CONTROLLED_PLAN_CONTRACT = 'supermega.plant.reviewed_plan.v3' as const
export const PLANT_ORDER_PROJECTION_CONTRACT = 'supermega.plant.order_projection.v1' as const
export const PLANT_ORDER_EFFECTIVENESS_CONTRACT = 'supermega.plant.order_effectiveness.v2' as const
export const PLANT_ORDER_COST_DRIVER_CONTRACT = 'supermega.plant.cost_driver_variance.v1' as const
export const PLANT_ORDER_FINANCIAL_COST_CONTRACT = 'supermega.plant.financial_job_cost.v1' as const
export const PLANT_ORDER_COST_REVIEW_PACKET_CONTRACT = 'supermega.plant.cost_review_packet.v1' as const
export const PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT = 'supermega.plant.material-substitution-approval.v1' as const
export const EMPTY_PLANT_ORDER_DIGEST = `sha256:${'0'.repeat(64)}`
export const PLANT_ORDER_STORAGE_PREFIX = 'supermega.plant.order-foundation.v1:'
export const PLANT_ORDER_WORKSPACE_UPDATED_EVENT = 'supermega:plant-order-workspace-updated'
export const PLANT_ORDER_ADDITIONAL_MATERIAL_MAX = 11
export const PLANT_ORDER_ADDITIONAL_OPERATION_MAX = 11

export type PlantOrderProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type PlantOrderMaterial = {
  materialId: string
  name: string
  unit: 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | 'bag' | 'roll' | 'sheet' | 'm' | 'cm'
  quantityPerUnitMilli: number
  standardCostPerUnitMmk?: number
}

export type PlantOrderWorkCentre = { workCentreId: string; name: string }
export type PlantOrderRoutingStep = {
  operationId: string
  sequence: number
  name: string
  workCentreId: string
  minutesPerUnitMilli: number
  standardCostPerMinuteMmk?: number
}

export type PlantOrderRoutingDraft = Omit<PlantOrderRoutingStep, 'sequence'> & { workCentreName: string }

export type PlantOrderPlan = {
  contract: typeof PLANT_ORDER_PLAN_CONTRACT | typeof PLANT_ORDER_EXECUTION_PLAN_CONTRACT | typeof PLANT_ORDER_CONTROLLED_PLAN_CONTRACT
  planId: string
  sourceDigest: string
  job: { jobId: string; product: string; targetQuantity: number; outputBatchId: string }
  materials: PlantOrderMaterial[]
  workCentres: PlantOrderWorkCentre[]
  routing: PlantOrderRoutingStep[]
  packageDigest: string
}

export type PlantOrderMaterialAvailability = {
  materialId: string
  inputLotId: string
  availableQuantityMilli: number
}

export type PlantOrderCapacityAvailability = {
  workCentreId: string
  availableMinutes: number
}

type ImportPlanCommand = { kind: 'import_plan'; id: string; package: PlantOrderPlan; proof: PlantOrderProof }
type AvailabilityCommand = {
  kind: 'availability_check'
  id: string
  sourceDigest: string
  materials: PlantOrderMaterialAvailability[]
  workCentres: PlantOrderCapacityAvailability[]
  proof: PlantOrderProof
}
type ReleaseOrderCommand = { kind: 'release_order'; id: string; availabilityCheckId: string; proof: PlantOrderProof }
export type RecordCalibrationCommand = {
  kind: 'record_calibration'
  id: string
  workCentreId: string
  certificateId: string
  calibratedAt: string
  validUntil: string
  standardReference: string
  proof: PlantOrderProof
}
export type RecordQualityReworkCommand = {
  kind: 'record_quality_rework'
  id: string
  inspectionId: string
  operationId: string
  quantity: number
  actualMinutesMilli: number
  owner: string
  cause: string
  correctiveAction: string
  proof: PlantOrderProof
}
type IssueMaterialCommand = { kind: 'issue_material'; id: string; materialId: string; inputLotId: string; quantityMilli: number; proof: PlantOrderProof }
export type IssueSubstituteMaterialCommand = {
  kind: 'issue_substitute_material'
  id: string
  substitutionId: string
  materialId: string
  substituteMaterialId: string
  inputLotId: string
  substituteQuantityMilli: number
  proof: PlantOrderProof
}
export type ApproveMaterialSubstitutionCommand = {
  kind: 'approve_material_substitution'
  contract: typeof PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT
  id: string
  materialId: string
  substituteMaterialId: string
  substituteName: string
  substituteUnit: PlantOrderMaterial['unit']
  originalQuantityPerUnitMilli: number
  substituteQuantityPerUnitMilli: number
  approvalSourceDigest: string
  technicalBasis: string
  proof: PlantOrderProof
}
export type PlantOrderEffectivenessWorkCentre = { workCentreId: string; plannedProductiveMinutesMilli: number }
export type PlantOrderDowntimeInterval = { downtimeId: string; workCentreId: string; startedAt: string; endedAt: string }
export type RecordEffectivenessCommand = {
  kind: 'record_effectiveness'
  id: string
  planId: string
  jobId: string
  windowStart: string
  windowEnd: string
  sourceDigest: string
  workCentres: PlantOrderEffectivenessWorkCentre[]
  downtimeIntervals: PlantOrderDowntimeInterval[]
  proof: PlantOrderProof
}
export type RecordOperationCommand = { kind: 'record_operation'; id: string; operationId: string; quantity: number; actualMinutesMilli: number; proof: PlantOrderProof }
type RecordOutputCommand = { kind: 'record_output'; id: string; outputBatchId: string; quantity: number; proof: PlantOrderProof }
export type InspectOutputCommand = {
  kind: 'inspect_output'
  id: string
  outputBatchId: string
  inspectedQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  result: 'pass' | 'fail'
  proof: PlantOrderProof
}
type ReleaseBatchCommand = { kind: 'release_batch'; id: string; outputBatchId: string; inspectionId: string; proof: PlantOrderProof }
export type PlantOrderCommandPayload = ImportPlanCommand | AvailabilityCommand | ReleaseOrderCommand | RecordCalibrationCommand | RecordQualityReworkCommand | ApproveMaterialSubstitutionCommand | IssueMaterialCommand | IssueSubstituteMaterialCommand | RecordEffectivenessCommand | RecordOperationCommand | RecordOutputCommand | InspectOutputCommand | ReleaseBatchCommand

export type PlantOrderCommand = {
  sequence: number
  previousDigest: string
  payload: PlantOrderCommandPayload
  digest: string
}

export type PlantOrderState = {
  schema: typeof PLANT_ORDER_STATE_SCHEMA
  revision: number
  headDigest: string
  commands: PlantOrderCommand[]
}

export type PlantOrderTransitionResult = { state: PlantOrderState; replayed: boolean }
export type PlantOrderTransition = (state: PlantOrderState) => PlantOrderTransitionResult

export type PlantOrderAvailabilityProjection = {
  checkId: string
  sourceDigest: string
  proof: PlantOrderProof
  passed: boolean
  materials: Array<PlantOrderMaterial & PlantOrderMaterialAvailability & { requiredQuantityMilli: number; shortfallQuantityMilli: number }>
  workCentres: Array<PlantOrderWorkCentre & { requiredMinutesMilli: number; availableMinutes: number; shortfallMinutesMilli: number }>
  shortfalls: Array<{ kind: 'material' | 'capacity'; subjectId: string; required: number; available: number }>
}

export type PlantOrderProjection = {
  contract: typeof PLANT_ORDER_PROJECTION_CONTRACT
  revision: number
  headDigest: string
  plan: PlantOrderPlan | null
  status: 'unplanned' | 'planned' | 'shortfall' | 'ready' | 'released' | 'in_process' | 'inspection_due' | 'quality_hold' | 'ready_to_release' | 'released_to_stock'
  latestAvailability: PlantOrderAvailabilityProjection | null
  orderRelease: ReleaseOrderCommand | null
  calibrations: RecordCalibrationCommand[]
  qualityReworks: RecordQualityReworkCommand[]
  materialSubstitutions: ApproveMaterialSubstitutionCommand[]
  materialIssues: Array<IssueMaterialCommand | IssueSubstituteMaterialCommand>
  effectivenessWindow: RecordEffectivenessCommand | null
  materials: Array<PlantOrderMaterial & { requiredQuantityMilli: number; issuedQuantityMilli: number; remainingToIssueMilli: number; inputLotId: string | null; availableQuantityMilli: number | null }>
  routing: PlantOrderRoutingStep[]
  operations: Array<PlantOrderRoutingStep & { completedQuantity: number; remainingQuantity: number; plannedMinutesMilli: number; actualMinutesMilli: number; status: 'blocked' | 'ready' | 'in_progress' | 'complete' }>
  workCentres: PlantOrderAvailabilityProjection['workCentres']
  outputEntries: RecordOutputCommand[]
  totalOutput: number
  inspections: InspectOutputCommand[]
  latestInspection: InspectOutputCommand | null
  qualityHold: { inspectionId: string; rejectedQuantity: number; proof: PlantOrderProof } | null
  batchRelease: ReleaseBatchCommand | null
  genealogy: Array<{
    materialId: string
    inputLotId: string
    outputBatchId: string
    issuedQuantityMilli: number
    unit: PlantOrderMaterial['unit']
    substitutionId?: string
    substituteMaterialId?: string
    substituteQuantityMilli?: number
    substituteUnit?: PlantOrderMaterial['unit']
  }>
  metrics: { targetQuantity: number; issuedMaterialCount: number; completedOperationCount: number; actualOperationMinutesMilli: number; outputQuantity: number; acceptedQuantity: number }
}

export type PlantOrderEffectivenessProjection = {
  contract: typeof PLANT_ORDER_EFFECTIVENESS_CONTRACT
  status: 'not_started' | 'collecting' | 'availability_setup_required' | 'complete'
  availabilityBasisPoints: number | null
  availability: null | {
    basisPoints: number
    plannedProductiveMinutesMilli: number
    downtimeMinutesMilli: number
    operatingMinutesMilli: number
    windowStart: string
    windowEnd: string
    workCentreCount: number
    downtimeIntervalCount: number
    sourceDigest: string
    proof: PlantOrderProof
  }
  performance: null | {
    basisPoints: number
    designedMinutesMilli: number
    actualMinutesMilli: number
    speedLossMinutesMilli: number
  }
  quality: null | {
    basisPoints: number
    inspectedQuantity: number
    acceptedQuantity: number
    rejectedQuantity: number
  }
  oeeBasisPoints: number | null
  missingEvidence: string[]
}

export type PlantOrderCostDriverProjection = {
  contract: typeof PLANT_ORDER_COST_DRIVER_CONTRACT
  status: 'not_started' | 'collecting' | 'complete'
  earnedUnits: number
  materials: Array<{
    materialId: string
    name: string
    unit: PlantOrderMaterial['unit']
    standardQuantityMilli: number
    actualQuantityMilli: number
    varianceQuantityMilli: number
  }>
  operations: Array<{
    operationId: string
    name: string
    completedQuantity: number
    standardMinutesMilli: number
    actualMinutesMilli: number
    varianceMinutesMilli: number
  }>
  conversion: { standardMinutesMilli: number; actualMinutesMilli: number; varianceMinutesMilli: number }
  financialCostAvailable: false
  financialCostReason: string
}

export type PlantOrderFinancialCostProjection = {
  contract: typeof PLANT_ORDER_FINANCIAL_COST_CONTRACT
  status: 'setup_required' | 'collecting' | 'complete'
  currency: 'MMK'
  missingRates: string[]
  planned: { materialMmk: number; conversionMmk: number; totalMmk: number }
  earned: { materialMmk: number; conversionMmk: number; totalMmk: number }
  actual: { materialMmk: number; conversionMmk: number; totalMmk: number }
  varianceMmk: number | null
  qualityLossMmk: number | null
}

export type PlantOrderCostReviewPacket = {
  contract: typeof PLANT_ORDER_COST_REVIEW_PACKET_CONTRACT
  source: { revision: number; headDigest: string; projectionStatus: PlantOrderProjection['status'] }
  sourceState: PlantOrderState
  plan: PlantOrderPlan
  costDrivers: PlantOrderCostDriverProjection
  financialCost: PlantOrderFinancialCostProjection
  effectiveness: PlantOrderEffectivenessProjection
  inspection: InspectOutputCommand | null
  releaseEvidence: { orderRelease: ReleaseOrderCommand | null; batchRelease: ReleaseBatchCommand | null }
  materialGenealogy: PlantOrderProjection['genealogy']
  authority: {
    costPosted: false
    inventoryPosted: false
    journalPosted: false
    payrollPosted: false
    invoiceCreated: false
    providerCalled: false
  }
  digest: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type LockLike = { request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T> }

const digestPattern = /^sha256:[0-9a-f]{64}$/
const businessIdPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const materialUnits = new Set(['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'])
const commandKinds = new Set(['import_plan', 'availability_check', 'release_order', 'record_calibration', 'record_quality_rework', 'approve_material_substitution', 'issue_material', 'issue_substitute_material', 'record_effectiveness', 'record_operation', 'record_output', 'inspect_output', 'release_batch'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: unknown, field: string, fields: string[]) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw new Error(`${field} fields do not match the contract.`)
  return value
}

function array(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${field} must contain between ${minimum} and ${maximum} items.`)
  return value
}

function text(value: unknown, field: string, maximum = 180) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.normalize('NFC') !== value) throw new Error(`${field} must be normalized nonblank trimmed text.`)
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  }) || value.length > maximum) throw new Error(`${field} is not canonical text.`)
  return value
}

function identifier(value: unknown, field: string, prefix?: string) {
  const candidate = text(value, field, 80)
  if (!businessIdPattern.test(candidate) || (prefix && !candidate.startsWith(`${prefix}-`))) throw new Error(`${field} must be a canonical ${prefix ?? 'business'} identifier.`)
  return candidate
}

function integer(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${field} must be a supported integer quantity.`)
  return Number(value)
}

export function parsePlantOrderQuantityMilli(value: string, allowZero = false) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 1_000 + Number(fraction.padEnd(3, '0'))
  return Number.isSafeInteger(result) && (allowZero ? result >= 0 : result > 0) ? result : null
}

export function parsePlantOrderMaterialPaste(value: string) {
  if (value.length > 16_000) throw new Error('Additional BOM material rows are too large.')
  const lines = value.replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter((line) => line.value)
  if (['material_id|material_name|unit|quantity_per_unit', 'material_id|material_name|unit|quantity_per_unit|mmk_per_material_unit'].includes(lines[0]?.value.toLowerCase().replaceAll(' ', '') ?? '')) lines.shift()
  if (lines.length > PLANT_ORDER_ADDITIONAL_MATERIAL_MAX) throw new Error(`Add at most ${PLANT_ORDER_ADDITIONAL_MATERIAL_MAX} additional BOM materials.`)
  const materials = lines.map(({ line, value: row }) => {
    const columns = row.split('|').map((column) => column.trim())
    if (columns.length !== 4 && columns.length !== 5) throw new Error(`Additional BOM material line ${line} must contain material ID | name | unit | quantity per output unit | optional MMK per material unit.`)
    const unit = columns[2].toLowerCase()
    if (!materialUnits.has(unit)) throw new Error(`Additional BOM material line ${line} has an unsupported unit.`)
    const quantityPerUnitMilli = parsePlantOrderQuantityMilli(columns[3])
    if (!quantityPerUnitMilli) throw new Error(`Additional BOM material line ${line} needs a positive quantity with up to three decimals.`)
    const standardCostPerUnitMmk = columns[4] === undefined ? null : parsePlantOrderMmkRate(columns[4])
    if (columns[4] !== undefined && !standardCostPerUnitMmk) throw new Error(`Additional BOM material line ${line} needs a positive whole-MMK standard cost.`)
    return {
      materialId: identifier(columns[0].toUpperCase(), `Additional BOM material line ${line} ID`, 'MAT'),
      name: text(columns[1], `Additional BOM material line ${line} name`),
      unit: unit as PlantOrderMaterial['unit'],
      quantityPerUnitMilli,
      ...(standardCostPerUnitMmk ? { standardCostPerUnitMmk } : {}),
    }
  })
  unique(materials.map((material) => material.materialId), 'Additional BOM material IDs')
  return materials.sort((left, right) => compareCanonicalText(left.materialId, right.materialId))
}

export function parsePlantOrderRoutingPaste(value: string): PlantOrderRoutingDraft[] {
  if (value.length > 16_000) throw new Error('Additional routing rows are too large.')
  const lines = value.replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter((line) => line.value)
  if (['operation_id|operation_name|work_centre_id|work_centre_name|minutes_per_unit', 'operation_id|operation_name|work_centre_id|work_centre_name|minutes_per_unit|mmk_per_minute'].includes(lines[0]?.value.toLowerCase().replaceAll(' ', '') ?? '')) lines.shift()
  if (lines.length > PLANT_ORDER_ADDITIONAL_OPERATION_MAX) throw new Error(`Add at most ${PLANT_ORDER_ADDITIONAL_OPERATION_MAX} additional routing operations.`)
  const operations = lines.map(({ line, value: row }) => {
    const columns = row.split('|').map((column) => column.trim())
    if (columns.length !== 5 && columns.length !== 6) throw new Error(`Additional routing line ${line} must contain operation ID | name | work centre ID | work centre name | minutes per output unit | optional MMK per minute.`)
    const minutesPerUnitMilli = parsePlantOrderQuantityMilli(columns[4])
    if (!minutesPerUnitMilli) throw new Error(`Additional routing line ${line} needs positive minutes with up to three decimals.`)
    const standardCostPerMinuteMmk = columns[5] === undefined ? null : parsePlantOrderMmkRate(columns[5])
    if (columns[5] !== undefined && !standardCostPerMinuteMmk) throw new Error(`Additional routing line ${line} needs a positive whole-MMK standard cost.`)
    return {
      operationId: identifier(columns[0].toUpperCase(), `Additional routing line ${line} operation ID`, 'OP'),
      name: text(columns[1], `Additional routing line ${line} operation name`),
      workCentreId: identifier(columns[2].toUpperCase(), `Additional routing line ${line} work-centre ID`, 'WC'),
      workCentreName: text(columns[3], `Additional routing line ${line} work-centre name`),
      minutesPerUnitMilli,
      ...(standardCostPerMinuteMmk ? { standardCostPerMinuteMmk } : {}),
    }
  })
  unique(operations.map((operation) => operation.operationId), 'Additional routing operation IDs')
  return operations
}

function safeProduct(left: number, right: number, field: string) {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds the supported quantity range.`)
  return value
}

function digest(value: unknown, field: string) {
  const candidate = text(value, field, 71)
  if (!digestPattern.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`)
  return candidate
}

function timestampMicros(value: unknown, field: string) {
  const candidate = text(value, field, 40)
  if (!timestampPattern.test(candidate)) throw new Error(`${field} must be an ISO timestamp with an explicit offset.`)
  const parsed = Date.parse(candidate)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a real calendar timestamp.`)
  const fraction = /\.(\d{1,6})/.exec(candidate)?.[1] ?? ''
  return { value: candidate, micros: BigInt(parsed) * 1_000n + BigInt(fraction.padEnd(6, '0').slice(3) || '0') }
}

function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates.`)
}

function compareCanonicalText(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

function sorted(values: string[], field: string) {
  const ordered = [...values].sort(compareCanonicalText)
  if (values.some((value, index) => value !== ordered[index])) throw new Error(`${field} must use canonical identifier order.`)
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
  return value
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input); padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]; const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function canonicalDigest(value: unknown) {
  return `sha256:${sha256Hex(canonicalJson(value))}`
}

export function plantOrderEvidenceDigest(value: unknown) {
  return canonicalDigest(value)
}

function actionProof(value: unknown, field: string): PlantOrderProof {
  const source = exact(value, field, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
  return {
    actionId: identifier(source.actionId, `${field}.actionId`, 'ACT'),
    capturedAt: timestampMicros(source.capturedAt, `${field}.capturedAt`).value,
    actor: text(source.actor, `${field}.actor`, 120),
    reason: text(source.reason, `${field}.reason`, 300),
    evidenceReference: text(source.evidenceReference, `${field}.evidenceReference`, 180),
  }
}

function validateJob(value: unknown, field: string) {
  const row = exact(value, field, ['jobId', 'product', 'targetQuantity', 'outputBatchId'])
  return {
    jobId: identifier(row.jobId, `${field}.jobId`, 'JOB'), product: text(row.product, `${field}.product`),
    targetQuantity: integer(row.targetQuantity, `${field}.targetQuantity`, 1), outputBatchId: identifier(row.outputBatchId, `${field}.outputBatchId`, 'BATCH'),
  }
}

function validateMaterials(value: unknown, field: string): PlantOrderMaterial[] {
  const rows = array(value, field, 1, 100).map((candidate, index): PlantOrderMaterial => {
    const rowField = `${field}[${index}]`
    const hasCost = isRecord(candidate) && candidate.standardCostPerUnitMmk !== undefined
    const row = exact(candidate, rowField, ['materialId', 'name', 'unit', 'quantityPerUnitMilli', ...(hasCost ? ['standardCostPerUnitMmk'] : [])])
    const unit = text(row.unit, `${rowField}.unit`, 10)
    if (!materialUnits.has(unit)) throw new Error(`${rowField}.unit is unsupported.`)
    return { materialId: identifier(row.materialId, `${rowField}.materialId`, 'MAT'), name: text(row.name, `${rowField}.name`), unit: unit as PlantOrderMaterial['unit'], quantityPerUnitMilli: integer(row.quantityPerUnitMilli, `${rowField}.quantityPerUnitMilli`, 1), ...(hasCost ? { standardCostPerUnitMmk: integer(row.standardCostPerUnitMmk, `${rowField}.standardCostPerUnitMmk`, 1) } : {}) }
  })
  unique(rows.map((row) => row.materialId), `${field} material IDs`); sorted(rows.map((row) => row.materialId), `${field} material IDs`)
  return rows
}

function validateWorkCentres(value: unknown, field: string): PlantOrderWorkCentre[] {
  const rows = array(value, field, 1, 50).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const row = exact(candidate, rowField, ['workCentreId', 'name'])
    return { workCentreId: identifier(row.workCentreId, `${rowField}.workCentreId`, 'WC'), name: text(row.name, `${rowField}.name`) }
  })
  unique(rows.map((row) => row.workCentreId), `${field} work-centre IDs`); sorted(rows.map((row) => row.workCentreId), `${field} work-centre IDs`)
  return rows
}

function validateRouting(value: unknown, field: string, workCentreIds: Set<string>): PlantOrderRoutingStep[] {
  const rows = array(value, field, 1, 100).map((candidate, index): PlantOrderRoutingStep => {
    const rowField = `${field}[${index}]`; const hasCost = isRecord(candidate) && candidate.standardCostPerMinuteMmk !== undefined; const row = exact(candidate, rowField, ['operationId', 'sequence', 'name', 'workCentreId', 'minutesPerUnitMilli', ...(hasCost ? ['standardCostPerMinuteMmk'] : [])])
    const workCentreId = identifier(row.workCentreId, `${rowField}.workCentreId`, 'WC')
    if (!workCentreIds.has(workCentreId)) throw new Error(`${rowField}.workCentreId is unknown.`)
    const sequence = integer(row.sequence, `${rowField}.sequence`, 1)
    if (sequence !== index + 1) throw new Error(`${rowField}.sequence must be contiguous and ordered.`)
    return { operationId: identifier(row.operationId, `${rowField}.operationId`, 'OP'), sequence, name: text(row.name, `${rowField}.name`), workCentreId, minutesPerUnitMilli: integer(row.minutesPerUnitMilli, `${rowField}.minutesPerUnitMilli`, 1), ...(hasCost ? { standardCostPerMinuteMmk: integer(row.standardCostPerMinuteMmk, `${rowField}.standardCostPerMinuteMmk`, 1) } : {}) }
  })
  unique(rows.map((row) => row.operationId), `${field} operation IDs`)
  return rows
}

function validatePlanPackage(value: unknown): PlantOrderPlan {
  const source = exact(value, 'plan package', ['contract', 'planId', 'sourceDigest', 'job', 'materials', 'workCentres', 'routing', 'packageDigest'])
  if (source.contract !== PLANT_ORDER_PLAN_CONTRACT && source.contract !== PLANT_ORDER_EXECUTION_PLAN_CONTRACT && source.contract !== PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) throw new Error('plan package.contract is unsupported.')
  const contract = source.contract
  const planId = identifier(source.planId, 'plan package.planId', 'PLN'); const sourceDigest = digest(source.sourceDigest, 'plan package.sourceDigest')
  const job = validateJob(source.job, 'plan package.job'); const materials = validateMaterials(source.materials, 'plan package.materials')
  const workCentres = validateWorkCentres(source.workCentres, 'plan package.workCentres')
  const routing = validateRouting(source.routing, 'plan package.routing', new Set(workCentres.map((row) => row.workCentreId)))
  materials.forEach((row) => safeProduct(job.targetQuantity, row.quantityPerUnitMilli, `plan package material requirement for ${row.materialId}`))
  routing.forEach((row) => safeProduct(job.targetQuantity, row.minutesPerUnitMilli, `plan package capacity requirement for ${row.operationId}`))
  const canonical = { contract, planId, sourceDigest, job, materials, workCentres, routing }
  const packageDigest = digest(source.packageDigest, 'plan package.packageDigest')
  if (packageDigest !== canonicalDigest(canonical)) throw new Error('plan package.packageDigest does not match its reviewed contents.')
  return { ...canonical, packageDigest }
}

export function buildPlantOrderPlan(input: Omit<PlantOrderPlan, 'contract' | 'packageDigest'>) {
  const candidate = { contract: PLANT_ORDER_PLAN_CONTRACT, ...input }
  return validatePlanPackage({ ...candidate, packageDigest: canonicalDigest(candidate) })
}

export function buildPlantOrderExecutionPlan(input: Omit<PlantOrderPlan, 'contract' | 'packageDigest'>) {
  const candidate = { contract: PLANT_ORDER_EXECUTION_PLAN_CONTRACT, ...input }
  return validatePlanPackage({ ...candidate, packageDigest: canonicalDigest(candidate) })
}

export function buildPlantOrderControlledPlan(input: Omit<PlantOrderPlan, 'contract' | 'packageDigest'>) {
  const candidate = { contract: PLANT_ORDER_CONTROLLED_PLAN_CONTRACT, ...input }
  return validatePlanPackage({ ...candidate, packageDigest: canonicalDigest(candidate) })
}

export function createEmptyPlantOrderState(): PlantOrderState {
  return { schema: PLANT_ORDER_STATE_SCHEMA, revision: 0, headDigest: EMPTY_PLANT_ORDER_DIGEST, commands: [] }
}

function validateMaterialAvailability(value: unknown, field: string): PlantOrderMaterialAvailability[] {
  const rows = array(value, field, 1, 100).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const row = exact(candidate, rowField, ['materialId', 'inputLotId', 'availableQuantityMilli'])
    return { materialId: identifier(row.materialId, `${rowField}.materialId`, 'MAT'), inputLotId: identifier(row.inputLotId, `${rowField}.inputLotId`, 'LOT'), availableQuantityMilli: integer(row.availableQuantityMilli, `${rowField}.availableQuantityMilli`) }
  })
  unique(rows.map((row) => row.materialId), `${field} material IDs`); sorted(rows.map((row) => row.materialId), `${field} material IDs`)
  return rows
}

function validateCapacityAvailability(value: unknown, field: string): PlantOrderCapacityAvailability[] {
  const rows = array(value, field, 1, 50).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const row = exact(candidate, rowField, ['workCentreId', 'availableMinutes'])
    return { workCentreId: identifier(row.workCentreId, `${rowField}.workCentreId`, 'WC'), availableMinutes: integer(row.availableMinutes, `${rowField}.availableMinutes`) }
  })
  unique(rows.map((row) => row.workCentreId), `${field} work-centre IDs`); sorted(rows.map((row) => row.workCentreId), `${field} work-centre IDs`)
  return rows
}

export function parsePlantOrderMmkRate(value: string) {
  return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
}

function validateEffectivenessWorkCentres(value: unknown, field: string): PlantOrderEffectivenessWorkCentre[] {
  const rows = array(value, field, 1, 50).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const row = exact(candidate, rowField, ['workCentreId', 'plannedProductiveMinutesMilli'])
    return {
      workCentreId: identifier(row.workCentreId, `${rowField}.workCentreId`, 'WC'),
      plannedProductiveMinutesMilli: integer(row.plannedProductiveMinutesMilli, `${rowField}.plannedProductiveMinutesMilli`, 1),
    }
  })
  unique(rows.map((row) => row.workCentreId), `${field} work-centre IDs`); sorted(rows.map((row) => row.workCentreId), `${field} work-centre IDs`)
  return rows
}

function intervalDurationMinutesMilli(startedAt: string, endedAt: string, field: string) {
  const started = timestampMicros(startedAt, `${field}.startedAt`).micros
  const ended = timestampMicros(endedAt, `${field}.endedAt`).micros
  const durationMicros = ended - started
  if (durationMicros <= 0n) throw new Error(`${field}.endedAt must follow startedAt.`)
  if (durationMicros % 60_000n !== 0n) throw new Error(`${field} duration must resolve to whole thousandths of a minute.`)
  const duration = durationMicros / 60_000n
  if (duration > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} duration exceeds the supported range.`)
  return Number(duration)
}

function validateDowntimeIntervals(value: unknown, field: string): PlantOrderDowntimeInterval[] {
  const rows = array(value, field, 0, 200).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const row = exact(candidate, rowField, ['downtimeId', 'workCentreId', 'startedAt', 'endedAt'])
    const result = {
      downtimeId: identifier(row.downtimeId, `${rowField}.downtimeId`, 'DT'),
      workCentreId: identifier(row.workCentreId, `${rowField}.workCentreId`, 'WC'),
      startedAt: timestampMicros(row.startedAt, `${rowField}.startedAt`).value,
      endedAt: timestampMicros(row.endedAt, `${rowField}.endedAt`).value,
    }
    intervalDurationMinutesMilli(result.startedAt, result.endedAt, rowField)
    return result
  })
  unique(rows.map((row) => row.downtimeId), `${field} downtime IDs`); sorted(rows.map((row) => row.downtimeId), `${field} downtime IDs`)
  return rows
}

export function parsePlantOrderDowntimePaste(value: unknown) {
  if (typeof value !== 'string') throw new Error('Downtime evidence must be text.')
  const lines = value.replace(/^\uFEFF/, '').split(/\r?\n/).map((row, index) => ({ line: index + 1, value: row.trim() })).filter((row) => row.value)
  if (lines[0]?.value.toLowerCase().replaceAll(' ', '') === 'downtime_id|work_centre_id|started_at|ended_at') lines.shift()
  if (lines.length > 200) throw new Error('Add at most 200 closed downtime intervals.')
  const rows = lines.map(({ line, value: row }) => {
    const columns = row.split('|').map((column) => column.trim())
    if (columns.length !== 4) throw new Error(`Downtime line ${line} must contain downtime ID | work centre ID | started at | ended at.`)
    return { downtimeId: columns[0].toUpperCase(), workCentreId: columns[1].toUpperCase(), startedAt: columns[2], endedAt: columns[3] }
  }).sort((left, right) => compareCanonicalText(left.downtimeId, right.downtimeId))
  return validateDowntimeIntervals(rows, 'downtime evidence')
}

function validateEffectivenessWindow(value: Record<string, unknown>, field: string): RecordEffectivenessCommand {
  const row = exact(value, field, ['kind', 'id', 'planId', 'jobId', 'windowStart', 'windowEnd', 'sourceDigest', 'workCentres', 'downtimeIntervals', 'proof'])
  const planId = identifier(row.planId, `${field}.planId`, 'PLN'); const jobId = identifier(row.jobId, `${field}.jobId`, 'JOB')
  const windowStart = timestampMicros(row.windowStart, `${field}.windowStart`).value; const windowEnd = timestampMicros(row.windowEnd, `${field}.windowEnd`).value
  const windowDurationMinutesMilli = intervalDurationMinutesMilli(windowStart, windowEnd, field)
  const workCentres = validateEffectivenessWorkCentres(row.workCentres, `${field}.workCentres`)
  const downtimeIntervals = validateDowntimeIntervals(row.downtimeIntervals, `${field}.downtimeIntervals`)
  const sourceDigest = digest(row.sourceDigest, `${field}.sourceDigest`)
  const source = { planId, jobId, windowStart, windowEnd, workCentres, downtimeIntervals }
  if (sourceDigest !== canonicalDigest(source)) throw new Error(`${field}.sourceDigest does not match its order-bound effectiveness evidence.`)
  const centreIds = new Set(workCentres.map((centre) => centre.workCentreId))
  const windowStartMicros = timestampMicros(windowStart, `${field}.windowStart`).micros; const windowEndMicros = timestampMicros(windowEnd, `${field}.windowEnd`).micros
  const downtimeByCentre = new Map<string, Array<{ start: bigint; end: bigint; duration: number }>>()
  downtimeIntervals.forEach((interval, index) => {
    if (!centreIds.has(interval.workCentreId)) throw new Error(`${field}.downtimeIntervals[${index}].workCentreId is not in the effectiveness work centres.`)
    const start = timestampMicros(interval.startedAt, `${field}.downtimeIntervals[${index}].startedAt`).micros
    const end = timestampMicros(interval.endedAt, `${field}.downtimeIntervals[${index}].endedAt`).micros
    if (start < windowStartMicros || end > windowEndMicros) throw new Error(`${field}.downtimeIntervals[${index}] falls outside the effectiveness window.`)
    const rows = downtimeByCentre.get(interval.workCentreId) ?? []
    rows.push({ start, end, duration: intervalDurationMinutesMilli(interval.startedAt, interval.endedAt, `${field}.downtimeIntervals[${index}]`) })
    downtimeByCentre.set(interval.workCentreId, rows)
  })
  workCentres.forEach((centre) => {
    if (centre.plannedProductiveMinutesMilli > windowDurationMinutesMilli) throw new Error(`${field} planned productive time for ${centre.workCentreId} exceeds the evidence window.`)
    const intervals = [...(downtimeByCentre.get(centre.workCentreId) ?? [])].sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0)
    intervals.forEach((interval, index) => { if (index && interval.start < intervals[index - 1].end) throw new Error(`${field} downtime overlaps for ${centre.workCentreId}.`) })
    const downtime = intervals.reduce((total, interval) => total + interval.duration, 0)
    if (!Number.isSafeInteger(downtime) || downtime > centre.plannedProductiveMinutesMilli) throw new Error(`${field} downtime exceeds planned productive time for ${centre.workCentreId}.`)
  })
  const proof = actionProof(row.proof, `${field}.proof`)
  if (timestampMicros(proof.capturedAt, `${field}.proof.capturedAt`).micros < windowEndMicros) throw new Error(`${field}.proof.capturedAt must be at or after the closed effectiveness window.`)
  return { kind: 'record_effectiveness', id: identifier(row.id, `${field}.id`, 'OEE'), ...source, sourceDigest, proof }
}

function commandPayload(value: unknown, field: string): PlantOrderCommandPayload {
  if (!isRecord(value) || typeof value.kind !== 'string' || !commandKinds.has(value.kind)) throw new Error(`${field}.kind is unsupported.`)
  if (value.kind === 'import_plan') {
    const row = exact(value, field, ['kind', 'id', 'package', 'proof']); const plan = validatePlanPackage(row.package)
    const id = identifier(row.id, `${field}.id`, 'PLN')
    if (id !== plan.planId) throw new Error(`${field}.id must equal its reviewed plan ID.`)
    return { kind: 'import_plan', id, package: plan, proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'availability_check') {
    const row = exact(value, field, ['kind', 'id', 'sourceDigest', 'materials', 'workCentres', 'proof'])
    return { kind: 'availability_check', id: identifier(row.id, `${field}.id`, 'CHK'), sourceDigest: digest(row.sourceDigest, `${field}.sourceDigest`), materials: validateMaterialAvailability(row.materials, `${field}.materials`), workCentres: validateCapacityAvailability(row.workCentres, `${field}.workCentres`), proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'release_order') {
    const row = exact(value, field, ['kind', 'id', 'availabilityCheckId', 'proof'])
    return { kind: 'release_order', id: identifier(row.id, `${field}.id`, 'REL'), availabilityCheckId: identifier(row.availabilityCheckId, `${field}.availabilityCheckId`, 'CHK'), proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'record_calibration') {
    const row = exact(value, field, ['kind', 'id', 'workCentreId', 'certificateId', 'calibratedAt', 'validUntil', 'standardReference', 'proof'])
    const calibratedAt = timestampMicros(row.calibratedAt, `${field}.calibratedAt`)
    const validUntil = timestampMicros(row.validUntil, `${field}.validUntil`)
    const proof = actionProof(row.proof, `${field}.proof`)
    const capturedAt = timestampMicros(proof.capturedAt, `${field}.proof.capturedAt`)
    if (calibratedAt.micros > capturedAt.micros) throw new Error(`${field}.calibratedAt cannot follow its review.`)
    if (validUntil.micros <= capturedAt.micros) throw new Error(`${field}.validUntil must follow its review.`)
    return {
      kind: 'record_calibration',
      id: identifier(row.id, `${field}.id`, 'CAL'),
      workCentreId: identifier(row.workCentreId, `${field}.workCentreId`, 'WC'),
      certificateId: identifier(row.certificateId, `${field}.certificateId`, 'CERT'),
      calibratedAt: calibratedAt.value,
      validUntil: validUntil.value,
      standardReference: text(row.standardReference, `${field}.standardReference`, 180),
      proof,
    }
  }
  if (value.kind === 'record_quality_rework') {
    const row = exact(value, field, ['kind', 'id', 'inspectionId', 'operationId', 'quantity', 'actualMinutesMilli', 'owner', 'cause', 'correctiveAction', 'proof'])
    return {
      kind: 'record_quality_rework',
      id: identifier(row.id, `${field}.id`, 'RWK'),
      inspectionId: identifier(row.inspectionId, `${field}.inspectionId`, 'INSP'),
      operationId: identifier(row.operationId, `${field}.operationId`, 'OP'),
      quantity: integer(row.quantity, `${field}.quantity`, 1),
      actualMinutesMilli: integer(row.actualMinutesMilli, `${field}.actualMinutesMilli`, 1),
      owner: text(row.owner, `${field}.owner`, 120),
      cause: text(row.cause, `${field}.cause`, 300),
      correctiveAction: text(row.correctiveAction, `${field}.correctiveAction`, 300),
      proof: actionProof(row.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'approve_material_substitution') {
    const row = exact(value, field, [
      'kind', 'contract', 'id', 'materialId', 'substituteMaterialId', 'substituteName', 'substituteUnit',
      'originalQuantityPerUnitMilli', 'substituteQuantityPerUnitMilli', 'approvalSourceDigest', 'technicalBasis', 'proof',
    ])
    if (row.contract !== PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT) throw new Error(`${field}.contract is unsupported.`)
    const substituteUnit = text(row.substituteUnit, `${field}.substituteUnit`, 12) as PlantOrderMaterial['unit']
    if (!materialUnits.has(substituteUnit)) throw new Error(`${field}.substituteUnit is unsupported.`)
    return {
      kind: 'approve_material_substitution',
      contract: PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT,
      id: identifier(row.id, `${field}.id`, 'SUB'),
      materialId: identifier(row.materialId, `${field}.materialId`, 'MAT'),
      substituteMaterialId: identifier(row.substituteMaterialId, `${field}.substituteMaterialId`, 'MAT'),
      substituteName: text(row.substituteName, `${field}.substituteName`, 180),
      substituteUnit,
      originalQuantityPerUnitMilli: integer(row.originalQuantityPerUnitMilli, `${field}.originalQuantityPerUnitMilli`, 1),
      substituteQuantityPerUnitMilli: integer(row.substituteQuantityPerUnitMilli, `${field}.substituteQuantityPerUnitMilli`, 1),
      approvalSourceDigest: digest(row.approvalSourceDigest, `${field}.approvalSourceDigest`),
      technicalBasis: text(row.technicalBasis, `${field}.technicalBasis`, 300),
      proof: actionProof(row.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'issue_material') {
    const row = exact(value, field, ['kind', 'id', 'materialId', 'inputLotId', 'quantityMilli', 'proof'])
    return { kind: 'issue_material', id: identifier(row.id, `${field}.id`, 'ISSUE'), materialId: identifier(row.materialId, `${field}.materialId`, 'MAT'), inputLotId: identifier(row.inputLotId, `${field}.inputLotId`, 'LOT'), quantityMilli: integer(row.quantityMilli, `${field}.quantityMilli`, 1), proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'issue_substitute_material') {
    const row = exact(value, field, ['kind', 'id', 'substitutionId', 'materialId', 'substituteMaterialId', 'inputLotId', 'substituteQuantityMilli', 'proof'])
    return {
      kind: 'issue_substitute_material',
      id: identifier(row.id, `${field}.id`, 'ISSUE'),
      substitutionId: identifier(row.substitutionId, `${field}.substitutionId`, 'SUB'),
      materialId: identifier(row.materialId, `${field}.materialId`, 'MAT'),
      substituteMaterialId: identifier(row.substituteMaterialId, `${field}.substituteMaterialId`, 'MAT'),
      inputLotId: identifier(row.inputLotId, `${field}.inputLotId`, 'LOT'),
      substituteQuantityMilli: integer(row.substituteQuantityMilli, `${field}.substituteQuantityMilli`, 1),
      proof: actionProof(row.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'record_effectiveness') return validateEffectivenessWindow(value, field)
  if (value.kind === 'record_operation') {
    const row = exact(value, field, ['kind', 'id', 'operationId', 'quantity', 'actualMinutesMilli', 'proof'])
    return { kind: 'record_operation', id: identifier(row.id, `${field}.id`, 'OPRUN'), operationId: identifier(row.operationId, `${field}.operationId`, 'OP'), quantity: integer(row.quantity, `${field}.quantity`, 1), actualMinutesMilli: integer(row.actualMinutesMilli, `${field}.actualMinutesMilli`, 1), proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'record_output') {
    const row = exact(value, field, ['kind', 'id', 'outputBatchId', 'quantity', 'proof'])
    return { kind: 'record_output', id: identifier(row.id, `${field}.id`, 'OUT'), outputBatchId: identifier(row.outputBatchId, `${field}.outputBatchId`, 'BATCH'), quantity: integer(row.quantity, `${field}.quantity`, 1), proof: actionProof(row.proof, `${field}.proof`) }
  }
  if (value.kind === 'inspect_output') {
    const row = exact(value, field, ['kind', 'id', 'outputBatchId', 'inspectedQuantity', 'acceptedQuantity', 'rejectedQuantity', 'result', 'proof'])
    const result = text(row.result, `${field}.result`, 4)
    if (result !== 'pass' && result !== 'fail') throw new Error(`${field}.result is unsupported.`)
    const inspectedQuantity = integer(row.inspectedQuantity, `${field}.inspectedQuantity`, 1)
    const acceptedQuantity = integer(row.acceptedQuantity, `${field}.acceptedQuantity`); const rejectedQuantity = integer(row.rejectedQuantity, `${field}.rejectedQuantity`)
    if (acceptedQuantity + rejectedQuantity !== inspectedQuantity) throw new Error(`${field} accepted and rejected quantities must equal inspected output.`)
    if ((result === 'pass' && rejectedQuantity !== 0) || (result === 'fail' && rejectedQuantity === 0)) throw new Error(`${field}.result contradicts its rejected quantity.`)
    return { kind: 'inspect_output', id: identifier(row.id, `${field}.id`, 'INSP'), outputBatchId: identifier(row.outputBatchId, `${field}.outputBatchId`, 'BATCH'), inspectedQuantity, acceptedQuantity, rejectedQuantity, result, proof: actionProof(row.proof, `${field}.proof`) }
  }
  const row = exact(value, field, ['kind', 'id', 'outputBatchId', 'inspectionId', 'proof'])
  return { kind: 'release_batch', id: identifier(row.id, `${field}.id`, 'QREL'), outputBatchId: identifier(row.outputBatchId, `${field}.outputBatchId`, 'BATCH'), inspectionId: identifier(row.inspectionId, `${field}.inspectionId`, 'INSP'), proof: actionProof(row.proof, `${field}.proof`) }
}

function availabilityProjection(plan: PlantOrderPlan, command: AvailabilityCommand): PlantOrderAvailabilityProjection {
  const plannedMaterials = new Map(plan.materials.map((row) => [row.materialId, row])); const observedMaterials = new Map(command.materials.map((row) => [row.materialId, row]))
  if (plannedMaterials.size !== observedMaterials.size || [...plannedMaterials.keys()].some((id) => !observedMaterials.has(id))) throw new Error('availability check must cover every and only planned material.')
  const centres = new Map(plan.workCentres.map((row) => [row.workCentreId, row])); const observedCentres = new Map(command.workCentres.map((row) => [row.workCentreId, row]))
  const requiredCentreIds = [...new Set(plan.routing.map((row) => row.workCentreId))].sort(compareCanonicalText)
  if (observedCentres.size !== requiredCentreIds.length || requiredCentreIds.some((id) => !observedCentres.has(id))) throw new Error('availability check must cover every and only routed work centre.')
  const shortfalls: PlantOrderAvailabilityProjection['shortfalls'] = []
  const materials = [...plannedMaterials.keys()].sort(compareCanonicalText).map((materialId) => {
    const planned = plannedMaterials.get(materialId)!; const observed = observedMaterials.get(materialId)!
    const requiredQuantityMilli = safeProduct(plan.job.targetQuantity, planned.quantityPerUnitMilli, `material requirement for ${materialId}`)
    if (observed.availableQuantityMilli < requiredQuantityMilli) shortfalls.push({ kind: 'material', subjectId: materialId, required: requiredQuantityMilli, available: observed.availableQuantityMilli })
    return { ...planned, ...observed, requiredQuantityMilli, shortfallQuantityMilli: Math.max(requiredQuantityMilli - observed.availableQuantityMilli, 0) }
  })
  const requiredByCentre = new Map(requiredCentreIds.map((id) => [id, 0]))
  plan.routing.forEach((operation) => {
    const next = (requiredByCentre.get(operation.workCentreId) ?? 0) + safeProduct(plan.job.targetQuantity, operation.minutesPerUnitMilli, `capacity requirement for ${operation.operationId}`)
    if (!Number.isSafeInteger(next)) throw new Error(`capacity requirement for ${operation.workCentreId} exceeds the supported range.`)
    requiredByCentre.set(operation.workCentreId, next)
  })
  const workCentres = requiredCentreIds.map((workCentreId) => {
    const planned = centres.get(workCentreId)!; const observed = observedCentres.get(workCentreId)!
    const requiredMinutesMilli = requiredByCentre.get(workCentreId) ?? 0; const availableMilli = safeProduct(observed.availableMinutes, 1_000, `available capacity for ${workCentreId}`)
    if (availableMilli < requiredMinutesMilli) shortfalls.push({ kind: 'capacity', subjectId: workCentreId, required: requiredMinutesMilli, available: availableMilli })
    return { ...planned, requiredMinutesMilli, availableMinutes: observed.availableMinutes, shortfallMinutesMilli: Math.max(requiredMinutesMilli - availableMilli, 0) }
  })
  return { checkId: command.id, sourceDigest: command.sourceDigest, proof: command.proof, passed: !shortfalls.length, materials, workCentres, shortfalls }
}

function calibrationCovers(command: RecordCalibrationCommand, capturedAt: string, field: string) {
  const observed = timestampMicros(capturedAt, `${field}.capturedAt`).micros
  return timestampMicros(command.calibratedAt, `${field}.calibratedAt`).micros <= observed
    && observed < timestampMicros(command.validUntil, `${field}.validUntil`).micros
}

function emptyProjection(): Omit<PlantOrderProjection, 'contract' | 'revision' | 'headDigest'> {
  return { plan: null, status: 'unplanned', latestAvailability: null, orderRelease: null, calibrations: [], qualityReworks: [], materialSubstitutions: [], materialIssues: [], effectivenessWindow: null, materials: [], routing: [], operations: [], workCentres: [], outputEntries: [], totalOutput: 0, inspections: [], latestInspection: null, qualityHold: null, batchRelease: null, genealogy: [], metrics: { targetQuantity: 0, issuedMaterialCount: 0, completedOperationCount: 0, actualOperationMinutesMilli: 0, outputQuantity: 0, acceptedQuantity: 0 } }
}

function replayCommands(commands: PlantOrderCommandPayload[]): Omit<PlantOrderProjection, 'contract' | 'revision' | 'headDigest'> {
  if (!commands.length) return emptyProjection()
  let plan: PlantOrderPlan | null = null; let latestAvailability: PlantOrderAvailabilityProjection | null = null; let orderRelease: ReleaseOrderCommand | null = null; let effectivenessWindow: RecordEffectivenessCommand | null = null
  let issued = new Map<string, number>(); let operationQuantities = new Map<string, number>(); let operationMinutes = new Map<string, number>(); const calibrations = new Map<string, RecordCalibrationCommand>(); const qualityReworks: RecordQualityReworkCommand[] = []; const materialSubstitutions = new Map<string, ApproveMaterialSubstitutionCommand>(); const materialIssueCommands: Array<IssueMaterialCommand | IssueSubstituteMaterialCommand> = []; const operationCommands: RecordOperationCommand[] = []; const outputEntries: RecordOutputCommand[] = []; const inspections: InspectOutputCommand[] = []
  let batchRelease: ReleaseBatchCommand | null = null; let totalOutput = 0
  commands.forEach((command, index) => {
    const field = `commands[${index}].payload`
    if (index === 0 && command.kind !== 'import_plan') throw new Error('The first Plant order command must be the reviewed plan.')
    if (command.kind === 'import_plan') {
      if (plan || index !== 0) throw new Error(`${field} attempts to replace the immutable reviewed plan.`)
      plan = command.package; issued = new Map(command.package.materials.map((row) => [row.materialId, 0])); operationQuantities = new Map(command.package.routing.map((row) => [row.operationId, 0])); operationMinutes = new Map(command.package.routing.map((row) => [row.operationId, 0])); return
    }
    if (!plan) throw new Error(`${field} has no reviewed plan.`)
    const currentPlan = plan as PlantOrderPlan
    if (command.kind === 'availability_check') {
      if (orderRelease) throw new Error(`${field} cannot replace availability after order release.`)
      latestAvailability = availabilityProjection(currentPlan, command); return
    }
    if (command.kind === 'record_calibration') {
      if (currentPlan.contract !== PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) throw new Error(`${field} requires a version 3 controlled plan.`)
      if (batchRelease) throw new Error(`${field} follows final batch release.`)
      if (!currentPlan.routing.some((operation) => operation.workCentreId === command.workCentreId)) throw new Error(`${field}.workCentreId is not in the reviewed routing.`)
      const previous = calibrations.get(command.workCentreId)
      if (previous && (timestampMicros(command.calibratedAt, `${field}.calibratedAt`).micros <= timestampMicros(previous.calibratedAt, `${field}.prior.calibratedAt`).micros
        || timestampMicros(command.validUntil, `${field}.validUntil`).micros <= timestampMicros(previous.validUntil, `${field}.prior.validUntil`).micros)) throw new Error(`${field} does not advance the retained calibration.`)
      calibrations.set(command.workCentreId, command); return
    }
    if (command.kind === 'release_order') {
      if (orderRelease) throw new Error(`${field} attempts to release the order twice.`)
      if (!latestAvailability) throw new Error(`${field} requires a current availability check.`)
      if (command.availabilityCheckId !== latestAvailability.checkId) throw new Error(`${field} references a stale availability check.`)
      if (!latestAvailability.passed) throw new Error(`${field} cannot release an order with a shortfall.`)
      if (currentPlan.contract === PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) {
        const routedCentreIds = [...new Set(currentPlan.routing.map((operation) => operation.workCentreId))]
        const missing = routedCentreIds.filter((workCentreId) => {
          const calibration = calibrations.get(workCentreId)
          return !calibration || !calibrationCovers(calibration, command.proof.capturedAt, `${field}.calibration.${workCentreId}`)
        })
        if (missing.length) throw new Error(`${field} requires current calibration for ${missing.join(', ')}.`)
      }
      orderRelease = command; return
    }
    if (!orderRelease) throw new Error(`${field} requires human order release.`)
    if (command.kind === 'record_effectiveness') {
      if (command.planId !== currentPlan.planId || command.jobId !== currentPlan.job.jobId) throw new Error(`${field} is not bound to the reviewed order.`)
      const routedCentreIds = [...new Set(currentPlan.routing.map((row) => row.workCentreId))].sort(compareCanonicalText)
      const observedCentreIds = command.workCentres.map((row) => row.workCentreId)
      if (routedCentreIds.length !== observedCentreIds.length || routedCentreIds.some((id, index) => id !== observedCentreIds[index])) throw new Error(`${field} must cover every and only routed work centre.`)
      effectivenessWindow = command; return
    }
    if (batchRelease) throw new Error(`${field} follows final batch release.`)
    if (command.kind === 'approve_material_substitution') {
      const material = currentPlan.materials.find((row) => row.materialId === command.materialId)
      if (!material) throw new Error(`${field}.materialId is not in the reviewed BOM.`)
      if (command.substituteMaterialId === command.materialId || currentPlan.materials.some((row) => row.materialId === command.substituteMaterialId)) throw new Error(`${field}.substituteMaterialId must be a distinct non-BOM material.`)
      if (command.originalQuantityPerUnitMilli !== material.quantityPerUnitMilli) throw new Error(`${field}.originalQuantityPerUnitMilli must match the reviewed BOM basis.`)
      if ((issued.get(command.materialId) ?? 0) !== 0) throw new Error(`${field} must precede material issue.`)
      if (materialSubstitutions.has(command.materialId)) throw new Error(`${field} attempts to approve a second substitute for one BOM material.`)
      safeProduct(currentPlan.job.targetQuantity, command.substituteQuantityPerUnitMilli, `${field}.substituteQuantityPerUnitMilli`)
      materialSubstitutions.set(command.materialId, command); return
    }
    const latestInspection = inspections.at(-1); const currentHold = Boolean(latestInspection && latestInspection.inspectedQuantity === totalOutput && latestInspection.result === 'fail')
    if (command.kind === 'record_quality_rework') {
      if (currentPlan.contract !== PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) throw new Error(`${field} requires a version 3 controlled plan.`)
      if (!currentHold || !latestInspection || command.inspectionId !== latestInspection.id) throw new Error(`${field} requires the current failed inspection.`)
      if (qualityReworks.some((rework) => rework.inspectionId === command.inspectionId)) throw new Error(`${field} attempts to rework one failed inspection twice.`)
      if (command.quantity !== latestInspection.rejectedQuantity) throw new Error(`${field}.quantity must equal the current rejected quantity.`)
      const operation = currentPlan.routing.find((candidate) => candidate.operationId === command.operationId)
      if (!operation) throw new Error(`${field}.operationId is not in the reviewed routing.`)
      const calibration = calibrations.get(operation.workCentreId)
      if (!calibration || !calibrationCovers(calibration, command.proof.capturedAt, `${field}.calibration.${operation.workCentreId}`)) throw new Error(`${field} requires current calibration for ${operation.workCentreId}.`)
      const nextMinutes = (operationMinutes.get(operation.operationId) ?? 0) + command.actualMinutesMilli
      if (!Number.isSafeInteger(nextMinutes)) throw new Error(`${field}.actualMinutesMilli exceeds the supported range.`)
      operationMinutes.set(operation.operationId, nextMinutes); qualityReworks.push(command); return
    }
    if (command.kind === 'issue_material') {
      if (currentHold) throw new Error(`${field} is blocked by the failed current inspection.`)
      const material = currentPlan.materials.find((row) => row.materialId === command.materialId)
      if (!material) throw new Error(`${field}.materialId is not in the reviewed BOM.`)
      if (!latestAvailability) throw new Error(`${field} has no released availability evidence.`)
      const availability = latestAvailability.materials.find((row) => row.materialId === command.materialId)!
      if (command.inputLotId !== availability.inputLotId) throw new Error(`${field}.inputLotId differs from the released lot.`)
      const nextIssued = (issued.get(command.materialId) ?? 0) + command.quantityMilli
      if (nextIssued > availability.requiredQuantityMilli) throw new Error(`${field} exceeds the reviewed BOM requirement.`)
      if (nextIssued > availability.availableQuantityMilli) throw new Error(`${field} exceeds released material availability.`)
      issued.set(command.materialId, nextIssued); materialIssueCommands.push(command); return
    }
    if (command.kind === 'issue_substitute_material') {
      if (currentHold) throw new Error(`${field} is blocked by the failed current inspection.`)
      const material = currentPlan.materials.find((row) => row.materialId === command.materialId)
      if (!material) throw new Error(`${field}.materialId is not in the reviewed BOM.`)
      const approval = materialSubstitutions.get(command.materialId)
      if (!approval || approval.id !== command.substitutionId) throw new Error(`${field}.substitutionId does not reference the approved substitute for this BOM material.`)
      if (approval.substituteMaterialId !== command.substituteMaterialId) throw new Error(`${field}.substituteMaterialId differs from the approved substitute.`)
      const creditNumerator = BigInt(command.substituteQuantityMilli) * BigInt(approval.originalQuantityPerUnitMilli)
      const creditDenominator = BigInt(approval.substituteQuantityPerUnitMilli)
      if (creditNumerator % creditDenominator !== 0n) throw new Error(`${field}.substituteQuantityMilli does not produce an exact approved BOM conversion.`)
      const creditedQuantity = Number(creditNumerator / creditDenominator)
      if (!Number.isSafeInteger(creditedQuantity) || creditedQuantity < 1) throw new Error(`${field}.substituteQuantityMilli exceeds the supported conversion range.`)
      const nextIssued = (issued.get(command.materialId) ?? 0) + creditedQuantity
      const requiredQuantity = safeProduct(currentPlan.job.targetQuantity, material.quantityPerUnitMilli, `material requirement for ${material.materialId}`)
      if (nextIssued > requiredQuantity) throw new Error(`${field} exceeds the reviewed BOM requirement after approved conversion.`)
      issued.set(command.materialId, nextIssued); materialIssueCommands.push(command); return
    }
    if (command.kind === 'record_operation') {
      if (currentHold) throw new Error(`${field} is blocked by the failed current inspection.`)
      if (currentPlan.contract !== PLANT_ORDER_EXECUTION_PLAN_CONTRACT && currentPlan.contract !== PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) throw new Error(`${field} requires a version 2 or 3 execution plan.`)
      const operationIndex = currentPlan.routing.findIndex((row) => row.operationId === command.operationId)
      if (operationIndex < 0) throw new Error(`${field}.operationId is not in the reviewed routing.`)
      if (currentPlan.contract === PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) {
        const workCentreId = currentPlan.routing[operationIndex].workCentreId; const calibration = calibrations.get(workCentreId)
        if (!calibration || !calibrationCovers(calibration, command.proof.capturedAt, `${field}.calibration.${workCentreId}`)) throw new Error(`${field} requires current calibration for ${workCentreId}.`)
      }
      const completedQuantity = operationQuantities.get(command.operationId) ?? 0
      const nextCompletedQuantity = completedQuantity + command.quantity
      if (nextCompletedQuantity > currentPlan.job.targetQuantity) throw new Error(`${field} exceeds the reviewed operation target.`)
      const availableInputQuantity = operationIndex === 0
        ? currentPlan.job.targetQuantity
        : operationQuantities.get(currentPlan.routing[operationIndex - 1].operationId) ?? 0
      if (nextCompletedQuantity > availableInputQuantity) throw new Error(`${field} exceeds quantity completed by the prior operation.`)
      currentPlan.materials.forEach((material) => {
        const required = safeProduct(nextCompletedQuantity, material.quantityPerUnitMilli, `material issue requirement for ${material.materialId}`)
        if ((issued.get(material.materialId) ?? 0) < required) throw new Error(`${field} lacks issued ${material.materialId} for operation progress.`)
      })
      const nextMinutes = (operationMinutes.get(command.operationId) ?? 0) + command.actualMinutesMilli
      if (!Number.isSafeInteger(nextMinutes)) throw new Error(`${field}.actualMinutesMilli exceeds the supported range.`)
      operationQuantities.set(command.operationId, nextCompletedQuantity); operationMinutes.set(command.operationId, nextMinutes); operationCommands.push(command); return
    }
    if (command.kind === 'record_output') {
      if (currentHold) throw new Error(`${field} is blocked by the failed current inspection.`)
      if (command.outputBatchId !== currentPlan.job.outputBatchId) throw new Error(`${field}.outputBatchId differs from the reviewed batch.`)
      const nextOutput = totalOutput + command.quantity
      if (nextOutput > currentPlan.job.targetQuantity) throw new Error(`${field} exceeds the reviewed order target.`)
      if (currentPlan.contract === PLANT_ORDER_EXECUTION_PLAN_CONTRACT || currentPlan.contract === PLANT_ORDER_CONTROLLED_PLAN_CONTRACT) {
        const finalOperation = currentPlan.routing.at(-1)!
        if ((operationQuantities.get(finalOperation.operationId) ?? 0) < nextOutput) throw new Error(`${field} exceeds completed final-operation quantity.`)
      }
      currentPlan.materials.forEach((material) => {
        const required = safeProduct(nextOutput, material.quantityPerUnitMilli, `material issue requirement for ${material.materialId}`)
        if ((issued.get(material.materialId) ?? 0) < required) throw new Error(`${field} lacks issued ${material.materialId} for the recorded output.`)
      })
      totalOutput = nextOutput; outputEntries.push(command); return
    }
    if (command.kind === 'inspect_output') {
      if (command.outputBatchId !== currentPlan.job.outputBatchId) throw new Error(`${field}.outputBatchId differs from the reviewed batch.`)
      if (totalOutput < 1 || command.inspectedQuantity !== totalOutput) throw new Error(`${field} must inspect all currently recorded output.`)
      if (currentHold && currentPlan.contract === PLANT_ORDER_CONTROLLED_PLAN_CONTRACT && latestInspection && !qualityReworks.some((rework) => rework.inspectionId === latestInspection.id)) throw new Error(`${field} requires attributable rework for the current failed inspection.`)
      inspections.push(command); return
    }
    if (command.outputBatchId !== currentPlan.job.outputBatchId) throw new Error(`${field}.outputBatchId differs from the reviewed batch.`)
    if (totalOutput !== currentPlan.job.targetQuantity) throw new Error(`${field} requires the complete reviewed output target.`)
    const inspection = inspections.at(-1)
    if (!inspection || command.inspectionId !== inspection.id) throw new Error(`${field} requires the latest current inspection.`)
    if (inspection.result !== 'pass' || inspection.inspectedQuantity !== totalOutput || inspection.acceptedQuantity !== totalOutput) throw new Error(`${field} cannot release output that is unaccepted or held.`)
    batchRelease = command
  })
  if (!plan) throw new Error('Plant order command history lacks its reviewed plan.')
  const finalPlan = plan as PlantOrderPlan
  const finalAvailability = latestAvailability as PlantOrderAvailabilityProjection | null
  const finalOrderRelease = orderRelease as ReleaseOrderCommand | null
  const finalBatchRelease = batchRelease as ReleaseBatchCommand | null
  const availabilityRows = new Map((finalAvailability?.materials ?? []).map((row) => [row.materialId, row]))
  const materials = finalPlan.materials.map((row) => {
    const requiredQuantityMilli = safeProduct(finalPlan.job.targetQuantity, row.quantityPerUnitMilli, `material requirement for ${row.materialId}`)
    const available = availabilityRows.get(row.materialId); const issuedQuantityMilli = issued.get(row.materialId) ?? 0
    return { ...row, requiredQuantityMilli, issuedQuantityMilli, remainingToIssueMilli: requiredQuantityMilli - issuedQuantityMilli, inputLotId: available?.inputLotId ?? null, availableQuantityMilli: available?.availableQuantityMilli ?? null }
  })
  const genealogy: PlantOrderProjection['genealogy'] = materialIssueCommands.map((command) => {
    const material = finalPlan.materials.find((row) => row.materialId === command.materialId)!
    if (command.kind === 'issue_material') return { materialId: command.materialId, inputLotId: command.inputLotId, outputBatchId: finalPlan.job.outputBatchId, issuedQuantityMilli: command.quantityMilli, unit: material.unit }
    const approval = materialSubstitutions.get(command.materialId)!
    const issuedQuantityMilli = Number(BigInt(command.substituteQuantityMilli) * BigInt(approval.originalQuantityPerUnitMilli) / BigInt(approval.substituteQuantityPerUnitMilli))
    return { materialId: command.materialId, inputLotId: command.inputLotId, outputBatchId: finalPlan.job.outputBatchId, issuedQuantityMilli, unit: material.unit, substitutionId: command.substitutionId, substituteMaterialId: command.substituteMaterialId, substituteQuantityMilli: command.substituteQuantityMilli, substituteUnit: approval.substituteUnit }
  })
  const operations = finalPlan.routing.map((row, index) => {
    const completedQuantity = operationQuantities.get(row.operationId) ?? 0
    const availableInputQuantity = index === 0 ? finalPlan.job.targetQuantity : operationQuantities.get(finalPlan.routing[index - 1].operationId) ?? 0
    const status = completedQuantity === finalPlan.job.targetQuantity ? 'complete' : completedQuantity ? 'in_progress' : availableInputQuantity > 0 ? 'ready' : 'blocked'
    return { ...row, completedQuantity, remainingQuantity: finalPlan.job.targetQuantity - completedQuantity, plannedMinutesMilli: safeProduct(finalPlan.job.targetQuantity, row.minutesPerUnitMilli, `planned operation minutes for ${row.operationId}`), actualMinutesMilli: operationMinutes.get(row.operationId) ?? 0, status } as PlantOrderProjection['operations'][number]
  })
  const latestInspection = inspections.at(-1) ?? null; const inspectionIsCurrent = Boolean(latestInspection && latestInspection.inspectedQuantity === totalOutput)
  const qualityHold = inspectionIsCurrent && latestInspection?.result === 'fail' ? { inspectionId: latestInspection.id, rejectedQuantity: latestInspection.rejectedQuantity, proof: latestInspection.proof } : null
  let status: PlantOrderProjection['status']
  if (finalBatchRelease) status = 'released_to_stock'
  else if (qualityHold) status = 'quality_hold'
  else if (!finalOrderRelease) status = !finalAvailability ? 'planned' : finalAvailability.passed ? 'ready' : 'shortfall'
  else if (totalOutput === finalPlan.job.targetQuantity) status = inspectionIsCurrent && latestInspection?.result === 'pass' ? 'ready_to_release' : 'inspection_due'
  else if (totalOutput || materialIssueCommands.length || operationCommands.length) status = 'in_process'
  else status = 'released'
  return { plan: finalPlan, status, latestAvailability: finalAvailability, orderRelease: finalOrderRelease, calibrations: [...calibrations.values()].sort((left, right) => compareCanonicalText(left.workCentreId, right.workCentreId)), qualityReworks, materialSubstitutions: [...materialSubstitutions.values()].sort((left, right) => compareCanonicalText(left.materialId, right.materialId)), materialIssues: materialIssueCommands, effectivenessWindow, materials, routing: finalPlan.routing, operations, workCentres: finalAvailability?.workCentres ?? [], outputEntries, totalOutput, inspections, latestInspection, qualityHold, batchRelease: finalBatchRelease, genealogy, metrics: { targetQuantity: finalPlan.job.targetQuantity, issuedMaterialCount: [...issued.values()].filter(Boolean).length, completedOperationCount: operations.filter((row) => row.status === 'complete').length, actualOperationMinutesMilli: [...operationMinutes.values()].reduce((total, value) => total + value, 0), outputQuantity: totalOutput, acceptedQuantity: inspectionIsCurrent && latestInspection ? latestInspection.acceptedQuantity : 0 } }
}

export function validatePlantOrderState(value: unknown): PlantOrderState {
  const source = exact(value, 'Plant order state', ['schema', 'revision', 'headDigest', 'commands'])
  if (source.schema !== PLANT_ORDER_STATE_SCHEMA) throw new Error('Plant order state.schema is unsupported.')
  const revision = integer(source.revision, 'Plant order state.revision'); const headDigest = digest(source.headDigest, 'Plant order state.headDigest')
  const rows = array(source.commands, 'Plant order state.commands', 0, 2_000)
  if (revision !== rows.length) throw new Error('Plant order state.revision must equal its retained command count.')
  const commands: PlantOrderCommand[] = []; const commandIds: string[] = []; const actionIds: string[] = []
  let priorDigest = EMPTY_PLANT_ORDER_DIGEST; let priorTimestamp: bigint | null = null
  rows.forEach((candidate, index) => {
    const field = `Plant order state.commands[${index}]`; const envelope = exact(candidate, field, ['sequence', 'previousDigest', 'payload', 'digest'])
    const sequence = integer(envelope.sequence, `${field}.sequence`, 1)
    if (sequence !== index + 1) throw new Error(`${field}.sequence is not contiguous.`)
    const previousDigest = digest(envelope.previousDigest, `${field}.previousDigest`)
    if (previousDigest !== priorDigest) throw new Error(`${field}.previousDigest breaks the command chain.`)
    const payload = commandPayload(envelope.payload, `${field}.payload`); const captured = timestampMicros(payload.proof.capturedAt, `${field}.payload.proof.capturedAt`).micros
    if (priorTimestamp !== null && captured < priorTimestamp) throw new Error(`${field}.payload.proof.capturedAt moves backwards.`)
    const body = { sequence, previousDigest, payload }; const retainedDigest = digest(envelope.digest, `${field}.digest`)
    if (retainedDigest !== canonicalDigest(body)) throw new Error(`${field}.digest does not match its command evidence.`)
    commands.push({ ...body, digest: retainedDigest }); commandIds.push(payload.id); actionIds.push(payload.proof.actionId); priorDigest = retainedDigest; priorTimestamp = captured
  })
  unique(commandIds, 'Plant order command IDs'); unique(actionIds, 'Plant order action IDs')
  if (headDigest !== (commands.length ? priorDigest : EMPTY_PLANT_ORDER_DIGEST)) throw new Error('Plant order state.headDigest does not match its command chain.')
  replayCommands(commands.map((command) => command.payload))
  return canonicalCopy({ schema: PLANT_ORDER_STATE_SCHEMA, revision, headDigest, commands })
}

export function projectPlantOrder(state: unknown): PlantOrderProjection {
  const current = validatePlantOrderState(state)
  return canonicalCopy({ contract: PLANT_ORDER_PROJECTION_CONTRACT, revision: current.revision, headDigest: current.headDigest, ...replayCommands(current.commands.map((command) => command.payload)) })
}

function ratioBasisPoints(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator < 1) return null
  const rounded = ((BigInt(numerator) * 10_000n) + (BigInt(denominator) / 2n)) / BigInt(denominator)
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null
}

export function projectPlantOrderEffectiveness(projection: PlantOrderProjection): PlantOrderEffectivenessProjection {
  const missingEvidence: string[] = []
  if (!projection.plan) return {
    contract: PLANT_ORDER_EFFECTIVENESS_CONTRACT,
    status: 'not_started',
    availabilityBasisPoints: null,
    availability: null,
    performance: null,
    quality: null,
    oeeBasisPoints: null,
    missingEvidence: ['Order-bound planned productive time and downtime', 'Reviewed routing time', 'Current output inspection'],
  }

  const window = projection.effectivenessWindow
  let plannedProductiveMinutesMilli = 0; let downtimeMinutesMilli = 0
  if (window) {
    for (const centre of window.workCentres) plannedProductiveMinutesMilli += centre.plannedProductiveMinutesMilli
    for (const interval of window.downtimeIntervals) downtimeMinutesMilli += intervalDurationMinutesMilli(interval.startedAt, interval.endedAt, `effectiveness downtime ${interval.downtimeId}`)
  }
  const operatingMinutesMilli = plannedProductiveMinutesMilli - downtimeMinutesMilli
  const availabilityBasisPoints = window ? ratioBasisPoints(operatingMinutesMilli, plannedProductiveMinutesMilli) : null
  const availability = window && availabilityBasisPoints !== null ? {
    basisPoints: availabilityBasisPoints,
    plannedProductiveMinutesMilli,
    downtimeMinutesMilli,
    operatingMinutesMilli,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    workCentreCount: window.workCentres.length,
    downtimeIntervalCount: window.downtimeIntervals.length,
    sourceDigest: window.sourceDigest,
    proof: window.proof,
  } : null
  if (!availability) missingEvidence.push('Order-bound planned productive time and downtime')

  let designedMinutes = 0n
  for (const operation of projection.operations) {
    designedMinutes += BigInt(operation.completedQuantity) * BigInt(operation.minutesPerUnitMilli)
  }
  const designedMinutesMilli = designedMinutes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(designedMinutes) : null
  const performanceBasisPoints = designedMinutesMilli === null
    ? null
    : ratioBasisPoints(designedMinutesMilli, projection.metrics.actualOperationMinutesMilli)
  const performance = performanceBasisPoints === null || designedMinutesMilli === null
    ? null
    : {
        basisPoints: performanceBasisPoints,
        designedMinutesMilli,
        actualMinutesMilli: projection.metrics.actualOperationMinutesMilli,
        speedLossMinutesMilli: Math.max(projection.metrics.actualOperationMinutesMilli - designedMinutesMilli, 0),
      }
  if (!performance) missingEvidence.push('Reviewed routing time')

  const inspection = projection.latestInspection
  const qualityBasisPoints = inspection && inspection.inspectedQuantity === projection.totalOutput && inspection.inspectedQuantity > 0
    ? ratioBasisPoints(inspection.acceptedQuantity, inspection.inspectedQuantity)
    : null
  const quality = inspection && qualityBasisPoints !== null
    ? {
        basisPoints: qualityBasisPoints,
        inspectedQuantity: inspection.inspectedQuantity,
        acceptedQuantity: inspection.acceptedQuantity,
        rejectedQuantity: inspection.rejectedQuantity,
      }
    : null
  if (!quality) missingEvidence.push('Current output inspection')

  let oeeBasisPoints: number | null = null
  if (availability && performance && quality) {
    const rounded = (
      BigInt(availability.basisPoints) * BigInt(performance.basisPoints) * BigInt(quality.basisPoints)
      + 50_000_000n
    ) / 100_000_000n
    if (rounded <= BigInt(Number.MAX_SAFE_INTEGER)) oeeBasisPoints = Number(rounded)
  }

  return {
    contract: PLANT_ORDER_EFFECTIVENESS_CONTRACT,
    status: oeeBasisPoints !== null ? 'complete' : performance && quality && !availability ? 'availability_setup_required' : 'collecting',
    availabilityBasisPoints,
    availability,
    performance,
    quality,
    oeeBasisPoints,
    missingEvidence,
  }
}

export function projectPlantOrderCostDrivers(projection: PlantOrderProjection): PlantOrderCostDriverProjection {
  if (!projection.plan) return {
    contract: PLANT_ORDER_COST_DRIVER_CONTRACT,
    status: 'not_started',
    earnedUnits: 0,
    materials: [],
    operations: [],
    conversion: { standardMinutesMilli: 0, actualMinutesMilli: 0, varianceMinutesMilli: 0 },
    financialCostAvailable: false,
    financialCostReason: 'Configure reviewed material and work-centre rates before claiming MMK cost.',
  }
  const firstOperationQuantity = projection.operations[0]?.completedQuantity ?? 0
  const earnedUnits = Math.max(projection.totalOutput, firstOperationQuantity)
  const materials = projection.materials.map((material) => {
    const standardQuantityMilli = safeProduct(earnedUnits, material.quantityPerUnitMilli, `standard material quantity for ${material.materialId}`)
    return {
      materialId: material.materialId,
      name: material.name,
      unit: material.unit,
      standardQuantityMilli,
      actualQuantityMilli: material.issuedQuantityMilli,
      varianceQuantityMilli: material.issuedQuantityMilli - standardQuantityMilli,
    }
  })
  const operations = projection.operations.map((operation) => {
    const standardMinutesMilli = safeProduct(operation.completedQuantity, operation.minutesPerUnitMilli, `standard conversion minutes for ${operation.operationId}`)
    return {
      operationId: operation.operationId,
      name: operation.name,
      completedQuantity: operation.completedQuantity,
      standardMinutesMilli,
      actualMinutesMilli: operation.actualMinutesMilli,
      varianceMinutesMilli: operation.actualMinutesMilli - standardMinutesMilli,
    }
  })
  const standardMinutesMilli = operations.reduce((total, operation) => total + operation.standardMinutesMilli, 0)
  const actualMinutesMilli = operations.reduce((total, operation) => total + operation.actualMinutesMilli, 0)
  return {
    contract: PLANT_ORDER_COST_DRIVER_CONTRACT,
    status: projection.status === 'released_to_stock' ? 'complete' : earnedUnits || actualMinutesMilli || materials.some((material) => material.actualQuantityMilli) ? 'collecting' : 'not_started',
    earnedUnits,
    materials,
    operations,
    conversion: { standardMinutesMilli, actualMinutesMilli, varianceMinutesMilli: actualMinutesMilli - standardMinutesMilli },
    financialCostAvailable: false,
    financialCostReason: 'Configure reviewed material and work-centre rates before claiming MMK cost.',
  }
}

function mmkFromMilliBasis(quantityMilli: number, rateMmk: number, field: string) {
  const rounded = ((BigInt(quantityMilli) * BigInt(rateMmk)) + 500n) / 1_000n
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds the supported MMK range.`)
  return Number(rounded)
}

function proportionalMmk(totalMmk: number, numerator: number, denominator: number, field: string) {
  const rounded = ((BigInt(totalMmk) * BigInt(numerator)) + (BigInt(denominator) / 2n)) / BigInt(denominator)
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds the supported MMK range.`)
  return Number(rounded)
}

export function projectPlantOrderFinancialCost(projection: PlantOrderProjection): PlantOrderFinancialCostProjection {
  const missingRates = [
    ...projection.materials.filter((material) => !material.standardCostPerUnitMmk).map((material) => material.materialId),
    ...projection.operations.filter((operation) => !operation.standardCostPerMinuteMmk).map((operation) => operation.operationId),
  ]
  const empty = { materialMmk: 0, conversionMmk: 0, totalMmk: 0 }
  if (!projection.plan || missingRates.length) return {
    contract: PLANT_ORDER_FINANCIAL_COST_CONTRACT,
    status: 'setup_required',
    currency: 'MMK',
    missingRates,
    planned: empty,
    earned: empty,
    actual: empty,
    varianceMmk: null,
    qualityLossMmk: null,
  }
  const drivers = projectPlantOrderCostDrivers(projection)
  const plannedMaterialMmk = projection.materials.reduce((total, material) => total + mmkFromMilliBasis(material.requiredQuantityMilli, material.standardCostPerUnitMmk!, `planned material cost for ${material.materialId}`), 0)
  const actualMaterialMmk = projection.materials.reduce((total, material) => total + mmkFromMilliBasis(material.issuedQuantityMilli, material.standardCostPerUnitMmk!, `actual material cost for ${material.materialId}`), 0)
  const earnedMaterialMmk = drivers.materials.reduce((total, driver) => {
    const material = projection.materials.find((row) => row.materialId === driver.materialId)!
    return total + mmkFromMilliBasis(driver.standardQuantityMilli, material.standardCostPerUnitMmk!, `earned material cost for ${driver.materialId}`)
  }, 0)
  const plannedConversionMmk = projection.operations.reduce((total, operation) => total + mmkFromMilliBasis(operation.plannedMinutesMilli, operation.standardCostPerMinuteMmk!, `planned conversion cost for ${operation.operationId}`), 0)
  const actualConversionMmk = projection.operations.reduce((total, operation) => total + mmkFromMilliBasis(operation.actualMinutesMilli, operation.standardCostPerMinuteMmk!, `actual conversion cost for ${operation.operationId}`), 0)
  const earnedConversionMmk = drivers.operations.reduce((total, driver) => {
    const operation = projection.operations.find((row) => row.operationId === driver.operationId)!
    return total + mmkFromMilliBasis(driver.standardMinutesMilli, operation.standardCostPerMinuteMmk!, `earned conversion cost for ${driver.operationId}`)
  }, 0)
  const planned = { materialMmk: plannedMaterialMmk, conversionMmk: plannedConversionMmk, totalMmk: plannedMaterialMmk + plannedConversionMmk }
  const earned = { materialMmk: earnedMaterialMmk, conversionMmk: earnedConversionMmk, totalMmk: earnedMaterialMmk + earnedConversionMmk }
  const actual = { materialMmk: actualMaterialMmk, conversionMmk: actualConversionMmk, totalMmk: actualMaterialMmk + actualConversionMmk }
  const rejectedQuantity = projection.latestInspection?.rejectedQuantity ?? 0
  return {
    contract: PLANT_ORDER_FINANCIAL_COST_CONTRACT,
    status: projection.status === 'released_to_stock' ? 'complete' : 'collecting',
    currency: 'MMK',
    missingRates: [],
    planned,
    earned,
    actual,
    varianceMmk: actual.totalMmk - earned.totalMmk,
    qualityLossMmk: rejectedQuantity ? proportionalMmk(planned.totalMmk, rejectedQuantity, projection.metrics.targetQuantity, 'quality loss cost') : 0,
  }
}

export function buildPlantOrderCostReviewPacket(state: unknown): PlantOrderCostReviewPacket | null {
  const sourceState = validatePlantOrderState(state)
  const projection = projectPlantOrder(sourceState)
  if (!projection.plan) return null
  const financialCost = projectPlantOrderFinancialCost(projection)
  if (financialCost.status === 'setup_required') return null
  const body = {
    contract: PLANT_ORDER_COST_REVIEW_PACKET_CONTRACT,
    source: { revision: projection.revision, headDigest: projection.headDigest, projectionStatus: projection.status },
    sourceState: canonicalCopy(sourceState),
    plan: canonicalCopy(projection.plan),
    costDrivers: projectPlantOrderCostDrivers(projection),
    financialCost,
    effectiveness: projectPlantOrderEffectiveness(projection),
    inspection: projection.latestInspection ? canonicalCopy(projection.latestInspection) : null,
    releaseEvidence: {
      orderRelease: projection.orderRelease ? canonicalCopy(projection.orderRelease) : null,
      batchRelease: projection.batchRelease ? canonicalCopy(projection.batchRelease) : null,
    },
    materialGenealogy: canonicalCopy(projection.genealogy),
    authority: {
      costPosted: false,
      inventoryPosted: false,
      journalPosted: false,
      payrollPosted: false,
      invoiceCreated: false,
      providerCalled: false,
    } as const,
  }
  return { ...body, digest: canonicalDigest(body) }
}

export function validatePlantOrderCostReviewPacket(value: unknown): PlantOrderCostReviewPacket {
  const packet = exact(value, 'Plant cost review packet', ['contract', 'source', 'sourceState', 'plan', 'costDrivers', 'financialCost', 'effectiveness', 'inspection', 'releaseEvidence', 'materialGenealogy', 'authority', 'digest'])
  if (packet.contract !== PLANT_ORDER_COST_REVIEW_PACKET_CONTRACT) throw new Error('Plant cost review packet contract is unsupported.')
  const expected = buildPlantOrderCostReviewPacket(validatePlantOrderState(packet.sourceState))
  if (!expected || canonicalJson(packet) !== canonicalJson(expected)) throw new Error('Plant cost review packet does not match its validated command chain.')
  return expected
}

function appendCommand(state: unknown, payload: unknown, expectedHeadDigest: unknown) {
  const current = validatePlantOrderState(state); const checkedPayload = commandPayload(payload, 'command payload')
  const existing = current.commands.find((command) => command.payload.id === checkedPayload.id)
  if (existing) {
    if (canonicalJson(existing.payload) !== canonicalJson(checkedPayload)) throw new Error('The Plant order command ID was already used with different evidence.')
    return { state: current, replayed: true }
  }
  if (digest(expectedHeadDigest, 'expected_head_digest') !== current.headDigest) throw new Error('The Plant order snapshot changed before this command was applied.')
  const body = { sequence: current.revision + 1, previousDigest: current.headDigest, payload: checkedPayload }; const envelope = { ...body, digest: canonicalDigest(body) }
  const candidate = { schema: PLANT_ORDER_STATE_SCHEMA, revision: body.sequence, headDigest: envelope.digest, commands: [...current.commands, envelope] }
  return { state: validatePlantOrderState(candidate), replayed: false }
}

export function applyPlantOrderPlan(state: unknown, plan: unknown, proof: unknown, expectedHeadDigest: unknown) {
  const reviewed = validatePlanPackage(plan)
  return appendCommand(state, { kind: 'import_plan', id: reviewed.planId, package: reviewed, proof: actionProof(proof, 'proof') }, expectedHeadDigest)
}

export function checkPlantOrderAvailability(state: unknown, input: { checkId: unknown; sourceDigest: unknown; materials: unknown; workCentres: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'availability_check', id: input.checkId, sourceDigest: input.sourceDigest, materials: input.materials, workCentres: input.workCentres, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function releasePlantOrder(state: unknown, input: { releaseId: unknown; availabilityCheckId: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'release_order', id: input.releaseId, availabilityCheckId: input.availabilityCheckId, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function recordPlantOrderCalibration(state: unknown, input: { calibrationId: unknown; workCentreId: unknown; certificateId: unknown; calibratedAt: unknown; validUntil: unknown; standardReference: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'record_calibration', id: input.calibrationId, workCentreId: input.workCentreId, certificateId: input.certificateId, calibratedAt: input.calibratedAt, validUntil: input.validUntil, standardReference: input.standardReference, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function recordPlantOrderQualityRework(state: unknown, input: { reworkId: unknown; inspectionId: unknown; operationId: unknown; quantity: unknown; actualMinutesMilli: unknown; owner: unknown; cause: unknown; correctiveAction: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'record_quality_rework', id: input.reworkId, inspectionId: input.inspectionId, operationId: input.operationId, quantity: input.quantity, actualMinutesMilli: input.actualMinutesMilli, owner: input.owner, cause: input.cause, correctiveAction: input.correctiveAction, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function issuePlantOrderMaterial(state: unknown, input: { issueId: unknown; materialId: unknown; inputLotId: unknown; quantityMilli: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'issue_material', id: input.issueId, materialId: input.materialId, inputLotId: input.inputLotId, quantityMilli: input.quantityMilli, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function issuePlantOrderSubstituteMaterial(state: unknown, input: { issueId: unknown; substitutionId: unknown; materialId: unknown; substituteMaterialId: unknown; inputLotId: unknown; substituteQuantityMilli: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'issue_substitute_material', id: input.issueId, substitutionId: input.substitutionId, materialId: input.materialId, substituteMaterialId: input.substituteMaterialId, inputLotId: input.inputLotId, substituteQuantityMilli: input.substituteQuantityMilli, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function approvePlantOrderMaterialSubstitution(state: unknown, input: {
  substitutionId: unknown
  materialId: unknown
  substituteMaterialId: unknown
  substituteName: unknown
  substituteUnit: unknown
  originalQuantityPerUnitMilli: unknown
  substituteQuantityPerUnitMilli: unknown
  approvalSourceDigest: unknown
  technicalBasis: unknown
  proof: unknown
  expectedHeadDigest: unknown
}) {
  return appendCommand(state, {
    kind: 'approve_material_substitution',
    contract: PLANT_ORDER_MATERIAL_SUBSTITUTION_CONTRACT,
    id: input.substitutionId,
    materialId: input.materialId,
    substituteMaterialId: input.substituteMaterialId,
    substituteName: input.substituteName,
    substituteUnit: input.substituteUnit,
    originalQuantityPerUnitMilli: input.originalQuantityPerUnitMilli,
    substituteQuantityPerUnitMilli: input.substituteQuantityPerUnitMilli,
    approvalSourceDigest: input.approvalSourceDigest,
    technicalBasis: input.technicalBasis,
    proof: actionProof(input.proof, 'proof'),
  }, input.expectedHeadDigest)
}

export function recordPlantOrderEffectiveness(state: unknown, input: { effectivenessId: unknown; planId: unknown; jobId: unknown; windowStart: unknown; windowEnd: unknown; sourceDigest: unknown; workCentres: unknown; downtimeIntervals: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'record_effectiveness', id: input.effectivenessId, planId: input.planId, jobId: input.jobId, windowStart: input.windowStart, windowEnd: input.windowEnd, sourceDigest: input.sourceDigest, workCentres: input.workCentres, downtimeIntervals: input.downtimeIntervals, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function recordPlantOrderOperation(state: unknown, input: { operationRunId: unknown; operationId: unknown; quantity: unknown; actualMinutesMilli: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'record_operation', id: input.operationRunId, operationId: input.operationId, quantity: input.quantity, actualMinutesMilli: input.actualMinutesMilli, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function recordPlantOrderOutput(state: unknown, input: { outputId: unknown; outputBatchId: unknown; quantity: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'record_output', id: input.outputId, outputBatchId: input.outputBatchId, quantity: input.quantity, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function inspectPlantOrderOutput(state: unknown, input: { inspectionId: unknown; outputBatchId: unknown; inspectedQuantity: unknown; acceptedQuantity: unknown; rejectedQuantity: unknown; result: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'inspect_output', id: input.inspectionId, outputBatchId: input.outputBatchId, inspectedQuantity: input.inspectedQuantity, acceptedQuantity: input.acceptedQuantity, rejectedQuantity: input.rejectedQuantity, result: input.result, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function releasePlantOrderBatch(state: unknown, input: { qualityReleaseId: unknown; outputBatchId: unknown; inspectionId: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'release_batch', id: input.qualityReleaseId, outputBatchId: input.outputBatchId, inspectionId: input.inspectionId, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function plantOrderStorageKey(scope: string) {
  return `${PLANT_ORDER_STORAGE_PREFIX}${encodeURIComponent(text(scope, 'scope', 160))}`
}

export function loadPlantOrderWorkspace(storage: StorageLike, scope: string) {
  const key = plantOrderStorageKey(scope); const retained = storage.getItem(key)
  if (retained === null) return { state: createEmptyPlantOrderState(), source: 'empty' as const, error: '' }
  try {
    return { state: validatePlantOrderState(JSON.parse(retained)), source: 'current' as const, error: '' }
  } catch (error) {
    return { state: createEmptyPlantOrderState(), source: 'recovery' as const, error: error instanceof Error ? error.message : 'Plant order could not be recovered.' }
  }
}

export async function mutatePlantOrderWorkspace(
  scope: string,
  transition: PlantOrderTransition,
  storage: StorageLike,
  locks: LockLike | null | undefined,
) {
  if (!locks?.request) return { ok: false as const, error: 'Plant execution requires an exclusive browser lock.' }
  try {
    return await locks.request(plantOrderStorageKey(scope), { mode: 'exclusive' }, () => {
      const key = plantOrderStorageKey(scope); const previousRaw = storage.getItem(key); const snapshot = loadPlantOrderWorkspace(storage, scope)
      if (snapshot.source === 'recovery') throw new Error(`Plant order recovery required: ${snapshot.error}`)
      const result = transition(snapshot.state); const checked = validatePlantOrderState(result.state)
      try {
        storage.setItem(key, canonicalJson(checked)); const retained = loadPlantOrderWorkspace(storage, scope)
        if (retained.source !== 'current' || retained.state.headDigest !== checked.headDigest) throw new Error('Plant order write verification failed.')
        return { ok: true as const, state: retained.state, replayed: result.replayed }
      } catch (error) {
        try { if (previousRaw === null) storage.removeItem(key); else storage.setItem(key, previousRaw) } catch { /* Report failure and never claim commit. */ }
        throw error
      }
    })
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Plant order transition failed.' }
  }
}
