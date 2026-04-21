import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { BrandLockup } from './Brand'

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-white/10 text-white'
      : 'text-[var(--sm-muted)] hover:bg-white/6 hover:text-white'
  }`

export function SiteFrame() {
  const [menuOpen, setMenuOpen] = useState(false)
  const tenant = getTenantConfig()
  const activeNavItems = tenant.navItems
  const primaryCta =
    tenant.key === 'default' ? tenant.homePrimaryCta : tenant.showBookCta ? { label: tenant.bookCtaLabel, to: '/contact' } : tenant.homePrimaryCta
  const footerLink = tenant.key === 'default' ? null : { label: 'Team login', to: '/login', external: false }
  const footerNavItems = tenant.key === 'default' ? [] : activeNavItems
  const brandLabel = tenant.key === 'default' ? '' : getTenantBrandLabel(tenant)

  return (
    <div className="min-h-screen text-[var(--sm-ink)]">
      <a className="sm-skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-[rgba(4,8,16,0.72)] backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex items-center gap-3" to="/">
            <BrandLockup
              markClassName="h-10 w-10"
              meta={brandLabel || tenant.brandTagline}
              wordmarkClassName="text-lg text-white"
            />
          </NavLink>
          <button
            aria-controls="site-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close site menu' : 'Open site menu'}
            className="rounded-md border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            Menu
          </button>
          <div className="hidden items-center gap-2 md:flex">
            {activeNavItems.map((item) => (
              <NavLink className={navClassName} key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            <Link className="sm-button-primary ml-2" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
          </div>
        </nav>
        {menuOpen ? (
          <div className="border-t border-white/8 bg-[rgba(4,10,22,0.92)] px-4 py-3 backdrop-blur-xl md:hidden" id="site-menu">
            <div className="flex flex-col gap-2">
              {activeNavItems.map((item) => (
                <NavLink className={navClassName} key={item.to} onClick={() => setMenuOpen(false)} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
              <Link className="sm-button-primary mt-2" onClick={() => setMenuOpen(false)} to={primaryCta.to}>
                {primaryCta.label}
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-24 lg:px-8" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-white/8 bg-[rgba(4,8,16,0.82)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-[var(--sm-muted)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>{tenant.footerText}</p>
          <div className="flex flex-wrap gap-4">
            {footerNavItems.map((item) => (
              <Link className="sm-link" key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
            <Link className="sm-link" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
            {footerLink ? (
              <Link className="sm-link" to={footerLink.to}>
                {footerLink.label}
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  )
}
