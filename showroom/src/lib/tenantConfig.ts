export type TenantConfig = {
  key: 'default' | 'ytf-plant-a'
  brandName: string
  compactMark: string
  brandTagline: string
  siteMode?: 'platform' | 'client'
  tenantName?: string
  tenantShortName?: string
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
}

const defaultTenant: TenantConfig = {
  key: 'default',
  brandName: 'SUPERMEGA.dev',
  compactMark: 'SM',
  brandTagline: 'AI-native company software',
  siteMode: 'platform',
  navItems: [
    { label: 'Products', to: '/products' },
    { label: 'Enterprise', to: '/platform' },
    { label: 'Contact', to: '/contact' },
  ],
  showBookCta: true,
  bookCtaLabel: 'Start rollout',
  homeEyebrow: 'SUPERMEGA.dev',
  homeTitle: 'Replace tool sprawl with working company software.',
  homeDescription: 'Start with live products for sales, company data, and receiving. Connect Gmail, Google Drive, Sheets, CSV, ERP exports, and APIs on one shared system.',
  homePrimaryCta: { label: 'See products', to: '/products' },
  homeSecondaryCta: { label: 'Start rollout', to: '/contact' },
  toolCards: [
    {
      title: 'Find Clients',
      detail: 'Prospecting, company cleanup, follow-up, and manager visibility in one sales system.',
      to: '/products',
    },
    {
      title: 'Receiving control',
      detail: 'One visible exception queue for GRN gaps, holds, supplier follow-up, and approvals.',
      to: '/products',
    },
  ],
  footerText: 'Live products, tenant workspaces, and internal tools on one enterprise system.',
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
  brandName: 'SUPERMEGA.dev',
  compactMark: 'SM',
  brandTagline: 'Yangon Tyre tenant operating system',
  siteMode: 'client',
  tenantName: 'Yangon Tyre',
  tenantShortName: 'Plant A',
  navItems: [
    { label: 'Operating Model', to: '/platform' },
    { label: 'Receiving', to: '/receiving-log' },
    { label: 'Task List', to: '/task-list' },
    { label: 'Team Login', to: '/login' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open tenant workspace',
  homeEyebrow: 'SUPERMEGA.dev / Yangon Tyre',
  homeTitle: 'Yangon Tyre Plant A on one live operating system.',
  homeDescription:
    'Receiving, supplier control, quality, files, approvals, and management review stay in one tenant workspace instead of scattered sheets and inbox threads.',
  homePrimaryCta: { label: 'Open receiving', to: '/receiving-log' },
  homeSecondaryCta: { label: 'Open task list', to: '/task-list' },
  toolCards: [
    {
      title: 'Operating model',
      detail: 'See Yangon Tyre roles, modules, connectors, security zones, and agent pods.',
      to: '/platform',
    },
    {
      title: 'Receiving',
      detail: 'Log GRN, hold, batch, or quantity issues and keep the next step visible.',
      to: '/receiving-log',
    },
    {
      title: 'Task List',
      detail: 'Turn shift notes, blockers, and manager follow-up into one short list.',
      to: '/task-list',
    },
    {
      title: 'Team workspace',
      detail: 'Open the tenant workspace for managers, procurement, quality, and operations.',
      to: '/login',
    },
  ],
  footerText: 'Yangon Tyre Plant A on SUPERMEGA.dev for receiving, supplier control, quality, and management review.',
  defaultWorkspaceSlug: 'ytf-plant-a',
  defaultCompany: 'Yangon Tyre',
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

export function getTenantConfig(): TenantConfig {
  const key = inferTenantKey()
  return key === 'ytf-plant-a' ? ytfTenant : defaultTenant
}

export function getTenantLabel(tenant: TenantConfig) {
  return [tenant.tenantName, tenant.tenantShortName].filter(Boolean).join(' / ')
}

export function getTenantBrandLabel(tenant: TenantConfig) {
  const tenantLabel = getTenantLabel(tenant)
  return tenantLabel ? `${tenant.brandName} / ${tenantLabel}` : tenant.brandName
}

export function formatTenantPageTitle(feature: string, tenant: TenantConfig) {
  return `${feature} | ${getTenantBrandLabel(tenant)}`
}
