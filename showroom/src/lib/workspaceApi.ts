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
    capabilities?: string[]
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_plan?: string
  } | null
}

export async function getWorkspaceSession() {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/session')
}

export type WorkspaceCapability =
  | 'actions.view'
  | 'sales.view'
  | 'receiving.view'
  | 'approvals.view'
  | 'agent_ops.view'
  | 'director.view'
  | 'architect.view'
  | 'documents.view'
  | 'tenant_admin.view'
  | 'platform_admin.view'
  | 'connector_admin.view'
  | 'knowledge_admin.view'
  | 'security_admin.view'

export type CapabilityProfile = {
  roleKey: string
  label: string
  summary: string
  capabilities: WorkspaceCapability[]
}

const MEMBER_CAPABILITIES: WorkspaceCapability[] = ['actions.view']
const OPERATOR_CAPABILITIES: WorkspaceCapability[] = ['actions.view', 'sales.view', 'receiving.view', 'approvals.view', 'documents.view']
const MANAGER_CAPABILITIES: WorkspaceCapability[] = [
  ...OPERATOR_CAPABILITIES,
  'agent_ops.view',
  'director.view',
  'architect.view',
]
const OWNER_CAPABILITIES: WorkspaceCapability[] = [
  ...MANAGER_CAPABILITIES,
  'tenant_admin.view',
  'connector_admin.view',
  'knowledge_admin.view',
  'security_admin.view',
]
const PLATFORM_ADMIN_CAPABILITIES: WorkspaceCapability[] = [...OWNER_CAPABILITIES, 'platform_admin.view']

const ROLE_CAPABILITY_PROFILES: Record<string, Omit<CapabilityProfile, 'roleKey'>> = {
  member: {
    label: 'Member',
    summary: 'Works assigned queues and sees the shared task layer.',
    capabilities: MEMBER_CAPABILITIES,
  },
  operator: {
    label: 'Operator',
    summary: 'Runs sales, receiving, approvals, and document workflows.',
    capabilities: OPERATOR_CAPABILITIES,
  },
  manager: {
    label: 'Manager',
    summary: 'Runs teams, reviews approvals, and sees command surfaces.',
    capabilities: MANAGER_CAPABILITIES,
  },
  owner: {
    label: 'Owner',
    summary: 'Owns tenant posture, rollout, and security-sensitive controls.',
    capabilities: OWNER_CAPABILITIES,
  },
  tenant_admin: {
    label: 'Tenant Admin',
    summary: 'Owns module access, connector scope, and tenant control-plane work.',
    capabilities: OWNER_CAPABILITIES,
  },
  platform_admin: {
    label: 'Platform Admin',
    summary: 'Owns cross-tenant provisioning, security, and platform-wide governance.',
    capabilities: PLATFORM_ADMIN_CAPABILITIES,
  },
  product_owner: {
    label: 'Product Owner',
    summary: 'Owns product direction, module graduation, and rollout packaging across the platform.',
    capabilities: ['actions.view', 'approvals.view', 'agent_ops.view', 'architect.view', 'tenant_admin.view', 'knowledge_admin.view'],
  },
  implementation_lead: {
    label: 'Implementation Lead',
    summary: 'Maps clients into modules, connectors, roles, and rollout order.',
    capabilities: ['actions.view', 'approvals.view', 'agent_ops.view', 'architect.view', 'tenant_admin.view', 'knowledge_admin.view'],
  },
  tenant_operator: {
    label: 'Tenant Operator',
    summary: 'Monitors tenant runtime health, approvals, and daily operational flow.',
    capabilities: ['actions.view', 'approvals.view', 'agent_ops.view', 'documents.view'],
  },
  director: {
    label: 'Director',
    summary: 'Reviews risk, revenue, and approval posture from the command layer.',
    capabilities: ['director.view', 'sales.view', 'approvals.view', 'actions.view'],
  },
  plant_manager: {
    label: 'Plant Manager',
    summary: 'Runs plant queues, receiving issues, and daily operational follow-up.',
    capabilities: ['actions.view', 'receiving.view', 'approvals.view', 'documents.view'],
  },
  procurement_lead: {
    label: 'Procurement Lead',
    summary: 'Owns supplier follow-up, evidence chase, and inbound discrepancy flow.',
    capabilities: ['receiving.view', 'approvals.view', 'documents.view', 'actions.view'],
  },
  receiving_clerk: {
    label: 'Receiving Clerk',
    summary: 'Captures inbound issues and keeps the next action visible.',
    capabilities: ['receiving.view', 'actions.view', 'documents.view'],
  },
  quality_manager: {
    label: 'Quality Manager',
    summary: 'Runs quality incidents, CAPA, and controlled closeout.',
    capabilities: ['actions.view', 'approvals.view', 'documents.view', 'knowledge_admin.view'],
  },
  finance_controller: {
    label: 'Finance Controller',
    summary: 'Reviews supplier exposure, approvals, and financial risk.',
    capabilities: ['approvals.view', 'director.view', 'sales.view', 'documents.view'],
  },
  sales_lead: {
    label: 'Sales Lead',
    summary: 'Owns account follow-up, pipeline risk, and commercial review.',
    capabilities: ['sales.view', 'actions.view', 'director.view'],
  },
}

export function normalizeWorkspaceRole(role?: string | null) {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function getCapabilityProfileForRole(role?: string | null): CapabilityProfile {
  const roleKey = normalizeWorkspaceRole(role) || 'member'
  const profile = ROLE_CAPABILITY_PROFILES[roleKey] ?? ROLE_CAPABILITY_PROFILES.member
  return {
    roleKey,
    ...profile,
  }
}

export function roleHasCapability(role: string | null | undefined, capability: WorkspaceCapability) {
  return getCapabilityProfileForRole(role).capabilities.includes(capability)
}

export function sessionHasCapability(session: WorkspaceSessionPayload['session'] | null | undefined, capability: WorkspaceCapability) {
  const declaredCapabilities = (session?.capabilities ?? []).map((item) => String(item).trim()) as WorkspaceCapability[]
  return declaredCapabilities.includes(capability) || roleHasCapability(session?.role, capability)
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
