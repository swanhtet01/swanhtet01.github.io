import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { navItems } from '../content'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-white/10 text-white'
      : 'text-[var(--sm-muted)] hover:bg-white/6 hover:text-white'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen text-[var(--sm-ink)]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-[rgba(4,8,16,0.72)] backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex items-center gap-3" to="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(37,208,255,0.22)] bg-[rgba(37,208,255,0.08)] text-sm font-extrabold text-[var(--sm-accent)]">
              SM
            </span>
            <span className="flex flex-col">
              <span className="sm-logo text-lg font-extrabold tracking-tight text-white">SuperMega</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Connected products for work.</span>
            </span>
          </NavLink>
          <button
            className="rounded-md border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            Menu
          </button>
          <div className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink className={navClassName} key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            <Link className="sm-button-primary ml-2" to="/contact">
              Start onboarding
            </Link>
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
              <Link className="sm-button-primary mt-2" onClick={() => setMenuOpen(false)} to="/contact">
                Start onboarding
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-24 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/8 bg-[rgba(4,8,16,0.82)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-[var(--sm-muted)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>Real products on one connected system for internal tools, client work, and your own workspace.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="sm-link" to="/platform">
              How it works
            </Link>
            <Link className="sm-link" to="/agents">
              Agents
            </Link>
            <Link className="sm-link" to="/products">
              Products
            </Link>
            <Link className="sm-link" to="/contact">
              Start onboarding
            </Link>
            <a className="sm-link" href="https://app.supermega.dev" rel="noreferrer" target="_blank">
              Team app
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
