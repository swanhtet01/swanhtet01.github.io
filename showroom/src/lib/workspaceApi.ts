import { getTenantConfig } from './tenantConfig'
import { isWorkspaceRuntimeHost } from './domainRouting'

const configuredBase = import.meta.env.VITE_WORKSPACE_API_BASE?.trim() ?? ''
const configuredAppBase = import.meta.env.VITE_WORKSPACE_APP_BASE?.trim() ?? ''

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function isFrontendDevPort(port: string) {
  return new Set(['3000', '3001', '4173', '5173', '5174']).has(port)
}

function isWorkspaceHost(hostname: string) {
  return isWorkspaceRuntimeHost(hostname)
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
    if (port && !isFrontendDevPort(port)) {
      return origin
    }
    return `${protocol}//${hostname}:8787`
  }

  if (isWorkspaceHost(hostname)) {
    return origin
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
    if (port && !isFrontendDevPort(port)) {
      return origin
    }
    return `http://${hostname}:8787`
  }

  if (isWorkspaceHost(hostname)) {
    return origin
  }

  return ''
}

export const workspaceApiBase = inferApiBase()
export const workspaceAppBase = inferAppBase()
const publicWorkspaceProfileKey = 'supermega.publicWorkspaceProfile.v1'
const workspaceOnboardingDraftKey = 'supermega.workspaceOnboardingDraft.v1'
const workspaceSessionCacheKey = 'supermega.workspaceSession.v1'

export type PublicWorkspaceProfile = {
  name: string
  email: string
  phone?: string
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

type WorkspaceFetchInit = RequestInit & {
  timeoutMs?: number
}

const DEFAULT_WORKSPACE_FETCH_TIMEOUT_MS = 20000
const YTF_RUNTIME_FETCH_TIMEOUT_MS = 45000
const WORKSPACE_SESSION_TRANSIENT_BACKOFF_MS = 5000

let workspaceSessionRequest: Promise<WorkspaceSessionPayload> | null = null
let lastWorkspaceSessionTransientFailureAt = 0

function cachedWorkspaceSessionId() {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    const raw = window.localStorage.getItem(workspaceSessionCacheKey)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { session?: { session_id?: string } }
    return String(parsed?.session?.session_id ?? '').trim()
  } catch {
    return ''
  }
}

export async function workspaceFetch<T>(path: string, init?: WorkspaceFetchInit): Promise<T> {
  const base = workspaceApiBase
  const { timeoutMs = DEFAULT_WORKSPACE_FETCH_TIMEOUT_MS, signal: initSignal, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))
  const sessionId = cachedWorkspaceSessionId()

  if (initSignal) {
    if (initSignal.aborted) {
      controller.abort()
    } else {
      initSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      cache: fetchInit.cache ?? 'no-store',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { 'X-Supermega-Session': sessionId } : {}),
        ...(fetchInit.headers ?? {}),
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Workspace API timed out: ${path}`)
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }

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
  phone?: string
  company: string
  workflow: string
  requested_package?: string
  data: string
  team?: string
  goal: string
  website?: string
  source_url?: string
  page_path?: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
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
  stale_session?: boolean
  uses_default_credentials?: boolean
  ytf_uses_default_credentials?: boolean
  demo_login_enabled?: boolean
  workspaces?: Array<{
    workspace_id?: string
    slug?: string
    name?: string
    plan?: string
    role?: string
  }>
  session?: {
    session_id?: string
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

function normalizeWorkspaceSessionPayload(payload?: WorkspaceSessionPayload | null): WorkspaceSessionPayload {
  return {
    status: String(payload?.status ?? '').trim() || undefined,
    auth_required: payload?.auth_required !== false,
    authenticated: payload?.authenticated === true,
    stale_session: payload?.stale_session === true,
    uses_default_credentials: payload?.uses_default_credentials === true,
    ytf_uses_default_credentials: payload?.ytf_uses_default_credentials === true,
    demo_login_enabled: payload?.demo_login_enabled === true,
    workspaces: Array.isArray(payload?.workspaces)
      ? payload!.workspaces.map((item) => ({
          workspace_id: String(item?.workspace_id ?? '').trim() || undefined,
          slug: String(item?.slug ?? '').trim() || undefined,
          name: String(item?.name ?? '').trim() || undefined,
          plan: String(item?.plan ?? '').trim() || undefined,
          role: String(item?.role ?? '').trim() || undefined,
        }))
      : [],
    session: payload?.session
      ? {
          session_id: String(payload.session.session_id ?? '').trim() || undefined,
          username: String(payload.session.username ?? '').trim() || undefined,
          display_name: String(payload.session.display_name ?? '').trim() || undefined,
          role: String(payload.session.role ?? '').trim() || undefined,
          capabilities: Array.isArray(payload.session.capabilities)
            ? payload.session.capabilities.map((item) => String(item).trim()).filter(Boolean)
            : [],
          workspace_id: String(payload.session.workspace_id ?? '').trim() || undefined,
          workspace_slug: String(payload.session.workspace_slug ?? '').trim() || undefined,
          workspace_name: String(payload.session.workspace_name ?? '').trim() || undefined,
          workspace_plan: String(payload.session.workspace_plan ?? '').trim() || undefined,
        }
      : null,
  }
}

export function isWorkspaceAuthError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (Number((error as { status?: number }).status) === 401 || Number((error as { status?: number }).status) === 403),
  )
}

export function loadCachedWorkspaceSession(): WorkspaceSessionPayload | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(workspaceSessionCacheKey)
    if (!raw) {
      return null
    }
    return normalizeWorkspaceSessionPayload(JSON.parse(raw) as WorkspaceSessionPayload)
  } catch {
    return null
  }
}

function saveCachedWorkspaceSession(payload?: WorkspaceSessionPayload | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const normalized = normalizeWorkspaceSessionPayload(payload)
    if (!normalized.authenticated || !normalized.session) {
      window.localStorage.removeItem(workspaceSessionCacheKey)
      return
    }
    window.localStorage.setItem(workspaceSessionCacheKey, JSON.stringify(normalized))
  } catch {
    // Ignore storage failures.
  }
}

export function clearCachedWorkspaceSession() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(workspaceSessionCacheKey)
  } catch {
    // Ignore storage failures.
  }
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

async function refreshWorkspaceSession() {
  try {
    const payload = normalizeWorkspaceSessionPayload(await workspaceFetch<WorkspaceSessionPayload>('/api/auth/session'))
    if (payload.authenticated) {
      saveCachedWorkspaceSession(payload)
    } else {
      clearCachedWorkspaceSession()
    }
    return payload
  } catch (error) {
    if (isWorkspaceAuthError(error)) {
      clearCachedWorkspaceSession()
      throw error
    }

    lastWorkspaceSessionTransientFailureAt = Date.now()
    const cachedSession = loadCachedWorkspaceSession()
    if (cachedSession?.authenticated) {
      return cachedSession
    }
    throw error
  }
}

export async function getWorkspaceSession() {
  const cachedSession = loadCachedWorkspaceSession()
  if (
    cachedSession?.authenticated &&
    Date.now() - lastWorkspaceSessionTransientFailureAt < WORKSPACE_SESSION_TRANSIENT_BACKOFF_MS
  ) {
    return cachedSession
  }

  if (!workspaceSessionRequest) {
    workspaceSessionRequest = refreshWorkspaceSession().finally(() => {
      workspaceSessionRequest = null
    })
  }

  return workspaceSessionRequest
}

export async function demoLoginWorkspace(portalId: string, workspaceSlug = '') {
  const body = JSON.stringify({
    portal_id: portalId,
    workspace_slug: workspaceSlug,
  })
  let demoPayload: WorkspaceSessionPayload | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      demoPayload = await workspaceFetch<WorkspaceSessionPayload>('/api/auth/demo-login', {
        method: 'POST',
        body,
        timeoutMs: 70000,
      })
      break
    } catch (error) {
      lastError = error
      const status = (error as Error & { status?: number }).status
      const message = error instanceof Error ? error.message : ''
      const retryable = status === 503 && /busy|retry|storage/i.test(message)
      if (!retryable || attempt === 1) {
        throw error
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 900))
    }
  }
  if (!demoPayload) {
    throw lastError instanceof Error ? lastError : new Error('Demo login failed.')
  }
  const payload = normalizeWorkspaceSessionPayload(demoPayload)
  if (payload.authenticated) {
    saveCachedWorkspaceSession(payload)
  }
  return payload
}

export type WorkspaceCapability =
  | 'actions.view'
  | 'sales.view'
  | 'finance.view'
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
const OPERATOR_CAPABILITIES: WorkspaceCapability[] = ['actions.view', 'sales.view', 'finance.view', 'receiving.view', 'approvals.view', 'documents.view']
const MANAGER_CAPABILITIES: WorkspaceCapability[] = [
  ...OPERATOR_CAPABILITIES,
  'operations.view',
  'dqms.view',
  'maintenance.view',
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
  plant_a_manager: 'plant_a_manager',
  plant_b_manager: 'plant_b_manager',
  manager_plant_a: 'manager_plant_a',
  manager_plant_b: 'manager_plant_b',
  operations_admin: 'operations_admin',
  maintenance_compliance: 'maintenance_compliance',
  engineering_maintenance: 'engineering_maintenance',
  curing_press_operations: 'curing_press_operations',
  maintenance_operations: 'maintenance_operations',
  utility: 'utility',
  admin_hr_planning: 'admin_hr_planning',
  mixing_operator: 'mixing_operator',
  admin_sales: 'admin_sales',
  tyre_building: 'tyre_building',
  quality_control: 'quality_control',
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
  sales: 'sales_lead',
  sales_lead: 'sales_lead',
  sales_manager: 'sales_lead',
  finance: 'finance_controller',
  cashier: 'cashier_lead',
  cashier_lead: 'cashier_lead',
  store_cashier: 'cashier_lead',
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
  operations_admin: {
    label: 'Operations & Admin',
    summary: 'Runs plant flow, handoff, admin proof, and approval follow-up from one compact role.',
    capabilities: ['actions.view', 'receiving.view', 'operations.view', 'dqms.view', 'approvals.view', 'documents.view'],
  },
  maintenance_compliance: {
    label: 'Maintenance & Compliance',
    summary: 'Owns maintenance work plus compliance, containment, and closeout proof.',
    capabilities: ['maintenance.view', 'operations.view', 'dqms.view', 'actions.view', 'approvals.view', 'documents.view'],
  },
  engineering_maintenance: {
    label: 'Engineering & Maintenance',
    summary: 'Owns reliability, engineering fixes, and equipment follow-up.',
    capabilities: ['maintenance.view', 'operations.view', 'actions.view', 'approvals.view', 'documents.view'],
  },
  curing_press_operations: {
    label: 'Curing Press & Operations',
    summary: 'Runs curing-stage execution, shift flow, and operating abnormalities.',
    capabilities: ['operations.view', 'dqms.view', 'actions.view', 'documents.view'],
  },
  maintenance_operations: {
    label: 'Maintenance & Operations',
    summary: 'Bridges plant flow with reliability work and recurring breakdown follow-up.',
    capabilities: ['maintenance.view', 'operations.view', 'dqms.view', 'actions.view', 'approvals.view', 'documents.view'],
  },
  utility: {
    label: 'Utility',
    summary: 'Owns utility stability, plant support, and service interruptions.',
    capabilities: ['maintenance.view', 'operations.view', 'actions.view', 'documents.view'],
  },
  admin_hr_planning: {
    label: 'Admin, HR, Planning',
    summary: 'Runs admin paperwork, people coordination, and planning-side follow-up.',
    capabilities: ['actions.view', 'approvals.view', 'documents.view', 'operations.view'],
  },
  mixing_operator: {
    label: 'Mixing',
    summary: 'Runs mixing-stage handoff, abnormalities, and quality-linked operating follow-up.',
    capabilities: ['operations.view', 'dqms.view', 'actions.view', 'documents.view'],
  },
  admin_sales: {
    label: 'Admin & Sales',
    summary: 'Bridges admin work with sales, customer follow-up, and document control.',
    capabilities: ['sales.view', 'actions.view', 'approvals.view', 'documents.view'],
  },
  tyre_building: {
    label: 'Tyre Building',
    summary: 'Runs tyre-building execution, handoff, and line-level abnormality follow-up.',
    capabilities: ['operations.view', 'dqms.view', 'actions.view', 'documents.view'],
  },
  quality_control: {
    label: 'Quality',
    summary: 'Owns QC incidents, release evidence, and controlled quality closeout.',
    capabilities: ['dqms.view', 'actions.view', 'approvals.view', 'documents.view', 'knowledge_admin.view'],
  },
  plant_manager: {
    label: 'Plant Manager',
    summary: 'Runs plant queues, receiving issues, and daily operational follow-up.',
    capabilities: ['actions.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'approvals.view', 'documents.view'],
  },
  plant_a_manager: {
    label: 'Plant A Manager',
    summary: 'Runs Plant A daily routine, work board, dashboard review, and source-backed closeout.',
    capabilities: ['actions.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'approvals.view', 'documents.view'],
  },
  plant_b_manager: {
    label: 'Plant B Manager',
    summary: 'Runs Plant B daily routine, normal/abnormal record, 5S, and source-backed closeout.',
    capabilities: ['actions.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'approvals.view', 'documents.view'],
  },
  manager_plant_a: {
    label: 'Plant A Manager Team',
    summary: 'Shared Plant A manager entry, work-board updates, source uploads, and daily close.',
    capabilities: MANAGER_CAPABILITIES,
  },
  manager_plant_b: {
    label: 'Plant B Manager Team',
    summary: 'Shared Plant B manager entry, normal/abnormal records, 5S checks, and daily close.',
    capabilities: MANAGER_CAPABILITIES,
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
    capabilities: ['finance.view', 'approvals.view', 'director.view', 'sales.view', 'documents.view'],
  },
  cashier_lead: {
    label: 'Cashier Lead',
    summary: 'Runs payment capture, settlement checks, and cash-up exceptions.',
    capabilities: ['finance.view', 'actions.view', 'operations.view', 'documents.view'],
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

export type AttendanceCheckinRow = {
  id: number | string
  created_at: string
  employee_name: string
  employee_code: string
  shift_name: string
  station: string
  status: string
  method: string
  evidence_url: string
  note: string
}

export type AttendanceCheckinPayload = {
  employee_name: string
  employee_code?: string
  shift_name?: string
  station?: string
  status?: string
  method?: string
  evidence_url?: string
  note?: string
}

export type AttendanceEnrollmentRow = {
  employee_code: string
  display_label: string
  department_hint: string
  photo_file_id: string
  photo_url: string
  source_status: string
  enrollment_status: string
  next_step: string
}

export type AttendanceShiftRuleRow = {
  id: string
  name: string
  window: string
  late_grace_minutes: number
  ot_threshold_minutes: number
  rounding: string
  payroll_gate: string
}

export type AttendanceExceptionRow = {
  event_id: number | string
  employee_code: string
  signal: string
  decision: string
  owner: string
  payroll_impact: string
  source_event?: AttendanceCheckinRow | Record<string, never>
}

export type AttendancePayrollPreviewRow = {
  employee_code: string
  employee_name: string
  attendance_events: number
  approved_days: number
  held_events: number
  ot_minutes: number
  payroll_status: string
  reason: string
}

export type AttendanceReviewDecisionRow = {
  id: string
  created_at: string
  event_id: number | string
  employee_code: string
  decision: string
  owner: string
  note: string
  payroll_impact: string
  workspace_id?: string
}

export type AttendanceControlPlanePayload = {
  status?: string
  workspace?: {
    id?: string
    name?: string
    role?: string
  }
  replacement_readiness: {
    can_replace_qhrm_for_pilot: boolean
    can_replace_zkteco_sync: boolean
    can_auto_payroll_from_face: boolean
    ready_now: string[]
    still_needed_for_full_replacement: string[]
  }
  sources: Array<{
    label: string
    status: string
    url: string
    use: string
  }>
  enrollments: AttendanceEnrollmentRow[]
  shift_rules: AttendanceShiftRuleRow[]
  events: {
    count: number
    status_counts: Record<string, number>
    rows: AttendanceCheckinRow[]
  }
  exceptions: AttendanceExceptionRow[]
  payroll_preview: AttendancePayrollPreviewRow[]
  review_decisions: AttendanceReviewDecisionRow[]
  export: {
    csv_path: string
    rule: string
  }
}

export type PosControlPlaneSalesStage = 'lead' | 'discovery' | 'pilot' | 'go-live'
export type PosControlPlaneBusinessType = 'restaurant' | 'spa' | 'retail'
export type PosControlPlaneRoleTemplate = 'owner-led' | 'manager-led' | 'cashier-first' | 'front-desk-first' | 'inventory-led'
export type PosControlPlaneTenantStatus = 'new' | 'active' | 'paused'
export type PosControlPlaneContractStatus = 'draft' | 'sent' | 'signed'
export type PosControlPlaneBillingStatus = 'not-configured' | 'trial' | 'active' | 'past-due'
export type PosControlPlaneTenantKind = 'demo' | 'client'
export type PosControlPlaneRoleInviteStatus = 'generated' | 'sent'

export type PosControlPlaneTenantRow = {
  id: string
  clientName: string
  businessType: PosControlPlaneBusinessType
  stage: PosControlPlaneSalesStage
  owner: string
  roleTemplate: PosControlPlaneRoleTemplate
  locationCount: number
  status: PosControlPlaneTenantStatus
  kind?: PosControlPlaneTenantKind
  contractStatus?: PosControlPlaneContractStatus
  billingStatus?: PosControlPlaneBillingStatus
  updatedAt: string
}

export type PosControlPlaneRoleInviteRow = {
  id: string
  tenantId: string
  tenantName: string
  businessType: PosControlPlaneBusinessType
  role: string
  inviteeName: string
  inviteeEmail: string
  username: string
  temporaryPassword?: string
  status: PosControlPlaneRoleInviteStatus
  createdAt: string
}

export type PosControlPlaneHandoffPacketRow = {
  id: string
  tenantId: string
  tenantName: string
  stage: PosControlPlaneSalesStage
  generatedAt: string
  payload: Record<string, unknown>
}

export type PosControlPlaneStaffRow = {
  id: string
  displayName: string
  role: string
  locationId: string
  locationLabel: string
  status: 'active' | 'suspended'
  pinDigest: string
  pinHint: string
  note: string
  createdAt: string
  updatedAt: string
  pinUpdatedAt: string
}

export type PosControlPlaneSettings = {
  auto_lock_minutes?: number
}

export type PosAuditEventRow = {
  event_id: string
  event_type: string
  entity_type?: string
  entity_id?: string
  actor: string
  severity: string
  summary: string
  detail?: string
  created_at: string
  payload?: Record<string, unknown>
}

export type PosSupportIncidentRow = {
  incident_id: string
  status: 'open' | 'in_progress' | 'resolved' | string
  severity: 'sev1' | 'sev2' | 'sev3' | string
  category: 'payment' | 'printer' | 'offline' | 'data' | 'access' | 'general' | string
  summary: string
  workspace?: {
    companyName?: string
    location?: string
    businessType?: string
    role?: string
    url?: string
  }
  operating_state?: Record<string, unknown>
  next_action?: string
  owner?: string
  resolution_note?: string
  resolved_at?: string
  created_at: string
  updated_at: string
}

export type PosControlPlaneRoleTemplateRow = {
  id: string
  label: string
  businessType: PosControlPlaneBusinessType
  defaultRole: string
  updatedAt: string
}

export type PosControlPlanePayload = {
  status?: string
  workspace?: {
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    role?: string
  }
  sales_tenants?: PosControlPlaneTenantRow[]
  role_invites?: PosControlPlaneRoleInviteRow[]
  handoff_packets?: PosControlPlaneHandoffPacketRow[]
  role_templates?: PosControlPlaneRoleTemplateRow[]
  staff_directory?: PosControlPlaneStaffRow[]
  settings?: PosControlPlaneSettings
  audit_events?: PosAuditEventRow[]
  updated_at?: string
  updated_by?: string
  source?: 'snapshot' | 'empty' | string
}

export async function listAttendanceCheckins(limit = 100) {
  return workspaceFetch<{
    status?: string
    count?: number
    status_counts?: Record<string, number>
    rows: AttendanceCheckinRow[]
  }>(`/api/attendance/checkins?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 200))))}`)
}

export async function createAttendanceCheckin(payload: AttendanceCheckinPayload) {
  return workspaceFetch<{
    status?: string
    message?: string
    face_scan_ready?: boolean
    note?: string
    attendance: AttendanceCheckinRow
  }>('/api/attendance/checkins', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getAttendanceControlPlane(limit = 100) {
  return workspaceFetch<AttendanceControlPlanePayload>(
    `/api/attendance/control-plane?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 200))))}`,
  )
}

export async function createAttendanceReviewDecision(payload: {
  event_id?: number | string
  employee_code?: string
  decision?: string
  owner?: string
  note?: string
  payroll_impact?: string
}) {
  return workspaceFetch<{
    status?: string
    decision: AttendanceReviewDecisionRow
    action?: {
      status?: string
      saved_count?: number
      saved_rows?: Array<Record<string, unknown>>
    }
    latest?: {
      status?: string
      decisions?: AttendanceReviewDecisionRow[]
    }
  }>('/api/attendance/review', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function exportAttendancePayrollCsv() {
  const sessionId = cachedWorkspaceSessionId()
  const response = await fetch(`${workspaceApiBase}/api/attendance/payroll-export?format=csv`, {
    credentials: 'include',
    headers: {
      ...(sessionId ? { 'X-Supermega-Session': sessionId } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(`Payroll export failed: HTTP ${response.status}`)
  }
  return response.text()
}

export async function getPlatformControlPlane() {
  return workspaceFetch<PlatformControlPlanePayload>('/api/platform/control-plane')
}

export async function getPosControlPlane() {
  return workspaceFetch<PosControlPlanePayload>('/api/pos/control-plane')
}

export async function getPosAuditEvents(limit = 40) {
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: PosAuditEventRow[]
    workspace?: {
      workspace_id?: string
      workspace_slug?: string
      workspace_name?: string
      auth_source?: string
    }
  }>(`/api/pos/audit-events?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 80))))}`)
}

export async function getPosSupportIncidents(limit = 50) {
  return workspaceFetch<{
    status?: string
    count?: number
    incidents?: PosSupportIncidentRow[]
    storage?: {
      mode?: string
      status?: string
      snapshot_key?: string
    }
    workspace?: {
      workspace_id?: string
      workspace_slug?: string
      workspace_name?: string
      auth_source?: string
    }
  }>(`/api/pos/support-incidents?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 100))))}`)
}

export async function createPosSupportIncident(payload: {
  incident_id?: string
  status?: string
  severity: string
  category: string
  summary: string
  workspace?: Record<string, unknown>
  operating_state?: Record<string, unknown>
  next_action?: string
  owner?: string
}) {
  return workspaceFetch<{
    status?: string
    incident?: PosSupportIncidentRow
    storage?: {
      mode?: string
      status?: string
      snapshot_key?: string
    }
    count?: number
  }>('/api/pos/support-incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updatePosSupportIncident(incidentId: string, payload: {
  status: 'open' | 'in_progress' | 'resolved' | string
  resolution_note?: string
  next_action?: string
  owner?: string
}) {
  return workspaceFetch<{
    status?: string
    incident?: PosSupportIncidentRow
    storage?: {
      mode?: string
      status?: string
      snapshot_key?: string
    }
    count?: number
  }>(`/api/pos/support-incidents/${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updatePosControlPlane(payload: {
  sales_tenants?: PosControlPlaneTenantRow[]
  role_invites?: PosControlPlaneRoleInviteRow[]
  handoff_packets?: PosControlPlaneHandoffPacketRow[]
  role_templates?: PosControlPlaneRoleTemplateRow[]
  staff_directory?: PosControlPlaneStaffRow[]
  settings?: PosControlPlaneSettings
}, init?: Pick<WorkspaceFetchInit, 'timeoutMs' | 'signal'>) {
  return workspaceFetch<{ status?: string; saved?: PosControlPlanePayload }>('/api/pos/control-plane', {
    method: 'POST',
    body: JSON.stringify(payload),
    ...init,
  })
}

export type MetaOpsStatus = 'ready' | 'attention' | 'blocked' | 'empty' | 'unknown' | string

export type MetaOpsDomainTarget = {
  hostname?: string
  scope?: string
  expected_target?: string
  route?: string
  policy?: string
}

export type ModuleReadinessContract = {
  id?: string
  name?: string
  department?: string
  role?: string
  industryKit?: string
  route?: string
  capability?: WorkspaceCapability | string
  sourceInputs?: string[]
  aiActions?: string[]
  reviewGate?: string
  KPI?: string[]
  maturity?: string
  smokeCoverage?: string[]
  package?: string
}

export type MetaOpsToolBrokerRow = {
  id?: string
  name?: string
  action_class?: 'Perceive' | 'Reason' | 'Act - staged' | string
  risk_tier?: 'Low' | 'Medium' | 'High' | string
  status?: MetaOpsStatus
  allowed_surfaces?: string[]
  requires_approval?: boolean
  next_gate?: string
  drills?: string[]
  route?: string
}

export type MetaOpsResourceRow = {
  id?: string
  name?: string
  provider?: string
  resource_type?: string
  status?: MetaOpsStatus
  current_use?: string
  unlock?: string
  enable_command?: string
  review_policy?: string
  route?: string
  mode?: string
  evidence?: string
  automation_mode?: string
  cloud_token_ready?: boolean
  local_cli_ready?: boolean
  credential_ready?: boolean
  source_record_count?: number
  billing_mode?: string
  checkout_ready?: boolean
  quote_ready?: boolean
  manifest_count?: number
  covered_package_count?: number
  script_count?: number
  required_script_count?: number
  latest_qa_ready?: boolean
}

export type MetaOpsToolBroker = {
  status?: MetaOpsStatus
  score?: number
  summary?: string
  rows?: MetaOpsToolBrokerRow[]
  resources?: MetaOpsResourceRow[]
  resource_status?: MetaOpsStatus
  resource_score?: number
  resource_summary?: string
}

export type MetaOpsResearchAdaptation = {
  status?: MetaOpsStatus
  score?: number
  summary?: string
  sources?: Array<{
    id?: string
    name?: string
    source_type?: string
    source_url?: string
    adaptation?: string
    platform_rule?: string
    status?: MetaOpsStatus | string
  }>
  operating_rules?: Array<{
    id?: string
    name?: string
    rule?: string
    implementation?: string
    evidence_route?: string
    gate?: string
  }>
  infrastructure_moves?: Array<{
    id?: string
    name?: string
    provider?: string
    production_lane?: string
    route?: string
    technique?: string
    implementation?: string
    gate?: string
    status?: MetaOpsStatus | string
  }>
  workcell_blueprints?: Array<{
    id?: string
    name?: string
    trigger?: string
    tools?: string[]
    output?: string
    eval?: string
    human_gate?: string
    route?: string
    status?: MetaOpsStatus | string
  }>
  module_upgrade_rules?: Array<{
    id?: string
    module?: string
    next_behavior?: string
    ai_action?: string
    smoke_gate?: string
    route?: string
    status?: MetaOpsStatus | string
  }>
  next_builds?: Array<{
    id?: string
    priority?: string
    label?: string
    route?: string
    definition_of_done?: string
  }>
}

export type QaRunResult = {
  status?: MetaOpsStatus
  run_id?: string
  target?: string
  mode?: string
  generated_at?: string
  started_by?: string
  workspace_id?: string
  target_base_url?: string
  deployment_url?: string
  route_checks?: Array<Record<string, unknown>>
  feature_checks?: Array<Record<string, unknown>>
  created_records?: Array<Record<string, unknown>>
  cleanup_status?: string
  failures?: Array<Record<string, unknown>>
  artifact_links?: string[]
  audit_event_id?: string
  durable_evidence?: boolean
  recorded_at?: string
  failure_count?: number
  route_check_count?: number
  feature_check_count?: number
  created_record_count?: number
  retained_record_count?: number
}

export type QaRunHistoryResult = {
  status?: MetaOpsStatus
  workspace_id?: string
  count?: number
  latest?: QaRunResult
  rows?: QaRunResult[]
  summary?: {
    ready_count?: number
    blocked_count?: number
    failure_count?: number
    retained_record_count?: number
  }
}

export type CloudAutonomyStatus = {
  status?: MetaOpsStatus
  generated_at?: string
  pc_dependency?: string
  runtime?: {
    target?: string
    base_url?: string
    vercel_url?: string
    vercel_env?: string
    service?: string
    revision?: string
  }
  persistence?: {
    status?: MetaOpsStatus
    external_database?: boolean
    write_blocked?: boolean
    detail?: string
  }
  cron?: {
    status?: MetaOpsStatus
    provider?: string
    secret_configured?: boolean
    plan_note?: string
    jobs?: Array<{
      id?: string
      path?: string
      schedule?: string
      cadence?: string
      purpose?: string
      runtime?: string
      auth?: string
    }>
    ytf_orchestrator?: {
      status?: MetaOpsStatus
      path?: string
      schedule?: string
      cadence?: string
      lane_count?: number
      mode?: string
      next_run?: {
        utc?: string
        myanmar?: string
        label?: string
      }
      last_run?: {
        status?: string
        run_status?: string
        completed_at?: string
        updated_at?: string
        started_at?: string
        summary?: string
      }
    }
    ytf_internal_agent_lanes?: Array<{
      id?: string
      path?: string
      evidence_key?: string
      purpose?: string
    }>
    ytf_lane_evidence?: Array<{
      id?: string
      path?: string
      evidence_key?: string
      purpose?: string
      evidence?: {
        status?: string
        run_status?: string
        completed_at?: string
        updated_at?: string
        started_at?: string
        summary?: string
      }
    }>
  }
  worker_lane?: {
    status?: MetaOpsStatus
    provider?: string
    mode?: string
    default_queue?: string
    brief_queue?: string
    browser_queue?: string
    worker_url_configured?: boolean
  }
  latest_runs?: Record<string, Record<string, unknown>>
  blockers?: Array<{ id?: string; label?: string; fix?: string }>
  warnings?: Array<{ id?: string; label?: string; fix?: string }>
  operator_next_actions?: string[]
}

export type EnterpriseReadinessStatus = {
  status?: MetaOpsStatus
  generated_at?: string
  overall_score?: number
  threshold?: number
  sale_ready?: boolean
  pc_dependency?: string
  dimensions?: Array<{
    id?: string
    label?: string
    score?: number
    status?: MetaOpsStatus
    evidence?: string
    next_action?: string
  }>
  blockers?: Array<Record<string, unknown>>
  attention?: Array<Record<string, unknown>>
  next_actions?: Array<{
    id?: string
    priority?: string
    label?: string
    route?: string
  }>
  summary?: Record<string, unknown>
}

export type MetaOpsSnapshot = {
  status?: MetaOpsStatus
  generated_at?: string
  workspace?: {
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    role?: string
  }
  deployment?: {
    deployment_url?: string
    vercel_url?: string
    vercel_env?: string
    commit?: string
    branch?: string
    scripts_ready?: boolean
    vercel_cli_available?: boolean
  }
  aliases?: {
    status?: MetaOpsStatus
    targets?: MetaOpsDomainTarget[]
    note?: string
  }
  route_health?: {
    status?: MetaOpsStatus
    score?: number
    rows?: Array<Record<string, unknown>>
  }
  connectors?: {
    rows?: Array<{
      id?: string
      name?: string
      status?: MetaOpsStatus
      route?: string
      purpose?: string
      next_fix?: string
      remote_credential_embedded?: boolean
      branch?: string
    }>
    events_route?: string
  }
  billing?: {
    status?: MetaOpsStatus
    route?: string
    packages?: string[]
    billing_mode?: string
    checkout_ready?: boolean
    quote_ready?: boolean
    manifest_count?: number
    next_fix?: string
  }
  github?: {
    status?: MetaOpsStatus
    repo?: string
    branch?: string
    is_dirty?: boolean
    remote_credential_embedded?: boolean
    latest_workflow_run?: Record<string, unknown>
    api_access_mode?: string
    message?: string
    cli?: {
      status?: MetaOpsStatus
      installed?: boolean
      authenticated?: boolean
      path?: string
      version?: string
      message?: string
      setup_commands?: string[]
    }
    automation?: {
      status?: MetaOpsStatus
      mode?: string
      cloud_token_ready?: boolean
      local_cli_ready?: boolean
      local_cli_installed?: boolean
      next_action?: string
      env_names?: string[]
    }
  }
  agent_workforce?: {
    status?: MetaOpsStatus
    summary?: Record<string, unknown>
    core_team?: Array<Record<string, unknown>>
    automation_lanes?: Array<Record<string, unknown>>
    route?: string
  }
  agent_workcells?: {
    status?: MetaOpsStatus
    route?: string
    api_route?: string
    queue_route?: string
    workcell_count?: number
    ready_count?: number
    queue_packet_count?: number
    blocked_action_count?: number
    rules?: Array<Record<string, unknown>>
    workcells?: Array<Record<string, unknown>>
    queue_packets?: Array<Record<string, unknown>>
    recent_runs?: Array<Record<string, unknown>>
    smoke_command?: string
    client_rule?: string
  }
  module_readiness?: {
    status?: MetaOpsStatus
    ready_count?: number
    count?: number
    contracts?: ModuleReadinessContract[]
  }
  tool_broker?: MetaOpsToolBroker
  research_adaptation?: MetaOpsResearchAdaptation
  cloud_autonomy?: CloudAutonomyStatus
  enterprise_readiness?: EnterpriseReadinessStatus
  qa?: {
    latest?: QaRunResult
    history?: QaRunHistoryResult
    commands?: string[]
  }
  operator_next_actions?: Array<{
    id?: string
    priority?: string
    label?: string
    command?: string
    route?: string
  }>
  primary_next_action?: {
    id?: string
    priority?: string
    label?: string
    command?: string
    route?: string
  }
  next_fix?: string
}

export async function getMetaOpsControl() {
  return workspaceFetch<MetaOpsSnapshot>('/api/meta-ops/control')
}

export async function getEnterpriseReadinessStatus() {
  return workspaceFetch<EnterpriseReadinessStatus>('/api/enterprise-readiness/status')
}

export async function getLatestMetaOpsQaRun() {
  return workspaceFetch<QaRunResult>('/api/meta-ops/qa/latest')
}

export async function getMetaOpsQaHistory(limit = 20) {
  return workspaceFetch<QaRunHistoryResult>(`/api/meta-ops/qa/history?limit=${encodeURIComponent(String(limit))}`)
}

export async function runMetaOpsQa(payload?: { target?: string; mode?: 'safe' | 'full'; cleanup?: boolean }) {
  return workspaceFetch<QaRunResult>('/api/meta-ops/qa/run', {
    method: 'POST',
    body: JSON.stringify({
      target: payload?.target ?? 'read_only_route_audit',
      mode: payload?.mode ?? 'safe',
      cleanup: payload?.cleanup ?? true,
    }),
  })
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
  attempt_count?: number
  max_attempts?: number
  scheduled_for?: string
  idempotency_key?: string | null
  related_entity_type?: string
  related_entity_id?: string
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  evidence_contract?: Record<string, unknown>
}

export type AgentJobTemplate = {
  job_type: string
  name: string
  cadence: string
  description: string
  last_run?: AgentRunRow | null
}

export type AgentWorkforceCrewSnapshot = {
  team_id: string
  name: string
  status: string
  scaling_tier: string
  mission: string
  job_count: number
  agent_count: number
}

export type AgentWorkforceSnapshot = {
  status: string
  crew_count: number
  runnable_job_count: number
  stale_job_count: number
  errored_job_count: number
  recent_run_count: number
  last_run_at: string
  can_run: boolean
  crews: AgentWorkforceCrewSnapshot[]
  jobs: AgentJobTemplate[]
  recent_runs: AgentRunRow[]
}

function isAgentRunErrored(status?: string) {
  return ['error', 'failed', 'blocked'].includes(String(status || '').trim().toLowerCase())
}

function isAgentJobStale(job: AgentJobTemplate) {
  const lastRun = job.last_run
  const lastTimestamp = String(lastRun?.completed_at || lastRun?.started_at || lastRun?.created_at || '').trim()
  if (!lastTimestamp) return true
  const parsed = new Date(lastTimestamp)
  if (Number.isNaN(parsed.getTime())) return true

  const cadence = String(job.cadence || '').trim().toLowerCase()
  const thresholdHours = cadence === '15m' ? 1 : cadence === 'hourly' ? 3 : cadence === 'daily' ? 36 : 12
  return Date.now() - parsed.getTime() > thresholdHours * 60 * 60 * 1000
}

function latestAgentRunTimestamp(rows: AgentRunRow[], jobs: AgentJobTemplate[]) {
  const timestamps = [
    ...rows.map((row) => row.completed_at || row.started_at || row.created_at),
    ...jobs.map((job) => job.last_run?.completed_at || job.last_run?.started_at || job.last_run?.created_at || ''),
  ].filter(Boolean)

  return timestamps
    .map((value) => ({ value, parsed: new Date(value).getTime() }))
    .filter((item) => !Number.isNaN(item.parsed))
    .sort((left, right) => right.parsed - left.parsed)[0]?.value ?? ''
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

export async function getAgentWorkforceSnapshot(): Promise<AgentWorkforceSnapshot> {
  const [teamsPayload, runsPayload] = await Promise.all([getAgentTeams(), listAgentRuns(12)])
  const jobs = runsPayload.jobs ?? []
  const recentRuns = runsPayload.rows ?? []
  const runtimeCrews = teamsPayload.runtime_contract?.crews ?? []

  const crews = (teamsPayload.teams ?? []).slice(0, 8).map((team) => {
    const contract = runtimeCrews.find((crew) => crew.team_id === team.team_id)
    return {
      team_id: team.team_id,
      name: team.name,
      status: team.status,
      scaling_tier: team.scaling_tier,
      mission: team.mission,
      job_count: contract?.job_types?.length ?? 0,
      agent_count: team.agents.length,
    }
  })

  return {
    status: teamsPayload.status || runsPayload.status || 'ready',
    crew_count: teamsPayload.summary?.team_count ?? crews.length,
    runnable_job_count: jobs.length,
    stale_job_count: jobs.filter(isAgentJobStale).length,
    errored_job_count: jobs.filter((job) => isAgentRunErrored(job.last_run?.status)).length,
    recent_run_count: recentRuns.length,
    last_run_at: latestAgentRunTimestamp(recentRuns, jobs),
    can_run: Boolean(teamsPayload.runtime_contract?.viewer?.can_run_jobs || teamsPayload.runtime_contract?.viewer?.can_manage_runtime),
    crews,
    jobs,
    recent_runs: recentRuns,
  }
}

export async function runAgentJob(payload: {
  job_type: string
  source?: string
  payload?: Record<string, unknown>
  idempotency_key?: string
  enqueue_only?: boolean
}) {
  return workspaceFetch<{
    status?: string
    mode?: string
    row?: AgentRunRow
    jobs?: AgentJobTemplate[]
  }>('/api/agent-runs', {
    method: 'POST',
    body: JSON.stringify({
      job_type: payload.job_type,
      source: payload.source ?? 'manual',
      payload: payload.payload ?? {},
      idempotency_key: payload.idempotency_key ?? '',
      enqueue_only: payload.enqueue_only ?? false,
    }),
  })
}

export type AgentWorkcellRule = {
  id?: string
  rule?: string
  client_sees?: string
  operator_sees?: string
  audit_signal?: string
}

export type AgentWorkcellRow = {
  id?: string
  name?: string
  route?: string
  api?: string
  trigger?: string
  client_output?: string
  operator_control?: string
  allowed_tools?: string[]
  blocked_actions?: string[]
  evidence?: string[]
  review_gate?: string
  maturity?: string
}

export type AgentWorkcellQueuePacket = {
  id?: string
  workcell_id?: string
  source?: string
  packet?: string
  output?: string
  review_gate?: string
}

export type AgentWorkcellControlPayload = {
  status?: string
  workspace_id?: string
  viewer?: {
    display_name?: string
    role?: string
    capabilities?: string[]
  }
  rules?: AgentWorkcellRule[]
  workcells?: AgentWorkcellRow[]
  queue_packets?: AgentWorkcellQueuePacket[]
  recent_runs?: AgentRunRow[]
  can_queue?: boolean
  contract?: Record<string, unknown>
}

export type AgentWorkcellQueueResult = {
  status?: string
  mode?: string
  queued_count?: number
  row?: AgentRunRow
  result?: Record<string, unknown>
  tasks?: Record<string, unknown>
  control?: {
    workcells?: AgentWorkcellRow[]
    queue_packets?: AgentWorkcellQueuePacket[]
  }
}

export async function getAgentWorkcellsControl() {
  return workspaceFetch<AgentWorkcellControlPayload>('/api/agent-workcells/control')
}

export async function queueAgentWorkcellPacket(payload: {
  workcell_id: string
  packet_id?: string
  source?: string
  notes?: string
  run_now?: boolean
}) {
  return workspaceFetch<AgentWorkcellQueueResult>('/api/agent-workcells/queue-packet', {
    method: 'POST',
    body: JSON.stringify({
      workcell_id: payload.workcell_id,
      packet_id: payload.packet_id ?? '',
      source: payload.source ?? 'operator_workcell_panel',
      notes: payload.notes ?? '',
      run_now: payload.run_now ?? false,
    }),
    timeoutMs: 70000,
  })
}

export type AgentWorkbenchCommandRunPayload = {
  command_id: string
  project_id?: string
  command?: Record<string, unknown>
  project?: Record<string, unknown>
  notes?: string
  enqueue_only?: boolean
}

export type AgentWorkbenchCommandRunResult = {
  status?: string
  mode?: string
  row?: AgentRunRow
  rows?: AgentRunRow[]
  jobs?: AgentJobTemplate[]
  artifact?: Record<string, unknown>
  learning?: Record<string, unknown>
  tasks?: Record<string, unknown>
  next_step?: string
}

export type AgentWorkbenchPromotionResult = AgentWorkbenchCommandRunResult & {
  execution_packet?: Record<string, unknown>
  source_artifact?: Record<string, unknown>
}

export type AgentWorkbenchImplementationResult = AgentWorkbenchCommandRunResult & {
  implementation_proposal?: Record<string, unknown>
  execution_packet?: Record<string, unknown>
}

export type AgentWorkbenchPatchExecutionResult = AgentWorkbenchCommandRunResult & {
  patch_execution?: Record<string, unknown>
  implementation_proposal?: Record<string, unknown>
}

export type AgentWorkbenchFullBuildLoopResult = AgentWorkbenchPatchExecutionResult & {
  chain?: Array<Record<string, unknown>>
  execution_packet?: Record<string, unknown>
  mode?: string
  task_count?: number
}

export async function runAgentWorkbenchCommand(payload: AgentWorkbenchCommandRunPayload) {
  return workspaceFetch<AgentWorkbenchCommandRunResult>('/api/agent-workbench/run-command', {
    method: 'POST',
    body: JSON.stringify({
      command_id: payload.command_id,
      project_id: payload.project_id ?? '',
      command: payload.command ?? {},
      project: payload.project ?? {},
      notes: payload.notes ?? '',
      enqueue_only: payload.enqueue_only ?? false,
    }),
    timeoutMs: 70000,
  })
}

export async function runAgentWorkbenchFullLoop(payload: AgentWorkbenchCommandRunPayload) {
  return workspaceFetch<AgentWorkbenchFullBuildLoopResult>('/api/agent-workbench/run-full-loop', {
    method: 'POST',
    body: JSON.stringify({
      command_id: payload.command_id,
      project_id: payload.project_id ?? '',
      command: payload.command ?? {},
      project: payload.project ?? {},
      notes: payload.notes ?? '',
    }),
    timeoutMs: 220000,
  })
}

export type BuildMachineCommand = {
  id: string
  label: string
  kind?: string
  cwd?: string
  command?: string
  timeout_seconds?: number
}

export type BuildMachineControl = {
  status?: string
  workspace?: Record<string, unknown>
  operator?: {
    can_view?: boolean
    can_run?: boolean
    execution_enabled?: boolean
    safe_mode?: boolean
    demo_workspace?: boolean
    gate?: string
  }
  commands?: BuildMachineCommand[]
  default_command_ids?: string[]
  latest?: Record<string, unknown>
  runs?: {
    count?: number
    rows?: AgentRunRow[]
  }
  patch_queue?: {
    count?: number
    rows?: AgentRunRow[]
  }
  tasks?: {
    count?: number
    rows?: Array<Record<string, unknown>>
  }
  next_step?: string
}

export type BuildMachineRunResult = {
  status?: string
  row?: AgentRunRow
  build_machine?: Record<string, unknown>
  tasks?: Record<string, unknown>
  control?: BuildMachineControl
  next_step?: string
}

export async function getBuildMachineControl() {
  return workspaceFetch<BuildMachineControl>('/api/build-machine/control')
}

export async function runBuildMachineGate(payload: {
  source_run_id?: string
  command_ids?: string[]
  mode?: string
  dry_run?: boolean
  create_tasks?: boolean
  notes?: string
}) {
  return workspaceFetch<BuildMachineRunResult>('/api/build-machine/run', {
    method: 'POST',
    body: JSON.stringify({
      source_run_id: payload.source_run_id ?? '',
      command_ids: payload.command_ids ?? [],
      mode: payload.mode ?? 'plan',
      dry_run: payload.dry_run ?? true,
      create_tasks: payload.create_tasks ?? true,
      notes: payload.notes ?? '',
    }),
    timeoutMs: 90000,
  })
}

export async function promoteAgentWorkbenchRun(payload: { run_id: string; notes?: string; enqueue_only?: boolean }) {
  return workspaceFetch<AgentWorkbenchPromotionResult>('/api/agent-workbench/promote-run', {
    method: 'POST',
    body: JSON.stringify({
      run_id: payload.run_id,
      notes: payload.notes ?? '',
      enqueue_only: payload.enqueue_only ?? false,
    }),
    timeoutMs: 70000,
  })
}

export async function proposeAgentImplementation(payload: { run_id: string; notes?: string; enqueue_only?: boolean }) {
  return workspaceFetch<AgentWorkbenchImplementationResult>('/api/agent-workbench/propose-implementation', {
    method: 'POST',
    body: JSON.stringify({
      run_id: payload.run_id,
      notes: payload.notes ?? '',
      enqueue_only: payload.enqueue_only ?? false,
    }),
    timeoutMs: 70000,
  })
}

export async function executeAgentPatch(payload: { run_id: string; notes?: string; enqueue_only?: boolean }) {
  return workspaceFetch<AgentWorkbenchPatchExecutionResult>('/api/agent-workbench/execute-patch', {
    method: 'POST',
    body: JSON.stringify({
      run_id: payload.run_id,
      notes: payload.notes ?? '',
      enqueue_only: payload.enqueue_only ?? false,
    }),
    timeoutMs: 70000,
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
  const body = JSON.stringify({ username, password, workspace_slug: workspaceSlug || defaultWorkspaceSlug })
  let loginPayload: WorkspaceSessionPayload | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      loginPayload = await workspaceFetch<WorkspaceSessionPayload>('/api/auth/login', {
        method: 'POST',
        body,
        timeoutMs: 30000,
      })
      break
    } catch (error) {
      lastError = error
      const status = (error as Error & { status?: number }).status
      const message = error instanceof Error ? error.message : ''
      const retryable = status === 503 && /busy|retry|storage/i.test(message)
      if (!retryable || attempt === 2) {
        throw error
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 650 * (attempt + 1)))
    }
  }
  if (!loginPayload) {
    throw lastError instanceof Error ? lastError : new Error('Workspace login failed.')
  }
  const payload = normalizeWorkspaceSessionPayload(loginPayload)
  if (payload.authenticated) {
    saveCachedWorkspaceSession(payload)
  }
  return payload
}

export async function logoutWorkspace() {
  clearCachedWorkspaceSession()
  return workspaceFetch<{ status?: string; authenticated?: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 2500,
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

export async function listWorkspaceTasks(status?: string, limit = 200, init?: WorkspaceFetchInit) {
  const params = new URLSearchParams()
  if (status) {
    params.set('status', status)
  }
  params.set('limit', String(limit))
  return workspaceFetch<{
    status?: string
    count?: number
    rows?: WorkspaceTaskRow[]
  }>(`/api/workspace-tasks?${params.toString()}`, init)
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
    ytf_feedback?: {
      status?: string
      synced_at?: string
      completed?: boolean
      decision_id?: string
      next_step?: string
      action_feedback?: {
        status?: string
        saved_count?: number
      }
      decision_feedback?: DecisionRow | null
    }
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

export type YtfDataManagerRunResult = {
  status?: string
  synced_at?: string
  source?: string
  actor?: string
  mode?: string
  database?: {
    state_db?: string
    enterprise_workspace_id?: string
    enterprise_workspace_slug?: string
  }
  root?: {
    mode?: string
    connector_status?: string
    summary?: {
      lane_count?: number
      live_item_count?: number
      canonical_record_count?: number
      owner_attention_count?: number
      recent_item_count?: number
      root_folder_url?: string
    }
    recent_lanes?: Array<Record<string, unknown>>
  }
  plant_a?: {
    mode?: string
    connector_status?: string
    source_lane_count?: number
    source_item_count?: number
    shortcut_count?: number
    canonical_record_count?: number
  }
  saved?: {
    metrics?: number
    actions?: number
    quality_incidents?: number
    approvals?: number
    source_checks?: number
    workspace_tasks?: number
    enterprise_metrics?: number
  }
  extraction_plan?: YtfExtractionPlanResult
  extraction_preview?: {
    status?: string
    metric_count?: number
    summary_stats?: {
      metric_count?: number
      numeric_metric_count?: number
      group_counts?: Record<string, number>
    }
    files?: Array<{
      candidate?: YtfExtractionCandidate
      preview_status?: string
      download_status?: string
      preview_sheet_count?: number
      ready_preview_sheet_count?: number
      size_bytes?: number
      metric_count?: number
    }>
  }
  high_signal_actions?: Array<{
    id?: string
    title?: string
    action?: string
    owner?: string
    priority?: string
    due?: string
    status?: string
    evidence_link?: string
    evidence_path?: string
  }>
  next_steps?: string[]
}

export type YtfPipelineStatsResult = {
  status?: string
  workspace_id?: string
  database?: {
    configured?: boolean
    external?: boolean
    scheme?: string
    mode?: string
    env_source?: string
    driver?: string
    workspace_id?: string
    next_step?: string
  }
  source_records?: {
    count?: number
    latest_modified_time?: string
    by_domain?: Record<string, number>
    by_plant?: Record<string, number>
    kpi_candidate_count?: number
    rag_candidate_count?: number
    shortcut_count?: number
    drive_shortcut_count?: number
    windows_shortcut_count?: number
    resolved_shortcut_target_count?: number
    unresolved_shortcut_count?: number
    unresolved_drive_shortcut_count?: number
    shortcut_backed_record_count?: number
    agentic_extraction?: YtfAgenticExtractionSummary
    index_truncated?: boolean
  }
  source_changes?: {
    event_count?: number
    recent_event_count?: number
    added_count?: number
    updated_count?: number
    removed_count?: number
    latest_event_at?: string
    promoted_task_count?: number
    latest_promoted_at?: string
    task_promotion?: YtfSourceChangeTaskPromotionResult
    summary?: {
      event_count?: number
      recent_event_count?: number
      added_count?: number
      updated_count?: number
      removed_count?: number
      latest_event_at?: string
      by_type?: Record<string, number>
      by_domain?: Record<string, number>
      by_plant?: Record<string, number>
      since_hours?: number
    }
    events?: Array<{
      event_id?: string
      change_type?: string
      title?: string
      domain?: string
      plant?: string
      department?: string
      owning_route?: string
      owner_hint?: string
      current_modified_time?: string
      previous_modified_time?: string
      detected_at?: string
      summary?: string
    }>
  }
  workbooks?: {
    profiled_count?: number
    selected_count?: number
    metric_candidate_count?: number
    metric_value_count?: number
    blocked_count?: number
  }
  knowledge?: {
    chunk_count?: number
    token_count?: number
    latest_at?: string
    pgvector_ready?: boolean
  }
  communications?: {
    gmail_ready_count?: number
    gmail_source_count?: number
    bot_ready_count?: number
    bot_source_count?: number
    manual_message_count?: number
    connector_event_count?: number
    latest_sync?: string
  }
  refresh_loop?: {
    status?: string
    latest_at?: string
    run_count?: number
    cron_path?: string
  }
  stat_cards?: Array<{
    id?: string
    label?: string
    value?: number | string
    detail?: string
    status?: string
    route?: string
  }>
  next_actions?: string[]
}

export type YtfErpLoopChannel = {
  id?: string
  label?: string
  status?: string
  count?: number
  output?: string
  route?: string
}

export type YtfErpLoopCoverage = {
  id?: string
  label?: string
  status?: string
  count?: number
  current?: string
  missing?: string
  route?: string
}

export type YtfErpLoopGap = {
  id?: string
  label?: string
  detail?: string
}

export type YtfErpLoopResult = {
  status?: string
  score?: number
  plain_summary?: string
  input_channels?: YtfErpLoopChannel[]
  erp_coverage?: YtfErpLoopCoverage[]
  missing_enterprise_layer?: YtfErpLoopGap[]
  database_learning?: Record<string, number | boolean | string | null | undefined>
}

export type YtfDashboardSummaryResult = {
  status?: string
  mode?: string
  generated_at?: string
  workspace_id?: string
  database?: YtfPipelineStatsResult['database']
  pipeline_stats?: YtfPipelineStatsResult
  erp_loop?: YtfErpLoopResult
  knowledge_status?: YtfKnowledgeStatusResult
  gmail_status?: YtfGmailStatusResult
  bot_pipeline?: YtfBotPipelineResult
  kpi_definitions?: YtfKpiDefinitionsResult
  latest_metrics?: MetricRecordsResult
  story?: {
    source_events?: NonNullable<YtfPipelineStatsResult['source_changes']>['events']
    owner_focus?: Array<{
      label?: string
      count?: number
      route?: string
      sample?: string
    }>
    next_actions?: string[]
  }
}

export type YtfSourceChangeTaskPromotionResult = {
  status?: string
  workspace_id?: string
  promoted_at?: string
  source_event_count?: number
  saved_count?: number
  action_saved_count?: number
  review_task_count?: number
  tasks?: WorkspaceTaskRow[]
  actions?: Array<{
    id?: string
    lane?: string
    title?: string
    action?: string
    owner?: string
    priority?: string
    due?: string
    status?: string
    evidence_link?: string
    evidence_path?: string
    synced_at?: string
  }>
  next_step?: string
}

export type YtfChangeMonitorResult = {
  status?: string
  synced_at?: string
  mode?: string
  connector_status?: string
  summary?: {
    lane_count?: number
    live_item_count?: number
    canonical_record_count?: number
    shortcut_count?: number
    workbook_count?: number
    high_risk_count?: number
    owner_attention_count?: number
    recent_item_count?: number
    root_folder_url?: string
  }
  change_watch?: Array<{
    id?: string
    title?: string
    domain?: string
    owner?: string
    route?: string
    priority?: string
    source_mode?: string
    signal?: string
    metric_candidates?: string[]
    next_action?: string
    updated_at?: string
  }>
  owner_briefs?: Array<{
    owner?: string
    priority_count?: number
    item_count?: number
    routes?: string[]
    brief?: string
    items?: Array<{
      id?: string
      title?: string
      domain?: string
      route?: string
      priority?: string
      signal?: string
      next_action?: string
    }>
  }>
  owner_handoffs?: Array<{
    id?: string
    domain?: string
    from?: string
    to?: string
    route?: string
    cadence?: string
    reason?: string
    data_needed?: string
  }>
  kpi_candidates?: Array<{
    id?: string
    name?: string
    domain?: string
    owner?: string
    route?: string
    stage?: string
    formula_hint?: string
    source_signal?: string
  }>
  recent_lanes?: Array<Record<string, unknown>>
  open_actions?: Array<{
    id?: string
    title?: string
    action?: string
    owner?: string
    priority?: string
    due?: string
    status?: string
    evidence_link?: string
    evidence_path?: string
  }>
  source_changes?: YtfPipelineStatsResult['source_changes']
  data_manager?: {
    status?: string
    synced_at?: string
    saved?: YtfDataManagerRunResult['saved']
    extraction_preview?: YtfDataManagerRunResult['extraction_preview']
    extraction_plan?: YtfExtractionPlanResult
  }
  durable_metrics?: {
    database?: {
      configured?: boolean
      external?: boolean
      scheme?: string
      mode?: string
      workspace_id?: string
    }
    summary?: {
      metric_count?: number
      official_count?: number
      candidate_count?: number
      by_group?: Record<string, number>
      by_status?: Record<string, number>
      latest_at?: string
    }
  }
  pipeline_stats?: YtfPipelineStatsResult
  next_steps?: string[]
}

export type YtfFullRefreshLatestResult = {
  status?: string
  workspace_id?: string
  count?: number
  next_step?: string
  latest?: {
    run_id?: string
    id?: string
    status?: string
    result_status?: string
    source?: string
    summary?: string
    created_at?: string
    started_at?: string
    completed_at?: string
    updated_at?: string
    stale_running?: boolean
    age_seconds?: number
    running_timeout_seconds?: number
    pipeline_version?: string
    step_count?: number
    has_source_change_review_step?: boolean
    has_file_agent_extraction_step?: boolean
    result?: {
      status?: string
      synced_at?: string
      summary?: Record<string, unknown>
      steps?: Array<Record<string, unknown>>
    }
  }
  rows?: Array<Record<string, unknown>>
}

export type YtfFullRefreshRunResult = {
  status?: string
  mode?: string
  synced_at?: string
  workspace_id?: string
  next_step?: string
  steps?: Array<Record<string, unknown>>
  summary?: Record<string, unknown>
  result?: NonNullable<YtfFullRefreshLatestResult['latest']>['result']
  agent_run?: Record<string, unknown>
  latest_runs?: Array<Record<string, unknown>>
}

export type YtfEvaluationResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  overall_score?: number
  verdict?: string
  dimensions?: Array<{
    id?: string
    title?: string
    score?: number
    status?: string
    route?: string
    why?: string
    evidence?: string[]
  }>
  top_gaps?: Array<{
    id?: string
    title?: string
    severity?: string
    route?: string
    why?: string
    done_when?: string
  }>
  errc?: Array<{
    quadrant?: string
    title?: string
    detail?: string
  }>
  next_tests?: string[]
  linked?: {
    data_quality?: Record<string, unknown>
    change_monitor?: YtfChangeMonitorResult
    durable_metrics?: {
      database?: {
        configured?: boolean
        external?: boolean
        scheme?: string
        mode?: string
        workspace_id?: string
      }
      summary?: {
        metric_count?: number
        official_count?: number
        candidate_count?: number
        by_group?: Record<string, number>
        by_status?: Record<string, number>
        latest_at?: string
      }
    }
  }
}

export type YtfOwnerBriefResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  readiness?: number
  mode?: string
  headline?: string
  today?: {
    owner_brief_count?: number
    watched_change_count?: number
    open_action_count?: number
    weak_dimension_count?: number
    ready_lane_count?: number
    shortcut_debt_count?: number
    metric_count?: number
    candidate_count?: number
    official_count?: number
    chunk_count?: number
    entity_count?: number
    relation_count?: number
  }
  next_decisions?: Array<{
    id?: string
    title?: string
    owner?: string
    route?: string
    decision?: string
    why?: string
    urgency?: string
  }>
  owner_briefs?: NonNullable<YtfChangeMonitorResult['owner_briefs']>
  top_changes?: NonNullable<YtfChangeMonitorResult['change_watch']>
  weak_dimensions?: NonNullable<YtfEvaluationResult['dimensions']>
  rag?: {
    status?: string
    answer?: string
    matched_record_count?: number
    rag?: {
      summary?: {
        chunk_count?: number
        entity_count?: number
        relation_count?: number
        retrieval_trace_count?: number
      }
      chunks?: Array<{
        chunk_id?: string
        text?: string
        route?: string
        source_url?: string
      }>
      semantic?: {
        status?: string
        strategy?: string
        model?: string
        chunk_count?: number
        matched_chunk_count?: number
        next_upgrade?: string
        top_chunks?: Array<{
          chunk_id?: string
          record_id?: string
          chunk_type?: string
          route?: string
          source_url?: string
          score?: number
          token_hits?: string[]
          text?: string
        }>
      }
    }
    next_moves?: string[]
    evidence?: Array<Record<string, unknown>>
  }
  operating_rhythm?: string[]
  evaluation?: {
    overall_score?: number
    verdict?: string
    top_gaps?: NonNullable<YtfEvaluationResult['top_gaps']>
    database?: {
      external?: boolean
      mode?: string
      env_source?: string
      next_step?: string
    }
  }
}

export type YtfOwnerDecisionWritebackResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  selected_count?: number
  workspace_tasks?: {
    status?: string
    saved_count?: number
    saved_task_ids?: string[]
    rows?: WorkspaceTaskRow[]
  }
  actions?: {
    status?: string
    saved_count?: number
    saved_rows?: Array<Record<string, unknown>>
  }
  next_step?: string
}

export type YtfActionFeedbackResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  task_id?: string
  template?: string
  task_status?: string
  completed?: boolean
  decision_id?: string
  next_step?: string
  action_feedback?: {
    status?: string
    saved_count?: number
  }
  decision_feedback?: DecisionRow | null
}

export type YtfKnowledgeStatusResult = {
  status?: string
  database?: {
    configured?: boolean
    external?: boolean
    scheme?: string
    mode?: string
    env_source?: string
    driver?: string
    workspace_id?: string
    next_step?: string
  }
  summary?: {
    chunk_count?: number
    token_count?: number
    by_source?: Record<string, number>
    by_route?: Record<string, number>
    latest_at?: string
  }
  vector_readiness?: {
    mode?: string
    token_profile_count?: number
    embedding_indexed_count?: number
    embedding_provider_configured?: boolean
    pgvector_ready?: boolean
    next_step?: string
  }
  embedding_index?: {
    status?: string
    indexed_count?: number
    missing_count?: number
    stale_count?: number
    model_mismatch_count?: number
    model?: string
  }
  next_step?: string
}

export type YtfKnowledgeQueryResult = {
  status?: string
  query?: string
  answer?: string
  matched_record_count?: number
  rag?: {
    summary?: {
      chunk_count?: number
      entity_count?: number
      relation_count?: number
      retrieval_trace_count?: number
    }
    chunks?: Array<{
      chunk_id?: string
      text?: string
      route?: string
      source_url?: string
    }>
    semantic?: {
      status?: string
      strategy?: string
      model?: string
      chunk_count?: number
      matched_chunk_count?: number
      next_upgrade?: string
      top_chunks?: Array<{
        chunk_id?: string
        record_id?: string
        chunk_type?: string
        route?: string
        source_url?: string
        score?: number
        token_hits?: string[]
        text?: string
      }>
    }
  }
  evidence?: Array<Record<string, unknown>>
  next_moves?: string[]
}

export type YtfKnowledgeVectorQueryResult = {
  status?: string
  mode?: string
  query?: string
  result?: {
    status?: string
    model?: string
    match_count?: number
    matches?: Array<{
      chunk_id?: string
      title?: string
      text?: string
      route?: string
      source_url?: string
      similarity?: number
    }>
  }
  fallback?: YtfKnowledgeQueryResult
  next_step?: string
}

export type YtfKnowledgeRebuildResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  source?: string
  saved?: {
    status?: string
    saved_count?: number
    saved_chunk_ids?: string[]
    summary?: YtfKnowledgeStatusResult['summary']
  }
  knowledge?: YtfKnowledgeStatusResult
}

export type YtfCompanyBrainGraphNode = {
  id?: string
  label?: string
  type?: string
  count?: number
  detail?: string
  route?: string
}

export type YtfCompanyBrainGraphEdge = {
  from?: string
  to?: string
  label?: string
}

export type YtfCompanyBrainFactoryBook = {
  id?: string
  label?: string
  count?: number
  value?: string
  detail?: string
  route?: string
}

export type YtfCompanyBrainPlantScope = {
  id?: 'plant-a' | 'plant-b' | 'shared' | string
  label?: string
  site?: string
  count?: number
  value?: string
  detail?: string
  route?: string
}

export type YtfCompanyBrainInsight = {
  id?: string
  title?: string
  value?: string
  detail?: string
  route?: string
}

export type YtfCompanyBrainFlowStep = {
  label?: string
  detail?: string
}

export type YtfCompanyBrainGraphResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  summary?: {
    source_records?: number
    dashboard_values?: number
    knowledge_chunks?: number
    pgvector_ready?: boolean
    plant_a_records?: number
    plant_b_records?: number
    shared_records?: number
    plant_scope_count?: number
    factory_books_ready?: number
    factory_books_total?: number
    domains?: Record<string, number>
  }
  nodes?: YtfCompanyBrainGraphNode[]
  edges?: YtfCompanyBrainGraphEdge[]
  plant_scopes?: YtfCompanyBrainPlantScope[]
  factory_books?: YtfCompanyBrainFactoryBook[]
  flow?: YtfCompanyBrainFlowStep[]
  insights?: YtfCompanyBrainInsight[]
  next_build?: string[]
}

export type YtfSourceRecord = {
  source_record_id?: string
  workspace_id?: string
  source_system?: string
  source_root_id?: string
  source_root_title?: string
  source_item_id?: string
  title?: string
  path?: string
  organized_path?: string
  mime_type?: string
  file_kind?: string
  domain?: string
  plant?: string
  department?: string
  owning_route?: string
  owner_hint?: string
  kpi_readiness?: string
  rag_readiness?: string
  risk_level?: string
  source_behavior?: string
  source_mode?: string
  web_view_link?: string
  modified_time?: string
  size_bytes?: number
  shortcut_target_id?: string
  shortcut_target_mime_type?: string
  classification?: Record<string, unknown>
  lineage?: Record<string, unknown>
  synced_at?: string
  updated_at?: string
}

export type YtfAgenticExtractionSummary = {
  file_agent_count?: number
  high_priority_file_agent_count?: number
  high_priority_count?: number
  missing_contract_count?: number
  profile_count?: number
  by_profile?: Record<string, number>
  by_automation_mode?: Record<string, number>
  by_priority?: Record<string, number>
}

export type YtfSourceRecordSummary = {
  source_record_count?: number
  by_domain?: Record<string, number>
  by_plant?: Record<string, number>
  by_department?: Record<string, number>
  by_file_kind?: Record<string, number>
  by_kpi_readiness?: Record<string, number>
  by_rag_readiness?: Record<string, number>
  metric_candidate_count?: number
  rag_candidate_count?: number
  dashboard_safe_count?: number
  rag_safe_count?: number
  latest_modified_time?: string
  agentic_extraction?: YtfAgenticExtractionSummary
}

export type YtfSourceRecordsResult = {
  status?: string
  workspace_id?: string
  summary?: YtfSourceRecordSummary
  database?: {
    status?: string
    database?: YtfKnowledgeStatusResult['database']
    summary?: YtfSourceRecordSummary
    next_step?: string
  }
  promotion_board?: {
    generated_at?: string
    action_count?: number
    by_action_type?: Record<string, number>
    by_priority?: Record<string, number>
    by_owner?: Record<string, number>
    metric_catalog?: string[]
    actions?: Array<{
      action_id?: string
      action_type?: string
      priority?: string
      owner_hint?: string
      plant?: string
      department?: string
      title?: string
      next_step?: string
      source_url?: string
    }>
  }
  rows?: YtfSourceRecord[]
  local_preview_count?: number
  local_preview?: YtfSourceRecord[]
  next_step?: string
}

export type YtfSourceBehaviorFolder = {
  folder?: string
  record_count?: number
  by_behavior?: Record<string, number>
  by_cadence?: Record<string, number>
  by_domain?: Record<string, number>
  by_plant?: Record<string, number>
  latest_modified_time?: string
  sample_records?: Array<{
    title?: string
    domain?: string
    plant?: string
    modified_time?: string
    behavior?: string
    extraction_mode?: string
  }>
  extraction_modes?: Record<string, number>
  iso_clauses?: Record<string, number>
  wcm_pillars?: Record<string, number>
}

export type YtfSourceBehaviorMapResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  summary?: {
    source_record_count?: number
    folder_count?: number
    operational_dataset_count?: number
    structured_dataset_count?: number
    context_reference_count?: number
    master_data_count?: number
    historical_archive_count?: number
    shortcut_link_count?: number
    dashboard_safe_count?: number
    rag_safe_count?: number
    latest_modified_time?: string
  }
  source_extraction_plan?: {
    status?: string
    generated_at?: string
    summary?: {
      source_record_count?: number
      folder_count?: number
      extraction_job_count?: number
      high_priority_job_count?: number
      operational_dataset_count?: number
      table_job_count?: number
      folder_job_count?: number
      document_job_count?: number
      visual_job_count?: number
      shortcut_job_count?: number
      dashboard_safe_count?: number
      rag_safe_count?: number
    }
    operational_datasets?: Array<{
      title?: string
      folder?: string
      domain?: string
      plant?: string
      department?: string
      modified_time?: string
      extraction_mode?: string
      source_url?: string
      next_step?: string
    }>
    extraction_jobs?: Array<{
      job_id?: string
      title?: string
      source_title?: string
      folder?: string
      domain?: string
      plant?: string
      department?: string
      priority?: string
      extraction_mode?: string
      cadence?: string
      next_step?: string
      source_url?: string
      modified_time?: string
    }>
  }
  folder_behaviors?: YtfSourceBehaviorFolder[]
  agent_contracts?: Array<{
    mode?: string
    record_count?: number
    routine_agent?: string
    human_gate?: string
  }>
  iso_wcm?: {
    iso_clause_counts?: Record<string, number>
    wcm_pillar_counts?: Record<string, number>
    next_operating_rule?: string
  }
  next_step?: string
}

export type YtfSourceChangeEvent = {
  event_id?: string
  workspace_id?: string
  source_system?: string
  source_record_id?: string
  source_item_id?: string
  change_type?: string
  title?: string
  path?: string
  organized_path?: string
  domain?: string
  plant?: string
  department?: string
  owning_route?: string
  owner_hint?: string
  kpi_readiness?: string
  rag_readiness?: string
  risk_level?: string
  previous_modified_time?: string
  current_modified_time?: string
  previous_signature?: string
  current_signature?: string
  detected_at?: string
  summary?: string
  payload?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type YtfSourceChangesResult = {
  status?: string
  workspace_id?: string
  summary?: NonNullable<YtfPipelineStatsResult['source_changes']>['summary']
  task_promotion?: YtfSourceChangeTaskPromotionResult
  rows?: YtfSourceChangeEvent[]
  next_step?: string
}

export type YtfSourceRecordsRebuildResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  source_record_count?: number
  saved?: {
    status?: string
    saved_count?: number
    saved_source_record_ids?: string[]
    summary?: YtfSourceRecordSummary
  }
  artifacts?: Record<string, unknown>
  database?: YtfSourceRecordsResult['database']
  next_step?: string
}

export type YtfFileAgentRow = {
  file_agent_id?: string
  profile_id?: string
  agent_name?: string
  dataset_type?: string
  automation_mode?: string
  granularity?: string
  priority?: string
  owner?: string
  plant_scope?: string
  source_record_id?: string
  source_item_id?: string
  title?: string
  path?: string
  modified_time?: string
  file_kind?: string
  domain?: string
  department?: string
  metric_targets?: string[]
  outputs?: string[]
  instructions?: string[]
  refresh_trigger?: string
  safety_policy?: string
  web_view_link?: string
}

export type YtfFileAgentsStatusResult = {
  status?: string
  workspace_id?: string
  summary?: YtfAgenticExtractionSummary & {
    source_record_count?: number
  }
  rows?: YtfFileAgentRow[]
  next_step?: string
}

export type YtfFileAgentRunsResult = {
  status?: string
  workspace_id?: string
  queued_count?: number
  processed_count?: number
  run_count?: number
  queue?: Record<string, unknown>
  processed?: {
    processed_count?: number
    rows?: AgentRunRow[]
  } & Record<string, unknown>
  snapshot?: Record<string, unknown>
  latest_runs?: AgentRunRow[]
  next_step?: string
}

export type YtfWorkbookExtractionResult = {
  status?: string
  summary?: {
    generated_at?: string
    selected_workbook_count?: number
    profiled_workbook_count?: number
    blocked_workbook_count?: number
    table_count?: number
    merged_sheet_count?: number
    multi_table_sheet_count?: number
    date_low_confidence_count?: number
    llm_structure_review_count?: number
    metric_candidate_count?: number
    metric_value_sample_count?: number
    recommended_candidate_count?: number
    by_department?: Record<string, number>
    by_status?: Record<string, number>
  }
  agent_table_trust?: YtfWorkbookAgentTableTrustResult
  metric_candidates?: Array<{
    metric_key?: string
    metric_name?: string
    metric_group?: string
    plant?: string
    owner?: string
    workbook?: string
    sheet_name?: string
    status?: string
    score?: number
    recommendation?: string
    definition_key?: string
    source?: string
    evidence_link?: string
  }>
  metric_values?: Array<{
    metric_key?: string
    metric_name?: string
    metric_group?: string
    metric_value?: string | number
    raw_value?: string
    period_label?: string
    row_label?: string
    row_number?: string | number
    plant?: string
    owner?: string
    workbook?: string
    sheet_name?: string
    status?: string
    score?: number
    recommendation?: string
    source?: string
    evidence_link?: string
  }>
  files?: Record<string, string>
  next_step?: string
}

export type YtfWorkbookAgentTableTrustResult = {
  status?: string
  generated_at?: string
  summary?: {
    checked_table_count?: number
    auto_handled_count?: number
    key_escalation_count?: number
    dashboard_safe_count?: number
    quarantined_count?: number
    llm_structure_review_count?: number
    low_confidence_date_count?: number
    merged_sheet_count?: number
    multi_table_sheet_count?: number
  }
  rows?: Array<{
    review_id?: string
    status?: string
    agent_decision?: string
    confidence_score?: number
    priority_score?: number
    title?: string
    workbook?: string
    path?: string
    plant?: string
    department?: string
    sheet_name?: string
    table_id?: string
    header_row?: string | number
    start_row?: string | number
    end_row?: string | number
    sample_row_count?: number
    metric_sample_count?: number
    numeric_columns_count?: number
    numeric_columns?: string[]
    headers?: string[]
    date_context?: string
    date_confidence?: string
    date_warning?: string
    structure_flags?: string[]
    reasons?: string[]
    agent_action?: string
    operator_action?: string
    source_url?: string
    source_item_id?: string
    generated_at?: string
  }>
  policy?: {
    routine_approval?: string
    agent_scope?: string
    human_scope?: string
  }
  next_step?: string
}

export type YtfOperatingFactLedger = {
  fact_count?: number
  facts?: Array<{
    fact_id?: string
    plant_scope?: string
    plant_label?: string
    lane?: string
    lane_label?: string
    section?: string
    metric_name?: string
    tyre_size?: string
    value?: string
    numeric_value?: number | null
    unit?: string
    period_label?: string
    source_file?: string
    source_sheet?: string
    row_label?: string
    source_status?: string
    confidence?: string | number
    freshness?: string
    action_label?: string
    entry_route?: string
    data_route?: string
    rag_query?: string
  }>
  plant_summary?: Record<string, {
    fact_count?: number
    numeric_total?: number
    lanes?: Record<string, number>
    sections?: Record<string, number>
    current_values?: Array<Record<string, unknown>>
  }>
  lane_summary?: Array<{
    lane?: string
    label?: string
    fact_count?: number
    plants?: Record<string, number>
    sections?: Record<string, number>
  }>
  section_summary?: Array<{
    plant_scope?: string
    section?: string
    fact_count?: number
    lanes?: Record<string, number>
  }>
  next_gap?: string
}

export type YtfOperatingMetricsResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  summary?: {
    extracted_metric_value_count?: number
    erp_fact_count?: number
    official_kpi_count?: number
    lane_count?: number
    plant_split?: Record<string, number>
  }
  lanes?: Array<{
    id?: string
    label?: string
    route?: string
    count?: number
    numeric_count?: number
    total?: number
    workbook_count?: number
    workbooks?: string[]
    plants?: Record<string, number>
    status?: string
    rows?: Array<{
      metric_name?: string
      metric_key?: string
      metric_group?: string
      value?: string
      raw_value?: string | number
      numeric_value?: number | null
      period_label?: string
      plant?: string
      workbook?: string
      sheet_name?: string
      row_label?: string
      owner?: string
      source?: string
      source_record_id?: string
      source_item_id?: string
      source_workbook?: string
      source_sheet?: string
      evidence_link?: string
      status?: string
      recommendation?: string
      confidence?: string | number
      captured_at?: string
      synced_at?: string
      tyre_size?: string
      site_scope?: string
      metric_family?: string
      operating_lane?: string
      operating_score?: number
    }>
  }>
  top_rows?: Array<{
    lane?: string
    route?: string
    metric_name?: string
    metric_key?: string
    metric_group?: string
    value?: string
    raw_value?: string | number
    numeric_value?: number | null
    period_label?: string
    plant?: string
    workbook?: string
    sheet_name?: string
    row_label?: string
    owner?: string
    source?: string
    table_id?: string
    date_context?: string
    date_confidence?: string
    date_warning?: string
    source_record_id?: string
    source_item_id?: string
    source_workbook?: string
    source_sheet?: string
    evidence_link?: string
    status?: string
    recommendation?: string
    confidence?: string | number
    captured_at?: string
    synced_at?: string
    tyre_size?: string
    site_scope?: string
    metric_family?: string
    operating_lane?: string
    operating_score?: number
  }>
  official_kpis?: EnterpriseMetricRecord[]
  operating_facts?: YtfOperatingFactLedger
  erp_fact_ledger?: YtfOperatingFactLedger & { schema_version?: string }
  story?: {
    status?: string
    engine?: string
    headline?: string
    management_brief?: string
    insight_cards?: Array<{
      id?: string
      label?: string
      value?: string
      detail?: string
      interpretation?: string
      route?: string
      view?: string
      progress?: number
    }>
    watchlist?: Array<{
      title?: string
      value?: string
      context?: string
      source?: string
      route?: string
    }>
    recommended_actions?: string[]
    role_briefs?: Array<{
      role?: string
      brief?: string
    }>
    factory_system?: {
      status?: string
      overview?: {
        title?: string
        summary?: string
        operating_rows?: number
        active_lanes?: number
      }
      lanes?: Array<{
        id?: string
        label?: string
        value?: string
        detail?: string
        action?: string
        route?: string
        source?: string
        source_rows?: number
        numeric_rows?: number
        workbook_count?: number
        status?: string
      }>
      workbook_structure?: {
        status?: string
        generated_at?: string
        profiled_workbooks?: number
        blocked_workbooks?: number
        detected_tables?: number
        multi_table_sheets?: number
        merged_cell_sheets?: number
        low_confidence_date_tables?: number
        structure_review_queue?: number
        agent_checked_tables?: number
        agent_auto_handled_tables?: number
        agent_key_escalations?: number
        action?: string
      }
      agent_table_trust?: YtfWorkbookAgentTableTrustResult
      operating_gaps?: Array<{
        id?: string
        label?: string
        action?: string
        route?: string
      }>
    }
    size_breakdowns?: {
      coverage?: {
        metric_rows?: number
        numeric_rows?: number
        size_rows?: number
        production_size_rows?: number
        quality_size_rows?: number
        stock_size_rows?: number
        procurement_size_rows?: number
        procurement_material_rows?: number
        attention_size_rows?: number
      }
      size_attention?: Array<{
        size?: string
        attention_score?: number
        production_qty?: number
        production_mix_pct?: number
        weight_kg?: number
        claim_qty?: number
        claim_amount?: number
        claim_rate_per_1000?: number | null
        stock_movement_qty?: number
        stock_closing_qty?: number
        procurement_pcs?: number
        procurement_amount?: number
        signals?: string[]
        missing_context?: string[]
        action?: string
        source?: Record<string, string>
      }>
      production_by_size?: Array<{
        size?: string
        output_qty?: number
        weight_kg?: number
        row_count?: number
        plant?: string
        status?: string
        action?: string
        updated_at?: string
        plants?: Record<string, number>
        periods?: string[]
        metric_names?: string[]
        source?: Record<string, string>
      }>
      pending_production_close?: Array<{
        size?: string
        pending_qty?: number
        row_count?: number
        plant?: string
        updated_at?: string
        status?: string
        action?: string
        source?: Record<string, string>
      }>
      quality_claims_by_size?: Array<{
        size?: string
        claim_qty?: number
        claim_amount?: number
        row_count?: number
        plant?: string
        plants?: Record<string, number>
        periods?: string[]
        metric_names?: string[]
        source?: Record<string, string>
      }>
      stock_by_size?: Array<{
        size?: string
        opening_qty?: number
        received_qty?: number
        issued_qty?: number
        closing_qty?: number
        movement_qty?: number
        row_count?: number
        plant?: string
        plants?: Record<string, number>
        periods?: string[]
        metric_names?: string[]
        source?: Record<string, string>
      }>
      procurement_by_size?: Array<{
        size?: string
        pcs?: number
        amount?: number
        unit_price?: number
        row_count?: number
        plant?: string
        plants?: Record<string, number>
        periods?: string[]
        metric_names?: string[]
        source?: Record<string, string>
      }>
      energy_by_plant?: Array<{
        plant?: string
        energy_cost?: number
        qty_pcs?: number
        weight_kg?: number
        row_count?: number
        source?: Record<string, string>
      }>
      raw_material_orders?: Array<{
        material?: string
        order_ton?: number
        order_lb?: number
        amount_mmk?: number
        row_count?: number
        source?: Record<string, string>
      }>
      procurement_material_orders?: Array<{
        material?: string
        order_ton?: number
        order_lb?: number
        amount_mmk?: number
        row_count?: number
        source?: Record<string, string>
      }>
      missing_inputs?: Array<{
        id?: string
        label?: string
        why?: string
        action?: string
        route?: string
      }>
    }
    feature_frame?: Record<string, unknown>
    llm?: {
      status?: string
      engine?: string
    }
  }
  next_step?: string
}

export type YtfRoleMetricsResult = {
  status?: string
  workspace_id?: string
  role?: string
  role_group?: string
  plant_scope?: string
  scope_label?: string
  generated_at?: string
  summary?: {
    source_record_count?: number
    metric_candidate_count?: number
    dashboard_safe_count?: number
    fact_count?: number
    shown_metric_count?: number
    transaction_count?: number
    approval_pending_count?: number
    latest_modified_time?: string
    latest_source_modified?: string
    missing_input_count?: number
  }
  cards?: Array<{
    label?: string
    value?: string
    detail?: string
    route?: string
  }>
  metrics?: Array<{
    id?: string
    label?: string
    value?: string
    detail?: string
    route?: string
    lane?: string
    plant_scope?: string
    status?: string
  }>
  modules?: Array<{
    id?: string
    label?: string
    value?: string
    detail?: string
    route?: string
    status?: string
  }>
  pipeline?: {
    status?: string
    source_record_count?: number
    metric_candidate_count?: number
    dashboard_safe_count?: number
    profiled_workbook_count?: number
    blocked_workbook_count?: number
    detected_table_count?: number
    low_confidence_table_count?: number
    structure_review_count?: number
    erp_fact_count?: number
    transaction_count?: number
    approval_pending_count?: number
    latest_source_modified?: string
    latest_workbook_extract?: string
    database?: Record<string, unknown>
  }
  work?: Array<{
    label?: string
    detail?: string
    route?: string
    status?: string
  }>
  missing_inputs?: Array<{
    id?: string
    label?: string
    detail?: string
    route?: string
    status?: string
  }>
  gaps?: Array<{
    label?: string
    detail?: string
    route?: string
  }>
  source_mix?: Array<{
    label?: string
    count?: number
    detail?: string
    route?: string
  }>
  data_contract?: {
    source?: string
    visibility?: string
    raw_file_names_returned?: boolean
  }
  next_step?: string
}

export type YtfRoleFocusResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  role?: string
  role_group?: string
  scope_label?: string
  view_mode?: string
  headline_cards?: Array<{
    id?: string
    label?: string
    value?: string
    detail?: string
    route?: string
    status?: string
  }>
  must_do?: Array<{
    label?: string
    detail?: string
    route?: string
    status?: string
    source?: string
  }>
  collaboration?: {
    summary?: {
      task_count?: number
      open_count?: number
      blocked_count?: number
    }
    rows?: Array<{
      task_id?: string
      title?: string
      owner?: string
      status?: string
      priority?: string
      due?: string
      updated_at?: string
      notes?: string
      route?: string
      state?: string
    }>
    route?: string
  }
  data_health?: {
    pipeline_status?: string
    database_status?: string
    schema_status?: string
  }
  next_step?: string
}

export type YtfBackendDatabaseHealthResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  role_group?: string
  scope_label?: string
  database?: {
    status?: string
    mode?: string
    write_enabled?: boolean
    latest_activity_at?: string
    counts?: {
      metric_record_count?: number
      source_record_count?: number
      knowledge_chunk_count?: number
      workspace_task_count?: number
      open_task_count?: number
    }
    errors?: Array<{
      component?: string
      message?: string
    }>
  }
  coverage?: {
    source_record_count?: number
    metric_record_count?: number
    knowledge_chunk_count?: number
    workspace_task_count?: number
    open_task_count?: number
  }
  schema?: {
    status?: string
    expected_table_count?: number
    detected_table_count?: number
    required_coverage_percent?: number
    missing_required_tables?: string[]
    optional_tables_present?: string[]
    unexpected_enterprise_tables?: string[]
    expected_fingerprint?: string
    detected_fingerprint?: string
    query_error?: string
    next_step?: string
  }
  blocking_items?: string[]
  next_step?: string
}

export type YtfDailyCloseSummaryResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  database?: Record<string, unknown>
  summary?: {
    ready_input_count?: number
    required_input_count?: number
    missing_inputs?: string[]
    manager_entry_count?: number
    extracted_value_count?: number
    availability?: number | null
    quality?: number | null
    oee_proxy?: number | null
    note?: string
  }
  inputs?: Array<{
    key?: string
    label?: string
    owner?: string
    prompt?: string
    route?: string
    status?: string
    record_count?: number
    latest?: {
      metric_name?: string
      value?: string
      numeric_value?: number | null
      unit?: string
      period_label?: string
      captured_at?: string
      source_kind?: string
      source?: string
      workbook?: string
      sheet_name?: string
      plant?: string
      evidence_link?: string
    }
    examples?: Array<Record<string, unknown>>
  }>
  next_action?: {
    label?: string
    route?: string
    detail?: string
  }
}

export type YtfManagerFiveWOneHReportResult = {
  status?: string
  summary?: {
    row_count?: number
    manager_entry_count?: number
    whiteboard_ocr_count?: number
    erp_record_count?: number
  }
  rows?: Array<{
    source?: string
    id?: string
    what?: string
    who?: string
    where?: string
    when?: string
    why?: string
    how?: string
    route?: string
    notes?: string
  }>
  next_action?: {
    label?: string
    route?: string
  }
}

export type YtfKpiCandidatePromotionResult = {
  status?: string
  workspace_id?: string
  promoted_at?: string
  source_metric_candidate_count?: number
  review_task_count?: number
  total_review_task_count?: number
  closed_review_task_count?: number
  saved_count?: number
  candidates?: Array<{
    metric_key?: string
    metric_name?: string
    metric_group?: string
    workbook?: string
    sheet_name?: string
    owner?: string
    source?: string
    evidence_link?: string
    score?: number
    recommendation?: string
  }>
  tasks?: Array<{
    title?: string
    owner_role?: string
    priority?: string
    source_id?: string
  }>
  next_step?: string
}

export type EnterpriseMetricRecord = {
  metric_id?: string
  captured_at?: string
  metric_name?: string
  metric_group?: string
  metric_value?: string
  unit?: string
  period_label?: string
  scope?: string
  owner?: string
  status?: string
  notes?: string
  evidence_link?: string
  source_ref?: Record<string, unknown>
  synced_at?: string
  updated_at?: string
}

export type MetricRecordPayload = {
  captured_at?: string
  metric_name: string
  metric_group?: string
  metric_value: string
  unit?: string
  period_label?: string
  scope?: string
  owner?: string
  status?: string
  notes?: string
  evidence_link?: string
}

export type MetricStatusUpdatePayload = {
  status: string
  owner?: string
  note?: string
}

export type MetricRecordsResult = {
  status?: string
  message?: string
  count?: number
  saved_count?: number
  rows?: EnterpriseMetricRecord[]
  summary?: Record<string, unknown>
  enterprise?: {
    status?: string
    saved_count?: number
    count?: number
    rows?: EnterpriseMetricRecord[]
    summary?: Record<string, unknown>
    database?: Record<string, unknown>
  }
}

export type YtfErpTransactionType = 'production_order' | 'inventory_movement' | 'quality_hold' | 'finance_approval'

export type YtfErpTransactionPayload = {
  transaction_type: YtfErpTransactionType
  document_ref?: string
  event_at?: string
  item_code?: string
  item_name?: string
  product_spec?: string
  quantity?: string
  unit?: string
  location?: string
  movement_type?: string
  planned_quantity?: string
  actual_quantity?: string
  scrap_quantity?: string
  work_center?: string
  batch_or_lot?: string
  owner?: string
  status?: string
  approval_gate?: string
  evidence_link?: string
  notes?: string
  create_approval?: boolean
  idempotency_key?: string
}

export type YtfErpTransactionRecord = {
  document_id?: string
  transaction_type?: YtfErpTransactionType | string
  title?: string
  document_ref?: string
  status?: string
  approval_state?: string
  owner?: string
  quantity?: string
  unit?: string
  location?: string
  evidence_link?: string
  created_at?: string
  route?: string
  source?: string
  source_ref?: Record<string, unknown>
  approval_id?: string
}

export type YtfErpTransactionsResult = {
  status?: string
  duplicate?: boolean
  message?: string
  database?: {
    configured?: boolean
    external?: boolean
    write_blocked?: boolean
    scheme?: string
    mode?: string
  }
  summary?: {
    transaction_count?: number
    approval_pending_count?: number
    by_type?: Record<string, number>
    by_status?: Record<string, number>
  }
  records?: YtfErpTransactionRecord[]
  approvals?: ApprovalRow[]
  document?: YtfErpTransactionRecord
  linked_records?: Array<Record<string, unknown>>
  approval?: ApprovalRow
  action?: Record<string, unknown>
  task?: Record<string, unknown>
  enterprise?: Record<string, unknown>
}

export type YtfWhiteboardExtractionPayload = {
  section: string
  plant?: string
  shift?: string
  board_date?: string
  image_data_url?: string
  evidence_link?: string
  visible_numbers?: string
  owner?: string
  manager_note?: string
  who?: string
  what?: string
  where?: string
  when?: string
  why?: string
  how?: string
  condition?: string
  normal_detail?: string
  abnormal_detail?: string
  next_action?: string
  wcm_pillar?: string
  iso_clause?: string
}

export type YtfWhiteboardExtractionResult = {
  status?: string
  extraction_id?: string
  section?: string
  plant?: string
  metric_group?: string
  expected_fields?: string[]
  provider?: {
    status?: string
    model?: string
    reason?: string
  }
  fields?: Array<{
    label?: string
    value?: string
    unit?: string
    confidence?: number
    raw_text?: string
    source?: string
  }>
  insights?: string[]
  warnings?: string[]
  manager_context?: Record<string, string>
  saved_count?: number
  metric_records?: EnterpriseMetricRecord[]
  message?: string
}

export type YtfKpiDefinitionsResult = {
  status?: string
  workspace_id?: string
  approved_at?: string
  approved_count?: number
  source_metric_candidate_count?: number
  rows?: EnterpriseMetricRecord[]
  candidates?: Array<{
    metric_key?: string
    metric_name?: string
    metric_group?: string
    owner?: string
    source?: string
    evidence_link?: string
  }>
  summary?: {
    metric_count?: number
    official_count?: number
    candidate_count?: number
    latest_at?: string
    by_group?: Record<string, number>
    by_status?: Record<string, number>
  }
  enterprise?: {
    status?: string
    saved_count?: number
    summary?: Record<string, unknown>
    database?: Record<string, unknown>
  }
  next_step?: string
}

export type YtfDataMiningPlanResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  mode?: string
  summary?: {
    lane_count?: number
    live_operational_count?: number
    stable_context_count?: number
    workbook_candidate_count?: number
    auto_extractable_count?: number
    download_parser_ready_count?: number
  }
  regularly_updated_sources?: Array<Record<string, unknown>>
  stable_context_sources?: Array<Record<string, unknown>>
  workbook_extraction_queue?: Array<Record<string, unknown>>
  feature_registry?: Array<Record<string, unknown>>
  next_actions?: string[]
}

export type YtfErpCommandCenterResult = {
  status?: string
  generated_at?: string
  synced_at?: string
  workspace_id?: string
  source_of_truth?: {
    name?: string
    drive_folder_id?: string
    drive_url?: string
    rule?: string
  }
  database?: YtfKnowledgeStatusResult['database']
  refresh_loop?: {
    status?: string
    last_data_manager_sync?: string
    run_source?: string
    cron_path?: string
    manual_sync_route?: string
    review_route?: string
    saved?: {
      metrics?: number
      actions?: number
      approvals?: number
      quality_incidents?: number
      knowledge_chunks?: number
    }
    routine?: string[]
    next_human_move?: string
  }
  pipeline?: {
    drive_ingestion?: Record<string, string | number | boolean | undefined>
    kpi_engine?: Record<string, string | number | boolean | undefined>
    knowledge?: Record<string, string | number | boolean | undefined>
    actions?: Record<string, string | number | boolean | undefined>
  }
  source_queues?: {
    regularly_updated?: Array<Record<string, unknown>>
    stable_context?: Array<Record<string, unknown>>
    workbook_extraction?: Array<Record<string, unknown>>
  }
  feature_registry?: Array<Record<string, unknown>>
  action_plan?: Array<{
    title?: string
    owner?: string
    route?: string
    why?: string
    urgency?: string
    source?: string
  }>
  owner_brief?: {
    headline?: string
    top_changes?: Array<Record<string, unknown>>
    owner_briefs?: Array<Record<string, unknown>>
    rag?: Record<string, unknown>
  }
  component_errors?: Array<{
    component?: string
    message?: string
  }>
  next_sync?: string
}

export type YtfExtractionCandidate = {
  id?: string
  title?: string
  lane_title?: string
  domain?: string
  route?: string
  risk_level?: string
  automation_lane?: string
  file_id?: string
  mime_type?: string
  web_view_link?: string
  modified_time?: string
  target_metric_group?: string
  owner?: string
  score?: number
  read_mode?: string
  next_action?: string
}

export type YtfExtractionPlanResult = {
  status?: string
  run_id?: string
  synced_at?: string
  candidate_count?: number
  ready_to_read_count?: number
  download_parser_ready_count?: number
  auto_extractable_count?: number
  needs_download_parser_count?: number
  groups?: Record<string, number>
  candidates?: YtfExtractionCandidate[]
  message?: string
}

export type YtfCommunicationSource = {
  source_id?: string
  connector_id?: string
  name?: string
  system?: string
  collection_mode?: string
  credential_mode?: string
  query_profile?: string
  query?: string
  cadence?: string
  owner?: string
  route?: string
  domains?: string[]
  setup_action?: string
  safe_default?: string
  relevance_threshold?: number
  max_results?: number
  status?: string
  probe_status?: string
  provider?: string
  webhook_endpoint?: string
  provider_endpoint?: string
  next_step?: string
}

export type YtfGmailIntakePlan = {
  status?: string
  generated_at?: string
  summary?: {
    query_profile_count?: number
    max_results_per_profile?: number
    max_messages_per_run?: number
    relevance_threshold?: number
  }
  worker_contract?: {
    mode?: string
    cadence?: string
    scope?: string
    dedupe_key?: string
    output?: string
    promotion_rule?: string
  }
  relevance_model?: {
    positive_terms?: string[]
    negative_terms?: string[]
    supplier_profiles?: Array<Record<string, unknown>>
  }
  query_profiles?: YtfCommunicationSource[]
}

export type YtfGmailStatusResult = {
  status?: string
  workspace_id?: string
  gmail?: {
    status?: string
    email_address?: string
    source?: string
    next_step?: string
  }
  summary?: {
    source_count?: number
    ready_count?: number
    blocked_count?: number
    token_status?: string
    query_profile_count?: number
    max_messages_per_run?: number
    worker_mode?: string
  }
  sources?: YtfCommunicationSource[]
  intake_plan?: YtfGmailIntakePlan
  diagnostics?: {
    client_secret_configured?: boolean
    token_configured?: boolean
    probe_status?: string
    probe_message?: string
  }
  blocked_reason?: string
  repair_actions?: string[]
  privacy_boundary?: string
  safe_for_manager?: boolean
  commands?: Record<string, string>
  next_step?: string
}

export type YtfChatFact = {
  fact_id?: string
  domain?: string
  metric?: string
  label?: string
  value?: number | string
  unit?: string
  size?: string
  equipment?: string
  direction?: string
  confidence?: number
  evidence_terms?: string[]
}

export type YtfChatMetricCandidate = {
  metric_key?: string
  value?: number | string
  unit?: string
  size?: string
  equipment?: string
  source_id?: string
  confidence?: number
  promotion_status?: string
}

export type YtfBotRecentMessage = {
  event_id?: string
  source_id?: string
  title?: string
  sender?: string
  occurred_at?: string
  priority?: string
  domain?: string
  route?: string
  fact_count?: number
  fact_summary?: string
  facts?: YtfChatFact[]
  metric_candidates?: YtfChatMetricCandidate[]
  created_at?: string
}

export type YtfBotPipelineResult = {
  status?: string
  workspace_id?: string
  summary?: {
    bot_source_count?: number
    ready_count?: number
    missing_secret_count?: number
  }
  sources?: YtfCommunicationSource[]
  latest?: {
    status?: string
    updated_at?: string
    recent_messages?: YtfBotRecentMessage[]
    source_counts?: Record<string, number>
  } & Record<string, unknown>
  webhook_contract?: {
    generic?: string
    line?: string
    viber?: string
    wechat?: string
    headers?: string[]
    body?: string[]
  }
  next_step?: string
}

export type YtfCloudCommsRuntimeResult = {
  status?: string
  workspace_id?: string
  generated_at?: string
  runtime_rule?: string
  pc_dependency?: string
  local_tools_allowed?: string
  database?: {
    status?: string
    durable?: boolean
    write_blocked?: boolean
  }
  webhooks?: Record<string, string>
  setup_flows?: Array<{
    id?: string
    label?: string
    recommended?: boolean
    difficulty?: string
    what_user_does?: string[]
    what_system_does?: string[]
    command?: string
    webhook_url?: string
  }>
  secret_checks?: Array<{
    name?: string
    scope?: string
    ready?: boolean
  }>
  sources?: YtfCommunicationSource[]
  cron?: {
    mode?: string
    configured_count?: number
    required_count?: number
    note?: string
    jobs?: Array<{
      id?: string
      path?: string
      schedule?: string
      cadence?: string
      purpose?: string
      configured?: boolean
      manifest_schedule?: string
    }>
  }
  latest?: Record<string, unknown>
  summary?: {
    bot_source_count?: number
    bot_ready_count?: number
    secret_ready_count?: number
    secret_count?: number
    cron_ready_count?: number
    cron_count?: number
  }
  operator_actions?: string[]
  next_step?: string
}

export type YtfCommunicationsSummary = {
  source_count?: number
  ready_count?: number
  blocked_count?: number
  manual_required_count?: number
  setup_tasks_saved?: number
  scan_result_count?: number
  gmail_query_count?: number
  gmail_message_count?: number
  gmail_relevant_count?: number
  gmail_skipped_irrelevant_count?: number
  gmail_saved_tasks?: number
  gmail_worker_mode?: string
  redaction_mode?: string
}

export type YtfCommunicationsLatestResult = {
  status?: string
  synced_at?: string
  workspace_id?: string
  source?: string
  summary?: YtfCommunicationsSummary
  plan?: {
    summary?: YtfCommunicationsSummary
    sources?: YtfCommunicationSource[]
    gmail?: YtfGmailStatusResult['gmail']
    gmail_intake_plan?: YtfGmailIntakePlan
    manual_chat_contract?: {
      accepted_sources?: string[]
      webhook_endpoint?: string
      provider_endpoints?: Record<string, string>
      safe_rule?: string
    }
  }
  scan_results?: Array<Record<string, unknown>>
  next_step?: string
}

export type YtfCommunicationManualDropPayload = {
  source_id: string
  title?: string
  raw_text: string
  sender?: string
  occurred_at?: string
  evidence_link?: string
}

export type YtfCommunicationManualDropResult = {
  status?: string
  workspace_id?: string
  event?: Record<string, unknown>
  classification?: {
    domain?: string
    route?: string
    owner?: string
    priority?: string
    signals?: Record<string, unknown>
    fact_extraction?: Record<string, unknown>
    facts?: YtfChatFact[]
    metric_candidates?: YtfChatMetricCandidate[]
  }
  task?: {
    saved_count?: number
  }
  action?: {
    saved_count?: number
  }
  next_step?: string
}

export async function getLatestYtfDataManagerRun() {
  return workspaceFetch<YtfDataManagerRunResult>('/api/ytf/data-manager/latest')
}

export async function getYtfChangeMonitor() {
  return workspaceFetch<YtfChangeMonitorResult>('/api/ytf/change-monitor')
}

export async function getYtfPipelineStats() {
  return workspaceFetch<YtfPipelineStatsResult>('/api/ytf/pipeline-stats')
}

export async function getYtfDashboardSummary(options: { compact?: boolean } = {}) {
  return workspaceFetch<YtfDashboardSummaryResult>(
    `/api/ytf/dashboard-summary${options.compact ? '?compact=1' : ''}`,
  )
}

export async function getYtfFullRefreshLatest() {
  return workspaceFetch<YtfFullRefreshLatestResult>('/api/ytf/full-refresh/latest?compact=1')
}

export async function runYtfFullRefresh() {
  return workspaceFetch<YtfFullRefreshRunResult>('/api/ytf/full-refresh/run', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function syncYtfChangeMonitor() {
  return workspaceFetch<YtfChangeMonitorResult>('/api/ytf/change-monitor/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfEvaluation() {
  return workspaceFetch<YtfEvaluationResult>('/api/ytf/evaluation')
}

export async function syncYtfEvaluation() {
  return workspaceFetch<YtfEvaluationResult>('/api/ytf/evaluation/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfOwnerBrief() {
  return workspaceFetch<YtfOwnerBriefResult>('/api/ytf/owner-brief')
}

export async function syncYtfOwnerBrief() {
  return workspaceFetch<YtfOwnerBriefResult>('/api/ytf/owner-brief/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function writebackYtfOwnerDecisions(decisionIds: string[] = []) {
  return workspaceFetch<YtfOwnerDecisionWritebackResult>('/api/ytf/owner-brief/writeback', {
    method: 'POST',
    body: JSON.stringify({ decision_ids: decisionIds }),
  })
}

export async function getYtfActionFeedbackLatest() {
  return workspaceFetch<YtfActionFeedbackResult>('/api/ytf/action-feedback/latest')
}

export async function getYtfKnowledgeStatus() {
  return workspaceFetch<YtfKnowledgeStatusResult>('/api/ytf/knowledge/status')
}

export async function getYtfCompanyBrainGraph() {
  return workspaceFetch<YtfCompanyBrainGraphResult>('/api/ytf/company-brain/graph')
}

export async function queryYtfKnowledge(query: string, limit = 6) {
  return workspaceFetch<YtfKnowledgeQueryResult>('/api/ytf/knowledge/query', {
    method: 'POST',
    body: JSON.stringify({
      query: query.trim().slice(0, 500),
      limit: Math.max(1, Math.min(limit, 10)),
    }),
  })
}

export type YtfErpAskResult = {
  status?: string
  mode?: string
  query?: string
  plant_scope?: string
  answer?: string
  source_count?: number
  next_action?: string
  matches?: NonNullable<YtfOperatingMetricsResult['operating_facts']>['facts']
}

export async function askYtfErpFacts(query: string, options: { plant?: string; lane?: string; limit?: number } = {}) {
  return workspaceFetch<YtfErpAskResult>('/api/ytf/erp/ask', {
    method: 'POST',
    body: JSON.stringify({
      query: query.trim().slice(0, 500),
      plant: options.plant ?? '',
      lane: options.lane ?? '',
      limit: Math.max(1, Math.min(options.limit ?? 6, 12)),
    }),
  })
}

export async function queryYtfKnowledgeVector(query: string, limit = 6) {
  return workspaceFetch<YtfKnowledgeVectorQueryResult>('/api/ytf/knowledge/vector/query', {
    method: 'POST',
    body: JSON.stringify({
      query: query.trim().slice(0, 500),
      limit: Math.max(1, Math.min(limit, 10)),
    }),
  })
}

export async function rebuildYtfKnowledge() {
  return workspaceFetch<YtfKnowledgeRebuildResult>('/api/ytf/knowledge/rebuild', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfSourceRecords(params: {
  domain?: string
  plant?: string
  department?: string
  kpiReadiness?: string
  ragReadiness?: string
  limit?: number
} = {}) {
  const search = new URLSearchParams()
  if (params.domain) search.set('domain', params.domain)
  if (params.plant) search.set('plant', params.plant)
  if (params.department) search.set('department', params.department)
  if (params.kpiReadiness) search.set('kpi_readiness', params.kpiReadiness)
  if (params.ragReadiness) search.set('rag_readiness', params.ragReadiness)
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 100, 500))))
  return workspaceFetch<YtfSourceRecordsResult>(`/api/ytf/source-records?${search.toString()}`)
}

export async function getYtfSourceBehaviorMap(limit = 5000) {
  return workspaceFetch<YtfSourceBehaviorMapResult>(
    `/api/ytf/source-behavior-map?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 10000))))}`,
  )
}

export async function getYtfFileAgentsStatus(params: { limit?: number } = {}) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 40, 200))))
  return workspaceFetch<YtfFileAgentsStatusResult>(`/api/ytf/file-agents/status?${search.toString()}`)
}

export async function queueYtfFileAgents(params: { limit?: number; priority?: string } = {}) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 12, 50))))
  if (params.priority) search.set('priority', params.priority)
  return workspaceFetch<{ status?: string; queued_count?: number; rows?: Array<Record<string, unknown>>; next_step?: string }>(
    `/api/ytf/file-agents/queue?${search.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )
}

export async function runYtfFileAgents(params: { limit?: number; priority?: string } = {}) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 12, 50))))
  if (params.priority) search.set('priority', params.priority)
  return workspaceFetch<YtfFileAgentRunsResult>(`/api/ytf/file-agents/run?${search.toString()}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfFileAgentRunsLatest() {
  return workspaceFetch<YtfFileAgentRunsResult>('/api/ytf/file-agents/runs/latest')
}

export async function getYtfSourceChanges(params: {
  changeType?: string
  domain?: string
  plant?: string
  limit?: number
} = {}) {
  const search = new URLSearchParams()
  if (params.changeType) search.set('change_type', params.changeType)
  if (params.domain) search.set('domain', params.domain)
  if (params.plant) search.set('plant', params.plant)
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 50, 500))))
  return workspaceFetch<YtfSourceChangesResult>(`/api/ytf/source-changes?${search.toString()}`)
}

export async function getYtfSourceChangePromotionLatest() {
  return workspaceFetch<YtfSourceChangeTaskPromotionResult>('/api/ytf/source-changes/promote/latest')
}

export async function promoteYtfSourceChanges(limit = 24, changeType?: string) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(limit, 80))))
  if (changeType) search.set('change_type', changeType)
  return workspaceFetch<YtfSourceChangeTaskPromotionResult>(`/api/ytf/source-changes/promote?${search.toString()}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function rebuildYtfSourceRecords() {
  return workspaceFetch<YtfSourceRecordsRebuildResult>('/api/ytf/source-records/rebuild', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfSourceRecordsRebuildLatest() {
  return workspaceFetch<YtfSourceRecordsRebuildResult>('/api/ytf/source-records/rebuild/latest')
}

export async function getYtfWorkbookExtractionLatest() {
  return workspaceFetch<YtfWorkbookExtractionResult>('/api/ytf/workbook-extraction/latest?compact=1&candidate_limit=24&value_limit=80&trust_limit=8')
}

export async function getYtfWorkbookStructureAgentReview(limit = 24) {
  return workspaceFetch<YtfWorkbookAgentTableTrustResult>(`/api/ytf/workbook-structure/agent-review?limit=${encodeURIComponent(String(limit))}`)
}

export async function getYtfOperatingMetrics(options: { compact?: boolean; refresh?: boolean } = {}) {
  const search = new URLSearchParams()
  if (options.compact) {
    search.set('compact', '1')
  }
  if (options.refresh) {
    search.set('refresh', '1')
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return workspaceFetch<YtfOperatingMetricsResult>(`/api/ytf/operating-metrics${suffix}`, {
    timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
  })
}

export type YtfProductionConfirmationPayload = {
  size: string
  plant?: string
  pending_qty?: string
  good_qty?: string
  reject_qty?: string
  board_date?: string
  shift?: string
  note?: string
  source_updated_at?: string
  evidence_link?: string
  idempotency_key?: string
}

export type YtfProductionConfirmationResult = {
  status?: string
  confirmation_id?: string
  message?: string
  production?: {
    size?: string
    plant?: string
    plant_scope?: string
    good_qty?: number
    reject_qty?: number
    unit?: string
    board_date?: string
    shift?: string
    status?: string
  }
  intake?: {
    status?: string
    row_count?: number
  }
  metrics?: {
    status?: string
    saved_count?: number
  }
}

export async function confirmYtfProductionClose(payload: YtfProductionConfirmationPayload) {
  return workspaceFetch<YtfProductionConfirmationResult>('/api/ytf/production/confirm', {
    method: 'POST',
    timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
    body: JSON.stringify(payload),
  })
}

export async function getYtfRoleMetrics(options: { refresh?: boolean } = {}) {
  const search = new URLSearchParams()
  if (options.refresh) {
    search.set('refresh', '1')
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return workspaceFetch<YtfRoleMetricsResult>(`/api/ytf/role-metrics${suffix}`, {
    timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
  })
}

export async function getYtfRoleFocus(options: { refresh?: boolean } = {}) {
  const search = new URLSearchParams()
  if (options.refresh) {
    search.set('refresh', '1')
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return workspaceFetch<YtfRoleFocusResult>(`/api/ytf/role-focus${suffix}`, {
    timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
  })
}

export async function getYtfBackendDatabaseHealth(options: { refresh?: boolean } = {}) {
  const search = new URLSearchParams()
  if (options.refresh) {
    search.set('refresh', '1')
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return workspaceFetch<YtfBackendDatabaseHealthResult>(`/api/ytf/backend/database-health${suffix}`)
}

export async function getYtfBackendSchemaHealth(options: { refresh?: boolean } = {}) {
  const search = new URLSearchParams()
  if (options.refresh) {
    search.set('refresh', '1')
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return workspaceFetch<YtfBackendDatabaseHealthResult['schema']>(`/api/ytf/backend/schema-health${suffix}`)
}

export async function getYtfDailyCloseSummary() {
  return workspaceFetch<YtfDailyCloseSummaryResult>('/api/ytf/daily-close/summary', {
    timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
  })
}

export async function getYtfManagerFiveWOneHReport(limit = 12) {
  return workspaceFetch<YtfManagerFiveWOneHReportResult>(
    `/api/ytf/manager/5w1h-report?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 40))))}`,
    {
      timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
    },
  )
}

export async function runYtfWorkbookExtraction(limit = 12) {
  return workspaceFetch<YtfWorkbookExtractionResult>(`/api/ytf/workbook-extraction/run?limit=${encodeURIComponent(String(limit))}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfKpiCandidatePromotionLatest() {
  return workspaceFetch<YtfKpiCandidatePromotionResult>('/api/ytf/kpi-candidates/promote/latest')
}

export async function promoteYtfKpiCandidates(limit = 24) {
  return workspaceFetch<YtfKpiCandidatePromotionResult>(`/api/ytf/kpi-candidates/promote?limit=${encodeURIComponent(String(Math.max(1, Math.min(limit, 80))))}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfKpiDefinitions() {
  return workspaceFetch<YtfKpiDefinitionsResult>('/api/ytf/kpi-definitions')
}

export async function getYtfKpiDefinitionsLatest() {
  return workspaceFetch<YtfKpiDefinitionsResult>('/api/ytf/kpi-definitions/latest')
}

export async function getMetricRecords(params: { status?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 20, 100))))
  return workspaceFetch<MetricRecordsResult>(`/api/metrics/records?${search.toString()}`)
}

export async function saveMetricRecordsBulk(rows: MetricRecordPayload[]) {
  return workspaceFetch<MetricRecordsResult>('/api/metrics/records/bulk', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}

export async function extractYtfWhiteboardPhoto(payload: YtfWhiteboardExtractionPayload) {
  return workspaceFetch<YtfWhiteboardExtractionResult>('/api/ytf/vision/whiteboard/extract', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type YtfTwinAsset = {
  id: string
  org_id: string
  name: string
  asset_type: string
  metadata?: Record<string, unknown>
}

export type YtfTwinSummaryResult = {
  org_id: string
  asset_count: number
  state_counts: Record<string, number>
  recent_production_count: number
  recent_telemetry_count: number
  recent_reported_units: number
  recent_rejects: number
  assets: YtfTwinAsset[]
  recent_production: Array<Record<string, unknown>>
  recent_telemetry: Array<Record<string, unknown>>
}

export type YtfWcmIncidentRow = {
  id?: string | null
  asset_id?: string | null
  org_id?: string | null
  timestamp?: string | null
  what: string
  who?: string | null
  where?: string | null
  when?: string | null
  why?: string | null
  how?: string | null
  wcm_pillar?: string | null
  raw_text?: string | null
}

export type YtfAgenticWhiteboardResult = {
  asset_id?: string | null
  asset_name?: string
  plant?: string
  section?: string
  shift?: string
  reported_units?: number
  rejects?: number
  metrics?: Array<{
    name?: string
    value?: number | string
    unit?: string
    confidence?: number
    raw_text?: string
  }>
  wcm_pillar?: string
  next_action?: string
  raw_text?: string
  confidence?: number
}

function dataUrlToBlob(dataUrl: string) {
  const [header, data] = dataUrl.split(',', 2)
  const mimeMatch = /data:([^;]+);base64/i.exec(header || '')
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const binary = atob(data || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

async function workspaceMultipartFetch<T>(path: string, formData: FormData): Promise<T> {
  const sessionId = cachedWorkspaceSessionId()
  const response = await fetch(`${workspaceApiBase}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(sessionId ? { 'X-Supermega-Session': sessionId } : {}),
    },
    body: formData,
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = String(payload?.detail || payload?.message || '').trim()
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(detail || `Workspace API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function extractYtfAgenticWhiteboardPhoto(payload: YtfWhiteboardExtractionPayload) {
  if (!payload.image_data_url?.startsWith('data:image/')) {
    return null
  }
  const formData = new FormData()
  formData.set('file', dataUrlToBlob(payload.image_data_url), 'ytf-whiteboard.jpg')
  if (payload.section) formData.set('section', payload.section)
  if (payload.plant) formData.set('plant', payload.plant)
  if (payload.shift) formData.set('shift', payload.shift)
  if (payload.board_date) formData.set('board_date', payload.board_date)
  if (payload.visible_numbers) formData.set('visible_numbers', payload.visible_numbers)
  if (payload.owner) formData.set('owner', payload.owner)
  if (payload.manager_note) formData.set('manager_note', payload.manager_note)
  if (payload.condition) formData.set('condition', payload.condition)
  if (payload.who) formData.set('who', payload.who)
  if (payload.what) formData.set('what', payload.what)
  if (payload.where) formData.set('where', payload.where)
  if (payload.when) formData.set('when', payload.when)
  if (payload.why) formData.set('why', payload.why)
  if (payload.how) formData.set('how', payload.how)
  if (payload.normal_detail) formData.set('normal_detail', payload.normal_detail)
  if (payload.abnormal_detail) formData.set('abnormal_detail', payload.abnormal_detail)
  if (payload.next_action) formData.set('next_action', payload.next_action)
  if (payload.wcm_pillar) formData.set('wcm_pillar', payload.wcm_pillar)
  if (payload.iso_clause) formData.set('iso_clause', payload.iso_clause)
  return workspaceMultipartFetch<YtfAgenticWhiteboardResult>('/api/vision/whiteboard', formData)
}

export async function getYtfTwinAssets(orgId = 'ytf-plant-a') {
  return workspaceFetch<{ rows: YtfTwinAsset[] }>(`/api/twin/assets?org_id=${encodeURIComponent(orgId)}`)
}

export async function getYtfTwinSummary(orgId = 'ytf-plant-a') {
  return workspaceFetch<YtfTwinSummaryResult>(`/api/twin/summary?org_id=${encodeURIComponent(orgId)}`)
}

export async function getYtfWcmIncidents(params: { orgId?: string; assetId?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  search.set('org_id', params.orgId || 'ytf-plant-a')
  search.set('limit', String(Math.max(1, Math.min(params.limit ?? 20, 100))))
  if (params.assetId) search.set('asset_id', params.assetId)
  return workspaceFetch<{ rows: YtfWcmIncidentRow[] }>(`/api/voice/incidents?${search.toString()}`)
}

export async function saveYtfWcmIncident(payload: {
  text: string
  asset_id?: string | null
  org_id?: string | null
  timestamp?: string | null
}) {
  return workspaceFetch<{ incident: YtfWcmIncidentRow; inserted: boolean }>('/api/voice/incident', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMetricRecordStatus(metricId: string, payload: MetricStatusUpdatePayload) {
  return workspaceFetch<MetricRecordsResult>(`/api/metrics/records/${encodeURIComponent(metricId)}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function approveYtfKpiDefinitions(limit = 12, metricKeys: string[] = []) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(limit, 80))))
  if (metricKeys.length) search.set('metric_keys', metricKeys.join(','))
  return workspaceFetch<YtfKpiDefinitionsResult>(`/api/ytf/kpi-definitions/approve?${search.toString()}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfDataMiningPlan() {
  return workspaceFetch<YtfDataMiningPlanResult>('/api/ytf/data-mining/plan')
}

export async function syncYtfDataMiningPlan() {
  return workspaceFetch<YtfDataMiningPlanResult>('/api/ytf/data-mining/plan/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfErpCommandCenter() {
  return workspaceFetch<YtfErpCommandCenterResult>('/api/ytf/erp/command-center')
}

export async function getYtfErpTransactions(limit = 40, options: { includeInternal?: boolean } = {}) {
  const search = new URLSearchParams()
  search.set('limit', String(Math.max(1, Math.min(limit, 120))))
  if (options.includeInternal) search.set('include_internal', '1')
  return workspaceFetch<YtfErpTransactionsResult>(
    `/api/ytf/erp/transactions?${search.toString()}`,
    {
      timeoutMs: YTF_RUNTIME_FETCH_TIMEOUT_MS,
    },
  )
}

export async function createYtfErpTransaction(payload: YtfErpTransactionPayload) {
  return workspaceFetch<YtfErpTransactionsResult>('/api/ytf/erp/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 70000,
  })
}

export async function syncYtfErpCommandCenter() {
  return workspaceFetch<YtfErpCommandCenterResult>('/api/ytf/erp/command-center/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function runYtfDataManager() {
  return workspaceFetch<YtfDataManagerRunResult>('/api/ytf/data-manager/run', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfExtractionPlan(limit = 24) {
  return workspaceFetch<YtfExtractionPlanResult>(`/api/ytf/extraction-plan?limit=${encodeURIComponent(String(limit))}`)
}

export async function getYtfGmailStatus() {
  return workspaceFetch<YtfGmailStatusResult>('/api/ytf/gmail/status')
}

export async function syncYtfGmail() {
  return workspaceFetch<YtfCommunicationsLatestResult>('/api/ytf/gmail/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfCommunicationsLatest(options: { durable?: boolean } = {}) {
  const suffix = options.durable ? '?source=durable_events' : ''
  return workspaceFetch<YtfCommunicationsLatestResult>(`/api/ytf/communications/latest${suffix}`)
}

export async function syncYtfCommunications() {
  return workspaceFetch<YtfCommunicationsLatestResult>('/api/ytf/communications/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getYtfBotPipeline() {
  return workspaceFetch<YtfBotPipelineResult>('/api/ytf/bots/pipeline')
}

export async function getYtfCloudCommsRuntime() {
  return workspaceFetch<YtfCloudCommsRuntimeResult>('/api/ytf/cloud-comms/runtime')
}

export async function saveYtfCommunicationManualDrop(payload: YtfCommunicationManualDropPayload) {
  return workspaceFetch<YtfCommunicationManualDropResult>('/api/ytf/communications/manual-drop', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
