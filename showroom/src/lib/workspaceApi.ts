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

  return origin
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

  return origin
}

export const workspaceApiBase = inferApiBase()
export const workspaceAppBase = inferAppBase()
const publicWorkspaceProfileKey = 'supermega.publicWorkspaceProfile.v1'
const workspaceOnboardingDraftKey = 'supermega.workspaceOnboardingDraft.v1'

export type PublicWorkspaceProfile = {
  name: string
  email: string
  company: string
}

export type WorkspaceOnboardingDraft = {
  company: string
  packageName: string
  team: string
  systems: string[]
  goal: string
  workspaceSlug: string
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

function normalizeWorkspaceOnboardingDraft(draft?: Partial<WorkspaceOnboardingDraft> | null): WorkspaceOnboardingDraft {
  const tenant = getTenantConfig()
  const tenantCompany = String(tenant.defaultCompany ?? '').trim()
  const tenantWorkspaceSlug = String(tenant.defaultWorkspaceSlug ?? '').trim()
  return {
    company: String(draft?.company ?? tenantCompany).trim(),
    packageName: String(draft?.packageName ?? '').trim(),
    team: String(draft?.team ?? '').trim(),
    systems: Array.isArray(draft?.systems)
      ? draft!.systems.map((item) => String(item).trim()).filter(Boolean)
      : [],
    goal: String(draft?.goal ?? '').trim(),
    workspaceSlug: String(draft?.workspaceSlug ?? tenantWorkspaceSlug).trim(),
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

export function loadWorkspaceOnboardingDraft(): WorkspaceOnboardingDraft {
  if (typeof window === 'undefined') {
    return normalizeWorkspaceOnboardingDraft()
  }

  try {
    const raw = window.localStorage.getItem(workspaceOnboardingDraftKey)
    if (!raw) {
      return normalizeWorkspaceOnboardingDraft()
    }
    return normalizeWorkspaceOnboardingDraft(JSON.parse(raw) as Partial<WorkspaceOnboardingDraft>)
  } catch {
    return normalizeWorkspaceOnboardingDraft()
  }
}

export function saveWorkspaceOnboardingDraft(draft: Partial<WorkspaceOnboardingDraft>) {
  if (typeof window === 'undefined') {
    return normalizeWorkspaceOnboardingDraft(draft)
  }

  const normalized = normalizeWorkspaceOnboardingDraft(draft)
  try {
    window.localStorage.setItem(workspaceOnboardingDraftKey, JSON.stringify(normalized))
  } catch {
    // Ignore storage failures and keep using the returned value.
  }
  return normalized
}

export function clearWorkspaceOnboardingDraft() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(workspaceOnboardingDraftKey)
  } catch {
    // Ignore storage failures.
  }
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
  requested_package?: string
  data: string
  team?: string
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

export type WorkspaceTenantState = {
  status?: string
  blocked?: boolean
  expected_tenant_key?: string
  resource_tenant_key?: string
  persisted_manifest_tenant_key?: string
  current_state_tenant_key?: string
  snapshot_tenant_key?: string
  workspace_slug?: string
  workspace_name?: string
  detail?: string
}

export async function getWorkspaceSession() {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/session')
}

export type WorkspaceCapability =
  | 'actions.view'
  | 'sales.view'
  | 'receiving.view'
  | 'operations.view'
  | 'dqms.view'
  | 'maintenance.view'
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
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'tenant_admin.view',
  'connector_admin.view',
  'knowledge_admin.view',
  'security_admin.view',
]
const PLATFORM_ADMIN_CAPABILITIES: WorkspaceCapability[] = [...OWNER_CAPABILITIES, 'platform_admin.view']

const ROLE_ALIASES: Record<string, string> = {
  ceo: 'ceo',
  chief_executive: 'ceo',
  chief_executive_officer: 'ceo',
  executive: 'ceo',
  admin: 'admin',
  maintenance: 'maintenance',
  maintenance_lead: 'maintenance',
  maintenance_manager: 'maintenance',
  maintenance_ops: 'maintenance',
  operations: 'operations',
  operations_lead: 'operations',
  operations_manager: 'operations',
  ops: 'operations',
  quality: 'quality',
  qc: 'quality',
  quality_manager: 'quality',
  quality_lead: 'quality',
  sales: 'sales',
  sales_lead: 'sales',
  sales_manager: 'sales',
}

const ROLE_CAPABILITY_PROFILES: Record<string, Omit<CapabilityProfile, 'roleKey'>> = {
  member: {
    label: 'Member',
    summary: 'Works assigned queues and sees the shared task layer.',
    capabilities: MEMBER_CAPABILITIES,
  },
  operator: {
    label: 'Operator',
    summary: 'Runs sales, receiving, approvals, and document workflows.',
    capabilities: [...OPERATOR_CAPABILITIES, 'operations.view'],
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
    capabilities: ['actions.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'approvals.view', 'documents.view'],
  },
  procurement_lead: {
    label: 'Procurement Lead',
    summary: 'Owns supplier follow-up, evidence chase, and inbound discrepancy flow.',
    capabilities: ['receiving.view', 'approvals.view', 'documents.view', 'actions.view'],
  },
  receiving_clerk: {
    label: 'Receiving Clerk',
    summary: 'Captures inbound issues and keeps the next action visible.',
    capabilities: ['receiving.view', 'operations.view', 'actions.view', 'documents.view'],
  },
  quality: {
    label: 'Quality',
    summary: 'Owns incidents, CAPA, root-cause review, and controlled quality closeout.',
    capabilities: ['dqms.view', 'actions.view', 'approvals.view', 'documents.view', 'knowledge_admin.view'],
  },
  quality_manager: {
    label: 'Quality Manager',
    summary: 'Runs quality incidents, CAPA, and controlled closeout.',
    capabilities: ['dqms.view', 'actions.view', 'approvals.view', 'documents.view', 'knowledge_admin.view'],
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
  sales: {
    label: 'Sales',
    summary: 'Owns CRM follow-up, pipeline visibility, and commercial work.',
    capabilities: ['sales.view', 'actions.view', 'approvals.view', 'documents.view'],
  },
  maintenance: {
    label: 'Maintenance',
    summary: 'Owns work orders, equipment follow-up, and maintenance closeout.',
    capabilities: ['maintenance.view', 'operations.view', 'actions.view', 'receiving.view', 'approvals.view', 'documents.view'],
  },
  operations: {
    label: 'Operations',
    summary: 'Owns plant flow, queue management, and daily operational review.',
    capabilities: ['operations.view', 'dqms.view', 'actions.view', 'receiving.view', 'approvals.view', 'documents.view', 'agent_ops.view'],
  },
  ceo: {
    label: 'CEO',
    summary: 'Owns strategy, oversight, and full cross-tenant visibility.',
    capabilities: [...PLATFORM_ADMIN_CAPABILITIES, 'operations.view', 'dqms.view', 'maintenance.view'],
  },
  admin: {
    label: 'Admin',
    summary: 'Owns tenant setup, roles, connectors, and control-plane access.',
    capabilities: [...PLATFORM_ADMIN_CAPABILITIES, 'operations.view', 'dqms.view', 'maintenance.view'],
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
  const canonicalRoleKey = ROLE_ALIASES[roleKey] ?? roleKey
  const profile = ROLE_CAPABILITY_PROFILES[canonicalRoleKey] ?? ROLE_CAPABILITY_PROFILES[roleKey] ?? ROLE_CAPABILITY_PROFILES.member
  return {
    roleKey: canonicalRoleKey,
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

export type AuditEventRow = {
  event_id: string
  workspace_id: string
  actor: string
  event_type: string
  entity_type: string
  entity_id: string
  severity: string
  summary: string
  detail: string
  payload?: Record<string, unknown>
  created_at: string
}

export type WorkspaceModuleRow = {
  module_id: string
  name: string
  category: string
  maturity: string
  route: string
  summary: string
  default_enabled: boolean
  workspace_status: 'enabled' | 'pilot' | 'disabled' | string
  enabled: boolean
  source: string
  config?: Record<string, unknown>
  assignment_id?: string
}

export type WorkspaceDomainRow = {
  domain_id: string
  workspace_id: string
  workspace_slug?: string
  workspace_name?: string
  hostname: string
  scope: string
  provider: string
  runtime_target: string
  desired_state: string
  route_root: string
  dns_status: string
  tls_status: string
  http_status: string
  verified_at: string
  deployment_url: string
  last_deployed_at: string
  notes: string
  config?: Record<string, unknown>
  live_url?: string
  display_name?: string
  proof_paths?: string[]
  status?: string
}

// Keep the cloud topology payload available from this shared API module for
// older call sites and external surfaces that still import it from here.
export type CloudTopologyDomain = {
  domainId: string
  workspaceId: string
  workspaceSlug: string
  workspaceName: string
  hostname: string
  name: string
  summary: string
  scope: string
  provider: string
  runtimeTarget: string
  desiredState: string
  routeRoot: string
  dnsStatus: string
  tlsStatus: string
  httpStatus: string
  verifiedAt: string | null
  deploymentUrl: string
  lastDeployedAt: string | null
  notes: string
  config: Record<string, unknown>
  liveUrl: string
  displayName: string
  proofPaths: string[]
  managedBy: string[]
  status: string
}

export type CloudTopologyPayload = {
  resourceId: string
  rootDomain: string
  sharedAppHost: string
  summary: {
    count: number
    readyCount: number
    attentionCount: number
    blockerCount: number
  }
  rows: CloudTopologyDomain[]
}

export type WorkspaceProfile = {
  workspace_id?: string
  workspace_slug?: string
  workspace_name?: string
  company?: string
  preferred_package?: string
  first_team?: string
  systems?: string[]
  goal?: string
  onboarding_status?: string
  config?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type PlatformControlPlanePayload = {
  status?: string
  tenant_state?: WorkspaceTenantState
  workspace?: {
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_plan?: string
    role?: string
    display_name?: string
  }
  profile?: WorkspaceProfile | null
  catalog?: {
    module_count?: number
  }
  modules?: {
    count?: number
    enabled_count?: number
    pilot_count?: number
    disabled_count?: number
    rows?: WorkspaceModuleRow[]
  }
  members?: {
    count?: number
    rows?: TeamMemberRow[]
  }
  domains?: {
    count?: number
    ready_count?: number
    attention_count?: number
    blocker_count?: number
    rows?: WorkspaceDomainRow[]
  }
  audit_events?: {
    count?: number
    rows?: AuditEventRow[]
  }
}

export type AgentTeamUnitRow = {
  unit_id?: string
  agent_id: string
  name: string
  role: string
  mode: string
  output_schema: string
  write_scope: string
  approval_gate: string
  focus: string
}

export type AgentTeamRow = {
  team_id: string
  name: string
  status: string
  scaling_tier: string
  mission: string
  lead_agent: string
  cadence: string
  agents: AgentTeamUnitRow[]
}

export type AgentTeamRuntimeCrew = {
  team_id?: string
  name?: string
  scaling_tier?: string
  workspace?: string
  runtime_lane?: string
  execution_mode?: string
  tool_count?: number
  connector_tool_count?: number
  tool_modes?: string[]
  tool_scopes?: string[]
  approval_gates?: string[]
  required_capabilities?: string[]
  write_policy?: string
  guardrail_posture?: string
  job_types?: string[]
  last_run_at?: string
  last_run_status?: string
  current_user_can_view?: boolean
  current_user_can_run?: boolean
  current_user_can_approve?: boolean
  current_user_can_take_over?: boolean
}

export type AgentTeamRuntimeContract = {
  generated_at?: string
  viewer?: {
    role?: string
    display_name?: string
    capabilities?: string[]
    can_run_jobs?: boolean
    can_manage_runtime?: boolean
    can_approve_guardrails?: boolean
  }
  summary?: {
    workspace_count?: number
    scheduler_backed_team_count?: number
    connector_enabled_team_count?: number
    approval_gate_count?: number
    guarded_team_count?: number
  }
  crews?: AgentTeamRuntimeCrew[]
}

export type AgentOperatingManifestPayload = {
  version?: string
  tenantKey?: string
  title?: string
  summary?: string
  managerMoves?: string[]
  tools?: Array<{
    id?: string
    name?: string
    category?: string
    purpose?: string
  }>
  playbooks?: Array<{
    id?: string
    teamId?: string
    name?: string
    workspace?: string
    leadRole?: string
    mission?: string
    outputs?: string[]
    cadence?: string[]
    tools?: Array<{
      toolId?: string
      mode?: string
      scope?: string
    }>
    instructions?: string[]
    escalateWhen?: string[]
    writePolicy?: string
    kpis?: Array<{
      name?: string
      target?: string
    }>
  }>
}

export type AgentTeamsPayload = {
  status?: string
  tenant_state?: WorkspaceTenantState
  summary?: {
    team_count?: number
    shared_core_team_count?: number
    client_pod_team_count?: number
    autonomy_score?: number
    autonomy_level?: string
    manifest_version?: string
    manifest_tool_count?: number
    manifest_playbook_count?: number
  }
  teams?: AgentTeamRow[]
  manifest?: AgentOperatingManifestPayload | null
  gaps?: Array<{
    gap_id?: string
    severity?: string
    problem?: string
    next_step?: string
  }>
  next_moves?: string[]
  runtime_contract?: AgentTeamRuntimeContract
  scaling_model?: {
    core_loop?: string[]
    founder_focus?: string[]
    rules?: string[]
  }
}

export async function listTeamMembers() {
  return workspaceFetch<{
    status?: string
    count?: number
    rows: TeamMemberRow[]
  }>('/api/team/members')
}

export async function getPlatformControlPlane() {
  return workspaceFetch<PlatformControlPlanePayload>('/api/platform/control-plane')
}

export async function getAgentTeams() {
  return workspaceFetch<AgentTeamsPayload>('/api/agent-teams')
}

export async function updateWorkspaceModuleStatus(moduleId: string, payload: { status: 'enabled' | 'pilot' | 'disabled'; config?: Record<string, unknown> }) {
  return workspaceFetch<{
    status?: string
    row?: WorkspaceModuleRow
    control_plane?: PlatformControlPlanePayload
  }>(`/api/platform/modules/${encodeURIComponent(moduleId)}`, {
    method: 'POST',
    body: JSON.stringify({
      status: payload.status,
      config: payload.config ?? {},
    }),
  })
}

export async function updateWorkspaceProfile(payload: {
  company?: string
  preferredPackage?: string
  firstTeam?: string
  systems?: string[]
  goal?: string
  onboardingStatus?: string
  config?: Record<string, unknown>
}) {
  return workspaceFetch<{
    status?: string
    profile?: WorkspaceProfile | null
    control_plane?: PlatformControlPlanePayload
  }>('/api/platform/workspace-profile', {
    method: 'POST',
    body: JSON.stringify({
      company: payload.company ?? '',
      preferred_package: payload.preferredPackage ?? '',
      first_team: payload.firstTeam ?? '',
      systems: Array.isArray(payload.systems) ? payload.systems : [],
      goal: payload.goal ?? '',
      onboarding_status: payload.onboardingStatus ?? '',
      config: payload.config ?? {},
    }),
  })
}

export async function updateWorkspaceDomain(
  domainId: string,
  payload: {
    hostname?: string
    scope?: string
    provider?: string
    runtimeTarget?: string
    desiredState?: string
    routeRoot?: string
    notes?: string
    deploymentUrl?: string
    config?: Record<string, unknown>
  },
) {
  return workspaceFetch<{
    status?: string
    row?: WorkspaceDomainRow
    control_plane?: PlatformControlPlanePayload
  }>(`/api/platform/domains/${encodeURIComponent(domainId)}`, {
    method: 'POST',
    body: JSON.stringify({
      hostname: payload.hostname ?? '',
      scope: payload.scope ?? '',
      provider: payload.provider ?? '',
      runtime_target: payload.runtimeTarget ?? '',
      desired_state: payload.desiredState ?? '',
      route_root: payload.routeRoot ?? '',
      notes: payload.notes ?? '',
      deployment_url: payload.deploymentUrl ?? '',
      config: payload.config ?? {},
    }),
  })
}

export async function verifyWorkspaceDomain(domainId: string, routes?: string[]) {
  return workspaceFetch<{
    status?: string
    row?: WorkspaceDomainRow
    control_plane?: PlatformControlPlanePayload
  }>(`/api/platform/domains/${encodeURIComponent(domainId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({
      routes: Array.isArray(routes) ? routes : [],
    }),
  })
}

export async function verifyAllWorkspaceDomains(routes?: string[]) {
  return workspaceFetch<{
    status?: string
    verified_count?: number
    rows?: WorkspaceDomainRow[]
    control_plane?: PlatformControlPlanePayload
  }>('/api/platform/domains/verify-all', {
    method: 'POST',
    body: JSON.stringify({
      routes: Array.isArray(routes) ? routes : [],
    }),
  })
}

export async function triggerPreviewDeploy(mode: 'claimable_preview' | 'preview' = 'claimable_preview') {
  return workspaceFetch<{
    status?: string
    result?: Record<string, unknown>
  }>('/api/cloud/deployments/preview', {
    method: 'POST',
    body: JSON.stringify({
      mode,
    }),
  })
}

export async function triggerProductionDeploy() {
  return workspaceFetch<{
    status?: string
    result?: Record<string, unknown>
  }>('/api/cloud/deployments/production', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'production',
    }),
  })
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
    queued_count?: number
    claimed_count?: number
    processed_count?: number
    mode?: string
    dispatch?: Record<string, unknown>
  }>('/api/agent-runs/run-defaults', {
    method: 'POST',
    body: JSON.stringify({
      source: 'manual_batch',
      job_types: jobTypes ?? [],
    }),
  })
}

export async function queueDefaultAgentJobs(jobTypes?: string[]) {
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: AgentRunRow[]
    jobs?: AgentJobTemplate[]
    queued_count?: number
    mode?: string
    dispatch?: Record<string, unknown>
  }>('/api/agent-runs/run-defaults', {
    method: 'POST',
    body: JSON.stringify({
      source: 'manual_queue',
      job_types: jobTypes ?? [],
      enqueue_only: true,
    }),
  })
}

export async function processAgentRunQueue(jobTypes?: string[], limit = 8) {
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: AgentRunRow[]
    jobs?: AgentJobTemplate[]
    claimed_count?: number
    processed_count?: number
    mode?: string
  }>('/api/agent-runs/process-queue', {
    method: 'POST',
    body: JSON.stringify({
      source: 'manual_worker',
      job_types: jobTypes ?? [],
      limit,
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
  archetype?: string
  stage: string
  status: string
  owner: string
  campaign_goal: string
  service_pack: string
  wedge_product: string
  starter_modules?: string[]
  semi_products?: string[]
  discovery_questions?: string[]
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

export type ApprovalRow = {
  approval_id: string
  created_at: string
  title: string
  summary: string
  approval_gate: string
  requested_by: string
  owner: string
  status: string
  due: string
  related_route: string
  related_entity: string
  evidence_link: string
  payload?: Record<string, unknown>
}

export type ApprovalSummary = {
  approval_count?: number
  by_status?: Record<string, number>
}

export type DecisionRow = {
  decision_id: string
  created_at: string
  title: string
  context: string
  decision_text: string
  rationale: string
  owner: string
  status: string
  due: string
  related_route: string
}

export type DecisionSummary = {
  decision_count?: number
  by_status?: Record<string, number>
  top_owners?: Array<{
    owner?: string
    decision_count?: number
  }>
}

export type ExceptionRow = {
  exception_id: string
  source_type: string
  priority: string
  status: string
  owner: string
  title: string
  summary: string
  entity: string
  next_action: string
  due: string
  route: string
}

export type ExceptionSummary = {
  total_items?: number
  by_source?: Record<string, number>
  by_priority?: Record<string, number>
}

export async function listDecisionEntries(status?: string, owner?: string, limit = 100) {
  const params = new URLSearchParams()
  if (status) {
    params.set('status', status)
  }
  if (owner) {
    params.set('owner', owner)
  }
  params.set('limit', String(limit))
  return workspaceFetch<{
    status?: string
    count?: number
    summary?: DecisionSummary
    rows?: DecisionRow[]
  }>(`/api/decisions?${params.toString()}`)
}

export async function listApprovalEntries(limit = 100, status?: string) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (status) {
    params.set('status', status)
  }
  return workspaceFetch<{
    status?: string
    count?: number
    summary?: ApprovalSummary
    rows?: ApprovalRow[]
  }>(`/api/approvals?${params.toString()}`)
}

export async function createDecisionEntry(payload: {
  title: string
  context?: string
  decision_text: string
  rationale?: string
  owner?: string
  status?: string
  due?: string
  related_route?: string
}) {
  return workspaceFetch<{
    status?: string
    message?: string
    row?: DecisionRow
    rows?: DecisionRow[]
    summary?: DecisionSummary
  }>('/api/decisions', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      context: payload.context ?? '',
      rationale: payload.rationale ?? '',
      owner: payload.owner ?? 'Management',
      status: payload.status ?? 'open',
      due: payload.due ?? '',
      related_route: payload.related_route ?? '/app/workbench',
    }),
  })
}

export async function listExceptionRows(limit = 100) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  return workspaceFetch<{
    status?: string
    count?: number
    summary?: ExceptionSummary
    rows?: ExceptionRow[]
  }>(`/api/exceptions?${params.toString()}`)
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

export async function applyWorkforceAutomation(payload?: {
  apply_assignments?: boolean
  seed_review_cycles?: boolean
  queue_default_jobs?: boolean
  process_queue?: boolean
  limit?: number
  source?: string
}) {
  return workspaceFetch<{
    status?: string
    message?: string
    applied_assignment_count?: number
    seeded_review_count?: number
    queued_job_count?: number
    processed_job_count?: number
    assignment_rows?: WorkspaceTaskRow[]
    review_rows?: WorkspaceTaskRow[]
    registry?: Record<string, unknown>
  }>('/api/workforce/automation/apply', {
    method: 'POST',
    body: JSON.stringify({
      apply_assignments: payload?.apply_assignments ?? true,
      seed_review_cycles: payload?.seed_review_cycles ?? true,
      queue_default_jobs: payload?.queue_default_jobs ?? false,
      process_queue: payload?.process_queue ?? false,
      limit: payload?.limit ?? 8,
      source: payload?.source ?? 'supermega_dev',
    }),
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

export async function createApprovalEntry(payload: {
  title: string
  summary: string
  approval_gate: string
  requested_by: string
  owner: string
  status?: string
  due?: string
  related_route?: string
  related_entity?: string
  evidence_link?: string
  payload?: Record<string, unknown>
}) {
  return workspaceFetch<{
    status?: string
    message?: string
    row?: ApprovalRow
    rows?: ApprovalRow[]
    summary?: {
      approval_count?: number
      by_status?: Record<string, number>
    }
  }>('/api/approvals', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      status: payload.status ?? 'pending',
      due: payload.due ?? '',
      related_route: payload.related_route ?? '/app/actions',
      related_entity: payload.related_entity ?? '',
      evidence_link: payload.evidence_link ?? '',
    }),
  })
}

export async function updateApprovalEntryStatus(
  approvalId: string,
  payload: {
    status?: string
    owner?: string
    note?: string
  },
) {
  return workspaceFetch<{
    status?: string
    message?: string
    row?: ApprovalRow
    rows?: ApprovalRow[]
    summary?: {
      approval_count?: number
      by_status?: Record<string, number>
    }
  }>(`/api/approvals/${encodeURIComponent(approvalId)}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
