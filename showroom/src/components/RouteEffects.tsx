import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { formatTenantPageTitle, getTenantConfig } from '../lib/tenantConfig'

export function RouteEffects() {
  const location = useLocation()
  const tenant = getTenantConfig()

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
    const homeTitle = tenant.tenantName ? formatTenantPageTitle(tenant.tenantName, tenant) : `${tenant.brandName} | ${tenant.brandTagline}`
    const titleMap: Record<string, string> = {
      '/': homeTitle,
      '/platform': formatTenantPageTitle('Products', tenant),
      '/agents': formatTenantPageTitle('Products', tenant),
      '/factory': formatTenantPageTitle('Products', tenant),
      '/products': formatTenantPageTitle('Products', tenant),
      '/clients/yangon-tyre': formatTenantPageTitle('Yangon Tyre case study', tenant),
      '/ytf': formatTenantPageTitle('Yangon Tyre case study', tenant),
      '/work': formatTenantPageTitle('Products', tenant),
      '/systems': formatTenantPageTitle('Products', tenant),
      '/templates': formatTenantPageTitle('Products', tenant),
      '/find-companies': formatTenantPageTitle('Find Clients', tenant),
      '/lead-finder': formatTenantPageTitle('Find Clients', tenant),
      '/company-list': formatTenantPageTitle('Company List', tenant),
      '/task-list': formatTenantPageTitle('Task List', tenant),
      '/receiving-log': formatTenantPageTitle('Receiving Log', tenant),
      '/receiving': formatTenantPageTitle('Receiving Log', tenant),
      '/action-os': formatTenantPageTitle('Task List', tenant),
      '/workspace': formatTenantPageTitle('Company List', tenant),
      '/packages': formatTenantPageTitle('Contact', tenant),
      '/pricing': formatTenantPageTitle('Contact', tenant),
      '/plans': formatTenantPageTitle('Contact', tenant),
      '/implementation': formatTenantPageTitle('Contact', tenant),
      '/how-it-works': formatTenantPageTitle('Contact', tenant),
      '/contact': formatTenantPageTitle('Contact', tenant),
      '/book': formatTenantPageTitle('Contact', tenant),
      '/login': formatTenantPageTitle('Open workspace', tenant),
      '/signup': formatTenantPageTitle('Create workspace', tenant),
      '/demo-center': formatTenantPageTitle('Demo center', tenant),
      '/app/start': formatTenantPageTitle('Launchpad', tenant),
      '/app/meta': formatTenantPageTitle('Meta workspace', tenant),
      '/app/foundry': formatTenantPageTitle('Foundry release desk', tenant),
      '/app/factory': formatTenantPageTitle('Build studio', tenant),
      '/app/platform-admin': formatTenantPageTitle('Platform admin', tenant),
      '/app/architect': formatTenantPageTitle('Solution architect', tenant),
      '/app/teams': formatTenantPageTitle('Agent Ops', tenant),
      '/app/agent-space': formatTenantPageTitle('Agent space', tenant),
      '/app/workforce': formatTenantPageTitle('Workforce command', tenant),
      '/app/director': formatTenantPageTitle('Director command', tenant),
      '/app/plant-manager': formatTenantPageTitle('Manager operating system', tenant),
      '/app/manager-system': formatTenantPageTitle('Manager operating system', tenant),
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title =
      titleMap[normalizedPath] ??
      (normalizedPath.startsWith('/products/') ? formatTenantPageTitle('Product detail', tenant) : homeTitle)
  }, [location.pathname, tenant])

  return null
}
