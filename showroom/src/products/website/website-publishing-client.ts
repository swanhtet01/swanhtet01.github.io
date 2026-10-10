import { sessionForRequest, type ManagedIdentity } from '../../core/managed-trial'

export type Publication = { channelId: string; pageId: string; sourceVersion: number; enabled: boolean; artifactDigest: string; snapshotId: string; publishedAt: string }
export type PublishSource = { version: number; snapshotId: string; artifactDigest: string }
export type PublicationStatus = { publicOrigin: string; source: PublishSource | null; publications: Publication[] }
export type InquiryOperation = 'claim' | 'release' | 'complete' | 'reopen' | 'note'
export type InquiryWorkflow = { status: 'new' | 'in_progress' | 'done'; revision: number; assignedTo: string | null; updatedBy: string | null; updatedAt: string | null }
export type CustomerInquiry = InquiryWorkflow & { channelId: string; requestId: string; name: string; contact: string; message: string; siteName: string; sourcePage: string; receivedAt: string; note: string }
export type InboxPage = { inquiries: CustomerInquiry[]; nextBefore: [string, string, string] | null; counts: { open: number; done: number } }
export type PublishingClient = ReturnType<typeof createPublishingClient>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const digest = /^sha256:[0-9a-f]{64}$/
const invalid = () => new Error('The website response could not be verified. Refresh and try again.')
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
function text(value: unknown, limit: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || value.length > limit || (pattern && !pattern.test(value))) throw invalid()
  return value
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw invalid()
  return value
}
function timestamp(value: unknown): string {
  const date = text(value, 64)
  if (!Number.isFinite(Date.parse(date))) throw invalid()
  return date
}
export function parsePublicationStatus(value: unknown): PublicationStatus {
  const body = record(value)
  const publicOrigin = text(body.publicOrigin, 256)
  const url = new URL(publicOrigin)
  if (url.protocol !== 'https:' || url.origin !== publicOrigin || url.username || url.password) throw invalid()
  const source = body.source === null ? null : record(body.source)
  if (!Array.isArray(body.publications) || body.publications.length > 25) throw invalid()
  return { publicOrigin, source: source ? { version: version(source.version), snapshotId: text(source.snapshotId, 160), artifactDigest: text(source.artifactDigest, 71, digest) } : null,
    publications: body.publications.map(value => {
      const entry = record(value)
      if (typeof entry.enabled !== 'boolean') throw invalid()
      return { channelId: text(entry.channelId, 36, uuid), pageId: text(entry.pageId, 80), sourceVersion: version(entry.sourceVersion),
        enabled: entry.enabled, artifactDigest: text(entry.artifactDigest, 71, digest), snapshotId: text(entry.snapshotId, 160), publishedAt: timestamp(entry.publishedAt) }
    }) }
}
export function parseInboxPage(value: unknown): InboxPage {
  const body = record(value)
  if (!Array.isArray(body.inquiries) || body.inquiries.length > 50) throw invalid()
  const next = body.nextBefore
  if (next !== null && (!Array.isArray(next) || next.length !== 3)) throw invalid()
  const counts = record(body.counts)
  if (![counts.open, counts.done].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) throw invalid()
  return { counts: { open: counts.open as number, done: counts.done as number }, nextBefore: next === null ? null : [timestamp(next[0]), text(next[1], 36, uuid), text(next[2], 36, uuid)],
    inquiries: body.inquiries.map(value => {
      const entry = record(value)
      if (typeof entry.note !== 'string' || [...entry.note].length > 800) throw invalid()
      return { channelId: text(entry.channelId, 36, uuid), requestId: text(entry.requestId, 36, uuid), name: text(entry.name, 160),
        contact: text(entry.contact, 240), message: text(entry.message, 1000), siteName: text(entry.siteName, 120),
        sourcePage: text(entry.sourcePage, 240), receivedAt: timestamp(entry.receivedAt), note: entry.note, ...parseWorkflow(entry) }
    }) }
}

function parseWorkflow(entry: Record<string, unknown>): InquiryWorkflow {
  if (!['new', 'in_progress', 'done'].includes(String(entry.status))) throw invalid()
  const state = { status: entry.status as InquiryWorkflow['status'], revision: version(entry.revision),
    assignedTo: entry.assignedTo === null ? null : text(entry.assignedTo, 120),
    updatedBy: entry.updatedBy === null ? null : text(entry.updatedBy, 120),
    updatedAt: entry.updatedAt === null ? null : timestamp(entry.updatedAt) }
  if ((state.status === 'new') !== (state.assignedTo === null)
    || (state.revision === 1 && (state.status !== 'new' || state.updatedAt !== null || state.updatedBy !== null))
    || (state.revision > 1 && (!state.updatedAt || !state.updatedBy))) throw invalid()
  return state
}

export function createPublishingClient(identity: ManagedIdentity) {
  async function request(path: string, signal: AbortSignal, body?: object): Promise<unknown> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(abort, 20_000)
    try {
      const { session, workspaceId } = await sessionForRequest(identity)
      controller.signal.throwIfAborted()
      const response = await fetch(`/api/trial/v1/${path}`, {
        method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { authorization: `Bearer ${session.access_token}`, 'x-supermega-workspace-id': workspaceId,
          accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(response.status === 401 || response.status === 403 ? 'Sign in to this workspace to continue.'
          : response.status === 503 ? 'Website hosting is not available for this workspace yet.'
          : response.status === 409 ? path.startsWith('website-inbox') ? 'This inquiry changed. Refresh to see the latest update before trying again.' : 'Your saved website changed. Refresh before publishing.'
          : 'This could not be completed. Refresh to check the latest status before trying again.')
      }
      if (!response.body || !response.headers.get('content-type')?.startsWith('application/json')) {
        await response.body?.cancel(); throw invalid()
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []; let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.length
          if (size > 192 * 1024) throw invalid()
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      await sessionForRequest(identity)
      controller.signal.throwIfAborted()
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
  }
  return {
    async status(signal: AbortSignal) { return parsePublicationStatus(await request('website-publications', signal)) },
    async inbox(signal: AbortSignal, before: InboxPage['nextBefore'] = null, view: 'open' | 'done' = 'open') {
      const params = new URLSearchParams(view === 'done' ? { view } : {})
      if (before) { params.set('beforeTime', before[0]); params.set('beforeChannel', before[1]); params.set('beforeRequest', before[2]) }
      const query = params.size ? '?' + params : ''
      return parseInboxPage(await request('website-inbox' + query, signal))
    },
    async changeInquiry(inquiry: Pick<CustomerInquiry, 'channelId' | 'requestId' | 'revision'>, operation: InquiryOperation, actionId: string, note: string, signal: AbortSignal) {
      text(inquiry.channelId, 36, uuid); text(inquiry.requestId, 36, uuid); text(actionId, 36, uuid); version(inquiry.revision)
      if (!['claim', 'release', 'complete', 'reopen', 'note'].includes(operation) || [...note].length > 800 || (operation !== 'note' && note)) throw invalid()
      const result = record(await request(`website-inbox/${inquiry.channelId}/${inquiry.requestId}/actions`, signal,
        { actionId, expectedRevision: inquiry.revision, operation, note }))
      const workflow = parseWorkflow(result)
      if (result.channelId !== inquiry.channelId || result.requestId !== inquiry.requestId || result.actionId !== actionId || workflow.revision !== inquiry.revision + 1) throw invalid()
      return workflow
    },
    async publish(channelId: string, pageId: string, status: PublicationStatus, signal: AbortSignal) {
      text(channelId, 36, uuid); text(pageId, 80)
      if (!status.source) throw new Error('Review and save a site version before publishing.')
      const prepared = record(await request('website-inquiry-channels', signal, {
        channelId, pageId, expectedVersion: status.source.version, origin: status.publicOrigin,
      }))
      if (prepared.channelId !== channelId || typeof prepared.enabled !== 'boolean') throw invalid()
      const result = record(await request(`website-inquiry-channels/${channelId}/publish`, signal, { expectedVersion: status.source.version }))
      if (result.channelId !== channelId || result.enabled !== true || result.artifactDigest !== status.source.artifactDigest) throw invalid()
    },
    async withdraw(publication: Publication, signal: AbortSignal) {
      text(publication.channelId, 36, uuid); text(publication.artifactDigest, 71, digest)
      const result = record(await request(`website-inquiry-channels/${publication.channelId}/unpublish`, signal, { artifactDigest: publication.artifactDigest }))
      if (result.channelId !== publication.channelId || result.enabled !== false) throw invalid()
    },
  }
}
