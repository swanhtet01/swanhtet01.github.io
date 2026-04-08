import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { getWorkspaceSession, logoutWorkspace } from '../lib/workspaceApi'

type SessionState = {
  display_name?: string
  role?: string
  workspace_name?: string
  workspace_slug?: string
}

type AppNavItem = {
  label: string
  note: string
  short: string
  to: string
}

type AppNavGroup = {
  label: string
  items: AppNavItem[]
}

const appNavGroups: AppNavGroup[] = [
  {
    label: 'Dev Desk',
    items: [
      { label: 'Dev Desk', note: 'Runtime, workspaces, and automations', short: 'DD', to: '/app/dev-desk' },
      { label: 'Data Linkage', note: 'Sources, exports, and visibility', short: 'DT', to: '/app/data' },
      { label: 'Portal Studio', note: 'Portal and rollout planning', short: 'PS', to: '/app/portal-studio' },
    ],
  },
  {
    label: 'HQ',
    items: [
      { label: 'HQ Review', note: 'Founder daily view', short: 'HQ', to: '/app/hq' },
    ],
  },
  {
    label: 'Teams',
    items: [
      { label: 'Deals', note: 'Revenue workspace', short: 'DL', to: '/app/deals' },
      { label: 'Workflow Queue', note: 'Tasks, approvals, and exceptions', short: 'WQ', to: '/app/workflows' },
    ],
  },
  {
    label: 'Runtime',
    items: [
      { label: 'Agent Ops', note: 'Loops, schedules, and runs', short: 'AG', to: '/app/agents' },
      { label: 'Company Log', note: 'Decisions and change record', short: 'CL', to: '/app/company' },
    ],
  },
] 

const allNavItems: AppNavItem[] = appNavGroups.flatMap((group) => group.items)

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `sm-app-rail-link ${isActive ? 'sm-app-rail-link-active' : ''}`

function findCurrentNav(pathname: string): AppNavItem {
  return (
    allNavItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ??
    allNavItems[0]
  )
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.12),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
        <div className="sm-app-loading-card">
          <p className="sm-kicker text-[var(--sm-accent)]">SUPERMEGA.dev</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Opening HQ workspace.</h1>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Loading the current team workspace, control plane, and queues.</p>
        </div>
      </div>
    </div>
  )
}

function SignInState({ pathname }: { pathname: string }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.12),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16">
        <div className="sm-app-loading-card max-w-2xl">
          <p className="sm-kicker text-[var(--sm-accent)]">Internal HQ</p>
          <h1 className="mt-3 text-4xl font-bold text-white">Login to open the internal workspace.</h1>
          <p className="mt-4 text-[var(--sm-muted)]">
            This is the private workspace for the founder and team. Use it for daily review, queues, data linkage, and automation control.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <NavLink className="sm-button-primary" to={`/login?next=${encodeURIComponent(pathname)}`}>
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

  const currentNav = useMemo(() => findCurrentNav(location.pathname), [location.pathname])

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
    return <LoadingState />
  }

  if (!authenticated) {
    return <SignInState pathname={location.pathname} />
  }

  return (
    <div className="sm-app-shell">
      <aside className="sm-app-rail">
        <div className="sm-app-rail-head">
          <NavLink className="sm-app-brand" to="/app/dev-desk">
            <span className="sm-app-brand-mark">SM</span>
            <div className="min-w-0">
              <p className="sm-app-brand-title">SUPERMEGA.dev</p>
              <p className="sm-app-brand-subtitle">Founder + team workspace</p>
            </div>
          </NavLink>

          <div className="sm-app-rail-status">
            <div className="sm-app-rail-status-item">
              <span>Workspace</span>
              <strong>{session?.workspace_name || 'SuperMega Lab'}</strong>
            </div>
            <div className="sm-app-rail-status-item">
              <span>User</span>
              <strong>{session?.display_name || 'User'}</strong>
            </div>
            <div className="sm-app-rail-status-item">
              <span>Role</span>
              <strong>{session?.role || 'member'}</strong>
            </div>
          </div>
        </div>

        <div className="sm-app-rail-scroll">
          {appNavGroups.map((group) => (
            <section className="sm-app-rail-group" key={group.label}>
              <p className="sm-app-rail-group-label">{group.label}</p>
              <nav className="sm-app-rail-nav">
                {group.items.map((item) => (
                  <NavLink className={navClassName} key={item.to} to={item.to}>
                    <span className="sm-app-rail-link-mark">{item.short}</span>
                    <span className="min-w-0">
                      <span className="sm-app-rail-link-title">{item.label}</span>
                      <span className="sm-app-rail-link-note">{item.note}</span>
                    </span>
                  </NavLink>
                ))}
              </nav>
            </section>
          ))}
        </div>

        <div className="sm-app-rail-foot">
          <div className="sm-app-rail-foot-meta">
            <span className="sm-status-pill">{session?.workspace_slug || 'default-workspace'}</span>
          </div>
          <div className="grid gap-2">
            <NavLink className="sm-button-secondary w-full" to="/">
              Public site
            </NavLink>
            <button className="sm-button-accent w-full" onClick={() => void handleLogout()} type="button">
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="sm-app-main">
        <header className="sm-app-topbar">
          <div className="sm-app-topbar-inner">
            <div className="sm-app-topbar-context">
              <p className="sm-kicker text-[var(--sm-accent)]">Internal HQ workspace</p>
              <h1>{currentNav.label}</h1>
              <p>{currentNav.note}</p>
            </div>
            <div className="sm-app-topbar-meta">
              <span className="sm-status-pill">{session?.workspace_name || 'SuperMega Lab'}</span>
              <span className="sm-status-pill">{session?.role || 'member'}</span>
            </div>
          </div>
        </header>

        <main className="sm-app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
