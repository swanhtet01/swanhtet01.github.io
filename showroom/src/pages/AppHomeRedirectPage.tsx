import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantLandingRoute } from '../lib/tenantRoleExperience'
import { getPlatformControlPlane, getWorkspaceSession, loadCachedWorkspaceSession, sessionHasCapability } from '../lib/workspaceApi'

function sessionLooksLikeDemo(session?: { workspace_slug?: string; workspace_name?: string; display_name?: string } | null) {
  const text = [session?.workspace_slug, session?.workspace_name, session?.display_name].filter(Boolean).join(' ').toLowerCase()
  return text.includes('supermega-demo') || text.includes('demo workspace')
}

async function getWorkspaceSessionWithTimeout(timeoutMs = 1800) {
  return await Promise.race([
    getWorkspaceSession(),
    new Promise<ReturnType<typeof loadCachedWorkspaceSession>>((resolve) => {
      setTimeout(() => resolve(loadCachedWorkspaceSession()), timeoutMs)
    }),
  ])
}

export function AppHomeRedirectPage() {
  const tenant = getTenantConfig()
  const [target, setTarget] = useState<string | null>(() => {
    const cachedSession = loadCachedWorkspaceSession()
    if (tenant.key !== 'ytf-plant-a' && cachedSession?.authenticated && sessionLooksLikeDemo(cachedSession.session)) {
      return '/app/start'
    }
    if (tenant.key === 'ytf-plant-a' && cachedSession?.authenticated) {
      return resolveTenantLandingRoute(tenant.key, cachedSession.session?.role)
    }
    return null
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await getWorkspaceSessionWithTimeout()
        if (cancelled) {
          return
        }

        if (payload && !payload.authenticated && payload.auth_required === false) {
          setTarget(resolveTenantLandingRoute(tenant.key, payload.session?.role))
          return
        }

        if (!payload?.authenticated) {
          setTarget('/login?next=/app')
          return
        }

        if (tenant.key !== 'ytf-plant-a' && sessionLooksLikeDemo(payload.session)) {
          setTarget('/app/start')
          return
        }

        const canManageWorkspace =
          sessionHasCapability(payload.session, 'tenant_admin.view') || sessionHasCapability(payload.session, 'platform_admin.view')

        if (canManageWorkspace && tenant.key !== 'ytf-plant-a') {
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

        setTarget(resolveTenantLandingRoute(tenant.key, payload.session?.role))
      } catch {
        if (!cancelled) {
          setTarget('/login?next=/app')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [tenant.key, tenant.siteMode])

  if (!target) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">{tenant.brandName}</p>
          <h1>Workspace check.</h1>
          <p>Checking your saved session and picking the right home.</p>
        </div>
      </section>
    )
  }

  return <Navigate replace to={target} />
}
