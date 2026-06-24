import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantLandingRoute } from '../lib/tenantRoleExperience'
import { getPlatformControlPlane, getWorkspaceSession, sessionHasCapability } from '../lib/workspaceApi'

export function AppHomeRedirectPage() {
  const tenant = getTenantConfig()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await getWorkspaceSession()
        if (cancelled) {
          return
        }

        if (!payload.authenticated) {
          setTarget('/login?next=/app')
          return
        }

        const canManageWorkspace =
          sessionHasCapability(payload.session, 'tenant_admin.view') || sessionHasCapability(payload.session, 'platform_admin.view')
        const canUseLaunchpad =
          tenant.siteMode !== 'client' &&
          (canManageWorkspace ||
            sessionHasCapability(payload.session, 'director.view') ||
            sessionHasCapability(payload.session, 'agent_ops.view') ||
            sessionHasCapability(payload.session, 'architect.view'))

        if (canManageWorkspace) {
          try {
            const controlPlane = await getPlatformControlPlane()
            const enabledModuleCount = Number(controlPlane.modules?.enabled_count ?? 0)
            const memberCount = Number(controlPlane.members?.count ?? controlPlane.members?.rows?.length ?? 0)
            if (enabledModuleCount <= 0 || memberCount <= 1) {
              setTarget('/app/onboarding')
              return
            }
          } catch {
            // Fall back to role-based routing if the control plane is unavailable.
          }
        }

        if (canUseLaunchpad) {
          setTarget('/app/start')
          return
        }

        setTarget(resolveTenantLandingRoute(tenant.key, payload.session?.role))
      } catch {
        if (!cancelled) {
          setTarget(tenant.siteMode === 'client' ? '/app/portal' : '/app/meta')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [tenant.key, tenant.siteMode])

  if (!target) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening your workspace...</section>
  }

  return <Navigate replace to={target} />
}
