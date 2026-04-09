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
      '/platform': formatTenantPageTitle('Enterprise system', tenant),
      '/agents': formatTenantPageTitle('Agent teams', tenant),
      '/factory': formatTenantPageTitle('Build studio', tenant),
      '/products': formatTenantPageTitle('Live products', tenant),
      '/clients/yangon-tyre': formatTenantPageTitle('Yangon Tyre operating model', tenant),
      '/ytf': formatTenantPageTitle('Yangon Tyre operating model', tenant),
      '/work': formatTenantPageTitle('Live products', tenant),
      '/systems': formatTenantPageTitle('Live products', tenant),
      '/templates': formatTenantPageTitle('Live products', tenant),
      '/find-companies': formatTenantPageTitle('Find Clients', tenant),
      '/lead-finder': formatTenantPageTitle('Find Clients', tenant),
      '/company-list': formatTenantPageTitle('Company List', tenant),
      '/task-list': formatTenantPageTitle('Task List', tenant),
      '/receiving-log': formatTenantPageTitle('Receiving Log', tenant),
      '/receiving': formatTenantPageTitle('Receiving Log', tenant),
      '/action-os': formatTenantPageTitle('Task List', tenant),
      '/workspace': formatTenantPageTitle('Company List', tenant),
      '/contact': formatTenantPageTitle('Start rollout', tenant),
      '/book': formatTenantPageTitle('Start rollout', tenant),
      '/login': formatTenantPageTitle('Open workspace', tenant),
      '/signup': formatTenantPageTitle('Create workspace', tenant),
      '/app/factory': formatTenantPageTitle('Build studio', tenant),
      '/app/platform-admin': formatTenantPageTitle('Platform admin', tenant),
      '/app/architect': formatTenantPageTitle('Solution architect', tenant),
      '/app/teams': formatTenantPageTitle('Agent Ops', tenant),
      '/app/director': formatTenantPageTitle('Director command', tenant),
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title =
      titleMap[normalizedPath] ??
      (normalizedPath.startsWith('/products/') ? formatTenantPageTitle('Product detail', tenant) : homeTitle)
  }, [location.pathname, tenant])

  return null
}
