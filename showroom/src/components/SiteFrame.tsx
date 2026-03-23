import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { navItems } from '../content'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-[var(--sm-accent)] text-white shadow-[0_10px_26px_-18px_rgba(13,110,112,0.85)]'
      : 'text-[var(--sm-ink)] hover:bg-white/80'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen text-[var(--sm-ink)]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-[var(--sm-line)]/70 bg-[rgba(255,251,242,0.84)] backdrop-blur-lg">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex flex-col" to="/">
            <span className="text-lg font-extrabold tracking-tight">SuperMega</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">
              AI-native operations
            </span>
          </NavLink>
          <button
            className="rounded-md border border-[var(--sm-line)] px-3 py-2 text-sm font-semibold md:hidden"
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
            <NavLink
              className="ml-2 rounded-full bg-[var(--sm-accent-alt)] px-4 py-2 text-sm font-bold text-white shadow-[0_16px_30px_-20px_rgba(202,93,41,0.8)] transition hover:bg-[#b84d1d]"
              to="/contact?intent=discovery"
            >
              Book Pilot
            </NavLink>
          </div>
        </nav>
        {menuOpen ? (
          <div className="border-t border-[var(--sm-line)] bg-[var(--sm-paper)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <NavLink
                  className={navClassName}
                  key={item.to}
                  onClick={() => setMenuOpen(false)}
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                className="mt-1 rounded-full bg-[var(--sm-accent-alt)] px-4 py-2 text-center text-sm font-bold text-white"
                onClick={() => setMenuOpen(false)}
                to="/contact?intent=discovery"
              >
                Book Pilot
              </NavLink>
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--sm-line)]/80 bg-[rgba(255,251,242,0.72)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-[var(--sm-muted)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>AI agent solutions for operations, suppliers, and quality.</p>
          <p>supermega.dev</p>
        </div>
      </footer>
    </div>
  )
}
