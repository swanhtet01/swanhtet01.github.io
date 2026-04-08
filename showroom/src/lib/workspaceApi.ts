import { getTenantConfig } from './tenantConfig'

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

export type GoogleAuthConfig = {
  enabled?: boolean
  redirect_uri?: string
  allowed_domains?: string[]
  auto_provision?: boolean
  start_url?: string
}

export type PublicWorkspaceProfile = {
  name: string
  email: string
  company: string
}

function normalizePublicWorkspaceProfile(profile?: Partial<PublicWorkspaceProfile> | null): PublicWorkspaceProfile {
  const tenant = getTenantConfig()
  const tenantCompany = String(tenant.defaultCompany ?? '').trim()
  return {
    name: String(profile?.name ?? '').trim(),
    email: String(profile?.email ?? '').trim().toLowerCase(),
    company: String(profile?.company ?? tenantCompany).trim(),
  }
}

function withTenantWorkspaceDefaults<T extends { company?: string; workspace_slug?: string }>(payload?: T): T {
  const tenant = getTenantConfig()
  const tenantCompany = String(tenant.defaultCompany ?? '').trim()
  const tenantWorkspaceSlug = String(tenant.defaultWorkspaceSlug ?? '').trim()
  return {
    ...(payload ?? ({} as T)),
    company: String(payload?.company ?? tenantCompany).trim() || tenantCompany,
    workspace_slug: String(payload?.workspace_slug ?? tenantWorkspaceSlug).trim() || tenantWorkspaceSlug,
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

export function appHref(path = '/', fallback = '/contact') {
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

export type ContactSubmissionPayload = {
  name: string
  email: string
  company: string
  workflow: string
  data: string
  goal: string
}

export async function createContactSubmission(payload: ContactSubmissionPayload) {
  return workspaceFetch<{
    status?: string
    message?: string
    request?: Record<string, unknown>
    pipeline?: Record<string, unknown>
  }>('/api/contact-submissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type WorkspaceSessionPayload = {
  status?: string
  auth_required?: boolean
  authenticated?: boolean
  uses_default_credentials?: boolean
  google_auth?: GoogleAuthConfig
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

function workspaceAuthBase() {
  if (workspaceApiBase) {
    return workspaceApiBase
  }
  if (workspaceAppBase) {
    return workspaceAppBase
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function googleAuthHref(
  mode: 'login' | 'signup',
  options?: {
    next?: string
    workspaceSlug?: string
    company?: string
    name?: string
    email?: string
  },
) {
  const base = workspaceAuthBase().replace(/\/$/, '')
  if (!base) {
    return '/login'
  }
  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('next', options?.next || '/app/hq')
  if (options?.workspaceSlug?.trim()) {
    params.set('workspace_slug', options.workspaceSlug.trim())
  }
  if (options?.company?.trim()) {
    params.set('company', options.company.trim())
  }
  if (options?.name?.trim()) {
    params.set('name', options.name.trim())
  }
  if (options?.email?.trim()) {
    params.set('email', options.email.trim())
  }
  return `${base}/api/auth/google/start?${params.toString()}`
}

export type TeamMemberRow = {
  membership_id: string
  workspace_id: string
  username: string
  email: string
  display_name: string
  role: string
  status: string
  created_at: string
  updated_at: string
}

export async function listTeamMembers() {
  return workspaceFetch<{
    status?: string
    count?: number
    rows: TeamMemberRow[]
  }>('/api/team/members')
}

export async function inviteTeamMember(payload: {
  email: string
  name?: string
  role?: string
  password?: string
}) {
  return workspaceFetch<{
    status?: string
    created?: boolean
    generated_password?: string
    row?: TeamMemberRow | null
    count?: number
    rows?: TeamMemberRow[]
  }>('/api/team/members', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      name: payload.name ?? '',
      role: payload.role ?? 'member',
      password: payload.password ?? '',
    }),
  })
}

export type AgentRunRow = {
  run_id: string
  workspace_id: string
  job_type: string
  source: string
  status: string
  summary: string
  triggered_by: string
  created_at: string
  started_at: string
  completed_at: string
  error_text: string
  result?: Record<string, unknown>
}

export type AgentJobTemplate = {
  job_type: string
  name: string
  cadence: string
  description: string
  last_run?: AgentRunRow | null
}

export async function listAgentRuns(limit = 20, jobType = '', status = '') {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (jobType) {
    params.set('job_type', jobType)
  }
  if (status) {
    params.set('status', status)
  }
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: AgentRunRow[]
    jobs?: AgentJobTemplate[]
  }>(`/api/agent-runs?${params.toString()}`)
}

export async function runAgentJob(payload: {
  job_type: string
  source?: string
  payload?: Record<string, unknown>
  idempotency_key?: string
}) {
  return workspaceFetch<{
    status?: string
    row?: AgentRunRow
    jobs?: AgentJobTemplate[]
  }>('/api/agent-runs', {
    method: 'POST',
    body: JSON.stringify({
      job_type: payload.job_type,
      source: payload.source ?? 'manual',
      payload: payload.payload ?? {},
      idempotency_key: payload.idempotency_key ?? '',
    }),
  })
}

export async function runDefaultAgentJobs(jobTypes?: string[]) {
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: AgentRunRow[]
    jobs?: AgentJobTemplate[]
  }>('/api/agent-runs/run-defaults', {
    method: 'POST',
    body: JSON.stringify({
      source: 'manual_batch',
      job_types: jobTypes ?? [],
    }),
  })
}

export async function loginWorkspace(username: string, password: string, workspaceSlug = '') {
  const tenant = getTenantConfig()
  const defaultWorkspaceSlug = String(tenant.defaultWorkspaceSlug ?? '').trim()
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, workspace_slug: workspaceSlug || defaultWorkspaceSlug }),
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
  const mergedPayload = withTenantWorkspaceDefaults(payload)
  return workspaceFetch<WorkspaceSessionPayload & { generated_password?: string; reused?: boolean }>('/api/public/workspace/bootstrap', {
    method: 'POST',
    body: JSON.stringify(mergedPayload),
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
  const mergedPayload = withTenantWorkspaceDefaults(payload)
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
    body: JSON.stringify(mergedPayload),
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

export type DataVisibilityConnector = {
  key: string
  label: string
  category: string
  status: string
  mode: string
  evidence: string
  updated_at?: string
  destinations?: string[]
  next_step?: string
}

export type DataVisibilityMemoryStore = {
  key: string
  label: string
  kind: string
  status: string
  evidence: string
  updated_at?: string
  connected_surfaces?: string[]
  next_step?: string
}

export type DataVisibilityLinkage = {
  key: string
  source: string
  memory: string
  surfaces: string[]
  note?: string
}

export type DataVisibilityKpiSurface = {
  key: string
  label: string
  status: string
  source: string
  metrics: string[]
  evidence: string
  next_step?: string
}

export type DataVisibilityGraphBucket = {
  type: string
  count: number
}

export type DataVisibilityGraphEntity = {
  entity_id: string
  entity_type: string
  label: string
  status: string
  source_system?: string
  source_ref?: string
  updated_at?: string
}

export type DataVisibilityGraphSummary = {
  status?: string
  entity_count?: number
  edge_count?: number
  entity_types?: DataVisibilityGraphBucket[]
  relation_types?: DataVisibilityGraphBucket[]
  recent_entities?: DataVisibilityGraphEntity[]
  last_sync_at?: string
}

export type DataVisibilityPayload = {
  status?: string
  statement?: string
  manual_entry_note?: string
  workspace?: {
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_count?: number
    team_member_count?: number
    last_sync_at?: string
  }
  links?: {
    workspace_export?: string
    founder_brief?: string
    gmail_compose?: string
  }
  summary?: {
    connector_count?: number
    connected_source_count?: number
    memory_surface_count?: number
    kpi_surface_count?: number
    manual_surface_count?: number
    agent_run_count?: number
    unresolved_gap_count?: number
    graph_entity_count?: number
    graph_edge_count?: number
    last_sync_at?: string
  }
  connectors?: DataVisibilityConnector[]
  connector_details?: {
    google_drive?: {
      status?: string
      message?: string
      service_account_email?: string
      folder_id?: string
      folder_name?: string
      drive_user?: string
      children_count_sampled?: number
    }
    gmail?: {
      status?: string
      message?: string
      email_address?: string
      messages_total?: number
    }
  }
  memory?: DataVisibilityMemoryStore[]
  linkage?: DataVisibilityLinkage[]
  kpi_surfaces?: DataVisibilityKpiSurface[]
  graph?: DataVisibilityGraphSummary
  next_steps?: string[]
}

export async function getDataVisibility() {
  return workspaceFetch<DataVisibilityPayload>('/api/platform/data-visibility')
}

export type DevStatusPayload = {
  status?: string
  mode?: string
  reason?: string
  repo?: {
    root?: string
    git_present?: boolean
    branch?: string
    commit?: string
    dirty_count?: number
    dirty_files?: string[]
    tracking?: string
    recent_commits?: Array<{
      commit?: string
      date?: string
      subject?: string
    }>
  }
  local_runner?: {
    python_on_path?: boolean
    npm_on_path?: boolean
    python_path?: string
    npm_path?: string
    local_hq_ready?: boolean
  }
}

export async function getDevStatus() {
  return workspaceFetch<DevStatusPayload>('/api/dev/status')
}
