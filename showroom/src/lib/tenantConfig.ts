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
    { label: 'Pricing', to: '/offers/' },
    { label: 'Demo Center', to: '/demo-center' },
    { label: 'How it works', to: '/platform' },
    { label: 'Case Study', to: '/clients/factory-client' },
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
  brandName: 'Yangon Tyre ERP',
  compactMark: 'YT',
  brandTagline: 'Factory operations for Plant A and Plant B',
  siteMode: 'client',
  tenantName: 'Yangon Tyre',
  tenantShortName: 'Plant A + Plant B',
  navItems: [
    { label: 'Today', to: '/app/portal' },
    { label: 'Plant', to: '/app/plant-manager' },
    { label: 'Entry', to: '/app/daily-entry' },
    { label: 'ERP', to: '/app/erp' },
    { label: 'Data', to: '/app/live-data' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open workspace',
  homeEyebrow: 'Yangon Tyre',
  homeTitle: 'Yangon Tyre operations portal.',
  homeDescription: 'One clean place for daily close, production, stock, quality, sales, and plant follow-up.',
  homePrimaryCta: { label: 'Open today', to: '/app/portal' },
  homeSecondaryCta: { label: 'Add update', to: '/app/daily-entry' },
  toolCards: [
    {
      title: 'Today',
      detail: 'Current operating summary and follow-up work.',
      to: '/app/portal',
    },
    {
      title: 'Entry',
      detail: 'Daily summary, 5W1H, stock count, and board photo.',
      to: '/app/daily-entry',
    },
    {
      title: 'ERP',
      detail: 'Production, stock, quality, purchase, and sales records.',
      to: '/app/erp',
    },
    {
      title: 'Data',
      detail: 'Sales, materials, production, and quality drill-through.',
      to: '/app/live-data',
    },
  ],
  footerText: 'Yangon Tyre operating portal for factory teams and senior review.',
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
