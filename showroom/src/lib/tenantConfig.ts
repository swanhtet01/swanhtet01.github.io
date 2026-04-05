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
  brandTagline: 'Lists, logs, follow-up',
  navItems: [
    { label: 'Find clients', to: '/find-companies' },
    { label: 'Clean list', to: '/company-list' },
    { label: 'Log receiving', to: '/receiving-log' },
  ],
  showBookCta: true,
  bookCtaLabel: 'Book rollout call',
  homeEyebrow: 'SuperMega',
  homeTitle: 'Turn messy business work into one clear next-step list.',
  homeDescription: 'Find clients, clean a company list, or log receiving issues. Start with one tool.',
  homePrimaryCta: { label: 'Try find clients', to: '/find-companies' },
  homeSecondaryCta: { label: 'Clean a list', to: '/company-list' },
  toolCards: [
    {
      title: 'Find clients',
      detail: 'Search a place or niche and keep the companies worth contacting.',
      to: '/find-companies',
    },
    {
      title: 'Clean list',
      detail: 'Paste your own company list or keep the results you want to work.',
      to: '/company-list',
    },
    {
      title: 'Log receiving',
      detail: 'Log shortages, holds, or missing documents and keep the next step visible.',
      to: '/receiving-log',
    },
  ],
  footerText: 'Find clients. Clean lists. Log receiving.',
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
