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
      '/work': `Work | ${tenant.brandName}`,
      '/systems': `Work | ${tenant.brandName}`,
      '/templates': `Work | ${tenant.brandName}`,
      '/find-companies': `Find clients | ${tenant.brandName}`,
      '/lead-finder': `Find clients | ${tenant.brandName}`,
      '/company-list': `Clean my list | ${tenant.brandName}`,
      '/task-list': `Task List | ${tenant.brandName}`,
      '/receiving-log': `Log receiving | ${tenant.brandName}`,
      '/receiving': `Log receiving | ${tenant.brandName}`,
      '/action-os': `Task List | ${tenant.brandName}`,
      '/workspace': `Clean my list | ${tenant.brandName}`,
      '/contact': `Contact | ${tenant.brandName}`,
      '/book': `Contact | ${tenant.brandName}`,
      '/login': `Login | ${tenant.brandName}`,
      '/signup': `Use with your team | ${tenant.brandName}`,
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[normalizedPath] ?? `${tenant.brandName} | ${tenant.brandTagline}`
  }, [location.pathname, tenant.brandName, tenant.brandTagline])

  return null
}
