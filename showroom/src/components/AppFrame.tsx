import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { getTenantConfig } from '../lib/tenantConfig'
import { getCapabilityProfileForRole, getWorkspaceSession, logoutWorkspace, type WorkspaceCapability } from '../lib/workspaceApi'
import { BrandLockup } from './Brand'

type SessionState = {
  display_name?: string
  role?: string
  capabilities?: string[]
  workspace_name?: string
  workspace_slug?: string
}

type AppNavItem = {
  label: string
  to: string
  requires: WorkspaceCapability[]
  group: 'primary' | 'workstream' | 'runtime' | 'change'
}

const appNavItems: AppNavItem[] = [
  { label: 'Onboarding', to: '/app/onboarding', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'primary' },
  {
    label: 'Start',
    to: '/app/start',
    requires: [
      'actions.view',
      'sales.view',
      'operations.view',
      'director.view',
      'receiving.view',
      'approvals.view',
      'dqms.view',
      'maintenance.view',
      'agent_ops.view',
      'architect.view',
      'tenant_admin.view',
      'platform_admin.view',
    ],
    group: 'primary',
  },
  { label: 'Meta', to: '/app/meta', requires: ['actions.view'], group: 'primary' },
  { label: 'My Queue', to: '/app/actions', requires: ['actions.view'], group: 'primary' },
  { label: 'Revenue', to: '/app/revenue', requires: ['sales.view'], group: 'primary' },
  {
    label: 'Plant Manager',
    to: '/app/plant-manager',
    requires: ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'primary',
  },
  { label: 'Operations', to: '/app/operations', requires: ['operations.view'], group: 'primary' },
  { label: 'Director', to: '/app/director', requires: ['director.view'], group: 'primary' },
  { label: 'Receiving', to: '/app/receiving', requires: ['receiving.view'], group: 'workstream' },
  { label: 'Approvals', to: '/app/approvals', requires: ['approvals.view'], group: 'workstream' },
  { label: 'DQMS', to: '/app/dqms', requires: ['dqms.view'], group: 'workstream' },
  { label: 'Maintenance', to: '/app/maintenance', requires: ['maintenance.view'], group: 'workstream' },
  {
    label: 'Adoption',
    to: '/app/adoption-command',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Pilot',
    to: '/app/pilot',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  {
    label: 'Workforce',
    to: '/app/workforce',
    requires: ['actions.view', 'approvals.view', 'sales.view', 'receiving.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  { label: 'Insights', to: '/app/insights', requires: ['director.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'workstream' },
  {
    label: 'Service Desk',
    to: '/app/service-desk',
    requires: ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'workstream',
  },
  { label: 'Runtime', to: '/app/runtime', requires: ['agent_ops.view', 'connector_admin.view', 'knowledge_admin.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Cloud', to: '/app/cloud', requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'supermega.dev', to: '/app/supermega-dev', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  {
    label: 'Model Ops',
    to: '/app/model-ops',
    requires: ['agent_ops.view', 'architect.view', 'director.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'],
    group: 'runtime',
  },
  { label: 'Agent Space', to: '/app/agent-space', requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Connectors', to: '/app/connectors', requires: ['connector_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  {
    label: 'Data Fabric',
    to: '/app/data-fabric',
    requires: [
      'director.view',
      'tenant_admin.view',
      'platform_admin.view',
      'agent_ops.view',
      'sales.view',
      'operations.view',
      'approvals.view',
      'dqms.view',
      'maintenance.view',
      'receiving.view',
    ],
    group: 'runtime',
  },
  { label: 'Knowledge', to: '/app/knowledge', requires: ['knowledge_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Security', to: '/app/security', requires: ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Policies', to: '/app/policies', requires: ['security_admin.view', 'tenant_admin.view', 'platform_admin.view'], group: 'runtime' },
  { label: 'Workbench', to: '/app/workbench', requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'R&D', to: '/app/lab', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Agent Ops', to: '/app/teams', requires: ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Architect', to: '/app/architect', requires: ['architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Foundry', to: '/app/foundry', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Build', to: '/app/factory', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Product Ops', to: '/app/product-ops', requires: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'], group: 'change' },
  { label: 'Platform Admin', to: '/app/platform-admin', requires: ['tenant_admin.view', 'platform_admin.view'], group: 'change' },
]

const ROLE_PRIMARY_NAV: Record<string, string[]> = {
  member: ['/app/start', '/app/meta', '/app/actions'],
  operator: ['/app/start', '/app/meta', '/app/actions', '/app/revenue', '/app/operations'],
  manager: ['/app/start', '/app/meta', '/app/actions', '/app/revenue', '/app/operations', '/app/director'],
  owner: ['/app/start', '/app/onboarding', '/app/meta', '/app/director', '/app/revenue', '/app/operations'],
  tenant_admin: ['/app/start', '/app/onboarding', '/app/platform-admin', '/app/runtime', '/app/director'],
  platform_admin: ['/app/start', '/app/onboarding', '/app/platform-admin', '/app/runtime', '/app/teams'],
  director: ['/app/start', '/app/director', '/app/workbench', '/app/insights', '/app/approvals'],
  ceo: ['/app/start', '/app/onboarding', '/app/director', '/app/workbench', '/app/insights'],
  admin: ['/app/start', '/app/onboarding', '/app/platform-admin', '/app/runtime', '/app/director'],
  sales: ['/app/start', '/app/revenue', '/app/actions', '/app/approvals'],
  sales_lead: ['/app/start', '/app/revenue', '/app/actions', '/app/director', '/app/approvals'],
  operations: ['/app/start', '/app/plant-manager', '/app/operations', '/app/actions', '/app/dqms'],
  plant_manager: ['/app/start', '/app/plant-manager', '/app/operations', '/app/receiving', '/app/dqms'],
  receiving_clerk: ['/app/start', '/app/receiving', '/app/operations', '/app/actions', '/app/approvals'],
  procurement_lead: ['/app/start', '/app/approvals', '/app/receiving', '/app/actions', '/app/director'],
  quality: ['/app/start', '/app/dqms', '/app/operations', '/app/actions', '/app/director'],
  quality_manager: ['/app/start', '/app/plant-manager', '/app/dqms', '/app/operations', '/app/actions'],
  maintenance: ['/app/start', '/app/plant-manager', '/app/maintenance', '/app/operations', '/app/dqms'],
}

const PUBLIC_CLIENT_PREVIEW_NAV = [
  { label: 'Portal', to: '/app/portal' },
  { label: 'Plant Manager', to: '/app/plant-manager' },
  { label: 'Operations', to: '/app/operations' },
  { label: 'DQMS', to: '/app/dqms' },
  { label: 'Maintenance', to: '/app/maintenance' },
  { label: 'Data Fabric', to: '/app/data-fabric' },
] as const

function isCurrentPath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`)
}

function buildPrimaryNav(roleKey: string, visibleNavItems: AppNavItem[], pathname: string) {
  const orderedTargets = ROLE_PRIMARY_NAV[roleKey] ?? ROLE_PRIMARY_NAV.member
  const visibleWorkItems = visibleNavItems.filter((item) => item.group === 'primary')
  const byPath = new Map(visibleWorkItems.map((item) => [item.to, item]))
  const primary: AppNavItem[] = []

  for (const target of orderedTargets) {
    const item = byPath.get(target)
    if (item) {
      primary.push(item)
    }
  }

  const currentItem = visibleWorkItems.find((item) => isCurrentPath(pathname, item.to))
  if (currentItem && !primary.some((item) => item.to === currentItem.to)) {
    primary.unshift(currentItem)
  }

  for (const item of visibleWorkItems) {
    if (primary.length >= 4) {
      break
    }
    if (!primary.some((entry) => entry.to === item.to)) {
      primary.push(item)
    }
  }

  return primary
}

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl border px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? 'border-[rgba(123,196,176,0.24)] bg-[rgba(123,196,176,0.12)] text-white'
      : 'border-transparent text-[var(--sm-muted)] hover:border-white/10 hover:bg-white/6 hover:text-white'
  }`

const subnavClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
    isActive ? 'bg-[rgba(123,196,176,0.16)] text-white' : 'text-[var(--sm-muted)] hover:bg-white/6 hover:text-white'
  }`

export function AppFrame() {
  const location = useLocation()
  const tenant = getTenantConfig()
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
    const clientPreviewEnabled =
      tenant.siteMode === 'client' &&
      [...PUBLIC_CLIENT_PREVIEW_NAV.map((item) => item.to), '/app/manager-system'].some((route) => isCurrentPath(location.pathname, route))

    if (clientPreviewEnabled) {
      return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(123,196,176,0.08),_transparent_28%),linear-gradient(180deg,#0d141b_0%,#121a22_45%,#161e28_100%)] text-[var(--sm-ink)]">
          <a className="sm-skip-link" href="#app-main-content">
            Skip to content
          </a>
          <div className="border-b border-white/8 bg-[rgba(17,24,34,0.9)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div className="flex items-center gap-4">
                <NavLink className="flex items-center gap-3" to="/app/portal">
                  <BrandLockup
                    markClassName="h-11 w-11"
                    meta={tenant.tenantName || 'Tenant preview'}
                    wordmarkClassName="text-lg text-white"
                  />
                </NavLink>
                <span className="sm-status-pill hidden lg:inline-flex">Guest preview</span>
                <span className="sm-status-pill hidden xl:inline-flex">Seed mode with login required for live writeback</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {PUBLIC_CLIENT_PREVIEW_NAV.map((item) => (
                  <NavLink className={navClassName} key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
                <NavLink className="sm-button-primary" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
                  Login
                </NavLink>
                <NavLink className="sm-button-secondary" to="/">
                  Site
                </NavLink>
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8" id="app-main-content">
            <section className="mb-6 rounded-3xl border border-white/10 bg-[rgba(17,24,34,0.72)] px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Preview mode is open for the Yangon Tyre tenant surfaces.</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">
                    Use this host to review the portal, plant-manager flow, and seeded desks. Login unlocks live workspace data, permissions, and writeback.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="sm-status-pill">{tenant.brandName}</span>
                  <span className="sm-status-pill">{tenant.tenantName || 'Tenant'}</span>
                  <span className="sm-status-pill">Preview</span>
                </div>
              </div>
            </section>
            <Outlet />
          </main>
        </div>
      )
    }

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
  const tenantPortalItem: AppNavItem | null =
    tenant.siteMode === 'client'
      ? {
          label: 'Home',
          to: '/app/portal',
          requires: ['actions.view', 'sales.view', 'operations.view', 'director.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
          group: 'primary',
        }
      : null
  const navItems = tenantPortalItem ? [tenantPortalItem, ...appNavItems] : appNavItems
  const visibleNavItems = navItems.filter((item) => item.requires.some((capability) => capabilitySet.has(capability)))
  const basePrimaryNavItems = buildPrimaryNav(capabilityProfile.roleKey, visibleNavItems, location.pathname)
  const portalNavItem = visibleNavItems.find((item) => item.to === '/app/portal')
  const primaryNavItems =
    portalNavItem && !basePrimaryNavItems.some((item) => item.to === portalNavItem.to)
      ? [portalNavItem, ...basePrimaryNavItems].slice(0, 4)
      : basePrimaryNavItems
  const workstreamNavItems = visibleNavItems.filter((item) => item.group === 'workstream')
  const runtimeNavItems = visibleNavItems.filter((item) => item.group === 'runtime')
  const changeNavItems = visibleNavItems.filter((item) => item.group === 'change')
  const appHomeRoute = tenant.siteMode === 'client' ? '/app/portal' : '/app/start'
  const inRevenueWorkspace =
    location.pathname.startsWith('/app/revenue') || location.pathname.startsWith('/app/sales') || location.pathname.startsWith('/app/leads')
  const revenueSubnavItems = [
    capabilitySet.has('sales.view') ? { label: 'Desk', to: '/app/revenue' } : null,
    capabilitySet.has('sales.view') ? { label: 'Pipeline', to: '/app/revenue/pipeline' } : null,
    capabilitySet.has('sales.view') ? { label: 'Prospecting', to: '/app/revenue/prospecting' } : null,
    capabilitySet.has('actions.view') ? { label: 'Tasks', to: '/app/actions' } : null,
    capabilitySet.has('approvals.view') ? { label: 'Approvals', to: '/app/approvals' } : null,
  ].filter(Boolean) as Array<{ label: string; to: string }>

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(123,196,176,0.08),_transparent_28%),linear-gradient(180deg,#0d141b_0%,#121a22_45%,#161e28_100%)] text-[var(--sm-ink)]">
      <a className="sm-skip-link" href="#app-main-content">
        Skip to content
      </a>
      <div className="border-b border-white/8 bg-[rgba(17,24,34,0.9)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <NavLink className="flex items-center gap-3" to={appHomeRoute}>
              <BrandLockup
                markClassName="h-11 w-11"
                meta={session?.workspace_name || 'Tenant workspace'}
                wordmarkClassName="text-lg text-white"
              />
            </NavLink>
            <span className="sm-status-pill hidden lg:inline-flex">
              {session?.display_name || 'User'} / {capabilityProfile.label}
            </span>
            <span className="sm-status-pill hidden xl:inline-flex">
              {capabilityProfile.summary}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {primaryNavItems.map((item) => (
              <NavLink className={navClassName} key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            {workstreamNavItems.length ? (
              <details className="relative">
                <summary className="list-none rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sm-muted)] transition hover:bg-white/6 hover:text-white">
                  Workstreams
                </summary>
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-64 rounded-2xl border border-white/10 bg-[rgba(17,24,34,0.96)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="grid gap-1">
                    {workstreamNavItems.map((item) => (
                      <NavLink className={navClassName} key={item.to} to={item.to}>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}
            {runtimeNavItems.length ? (
              <details className="relative">
                <summary className="list-none rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sm-muted)] transition hover:bg-white/6 hover:text-white">
                  Runtime
                </summary>
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-64 rounded-2xl border border-white/10 bg-[rgba(17,24,34,0.96)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="grid gap-1">
                    {runtimeNavItems.map((item) => (
                      <NavLink className={navClassName} key={item.to} to={item.to}>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}
            {changeNavItems.length ? (
              <details className="relative">
                <summary className="list-none rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sm-muted)] transition hover:bg-white/6 hover:text-white">
                  Change
                </summary>
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-64 rounded-2xl border border-white/10 bg-[rgba(17,24,34,0.96)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="grid gap-1">
                    {changeNavItems.map((item) => (
                      <NavLink className={navClassName} key={item.to} to={item.to}>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}
            <NavLink className="sm-button-secondary ml-0 lg:ml-2" to="/">
              Public site
            </NavLink>
            <button className="sm-button-accent" onClick={() => void handleLogout()} type="button">
              Logout
            </button>
          </div>
        </div>
        {inRevenueWorkspace && revenueSubnavItems.length ? (
          <div className="border-t border-white/8 bg-[rgba(17,24,34,0.72)]">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Revenue</span>
              {revenueSubnavItems.map((item) => (
                <NavLink className={subnavClassName} key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 lg:px-8" id="app-main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
