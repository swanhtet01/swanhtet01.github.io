import {
  managedOrderFields,
  type ChannelOrderDraft,
  type ManagedOrderField,
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
 * Shape follows `supermega.order-intake-evidence.v2`, designed in
 * hq/research/order-intake-agent-evaluation-2026-08.md section 4. Field names are camelCase, the
 * same split channel-order-intake.ts already makes between the snake_case managed response and
 * the browser-side ChannelOrderDraft. One deviation, deliberate: `intakeDraftSchema` is pinned to
 * the value the server actually sends rather than restated by the caller.
 *
 * WHAT SECTION 9 NEEDS ON TOP OF SECTION 4, and how each part is served here:
 *
 *   correction_effort = fields_corrected / total_extracted_fields   (threshold <= 0.20)
 *
 * - `total_extracted_fields` is "every field the model populated with a non-null value". That is
 *   the SIX managed fields (managedOrderFields), not the four a human maps to exact quotes. It is
 *   read off the managed RESPONSE rather than inferred from the browser draft, because the draft
 *   cannot answer the question: buildManagedChannelOrderDraft substitutes the operator's own form
 *   selection for a channel the model returned as null, so a populated `draft.channel` is not
 *   evidence that the model populated anything, and `fulfilment` never reaches the draft at all.
 * - `fields_corrected` is what a NAMED operator changed, so `actor` is required and a record with
 *   no named operator is not written. The identity recorded is the managed `userId` -- the same
 *   value managed audit events already use as `actor` -- never an email or a person's name, so
 *   naming the operator costs nothing against the no-PII promise below.
 * - The two counts must be comparable. `fieldsCorrected` is therefore a subset of
 *   `fieldsExtracted`: a field the model never populated cannot be a correction OF the model, and
 *   scoring one as such put correction_effort above 1, which section 9's own definition ("a
 *   correction effort of 1 means the operator changed every populated field") excludes. The
 *   signal that used to live in that miscount is not lost -- it moved somewhere more precise.
 *   `fieldsExtracted` names what the model filled in, so "the model MISSED payment" (payment
 *   absent from fieldsExtracted) is now distinguishable from "the model got payment WRONG"
 *   (payment present in both arrays), which one array could never express.
 * - `totalExtractedFields` counts all six; `fieldsExtracted` names only the five the review
 *   surface exposes. The gap between them is deliberate and readable: it is the part of section
 *   9's denominator this surface cannot put in front of an operator, and an evaluator who cannot
 *   see that gap would read a falsely low correction_effort. Today the gap is `fulfilment`.
 */

export const ORDER_INTAKE_EVIDENCE_SCHEMA = 'supermega.order-intake-evidence.v2' as const
export const ORDER_INTAKE_DRAFT_SCHEMA = 'supermega.order_intake.draft.v1' as const
export const ORDER_INTAKE_EVIDENCE_STATE_CONTRACT = 'supermega.local_order_intake_evidence_state.v2' as const

/**
 * The key FAMILY, one record set per workspace scope -- see orderIntakeEvidenceStorageKey. It was
 * a single device-wide key while the record held no identity at all. It cannot stay one now that
 * every record names the operator who reviewed the draft: two companies signed into the same
 * browser profile would otherwise share one blob, and each would be holding the other's operator
 * IDs. Same reasoning, and the same 'managed:<id>' / 'local' shape, as shopLoyaltyStorageKey.
 *
 * v1 is deliberately NOT migrated. A v1 record predates the operator identity, so it cannot carry
 * one, and section 9 measures what a NAMED operator changed -- inventing a name to carry the old
 * rows forward would fabricate exactly the thing the metric requires be real. The v1 key stays
 * registered in local-workspace-storage.ts and company-backup.ts so "Reset this device" still
 * reaches any blob a pilot device is holding; it is simply never read or written again.
 */
export const ORDER_INTAKE_EVIDENCE_STORAGE_KEY = 'supermega.shop.order-intake-evidence.v2' as const
export const ORDER_INTAKE_EVIDENCE_LEGACY_STORAGE_KEY = 'supermega.shop.order-intake-evidence.v1' as const

/** 'managed:<id>' for a managed workspace, 'local' for the device-local one. */
export function orderIntakeEvidenceScopeForWorkspace(workspaceId?: string | null): string {
  return workspaceId ? `managed:${workspaceId}` : 'local'
}

export function orderIntakeEvidenceStorageKey(scope: string): string {
  const trimmed = typeof scope === 'string' ? scope.trim() : ''
  if (!trimmed || trimmed.length > 160) throw new Error('Order intake evidence needs a valid workspace scope.')
  return `${ORDER_INTAKE_EVIDENCE_STORAGE_KEY}.${encodeURIComponent(trimmed)}`
}

/**
 * A shop device is not a data warehouse. Two hundred accepted drafts is a deep enough window to
 * see whether the model is improving on this shop's own messages, and small enough that the
 * record can never crowd out the workspace it sits beside.
 */
export const ORDER_INTAKE_EVIDENCE_MAX_RECORDS = 200

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/
const MODEL_NAME_MAX = 120
const PROMPT_VERSION_MAX = 120
/** Matches the actor bound on managed proof records elsewhere in the workspace. */
const ACTOR_MAX = 80

/**
 * The capture scope: the managed fields whose value both reaches the browser draft AND is put in
 * front of the operator by ChannelOrderIntake, so they can be counted as extracted and diffed as
 * corrected. Listed in managedOrderFields order so the two sets line up.
 *
 * This is NOT channelOrderFields, and widening channelOrderFields to serve section 9 would have
 * been wrong: that list drives per-field quote attribution, the `<field>_attribution_required`
 * blockers, and channelOrderDraftIsReady's requirement that provenance carry exactly one entry
 * per field. Adding `channel` to it would demand an exact message quote for a value the operator
 * picks from a dropdown, and every existing ready draft would stop being ready.
 *
 * `fulfilment` is absent for the opposite reason: the model populates it and section 9 counts it,
 * but ChannelOrderDraft has no fulfilment field and the review surface has no fulfilment control,
 * so no operator can correct it. It is counted in totalExtractedFields and named here as missing
 * rather than quietly folded in as if it had been reviewed.
 */
export const channelOrderCaptureFields = ['customer', 'channel', 'sku', 'quantity', 'payment'] as const

export type ChannelOrderCaptureField = (typeof channelOrderCaptureFields)[number]

/**
 * Managed field name -> the capture-scope field it lands on, or null when the review surface has
 * no control for it. Exhaustive over managedOrderFields on purpose: a field added to the server
 * contract fails to compile here until someone decides which side of the line it falls on.
 */
const captureFieldByManagedField: Record<ManagedOrderField, ChannelOrderCaptureField | null> = {
  customer_reference: 'customer',
  channel: 'channel',
  sku: 'sku',
  quantity: 'quantity',
  payment: 'payment',
  fulfilment: null,
}

/** What the model populated: section 9's denominator, plus the capture-scope part of it by name. */
export type OrderIntakeExtractedFields = {
  /**
   * Populated fields that land inside the capture scope. Still only a CANDIDATE set for
   * fieldsExtracted -- buildOrderIntakeEvidenceRecord narrows it further to the ones whose value
   * actually reached the draft, because a value the client could not translate was never put in
   * front of the operator to correct.
   */
  populated: ChannelOrderCaptureField[]
  /** Section 9's denominator: every managed field the model populated, capture scope or not. */
  total: number
}

export type OrderIntakeGeneration = {
  messageDigest: string
  model: string
  promptVersion: string
  generatedAt: string
  extractedFields: OrderIntakeExtractedFields
}

export type OrderIntakeFieldChange = {
  field: ChannelOrderCaptureField
  from: string
  to: string
}

export type OrderIntakeEvidenceRecord = {
  schema: typeof ORDER_INTAKE_EVIDENCE_SCHEMA
  version: 2
  messageDigest: string
  intakeDraftSchema: typeof ORDER_INTAKE_DRAFT_SCHEMA
  modelVersion: string
  promptVersion: string
  capturedAt: string
  acceptedAt: string
  actor: string
  fieldsExtracted: ChannelOrderCaptureField[]
  fieldsCorrected: ChannelOrderCaptureField[]
  correctionCount: number
  totalExtractedFields: number
  rawMessageIncluded: false
}

type StoredOrderIntakeEvidence = {
  contract: typeof ORDER_INTAKE_EVIDENCE_STATE_CONTRACT
  version: 2
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
function fieldValue(draft: ChannelOrderDraft, field: ChannelOrderCaptureField) {
  if (field === 'customer') return draft.customer
  if (field === 'channel') return draft.channel ?? ''
  if (field === 'sku') return draft.sku
  if (field === 'quantity') return Number.isSafeInteger(draft.quantity) ? String(draft.quantity) : ''
  return draft.payment ?? ''
}

/**
 * Which fields the MODEL populated, read straight off the managed draft. Fail-closed in both
 * directions: a managed field name that is absent or `undefined` means this response does not
 * match the contract the count is defined against, and a denominator computed from a response
 * that might be missing a field is a wrong number rather than a missing one.
 */
function readExtractedFields(managed: Record<string, unknown>): OrderIntakeExtractedFields | null {
  const populated: ChannelOrderCaptureField[] = []
  let total = 0
  for (const field of managedOrderFields) {
    if (!(field in managed) || managed[field] === undefined) return null
    if (managed[field] === null) continue
    total += 1
    const captureField = captureFieldByManagedField[field]
    if (captureField) populated.push(captureField)
  }
  return { populated, total }
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
  const extractedFields = readExtractedFields(draft)
  if (!extractedFields) return null
  return {
    messageDigest,
    model,
    promptVersion,
    generatedAt: new Date(String(draft.generated_at)).toISOString(),
    extractedFields,
  }
}

/**
 * The field-level diff. Returns before/after values for the caller's benefit; the persisted
 * record keeps only the field names (see the module comment).
 *
 * `scope` defaults to every reviewable field, which is what a caller showing the operator "here is
 * what you changed" wants. buildOrderIntakeEvidenceRecord narrows it to the fields the model
 * actually populated, because only those can be a correction OF the model.
 */
export function diffChannelOrderCorrections(
  proposed: ChannelOrderDraft,
  accepted: ChannelOrderDraft,
  scope: readonly ChannelOrderCaptureField[] = channelOrderCaptureFields,
): OrderIntakeFieldChange[] {
  const changes: OrderIntakeFieldChange[] = []
  for (const field of channelOrderCaptureFields) {
    if (!scope.includes(field)) continue
    const from = fieldValue(proposed, field)
    const to = fieldValue(accepted, field)
    if (from !== to) changes.push({ field, from, to })
  }
  return changes
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
  actor: string
}): OrderIntakeEvidenceRecord | null {
  const { generation, proposed, accepted } = input
  if (!generation || !proposed) return null
  if (!proposed.messageFingerprint || proposed.messageFingerprint !== accepted.messageFingerprint) return null
  if (!(input.acceptedAt instanceof Date) || !Number.isFinite(input.acceptedAt.getTime())) return null
  // Section 9 measures what a NAMED operator changed. An anonymous correction is not a section 9
  // observation, so it is not recorded at all rather than recorded and later mistaken for one.
  const actor = boundedText(input.actor, ACTOR_MAX)
  if (!actor) return null
  // A denominator of zero has no correction_effort -- the division is NaN, and a record carrying
  // it would either poison an average or read as a flawless extraction of a message the model in
  // fact failed on completely. The model proposed nothing here, so there is nothing to score.
  if (generation.extractedFields.total < 1) return null
  // Narrowed from "the model populated it" to "the operator could see it".
  // buildManagedChannelOrderDraft maps the server enums through managedChannels / managedPayments
  // and turns anything it cannot translate into null -- and the two enums do diverge today:
  // OrderIntakeChannel includes `website` and `walk_in`, which managedChannels has no entry for.
  // Such a value is populated by the model, so it counts in the denominator, but it never reaches
  // the operator as a value, so the dropdown choice they are then forced to make is compensation
  // for a client mapping gap, not a correction of the model. Scoring it as one would inflate
  // correction_effort against the <= 0.20 threshold for a defect that is not the model's.
  const fieldsExtracted = generation.extractedFields.populated
    .filter((field) => Boolean(fieldValue(proposed, field)))
  const corrections = diffChannelOrderCorrections(proposed, accepted, fieldsExtracted)
  return {
    schema: ORDER_INTAKE_EVIDENCE_SCHEMA,
    version: 2,
    messageDigest: generation.messageDigest,
    intakeDraftSchema: ORDER_INTAKE_DRAFT_SCHEMA,
    modelVersion: generation.model,
    promptVersion: generation.promptVersion,
    capturedAt: generation.generatedAt,
    acceptedAt: input.acceptedAt.toISOString(),
    actor,
    fieldsExtracted,
    fieldsCorrected: corrections.map((change) => change.field),
    correctionCount: corrections.length,
    totalExtractedFields: generation.extractedFields.total,
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
  const actor = boundedText(value.actor, ACTOR_MAX)
  const claimedFields = value.fieldsCorrected
  const claimedExtracted = value.fieldsExtracted
  const totalExtractedFields = value.totalExtractedFields
  if (value.schema !== ORDER_INTAKE_EVIDENCE_SCHEMA
    || value.version !== 2
    || value.intakeDraftSchema !== ORDER_INTAKE_DRAFT_SCHEMA
    || typeof value.messageDigest !== 'string'
    || !SHA256_DIGEST.test(value.messageDigest)
    || !model
    || !promptVersion
    || !actor
    || !validTimestamp(value.capturedAt)
    || !validTimestamp(value.acceptedAt)
    || value.rawMessageIncluded !== false
    || !Array.isArray(claimedFields)
    || !Array.isArray(claimedExtracted)
    || typeof totalExtractedFields !== 'number') return null
  const fieldsExtracted = channelOrderCaptureFields.filter((field) => claimedExtracted.includes(field))
  const fieldsCorrected = channelOrderCaptureFields.filter((field) => claimedFields.includes(field))
  // Both directions: the names must all be known fields, and the count must not be assertable
  // independently of them -- correctionCount is the number downstream analysis would trust.
  if (fieldsExtracted.length !== claimedExtracted.length) return null
  if (fieldsCorrected.length !== claimedFields.length) return null
  if (value.correctionCount !== fieldsCorrected.length) return null
  // Section 9's ratio only means anything while its numerator is inside its denominator. A stored
  // record that claims a correction to a field the model never populated, or a reviewable set
  // larger than the total, describes an impossible correction_effort -- refuse it on read rather
  // than let an evaluation average it in.
  if (!fieldsCorrected.every((field) => fieldsExtracted.includes(field))) return null
  if (!Number.isSafeInteger(totalExtractedFields)
    || totalExtractedFields < 1
    || totalExtractedFields < fieldsExtracted.length
    || totalExtractedFields > managedOrderFields.length) return null
  return {
    schema: ORDER_INTAKE_EVIDENCE_SCHEMA,
    version: 2,
    messageDigest: value.messageDigest,
    intakeDraftSchema: ORDER_INTAKE_DRAFT_SCHEMA,
    modelVersion: model,
    promptVersion,
    capturedAt: String(value.capturedAt),
    acceptedAt: String(value.acceptedAt),
    actor,
    fieldsExtracted,
    fieldsCorrected,
    correctionCount: fieldsCorrected.length,
    totalExtractedFields,
    rawMessageIncluded: false,
  }
}

export function readOrderIntakeEvidence(
  storage: Pick<OrderIntakeEvidenceStorage, 'getItem'>,
  scope: string,
): OrderIntakeEvidenceRecord[] {
  try {
    const raw = storage.getItem(orderIntakeEvidenceStorageKey(scope))
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    if (!record(value)
      || value.contract !== ORDER_INTAKE_EVIDENCE_STATE_CONTRACT
      || value.version !== 2
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
  scope: string,
): OrderIntakeEvidenceRecord[] {
  const history = readOrderIntakeEvidence(storage, scope)
  const normalized = normalizeRecord(entry)
  if (!normalized) return history
  const records = [...history, normalized].slice(-ORDER_INTAKE_EVIDENCE_MAX_RECORDS)
  const state: StoredOrderIntakeEvidence = {
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records,
  }
  storage.setItem(orderIntakeEvidenceStorageKey(scope), JSON.stringify(state))
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
    actor: string
    scope: string
  },
): OrderIntakeEvidenceRecord | null {
  const entry = buildOrderIntakeEvidenceRecord(input)
  if (!entry) return null
  try {
    appendOrderIntakeEvidence(storage, entry, input.scope)
  } catch {
    return null
  }
  return entry
}
