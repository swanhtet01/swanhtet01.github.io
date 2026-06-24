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
  brandTagline: 'Company systems that replace tool sprawl',
  siteMode: 'platform',
  navItems: [
    { label: 'Products', to: '/products' },
    { label: 'Demo Center', to: '/demo-center' },
    { label: 'How it works', to: '/platform' },
    { label: 'Case Study', to: '/clients/yangon-tyre' },
    { label: 'Contact', to: '/contact' },
  ],
  showBookCta: true,
  bookCtaLabel: 'Request rollout',
  homeEyebrow: 'SUPERMEGA.dev',
  homeTitle: 'Replace tool sprawl with one working system.',
  homeDescription: 'Start with one live product for sales, company data, operations, or client delivery. Expand only after the first team trusts it.',
  homePrimaryCta: { label: 'Create workspace', to: '/signup' },
  homeSecondaryCta: { label: 'Request rollout', to: '/contact' },
  toolCards: [
    {
      title: 'Find Clients',
      detail: 'Search public companies, keep the shortlist, and move it into one working follow-up list.',
      to: '/products',
    },
    {
      title: 'Receiving Control',
      detail: 'Track inbound issues, missing GRNs, and supplier follow-up in one shared queue.',
      to: '/products',
    },
  ],
  footerText: 'Start with one working product. Then expand into a branded client portal with roles, approvals, and history on the same system.',
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
  brandName: 'SUPERMEGA.dev',
  compactMark: 'SM',
  brandTagline: 'AI-native manufacturing portal',
  siteMode: 'client',
  tenantName: 'Yangon Tyre',
  tenantShortName: 'Plant A',
  navItems: [
    { label: 'Portal', to: '/app/portal' },
    { label: 'Plant Manager', to: '/app/plant-manager' },
    { label: 'Sales Desk', to: '/app/revenue' },
    { label: 'Operations Desk', to: '/app/operations' },
    { label: 'DQMS Desk', to: '/app/dqms' },
    { label: 'Maintenance Desk', to: '/app/maintenance' },
    { label: 'CEO Brief', to: '/app/director' },
    { label: 'Admin Control', to: '/app/platform-admin' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open workspace',
  homeEyebrow: 'Yangon Tyre / Plant A',
  homeTitle: 'Yangon Tyre enterprise portal.',
  homeDescription: 'Sales, operations, manufacturing control, DQMS, maintenance, CEO review, and admin control in one portal.',
  homePrimaryCta: { label: 'Open portal', to: '/app/portal' },
  homeSecondaryCta: { label: 'Open DQMS desk', to: '/app/dqms' },
  toolCards: [
    {
      title: 'Sales Desk',
      detail: 'Accounts, follow-up, pipeline, and commercial history in one queue.',
      to: '/app/revenue',
    },
    {
      title: 'Operations Desk',
      detail: 'Receiving, action queues, inventory pressure, and plant issues on one desk.',
      to: '/app/operations',
    },
    {
      title: 'DQMS Desk',
      detail: 'Incidents, CAPA, fishbone, 5W1H, and KPI review in one industrial quality desk.',
      to: '/app/dqms',
    },
    {
      title: 'Maintenance Desk',
      detail: 'Breakdowns, PM work, spare-part blockers, and downtime follow-up in one reliability lane.',
      to: '/app/maintenance',
    },
    {
      title: 'CEO Brief',
      detail: 'Open the daily director view for risk, blocked work, and company signals.',
      to: '/app/director',
    },
    {
      title: 'Admin Control',
      detail: 'Manage tenant setup, access, connectors, policy, and rollout controls.',
      to: '/app/platform-admin',
    },
  ],
  footerText: 'Yangon Tyre enterprise portal for sales, operations, manufacturing control, DQMS, maintenance, CEO review, and admin control.',
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
  const subdomain = hostname.split('.')[0]
  if (hostname === 'ytf.supermega.dev' || hostname === 'www.ytf.supermega.dev' || subdomain === 'ytf' || subdomain === 'ytf-plant-a') {
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
