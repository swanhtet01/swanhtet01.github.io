import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { YtfRoleScorecards, type YtfRoleScorecardRole } from '../components/YtfRoleScorecards'
import { getSeedDataFabricDataset, loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { productFocusLanes, resolveProductAppEntryRoute } from '../lib/demoSurfaces'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import {
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfPipelineStats,
  sessionHasCapability,
  type WorkspaceCapability,
  type YtfPipelineStatsResult,
} from '../lib/workspaceApi'

type SessionPayload = Awaited<ReturnType<typeof getWorkspaceSession>>

type StartAction = {
  label: string
  to: string
  detail: string
  badge: string
  requires?: WorkspaceCapability[]
}

type StartMetric = {
  label: string
  value: string
  detail: string
  to: string
}

async function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 1800) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

function hasAccess(session: SessionPayload['session'] | null | undefined, action: StartAction) {
  return !action.requires?.length || action.requires.some((capability) => sessionHasCapability(session, capability))
}

function formatCount(value: number | string | null | undefined) {
  const numeric = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(numeric) ? Number(numeric).toLocaleString() : '0'
}

function isExternalRoute(route: string) {
  return route.startsWith('https://') || route.startsWith('http://')
}

function PlatformProductHub() {
  const productCards = productFocusLanes
  const primaryProduct = productFocusLanes.find((product) => product.portalId === 'agentops-toolbox') ?? productFocusLanes[0]
  const primaryRoute = resolveProductAppEntryRoute(primaryProduct.portalId, primaryProduct.to)
  const productStats = [
    ['Templates', '4'],
    ['Sources', '6'],
    ['Gate', 'review'],
  ] as const

  return (
    <div className="sm-start-shell sm-product-hub-screen">
      <section className="sm-product-hub-board" aria-label="Product cockpit">
        <div className="sm-product-hub-title">
          <span>Client setup</span>
          <strong>Install the Back Office Workflow Desk</strong>
          <p>Pick one workflow, attach source samples, set the approval boundary, and launch a reviewed queue.</p>
        </div>
        <div className="sm-product-hub-stats" aria-label="Product status">
          {productStats.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {isExternalRoute(primaryRoute) ? (
          <a className="sm-product-hub-primary" href={primaryRoute} rel="noreferrer">
            <span>Start here</span>
            <strong>{primaryProduct.label}</strong>
            <small>{primaryProduct.modules.join(' / ')}</small>
          </a>
        ) : (
          <Link className="sm-product-hub-primary" to={primaryRoute}>
            <span>Start here</span>
            <strong>{primaryProduct.label}</strong>
            <small>{primaryProduct.modules.join(' / ')}</small>
          </Link>
        )}
      </section>

      <section className="sm-product-hub-grid" aria-label="Products">
        {productCards.map((product) => {
          const productRoute = resolveProductAppEntryRoute(product.portalId, product.to)
          if (isExternalRoute(productRoute)) {
            return (
              <a className="sm-product-hub-card" href={productRoute} key={`${product.portalId}-${product.label}`} rel="noreferrer">
                {'shot' in product && product.shot ? <img alt="" aria-hidden="true" src={product.shot} /> : null}
                <div>
                  <span>{product.badge}</span>
                  <strong>{product.label}</strong>
                  <p>{product.detail}</p>
                </div>
                <small>{product.modules.join(' / ')}</small>
              </a>
            )
          }
          return (
            <Link className="sm-product-hub-card" key={`${product.portalId}-${product.label}`} to={productRoute}>
              {'shot' in product && product.shot ? <img alt="" aria-hidden="true" src={product.shot} /> : null}
              <div>
                <span>{product.badge}</span>
                <strong>{product.label}</strong>
                <p>{product.detail}</p>
              </div>
              <small>{product.modules.join(' / ')}</small>
            </Link>
          )
        })}
      </section>
    </div>
  )
}

export function AppLaunchpadPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null)
  const [dataFabric, setDataFabric] = useState<DataFabricDataset>(() => getSeedDataFabricDataset())
  const [pipelineStats, setPipelineStats] = useState<YtfPipelineStatsResult | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const shouldLoadClientData = tenant.siteMode === 'client'
        const [nextSession, nextDataFabric, nextPipelineStats] = await Promise.all([
          withTimeout(getWorkspaceSession(), { authenticated: false, auth_required: true, session: null, workspaces: [] } as SessionPayload),
          shouldLoadClientData ? loadDataFabricDataset().catch(() => getSeedDataFabricDataset()) : Promise.resolve(getSeedDataFabricDataset()),
          shouldLoadClientData ? getYtfPipelineStats().catch(() => null) : Promise.resolve(null),
        ])

        if (cancelled) {
          return
        }

        setSessionPayload(nextSession)
        setDataFabric(nextDataFabric)
        setPipelineStats(nextPipelineStats)
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
  }, [tenant.siteMode])

  const session = sessionPayload?.session ?? null
  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const experience = useMemo(() => resolveTenantRoleExperience(tenant.key, session?.role), [session?.role, tenant.key])
  const startActions = useMemo(() => {
    const rows: StartAction[] = [
      {
        label: 'Open today',
        to: experience.defaultHome || '/app/actions',
        detail: experience.mission || 'Start from the screen made for this role.',
        badge: 'Start',
      },
      {
        label: 'Add update',
        to: '/app/daily-entry',
        detail: 'Save one issue, note, file, or handoff.',
        badge: 'Input',
        requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'receiving.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Check queue',
        to: '/app/action-board',
        detail: 'See what is waiting, who owns it, and what needs proof.',
        badge: 'Work',
        requires: ['actions.view', 'operations.view', 'dqms.view', 'maintenance.view', 'sales.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Review data',
        to: tenant.siteMode === 'client' ? '/app/live-data' : '/app/factory-operations',
        detail: tenant.siteMode === 'client' ? 'See changed files, records, and review tasks.' : 'Open the factory operations product.',
        badge: tenant.siteMode === 'client' ? 'Data' : 'Review',
        requires: ['sales.view', 'director.view', 'operations.view', 'dqms.view', 'maintenance.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Setup',
        to: '/app/platform-admin',
        detail: 'Manage users, roles, sources, and rollout settings.',
        badge: 'Admin',
        requires: ['tenant_admin.view', 'platform_admin.view'],
      },
    ]

    return rows.filter((item) => hasAccess(session, item)).slice(0, 4)
  }, [experience.defaultHome, experience.mission, session, tenant.siteMode])

  const primaryAction = startActions[0]
  const secondaryActions = startActions.slice(1)
  const scorecardRole: YtfRoleScorecardRole =
    sessionHasCapability(session, 'tenant_admin.view') || sessionHasCapability(session, 'platform_admin.view')
      ? 'admin'
      : sessionHasCapability(session, 'director.view')
        ? 'plant-manager'
        : 'manager'
  const sourceRecords = pipelineStats?.source_records?.count ?? dataFabric.learningDatabase.canonicalRecordCount
  const reviewTasks =
    pipelineStats?.source_changes?.promoted_task_count ??
    pipelineStats?.source_changes?.task_promotion?.review_task_count ??
    dataFabric.summary.openTaskCount
  const metricCards: StartMetric[] = [
    {
      label: 'Waiting',
      value: formatCount(dataFabric.summary.openTaskCount),
      detail: 'Open work',
      to: '/app/action-board',
    },
    {
      label: 'Decisions',
      value: formatCount(dataFabric.summary.pendingApprovalCount),
      detail: 'Need approval',
      to: '/app/approvals',
    },
    {
      label: tenant.siteMode === 'client' ? 'Records' : 'Proof',
      value: formatCount(tenant.siteMode === 'client' ? sourceRecords : reviewTasks),
        detail: tenant.siteMode === 'client' ? 'Source records' : 'Product proof',
      to: tenant.siteMode === 'client' ? '/app/live-data' : '/app/factory-operations',
    },
  ]

  if (tenant.siteMode === 'platform') {
    return <PlatformProductHub />
  }

  if (loading) {
    return (
      <section className="sm-start-shell">
        <div className="sm-start-loading">Opening app...</div>
      </section>
    )
  }

  return (
    <div className="sm-start-shell">
      <section className="sm-start-hero">
        <div className="sm-start-copy">
          <div className="flex flex-wrap gap-2">
            <span className="sm-status-pill">{getTenantBrandLabel(tenant)}</span>
            <span className="sm-status-pill">{capabilityProfile.label}</span>
          </div>
          <h1>Start here.</h1>
          <p>Open the next screen. Add one update. Check what is waiting.</p>
        </div>

        {primaryAction ? (
          <Link className="sm-start-primary-card" to={primaryAction.to}>
            <span>{primaryAction.badge}</span>
            <strong>{primaryAction.label}</strong>
            <p>{primaryAction.detail}</p>
            <em>Open</em>
          </Link>
        ) : null}
      </section>

      {secondaryActions.length ? (
        <section className="sm-start-action-grid" aria-label="Next actions">
          {secondaryActions.map((action) => (
            <Link className="sm-start-action-card" key={action.to} to={action.to}>
              <span>{action.badge}</span>
              <strong>{action.label}</strong>
              <p>{action.detail}</p>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="sm-start-metrics" aria-label="App status">
        {metricCards.map((metric) => (
          <Link className="sm-start-metric" key={metric.label} to={metric.to}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </Link>
        ))}
      </section>

      <YtfRoleScorecards
        role={scorecardRole}
        pipelineStats={pipelineStats}
        title="Your live scorecard."
        subtitle="Only the first facts this role needs: database state, actions, KPIs, and evidence."
      />
    </div>
  )
}
