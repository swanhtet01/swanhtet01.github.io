import { productionStateCanonical, type ProductionOutputKind, type ProductionState } from './production-workspace.ts'

export const PLANT_OUTPUT_ENTRY_RECOVERY_CONTRACT = 'supermega.plant.closed-output-entry.v1' as const

export type PlantOutputEntryDraft = Readonly<{
  jobId: string
  quantity: number
  outputKind: ProductionOutputKind
  shiftRef: string
  panelOpen: true
}>

export type PlantOutputEntryRecoverySource = Readonly<{
  productionRevision: number
  productionDigest: string
}>

export type PlantOutputEntryRecovery = Readonly<{
  schema: typeof PLANT_OUTPUT_ENTRY_RECOVERY_CONTRACT
  scope: string
  capturedAt: string
  source: PlantOutputEntryRecoverySource
  draft: PlantOutputEntryDraft
}>

export type PlantOutputEntryRecoveryReview =
  | Readonly<{ ok: true; draft: PlantOutputEntryDraft }>
  | Readonly<{ ok: false; reason: 'invalid_recovery' | 'scope_changed' | 'production_changed' }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, required: string[]) {
  const actual = Object.keys(value)
  return required.every((key) => actual.includes(key)) && actual.every((key) => required.includes(key))
}

function exactText(value: unknown, maximum: number, blankable = false) {
  if (typeof value !== 'string'
    || value.length > maximum
    || value.includes('\u0000')
    || (!blankable && (!value || value !== value.trim()))) return null
  return value
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== 'string'
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null
}

function canonicalDigest(value: unknown) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value) ? value : null
}

function canonicalRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function canonicalQuantity(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null
  return Object.is(value, -0) ? 0 : value
}

function canonicalDraft(value: unknown): PlantOutputEntryDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['jobId', 'quantity', 'outputKind', 'shiftRef', 'panelOpen'])
    || value.panelOpen !== true) return null
  const jobId = exactText(value.jobId, 80)
  const quantity = canonicalQuantity(value.quantity)
  const shiftRef = exactText(value.shiftRef, 80, true)
  if (!jobId || quantity === null || shiftRef === null || (value.outputKind !== 'good' && value.outputKind !== 'scrap')) return null
  return { jobId, quantity, outputKind: value.outputKind, shiftRef, panelOpen: true }
}

function canonicalSource(value: unknown): PlantOutputEntryRecoverySource | null {
  if (!isRecord(value) || !hasExactKeys(value, ['productionRevision', 'productionDigest'])) return null
  const productionRevision = canonicalRevision(value.productionRevision)
  const productionDigest = canonicalDigest(value.productionDigest)
  return productionRevision === null || !productionDigest ? null : { productionRevision, productionDigest }
}

function canonicalScope(value: unknown) {
  return exactText(value, 256)
}

export function plantOutputEntryDigestSource(state: ProductionState) {
  return productionStateCanonical(state)
}

export async function plantOutputEntryDigest(state: ProductionState) {
  const bytes = new TextEncoder().encode(plantOutputEntryDigestSource(state))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function plantOutputEntryRecoveryStorageKey(scope: string) {
  const retainedScope = canonicalScope(scope)
  if (!retainedScope) throw new Error('Plant output recovery requires an exact account scope.')
  return `${PLANT_OUTPUT_ENTRY_RECOVERY_CONTRACT}.${encodeURIComponent(retainedScope)}`
}

export function createPlantOutputEntryRecovery(
  scope: string,
  source: PlantOutputEntryRecoverySource,
  draft: PlantOutputEntryDraft,
  capturedAt: Date | string = new Date(),
): PlantOutputEntryRecovery {
  const retainedScope = canonicalScope(scope)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!retainedScope || !retainedSource || !retainedDraft || canonicalTimestamp(capturedAtValue) === null) {
    throw new Error('Plant output recovery could not be created from this entry.')
  }
  return {
    schema: PLANT_OUTPUT_ENTRY_RECOVERY_CONTRACT,
    scope: retainedScope,
    capturedAt: capturedAtValue,
    source: retainedSource,
    draft: retainedDraft,
  }
}

export function restorePlantOutputEntryRecovery(value: unknown): PlantOutputEntryRecovery | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'source', 'draft'])
      || candidate.schema !== PLANT_OUTPUT_ENTRY_RECOVERY_CONTRACT) return null
    return createPlantOutputEntryRecovery(
      candidate.scope as string,
      candidate.source as PlantOutputEntryRecoverySource,
      candidate.draft as PlantOutputEntryDraft,
      candidate.capturedAt as string,
    )
  } catch {
    return null
  }
}

export function plantOutputEntryDraftsMatch(left: PlantOutputEntryDraft, right: PlantOutputEntryDraft) {
  const retainedLeft = canonicalDraft(left)
  const retainedRight = canonicalDraft(right)
  return Boolean(retainedLeft && retainedRight && JSON.stringify(retainedLeft) === JSON.stringify(retainedRight))
}

export function plantOutputEntryRecoveryMatchesDraft(
  recovery: PlantOutputEntryRecovery,
  scope: string,
  source: PlantOutputEntryRecoverySource,
  draft: PlantOutputEntryDraft,
) {
  const restored = restorePlantOutputEntryRecovery(recovery)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  return Boolean(restored
    && retainedSource
    && retainedDraft
    && restored.scope === scope
    && restored.source.productionRevision === retainedSource.productionRevision
    && restored.source.productionDigest === retainedSource.productionDigest
    && plantOutputEntryDraftsMatch(restored.draft, retainedDraft))
}

export function plantOutputEntryRecoveriesMatch(left: PlantOutputEntryRecovery, right: PlantOutputEntryRecovery) {
  const retainedLeft = restorePlantOutputEntryRecovery(left)
  const retainedRight = restorePlantOutputEntryRecovery(right)
  return Boolean(retainedLeft
    && retainedRight
    && retainedLeft.capturedAt === retainedRight.capturedAt
    && plantOutputEntryRecoveryMatchesDraft(retainedLeft, retainedRight.scope, retainedRight.source, retainedRight.draft))
}

export function reviewPlantOutputEntryRecovery(
  recovery: PlantOutputEntryRecovery,
  scope: string,
  productionDigest: string,
  state: ProductionState,
): PlantOutputEntryRecoveryReview {
  const restored = restorePlantOutputEntryRecovery(recovery)
  const retainedDigest = canonicalDigest(productionDigest)
  if (!restored || !retainedDigest) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  try {
    plantOutputEntryDigestSource(state)
  } catch {
    return { ok: false, reason: 'invalid_recovery' }
  }
  if (restored.source.productionRevision !== state.revision || restored.source.productionDigest !== retainedDigest) {
    return { ok: false, reason: 'production_changed' }
  }
  const job = state.jobs.find((candidate) => candidate.id === restored.draft.jobId)
  if (!job || job.closure || job.output + (job.scrap ?? 0) >= job.target) return { ok: false, reason: 'invalid_recovery' }
  return { ok: true, draft: restored.draft }
}
