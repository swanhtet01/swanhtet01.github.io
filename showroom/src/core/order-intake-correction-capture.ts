import {
  channelOrderFields,
  type ChannelOrderDraft,
  type ChannelOrderField,
} from './channel-order-intake.ts'

/**
 * First layer of the order-intake data flywheel.
 *
 * When AI reads a Viber or Messenger message and proposes an order, and the shop owner fixes a
 * field, the pair (what the AI said, what the human corrected it to) is the most valuable
 * signal this product can produce. It used to be destroyed: ChannelOrderIntake dropped the AI
 * proposal the moment any field was edited, so by the time the operator accepted, there was
 * nothing left to compare against.
 *
 * What gets WRITTEN is deliberately thinner than what gets COMPUTED. diffChannelOrderCorrections
 * returns before/after values so a caller can show the operator what changed; the stored record
 * keeps only the field NAMES and counts. A corrected customer field would otherwise write a real
 * customer's name to disk, and the free tier's promise -- nothing leaves the device -- is only
 * checkable while the weaker promise holds too: no raw message text, no quotes, no corrected
 * values, digests and field names only. Consent-gated raw retention is separate, later work.
 *
 * Shape follows `supermega.order-intake-evidence.v1`, designed in
 * hq/research/order-intake-agent-evaluation-2026-08.md section 4. Field names are camelCase, the
 * same split channel-order-intake.ts already makes between the snake_case managed response and
 * the browser-side ChannelOrderDraft. Two deviations, both deliberate: `accepted_by` is absent
 * because naming the operator is not needed to learn from a correction and an unneeded identity
 * is an unneeded privacy surface; `intakeDraftSchema` is pinned to the value the server actually
 * sends rather than restated by the caller.
 */

export const ORDER_INTAKE_EVIDENCE_SCHEMA = 'supermega.order-intake-evidence.v1' as const
export const ORDER_INTAKE_DRAFT_SCHEMA = 'supermega.order_intake.draft.v1' as const
export const ORDER_INTAKE_EVIDENCE_STATE_CONTRACT = 'supermega.local_order_intake_evidence_state.v1' as const
export const ORDER_INTAKE_EVIDENCE_STORAGE_KEY = 'supermega.shop.order-intake-evidence.v1' as const

/**
 * A shop device is not a data warehouse. Two hundred accepted drafts is a deep enough window to
 * see whether the model is improving on this shop's own messages, and small enough that the
 * record can never crowd out the workspace it sits beside.
 */
export const ORDER_INTAKE_EVIDENCE_MAX_RECORDS = 200

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/
const MODEL_NAME_MAX = 120
const PROMPT_VERSION_MAX = 120

export type OrderIntakeGeneration = {
  messageDigest: string
  model: string
  promptVersion: string
  generatedAt: string
}

export type OrderIntakeFieldChange = {
  field: ChannelOrderField
  from: string
  to: string
}

export type OrderIntakeEvidenceRecord = {
  schema: typeof ORDER_INTAKE_EVIDENCE_SCHEMA
  version: 1
  messageDigest: string
  intakeDraftSchema: typeof ORDER_INTAKE_DRAFT_SCHEMA
  modelVersion: string
  promptVersion: string
  capturedAt: string
  acceptedAt: string
  fieldsCorrected: ChannelOrderField[]
  correctionCount: number
  totalExtractedFields: number
  rawMessageIncluded: false
}

type StoredOrderIntakeEvidence = {
  contract: typeof ORDER_INTAKE_EVIDENCE_STATE_CONTRACT
  version: 1
  records: OrderIntakeEvidenceRecord[]
}

export type OrderIntakeEvidenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized && normalized.length <= maximum ? normalized : ''
}

function validTimestamp(value: unknown) {
  return typeof value === 'string'
    && value.length <= 40
    && Number.isFinite(Date.parse(value))
}

/**
 * The value each provenance field carries, as a comparable string. Quantity is rendered rather
 * than compared numerically so that "2" proposed and 2 accepted is not read as a correction --
 * the accepted draft has already been through buildChannelOrderDraft, which coerces it.
 */
function fieldValue(draft: ChannelOrderDraft, field: ChannelOrderField) {
  if (field === 'customer') return draft.customer
  if (field === 'sku') return draft.sku
  if (field === 'quantity') return Number.isSafeInteger(draft.quantity) ? String(draft.quantity) : ''
  return draft.payment ?? ''
}

/**
 * Reads the generation metadata off a managed order-intake response. Fail-closed: anything
 * missing, mistyped or out of bounds yields null, and a null generation means no evidence is
 * recorded at all. A wrong training label is worse than a missing one.
 */
export function readManagedIntakeGeneration(response: unknown): OrderIntakeGeneration | null {
  if (!record(response) || !record(response.draft)) return null
  const draft = response.draft
  if (draft.schema_version !== ORDER_INTAKE_DRAFT_SCHEMA) return null
  if (!record(draft.generation)) return null
  const messageDigest = typeof draft.message_digest === 'string' ? draft.message_digest : ''
  const model = boundedText(draft.generation.model, MODEL_NAME_MAX)
  const promptVersion = boundedText(draft.generation.prompt_version, PROMPT_VERSION_MAX)
  if (!SHA256_DIGEST.test(messageDigest) || !model || !promptVersion) return null
  if (!validTimestamp(draft.generated_at)) return null
  return {
    messageDigest,
    model,
    promptVersion,
    generatedAt: new Date(String(draft.generated_at)).toISOString(),
  }
}

/**
 * The field-level diff. Returns before/after values for the caller's benefit; the persisted
 * record keeps only the field names (see the module comment).
 */
export function diffChannelOrderCorrections(
  proposed: ChannelOrderDraft,
  accepted: ChannelOrderDraft,
): OrderIntakeFieldChange[] {
  const changes: OrderIntakeFieldChange[] = []
  for (const field of channelOrderFields) {
    const from = fieldValue(proposed, field)
    const to = fieldValue(accepted, field)
    if (from !== to) changes.push({ field, from, to })
  }
  return changes
}

/** How many of the four provenance fields the AI actually filled in. */
export function countExtractedChannelOrderFields(proposed: ChannelOrderDraft) {
  return channelOrderFields.filter((field) => Boolean(fieldValue(proposed, field))).length
}

/**
 * Builds one evidence record, or null when the pair cannot be trusted to describe the same
 * message. The message fingerprint check is the load-bearing one: an operator who clears the box
 * and pastes a different order would otherwise have their edits scored against the previous
 * message's AI proposal, which is not a correction -- it is a fabricated training label.
 */
export function buildOrderIntakeEvidenceRecord(input: {
  generation: OrderIntakeGeneration | null
  proposed: ChannelOrderDraft | null
  accepted: ChannelOrderDraft
  acceptedAt: Date
}): OrderIntakeEvidenceRecord | null {
  const { generation, proposed, accepted } = input
  if (!generation || !proposed) return null
  if (!proposed.messageFingerprint || proposed.messageFingerprint !== accepted.messageFingerprint) return null
  if (!(input.acceptedAt instanceof Date) || !Number.isFinite(input.acceptedAt.getTime())) return null
  const corrections = diffChannelOrderCorrections(proposed, accepted)
  return {
    schema: ORDER_INTAKE_EVIDENCE_SCHEMA,
    version: 1,
    messageDigest: generation.messageDigest,
    intakeDraftSchema: ORDER_INTAKE_DRAFT_SCHEMA,
    modelVersion: generation.model,
    promptVersion: generation.promptVersion,
    capturedAt: generation.generatedAt,
    acceptedAt: input.acceptedAt.toISOString(),
    fieldsCorrected: corrections.map((change) => change.field),
    correctionCount: corrections.length,
    totalExtractedFields: countExtractedChannelOrderFields(proposed),
    rawMessageIncluded: false,
  }
}

/**
 * Rebuilds a record from a fixed field allowlist rather than trusting the parsed object. This is
 * the second layer of the no-raw-text promise: anything an older or tampered-with build wrote
 * that is not named here is dropped on the way back out, so a field cannot survive by having
 * once been written.
 */
function normalizeRecord(value: unknown): OrderIntakeEvidenceRecord | null {
  if (!record(value)) return null
  const model = boundedText(value.modelVersion, MODEL_NAME_MAX)
  const promptVersion = boundedText(value.promptVersion, PROMPT_VERSION_MAX)
  const claimedFields = value.fieldsCorrected
  const totalExtractedFields = value.totalExtractedFields
  if (value.schema !== ORDER_INTAKE_EVIDENCE_SCHEMA
    || value.version !== 1
    || value.intakeDraftSchema !== ORDER_INTAKE_DRAFT_SCHEMA
    || typeof value.messageDigest !== 'string'
    || !SHA256_DIGEST.test(value.messageDigest)
    || !model
    || !promptVersion
    || !validTimestamp(value.capturedAt)
    || !validTimestamp(value.acceptedAt)
    || value.rawMessageIncluded !== false
    || !Array.isArray(claimedFields)
    || typeof totalExtractedFields !== 'number') return null
  const fieldsCorrected = channelOrderFields.filter((field) => claimedFields.includes(field))
  // Both directions: the names must all be known fields, and the count must not be assertable
  // independently of them -- correctionCount is the number downstream analysis would trust.
  if (fieldsCorrected.length !== claimedFields.length) return null
  if (value.correctionCount !== fieldsCorrected.length) return null
  if (!Number.isSafeInteger(totalExtractedFields)
    || totalExtractedFields < 0
    || totalExtractedFields > channelOrderFields.length) return null
  return {
    schema: ORDER_INTAKE_EVIDENCE_SCHEMA,
    version: 1,
    messageDigest: value.messageDigest,
    intakeDraftSchema: ORDER_INTAKE_DRAFT_SCHEMA,
    modelVersion: model,
    promptVersion,
    capturedAt: String(value.capturedAt),
    acceptedAt: String(value.acceptedAt),
    fieldsCorrected,
    correctionCount: fieldsCorrected.length,
    totalExtractedFields,
    rawMessageIncluded: false,
  }
}

export function readOrderIntakeEvidence(
  storage: Pick<OrderIntakeEvidenceStorage, 'getItem'>,
): OrderIntakeEvidenceRecord[] {
  try {
    const raw = storage.getItem(ORDER_INTAKE_EVIDENCE_STORAGE_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    if (!record(value)
      || value.contract !== ORDER_INTAKE_EVIDENCE_STATE_CONTRACT
      || value.version !== 1
      || !Array.isArray(value.records)) return []
    return value.records
      .map(normalizeRecord)
      .filter((entry): entry is OrderIntakeEvidenceRecord => Boolean(entry))
      .slice(-ORDER_INTAKE_EVIDENCE_MAX_RECORDS)
  } catch {
    return []
  }
}

/**
 * Appends one record and returns the history that was written. The cap is applied on WRITE, not
 * only on read, so a device that has been in use for a year holds 200 records rather than a
 * growing blob that happens to be read back trimmed.
 */
export function appendOrderIntakeEvidence(
  storage: OrderIntakeEvidenceStorage,
  entry: OrderIntakeEvidenceRecord | null,
): OrderIntakeEvidenceRecord[] {
  const history = readOrderIntakeEvidence(storage)
  const normalized = normalizeRecord(entry)
  if (!normalized) return history
  const records = [...history, normalized].slice(-ORDER_INTAKE_EVIDENCE_MAX_RECORDS)
  const state: StoredOrderIntakeEvidence = {
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 1,
    records,
  }
  storage.setItem(ORDER_INTAKE_EVIDENCE_STORAGE_KEY, JSON.stringify(state))
  return records
}

/**
 * The one call ChannelOrderIntake makes on acceptance. Storage can throw -- a full quota, a
 * browser in private mode -- and losing a training record must never stop a shop from taking an
 * order, so the failure is swallowed here rather than at the call site.
 */
export function captureOrderIntakeCorrection(
  storage: OrderIntakeEvidenceStorage,
  input: {
    generation: OrderIntakeGeneration | null
    proposed: ChannelOrderDraft | null
    accepted: ChannelOrderDraft
    acceptedAt: Date
  },
): OrderIntakeEvidenceRecord | null {
  const entry = buildOrderIntakeEvidenceRecord(input)
  if (!entry) return null
  try {
    appendOrderIntakeEvidence(storage, entry)
  } catch {
    return null
  }
  return entry
}

/**
 * Section 9's correction-effort metric, the `ai-assistance` nextGate's quality bar.
 *
 * The research doc (hq/research/order-intake-agent-evaluation-2026-08.md section 9) defines it
 * per fixture as `fields_corrected / total_extracted_fields`, then says "the correction effort
 * is averaged across all 20 fixtures". That is a MEAN OF PER-FIXTURE RATIOS, not a pooled
 * `sum(corrected) / sum(extracted)` — the two differ whenever fixtures populate different
 * numbers of fields, and the pooled figure quietly weights a draft with eight populated fields
 * four times as heavily as one with two. `pooledEffort` is reported alongside precisely so the
 * divergence is visible rather than argued about; `averageEffort` is the one the gate reads.
 *
 * A draft where the model populated NOTHING has no defined effort — the denominator is zero.
 * Those are excluded from the mean and counted in `undefinedCount`, which matters more than it
 * looks: scoring them as 0 would let a model that extracts nothing at all post a perfect
 * correction effort and clear the bar by refusing to do the job. Excluding them means such a
 * run instead fails on `measuredCount`, which is the honest failure.
 *
 * **This deliberately does NOT render the gate's pass/fail verdict, and an earlier revision of
 * this function was wrong to.** Codex found two reasons on #568, both confirmed against source,
 * and both live in the CAPTURE layer rather than here:
 *
 *   1. **The denominator undercounts.** The managed draft extracts six fields
 *      (`customer_reference`, `channel`, `sku`, `quantity`, `payment`, `fulfilment` —
 *      `channel-order-intake.ts` `ManagedOrderField`, and the `expected.values` shape in
 *      `tests/fixtures/order_intake_v1.json`). `channelOrderFields`, which
 *      `countExtractedChannelOrderFields` walks, is four: `channel` and `fulfilment` are neither
 *      counted nor diffed. A draft populating all six with one correction records 1/4, not 1/6,
 *      and a correction to either omitted field is invisible.
 *   2. **"Extracted nothing" is sometimes the RIGHT answer.** `en-prompt-injection-no-order-17`
 *      and `en-retracted-order-19` are `scope: "not_an_order"` with all six values null, so a
 *      CORRECT golden-set run has at most 18 non-zero denominators. Gating on 20 measured
 *      ratios made a correct run impossible to pass — a verdict that reports failure on success
 *      is worse than no verdict. Separating a correct non-order from a failed extraction needs
 *      the record to carry the reviewer's outcome, which it does not yet.
 *
 * So this returns descriptive statistics and names what is still missing in `gateBlockedBy`.
 * The numbers below are real and useful for watching a model over time; they are not the gate.
 */
export const ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD = 0.2
export const ORDER_INTAKE_CORRECTION_EFFORT_SAMPLE = 20


export type OrderIntakeCorrectionEffort = {
  sampleSize: number
  measuredCount: number
  undefinedCount: number
  averageEffort: number | null
  pooledEffort: number | null
  threshold: typeof ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD
  requiredSample: number
  /**
   * Empty would mean the gate verdict is computable from these records. It is not yet, and each
   * entry names a capture-layer prerequisite. Callers must not infer a pass from a low
   * `averageEffort` while this is non-empty.
   */
  gateBlockedBy: readonly string[]
}

/** The capture-layer gaps that stop these records from answering the section 9 gate. */
export const ORDER_INTAKE_EFFORT_GATE_BLOCKERS = [
  'denominator_counts_four_of_six_managed_fields',
  'non_order_outcomes_indistinguishable_from_failed_extraction',
] as const

export function summarizeOrderIntakeCorrectionEffort(
  records: readonly OrderIntakeEvidenceRecord[],
  options: { requiredSample?: number } = {},
): OrderIntakeCorrectionEffort {
  const requiredSample = Number.isSafeInteger(options.requiredSample) && (options.requiredSample as number) >= 0
    ? (options.requiredSample as number)
    : ORDER_INTAKE_CORRECTION_EFFORT_SAMPLE
  const measured = records.filter((entry) => entry.totalExtractedFields > 0)
  const ratioSum = measured.reduce(
    (total, entry) => total + entry.correctionCount / entry.totalExtractedFields,
    0,
  )
  const correctedSum = measured.reduce((total, entry) => total + entry.correctionCount, 0)
  const extractedSum = measured.reduce((total, entry) => total + entry.totalExtractedFields, 0)
  const averageEffort = measured.length ? ratioSum / measured.length : null
  return {
    sampleSize: records.length,
    measuredCount: measured.length,
    undefinedCount: records.length - measured.length,
    averageEffort,
    pooledEffort: extractedSum ? correctedSum / extractedSum : null,
    threshold: ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD,
    requiredSample,
    gateBlockedBy: ORDER_INTAKE_EFFORT_GATE_BLOCKERS,
  }
}
