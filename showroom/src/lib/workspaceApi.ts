const configuredBase = import.meta.env.VITE_WORKSPACE_API_BASE?.trim() ?? ''
const configuredAppBase = import.meta.env.VITE_WORKSPACE_APP_BASE?.trim() ?? ''

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function inferApiBase() {
  if (configuredBase) {
    return configuredBase.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { hostname, origin, protocol, port } = window.location
  if (port === '8787') {
    return origin
  }

  if (isLocalHost(hostname)) {
    return `${protocol}//${hostname}:8787`
  }

  return ''
}

function inferAppBase() {
  if (configuredAppBase) {
    return configuredAppBase.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { hostname, origin, port } = window.location
  if (port === '8787') {
    return origin
  }

  if (isLocalHost(hostname)) {
    return `http://${hostname}:8787`
  }

  return ''
}

export const workspaceApiBase = inferApiBase()
export const workspaceAppBase = inferAppBase()
const publicWorkspaceProfileKey = 'supermega.publicWorkspaceProfile.v1'

export type PublicWorkspaceProfile = {
  name: string
  email: string
  company: string
}

function normalizePublicWorkspaceProfile(profile?: Partial<PublicWorkspaceProfile> | null): PublicWorkspaceProfile {
  return {
    name: String(profile?.name ?? '').trim(),
    email: String(profile?.email ?? '').trim().toLowerCase(),
    company: String(profile?.company ?? '').trim(),
  }
}

export function hasLiveWorkspaceApi() {
  return Boolean(workspaceApiBase)
}

export function hasLiveWorkspaceApp() {
  return Boolean(workspaceAppBase)
}

export function publicShellOnly() {
  if (typeof window === 'undefined') {
    return false
  }

  const { hostname, port } = window.location
  return !isLocalHost(hostname) && port !== '8787' && !hasLiveWorkspaceApi() && !hasLiveWorkspaceApp()
}

export function appHref(path = '/', fallback = '/book') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!workspaceAppBase) {
    return fallback
  }
  return `${workspaceAppBase}${normalizedPath}`
}

export function needsLiveAppHandoff() {
  if (typeof window === 'undefined') {
    return false
  }

  if (!workspaceAppBase) {
    return false
  }

  return workspaceAppBase !== window.location.origin
}

export function loadPublicWorkspaceProfile(): PublicWorkspaceProfile {
  if (typeof window === 'undefined') {
    return normalizePublicWorkspaceProfile()
  }

  try {
    const raw = window.localStorage.getItem(publicWorkspaceProfileKey)
    if (!raw) {
      return normalizePublicWorkspaceProfile()
    }
    return normalizePublicWorkspaceProfile(JSON.parse(raw) as Partial<PublicWorkspaceProfile>)
  } catch {
    return normalizePublicWorkspaceProfile()
  }
}

export function savePublicWorkspaceProfile(profile: Partial<PublicWorkspaceProfile>) {
  if (typeof window === 'undefined') {
    return normalizePublicWorkspaceProfile(profile)
  }

  const normalized = normalizePublicWorkspaceProfile(profile)
  try {
    window.localStorage.setItem(publicWorkspaceProfileKey, JSON.stringify(normalized))
  } catch {
    // Ignore storage failures and keep using the in-memory value.
  }
  return normalized
}

export function isPublicWorkspaceProfileReady(profile?: Partial<PublicWorkspaceProfile> | null) {
  const normalized = normalizePublicWorkspaceProfile(profile)
  return Boolean(normalized.email && normalized.company)
}

export async function workspaceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = workspaceApiBase
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = String(payload?.detail || payload?.message || '').trim()
    } catch {
      try {
        detail = (await response.text()).trim()
      } catch {
        detail = ''
      }
    }
    const error = new Error(detail || `Workspace API request failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return (await response.json()) as T
}

export async function checkWorkspaceHealth() {
  if (typeof window === 'undefined') {
    return { ready: false as const }
  }

  try {
    const payload = await workspaceFetch<{ status?: string }>('/api/health')
    return { ready: payload.status === 'ready' }
  } catch {
    return { ready: false as const }
  }
}

export type WorkspaceSessionPayload = {
  status?: string
  auth_required?: boolean
  authenticated?: boolean
  uses_default_credentials?: boolean
  workspaces?: Array<{
    workspace_id?: string
    slug?: string
    name?: string
    plan?: string
    role?: string
  }>
  session?: {
    username?: string
    display_name?: string
    role?: string
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_plan?: string
  } | null
}

export async function getWorkspaceSession() {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/session')
}

export async function loginWorkspace(username: string, password: string, workspaceSlug = '') {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, workspace_slug: workspaceSlug }),
  })
}

export async function logoutWorkspace() {
  return workspaceFetch<{ status?: string; authenticated?: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function bootstrapPublicWorkspace(payload?: {
  name?: string
  email?: string
  company?: string
  workspace_slug?: string
  goal?: string
}) {
  return workspaceFetch<WorkspaceSessionPayload & { generated_password?: string; reused?: boolean }>('/api/public/workspace/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export async function savePublicLeadsToWorkspace(payload: {
  name?: string
  email?: string
  company?: string
  workspace_slug?: string
  goal?: string
  campaign_goal?: string
  rows: Array<Record<string, unknown>>
}) {
  return workspaceFetch<WorkspaceSessionPayload & {
    generated_password?: string
    reused?: boolean
    saved_count?: number
    saved_lead_ids?: string[]
    saved_task_count?: number
    saved_task_ids?: string[]
    rows?: Array<Record<string, unknown>>
    tasks?: Array<Record<string, unknown>>
    summary?: Record<string, unknown>
    saved_at?: string
  }>('/api/public/workspace/save-leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function importLeadPipeline(rows: Array<Record<string, unknown>>, campaignGoal = '') {
  return workspaceFetch<{
    status?: string
    saved_count?: number
    saved_lead_ids?: string[]
    rows?: Array<Record<string, unknown>>
    summary?: Record<string, unknown>
  }>('/api/lead-pipeline/import', {
    method: 'POST',
    body: JSON.stringify({
      rows,
      campaign_goal: campaignGoal,
    }),
  })
}

export type WorkspaceLeadRow = {
  lead_id: string
  company_name: string
  stage: string
  status: string
  owner: string
  campaign_goal: string
  service_pack: string
  wedge_product: string
  contact_email: string
  contact_phone: string
  website: string
  source: string
  source_url: string
  provider: string
  score: number
  notes: string
  outreach_subject: string
  outreach_message: string
  created_at: string
  synced_at: string
}

export type WorkspaceTaskRow = {
  task_id: string
  workspace_id: string
  lead_id: string
  template: string
  title: string
  owner: string
  priority: string
  due: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export async function listWorkspaceLeadPipeline(stage?: string, status?: string, limit = 200) {
  const params = new URLSearchParams()
  if (stage) {
    params.set('stage', stage)
  }
  if (status) {
    params.set('status', status)
  }
  params.set('limit', String(limit))
  return workspaceFetch<{
    status?: string
    count?: number
    summary?: Record<string, unknown>
    rows?: WorkspaceLeadRow[]
  }>(`/api/lead-pipeline?${params.toString()}`)
}

export async function updateWorkspaceLeadPipeline(
  leadId: string,
  payload: {
    stage?: string
    status?: string
    owner?: string
    notes?: string
  },
) {
  return workspaceFetch<{
    status?: string
    row?: WorkspaceLeadRow
    summary?: Record<string, unknown>
  }>(`/api/lead-pipeline/${encodeURIComponent(leadId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listWorkspaceTasks(status?: string, limit = 200) {
  const params = new URLSearchParams()
  if (status) {
    params.set('status', status)
  }
  params.set('limit', String(limit))
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: WorkspaceTaskRow[]
  }>(`/api/workspace-tasks?${params.toString()}`)
}

export async function createWorkspaceTasks(
  rows: Array<{
    title: string
    owner?: string
    priority?: string
    due?: string
    status?: string
    notes?: string
    lead_id?: string
    template?: string
  }>,
) {
  return workspaceFetch<{
    status?: string
    saved_count?: number
    saved_task_ids?: string[]
    rows?: WorkspaceTaskRow[]
  }>('/api/workspace-tasks', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}

export async function updateWorkspaceTask(
  taskId: string,
  payload: {
    status?: string
    owner?: string
    priority?: string
    due?: string
    title?: string
    notes?: string
  },
) {
  return workspaceFetch<{
    status?: string
    row?: WorkspaceTaskRow
  }>(`/api/workspace-tasks/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function removeWorkspaceTask(taskId: string) {
  return workspaceFetch<{
    status?: string
    removed?: boolean
  }>(`/api/workspace-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  })
}
