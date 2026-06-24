import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { formatTenantPageTitle, getTenantConfig } from '../lib/tenantConfig'

export function RouteEffects() {
  const location = useLocation()
  const tenant = getTenantConfig()

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
    const isPosLoginRoute = normalizedPath === '/pos/login' || normalizedPath === '/pos/role'
    const isPosWorkspaceRoute = normalizedPath === '/pos/workspace'
    const homeTitle = tenant.tenantName ? formatTenantPageTitle(tenant.tenantName, tenant) : `${tenant.brandName} | ${tenant.brandTagline}`
    const surfaceMode = normalizedPath.startsWith('/app') || isPosWorkspaceRoute
      ? 'app'
      : normalizedPath === '/login' || normalizedPath === '/signup' || normalizedPath === '/setup' || isPosLoginRoute
        ? 'auth'
        : 'site'
    const titleMap: Record<string, string> = {
      '/': homeTitle,
      '/platform': homeTitle,
      '/agents': homeTitle,
      '/factory': homeTitle,
      '/products': homeTitle,
      '/start': formatTenantPageTitle('Start', tenant),
      '/ytf': homeTitle,
      '/work': homeTitle,
      '/systems': homeTitle,
      '/templates': homeTitle,
      '/packages': homeTitle,
      '/pricing': homeTitle,
      '/plans': homeTitle,
      '/implementation': homeTitle,
      '/how-it-works': homeTitle,
      '/about': formatTenantPageTitle('About', tenant),
      '/modules': formatTenantPageTitle('About', tenant),
      '/portal-types': formatTenantPageTitle('About', tenant),
      '/contact': formatTenantPageTitle('Contact', tenant),
      '/book': formatTenantPageTitle('Contact', tenant),
      '/login': formatTenantPageTitle(tenant.key === 'default' ? 'Sign in' : 'Open app', tenant),
      '/pos/login': formatTenantPageTitle('POS login', tenant),
      '/pos/role': formatTenantPageTitle('POS role', tenant),
      '/pos/workspace': formatTenantPageTitle('POS workspace', tenant),
      '/signup': formatTenantPageTitle('Create workspace', tenant),
      '/setup': formatTenantPageTitle('Create workspace', tenant),
      '/get-started': formatTenantPageTitle('Contact', tenant),
      '/demo-center': homeTitle,
      '/enterprise-demo': homeTitle,
      '/app/start': formatTenantPageTitle('Launchpad', tenant),
      '/app/daily-entry': formatTenantPageTitle('Daily entry', tenant),
      '/app/meta': formatTenantPageTitle('Meta workspace', tenant),
      '/app/foundry': formatTenantPageTitle('Foundry release desk', tenant),
      '/app/factory': formatTenantPageTitle('Build studio', tenant),
      '/app/build-studio': formatTenantPageTitle('Build studio', tenant),
  '/app/portal-factory': formatTenantPageTitle('Client templates', tenant),
      '/app/meta-ops': formatTenantPageTitle('Meta Ops', tenant),
      '/app/platform-admin': formatTenantPageTitle('Platform admin', tenant),
      '/app/architect': formatTenantPageTitle('Solution architect', tenant),
      '/app/teams': formatTenantPageTitle('Agent Ops', tenant),
      '/app/agent-space': formatTenantPageTitle('Agent space', tenant),
      '/app/custom-workflow': formatTenantPageTitle('Workflow Builder', tenant),
      '/app/documents': formatTenantPageTitle('Document Extraction Ledger', tenant),
      '/app/factory-operations': formatTenantPageTitle('Factory Operations App', tenant),
      '/app/restaurant-pos': formatTenantPageTitle('Restaurant POS + Inventory', tenant),
      '/app/workforce': formatTenantPageTitle('Workforce command', tenant),
      '/app/director': formatTenantPageTitle('Director command', tenant),
      '/app/service-desk': formatTenantPageTitle(tenant.key === 'ytf-plant-a' ? 'AI ERP' : 'Service Desk POS', tenant),
      '/app/manager-system': formatTenantPageTitle('Manager home', tenant),
      '/app/plant-manager': formatTenantPageTitle('Plant OS', tenant),
      '/app/erp': formatTenantPageTitle('AI ERP', tenant),
      '/app/simple-tools': formatTenantPageTitle('Simple tools', tenant),
      '/app/manager-sops': formatTenantPageTitle('Manager SOPs', tenant),
      '/app/invisible-iso': formatTenantPageTitle('Invisible ISO', tenant),
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
    document.body.dataset.smSurface = surfaceMode
    document.title =
      titleMap[normalizedPath] ??
      (normalizedPath.startsWith('/products/') ? homeTitle : homeTitle)
  }, [location.pathname, location.search, location.hash, tenant])

  return null
}
