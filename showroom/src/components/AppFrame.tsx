import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { getCapabilityProfileForRole, getWorkspaceSession, logoutWorkspace, type WorkspaceCapability } from '../lib/workspaceApi'
import { BrandMark, BrandWordmark } from './Brand'

type SessionState = {
  display_name?: string
  role?: string
  capabilities?: string[]
  workspace_name?: string
  workspace_slug?: string
}

const appNavItems: Array<{ label: string; to: string; requires: WorkspaceCapability[] }> = [
  { label: 'My Queue', to: '/app/actions', requires: ['actions.view'] },
  { label: 'Sales', to: '/app/sales', requires: ['sales.view'] },
  { label: 'Receiving', to: '/app/receiving', requires: ['receiving.view'] },
  { label: 'Approvals', to: '/app/approvals', requires: ['approvals.view'] },
  { label: 'Agent Ops', to: '/app/teams', requires: ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Director', to: '/app/director', requires: ['director.view'] },
  { label: 'Architect', to: '/app/architect', requires: ['architect.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Factory', to: '/app/factory', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Connectors', to: '/app/connectors', requires: ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Knowledge', to: '/app/knowledge', requires: ['knowledge_admin.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Policies', to: '/app/policies', requires: ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'] },
  { label: 'Platform Admin', to: '/app/platform-admin', requires: ['tenant_admin.view', 'platform_admin.view'] },
]

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-[rgba(37,208,255,0.12)] text-white shadow-[0_0_24px_rgba(37,208,255,0.08)]'
      : 'text-[var(--sm-muted)] hover:bg-white/6 hover:text-white'
  }`

export function AppFrame() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [session, setSession] = useState<SessionState | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await getWorkspaceSession()
        if (cancelled) {
          return
        }
        setAuthenticated(Boolean(payload.authenticated))
        setSession(payload.session ?? null)
      } catch {
        if (!cancelled) {
          setAuthenticated(false)
          setSession(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  async function handleLogout() {
    try {
      await logoutWorkspace()
    } catch {
      // Keep the app usable even if logout fails server-side.
    } finally {
      window.location.href = '/login'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.12),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
          <div className="sm-chip text-white">Loading SUPERMEGA.dev...</div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.12),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16">
          <div className="sm-surface-deep max-w-2xl p-8 text-center">
            <p className="sm-kicker text-[var(--sm-accent)]">Control room</p>
            <h1 className="mt-4 text-4xl font-extrabold text-white">Login to open the operating layer.</h1>
            <p className="mt-4 text-[var(--sm-muted)]">
              The public site explains the tools. The app is where the saved queue, sales list, agent loops, and approvals live for the team.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <NavLink className="sm-button-primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
                Login
              </NavLink>
              <NavLink className="sm-button-secondary" to="/">
                Back to site
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const capabilityProfile = getCapabilityProfileForRole(session?.role)
  const declaredCapabilities = (session?.capabilities ?? []) as WorkspaceCapability[]
  const capabilitySet = new Set<WorkspaceCapability>([...capabilityProfile.capabilities, ...declaredCapabilities])
  const visibleNavItems = appNavItems.filter((item) => item.requires.some((capability) => capabilitySet.has(capability)))

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.1),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
      <div className="border-b border-white/8 bg-[rgba(3,8,18,0.9)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <NavLink className="flex items-center gap-3" to="/app/actions">
              <BrandMark className="h-11 w-11" />
              <div>
                <BrandWordmark className="text-lg text-white" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">
                  {session?.workspace_name || 'Tenant workspace'}
                </p>
              </div>
            </NavLink>
            <span className="sm-status-pill hidden lg:inline-flex">
              {session?.display_name || 'User'} / {capabilityProfile.label}
            </span>
            <span className="sm-status-pill hidden xl:inline-flex">
              {capabilityProfile.summary}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visibleNavItems.map((item) => (
              <NavLink className={navClassName} key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            <NavLink className="sm-button-secondary ml-0 lg:ml-2" to="/">
              Public site
            </NavLink>
            <button className="sm-button-accent" onClick={() => void handleLogout()} type="button">
              Logout
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
