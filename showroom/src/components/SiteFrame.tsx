import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { navItems } from '../content'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-cyan-400 text-slate-950 shadow-[0_14px_30px_-20px_rgba(22,190,219,0.9)]'
      : 'text-white/90 hover:bg-white/10'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen text-[var(--sm-ink)]">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[rgba(7,14,28,0.72)] backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex flex-col" to="/">
            <span className="text-lg font-extrabold tracking-tight text-white">SuperMega</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
              AI-native operations
            </span>
          </NavLink>
          <button
            className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white md:hidden"
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
              className="ml-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-[0_16px_30px_-20px_rgba(240,124,74,0.9)] transition hover:bg-orange-400"
              to="/contact?intent=discovery"
            >
              Book Pilot
            </NavLink>
          </div>
        </nav>
        {menuOpen ? (
          <div className="border-t border-white/10 bg-[rgba(7,14,28,0.82)] px-4 py-3 backdrop-blur-xl md:hidden">
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
                className="mt-1 rounded-full bg-orange-500 px-4 py-2 text-center text-sm font-bold text-white"
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

      <footer className="border-t border-white/10 bg-[rgba(8,14,26,0.72)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-300 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>AI agent products + real examples.</p>
          <p>supermega.dev</p>
        </div>
      </footer>
    </div>
  )
}
