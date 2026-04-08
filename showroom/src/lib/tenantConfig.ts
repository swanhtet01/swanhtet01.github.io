export type TenantModule =
  | 'sales-system'
  | 'operations-inbox'
  | 'founder-brief'
  | 'client-portal'
  | 'receiving'
  | 'task-list'
  | 'kpi-review'
  | 'approvals'

export type TenantDataSurface = {
  googleDrive: 'shared-platform' | 'tenant-drive'
  gmail: 'shared-platform' | 'tenant-mailbox'
  knowledgeGraph: 'platform-graph'
  kpiFlow: 'shared-scorecards' | 'tenant-scorecards'
}

export type TenantConfig = {
  key: 'default' | 'ytf-plant-a'
  kind: 'general-platform' | 'tenant-vertical'
  brandName: string
  brandTagline: string
  navItems: Array<{ label: string; to: string }>
  showBookCta: boolean
  bookCtaLabel: string
  homeEyebrow: string
  homeTitle: string
  homeDescription: string
  homePrimaryCta: { label: string; to: string }
  homeSecondaryCta: { label: string; to: string }
  toolCards: Array<{ title: string; detail: string; to: string }>
  footerText: string
  defaultWorkspaceSlug?: string
  defaultCompany?: string
  logoAsset?: string
  modules: TenantModule[]
  dataSurface: TenantDataSurface
  roadmap: string[]
}

const defaultTenant: TenantConfig = {
  key: 'default',
  kind: 'general-platform',
  brandName: 'SuperMega',
  brandTagline: 'Custom systems with always-on agents',
  navItems: [
    { label: 'Products', to: '/products' },
    { label: 'Contact', to: '/contact' },
  ],
  showBookCta: true,
  bookCtaLabel: 'Contact us',
  homeEyebrow: 'SuperMega',
  homeTitle: 'Custom systems for sales, operations, and management.',
  homeDescription: 'Start with one workflow. Replace scattered tools with one working layer and a small set of always-on agents.',
  homePrimaryCta: { label: 'See products', to: '/products' },
  homeSecondaryCta: { label: 'Contact us', to: '/contact' },
  toolCards: [
    {
      title: 'Distributor sales desk',
      detail: 'Prospecting, cleanup, follow-up, and founder visibility in one sales system.',
      to: '/products',
    },
    {
      title: 'Receiving control',
      detail: 'One visible exception queue for GRN gaps, holds, and supplier follow-up.',
      to: '/products',
    },
  ],
  footerText: 'Custom systems for sales, operations, management, and client work.',
  logoAsset: '/brand/supermega-site-qr.svg',
  modules: ['sales-system', 'operations-inbox', 'founder-brief', 'client-portal', 'kpi-review', 'approvals'],
  dataSurface: {
    googleDrive: 'shared-platform',
    gmail: 'shared-platform',
    knowledgeGraph: 'platform-graph',
    kpiFlow: 'shared-scorecards',
  },
  roadmap: [
    'Strengthen general team roles and tenant-aware permissions.',
    'Keep Google Drive and Gmail ingestion shared at the platform layer first.',
    'Expand reusable scorecards, approvals, and founder review across tenants.',
  ],
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
  kind: 'tenant-vertical',
  brandName: 'Yangon Tyre Plant A',
  brandTagline: 'Plant A control desk',
  navItems: [
    { label: 'Receiving', to: '/receiving' },
    { label: 'Task List', to: '/task-list' },
    { label: 'Login', to: '/login' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open team workspace',
  homeEyebrow: 'Yangon Tyre Plant A',
  homeTitle: 'Track receiving, issues, and next tasks.',
  homeDescription: 'One simple control desk for Plant A. Keep receiving issues, blockers, and follow-up tasks in one place.',
  homePrimaryCta: { label: 'Open receiving', to: '/receiving' },
  homeSecondaryCta: { label: 'Open task list', to: '/task-list' },
  toolCards: [
    {
      title: 'Receiving',
      detail: 'Log GRN, hold, batch, or quantity issues and keep the next step visible.',
      to: '/receiving',
    },
    {
      title: 'Task List',
      detail: 'Turn shift notes, blockers, and manager follow-up into one short list.',
      to: '/task-list',
    },
    {
      title: 'Team workspace',
      detail: 'Open the saved workspace for Plant A managers and team members.',
      to: '/login',
    },
  ],
  footerText: 'Plant A control desk for receiving and daily follow-up.',
  defaultWorkspaceSlug: 'ytf-plant-a',
  defaultCompany: 'Yangon Tyre Plant A',
  logoAsset: '',
  modules: ['receiving', 'task-list', 'founder-brief', 'kpi-review', 'approvals'],
  dataSurface: {
    googleDrive: 'tenant-drive',
    gmail: 'tenant-mailbox',
    knowledgeGraph: 'platform-graph',
    kpiFlow: 'tenant-scorecards',
  },
  roadmap: [
    'Replace generic SuperMega brand marks with a Plant A-specific logo and app header.',
    'Turn Plant A receiving, KPI review, approvals, and founder brief into tenant-first modules.',
    'Map Plant A Google Drive, Gmail, and KPI rules into the shared platform graph without forking the app.',
  ],
}

export const TENANT_CONFIGS: Record<TenantConfig['key'], TenantConfig> = {
  default: defaultTenant,
  'ytf-plant-a': ytfTenant,
}

function inferTenantKey(): TenantConfig['key'] {
  if (typeof window === 'undefined') {
    return 'default'
  }

  const params = new URLSearchParams(window.location.search)
  const tenantParam = params.get('tenant')?.trim().toLowerCase()
  if (tenantParam === 'ytf' || tenantParam === 'ytf-plant-a') {
    return 'ytf-plant-a'
  }

  const hostname = window.location.hostname.trim().toLowerCase()
  if (hostname === 'ytf.supermega.dev' || hostname === 'www.ytf.supermega.dev') {
    return 'ytf-plant-a'
  }

  return 'default'
}

export function getTenantConfigByKey(key: TenantConfig['key']) {
  return TENANT_CONFIGS[key]
}

export function listTenantConfigs() {
  return Object.values(TENANT_CONFIGS)
}

export function getTenantConfig(): TenantConfig {
  return getTenantConfigByKey(inferTenantKey())
}
