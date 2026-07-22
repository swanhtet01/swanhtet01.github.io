import {
  WEBSITE_STORAGE_KEY,
  readinessChecks,
  restoreWorkspace,
  workspaceFingerprint,
  type WebsiteWorkspace,
} from './website/website-model'

export const WEBSITE_ECOMMERCE_HANDOFF_KEY = 'supermega.website-ecommerce-handoff.v1'

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

type HandoffStore = {
  schema: 'website_ecommerce_handoff_store.v1' | 'website_ecommerce_handoff_store.v2'
  handoff: WebsiteEcommerceHandoff
  audit: WebsiteHandoffAuditEvent[]
  draft?: WebsiteOrderDraft
}

export type WebsiteEcommerceHandoffContext = Omit<HandoffStore, 'draft'> & {
  draft: WebsiteOrderDraft | null
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
const draftIdPattern = /^EOD-[A-Z0-9]{6,32}$/
const fingerprintPattern = /^web-[a-f0-9]{8}$/
const skuPattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/

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

function createId(prefix: 'WEH' | 'WHA') {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    : Date.now().toString(36)
  return `${prefix}-${suffix.toUpperCase()}`
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
  if (!isRecord(line) || !hasExactKeys(line, ['sku', 'itemName', 'variant', 'quantity', 'unitPriceMmk'])) return false
  if (typeof line.sku !== 'string' || !skuPattern.test(line.sku) || !isTrimmedText(line.itemName, 120) || !isTrimmedText(line.variant, 120)) return false
  if (typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return false
  if (typeof line.unitPriceMmk !== 'number' || !Number.isSafeInteger(line.unitPriceMmk) || line.unitPriceMmk <= 0) return false
  if (typeof value.totalMmk !== 'number' || !Number.isSafeInteger(value.totalMmk) || value.totalMmk !== line.quantity * line.unitPriceMmk) return false
  return Array.isArray(value.missingFields)
    && value.missingFields.length === 3
    && value.missingFields[0] === 'customer_reference'
    && value.missingFields[1] === 'fulfilment_method'
    && value.missingFields[2] === 'payment_method'
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

function isHandoffStore(value: unknown): value is HandoffStore {
  if (!isRecord(value)) return false
  const hasDraft = hasExactKeys(value, ['schema', 'handoff', 'audit', 'draft'])
  if (!hasDraft && !hasExactKeys(value, ['schema', 'handoff', 'audit'])) return false
  const isV1 = value.schema === 'website_ecommerce_handoff_store.v1'
  const isV2 = value.schema === 'website_ecommerce_handoff_store.v2'
  if ((!isV1 && !isV2) || (isV1 && hasDraft) || (isV2 && !hasDraft)) return false
  if (!isWebsiteEcommerceHandoff(value.handoff) || !Array.isArray(value.audit)) return false
  const audit = value.audit
  if (!audit.every(isWebsiteHandoffAuditEvent)) return false
  if (value.handoff.state === 'pending_acceptance') return isV1 && audit.length === 0
  const auditMatches = audit.length === 1
    && audit[0].id === value.handoff.acceptance.auditEventId
    && audit[0].subjectId === value.handoff.id
    && audit[0].actor === value.handoff.acceptance.operatorId
    && audit[0].createdAt === value.handoff.acceptance.acceptedAt
    && audit[0].evidenceReference === value.handoff.source.localPublishId
  if (!auditMatches || isV1) return auditMatches
  if (!isWebsiteOrderDraft(value.draft)) return false
  const line = value.draft.lines[0]
  return value.draft.id === `EOD-${value.handoff.id.slice(4)}`
    && value.draft.idempotencyKey === value.handoff.id
    && Date.parse(value.draft.createdAt) >= Date.parse(value.handoff.acceptance.acceptedAt)
    && value.draft.source.handoffId === value.handoff.id
    && line.sku === value.handoff.intake.sku
    && line.quantity === value.handoff.intake.quantity
}

function validateAgainstWorkspace(handoff: WebsiteEcommerceHandoff, workspace: WebsiteWorkspace) {
  const fingerprint = workspaceFingerprint(workspace)
  const approval = workspace.approval
  const publish = workspace.localPublishes[0]
  const readyPageIds = workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id)
  const page = workspace.pages.find((candidate) => candidate.id === handoff.source.pageId)

  if (fingerprint !== handoff.source.fingerprint || !readinessChecks(workspace, fingerprint).every((check) => check.passed)) return null
  if (!approval || approval.id !== handoff.source.approvalId || approval.fingerprint !== fingerprint) return null
  if (!isTrimmedText(approval.reviewer, 80) || !isTrimmedText(approval.note, 240) || !isIsoTimestamp(approval.approvedAt)) return null
  if (!publish || publish.id !== handoff.source.localPublishId || publish.fingerprint !== fingerprint) return null
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
    return { ...store, draft: store.draft ?? null, display }
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
