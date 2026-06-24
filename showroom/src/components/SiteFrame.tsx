import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { normalizeHostname, supermegaPosHost } from '../lib/domainRouting'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { BrandLockup } from './Brand'

const navClassName = ({ isActive }: { isActive: boolean }) => `sm-site-nav-link ${isActive ? 'is-active' : ''}`.trim()

function SiteFrameContent() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const tenant = getTenantConfig()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const hostname = typeof window === 'undefined' ? '' : normalizeHostname(window.location.hostname)
  const isPosHost = hostname === supermegaPosHost || hostname === `www.${supermegaPosHost}`
  const authOnly = normalizedPath === '/login' || normalizedPath === '/signup' || normalizedPath === '/setup'
  const productCockpitOnly = tenant.key === 'default' && (normalizedPath === '/' || normalizedPath === '/products')
  const activeNavItems = tenant.key === 'default'
    ? [
        { label: 'Work', to: '/work/' },
        { label: 'Pricing', to: '/offers/' },
        { label: 'Products', to: '/products' },
      ]
    : tenant.navItems
  const visibleNavItems = activeNavItems.slice(0, 3)
  const hasVisibleNavItems = visibleNavItems.length > 0
  const primaryCta =
    tenant.key === 'default' ? { label: 'Contact', to: '/contact/' } : tenant.showBookCta ? { label: tenant.bookCtaLabel, to: '/contact' } : tenant.homePrimaryCta
  const footerLink = tenant.key === 'default' ? null : { label: 'Team login', to: '/login', external: false }
  const footerNavItems = visibleNavItems
  const brandLabel = tenant.key === 'default' ? '' : getTenantBrandLabel(tenant)

  if (isPosHost) {
    return (
      <main className="sm-auth-shell sm-pos-host-shell mx-auto w-full max-w-none" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    )
  }

  if (authOnly) {
    return (
      <main className="sm-auth-shell mx-auto w-full max-w-7xl px-4 py-6 lg:px-8" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    )
  }

  return (
    <div className={`sm-site-shell ${productCockpitOnly ? 'sm-site-shell-product-cockpit' : 'min-h-screen'} text-[var(--sm-ink)]`}>
      <a className="sm-skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="sm-site-header fixed inset-x-0 top-0 z-40">
        <nav className="sm-site-topbar mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
          <NavLink className="flex items-center gap-3" to="/">
            <BrandLockup
              markClassName="h-10 w-10"
              meta={brandLabel || tenant.brandTagline}
              wordmarkClassName="text-lg sm-site-wordmark"
            />
          </NavLink>
          {tenant.key === 'default' || hasVisibleNavItems ? (
            <button
              aria-controls="site-menu"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close site menu' : 'Open site menu'}
              className="sm-site-menu-button md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              Menu
            </button>
          ) : (
            <Link className="sm-button-primary sm-mobile-header-cta" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
          )}
          <div className="hidden items-center gap-2 md:flex">
            {visibleNavItems.map((item) => (
              item.to.includes('#') ? (
                <a className="sm-site-nav-link" href={item.to} key={item.to}>
                  {item.label}
                </a>
              ) : (
                <NavLink className={navClassName} key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              )
            ))}
            <Link className="sm-button-primary ml-2" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
          </div>
        </nav>
        {menuOpen ? (
          <div className="sm-site-menu-panel px-4 py-3 md:hidden" id="site-menu">
            <div className="flex flex-col gap-2">
              {visibleNavItems.map((item) => (
                item.to.includes('#') ? (
                  <a className="sm-site-nav-link" href={item.to} key={item.to} onClick={() => setMenuOpen(false)}>
                    {item.label}
                  </a>
                ) : (
                  <NavLink className={navClassName} key={item.to} onClick={() => setMenuOpen(false)} to={item.to}>
                    {item.label}
                  </NavLink>
                )
              ))}
              <Link className="sm-button-primary mt-2" onClick={() => setMenuOpen(false)} to={primaryCta.to}>
                {primaryCta.label}
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <main
        className={`mx-auto w-full max-w-7xl px-4 lg:px-8 ${productCockpitOnly ? 'pb-3 pt-20' : 'pb-20 pt-24'}`}
        id="main-content"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      {!productCockpitOnly ? <footer className="sm-site-footer">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-[var(--sm-muted)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>{tenant.key === 'default' ? 'SUPERMEGA.dev builds useful business software from one real workflow at a time.' : tenant.footerText}</p>
          <div className="flex flex-wrap gap-4">
            {footerNavItems.map((item) => (
              item.to.includes('#') ? (
                <a className="sm-link" href={item.to} key={item.to}>
                  {item.label}
                </a>
              ) : (
                <Link className="sm-link" key={item.to} to={item.to}>
                  {item.label}
                </Link>
              )
            ))}
            <Link className="sm-link" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
            {tenant.key === 'default' ? (
              <a className="sm-link" href="https://www.linkedin.com/in/theswanhtet" rel="noopener noreferrer" target="_blank">
                LinkedIn
              </a>
            ) : null}
            {footerLink ? (
              <Link className="sm-link" to={footerLink.to}>
                {footerLink.label}
              </Link>
            ) : null}
          </div>
        </div>
      </footer> : null}
    </div>
  )
}

export function SiteFrame() {
  return <SiteFrameContent />
}
