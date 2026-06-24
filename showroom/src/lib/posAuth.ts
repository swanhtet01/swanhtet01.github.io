import { normalizeHostname, supermegaPosHost } from './domainRouting'

const POS_SESSION_KEY = 'supermega.pos.session.v1'
const WORKSPACE_SESSION_CACHE_KEY = 'supermega.workspaceSession.v1'
const POS_SEED_WORKSPACE_SLUG = 'supermega-demo-group'
const POS_PROVISIONED_ACCOUNTS_STORAGE_KEY = 'supermega.pos.accounts.v1'
const POS_STORAGE_KEY_PREFIX = 'supermega.pos.'
const RESTAURANT_WORKSPACE_STORAGE_KEY_PREFIX = 'supermega.restaurant-os.workspace.v1'
const POS_DEMO_COMPANY_NAME = 'SuperMega POS Demo'
const POS_SPA_PILOT_COMPANY_NAME = 'Yangon Spa Pilot'
const POS_DEMO_PASSWORD = 'Demo@12345'
const FRONTEND_DEV_PORTS = new Set(['3000', '3001', '4173', '5173', '5174'])
const POS_API_TIMEOUT_MS = 15000

type PosApiFetchInit = RequestInit & {
  timeoutMs?: number
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function inferPosApiBase() {
  const configuredBase = String(import.meta.env.VITE_POS_API_BASE ?? '').trim()
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
    if (port && !FRONTEND_DEV_PORTS.has(port)) {
      return origin
    }
    return `${protocol}//${hostname}:8787`
  }
  return origin
}

const posApiBase = inferPosApiBase()

export function hasPosAuthApi() {
  return Boolean(posApiBase)
}

async function posFetch<T>(path: string, init?: PosApiFetchInit): Promise<T> {
  if (!posApiBase) {
    throw new Error('POS API is unavailable.')
  }
  const { timeoutMs = POS_API_TIMEOUT_MS, signal: initSignal, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))

  if (initSignal) {
    if (initSignal.aborted) {
      controller.abort()
    } else {
      initSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  let response: Response
  try {
    response = await fetch(`${posApiBase}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      cache: fetchInit.cache ?? 'no-store',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(fetchInit.headers ?? {}),
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`POS API timed out: ${path}`)
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
    const error = new Error(detail || `POS API request failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return (await response.json()) as T
}

const POS_DEMO_LOCATION_PROFILES: Record<PosBusinessType, { id: string; label: string }> = {
  restaurant: { id: 'restaurant-demo-rangoon', label: 'Restaurant Demo Pack' },
  spa: { id: 'spa-demo-rangoon', label: 'Yangon Spa Reference Pilot' },
  retail: { id: 'retail-demo-rangoon', label: 'Retail Demo Pack' },
}

export type PosBusinessType = 'restaurant' | 'spa' | 'retail'
export type PosUserRole = 'owner' | 'manager' | 'cashier' | 'auditor' | 'front-desk' | 'service-provider' | 'inventory-clerk'
export type PosModuleId = 'enterprise' | 'payment' | 'tables' | 'kitchen' | 'approvals' | 'shift' | 'stock' | 'guest' | 'margin' | 'qr-menu'
export type PosModuleContract = {
  name: string
  job: string
}

export type PosLocationProfile = {
  id: string
  label: string
  businessType: PosBusinessType
  timezone: string
  currency: string
  status: 'setup' | 'pilot' | 'live'
}

export type PosRoleProfile = {
  id: PosUserRole
  label: string
  summary: string
  focus: string
  businessTypes: PosBusinessType[]
}

export type PosBusinessProfile = {
  id: PosBusinessType
  label: string
  summary: string
  setupHint: string
  moduleLabels: Partial<Record<PosModuleId, string>>
  moduleContracts: Partial<Record<PosModuleId, PosModuleContract>>
}

export type PosDemoAccount = {
  username: string
  password: string
  managerOverridePin: string
  displayName: string
  companyName: string
  workspaceSlug: string
  roles: PosUserRole[]
  businessTypes: PosBusinessType[]
  locations: PosLocationProfile[]
  defaultLocationId: string
  defaultBusinessType: PosBusinessType
}

export type PosProvisionedAccountInput = {
  clientName: string
  ownerName: string
  businessType: PosBusinessType
  locationCount: number
  goLiveStatus: 'setup' | 'pilot' | 'live'
}

export type PosProvisionedAccountResult = {
  account: PosDemoAccount
  created: boolean
  username: string
  password: string
}

export type PosProvisionedRoleAccountInput = {
  clientName: string
  displayName: string
  businessType: PosBusinessType
  role: PosUserRole
  username: string
  password: string
}

export type PosSession = {
  username: string
  displayName: string
  companyName: string
  workspaceSlug: string
  roles: PosUserRole[]
  businessTypes: PosBusinessType[]
  locations: PosLocationProfile[]
  activeLocationId: string
  activeRole: PosUserRole | null
  activeBusinessType: PosBusinessType
  signedInAt: string
  updatedAt: string
}

type PosApiLocationRecord = {
  id?: string
  label?: string
  business_type?: string
  timezone?: string
  currency?: string
  status?: string
}

type PosApiSessionRecord = {
  session_id?: string
  username?: string
  display_name?: string
  company_name?: string
  workspace_slug?: string
  roles?: string[]
  business_types?: string[]
  locations?: PosApiLocationRecord[]
  active_location_id?: string
  active_business_type?: string
  active_role?: string | null
  signed_in_at?: string
  updated_at?: string
}

type PosApiSessionResponse = {
  status?: string
  authenticated?: boolean
  session?: PosApiSessionRecord | null
}

export type PosRoleAccess = {
  role: PosUserRole
  defaultModule: PosModuleId
  modules: PosModuleId[]
  canExportExcel: boolean
  canExportJson: boolean
  canResetWorkspace: boolean
  canRunAiActions: boolean
  readOnly: boolean
}

const POS_BUSINESS_PROFILES: Record<PosBusinessType, PosBusinessProfile> = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant',
    summary: 'Counter, tables, kitchen SLA, approvals, stock, and closeout.',
    setupHint: 'Use for dine-in, takeaway, or quick-service stores.',
    moduleLabels: {
      enterprise: 'AI control',
      payment: 'Orders & payments',
      tables: 'Tables',
      kitchen: 'Kitchen SLA',
      approvals: 'Approvals',
      shift: 'Shift',
      stock: 'Stock',
      guest: 'Guest recovery',
      margin: 'Margin',
      'qr-menu': 'Menu',
    },
    moduleContracts: {
      enterprise: {
        name: 'Restaurant control tower',
        job: 'Gate closeout, payment proof, service risk, and owner-ready actions before release.',
      },
      payment: {
        name: 'Orders and payment proof',
        job: 'Capture order reference, tender proof, and settlement notes for clean daily close.',
      },
      tables: {
        name: 'Floor and table service',
        job: 'Track table state, owner, and bill-request timing across rush periods.',
      },
      kitchen: {
        name: 'Kitchen SLA board',
        job: 'Monitor ticket stations, target-ready time, and delayed item recovery.',
      },
      approvals: {
        name: 'Discount and closeout approvals',
        job: 'Route refund, void, discount, and closeout requests through manager sign-off.',
      },
      shift: {
        name: 'Shift checkpoint loop',
        job: 'Run opening, lunch, dinner, and close handover with blocker capture.',
      },
      stock: {
        name: 'Prep and stock control',
        job: 'Track par, waste, supplier gaps, and next-stock actions.',
      },
      guest: {
        name: 'Guest recovery lane',
        job: 'Capture issues and ensure recovery actions are assigned and closed.',
      },
      margin: {
        name: 'Margin review',
        job: 'Evaluate promo impact against food cost and labor pressure.',
      },
      'qr-menu': {
        name: 'Menu publishing',
        job: 'Publish customer menu with QR output and proof-backed source updates.',
      },
    },
  },
  spa: {
    id: 'spa',
    label: 'Spa',
    summary: 'Appointments, front desk checkout, therapist queue, packages, and client recovery.',
    setupHint: 'Use for salons, spas, clinics, and appointment-first service desks.',
    moduleLabels: {
      enterprise: 'Service desk',
      payment: 'Bookings & billing',
      tables: 'Rooms & chairs',
      kitchen: 'Service queue',
      approvals: 'Discount approvals',
      shift: 'Roster',
      stock: 'Retail stock',
      guest: 'Client recovery',
      margin: 'Packages',
      'qr-menu': 'Service menu',
    },
    moduleContracts: {
      enterprise: {
        name: 'Spa control tower',
        job: 'Keep front desk, therapist queue, and billing exceptions under one approval lane.',
      },
      payment: {
        name: 'Bookings and billing',
        job: 'Capture appointment payments, deposits, and balance settlements by session.',
      },
      tables: {
        name: 'Rooms and chairs',
        job: 'Track room occupancy, check-in state, and therapist ownership.',
      },
      kitchen: {
        name: 'Service queue',
        job: 'Manage active treatments, delays, and handover between providers.',
      },
      approvals: {
        name: 'Discount and exception approvals',
        job: 'Route package discounts, refunds, and waiver actions to manager review.',
      },
      shift: {
        name: 'Roster and handover',
        job: 'Control front desk and provider shift readiness with handover notes.',
      },
      stock: {
        name: 'Retail and treatment stock',
        job: 'Track consumables, product sales stock, and low-stock escalation.',
      },
      guest: {
        name: 'Client recovery',
        job: 'Capture complaints, reschedules, and service recovery outcomes.',
      },
      margin: {
        name: 'Package margin brief',
        job: 'Review package utilization, discounts, and realized contribution per session.',
      },
      'qr-menu': {
        name: 'Service catalog publish',
        job: 'Publish treatment menu and package catalog for quick checkout reference.',
      },
    },
  },
  retail: {
    id: 'retail',
    label: 'Retail',
    summary: 'Counter checkout, stock control, purchase order receiving, and daily close.',
    setupHint: 'Use for stores with barcode scans, purchase orders, and shelf replenishment.',
    moduleLabels: {
      enterprise: 'Store control',
      payment: 'Checkout',
      tables: 'Checkout lanes',
      kitchen: 'Fulfillment queue',
      approvals: 'Return approvals',
      shift: 'Shift',
      stock: 'Inventory',
      guest: 'Customer recovery',
      margin: 'Promotions',
      'qr-menu': 'Catalog',
    },
    moduleContracts: {
      enterprise: {
        name: 'Store control tower',
        job: 'Gate daily close, returns risk, stock variance, and owner escalation.',
      },
      payment: {
        name: 'Checkout and tenders',
        job: 'Capture sale proofs, split tenders, and cash/card reconciliation.',
      },
      tables: {
        name: 'Checkout lanes',
        job: 'Monitor lane status, queue pressure, and cashier ownership.',
      },
      approvals: {
        name: 'Returns and override approvals',
        job: 'Route returns, exchange differences, and manual discounts for review.',
      },
      shift: {
        name: 'Shift and tills',
        job: 'Track opening floats, shift handover, and close variance.',
      },
      stock: {
        name: 'Inventory and receiving',
        job: 'Record receiving, stock movement, and replenishment risk by SKU.',
      },
      guest: {
        name: 'Customer recovery',
        job: 'Capture complaint/refund actions and confirm closure.',
      },
      margin: {
        name: 'Promotion margin',
        job: 'Evaluate promo sell-through against discount pressure and stock impact.',
      },
      'qr-menu': {
        name: 'Catalog publish',
        job: 'Publish product catalog view for assisted selling and lookup.',
      },
    },
  },
}

const POS_MODULE_PRESETS: Record<PosBusinessType, PosModuleId[]> = {
  restaurant: ['enterprise', 'payment', 'tables', 'kitchen', 'approvals', 'shift', 'stock', 'guest', 'margin', 'qr-menu'],
  spa: ['enterprise', 'payment', 'tables', 'kitchen', 'approvals', 'shift', 'stock', 'guest', 'margin', 'qr-menu'],
  retail: ['enterprise', 'payment', 'tables', 'approvals', 'shift', 'stock', 'guest', 'margin', 'qr-menu'],
}

const POS_ROLES_BY_BUSINESS: Record<PosBusinessType, PosUserRole[]> = {
  restaurant: ['owner', 'manager', 'cashier', 'auditor'],
  spa: ['owner', 'manager', 'front-desk', 'service-provider', 'auditor'],
  retail: ['owner', 'manager', 'cashier', 'inventory-clerk', 'auditor'],
}

const POS_ROLE_CAPABILITIES: Record<PosUserRole, string[]> = {
  owner: ['actions.view', 'sales.view', 'operations.view', 'approvals.view', 'director.view', 'tenant_admin.view'],
  manager: ['actions.view', 'sales.view', 'operations.view', 'approvals.view'],
  cashier: ['actions.view', 'sales.view'],
  auditor: ['actions.view', 'sales.view', 'director.view'],
  'front-desk': ['actions.view', 'sales.view', 'operations.view', 'appointments.view'],
  'service-provider': ['actions.view', 'appointments.view', 'guest.view'],
  'inventory-clerk': ['actions.view', 'operations.view', 'stock.view'],
}

export const POS_ROLE_CATALOG: PosRoleProfile[] = [
  {
    id: 'owner',
    label: 'Owner',
    summary: 'Full control, approvals, exports, and closeout sign-off.',
    focus: 'Readiness gates, release controls, and compliance coverage.',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'manager',
    label: 'Manager',
    summary: 'Day operations, approvals, and team exception control.',
    focus: 'Queue discipline and stable close without unresolved risk.',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'cashier',
    label: 'Cashier',
    summary: 'Checkout, tender capture, and shift register handling.',
    focus: 'Accurate payment proof and movement reasons.',
    businessTypes: ['restaurant', 'retail'],
  },
  {
    id: 'auditor',
    label: 'Auditor',
    summary: 'Read-only reconciliation and evidence review.',
    focus: 'Exception quality, variance notes, and exportable audit proof.',
    businessTypes: ['restaurant', 'spa', 'retail'],
  },
  {
    id: 'front-desk',
    label: 'Front Desk',
    summary: 'Booking desk, intake, checkout, and schedule balancing.',
    focus: 'Appointment accuracy and check-in to bill handoff.',
    businessTypes: ['spa'],
  },
  {
    id: 'service-provider',
    label: 'Service Provider',
    summary: 'Service queue execution and client session updates.',
    focus: 'On-time delivery and clean client notes.',
    businessTypes: ['spa'],
  },
  {
    id: 'inventory-clerk',
    label: 'Inventory Clerk',
    summary: 'Stock intake, receiving, and shelf replenishment.',
    focus: 'Accurate receiving and low-stock prevention.',
    businessTypes: ['retail'],
  },
]

const POS_ALL_DEMO_LOCATIONS: PosLocationProfile[] = [
  {
    id: POS_DEMO_LOCATION_PROFILES.restaurant.id,
    label: POS_DEMO_LOCATION_PROFILES.restaurant.label,
    businessType: 'restaurant',
    timezone: 'Asia/Rangoon',
    currency: 'MMK',
    status: 'pilot',
  },
  {
    id: POS_DEMO_LOCATION_PROFILES.spa.id,
    label: POS_DEMO_LOCATION_PROFILES.spa.label,
    businessType: 'spa',
    timezone: 'Asia/Rangoon',
    currency: 'MMK',
    status: 'pilot',
  },
  {
    id: POS_DEMO_LOCATION_PROFILES.retail.id,
    label: POS_DEMO_LOCATION_PROFILES.retail.label,
    businessType: 'retail',
    timezone: 'Asia/Rangoon',
    currency: 'MMK',
    status: 'setup',
  },
]

const POS_SPA_PILOT_LOCATIONS: PosLocationProfile[] = [
  {
    id: POS_DEMO_LOCATION_PROFILES.spa.id,
    label: POS_DEMO_LOCATION_PROFILES.spa.label,
    businessType: 'spa',
    timezone: 'Asia/Rangoon',
    currency: 'MMK',
    status: 'pilot',
  },
]

export const POS_DEMO_ACCOUNTS: PosDemoAccount[] = [
  {
    username: 'spaowner',
    password: POS_DEMO_PASSWORD,
    managerOverridePin: '445566',
    displayName: 'Spa Owner',
    companyName: POS_SPA_PILOT_COMPANY_NAME,
    workspaceSlug: 'supermega-spa-pilot',
    roles: ['owner', 'manager', 'auditor', 'front-desk', 'service-provider'],
    businessTypes: ['spa'],
    locations: POS_SPA_PILOT_LOCATIONS,
    defaultLocationId: POS_DEMO_LOCATION_PROFILES.spa.id,
    defaultBusinessType: 'spa',
  },
  {
    username: 'demo',
    password: POS_DEMO_PASSWORD,
    managerOverridePin: '445566',
    displayName: 'Demo Owner',
    companyName: POS_DEMO_COMPANY_NAME,
    workspaceSlug: POS_SEED_WORKSPACE_SLUG,
    roles: ['owner', 'manager', 'cashier', 'auditor', 'front-desk', 'service-provider', 'inventory-clerk'],
    businessTypes: ['restaurant', 'spa', 'retail'],
    locations: POS_ALL_DEMO_LOCATIONS,
    defaultLocationId: POS_DEMO_LOCATION_PROFILES.spa.id,
    defaultBusinessType: 'spa',
  },
  {
    username: 'demo@firstclient.supermega.dev',
    password: POS_DEMO_PASSWORD,
    managerOverridePin: '445566',
    displayName: 'Demo Owner',
    companyName: POS_DEMO_COMPANY_NAME,
    workspaceSlug: POS_SEED_WORKSPACE_SLUG,
    roles: ['owner', 'manager', 'cashier', 'auditor', 'front-desk', 'service-provider', 'inventory-clerk'],
    businessTypes: ['restaurant', 'spa', 'retail'],
    locations: POS_ALL_DEMO_LOCATIONS,
    defaultLocationId: POS_DEMO_LOCATION_PROFILES.spa.id,
    defaultBusinessType: 'spa',
  },
]

function nowIso() {
  return new Date().toISOString()
}

function isPosSeedDemoWorkspaceSlug(workspaceSlug: string) {
  return workspaceSlug.trim().toLowerCase() === POS_SEED_WORKSPACE_SLUG
}

function normalizeRole(value: unknown): PosUserRole | null {
  return value === 'owner'
    || value === 'manager'
    || value === 'cashier'
    || value === 'auditor'
    || value === 'front-desk'
    || value === 'service-provider'
    || value === 'inventory-clerk'
    ? value
    : null
}

function normalizeRoles(value: unknown): PosUserRole[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => normalizeRole(item))
    .filter((item): item is PosUserRole => Boolean(item))
}

function normalizeBusinessType(value: unknown): PosBusinessType | null {
  return value === 'restaurant' || value === 'spa' || value === 'retail' ? value : null
}

function normalizeBusinessTypes(value: unknown): PosBusinessType[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => normalizeBusinessType(item))
    .filter((item): item is PosBusinessType => Boolean(item))
}

const LEGACY_DEMO_LOCATION_LABELS: Record<string, { id: string; label: string; businessType: PosBusinessType }> = {
  'golden plate downtown': {
    id: POS_DEMO_LOCATION_PROFILES.restaurant.id,
    label: POS_DEMO_LOCATION_PROFILES.restaurant.label,
    businessType: 'restaurant',
  },
  'lotus spa downtown': {
    id: POS_DEMO_LOCATION_PROFILES.spa.id,
    label: POS_DEMO_LOCATION_PROFILES.spa.label,
    businessType: 'spa',
  },
  'north retail mart': {
    id: POS_DEMO_LOCATION_PROFILES.retail.id,
    label: POS_DEMO_LOCATION_PROFILES.retail.label,
    businessType: 'retail',
  },
  'restaurant demo / rangoon': {
    id: POS_DEMO_LOCATION_PROFILES.restaurant.id,
    label: POS_DEMO_LOCATION_PROFILES.restaurant.label,
    businessType: 'restaurant',
  },
  'restaurant demo / yangon': {
    id: POS_DEMO_LOCATION_PROFILES.restaurant.id,
    label: POS_DEMO_LOCATION_PROFILES.restaurant.label,
    businessType: 'restaurant',
  },
  'spa demo / rangoon': {
    id: POS_DEMO_LOCATION_PROFILES.spa.id,
    label: POS_DEMO_LOCATION_PROFILES.spa.label,
    businessType: 'spa',
  },
  'spa demo / yangon': {
    id: POS_DEMO_LOCATION_PROFILES.spa.id,
    label: POS_DEMO_LOCATION_PROFILES.spa.label,
    businessType: 'spa',
  },
  'retail demo / rangoon': {
    id: POS_DEMO_LOCATION_PROFILES.retail.id,
    label: POS_DEMO_LOCATION_PROFILES.retail.label,
    businessType: 'retail',
  },
  'retail demo / yangon': {
    id: POS_DEMO_LOCATION_PROFILES.retail.id,
    label: POS_DEMO_LOCATION_PROFILES.retail.label,
    businessType: 'retail',
  },
}

const LEGACY_DEMO_COMPANY_NAMES: Record<string, string> = {
  'golden plate group': POS_DEMO_COMPANY_NAME,
  'golden plate downtown': POS_DEMO_COMPANY_NAME,
  'lotus spa downtown': POS_DEMO_COMPANY_NAME,
  'north retail mart': POS_DEMO_COMPANY_NAME,
  'first client demo': POS_DEMO_COMPANY_NAME,
}

function hasLegacyDemoToken(value: string) {
  const token = String(value || '').trim().toLowerCase()
  if (!token) {
    return false
  }
  return token === 'restaurant'
    || token === 'spa'
    || token === 'retail'
    || token.includes('golden plate')
    || token.includes('lotus spa')
    || token.includes('north retail')
    || token.includes('first client demo')
    || token.includes('first client pilot')
    || token.includes('supermega pos demo')
    || token.includes('supermega demo')
    || token.includes('demo / rangoon')
    || token.includes('demo / yangon')
    || token.includes('demo pack')
}

function migrateLegacyDemoCompanyName(value: string) {
  const raw = String(value || '').trim()
  if (!raw) {
    return raw
  }
  const mapped = LEGACY_DEMO_COMPANY_NAMES[raw.toLowerCase()]
  if (mapped) {
    return mapped
  }
  if (hasLegacyDemoToken(raw)) {
    return POS_DEMO_COMPANY_NAME
  }
  return raw
}

function migrateLegacyDemoLocation(id: string, label: string, businessType: PosBusinessType) {
  const labelKey = label.trim().toLowerCase()
  const legacyByLabel = LEGACY_DEMO_LOCATION_LABELS[labelKey]
  if (legacyByLabel && legacyByLabel.businessType === businessType) {
    return legacyByLabel
  }
  const slugMap: Record<PosBusinessType, { id: string; label: string }> = {
    restaurant: POS_DEMO_LOCATION_PROFILES.restaurant,
    spa: POS_DEMO_LOCATION_PROFILES.spa,
    retail: POS_DEMO_LOCATION_PROFILES.retail,
  }
  const slug = `${id} ${label}`.toLowerCase()
  const normalizedId = id.trim().toLowerCase()
  if (
    (normalizedId === 'restaurant' || normalizedId === 'restaurant-demo' || normalizedId === 'restaurant-demo-pack')
    && businessType === 'restaurant'
  ) {
    return { ...slugMap.restaurant, businessType: 'restaurant' as const }
  }
  if (
    (normalizedId === 'spa' || normalizedId === 'spa-demo' || normalizedId === 'spa-demo-pack')
    && businessType === 'spa'
  ) {
    return { ...slugMap.spa, businessType: 'spa' as const }
  }
  if (
    (normalizedId === 'retail' || normalizedId === 'retail-demo' || normalizedId === 'retail-demo-pack')
    && businessType === 'retail'
  ) {
    return { ...slugMap.retail, businessType: 'retail' as const }
  }
  if (
    (labelKey === 'restaurant' || labelKey === 'restaurant demo')
    && businessType === 'restaurant'
  ) {
    return { ...slugMap.restaurant, businessType: 'restaurant' as const }
  }
  if (
    (labelKey === 'spa' || labelKey === 'spa demo')
    && businessType === 'spa'
  ) {
    return { ...slugMap.spa, businessType: 'spa' as const }
  }
  if (
    (labelKey === 'retail' || labelKey === 'retail demo')
    && businessType === 'retail'
  ) {
    return { ...slugMap.retail, businessType: 'retail' as const }
  }
  if (slug.includes('golden-plate') || slug.includes('golden plate')) {
    return { ...slugMap.restaurant, businessType: 'restaurant' as const }
  }
  if (slug.includes('lotus-spa') || slug.includes('lotus spa')) {
    return { ...slugMap.spa, businessType: 'spa' as const }
  }
  if (slug.includes('north-retail') || slug.includes('north retail')) {
    return { ...slugMap.retail, businessType: 'retail' as const }
  }
  if (hasLegacyDemoToken(slug)) {
    return { ...slugMap[businessType], businessType }
  }
  return null
}

function normalizeLocation(value: unknown): PosLocationProfile | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosLocationProfile>
  const businessType = normalizeBusinessType(raw.businessType)
  if (!businessType) {
    return null
  }
  const id = String(raw.id || '').trim().toLowerCase()
  if (!id) {
    return null
  }
  const rawLabel = String(raw.label || id).trim() || id
  const migrated = migrateLegacyDemoLocation(id, rawLabel, businessType)
  const status = raw.status === 'live' || raw.status === 'setup' ? raw.status : 'pilot'
  return {
    id: migrated?.id || id,
    label: migrated?.label || rawLabel,
    businessType: migrated?.businessType || businessType,
    timezone: String(raw.timezone || 'Asia/Rangoon').trim() || 'Asia/Rangoon',
    currency: String(raw.currency || 'MMK').trim() || 'MMK',
    status,
  }
}

function normalizeLocations(value: unknown): PosLocationProfile[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const normalized: PosLocationProfile[] = []
  for (const item of value) {
    const location = normalizeLocation(item)
    if (!location || seen.has(location.id)) {
      continue
    }
    seen.add(location.id)
    normalized.push(location)
  }
  return normalized
}

function getDefaultBusinessType() {
  return 'restaurant' as const
}

function getRolesForBusinessType(businessType: PosBusinessType) {
  return POS_ROLES_BY_BUSINESS[businessType] || POS_ROLES_BY_BUSINESS.restaurant
}

function normalizeAccountUsername(value: string) {
  return String(value || '').trim().toLowerCase()
}

function slugifyToken(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeAccount(value: unknown): PosDemoAccount | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosDemoAccount>
  const username = normalizeAccountUsername(String(raw.username || ''))
  const password = String(raw.password || '').trim()
  const managerOverridePin = String(raw.managerOverridePin || '').trim()
  const displayName = String(raw.displayName || '').trim()
  const companyName = migrateLegacyDemoCompanyName(String(raw.companyName || '').trim())
  const workspaceSlug = slugifyToken(String(raw.workspaceSlug || ''))
  const businessTypes = normalizeBusinessTypes(raw.businessTypes)
  const roles = normalizeRoles(raw.roles)
  const locations = normalizeLocations(raw.locations)
  const defaultLocationId = String(raw.defaultLocationId || '').trim().toLowerCase()
  const defaultBusinessType = normalizeBusinessType(raw.defaultBusinessType)

  if (
    !username
    || !password
    || !managerOverridePin
    || !displayName
    || !companyName
    || !workspaceSlug
    || !roles.length
    || !locations.length
  ) {
    return null
  }

  const resolvedBusinessTypes = businessTypes.length
    ? businessTypes
    : [...new Set(locations.map((location) => location.businessType))]
  const resolvedDefaultBusinessType = defaultBusinessType || resolvedBusinessTypes[0] || locations[0]?.businessType || getDefaultBusinessType()
  const resolvedDefaultLocationId =
    locations.find((location) => location.id === defaultLocationId && location.businessType === resolvedDefaultBusinessType)?.id
    || locations.find((location) => location.businessType === resolvedDefaultBusinessType)?.id
    || locations[0]?.id
    || defaultLocationId
    || 'default-location'

  return {
    username,
    password,
    managerOverridePin,
    displayName,
    companyName,
    workspaceSlug,
    roles,
    businessTypes: resolvedBusinessTypes.length ? resolvedBusinessTypes : [resolvedDefaultBusinessType],
    locations,
    defaultLocationId: resolvedDefaultLocationId,
    defaultBusinessType: resolvedDefaultBusinessType,
  }
}

function loadProvisionedPosAccounts() {
  if (typeof window === 'undefined') {
    return [] as PosDemoAccount[]
  }
  try {
    const raw = window.localStorage.getItem(POS_PROVISIONED_ACCOUNTS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const normalized = parsed
      .map((item) => normalizeAccount(item))
      .filter((item): item is PosDemoAccount => Boolean(item))
    const seen = new Set<string>()
    const unique: PosDemoAccount[] = []
    for (const item of normalized) {
      const key = normalizeAccountUsername(item.username)
      if (!key || seen.has(key)) {
        continue
      }
      seen.add(key)
      unique.push(item)
    }
    return unique
  } catch {
    return []
  }
}

function saveProvisionedPosAccounts(accounts: PosDemoAccount[]) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(POS_PROVISIONED_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    // Ignore local storage errors in restricted browsers.
  }
}

function getAllPosAccounts() {
  const accountMap = new Map<string, PosDemoAccount>()
  for (const seed of POS_DEMO_ACCOUNTS) {
    const normalized = normalizeAccount(seed)
    if (!normalized) {
      continue
    }
    accountMap.set(normalized.username, normalized)
  }
  for (const provisioned of loadProvisionedPosAccounts()) {
    accountMap.set(provisioned.username, provisioned)
  }
  return [...accountMap.values()]
}

function resolveLocation(session: Pick<PosSession, 'locations' | 'activeLocationId'>) {
  return session.locations.find((location) => location.id === session.activeLocationId) || null
}

function resolveSessionRole(session: PosSession) {
  const businessRoles = getRolesForBusinessType(session.activeBusinessType)
  const validRoles = session.roles.filter((role) => businessRoles.includes(role))
  if (session.activeRole && validRoles.includes(session.activeRole)) {
    return session.activeRole
  }
  return validRoles[0] || session.roles[0] || 'cashier'
}

function pickDefaultModule(modules: PosModuleId[], preferred: PosModuleId): PosModuleId {
  if (modules.includes(preferred)) {
    return preferred
  }
  if (modules.includes('enterprise')) {
    return 'enterprise'
  }
  return modules[0] || 'enterprise'
}

function buildPosRoleAccess(role: PosUserRole, businessType: PosBusinessType): PosRoleAccess {
  const preset = POS_MODULE_PRESETS[businessType]
  if (role === 'owner') {
    return {
      role,
      defaultModule: pickDefaultModule(preset, 'enterprise'),
      modules: preset,
      canExportExcel: true,
      canExportJson: true,
      canResetWorkspace: true,
      canRunAiActions: true,
      readOnly: false,
    }
  }
  if (role === 'manager') {
    return {
      role,
      defaultModule: pickDefaultModule(preset, 'shift'),
      modules: preset,
      canExportExcel: true,
      canExportJson: true,
      canResetWorkspace: false,
      canRunAiActions: true,
      readOnly: false,
    }
  }
  if (role === 'auditor') {
    return {
      role,
      defaultModule: pickDefaultModule(preset, 'enterprise'),
      modules: preset.filter((module) => module !== 'shift' || businessType !== 'spa'),
      canExportExcel: true,
      canExportJson: true,
      canResetWorkspace: false,
      canRunAiActions: false,
      readOnly: true,
    }
  }
  if (role === 'cashier') {
    const modules = preset.filter((module) => ['payment', 'tables', 'shift', 'stock', 'guest'].includes(module))
    return {
      role,
      defaultModule: pickDefaultModule(modules, 'payment'),
      modules,
      canExportExcel: true,
      canExportJson: false,
      canResetWorkspace: false,
      canRunAiActions: false,
      readOnly: false,
    }
  }
  if (role === 'front-desk') {
    const modules = preset.filter((module) => ['payment', 'tables', 'shift', 'guest', 'approvals'].includes(module))
    return {
      role,
      defaultModule: pickDefaultModule(modules, 'tables'),
      modules,
      canExportExcel: true,
      canExportJson: false,
      canResetWorkspace: false,
      canRunAiActions: false,
      readOnly: false,
    }
  }
  if (role === 'service-provider') {
    const modules = preset.filter((module) => ['tables', 'kitchen', 'shift', 'guest'].includes(module))
    return {
      role,
      defaultModule: pickDefaultModule(modules, 'kitchen'),
      modules,
      canExportExcel: true,
      canExportJson: false,
      canResetWorkspace: false,
      canRunAiActions: false,
      readOnly: false,
    }
  }
  const modules = preset.filter((module) => ['stock', 'shift', 'approvals', 'payment'].includes(module))
  return {
    role,
    defaultModule: pickDefaultModule(modules, 'stock'),
    modules,
    canExportExcel: true,
    canExportJson: false,
    canResetWorkspace: false,
    canRunAiActions: false,
    readOnly: false,
  }
}

function normalizeSession(value: unknown): PosSession | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<PosSession>
  const roles = normalizeRoles(raw.roles)
  if (!roles.length) {
    return null
  }
  const locations = normalizeLocations(raw.locations)
  const businessTypesFromSession = normalizeBusinessTypes(raw.businessTypes)
  const businessTypesFromLocations = [...new Set(locations.map((item) => item.businessType))]
  const resolvedBusinessTypes = businessTypesFromSession.length
    ? businessTypesFromSession
    : businessTypesFromLocations.length
      ? businessTypesFromLocations
      : [getDefaultBusinessType()]
  const activeLocationId = String(raw.activeLocationId || '').trim().toLowerCase()
  const fallbackLocation = locations[0] || null
  const nextLocation =
    (activeLocationId ? locations.find((item) => item.id === activeLocationId) : null) ||
    fallbackLocation
  const activeBusinessType = normalizeBusinessType(raw.activeBusinessType)
  const requestedBusinessType = nextLocation?.businessType || activeBusinessType || resolvedBusinessTypes[0]
  const nextBusinessType = resolvedBusinessTypes.includes(requestedBusinessType)
    ? requestedBusinessType
    : resolvedBusinessTypes[0]
  const resolvedActiveLocationId =
    locations.find((item) => item.id === nextLocation?.id && item.businessType === nextBusinessType)?.id
    || locations.find((item) => item.businessType === nextBusinessType)?.id
    || nextLocation?.id
    || 'default-location'
  const activeRole = normalizeRole(raw.activeRole)
  const businessRoles = getRolesForBusinessType(nextBusinessType)
  return {
    username: String(raw.username || '').trim().toLowerCase(),
    displayName: String(raw.displayName || '').trim(),
    companyName: migrateLegacyDemoCompanyName(String(raw.companyName || '').trim()),
    workspaceSlug: String(raw.workspaceSlug || '').trim(),
    roles,
    businessTypes: resolvedBusinessTypes,
    locations,
    activeLocationId: resolvedActiveLocationId,
    activeRole: activeRole && roles.includes(activeRole) && businessRoles.includes(activeRole) ? activeRole : null,
    activeBusinessType: nextBusinessType,
    signedInAt: String(raw.signedInAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso()),
  }
}

function normalizePosApiSessionRecord(session: PosApiSessionRecord | null | undefined) {
  if (!session) {
    return null
  }
  const mapped = normalizeSession({
    username: String(session.username || '').trim().toLowerCase(),
    displayName: String(session.display_name || '').trim(),
    companyName: String(session.company_name || '').trim(),
    workspaceSlug: String(session.workspace_slug || '').trim(),
    roles: Array.isArray(session.roles) ? session.roles : [],
    businessTypes: Array.isArray(session.business_types) ? session.business_types : [],
    locations: Array.isArray(session.locations)
      ? session.locations.map((location) => ({
        id: String(location?.id || '').trim().toLowerCase(),
        label: String(location?.label || '').trim(),
        businessType: String(location?.business_type || '').trim().toLowerCase(),
        timezone: String(location?.timezone || '').trim(),
        currency: String(location?.currency || '').trim(),
        status: String(location?.status || '').trim().toLowerCase(),
      }))
      : [],
    activeLocationId: String(session.active_location_id || '').trim().toLowerCase(),
    activeBusinessType: String(session.active_business_type || '').trim().toLowerCase(),
    activeRole: String(session.active_role || '').trim().toLowerCase(),
    signedInAt: String(session.signed_in_at || '').trim() || nowIso(),
    updatedAt: String(session.updated_at || '').trim() || nowIso(),
  })
  return mapped
}

export async function restorePosSessionFromApi() {
  if (typeof window === 'undefined' || !hasPosAuthApi()) {
    return null
  }
  try {
    const payload = await posFetch<PosApiSessionResponse>('/api/pos/auth/session', {
      method: 'GET',
      timeoutMs: 5000,
    })
    if (!payload?.authenticated) {
      return null
    }
    const normalized = normalizePosApiSessionRecord(payload.session)
    if (!normalized) {
      return null
    }
    return savePosSession(normalized)
  } catch {
    return null
  }
}

function buildWorkspaceCachePayload(session: PosSession) {
  const role = resolveSessionRole(session)
  const workspaceId = `pos-${session.workspaceSlug || 'workspace'}`
  const businessProfile = POS_BUSINESS_PROFILES[session.activeBusinessType]
  const activeLocation = resolveLocation(session)
  const locationLabel = activeLocation?.label || 'Main location'
  return {
    status: 'ready',
    auth_required: true,
    authenticated: true,
    demo_login_enabled: true,
    workspaces: [
      {
        workspace_id: workspaceId,
        slug: session.workspaceSlug,
        name: `${session.companyName} POS`,
        plan: 'demo',
        role,
        business_type: session.activeBusinessType,
        location_id: activeLocation?.id || '',
        location_label: locationLabel,
      },
    ],
    session: {
      session_id: `pos_${session.username}_${session.signedInAt}`,
      username: session.username,
      display_name: session.displayName,
      role,
      capabilities: POS_ROLE_CAPABILITIES[role] || POS_ROLE_CAPABILITIES.cashier,
      workspace_id: workspaceId,
      workspace_slug: session.workspaceSlug,
      workspace_name: `${session.companyName} POS`,
      workspace_plan: 'demo',
      business_type: session.activeBusinessType,
      business_label: businessProfile?.label || 'POS',
      location_id: activeLocation?.id || '',
      location_label: locationLabel,
    },
  }
}

function findDemoAccountByUsername(username: string) {
  const normalizedUsername = String(username || '').trim().toLowerCase()
  return getAllPosAccounts().find((item) => item.username.toLowerCase() === normalizedUsername) ?? null
}

function canonicalizeDemoSession(session: PosSession) {
  const account = findDemoAccountByUsername(session.username)
  if (!account) {
    return session
  }

  const accountLocations = normalizeLocations(account.locations)
  const locations = accountLocations.length ? accountLocations : session.locations
  const activeLocationId = locations.find((location) => location.id === session.activeLocationId)?.id
    || locations.find((location) => location.businessType === session.activeBusinessType)?.id
    || locations[0]?.id
    || session.activeLocationId
  const activeLocation = locations.find((location) => location.id === activeLocationId)
  const businessTypes = [...new Set((account.businessTypes?.length ? account.businessTypes : locations.map((location) => location.businessType)) as PosBusinessType[])]
  const activeBusinessType = activeLocation?.businessType
    || (businessTypes.includes(session.activeBusinessType) ? session.activeBusinessType : businessTypes[0] || getDefaultBusinessType())
  const businessRoles = getRolesForBusinessType(activeBusinessType)
  const mergedRoles = account.roles.filter((role) => session.roles.includes(role) || account.roles.includes(role))
  const roles = mergedRoles.length ? mergedRoles : session.roles
  const activeRole = session.activeRole && roles.includes(session.activeRole) && businessRoles.includes(session.activeRole)
    ? session.activeRole
    : null

  return {
    ...session,
    displayName: account.displayName,
    companyName: account.companyName,
    workspaceSlug: account.workspaceSlug,
    roles,
    businessTypes: businessTypes.length ? businessTypes : [getDefaultBusinessType()],
    locations,
    activeLocationId,
    activeBusinessType,
    activeRole,
  }
}

function migrateLegacySeedSession(session: PosSession) {
  if (findDemoAccountByUsername(session.username)) {
    return session
  }
  const legacyToken = [
    session.username,
    session.workspaceSlug,
    session.companyName,
    ...session.locations.map((location) => `${location.id} ${location.label}`),
  ]
    .join(' ')
    .toLowerCase()
  const looksLikeLegacySeed =
    legacyToken.includes('golden plate')
    || legacyToken.includes('lotus spa')
    || legacyToken.includes('north retail')
    || legacyToken.includes('first client demo')
    || legacyToken.includes('restaurant demo')
    || legacyToken.includes('spa demo')
    || legacyToken.includes('retail demo')
    || legacyToken.includes(POS_SEED_WORKSPACE_SLUG)
  if (!looksLikeLegacySeed) {
    return session
  }
  const seedAccount = POS_DEMO_ACCOUNTS[0]
  const defaultLocation = seedAccount.locations.find((location) => location.id === seedAccount.defaultLocationId) || seedAccount.locations[0]
  const businessTypes = seedAccount.businessTypes.length
    ? seedAccount.businessTypes
    : [...new Set(seedAccount.locations.map((location) => location.businessType))]
  return {
    ...session,
    username: seedAccount.username,
    displayName: seedAccount.displayName,
    companyName: seedAccount.companyName,
    workspaceSlug: seedAccount.workspaceSlug,
    roles: seedAccount.roles,
    businessTypes: businessTypes.length ? businessTypes : [getDefaultBusinessType()],
    locations: normalizeLocations(seedAccount.locations),
    activeLocationId: defaultLocation?.id || session.activeLocationId,
    activeBusinessType: defaultLocation?.businessType || seedAccount.defaultBusinessType || session.activeBusinessType,
    activeRole: null,
    updatedAt: nowIso(),
  }
}

function randomDigits(length: number) {
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += Math.floor(Math.random() * 10).toString()
  }
  return value
}

function generateClientPassword() {
  const randomToken = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `Smg@${randomToken}${randomDigits(2)}`
}

function buildProvisionedLocations(
  clientSlug: string,
  businessType: PosBusinessType,
  locationCount: number,
  goLiveStatus: 'setup' | 'pilot' | 'live',
) {
  const safeCount = Math.min(24, Math.max(1, Math.round(locationCount)))
  const businessLabel = getPosBusinessProfile(businessType).label
  const locations: PosLocationProfile[] = []
  for (let index = 0; index < safeCount; index += 1) {
    const ordinal = index + 1
    locations.push({
      id: `${businessType}-${clientSlug}-loc-${ordinal}`,
      label: `${businessLabel} / Location ${ordinal.toString().padStart(2, '0')}`,
      businessType,
      timezone: 'Asia/Rangoon',
      currency: 'MMK',
      status: goLiveStatus,
    })
  }
  return locations
}

function buildProvisionedRoles(businessType: PosBusinessType) {
  const businessRoles = getRolesForBusinessType(businessType)
  const seededRoles: PosUserRole[] = ['owner', 'manager', 'auditor']
  for (const role of businessRoles) {
    if (!seededRoles.includes(role)) {
      seededRoles.push(role)
    }
  }
  return seededRoles.filter((role) => businessRoles.includes(role) || role === 'auditor')
}

function findProvisionedOwnerAccount(accounts: PosDemoAccount[], clientName: string, businessType: PosBusinessType) {
  const normalizedClient = clientName.trim().toLowerCase()
  return accounts.find((account) =>
    account.companyName.trim().toLowerCase() === normalizedClient
    && account.defaultBusinessType === businessType
    && account.roles.includes('owner'),
  ) || null
}

export function getPosProvisionedAccounts() {
  return loadProvisionedPosAccounts()
}

export function upsertPosProvisionedAccount(input: PosProvisionedAccountInput): PosProvisionedAccountResult | null {
  const clientName = String(input.clientName || '').trim()
  const ownerName = String(input.ownerName || '').trim() || 'Owner'
  const businessType = normalizeBusinessType(input.businessType)
  if (!clientName || !businessType) {
    return null
  }

  const clientSlug = slugifyToken(clientName) || `client-${Date.now()}`
  const username = normalizeAccountUsername(`owner.${clientSlug}@clients.pos.supermega.dev`)
  const workspaceSlug = `client-${clientSlug}`
  const roles = buildProvisionedRoles(businessType)
  const locations = buildProvisionedLocations(clientSlug, businessType, input.locationCount, input.goLiveStatus)
  if (!roles.length || !locations.length) {
    return null
  }

  const current = loadProvisionedPosAccounts()
  const existing = current.find((account) => normalizeAccountUsername(account.username) === username) || null
  const password = existing?.password || generateClientPassword()
  const managerOverridePin = existing?.managerOverridePin || randomDigits(6)

  const nextAccount: PosDemoAccount = {
    username,
    password,
    managerOverridePin,
    displayName: ownerName,
    companyName: clientName,
    workspaceSlug,
    roles,
    businessTypes: [businessType],
    locations,
    defaultLocationId: locations[0].id,
    defaultBusinessType: businessType,
  }

  const normalized = normalizeAccount(nextAccount)
  if (!normalized) {
    return null
  }

  const nextList = [...current.filter((account) => normalizeAccountUsername(account.username) !== username), normalized]
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
  saveProvisionedPosAccounts(nextList)
  return {
    account: normalized,
    created: !existing,
    username: normalized.username,
    password: normalized.password,
  }
}

export function upsertPosProvisionedRoleAccount(input: PosProvisionedRoleAccountInput): PosProvisionedAccountResult | null {
  const clientName = String(input.clientName || '').trim()
  const displayName = String(input.displayName || '').trim() || 'Team member'
  const businessType = normalizeBusinessType(input.businessType)
  const role = normalizeRole(input.role)
  const username = normalizeAccountUsername(String(input.username || ''))
  const password = String(input.password || '').trim()
  if (!clientName || !businessType || !role || !username || !password) {
    return null
  }
  if (!getRolesForBusinessType(businessType).includes(role)) {
    return null
  }

  const current = loadProvisionedPosAccounts()
  const ownerAccount = findProvisionedOwnerAccount(current, clientName, businessType)
  const existing = current.find((account) => normalizeAccountUsername(account.username) === username) || null
  const clientSlug = slugifyToken(clientName) || slugifyToken(username) || `client-${Date.now()}`
  const fallbackLocations = buildProvisionedLocations(clientSlug, businessType, 1, 'setup')
  const locations = ownerAccount?.locations?.length ? ownerAccount.locations : fallbackLocations
  const businessTypes = ownerAccount?.businessTypes?.length ? ownerAccount.businessTypes : [businessType]
  const workspaceSlug = ownerAccount?.workspaceSlug || `client-${clientSlug}`
  const managerOverridePin = existing?.managerOverridePin || ownerAccount?.managerOverridePin || randomDigits(6)
  const defaultBusinessType = ownerAccount?.defaultBusinessType || businessType
  const defaultLocationId =
    locations.find((location) => location.businessType === defaultBusinessType)?.id
    || locations[0]?.id
    || 'default-location'

  const nextAccount: PosDemoAccount = {
    username,
    password,
    managerOverridePin,
    displayName,
    companyName: clientName,
    workspaceSlug,
    roles: [role],
    businessTypes,
    locations,
    defaultLocationId,
    defaultBusinessType,
  }

  const normalized = normalizeAccount(nextAccount)
  if (!normalized) {
    return null
  }

  const nextList = [...current.filter((account) => normalizeAccountUsername(account.username) !== username), normalized]
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
  saveProvisionedPosAccounts(nextList)
  return {
    account: normalized,
    created: !existing,
    username: normalized.username,
    password: normalized.password,
  }
}

export function isPosAuthHost(hostname = typeof window === 'undefined' ? '' : window.location.hostname) {
  const normalized = normalizeHostname(hostname)
  return normalized === supermegaPosHost || normalized === `www.${supermegaPosHost}`
}

export function getPosBusinessCatalog() {
  return Object.values(POS_BUSINESS_PROFILES)
}

export function getPosBusinessProfile(businessType: PosBusinessType | null | undefined) {
  if (!businessType) {
    return POS_BUSINESS_PROFILES[getDefaultBusinessType()]
  }
  return POS_BUSINESS_PROFILES[businessType] || POS_BUSINESS_PROFILES[getDefaultBusinessType()]
}

export function getPosBusinessModuleLabels(businessType: PosBusinessType | null | undefined) {
  return getPosBusinessProfile(businessType).moduleLabels
}

export function getPosBusinessModuleContracts(businessType: PosBusinessType | null | undefined) {
  return getPosBusinessProfile(businessType).moduleContracts
}

function normalizeDemoAccountForDisplay(account: PosDemoAccount): PosDemoAccount {
  const normalizedLocations = normalizeLocations(account.locations)
  const defaultLocation = normalizedLocations.find((location) => location.id === account.defaultLocationId) || normalizedLocations[0]
  const normalizedBusinessTypes = normalizeBusinessTypes(account.businessTypes)
  const fallbackBusinessType = defaultLocation?.businessType || account.defaultBusinessType || getDefaultBusinessType()
  const businessTypes = normalizedBusinessTypes.length
    ? normalizedBusinessTypes
    : [...new Set(normalizedLocations.map((location) => location.businessType))]
  return {
    ...account,
    companyName: migrateLegacyDemoCompanyName(account.companyName),
    workspaceSlug: String(account.workspaceSlug || POS_SEED_WORKSPACE_SLUG).trim().toLowerCase() || POS_SEED_WORKSPACE_SLUG,
    locations: normalizedLocations.length ? normalizedLocations : account.locations,
    businessTypes: businessTypes.length ? businessTypes : [fallbackBusinessType],
    defaultLocationId: defaultLocation?.id || account.defaultLocationId,
    defaultBusinessType: fallbackBusinessType,
  }
}

function isSeedDemoAccount(account: PosDemoAccount) {
  return account.username.toLowerCase() === 'spaowner'
    || isPosSeedDemoWorkspaceSlug(account.workspaceSlug)
    || migrateLegacyDemoCompanyName(account.companyName) === POS_DEMO_COMPANY_NAME
}

export function getPosDemoAccounts() {
  const normalized = getAllPosAccounts().map((account) => normalizeDemoAccountForDisplay(account))
  const seedAccounts = normalized.filter((account) => isSeedDemoAccount(account))
  const scoped = seedAccounts.length ? seedAccounts : normalized
  return [...scoped].sort((a, b) => {
    const aSeed = isPosSeedDemoWorkspaceSlug(a.workspaceSlug) ? 1 : 0
    const bSeed = isPosSeedDemoWorkspaceSlug(b.workspaceSlug) ? 1 : 0
    if (aSeed !== bSeed) {
      return bSeed - aSeed
    }
    return a.username.localeCompare(b.username)
  })
}

export function getPosLocationCatalog(session: PosSession | null | undefined) {
  if (!session?.locations?.length) {
    return []
  }
  const uniqueLocations: PosLocationProfile[] = []
  const seenLocationKey = new Set<string>()
  for (const location of session.locations) {
    const key = `${location.businessType}:${location.id}`
    if (seenLocationKey.has(key)) {
      continue
    }
    seenLocationKey.add(key)
    uniqueLocations.push(location)
  }
  const isSeedDemoWorkspace = isPosSeedDemoWorkspaceSlug(session.workspaceSlug)
  if (!isSeedDemoWorkspace) {
    return uniqueLocations
  }
  const preferredDemoOrder = [
    POS_DEMO_LOCATION_PROFILES.restaurant.id,
    POS_DEMO_LOCATION_PROFILES.spa.id,
    POS_DEMO_LOCATION_PROFILES.retail.id,
  ]
  const orderedByType: PosLocationProfile[] = []
  const seenBusinessType = new Set<PosBusinessType>()
  for (const locationId of preferredDemoOrder) {
    const location = uniqueLocations.find((item) => item.id === locationId)
    if (!location || seenBusinessType.has(location.businessType)) {
      continue
    }
    seenBusinessType.add(location.businessType)
    orderedByType.push(location)
  }
  for (const location of uniqueLocations) {
    if (seenBusinessType.has(location.businessType)) {
      continue
    }
    seenBusinessType.add(location.businessType)
    orderedByType.push(location)
  }
  return orderedByType
}

export function getPosActiveLocation(session: PosSession | null | undefined) {
  if (!session) {
    return null
  }
  return resolveLocation(session)
}

export function getPosWorkspaceScopeKey(session: PosSession | null | undefined) {
  if (!session) {
    return 'pos-default'
  }
  const raw = `${session.workspaceSlug}-${session.username}-${session.activeBusinessType}-${session.activeLocationId}`
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'pos-default'
}

export function loadPosSession() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(POS_SESSION_KEY)
    if (!raw) {
      return null
    }
    const normalized = normalizeSession(JSON.parse(raw))
    if (!normalized) {
      return null
    }
    const canonical = canonicalizeDemoSession(normalized)
    const migrated = migrateLegacySeedSession(canonical)
    const changed = JSON.stringify(migrated) !== JSON.stringify(normalized)
    if (changed) {
      savePosSession(migrated)
    }
    return migrated
  } catch {
    return null
  }
}

export function savePosSession(session: PosSession) {
  if (typeof window === 'undefined') {
    return session
  }
  const normalized = normalizeSession(session)
  if (!normalized) {
    return null
  }
  const payload = { ...normalized, updatedAt: nowIso() }
  try {
    window.localStorage.setItem(POS_SESSION_KEY, JSON.stringify(payload))
    window.localStorage.setItem(WORKSPACE_SESSION_CACHE_KEY, JSON.stringify(buildWorkspaceCachePayload(payload)))
  } catch {
    return payload
  }
  return payload
}

export function clearPosSession() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(POS_SESSION_KEY)
    window.localStorage.removeItem(WORKSPACE_SESSION_CACHE_KEY)
  } catch {
    // Ignore local storage failures.
  }
}

export function clearPosLocalState(options?: { preserveProvisionedAccounts?: boolean }) {
  if (typeof window === 'undefined') {
    return
  }
  const preserveProvisionedAccounts = Boolean(options?.preserveProvisionedAccounts)
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key) {
        keys.push(key)
      }
    }
    for (const key of keys) {
      const shouldClearPosKey = key.startsWith(POS_STORAGE_KEY_PREFIX)
      const shouldClearRestaurantWorkspace = key.startsWith(RESTAURANT_WORKSPACE_STORAGE_KEY_PREFIX)
      const isWorkspaceCache = key === WORKSPACE_SESSION_CACHE_KEY
      if (!shouldClearPosKey && !shouldClearRestaurantWorkspace && !isWorkspaceCache) {
        continue
      }
      if (preserveProvisionedAccounts && key === POS_PROVISIONED_ACCOUNTS_STORAGE_KEY) {
        continue
      }
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore local storage failures.
  }
}

function authenticatePosAccountLocal(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedPassword = password.trim()
  const account = getAllPosAccounts().find((item) => item.username.toLowerCase() === normalizedUsername && item.password === normalizedPassword)
  if (!account) {
    return null
  }
  const defaultLocation = account.locations.find((location) => location.id === account.defaultLocationId) || account.locations[0]
  const activeBusinessType = defaultLocation?.businessType || account.defaultBusinessType
  return savePosSession({
    username: account.username,
    displayName: account.displayName,
    companyName: account.companyName,
    workspaceSlug: account.workspaceSlug,
    roles: account.roles,
    businessTypes: account.businessTypes,
    locations: account.locations,
    activeLocationId: defaultLocation?.id || 'default-location',
    activeBusinessType,
    activeRole: null,
    signedInAt: nowIso(),
    updatedAt: nowIso(),
  })
}

export async function authenticatePosAccount(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedPassword = password.trim()
  if (!normalizedUsername || !normalizedPassword) {
    return null
  }

  if (hasPosAuthApi()) {
    try {
      const payload = await posFetch<PosApiSessionResponse>('/api/pos/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: normalizedUsername,
          password: normalizedPassword,
        }),
        timeoutMs: POS_API_TIMEOUT_MS,
      })
      if (payload?.authenticated) {
        const normalized = normalizePosApiSessionRecord(payload.session)
        if (normalized) {
          return savePosSession(normalized)
        }
      }
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0)
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        const detail = error instanceof Error ? error.message : 'POS sign-in failed.'
        throw new Error(detail || 'POS sign-in failed.')
      }
      // Fall back to local demo auth when API is unavailable.
    }
  }

  return authenticatePosAccountLocal(normalizedUsername, normalizedPassword)
}

export async function logoutPosAccount() {
  if (hasPosAuthApi()) {
    try {
      await posFetch<{ status?: string; authenticated?: boolean }>('/api/pos/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
        timeoutMs: 5000,
      })
    } catch {
      // Ignore API logout failures and clear local state anyway.
    }
  }
  clearPosSession()
}

export async function syncPosProvisionedAccountToApi(account: PosDemoAccount) {
  if (!hasPosAuthApi()) {
    return { ok: false as const, created: false }
  }
  try {
    const payload = await posFetch<{ status?: string; created?: boolean }>('/api/pos/auth/provision-account', {
      method: 'POST',
      timeoutMs: 3500,
      body: JSON.stringify({
        username: account.username,
        password: account.password,
        manager_override_pin: account.managerOverridePin,
        display_name: account.displayName,
        company_name: account.companyName,
        workspace_slug: account.workspaceSlug,
        roles: account.roles,
        business_types: account.businessTypes,
        locations: account.locations.map((location) => ({
          id: location.id,
          label: location.label,
          business_type: location.businessType,
          timezone: location.timezone,
          currency: location.currency,
          status: location.status,
        })),
        default_location_id: account.defaultLocationId,
        default_business_type: account.defaultBusinessType,
      }),
    })
    return { ok: true as const, created: payload?.created === true }
  } catch {
    return { ok: false as const, created: false }
  }
}

export function getPosManagerOverrideHint() {
  const session = loadPosSession()
  if (!session) {
    return ''
  }
  const account = findDemoAccountByUsername(session.username)
  if (!account) {
    return ''
  }
  return account.managerOverridePin
}

export function validatePosManagerOverridePin(pin: string) {
  const session = loadPosSession()
  if (!session) {
    return false
  }
  const account = findDemoAccountByUsername(session.username)
  if (!account) {
    return false
  }
  return String(pin || '').trim() === account.managerOverridePin
}

export function setPosActiveRole(role: PosUserRole) {
  const current = loadPosSession()
  if (!current) {
    return null
  }
  const businessRoles = getRolesForBusinessType(current.activeBusinessType)
  if (!current.roles.includes(role) || !businessRoles.includes(role)) {
    return null
  }
  return savePosSession({
    ...current,
    activeRole: role,
    updatedAt: nowIso(),
  })
}

export function setPosActiveLocation(locationId: string) {
  const current = loadPosSession()
  if (!current) {
    return null
  }
  const nextLocation = current.locations.find((location) => location.id === String(locationId || '').trim().toLowerCase())
  if (!nextLocation) {
    return null
  }
  const businessRoles = getRolesForBusinessType(nextLocation.businessType)
  const nextRole = current.activeRole && businessRoles.includes(current.activeRole) ? current.activeRole : null
  return savePosSession({
    ...current,
    activeLocationId: nextLocation.id,
    activeBusinessType: nextLocation.businessType,
    activeRole: nextRole,
    updatedAt: nowIso(),
  })
}

export function setPosActiveBusinessType(businessType: PosBusinessType) {
  const current = loadPosSession()
  if (!current || !current.businessTypes.includes(businessType)) {
    return null
  }
  const businessRoles = getRolesForBusinessType(businessType)
  const nextRole = current.activeRole && businessRoles.includes(current.activeRole) ? current.activeRole : null
  const activeLocation = resolveLocation(current)
  const nextLocationId = activeLocation?.businessType === businessType
    ? activeLocation.id
    : current.locations.find((location) => location.businessType === businessType)?.id || current.activeLocationId
  return savePosSession({
    ...current,
    activeBusinessType: businessType,
    activeLocationId: nextLocationId,
    activeRole: nextRole,
    updatedAt: nowIso(),
  })
}

export function clearPosActiveRole() {
  const current = loadPosSession()
  if (!current) {
    return null
  }
  return savePosSession({
    ...current,
    activeRole: null,
    updatedAt: nowIso(),
  })
}

export function ensurePosWorkspaceCache() {
  if (typeof window === 'undefined') {
    return
  }
  const session = loadPosSession()
  if (!session) {
    return
  }
  try {
    window.localStorage.setItem(WORKSPACE_SESSION_CACHE_KEY, JSON.stringify(buildWorkspaceCachePayload(session)))
  } catch {
    // Ignore cache write issues.
  }
}

export function getPosRoleCatalogForBusiness(businessType: PosBusinessType | null | undefined) {
  const resolvedBusinessType = businessType || getDefaultBusinessType()
  return POS_ROLE_CATALOG.filter((item) => item.businessTypes.includes(resolvedBusinessType))
}

export function getPosRoleProfile(role: PosUserRole | null | undefined, businessType?: PosBusinessType | null) {
  if (!role) {
    return null
  }
  const profile = POS_ROLE_CATALOG.find((item) => item.id === role) ?? null
  if (!profile) {
    return null
  }
  if (businessType && !profile.businessTypes.includes(businessType)) {
    return null
  }
  return profile
}

export function getPosRoleAccess(role: PosUserRole | null | undefined, businessType: PosBusinessType | null | undefined) {
  if (!role) {
    return null
  }
  const resolvedBusinessType = businessType || getDefaultBusinessType()
  const allowedRoles = getRolesForBusinessType(resolvedBusinessType)
  if (!allowedRoles.includes(role)) {
    return null
  }
  return buildPosRoleAccess(role, resolvedBusinessType)
}
