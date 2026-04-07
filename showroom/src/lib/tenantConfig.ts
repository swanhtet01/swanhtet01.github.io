export type TenantConfig = {
  key: 'default' | 'ytf-plant-a'
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
}

const defaultTenant: TenantConfig = {
  key: 'default',
  brandName: 'SuperMega',
  brandTagline: 'Custom systems with always-on agents',
  navItems: [
    { label: 'Work', to: '/work' },
    { label: 'Contact', to: '/contact' },
  ],
  showBookCta: true,
  bookCtaLabel: 'Contact us',
  homeEyebrow: 'SuperMega',
  homeTitle: 'Custom systems for sales, operations, and management.',
  homeDescription: 'Start with one workflow. Replace scattered tools with one working layer and a small set of always-on agents.',
  homePrimaryCta: { label: 'See work', to: '/work' },
  homeSecondaryCta: { label: 'Contact us', to: '/contact' },
  toolCards: [
    {
      title: 'Distributor sales desk',
      detail: 'Prospecting, cleanup, follow-up, and founder visibility in one sales system.',
      to: '/work',
    },
    {
      title: 'Receiving control',
      detail: 'One visible exception queue for GRN gaps, holds, and supplier follow-up.',
      to: '/work',
    },
  ],
  footerText: 'Custom systems for sales, operations, management, and client work.',
}

const ytfTenant: TenantConfig = {
  key: 'ytf-plant-a',
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
