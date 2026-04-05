import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getTenantConfig } from '../lib/tenantConfig'

export function RouteEffects() {
  const location = useLocation()
  const tenant = getTenantConfig()

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
    const titleMap: Record<string, string> = {
      '/': `${tenant.brandName} | ${tenant.brandTagline}`,
      '/find-companies': `Find Companies | ${tenant.brandName}`,
      '/lead-finder': `Find Companies | ${tenant.brandName}`,
      '/company-list': `Company List | ${tenant.brandName}`,
      '/task-list': `Task List | ${tenant.brandName}`,
      '/receiving': `Receiving | ${tenant.brandName}`,
      '/action-os': `Task List | ${tenant.brandName}`,
      '/workspace': `Company List | ${tenant.brandName}`,
      '/book': `${tenant.bookCtaLabel} | ${tenant.brandName}`,
      '/login': `Login | ${tenant.brandName}`,
      '/signup': `Start Workspace | ${tenant.brandName}`,
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[normalizedPath] ?? `${tenant.brandName} | ${tenant.brandTagline}`
  }, [location.pathname, tenant.bookCtaLabel, tenant.brandName, tenant.brandTagline])

  return null
}
