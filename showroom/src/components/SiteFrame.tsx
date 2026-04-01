import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { navItems } from '../content'
import { appHref, hasLiveWorkspaceApp } from '../lib/workspaceApi'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-[rgba(37,208,255,0.12)] text-white shadow-[0_0_24px_rgba(37,208,255,0.1)]'
      : 'text-[var(--sm-muted)] hover:bg-white/6 hover:text-white'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)
  const liveAppAvailable = hasLiveWorkspaceApp()

  return (
    <div className="min-h-screen text-[var(--sm-ink)]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-[rgba(3,8,18,0.84)] backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex items-center gap-3" to="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(37,208,255,0.22)] bg-[rgba(37,208,255,0.08)] text-sm font-extrabold text-[var(--sm-accent)]">
              SM
            </span>
            <span className="flex flex-col">
              <span className="sm-logo text-lg font-extrabold tracking-tight text-white">SuperMega</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">
                Action OS
              </span>
            </span>
          </NavLink>
          <button
            className="rounded-md border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            Menu
          </button>
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink className={navClassName} key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            {liveAppAvailable ? (
              <>
                <a className="sm-button-primary ml-2" href={appHref('/signup/')}>
                  Start workspace
                </a>
                <a className="sm-button-secondary ml-2" href={appHref('/login/')}>
                  Open app
                </a>
              </>
            ) : (
              <NavLink className="sm-button-primary ml-2" to="/book">
                Book call
              </NavLink>
            )}
          </div>
        </nav>
        {menuOpen ? (
          <div className="border-t border-white/8 bg-[rgba(4,10,22,0.92)] px-4 py-3 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <NavLink className={navClassName} key={item.to} onClick={() => setMenuOpen(false)} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
              {liveAppAvailable ? (
                <>
                  <a className="sm-button-primary mt-1 text-center" href={appHref('/signup/')} onClick={() => setMenuOpen(false)}>
                    Start workspace
                  </a>
                  <a className="sm-button-secondary mt-1 text-center" href={appHref('/login/')} onClick={() => setMenuOpen(false)}>
                    Open app
                  </a>
                </>
              ) : (
                <NavLink className="sm-button-primary mt-1 text-center" onClick={() => setMenuOpen(false)} to="/book">
                  Book call
                </NavLink>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/8 bg-[rgba(4,10,22,0.78)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-[var(--sm-muted)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>Action OS runs the work. Lead Finder fills the pipeline.</p>
        </div>
      </footer>
    </div>
  )
}
