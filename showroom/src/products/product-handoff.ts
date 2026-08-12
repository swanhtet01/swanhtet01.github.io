import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from './product-storage-keys.ts'
import {
  getCurrentApproval,
  getCurrentPublish,
  readinessChecks,
  restoreWorkspace,
  workspaceFingerprint,
  type WebsiteWorkspace,
} from './website/website-model.ts'

export { LEGACY_WEBSITE_STORAGE_KEY, WEBSITE_STORAGE_KEY }
export { WEBSITE_ECOMMERCE_HANDOFF_KEY }

type HandoffSource = {
  fingerprint: string
  approvalId: string
  localPublishId: string
  pageId: string
}

type HandoffIntake = {
  sku: string
  quantity: number
}

type PendingHandoff = {
  schema: 'website_ecommerce_handoff.v1'
  mode: 'browser-local'
  id: string
  createdAt: string
  state: 'pending_acceptance'
  source: HandoffSource
  intake: HandoffIntake
}

type AcceptedHandoff = Omit<PendingHandoff, 'state'> & {
  state: 'accepted'
  acceptance: {
    operatorId: string
    acceptedAt: string
    auditEventId: string
  }
}

export type WebsiteEcommerceHandoff = PendingHandoff | AcceptedHandoff

export type WebsiteOrderDraft = {
  schema: 'ecommerce_order_draft.v1'
  mode: 'browser-local'
  id: string
  idempotencyKey: string
  createdAt: string
  state: 'draft'
  source: {
    kind: 'website_handoff'
    handoffId: string
  }
  currency: 'MMK'
  lines: Array<{
    sku: string
    itemName: string
    variant: string
    quantity: number
    unitPriceMmk: number
  }>
  totalMmk: number
  missingFields: ['customer_reference', 'fulfilment_method', 'payment_method']
}

export const websiteOrderFulfilmentMethods = ['pickup', 'local_delivery'] as const
export const websiteOrderPaymentMethods = ['cash_on_delivery', 'manual_qr', 'manual_bank_transfer'] as const

export type WebsiteOrderFulfilmentMethod = (typeof websiteOrderFulfilmentMethods)[number]
export type WebsiteOrderPaymentMethod = (typeof websiteOrderPaymentMethods)[number]

export type WebsiteOrderRecord = {
  schema: 'ecommerce_order_record.v1'
  mode: 'browser-local'
  id: string
  idempotencyKey: string
  createdAt: string
  state: 'ready_for_confirmation'
  source: {
    kind: 'website_order_draft'
    handoffId: string
    draftId: string
    websiteEvidenceReference: string
  }
  currency: 'MMK'
  lines: WebsiteOrderDraft['lines']
  totalMmk: number
  customerReference: string
  fulfilmentMethod: WebsiteOrderFulfilmentMethod
  paymentMethod: WebsiteOrderPaymentMethod
  completion: {
    operatorId: string
    evidenceReference: string
    auditEventId: string
  }
}

export type WebsiteOrderCompletionInput = {
  fulfilmentMethod: WebsiteOrderFulfilmentMethod
  paymentMethod: WebsiteOrderPaymentMethod
  operatorId: string
  evidenceReference: string
}

export type WebsiteOrderDraftCatalogItem = {
  sku: string
  itemName: string
  variant: string
  active: boolean
  unitPriceMmk: number
}

export type WebsiteHandoffAuditEvent = {
  id: string
  createdAt: string
  actorKind: 'human'
  actor: string
  action: 'accept_website_handoff'
  subjectId: string
  reason: 'Approved local Website-to-Ecommerce intake'
  evidenceReference: string
  before: 'Pending acceptance'
  after: 'Accepted local intake'
}

export type WebsiteOrderCompletionAuditEvent = {
  id: string
  createdAt: string
  actorKind: 'human'
  actor: string
  action: 'complete_website_order'
  subjectId: string
  reason: 'Required local order fields verified'
  evidenceReference: string
  before: 'Draft incomplete'
  after: 'Ready for confirmation'
}

export type WebsiteEcommerceAuditEvent = WebsiteHandoffAuditEvent | WebsiteOrderCompletionAuditEvent

type HandoffStore = {
  schema: 'website_ecommerce_handoff_store.v1' | 'website_ecommerce_handoff_store.v2' | 'website_ecommerce_handoff_store.v3'
  handoff: WebsiteEcommerceHandoff
  audit: WebsiteEcommerceAuditEvent[]
  draft?: WebsiteOrderDraft
  order?: WebsiteOrderRecord
}

export type WebsiteEcommerceHandoffContext = Omit<HandoffStore, 'draft' | 'order'> & {
  draft: WebsiteOrderDraft | null
  order: WebsiteOrderRecord | null
  display: {
    siteName: string
    pagePath: string
    pageHeadline: string
    approvedBy: string
  } | null
}

const operatorIdPattern = /^OP-[A-Z0-9][A-Z0-9_-]{2,31}$/
const handoffIdPattern = /^WEH-[A-Z0-9]{6,32}$/
const auditIdPattern = /^WHA-[A-Z0-9]{6,32}$/
const completionAuditIdPattern = /^EOA-[A-Z0-9]{6,32}$/
const draftIdPattern = /^EOD-[A-Z0-9]{6,32}$/
const orderIdPattern = /^EOR-[A-Z0-9]{6,32}$/
const fingerprintPattern = /^web-[a-f0-9]{8}$/
const skuPattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/
const customerReferencePattern = /^CREF-[A-HJ-NP-Z2-9]{12}$/
const evidenceReferencePattern = /^EV-[A-HJ-NP-Z2-9]{8,24}$/
const handoffMutationLock = 'supermega.website-ecommerce-handoff.mutation.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isTrimmedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && value === value.trim()
}

function isIsoTimestamp(value: unknown) {
  if (!isTrimmedText(value, 40)) return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function createId(prefix: 'WEH' | 'WHA' | 'EOA') {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    : Date.now().toString(36)
  return `${prefix}-${suffix.toUpperCase()}`
}

function customerReferenceFor(handoffId: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const source = handoffId.slice(4)
  let suffix = ''
  for (let index = 0; index < 12; index += 1) {
    const character = source[index % source.length]
    suffix += alphabet[(character.charCodeAt(0) + (index * 11)) % alphabet.length]
  }
  return `CREF-${suffix}`
}

export function getWebsiteOrderCustomerReference(handoffId: string) {
  return handoffIdPattern.test(handoffId) ? customerReferenceFor(handoffId) : null
}

function isHandoffSource(value: unknown): value is HandoffSource {
  if (!isRecord(value) || !hasExactKeys(value, ['fingerprint', 'approvalId', 'localPublishId', 'pageId'])) return false
  return typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
    && isTrimmedText(value.approvalId, 80)
    && isTrimmedText(value.localPublishId, 80)
    && isTrimmedText(value.pageId, 80)
}

function isHandoffIntake(value: unknown): value is HandoffIntake {
  if (!isRecord(value) || !hasExactKeys(value, ['sku', 'quantity'])) return false
  return typeof value.sku === 'string'
    && skuPattern.test(value.sku)
    && typeof value.quantity === 'number'
    && Number.isInteger(value.quantity)
    && value.quantity >= 1
    && value.quantity <= 99
}

export function isWebsiteEcommerceHandoff(value: unknown): value is WebsiteEcommerceHandoff {
  if (!isRecord(value)) return false
  const baseKeys = ['schema', 'mode', 'id', 'createdAt', 'state', 'source', 'intake']
  const pending = value.state === 'pending_acceptance'
  const accepted = value.state === 'accepted'
  if (!pending && !accepted) return false
  if (!hasExactKeys(value, accepted ? [...baseKeys, 'acceptance'] : baseKeys)) return false
  if (value.schema !== 'website_ecommerce_handoff.v1' || value.mode !== 'browser-local') return false
  if (typeof value.id !== 'string' || !handoffIdPattern.test(value.id) || typeof value.createdAt !== 'string' || !isIsoTimestamp(value.createdAt)) return false
  if (!isHandoffSource(value.source) || !isHandoffIntake(value.intake)) return false
  if (pending) return true

  const acceptance = value.acceptance
  return isRecord(acceptance)
    && hasExactKeys(acceptance, ['operatorId', 'acceptedAt', 'auditEventId'])
    && typeof acceptance.operatorId === 'string'
    && operatorIdPattern.test(acceptance.operatorId)
    && typeof acceptance.acceptedAt === 'string'
    && isIsoTimestamp(acceptance.acceptedAt)
    && Date.parse(acceptance.acceptedAt) >= Date.parse(value.createdAt)
    && typeof acceptance.auditEventId === 'string'
    && auditIdPattern.test(acceptance.auditEventId)
}

function isWebsiteOrderLine(value: unknown): value is WebsiteOrderDraft['lines'][number] {
  if (!isRecord(value) || !hasExactKeys(value, ['sku', 'itemName', 'variant', 'quantity', 'unitPriceMmk'])) return false
  return typeof value.sku === 'string'
    && skuPattern.test(value.sku)
    && isTrimmedText(value.itemName, 120)
    && isTrimmedText(value.variant, 120)
    && typeof value.quantity === 'number'
    && Number.isInteger(value.quantity)
    && value.quantity >= 1
    && value.quantity <= 99
    && typeof value.unitPriceMmk === 'number'
    && Number.isSafeInteger(value.unitPriceMmk)
    && value.unitPriceMmk > 0
}

function isWebsiteOrderDraft(value: unknown): value is WebsiteOrderDraft {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'mode', 'id', 'idempotencyKey', 'createdAt', 'state', 'source', 'currency', 'lines', 'totalMmk', 'missingFields'])) return false
  if (value.schema !== 'ecommerce_order_draft.v1' || value.mode !== 'browser-local' || value.state !== 'draft' || value.currency !== 'MMK') return false
  if (typeof value.id !== 'string' || !draftIdPattern.test(value.id)) return false
  if (typeof value.idempotencyKey !== 'string' || !handoffIdPattern.test(value.idempotencyKey) || !isIsoTimestamp(value.createdAt)) return false
  if (!isRecord(value.source) || !hasExactKeys(value.source, ['kind', 'handoffId'])) return false
  if (value.source.kind !== 'website_handoff'
    || typeof value.source.handoffId !== 'string'
    || !handoffIdPattern.test(value.source.handoffId)) return false
  if (!Array.isArray(value.lines) || value.lines.length !== 1) return false
  const line = value.lines[0]
  if (!isWebsiteOrderLine(line)) return false
  if (typeof value.totalMmk !== 'number' || !Number.isSafeInteger(value.totalMmk) || value.totalMmk !== line.quantity * line.unitPriceMmk) return false
  return Array.isArray(value.missingFields)
    && value.missingFields.length === 3
    && value.missingFields[0] === 'customer_reference'
    && value.missingFields[1] === 'fulfilment_method'
    && value.missingFields[2] === 'payment_method'
}

function isWebsiteOrderRecord(value: unknown): value is WebsiteOrderRecord {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'mode', 'id', 'idempotencyKey', 'createdAt', 'state', 'source', 'currency', 'lines', 'totalMmk', 'customerReference', 'fulfilmentMethod', 'paymentMethod', 'completion'])) return false
  if (value.schema !== 'ecommerce_order_record.v1' || value.mode !== 'browser-local' || value.state !== 'ready_for_confirmation' || value.currency !== 'MMK') return false
  if (typeof value.id !== 'string' || !orderIdPattern.test(value.id)) return false
  if (typeof value.idempotencyKey !== 'string' || !draftIdPattern.test(value.idempotencyKey) || !isIsoTimestamp(value.createdAt)) return false
  if (!isRecord(value.source) || !hasExactKeys(value.source, ['kind', 'handoffId', 'draftId', 'websiteEvidenceReference'])) return false
  if (value.source.kind !== 'website_order_draft'
    || typeof value.source.handoffId !== 'string'
    || !handoffIdPattern.test(value.source.handoffId)
    || typeof value.source.draftId !== 'string'
    || !draftIdPattern.test(value.source.draftId)
    || !isTrimmedText(value.source.websiteEvidenceReference, 80)
    || value.idempotencyKey !== value.source.draftId) return false
  if (!Array.isArray(value.lines) || value.lines.length !== 1 || !isWebsiteOrderLine(value.lines[0])) return false
  const line = value.lines[0]
  if (typeof value.totalMmk !== 'number' || !Number.isSafeInteger(value.totalMmk) || value.totalMmk !== line.quantity * line.unitPriceMmk) return false
  if (typeof value.customerReference !== 'string' || !customerReferencePattern.test(value.customerReference)) return false
  if (typeof value.fulfilmentMethod !== 'string' || !websiteOrderFulfilmentMethods.includes(value.fulfilmentMethod as WebsiteOrderFulfilmentMethod)) return false
  if (typeof value.paymentMethod !== 'string' || !websiteOrderPaymentMethods.includes(value.paymentMethod as WebsiteOrderPaymentMethod)) return false
  if (!isRecord(value.completion) || !hasExactKeys(value.completion, ['operatorId', 'evidenceReference', 'auditEventId'])) return false
  return typeof value.completion.operatorId === 'string'
    && operatorIdPattern.test(value.completion.operatorId)
    && typeof value.completion.evidenceReference === 'string'
    && evidenceReferencePattern.test(value.completion.evidenceReference)
    && typeof value.completion.auditEventId === 'string'
    && completionAuditIdPattern.test(value.completion.auditEventId)
}

function isWebsiteHandoffAuditEvent(value: unknown): value is WebsiteHandoffAuditEvent {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'createdAt', 'actorKind', 'actor', 'action', 'subjectId', 'reason', 'evidenceReference', 'before', 'after'])) return false
  return typeof value.id === 'string'
    && auditIdPattern.test(value.id)
    && isIsoTimestamp(value.createdAt)
    && value.actorKind === 'human'
    && typeof value.actor === 'string'
    && operatorIdPattern.test(value.actor)
    && value.action === 'accept_website_handoff'
    && typeof value.subjectId === 'string'
    && handoffIdPattern.test(value.subjectId)
    && value.reason === 'Approved local Website-to-Ecommerce intake'
    && isTrimmedText(value.evidenceReference, 80)
    && value.before === 'Pending acceptance'
    && value.after === 'Accepted local intake'
}

function isWebsiteOrderCompletionAuditEvent(value: unknown): value is WebsiteOrderCompletionAuditEvent {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'createdAt', 'actorKind', 'actor', 'action', 'subjectId', 'reason', 'evidenceReference', 'before', 'after'])) return false
  return typeof value.id === 'string'
    && completionAuditIdPattern.test(value.id)
    && isIsoTimestamp(value.createdAt)
    && value.actorKind === 'human'
    && typeof value.actor === 'string'
    && operatorIdPattern.test(value.actor)
    && value.action === 'complete_website_order'
    && typeof value.subjectId === 'string'
    && orderIdPattern.test(value.subjectId)
    && value.reason === 'Required local order fields verified'
    && typeof value.evidenceReference === 'string'
    && evidenceReferencePattern.test(value.evidenceReference)
    && value.before === 'Draft incomplete'
    && value.after === 'Ready for confirmation'
}

function isWebsiteEcommerceAuditEvent(value: unknown): value is WebsiteEcommerceAuditEvent {
  return isWebsiteHandoffAuditEvent(value) || isWebsiteOrderCompletionAuditEvent(value)
}

function sameOrderLine(left: WebsiteOrderDraft['lines'][number], right: WebsiteOrderDraft['lines'][number]) {
  return left.sku === right.sku
    && left.itemName === right.itemName
    && left.variant === right.variant
    && left.quantity === right.quantity
    && left.unitPriceMmk === right.unitPriceMmk
}

function isHandoffStore(value: unknown): value is HandoffStore {
  if (!isRecord(value)) return false
  const isV1 = value.schema === 'website_ecommerce_handoff_store.v1'
  const isV2 = value.schema === 'website_ecommerce_handoff_store.v2'
  const isV3 = value.schema === 'website_ecommerce_handoff_store.v3'
  if (!(isV1 && hasExactKeys(value, ['schema', 'handoff', 'audit']))
    && !(isV2 && hasExactKeys(value, ['schema', 'handoff', 'audit', 'draft']))
    && !(isV3 && hasExactKeys(value, ['schema', 'handoff', 'audit', 'draft', 'order']))) return false
  if (!isWebsiteEcommerceHandoff(value.handoff) || !Array.isArray(value.audit)) return false
  const audit = value.audit
  if (!audit.every(isWebsiteEcommerceAuditEvent)) return false
  if (value.handoff.state === 'pending_acceptance') return isV1 && audit.length === 0
  const acceptanceAudit = audit[0]
  const acceptanceMatches = isWebsiteHandoffAuditEvent(acceptanceAudit)
    && acceptanceAudit.id === value.handoff.acceptance.auditEventId
    && acceptanceAudit.subjectId === value.handoff.id
    && acceptanceAudit.actor === value.handoff.acceptance.operatorId
    && acceptanceAudit.createdAt === value.handoff.acceptance.acceptedAt
    && acceptanceAudit.evidenceReference === value.handoff.source.localPublishId
  if (!acceptanceMatches) return false
  if (isV1) return audit.length === 1
  if (!isWebsiteOrderDraft(value.draft)) return false
  const line = value.draft.lines[0]
  const draftMatches = value.draft.id === `EOD-${value.handoff.id.slice(4)}`
    && value.draft.idempotencyKey === value.handoff.id
    && Date.parse(value.draft.createdAt) >= Date.parse(value.handoff.acceptance.acceptedAt)
    && value.draft.source.handoffId === value.handoff.id
    && line.sku === value.handoff.intake.sku
    && line.quantity === value.handoff.intake.quantity
  if (!draftMatches || isV2) return draftMatches && audit.length === 1
  if (!isWebsiteOrderRecord(value.order) || audit.length !== 2) return false
  const completionAudit = audit[1]
  const orderLine = value.order.lines[0]
  return isWebsiteOrderCompletionAuditEvent(completionAudit)
    && value.order.id === `EOR-${value.handoff.id.slice(4)}`
    && value.order.idempotencyKey === value.draft.id
    && value.order.source.handoffId === value.handoff.id
    && value.order.source.draftId === value.draft.id
    && value.order.source.websiteEvidenceReference === value.handoff.source.localPublishId
    && value.order.customerReference === customerReferenceFor(value.handoff.id)
    && Date.parse(value.order.createdAt) >= Date.parse(value.draft.createdAt)
    && value.order.currency === value.draft.currency
    && value.order.totalMmk === value.draft.totalMmk
    && sameOrderLine(orderLine, line)
    && completionAudit.id === value.order.completion.auditEventId
    && completionAudit.createdAt === value.order.createdAt
    && completionAudit.actor === value.order.completion.operatorId
    && completionAudit.subjectId === value.order.id
    && completionAudit.evidenceReference === value.order.completion.evidenceReference
}

function validateAgainstWorkspace(handoff: WebsiteEcommerceHandoff, workspace: WebsiteWorkspace) {
  const fingerprint = workspaceFingerprint(workspace)
  const approval = getCurrentApproval(workspace)
  const publish = getCurrentPublish(workspace)
  const readyPageIds = workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id)
  const page = workspace.pages.find((candidate) => candidate.id === handoff.source.pageId)

  if (fingerprint !== handoff.source.fingerprint || !readinessChecks(workspace, fingerprint).every((check) => check.passed)) return null
  if (!approval || approval.id !== handoff.source.approvalId || approval.fingerprint !== fingerprint) return null
  if (!isTrimmedText(approval.reviewer, 80) || !isTrimmedText(approval.note, 240) || !isIsoTimestamp(approval.approvedAt)) return null
  if (!publish || publish.id !== handoff.source.localPublishId || publish.fingerprint !== fingerprint || publish.approvalId !== approval.id) return null
  if (!sameStringSet(publish.evidenceIds, approval.evidenceIds)) return null
  if (!isIsoTimestamp(publish.recordedAt) || Date.parse(publish.recordedAt) < Date.parse(approval.approvedAt)) return null
  if (publish.recordedBy !== approval.reviewer || !sameStringSet(publish.readyPageIds, readyPageIds)) return null
  if (!page || page.stage !== 'ready' || !publish.readyPageIds.includes(page.id)) return null
  if (Date.parse(handoff.createdAt) < Date.parse(publish.recordedAt)) return null

  return {
    siteName: workspace.siteName,
    pagePath: page.slug,
    pageHeadline: page.hero.headline,
    approvedBy: approval.reviewer,
  }
}

function readCurrentWebsiteWorkspace() {
  const raw = globalThis.localStorage?.getItem(WEBSITE_STORAGE_KEY)
  if (!raw) return null
  return restoreWorkspace(JSON.parse(raw) as unknown)
}

export function createWebsiteEcommerceHandoff(input: {
  fingerprint: string
  approvalId: string
  localPublishId: string
  pageId: string
  sku: string
  quantity: number
}): WebsiteEcommerceHandoff {
  return {
    schema: 'website_ecommerce_handoff.v1',
    mode: 'browser-local',
    id: createId('WEH'),
    createdAt: new Date().toISOString(),
    state: 'pending_acceptance',
    source: {
      fingerprint: input.fingerprint,
      approvalId: input.approvalId,
      localPublishId: input.localPublishId,
      pageId: input.pageId,
    },
    intake: {
      sku: input.sku,
      quantity: input.quantity,
    },
  }
}

export function readWebsiteEcommerceHandoff(): WebsiteEcommerceHandoffContext | null {
  try {
    const raw = globalThis.localStorage?.getItem(WEBSITE_ECOMMERCE_HANDOFF_KEY)
    const workspace = readCurrentWebsiteWorkspace()
    if (!raw) return null
    const store: unknown = JSON.parse(raw)
    if (!isHandoffStore(store)) return null
    const display = workspace ? validateAgainstWorkspace(store.handoff, workspace) : null
    if (store.handoff.state === 'pending_acceptance' && !display) return null
    return { ...store, draft: store.draft ?? null, order: store.order ?? null, display }
  } catch {
    return null
  }
}

export function writeWebsiteEcommerceHandoff(handoff: WebsiteEcommerceHandoff, workspace: WebsiteWorkspace) {
  try {
    if (!isWebsiteEcommerceHandoff(handoff) || handoff.state !== 'pending_acceptance') return null
    const existingRaw = globalThis.localStorage?.getItem(WEBSITE_ECOMMERCE_HANDOFF_KEY)
    if (existingRaw) {
      const existing: unknown = JSON.parse(existingRaw)
      if (isHandoffStore(existing) && existing.handoff.state === 'accepted') return null
    }
    if (!validateAgainstWorkspace(handoff, workspace)) return null
    const persistedWorkspace = readCurrentWebsiteWorkspace()
    if (!persistedWorkspace || workspaceFingerprint(persistedWorkspace) !== workspaceFingerprint(workspace)) return null
    if (!validateAgainstWorkspace(handoff, persistedWorkspace)) return null

    const store: HandoffStore = {
      schema: 'website_ecommerce_handoff_store.v1',
      handoff,
      audit: [],
    }
    globalThis.localStorage?.setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))
    const restored = readWebsiteEcommerceHandoff()
    return restored?.handoff.id === handoff.id && restored.handoff.state === 'pending_acceptance' && restored.display ? restored : null
  } catch {
    return null
  }
}

export function acceptWebsiteEcommerceHandoff(handoffId: string, operatorId: string) {
  try {
    if (!operatorIdPattern.test(operatorId)) return null
    const current = readWebsiteEcommerceHandoff()
    if (!current || current.handoff.id !== handoffId || current.handoff.state !== 'pending_acceptance') return null

    const acceptedAt = new Date().toISOString()
    const auditEventId = createId('WHA')
    const handoff: AcceptedHandoff = {
      ...current.handoff,
      state: 'accepted',
      acceptance: { operatorId, acceptedAt, auditEventId },
    }
    const audit: WebsiteHandoffAuditEvent = {
      id: auditEventId,
      createdAt: acceptedAt,
      actorKind: 'human',
      actor: operatorId,
      action: 'accept_website_handoff',
      subjectId: handoff.id,
      reason: 'Approved local Website-to-Ecommerce intake',
      evidenceReference: handoff.source.localPublishId,
      before: 'Pending acceptance',
      after: 'Accepted local intake',
    }
    const store: HandoffStore = {
      schema: 'website_ecommerce_handoff_store.v1',
      handoff,
      audit: [audit],
    }
    globalThis.localStorage?.setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))
    const restored = readWebsiteEcommerceHandoff()
    return restored?.handoff.state === 'accepted'
      && restored.handoff.acceptance.auditEventId === auditEventId
      && !restored.draft
      ? restored
      : null
  } catch {
    return null
  }
}

export function createWebsiteOrderDraft(handoffId: string, catalogItem: WebsiteOrderDraftCatalogItem) {
  try {
    const current = readWebsiteEcommerceHandoff()
    if (!current || current.handoff.id !== handoffId || current.handoff.state !== 'accepted') return null
    if (current.draft) return current.draft.idempotencyKey === handoffId ? current : null
    if (!current.display) return null
    if (catalogItem.sku !== current.handoff.intake.sku
      || !catalogItem.active
      || !isTrimmedText(catalogItem.itemName, 120)
      || !isTrimmedText(catalogItem.variant, 120)
      || !Number.isSafeInteger(catalogItem.unitPriceMmk)
      || catalogItem.unitPriceMmk <= 0) return null

    const totalMmk = current.handoff.intake.quantity * catalogItem.unitPriceMmk
    if (!Number.isSafeInteger(totalMmk)) return null
    const draftId = `EOD-${current.handoff.id.slice(4)}`
    const draft: WebsiteOrderDraft = {
      schema: 'ecommerce_order_draft.v1',
      mode: 'browser-local',
      id: draftId,
      idempotencyKey: current.handoff.id,
      createdAt: new Date().toISOString(),
      state: 'draft',
      source: {
        kind: 'website_handoff',
        handoffId: current.handoff.id,
      },
      currency: 'MMK',
      lines: [{
        sku: current.handoff.intake.sku,
        itemName: catalogItem.itemName,
        variant: catalogItem.variant,
        quantity: current.handoff.intake.quantity,
        unitPriceMmk: catalogItem.unitPriceMmk,
      }],
      totalMmk,
      missingFields: ['customer_reference', 'fulfilment_method', 'payment_method'],
    }
    const store: HandoffStore = {
      schema: 'website_ecommerce_handoff_store.v2',
      handoff: current.handoff,
      audit: current.audit,
      draft,
    }
    globalThis.localStorage?.setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))
    const restored = readWebsiteEcommerceHandoff()
    return restored?.draft?.id === draftId
      && restored.draft.idempotencyKey === handoffId
      && restored.draft.totalMmk === totalMmk
      ? restored
      : null
  } catch {
    return null
  }
}

function isWebsiteOrderCompletionInput(value: unknown): value is WebsiteOrderCompletionInput {
  if (!isRecord(value) || !hasExactKeys(value, ['fulfilmentMethod', 'paymentMethod', 'operatorId', 'evidenceReference'])) return false
  return typeof value.fulfilmentMethod === 'string'
    && websiteOrderFulfilmentMethods.includes(value.fulfilmentMethod as WebsiteOrderFulfilmentMethod)
    && typeof value.paymentMethod === 'string'
    && websiteOrderPaymentMethods.includes(value.paymentMethod as WebsiteOrderPaymentMethod)
    && typeof value.operatorId === 'string'
    && operatorIdPattern.test(value.operatorId)
    && typeof value.evidenceReference === 'string'
    && evidenceReferencePattern.test(value.evidenceReference)
}

function completionMatches(order: WebsiteOrderRecord, input: WebsiteOrderCompletionInput) {
  return order.fulfilmentMethod === input.fulfilmentMethod
    && order.paymentMethod === input.paymentMethod
    && order.completion.operatorId === input.operatorId
    && order.completion.evidenceReference === input.evidenceReference
}

function completeWebsiteOrderDraftWithLock(draftId: string, input: WebsiteOrderCompletionInput) {
  try {
    const current = readWebsiteEcommerceHandoff()
    if (!current || current.handoff.state !== 'accepted' || current.draft?.id !== draftId) return null
    if (current.order) return current.order.idempotencyKey === draftId && completionMatches(current.order, input) ? current : null
    if (!current.display) return null

    const createdAt = new Date().toISOString()
    if (Date.parse(createdAt) < Date.parse(current.draft.createdAt)) return null
    const auditEventId = createId('EOA')
    const orderId = `EOR-${current.handoff.id.slice(4)}`
    const order: WebsiteOrderRecord = {
      schema: 'ecommerce_order_record.v1',
      mode: 'browser-local',
      id: orderId,
      idempotencyKey: current.draft.id,
      createdAt,
      state: 'ready_for_confirmation',
      source: {
        kind: 'website_order_draft',
        handoffId: current.handoff.id,
        draftId: current.draft.id,
        websiteEvidenceReference: current.handoff.source.localPublishId,
      },
      currency: current.draft.currency,
      lines: current.draft.lines.map((line) => ({ ...line })),
      totalMmk: current.draft.totalMmk,
      customerReference: customerReferenceFor(current.handoff.id),
      fulfilmentMethod: input.fulfilmentMethod,
      paymentMethod: input.paymentMethod,
      completion: {
        operatorId: input.operatorId,
        evidenceReference: input.evidenceReference,
        auditEventId,
      },
    }
    const audit: WebsiteOrderCompletionAuditEvent = {
      id: auditEventId,
      createdAt,
      actorKind: 'human',
      actor: input.operatorId,
      action: 'complete_website_order',
      subjectId: order.id,
      reason: 'Required local order fields verified',
      evidenceReference: input.evidenceReference,
      before: 'Draft incomplete',
      after: 'Ready for confirmation',
    }
    const store: HandoffStore = {
      schema: 'website_ecommerce_handoff_store.v3',
      handoff: current.handoff,
      audit: [...current.audit, audit],
      draft: current.draft,
      order,
    }
    if (!isHandoffStore(store)) return null
    globalThis.localStorage?.setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))
    const restored = readWebsiteEcommerceHandoff()
    return restored?.order?.id === orderId
      && restored.order.idempotencyKey === draftId
      && restored.order.completion.auditEventId === auditEventId
      && restored.audit.length === current.audit.length + 1
      ? restored
      : null
  } catch {
    return null
  }
}

export async function completeWebsiteOrderDraft(draftId: string, input: WebsiteOrderCompletionInput) {
  try {
    if (!draftIdPattern.test(draftId) || !isWebsiteOrderCompletionInput(input) || !globalThis.navigator?.locks) return null
    return await globalThis.navigator.locks.request(handoffMutationLock, { mode: 'exclusive' }, () => completeWebsiteOrderDraftWithLock(draftId, input))
  } catch {
    return null
  }
}
