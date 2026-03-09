import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { navItems } from '../content'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#dbeafe_0%,#f8fafc_35%,#fef3c7_100%)] text-slate-900">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/60 bg-white/85 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="text-lg font-bold tracking-tight text-slate-900" to="/">
            SuperMega
          </NavLink>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold md:hidden"
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
          </div>
        </nav>
        {menuOpen ? (
          <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
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
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>AI agents and automation partner for Myanmar SMBs.</p>
          <p>SuperMega.dev | Yangon and remote delivery</p>
        </div>
      </footer>
    </div>
  )
}
