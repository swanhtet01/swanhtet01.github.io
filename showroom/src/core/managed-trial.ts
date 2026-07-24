import type { Session, SupabaseClient } from '@supabase/supabase-js'


const WORKSPACE_STORAGE_KEY = 'supermega.managed.workspace.v1'
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const DEFAULT_WORKSPACE_ID = String(import.meta.env.VITE_SUPERMEGA_TRIAL_WORKSPACE_ID ?? '').trim()
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type ManagedIdentity = {
  userId: string
  email: string
  workspaceId: string
}

export type ManagedApprovalRecord = {
  approval_id: string
  command_id: string
  title: string
  proposal: Record<string, unknown>
  evidence_refs: string[]
  status: 'pending' | 'approved' | 'declined'
  requested_by: string
  requested_actor_kind: 'human' | 'service' | 'agent'
  requested_at: string
  decided_by: string
  decided_actor_kind: string
  decided_at: string
  decision_note: string
  version: number
  idempotent_replay: boolean
}

export type ManagedSurface = 'company' | 'commerce' | 'production' | 'website' | 'setup'

export type ManagedStateRecord = {
  surface: ManagedSurface
  version: number
  state: Record<string, unknown>
  updated_by: string
  updated_at: string
}

export type ManagedCommerceEvent =
  | 'commerce.workspace.initialized'
  | 'commerce.item.created'
  | 'commerce.website_intake.created'
  | 'commerce.website_intake.converted'
  | 'commerce.order.created'
  | 'commerce.order.advanced'
  | 'commerce.order.cancelled'
  | 'commerce.payment.reconciled'
  | 'commerce.refund.settled'
  | 'commerce.stock.received'
  | 'commerce.close.saved'

export type ManagedWebsiteEvent =
  | 'website.workspace.initialized'
  | 'website.content.saved'
  | 'website.selection.changed'
  | 'website.evidence.recorded'
  | 'website.revision.approved'
  | 'website.snapshot.recorded'

export type ManagedProductionEvent =
  | 'production.workspace.initialized'
  | 'production.job.created'
  | 'production.output.recorded'
  | 'production.issue.opened'
  | 'production.issue.resolved'
  | 'production.machine_state.changed'

export type ManagedCommandResult = {
  command_id: string
  surface: 'commerce'
  event_type: ManagedCommerceEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedWebsiteCommandResult = {
  command_id: string
  surface: 'website'
  event_type: ManagedWebsiteEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedProductionCommandResult = {
  command_id: string
  surface: 'production'
  event_type: ManagedProductionEvent
  version: number
  state: Record<string, unknown>
  idempotent_replay: boolean
}

export type ManagedCommandEvidence = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type ManagedBootstrap = {
  identity: {
    workspace_id: string
    actor_id: string
    actor_kind: 'human' | 'service' | 'agent'
  }
  readiness: Record<string, unknown>
  states: Record<ManagedSurface, ManagedStateRecord>
  approvals: ManagedApprovalRecord[]
}

type ManagedApprovalRequest = {
  command_id: string
  title: string
  proposal: object
  evidence_refs: string[]
}

type ManagedApprovalDecision = {
  command_id: string
  decision: 'approved' | 'declined'
  note: string
}

type ErrorBody = {
  detail?: string | { code?: string; message?: string; blockers?: string[] }
  error_description?: string
  message?: string
}

export class ManagedTrialError extends Error {
  status: number
  code: string

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'ManagedTrialError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'managed_trial_error'
  }
}

let clientPromise: Promise<SupabaseClient | null> | undefined

function validSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
  } catch {
    return false
  }
}

function decodeLegacyKeyRole(value: string) {
  try {
    const parts = value.split('.')
    if (parts.length !== 3) return ''
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(window.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: string }
    return decoded.role ?? ''
  } catch {
    return ''
  }
}

function validPublishableKey(value: string) {
  if (value.startsWith('sb_publishable_')) return value.length >= 24
  return decodeLegacyKeyRole(value) === 'anon'
}

export function managedTrialAuthConfigured() {
  return validSupabaseUrl(SUPABASE_URL) && validPublishableKey(SUPABASE_PUBLISHABLE_KEY)
}

function authClient() {
  if (clientPromise) return clientPromise
  if (!managedTrialAuthConfigured()) return Promise.resolve(null)
  clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey: 'supermega.auth.session.v1',
    },
  }))
  return clientPromise
}

function normalizeWorkspaceId(value: string) {
  const workspaceId = value.trim()
  if (!WORKSPACE_ID.test(workspaceId)) {
    throw new ManagedTrialError('Enter a valid managed workspace ID.', { code: 'workspace_invalid' })
  }
  return workspaceId
}

export function currentManagedWorkspace() {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? ''
    if (WORKSPACE_ID.test(stored)) return stored
  } catch {
    // The configured workspace remains available when storage is disabled.
  }
  return WORKSPACE_ID.test(DEFAULT_WORKSPACE_ID) ? DEFAULT_WORKSPACE_ID : ''
}

function rememberWorkspace(value: string) {
  const workspaceId = normalizeWorkspaceId(value)
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId)
  } catch {
    // Workspace identity is still sent for this session and rechecked by the server.
  }
  return workspaceId
}

function identity(session: Session, workspaceId: string): ManagedIdentity {
  return {
    userId: session.user.id,
    email: session.user.email ?? 'Named user',
    workspaceId,
  }
}

export async function currentManagedIdentity(): Promise<ManagedIdentity | null> {
  const supabase = await authClient()
  const workspaceId = currentManagedWorkspace()
  if (!supabase || !workspaceId) return null
  // The browser session is used only to forward its JWT. The API verifies the
  // token with Supabase Auth and authorizes it through workspace membership.
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.is_anonymous !== false) return null
  return identity(data.session, workspaceId)
}

export async function signInManagedTrial(email: string, password: string, workspace: string) {
  const supabase = await authClient()
  if (!supabase) {
    throw new ManagedTrialError('Managed sign-in is not configured in this app build.', { code: 'auth_not_configured' })
  }
  const workspaceId = rememberWorkspace(workspace)
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session || data.user.is_anonymous !== false) {
    throw new ManagedTrialError('Sign-in failed. Check the account and password.', {
      status: error?.status,
      code: error?.code ?? 'sign_in_failed',
    })
  }
  return identity(data.session, workspaceId)
}

export async function signOutManagedTrial() {
  const supabase = await authClient()
  if (supabase) await supabase.auth.signOut({ scope: 'local' })
}

async function parseError(response: Response) {
  let body: ErrorBody = {}
  try {
    body = await response.json() as ErrorBody
  } catch {
    // Use the status fallback when the API did not return its JSON error contract.
  }
  const detail = typeof body.detail === 'object' && body.detail ? body.detail : {}
  const code = detail.code || `http_${response.status}`
  const blockers = Array.isArray(detail.blockers) ? ` (${detail.blockers.join(', ')})` : ''
  const message = detail.message
    || (typeof body.detail === 'string' ? body.detail : '')
    || body.error_description
    || body.message
    || 'Managed workspace request failed.'
  return new ManagedTrialError(`${message}${blockers}`, { status: response.status, code })
}

async function sessionForRequest() {
  const supabase = await authClient()
  if (!supabase) throw new ManagedTrialError('Managed sign-in is not configured.', { code: 'auth_not_configured' })
  const workspaceId = normalizeWorkspaceId(currentManagedWorkspace())
  let { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new ManagedTrialError('Sign in to the managed workspace first.', { code: 'auth_required' })
  if (data.session.expires_at && data.session.expires_at * 1000 <= Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession()
    data = refreshed.data
    error = refreshed.error
  }
  if (error || !data.session || data.session.user.is_anonymous !== false) {
    throw new ManagedTrialError('The managed session expired. Sign in again.', { code: 'auth_expired' })
  }
  return { session: data.session, workspaceId }
}

async function authorizedRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { session, workspaceId } = await sessionForRequest()
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('authorization', `Bearer ${session.access_token}`)
  headers.set('x-supermega-workspace-id', workspaceId)
  if (init.body) headers.set('content-type', 'application/json')
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401 && retry) {
    const supabase = await authClient()
    const refreshed = await supabase?.auth.refreshSession()
    if (refreshed?.data.session && !refreshed.error) return authorizedRequest<T>(path, init, false)
  }
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<T>
}

export function loadManagedBootstrap() {
  return authorizedRequest<ManagedBootstrap>('/api/trial/v1/bootstrap')
}

export async function saveManagedCommerceCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedCommerceEvent
  expectedVersion: number
  state: Record<string, unknown>
}) {
  const response = await authorizedRequest<{ result: ManagedCommandResult }>('/api/trial/v1/commands', {
    method: 'POST',
    body: JSON.stringify({
      command_id: request.commandId,
      surface: 'commerce',
      event_type: request.eventType,
      expected_version: request.expectedVersion,
      payload: { state: request.state, evidence: request.evidence },
    }),
  })
  return response.result
}

export async function saveManagedProductionCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedProductionEvent
  expectedVersion: number
  state: Record<string, unknown>
}) {
  const response = await authorizedRequest<{ result: ManagedProductionCommandResult }>('/api/trial/v1/commands', {
    method: 'POST',
    body: JSON.stringify({
      command_id: request.commandId,
      surface: 'production',
      event_type: request.eventType,
      expected_version: request.expectedVersion,
      payload: { state: request.state, evidence: request.evidence },
    }),
  })
  return response.result
}

export async function saveManagedWebsiteCommand(request: {
  commandId: string
  evidence: ManagedCommandEvidence
  eventType: ManagedWebsiteEvent
  expectedVersion: number
  state: object
}) {
  const response = await authorizedRequest<{ result: ManagedWebsiteCommandResult }>('/api/trial/v1/commands', {
    method: 'POST',
    body: JSON.stringify({
      command_id: request.commandId,
      surface: 'website',
      event_type: request.eventType,
      expected_version: request.expectedVersion,
      payload: { state: request.state, evidence: request.evidence },
    }),
  })
  return response.result
}

export async function createManagedApproval(request: ManagedApprovalRequest) {
  const response = await authorizedRequest<{ approval: ManagedApprovalRecord }>('/api/trial/v1/approvals', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return response.approval
}

export async function decideManagedApproval(approvalId: string, decision: ManagedApprovalDecision) {
  const response = await authorizedRequest<{ approval: ManagedApprovalRecord }>(
    `/api/trial/v1/approvals/${encodeURIComponent(approvalId)}/decision`,
    { method: 'POST', body: JSON.stringify(decision) },
  )
  return response.approval
}
