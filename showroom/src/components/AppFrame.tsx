import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { getWorkspaceSession, logoutWorkspace } from '../lib/workspaceApi'

type SessionState = {
  display_name?: string
  role?: string
  workspace_name?: string
  workspace_slug?: string
}

const appNavItems = [
  { label: 'Queue', to: '/app/actions' },
  { label: 'Pipeline', to: '/app/leads' },
  { label: 'Receiving', to: '/app/receiving' },
  { label: 'Director', to: '/app/director' },
] as const

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
          <div className="sm-chip text-white">Loading private workspace...</div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.12),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-16">
          <div className="sm-surface-deep max-w-2xl p-8 text-center">
            <p className="sm-kicker text-[var(--sm-accent)]">Private app</p>
            <h1 className="mt-4 text-4xl font-extrabold text-white">Login to open the live workspace.</h1>
            <p className="mt-4 text-[var(--sm-muted)]">
              The public site explains the product. The app is where saved leads, actions, receiving, and inventory records actually live.
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,208,255,0.1),_transparent_30%),linear-gradient(180deg,#020611_0%,#07111f_40%,#07111f_100%)] text-[var(--sm-ink)]">
      <div className="border-b border-white/8 bg-[rgba(3,8,18,0.9)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <NavLink className="flex items-center gap-3" to="/app/actions">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(37,208,255,0.22)] bg-[rgba(37,208,255,0.08)] text-sm font-extrabold text-[var(--sm-accent)]">
                SM
              </span>
              <div>
                <p className="sm-logo text-lg font-extrabold tracking-tight text-white">SuperMega App</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">
                  {session?.workspace_name || 'Private workspace'}
                </p>
              </div>
            </NavLink>
            <span className="sm-status-pill hidden lg:inline-flex">
              {session?.display_name || 'User'} / {session?.role || 'member'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {appNavItems.map((item) => (
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
