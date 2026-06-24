import { getSupermegaHostSurface, isSharedAppHost, isYtfClientHost } from './domainRouting'

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
  compactMark: 'Signal',
  brandTagline: 'CUSTOM SOFTWARE',
  siteMode: 'platform',
  navItems: [],
  showBookCta: true,
  bookCtaLabel: 'Contact',
  homeEyebrow: 'Custom software',
  homeTitle: 'Messy work. Clean system.',
  homeDescription: 'SUPERMEGA turns one important workflow into private software your team uses every day.',
  homePrimaryCta: { label: 'Contact', to: '/contact' },
  homeSecondaryCta: { label: 'Client login', to: '/login?next=/app/start' },
  toolCards: [],
  footerText: 'Start small. Prove value. Expand.',
  defaultWorkspaceSlug: 'supermega-lab',
  defaultCompany: 'SuperMega Lab',
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
  brandName: 'YTF Portal',
  compactMark: 'YT',
  brandTagline: 'Yangon Tyre private ERP',
  siteMode: 'client',
  tenantName: 'Yangon Tyre',
  tenantShortName: 'Private ERP',
  navItems: [
    { label: 'Login', to: '/login?next=/app/portal' },
    { label: 'Home', to: '/app/use' },
    { label: 'Entry', to: '/app/daily-entry' },
    { label: 'Plant', to: '/app/plant-manager' },
  ],
  showBookCta: false,
  bookCtaLabel: 'Open workspace',
  homeEyebrow: 'Private plant workspace',
  homeTitle: 'Run the plant from one simple portal.',
  homeDescription: 'Managers capture work. Plant Manager reviews. Quality, data, and AI stay behind the scenes.',
  homePrimaryCta: { label: 'Client login', to: '/login?next=/app/portal' },
  homeSecondaryCta: { label: 'Open plant manager', to: '/app/plant-manager' },
  toolCards: [
    {
      title: 'Manager Workspace',
      detail: 'Use one simple manager home for daily entry, action routing, document control, and light review.',
      to: '/app/manager-system',
    },
    {
      title: 'Plant Manager',
      detail: 'Open the plant-wide workspace for cross-functional review, escalation, daily close, and quality follow-through.',
      to: '/app/plant-manager',
    },
    {
      title: 'Quality',
      detail: 'Keep defects, 5W1H, document control, and quality data entry inside the same live system instead of binders and side files.',
      to: '/app/dqms',
    },
  ],
  footerText: 'Private industrial portal.',
  defaultWorkspaceSlug: 'ytf-plant-a',
  defaultCompany: 'Yangon Tyre',
}

function inferTenantKeyFromCachedWorkspace(): TenantConfig['key'] | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem('supermega.workspaceSession.v1')
    if (!raw) {
      return null
    }

    const payload = JSON.parse(raw) as {
      session?: {
        workspace_slug?: string
        workspace_id?: string
        workspace_name?: string
      } | null
    }
    const workspaceText = [
      payload.session?.workspace_slug,
      payload.session?.workspace_id,
      payload.session?.workspace_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (
      workspaceText.includes('ytf') ||
      workspaceText.includes('yangon tyre') ||
      workspaceText.includes('plant a') ||
      workspaceText.includes('plant b')
    ) {
      return 'ytf-plant-a'
    }
  } catch {
    return null
  }

  return null
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
  if (isYtfClientHost(hostname) || subdomain === 'ytf' || subdomain === 'ytf-plant-a') {
    return 'ytf-plant-a'
  }

  const hostSurface = getSupermegaHostSurface(hostname)
  if (hostSurface === 'public-site') {
    return 'default'
  }

  const cachedTenant = inferTenantKeyFromCachedWorkspace()
  if (cachedTenant && !isSharedAppHost(hostname) && (hostSurface === 'local' || hostSurface === 'preview')) {
    return cachedTenant
  }

  return 'default'
}

export function isPlatformAppHost() {
  if (typeof window === 'undefined') {
    return false
  }

  return isSharedAppHost(window.location.hostname)
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
