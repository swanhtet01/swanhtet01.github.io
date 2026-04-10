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
  footerText: 'Start with one live product. Add the rest only after the first workflow works.',
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
  brandName: 'SUPERMEGA.dev',
  compactMark: 'SM',
  brandTagline: 'Plant A tenant workspace',
  siteMode: 'client',
  tenantName: 'Yangon Tyre',
  tenantShortName: 'Plant A',
  navItems: [
    { label: 'Home', to: '/' },
    { label: 'Sales Desk', to: '/app/sales' },
    { label: 'Operations Desk', to: '/app/receiving' },
    { label: 'CEO Brief', to: '/app/director' },
    { label: 'Admin Control', to: '/app/platform-admin' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open workspace',
  homeEyebrow: 'Yangon Tyre / Plant A',
  homeTitle: 'Plant A tenant workspace.',
  homeDescription: 'Sales, operations, CEO review, and admin control in one portal.',
  homePrimaryCta: { label: 'Open operations desk', to: '/app/receiving' },
  homeSecondaryCta: { label: 'Open sales desk', to: '/app/sales' },
  toolCards: [
    {
      title: 'Sales Desk',
      detail: 'Accounts, follow-up, pipeline, and commercial history in one queue.',
      to: '/app/sales',
    },
    {
      title: 'Operations Desk',
      detail: 'Receiving, action queues, inventory pressure, and plant issues on one desk.',
      to: '/app/receiving',
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
  footerText: 'Yangon Tyre Plant A workspace for sales, operations, CEO review, and admin control.',
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
