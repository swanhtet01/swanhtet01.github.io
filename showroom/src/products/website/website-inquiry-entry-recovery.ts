import { restoreWebsiteLeadLedger, type WebsiteLeadLedger } from './website-leads.ts'
import { restoreWorkspace, type WebsiteWorkspace } from './website-model.ts'

export const WEBSITE_INQUIRY_ENTRY_RECOVERY_CONTRACT = 'supermega.website.closed-inquiry-entry.v1' as const

export type WebsiteInquiryEntryDraft = Readonly<{
  name: string
  contact: string
  request: string
  consentRecorded: boolean
  sourcePageId: string
  sourcePage: string
  panelOpen: true
}>

export type WebsiteInquiryEntryRecoverySource = Readonly<{
  workspaceRevision: number
  workspaceContentRevision: number
  leadLedgerRevision: number
  stateDigest: string
}>

export type WebsiteInquiryEntryRecovery = Readonly<{
  schema: typeof WEBSITE_INQUIRY_ENTRY_RECOVERY_CONTRACT
  scope: string
  capturedAt: string
  source: WebsiteInquiryEntryRecoverySource
  draft: WebsiteInquiryEntryDraft
}>

export type WebsiteInquiryEntryRecoveryReview =
  | Readonly<{ ok: true; draft: WebsiteInquiryEntryDraft }>
  | Readonly<{ ok: false; reason: 'invalid_recovery' | 'scope_changed' | 'website_changed' }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, required: string[]) {
  const actual = Object.keys(value)
  return required.every((key) => actual.includes(key)) && actual.every((key) => required.includes(key))
}

function exactRawText(value: unknown, maximum: number) {
  return typeof value === 'string' && value.length <= maximum && !value.includes('\u0000') ? value : null
}

function exactIdentity(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value === value.trim()
    && !value.includes('\u0000')
    ? value
    : null
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

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}

function canonicalDraft(value: unknown): WebsiteInquiryEntryDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['name', 'contact', 'request', 'consentRecorded', 'sourcePageId', 'sourcePage', 'panelOpen'])
    || typeof value.consentRecorded !== 'boolean'
    || value.panelOpen !== true) return null
  const name = exactRawText(value.name, 80)
  const contact = exactRawText(value.contact, 120)
  const request = exactRawText(value.request, 500)
  const sourcePageId = exactIdentity(value.sourcePageId, 80)
  const sourcePage = exactIdentity(value.sourcePage, 120)
  if (name === null || contact === null || request === null || !sourcePageId || !sourcePage) return null
  const draft = {
    name,
    contact,
    request,
    consentRecorded: value.consentRecorded,
    sourcePageId,
    sourcePage,
    panelOpen: true as const,
  }
  return websiteInquiryEntryDraftHasContent(draft) ? draft : null
}

function canonicalSource(value: unknown): WebsiteInquiryEntryRecoverySource | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['workspaceRevision', 'workspaceContentRevision', 'leadLedgerRevision', 'stateDigest'])) return null
  const workspaceRevision = canonicalRevision(value.workspaceRevision)
  const workspaceContentRevision = canonicalRevision(value.workspaceContentRevision)
  const leadLedgerRevision = canonicalRevision(value.leadLedgerRevision)
  const stateDigest = canonicalDigest(value.stateDigest)
  if (workspaceRevision === null
    || workspaceContentRevision === null
    || workspaceContentRevision > workspaceRevision
    || leadLedgerRevision === null
    || !stateDigest) return null
  return { workspaceRevision, workspaceContentRevision, leadLedgerRevision, stateDigest }
}

function canonicalScope(value: unknown) {
  return exactIdentity(value, 256)
}

function canonicalState(workspace: WebsiteWorkspace, leadLedger: WebsiteLeadLedger) {
  const retainedWorkspace = restoreWorkspace(workspace)
  const retainedLeadLedger = restoreWebsiteLeadLedger(leadLedger)
  if (!retainedWorkspace || !retainedLeadLedger) {
    throw new Error('Website inquiry recovery requires valid Website and inquiry records.')
  }
  if (retainedWorkspace.leadLedger
    && JSON.stringify(canonicalValue(retainedWorkspace.leadLedger)) !== JSON.stringify(canonicalValue(retainedLeadLedger))) {
    throw new Error('Website inquiry recovery requires one exact inquiry ledger.')
  }
  return { workspace: retainedWorkspace, leadLedger: retainedLeadLedger }
}

export function websiteInquiryEntryDraftHasContent(draft: Pick<WebsiteInquiryEntryDraft, 'name' | 'contact' | 'request' | 'consentRecorded'>) {
  return Boolean(draft.name.length || draft.contact.length || draft.request.length || draft.consentRecorded)
}

export function websiteInquiryEntryDigestSource(workspace: WebsiteWorkspace, leadLedger: WebsiteLeadLedger) {
  return JSON.stringify(canonicalValue(canonicalState(workspace, leadLedger)))
}

export async function websiteInquiryEntryDigest(workspace: WebsiteWorkspace, leadLedger: WebsiteLeadLedger) {
  const bytes = new TextEncoder().encode(websiteInquiryEntryDigestSource(workspace, leadLedger))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function websiteInquiryEntryRecoveryStorageKey(scope: string) {
  const retainedScope = canonicalScope(scope)
  if (!retainedScope) throw new Error('Website inquiry recovery requires an exact account scope.')
  return `${WEBSITE_INQUIRY_ENTRY_RECOVERY_CONTRACT}.${encodeURIComponent(retainedScope)}`
}

export function createWebsiteInquiryEntryRecovery(
  scope: string,
  source: WebsiteInquiryEntryRecoverySource,
  draft: WebsiteInquiryEntryDraft,
  capturedAt: Date | string = new Date(),
): WebsiteInquiryEntryRecovery {
  const retainedScope = canonicalScope(scope)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!retainedScope || !retainedSource || !retainedDraft || canonicalTimestamp(capturedAtValue) === null) {
    throw new Error('Website inquiry recovery could not be created from this entry.')
  }
  return {
    schema: WEBSITE_INQUIRY_ENTRY_RECOVERY_CONTRACT,
    scope: retainedScope,
    capturedAt: capturedAtValue,
    source: retainedSource,
    draft: retainedDraft,
  }
}

export function restoreWebsiteInquiryEntryRecovery(value: unknown): WebsiteInquiryEntryRecovery | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'source', 'draft'])
      || candidate.schema !== WEBSITE_INQUIRY_ENTRY_RECOVERY_CONTRACT) return null
    return createWebsiteInquiryEntryRecovery(
      candidate.scope as string,
      candidate.source as WebsiteInquiryEntryRecoverySource,
      candidate.draft as WebsiteInquiryEntryDraft,
      candidate.capturedAt as string,
    )
  } catch {
    return null
  }
}

export function websiteInquiryEntryDraftsMatch(left: WebsiteInquiryEntryDraft, right: WebsiteInquiryEntryDraft) {
  const retainedLeft = canonicalDraft(left)
  const retainedRight = canonicalDraft(right)
  return Boolean(retainedLeft && retainedRight && JSON.stringify(retainedLeft) === JSON.stringify(retainedRight))
}

export function websiteInquiryEntryRecoveryMatchesDraft(
  recovery: WebsiteInquiryEntryRecovery,
  scope: string,
  source: WebsiteInquiryEntryRecoverySource,
  draft: WebsiteInquiryEntryDraft,
) {
  const restored = restoreWebsiteInquiryEntryRecovery(recovery)
  const retainedSource = canonicalSource(source)
  const retainedDraft = canonicalDraft(draft)
  return Boolean(restored
    && retainedSource
    && retainedDraft
    && restored.scope === scope
    && restored.source.workspaceRevision === retainedSource.workspaceRevision
    && restored.source.workspaceContentRevision === retainedSource.workspaceContentRevision
    && restored.source.leadLedgerRevision === retainedSource.leadLedgerRevision
    && restored.source.stateDigest === retainedSource.stateDigest
    && websiteInquiryEntryDraftsMatch(restored.draft, retainedDraft))
}

export function websiteInquiryEntryRecoveriesMatch(
  left: WebsiteInquiryEntryRecovery,
  right: WebsiteInquiryEntryRecovery,
) {
  const retainedLeft = restoreWebsiteInquiryEntryRecovery(left)
  const retainedRight = restoreWebsiteInquiryEntryRecovery(right)
  return Boolean(retainedLeft
    && retainedRight
    && retainedLeft.capturedAt === retainedRight.capturedAt
    && websiteInquiryEntryRecoveryMatchesDraft(retainedLeft, retainedRight.scope, retainedRight.source, retainedRight.draft))
}

export function reviewWebsiteInquiryEntryRecovery(
  recovery: WebsiteInquiryEntryRecovery,
  scope: string,
  stateDigest: string,
  workspace: WebsiteWorkspace,
  leadLedger: WebsiteLeadLedger,
): WebsiteInquiryEntryRecoveryReview {
  const restored = restoreWebsiteInquiryEntryRecovery(recovery)
  const retainedDigest = canonicalDigest(stateDigest)
  let current: ReturnType<typeof canonicalState>
  try {
    current = canonicalState(workspace, leadLedger)
  } catch {
    return { ok: false, reason: 'invalid_recovery' }
  }
  if (!restored || !retainedDigest) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  if (restored.source.workspaceRevision !== current.workspace.revision
    || restored.source.workspaceContentRevision !== current.workspace.contentRevision
    || restored.source.leadLedgerRevision !== current.leadLedger.revision
    || restored.source.stateDigest !== retainedDigest) return { ok: false, reason: 'website_changed' }
  const sourcePage = current.workspace.pages.find((page) => page.id === restored.draft.sourcePageId)
  if (!sourcePage || sourcePage.slug !== restored.draft.sourcePage) return { ok: false, reason: 'invalid_recovery' }
  return { ok: true, draft: restored.draft }
}
