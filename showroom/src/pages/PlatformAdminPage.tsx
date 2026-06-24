import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { YTF_APP_FOUNDRY_BLUEPRINTS } from '../lib/aiFoundryModel'
import { getAgentOperatingModel } from '../lib/agentOperatingModel'
import {
  BUILD_TEAMS,
  BUILD_WORKSPACES,
  INTERNAL_AGENT_CREWS,
  MODULE_PROGRAMS,
  RELEASE_GATES,
  RESEARCH_CELLS,
  RESEARCH_PRIORITIES,
  getInternalAgentCrewDetails,
} from '../lib/companyBuildingModel'
import {
  ENTERPRISE_META_TOOLS,
  ENTERPRISE_MODULE_FAMILIES,
  OPEN_SOURCE_STACK_LAYERS,
  WORKSPACE_FRAMEWORKS,
} from '../lib/enterprisePortalBlueprint'
import { getPlatformLayerGroups } from '../lib/platformStack'
import { buildTenantAppFoundryBoard, summarizeTenantAppFoundryBoard } from '../lib/tenantAppFoundryRuntime'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from '../lib/yangonTyreDriveModel'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import {
  getPlatformControlPlane,
  updateWorkspaceDomain,
  updateWorkspaceModuleStatus,
  verifyAllWorkspaceDomains,
  verifyWorkspaceDomain,
  workspaceFetch,
  type AuditEventRow,
  type PlatformControlPlanePayload,
  type WorkspaceDomainRow,
  type WorkspaceModuleRow,
} from '../lib/workspaceApi'
import { OPERATING_MODELS, SUPERMEGA_CORE_MODEL, getTenantOperatingModel } from '../lib/tenantOperatingModel'

type LaunchSnapshotPayload = {
  generated_at?: string
  rollout_id?: string
  workspace_snapshot_key?: string
  workspace?: {
    workspace_name?: string
    workspace_slug?: string
  }
  blueprint?: {
    primary_pack?: string
    wedge_product?: string
    recommended_modules?: Array<{ name?: string; reason?: string }>
    first_30_days?: string[]
  }
  task_summary?: {
    saved_count?: number
    saved_task_ids?: string[]
    live_total_count?: number
    live_open_count?: number
    live_done_count?: number
  }
  rollout_pack?: {
    rollout_id?: string
    recommended_modules?: string[]
    implementation_order?: string[]
    agent_teams?: string[]
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'No rollout saved yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function postureTone(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['live', 'enabled', 'release candidate'].includes(normalized)) {
    return 'text-emerald-300'
  }
  if (['mapped', 'queued', 'pilot', 'pilot hardening', 'crewed build', 'rollout ready'].includes(normalized)) {
    return 'text-amber-300'
  }
  if (['disabled', 'blueprint only', 'workflow mapped'].includes(normalized)) {
    return 'text-rose-300'
  }
  return 'text-white/70'
}

export function PlatformAdminPage() {
  const tenant = getTenantConfig()
  const currentModel = getTenantOperatingModel(tenant.key)
  const tenantAgentModel = useMemo(
    () => getAgentOperatingModel(tenant.key === 'ytf-plant-a' ? 'ytf-plant-a' : 'default'),
    [tenant.key],
  )
  const layerGroups = getPlatformLayerGroups()
  const otherModels = OPERATING_MODELS.filter((item) => item.id !== currentModel.id)
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [latestLaunch, setLatestLaunch] = useState<LaunchSnapshotPayload | null>(null)
  const [controlPlane, setControlPlane] = useState<PlatformControlPlanePayload | null>(null)
  const [controlPlaneError, setControlPlaneError] = useState<string | null>(null)
  const [moduleUpdateId, setModuleUpdateId] = useState('')
  const [domainDrafts, setDomainDrafts] = useState<Record<string, { desiredState: string; routeRoot: string; notes: string; deploymentUrl: string }>>({})
  const [domainUpdateId, setDomainUpdateId] = useState('')
  const [domainVerifyId, setDomainVerifyId] = useState('')
  const [verifyAllDomainsBusy, setVerifyAllDomainsBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open platform controls.',
        previewMessage: 'Platform controls are only available in the authenticated workspace.',
      })

      if (cancelled) {
        return
      }

      setAccess(nextAccess)

      if (nextAccess.authenticated && nextAccess.allowed) {
        try {
          const snapshot = await workspaceFetch<{ payload?: LaunchSnapshotPayload }>('/api/rollouts/latest')
          if (!cancelled) {
            setLatestLaunch(snapshot.payload ?? null)
          }
        } catch (error) {
          if (!cancelled && (error as Error & { status?: number }).status !== 404) {
            setLatestLaunch(null)
          }
        }

        try {
          const liveControlPlane = await getPlatformControlPlane()
          if (!cancelled) {
            setControlPlane(liveControlPlane)
            setControlPlaneError(null)
          }
        } catch {
          if (!cancelled) {
            setControlPlane(null)
            setControlPlaneError('Live control-plane data is not available on this host yet.')
          }
        }
      }
    }

    void loadAccess()

    return () => {
      cancelled = true
    }
  }, [])

  const modulePhaseMap = new Map<string, string>()
  for (const phase of currentModel.rolloutPhases) {
    for (const moduleName of phase.modules) {
      if (!modulePhaseMap.has(moduleName)) {
        modulePhaseMap.set(moduleName, phase.name)
      }
    }
  }

  async function handleModuleStatusChange(moduleId: string, status: 'enabled' | 'pilot' | 'disabled') {
    setModuleUpdateId(moduleId)
    setControlPlaneError(null)
    try {
      const payload = await updateWorkspaceModuleStatus(moduleId, { status })
      setControlPlane(payload.control_plane ?? null)
    } catch {
      setControlPlaneError('Could not update module status on this host.')
    } finally {
      setModuleUpdateId('')
    }
  }

  const liveModuleRows = useMemo(() => (controlPlane?.modules?.rows ?? []) as WorkspaceModuleRow[], [controlPlane?.modules?.rows])
  const liveDomainRows = useMemo(() => (controlPlane?.domains?.rows ?? []) as WorkspaceDomainRow[], [controlPlane?.domains?.rows])
  const liveAuditRows = useMemo(() => (controlPlane?.audit_events?.rows ?? []) as AuditEventRow[], [controlPlane?.audit_events?.rows])
  const ytfSourcePacks = tenant.key === 'ytf-plant-a' ? YANGON_TYRE_SOURCE_PACKS : []
  const ytfConnectorExpansion = tenant.key === 'ytf-plant-a' ? YANGON_TYRE_CONNECTOR_EXPANSION : []
  const tenantFoundryBoard = useMemo(
    () =>
      tenant.key === 'ytf-plant-a'
        ? buildTenantAppFoundryBoard(YTF_APP_FOUNDRY_BLUEPRINTS, liveModuleRows, [], tenantAgentModel.playbooks)
        : [],
    [liveModuleRows, tenant.key, tenantAgentModel.playbooks],
  )
  const tenantFoundrySummary = useMemo(() => summarizeTenantAppFoundryBoard(tenantFoundryBoard), [tenantFoundryBoard])
  const liveSourceCount = ytfSourcePacks.filter((item) => item.status === 'live').length
  const pendingSourceCount = ytfSourcePacks.filter((item) => item.status !== 'live').length
  const queuedConnectorCount = ytfConnectorExpansion.filter((item) => item.status === 'queued').length
  const mappedConnectorCount = ytfConnectorExpansion.filter((item) => item.status === 'mapped').length
  const nonEnabledModuleCount = liveModuleRows.filter((item) => String(item.workspace_status || '').trim().toLowerCase() !== 'enabled').length
  const dialecticAntithesis = [
    pendingSourceCount > 0 ? `${pendingSourceCount} source packs still need promotion into daily operating memory.` : null,
    queuedConnectorCount > 0 ? `${queuedConnectorCount} external channels still need connector rollout.` : null,
    nonEnabledModuleCount > 0 ? `${nonEnabledModuleCount} visible modules are not yet fully enabled for daily use.` : null,
    tenantFoundrySummary.releaseCandidateCount < tenantFoundryBoard.length
      ? `${tenantFoundryBoard.length - tenantFoundrySummary.releaseCandidateCount} app lines still need hardening before true release posture.`
      : null,
  ].filter(Boolean) as string[]

  useEffect(() => {
    if (!liveDomainRows.length) {
      return
    }
    setDomainDrafts((current) => {
      const next = { ...current }
      for (const row of liveDomainRows) {
        const domainId = String(row.domain_id || '').trim()
        if (!domainId || next[domainId]) {
          continue
        }
        next[domainId] = {
          desiredState: String(row.desired_state || '').trim(),
          routeRoot: String(row.route_root || '').trim(),
          notes: String(row.notes || '').trim(),
          deploymentUrl: String(row.deployment_url || '').trim(),
        }
      }
      return next
    })
  }, [liveDomainRows])

  function updateDomainDraft(domainId: string, patch: Partial<{ desiredState: string; routeRoot: string; notes: string; deploymentUrl: string }>) {
    setDomainDrafts((current) => ({
      ...current,
      [domainId]: {
        desiredState: patch.desiredState ?? current[domainId]?.desiredState ?? '',
        routeRoot: patch.routeRoot ?? current[domainId]?.routeRoot ?? '',
        notes: patch.notes ?? current[domainId]?.notes ?? '',
        deploymentUrl: patch.deploymentUrl ?? current[domainId]?.deploymentUrl ?? '',
      },
    }))
  }

  async function handleDomainSave(domain: WorkspaceDomainRow) {
    const domainId = String(domain.domain_id || '').trim()
    if (!domainId) {
      return
    }
    const draft = domainDrafts[domainId]
    setDomainUpdateId(domainId)
    setControlPlaneError(null)
    try {
      const payload = await updateWorkspaceDomain(domainId, {
        desiredState: draft?.desiredState ?? String(domain.desired_state || '').trim(),
        routeRoot: draft?.routeRoot ?? String(domain.route_root || '').trim(),
        notes: draft?.notes ?? String(domain.notes || '').trim(),
        deploymentUrl: draft?.deploymentUrl ?? String(domain.deployment_url || '').trim(),
        config: typeof domain.config === 'object' && domain.config ? domain.config : {},
      })
      setControlPlane(payload.control_plane ?? null)
    } catch {
      setControlPlaneError('Could not save workspace domain settings on this host.')
    } finally {
      setDomainUpdateId('')
    }
  }

  async function handleDomainVerify(domain: WorkspaceDomainRow) {
    const domainId = String(domain.domain_id || '').trim()
    if (!domainId) {
      return
    }
    setDomainVerifyId(domainId)
    setControlPlaneError(null)
    try {
      const payload = await verifyWorkspaceDomain(domainId, Array.isArray(domain.proof_paths) ? domain.proof_paths : [])
      setControlPlane(payload.control_plane ?? null)
    } catch {
      setControlPlaneError('Could not verify this domain on this host.')
    } finally {
      setDomainVerifyId('')
    }
  }

  async function handleVerifyAllDomains() {
    setVerifyAllDomainsBusy(true)
    setControlPlaneError(null)
    try {
      const payload = await verifyAllWorkspaceDomains()
      setControlPlane(payload.control_plane ?? null)
    } catch {
      setControlPlaneError('Could not verify the workspace domains on this host.')
    } finally {
      setVerifyAllDomainsBusy(false)
    }
  }

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Platform admin"
          title="Loading tenant control plane."
          description="Checking workspace access and loading the current operating model."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Platform admin"
          title="Authenticated workspace required."
          description="This control plane is reserved for the live internal workspace and does not render in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Platform controls are only available in the authenticated workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/platform-admin">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Open products
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Platform admin"
          title="Tenant-admin access required."
          description="This surface is for tenant configuration, connector governance, security posture, and internal factory control."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask a tenant admin or platform admin to grant the control-plane scopes for this workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/actions">
              Back to queue
            </Link>
            <Link className="sm-button-primary" to="/app/teams">
              Open Agent Ops
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Platform admin"
        title={`${currentModel.publicLabel} control plane`}
        description={`${currentModel.thesis} This surface turns the tenant model, build posture, connector posture, role system, and scaling gaps into one operator-facing control layer.`}
      />

      {access.error ? (
        <section className="sm-chip text-white">
          <p>{access.error}</p>
        </section>
      ) : null}

      {controlPlane?.tenant_state?.status &&
      controlPlane.tenant_state.status !== 'matched' &&
      controlPlane.tenant_state.status !== 'parallel' ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenant state</p>
          <h2 className="mt-2 text-2xl font-bold text-white">The workspace control plane is warning about tenant alignment.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{controlPlane.tenant_state.detail || 'Tenant alignment needs review.'}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            <span className="sm-chip text-white">Expected: {controlPlane.tenant_state.expected_tenant_key || 'unknown'}</span>
            <span className="sm-chip text-white">Live state: {controlPlane.tenant_state.current_state_tenant_key || 'not reported'}</span>
            <span className="sm-chip text-white">Persisted manifest: {controlPlane.tenant_state.persisted_manifest_tenant_key || 'not reported'}</span>
            <span className="sm-chip text-white">Snapshot: {controlPlane.tenant_state.snapshot_tenant_key || 'not reported'}</span>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenant</p>
          <p className="mt-3 text-2xl font-bold text-white">{currentModel.publicLabel}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Modules</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.modules.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Roles</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.roles.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connectors</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.connectors.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent pods</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.agentPods.length}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{BUILD_TEAMS.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Build workspaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{BUILD_WORKSPACES.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
          <p className="mt-3 text-3xl font-bold text-white">{RELEASE_GATES.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Program lanes</p>
          <p className="mt-3 text-3xl font-bold text-white">{MODULE_PROGRAMS.length}</p>
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Control shortcuts</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-3xl">Jump into the main runtime, build, and control areas.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/runtime">
              Runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/factory">
              Build
            </Link>
            <Link className="sm-button-secondary" to="/app/product-ops">
              Product Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/insights">
              Insights
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Agent Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/security">
              Security
            </Link>
            <Link className="sm-button-secondary" to="/app/connectors">
              Connectors
            </Link>
            <Link className="sm-button-secondary" to="/app/knowledge">
              Knowledge
            </Link>
            <Link className="sm-button-secondary" to="/app/policies">
              Policies
            </Link>
          </div>
        </div>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout operating frame</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Current operating shape, rollout drag, and admin response for Yangon Tyre.</h2>
            <div className="mt-6 grid gap-3">
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Operating intent</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{currentModel.thesis}</p>
              </article>
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Current drag</p>
                <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                  {dialecticAntithesis.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                  {dialecticAntithesis.length === 0 ? <p>The current tenant has no visible unresolved structural conflict in this view.</p> : null}
                </div>
              </article>
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Admin response</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">
                  One tenant kernel joins source packs, connector rollout, app foundry posture, module promotion, and role governance into the same control plane.
                </p>
                <p className="mt-3 text-sm text-white/80">
                  {liveSourceCount} live source packs, {tenantFoundrySummary.releaseCandidateCount} release-candidate app lines, {controlPlane?.modules?.enabled_count ?? 0} enabled modules.
                </p>
              </article>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Enterprise rollout posture</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Admin should see what can scale, what is mapped, and what is still queued.</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Source packs</p>
                <p className="mt-2 text-2xl font-bold">{liveSourceCount}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pendingSourceCount} still mapped or queued.</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector expansion</p>
                <p className="mt-2 text-2xl font-bold">{queuedConnectorCount}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{mappedConnectorCount} mapped before activation.</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">App line readiness</p>
                <p className="mt-2 text-2xl font-bold">{tenantFoundrySummary.averageReadiness}%</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {tenantFoundrySummary.releaseCandidateCount} release candidate, {tenantFoundrySummary.pilotHardeningCount} pilot hardening.
                </p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Module promotion</p>
                <p className="mt-2 text-2xl font-bold">{nonEnabledModuleCount}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Visible modules not yet fully enabled.</p>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Latest rollout pack</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Carry the architect launch into the control plane.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved at</p>
              <p className="mt-2 text-sm">{formatDateTime(latestLaunch?.generated_at)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace</p>
              <p className="mt-2 text-sm">{latestLaunch?.workspace?.workspace_name || currentModel.publicLabel}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Open tasks</p>
              <p className="mt-2 text-2xl font-bold">{latestLaunch?.task_summary?.live_open_count ?? 0}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout ID</p>
              <p className="mt-2 text-sm">{latestLaunch?.rollout_id || 'No rollout yet'}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Created / done</p>
              <p className="mt-2 text-sm">
                {latestLaunch?.task_summary?.saved_count ?? 0} created · {latestLaunch?.task_summary?.live_done_count ?? 0} done
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {latestLaunch?.rollout_pack?.recommended_modules?.length ? (
              latestLaunch.rollout_pack.recommended_modules.slice(0, 6).map((moduleName) => (
                <div className="sm-chip text-white" key={moduleName}>
                  {moduleName}
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">Use Solution Architect to save a rollout pack and queue launch work for this tenant.</div>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/architect">
              Open Architect
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open rollout tasks
            </Link>
            <Link className="sm-button-secondary" to="/app/meta">
              Open Meta
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout next moves</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Keep launch discipline visible.</h2>
          <div className="mt-6 grid gap-3">
            {(latestLaunch?.blueprint?.first_30_days ?? []).length ? (
              (latestLaunch?.blueprint?.first_30_days ?? []).map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))
            ) : (
              currentModel.rolloutPhases.map((phase) => (
                <div className="sm-chip text-white" key={phase.id}>
                  {phase.name}: {phase.outcome}
                </div>
              ))
            )}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Primary pack</p>
              <p className="mt-2 text-sm">{latestLaunch?.blueprint?.primary_pack || currentModel.publicLabel}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Wedge</p>
              <p className="mt-2 text-sm">{latestLaunch?.blueprint?.wedge_product || 'Action OS'}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live control plane</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Operate real tenant modules, not just the model.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <span className="sm-status-pill">{controlPlane?.workspace?.workspace_name || currentModel.publicLabel}</span>
              <span className="sm-status-pill">{controlPlane?.workspace?.role || access.roleLabel}</span>
            </div>
          </div>

          {controlPlaneError ? (
            <div className="mt-4 sm-chip text-white">
              <p>{controlPlaneError}</p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Catalog</p>
              <p className="mt-2 text-2xl font-bold">{controlPlane?.catalog?.module_count ?? currentModel.modules.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Enabled</p>
              <p className="mt-2 text-2xl font-bold">{controlPlane?.modules?.enabled_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Pilot</p>
              <p className="mt-2 text-2xl font-bold">{controlPlane?.modules?.pilot_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Members</p>
              <p className="mt-2 text-2xl font-bold">{controlPlane?.members?.count ?? 0}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {liveModuleRows.slice(0, 8).map((module) => {
              const busy = moduleUpdateId === module.module_id
              return (
                <article className="sm-proof-card" key={module.module_id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{module.name}</p>
                        <span className="sm-status-pill">{module.category}</span>
                        <span className="sm-status-pill">{module.workspace_status}</span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.summary}</p>
                      <p className="mt-2 text-sm text-white/80">Maturity: {module.maturity}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:border-[var(--sm-accent)] disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void handleModuleStatusChange(module.module_id, 'enabled')}
                        type="button"
                      >
                        Enable
                      </button>
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:border-[var(--sm-accent-alt)] disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void handleModuleStatusChange(module.module_id, 'pilot')}
                        type="button"
                      >
                        Pilot
                      </button>
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void handleModuleStatusChange(module.module_id, 'disabled')}
                        type="button"
                      >
                        Disable
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3">
                    {module.route ? (
                      <Link className="sm-link" to={module.route}>
                        Open module
                      </Link>
                    ) : (
                      <span className="text-sm text-[var(--sm-muted)]">No live route yet</span>
                    )}
                    <span className="text-sm text-white/70">Source: {module.source || 'default'}</span>
                    {busy ? <span className="text-sm text-white/70">Updating…</span> : null}
                  </div>
                </article>
              )
            })}

            {!liveModuleRows.length ? (
              <div className="sm-chip text-[var(--sm-muted)]">Live module assignments are not available yet on this host.</div>
            ) : null}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Members and audit</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The tenant kernel needs visible people and change history.</h2>

          <div className="mt-6 space-y-3">
            {((controlPlane?.members?.rows ?? []) as Array<{ display_name?: string; email?: string; role?: string; status?: string }>).slice(0, 6).map((member) => (
              <div className="sm-chip text-white" key={`${member.email}-${member.role}`}>
                <p className="font-semibold">{member.display_name || member.email || 'Member'}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {(member.email || '').trim() || 'No email'} · {member.role || 'member'} · {member.status || 'active'}
                </p>
              </div>
            ))}
            {!controlPlane?.members?.rows?.length ? <div className="sm-chip text-[var(--sm-muted)]">No live member records returned yet.</div> : null}
          </div>

          <div className="mt-8 space-y-3">
            <p className="sm-kicker text-[var(--sm-accent)]">Recent audit events</p>
            {liveAuditRows.slice(0, 6).map((event) => (
              <article className="sm-chip text-white" key={event.event_id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{event.summary}</p>
                  <span className="sm-status-pill">{event.severity || 'info'}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {(event.actor || 'system').trim() || 'system'} · {event.event_type || 'event'} · {formatDateTime(event.created_at)}
                </p>
                {event.detail ? <p className="mt-2 text-sm text-white/80">{event.detail}</p> : null}
              </article>
            ))}
            {!liveAuditRows.length ? <div className="sm-chip text-[var(--sm-muted)]">Audit history will appear here as live tenant actions are recorded.</div> : null}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Domains and routes</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Keep each workspace hostname explicit, verified, and tied to the right runtime lane.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="sm-status-pill">{controlPlane?.domains?.count ?? liveDomainRows.length} domains</span>
            <span className="sm-status-pill">{controlPlane?.domains?.ready_count ?? 0} ready</span>
            <button className="sm-button-secondary" disabled={verifyAllDomainsBusy || !liveDomainRows.length} onClick={() => void handleVerifyAllDomains()} type="button">
              {verifyAllDomainsBusy ? 'Verifying...' : 'Verify all domains'}
            </button>
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {liveDomainRows.map((domain) => {
            const domainId = String(domain.domain_id || '').trim()
            const draft = domainDrafts[domainId] ?? {
              desiredState: String(domain.desired_state || '').trim(),
              routeRoot: String(domain.route_root || '').trim(),
              notes: String(domain.notes || '').trim(),
              deploymentUrl: String(domain.deployment_url || '').trim(),
            }
            const busy = domainUpdateId === domainId
            const verifying = domainVerifyId === domainId
            return (
              <article className="sm-proof-card" key={domainId || domain.hostname}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{domain.display_name || domain.hostname}</p>
                      <span className="sm-status-pill">{domain.scope}</span>
                      <span className="sm-status-pill">{domain.provider}</span>
                      <span className="sm-status-pill">{domain.runtime_target}</span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{domain.hostname}</p>
                    <p className="mt-2 text-sm text-white/80">Verified: {formatDateTime(domain.verified_at || undefined)}</p>
                    {domain.deployment_url ? (
                      <a className="sm-link mt-2 inline-flex" href={domain.deployment_url} rel="noreferrer" target="_blank">
                        Open deployment target
                      </a>
                    ) : domain.live_url ? (
                      <a className="sm-link mt-2 inline-flex" href={domain.live_url} rel="noreferrer" target="_blank">
                        Open live host
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="sm-status-pill">DNS {domain.dns_status || 'unknown'}</span>
                    <span className="sm-status-pill">TLS {domain.tls_status || 'unknown'}</span>
                    <span className="sm-status-pill">HTTP {domain.http_status || 'unknown'}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="sm-chip text-white">
                    <span className="sm-kicker text-[var(--sm-accent)]">Desired state</span>
                    <input
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                      onChange={(event) => updateDomainDraft(domainId, { desiredState: event.target.value })}
                      type="text"
                      value={draft.desiredState}
                    />
                  </label>
                  <label className="sm-chip text-white">
                    <span className="sm-kicker text-[var(--sm-accent-alt)]">Route root</span>
                    <input
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                      onChange={(event) => updateDomainDraft(domainId, { routeRoot: event.target.value })}
                      type="text"
                      value={draft.routeRoot}
                    />
                  </label>
                  <label className="sm-chip text-white">
                    <span className="sm-kicker text-[var(--sm-accent)]">Deployment URL</span>
                    <input
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                      onChange={(event) => updateDomainDraft(domainId, { deploymentUrl: event.target.value })}
                      type="text"
                      value={draft.deploymentUrl}
                    />
                  </label>
                  <label className="sm-chip text-white">
                    <span className="sm-kicker text-[var(--sm-accent-alt)]">Notes</span>
                    <input
                      className="mt-3 w-full bg-transparent text-sm text-white outline-none"
                      onChange={(event) => updateDomainDraft(domainId, { notes: event.target.value })}
                      type="text"
                      value={draft.notes}
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="sm-button-secondary" disabled={busy} onClick={() => void handleDomainSave(domain)} type="button">
                    {busy ? 'Saving...' : 'Save'}
                  </button>
                  <button className="sm-button-secondary" disabled={verifying} onClick={() => void handleDomainVerify(domain)} type="button">
                    {verifying ? 'Verifying...' : 'Verify'}
                  </button>
                  {(domain.proof_paths ?? []).length ? (
                    <span className="text-sm text-[var(--sm-muted)]">Proof paths: {(domain.proof_paths ?? []).join(', ')}</span>
                  ) : null}
                </div>
              </article>
            )
          })}

          {!liveDomainRows.length ? <div className="sm-chip text-[var(--sm-muted)]">Workspace domain posture is not available on this host yet.</div> : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Build workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The internal factory needs explicit rooms with owners and review loops.</h2>
          <div className="mt-6 grid gap-3">
            {BUILD_WORKSPACES.map((workspace) => (
              <article className="sm-proof-card" key={workspace.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{workspace.name}</p>
                  <span className="sm-status-pill">{workspace.reviewCadence}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Surfaces: {workspace.surfaces.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Release gates</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Promotion rules keep pilots from being mislabeled as products.</h2>
          <div className="mt-6 grid gap-3">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-chip text-white" key={gate.id}>
                <p className="font-semibold">{gate.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-2 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Enterprise modules</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The control plane needs explicit module families and operating functions.</h2>
          <div className="mt-6 grid gap-3">
            {ENTERPRISE_MODULE_FAMILIES.map((family) => (
              <article className="sm-proof-card" key={family.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{family.name}</p>
                  <span className="sm-status-pill">{family.products.length} products</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{family.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Functions: {family.functions.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Meta tools: {family.metaTools.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Meta tools</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Admin, knowledge, policy, and metrics should be first-class products.</h2>
          <div className="mt-6 grid gap-3">
            {ENTERPRISE_META_TOOLS.map((tool) => (
              <article className="sm-chip text-white" key={tool.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{tool.name}</p>
                  <Link className="sm-link" to={tool.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{tool.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Functions: {tool.functions.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Roles: {tool.roles.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Current posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">What is already wired into the platform</h2>
          <div className="mt-6 grid gap-3">
            {SUPERMEGA_CORE_MODEL.foundationSignals.map((signal) => (
              <article className="sm-proof-card" key={signal.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{signal.name}</p>
                  <span className="sm-status-pill">{signal.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{signal.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Architecture gaps</p>
          <h2 className="mt-3 text-3xl font-bold text-white">What still blocks a true multi-tenant AI-native runtime</h2>
          <div className="mt-6 grid gap-3">
            {SUPERMEGA_CORE_MODEL.gaps.map((gap) => (
              <article className="sm-chip text-white" key={gap.id}>
                <p className="font-semibold">{gap.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gap.risk}</p>
                <p className="mt-2 text-sm text-white/80">{gap.nextMove}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Platform layers</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The control plane is organized around reusable layers.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Each tenant should inherit these shared layers, then enable only the modules and permissions that fit the company.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {layerGroups.map((group) => (
            <article className="sm-chip text-white" key={group.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{group.name}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{group.summary}</p>
              <p className="mt-3 text-sm text-white/80">{group.capabilities.length} capabilities mapped</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace frameworks</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Shared workspace patterns make tenant setups reusable.</h2>
          <div className="mt-6 grid gap-3">
            {WORKSPACE_FRAMEWORKS.map((framework) => (
              <article className="sm-proof-card" key={framework.id}>
                <p className="font-semibold text-white">{framework.name}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{framework.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Surfaces: {framework.surfaces.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Controls: {framework.controls.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open-source layers</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The stack should be named, inspectable, and reusable across modules.</h2>
          <div className="mt-6 grid gap-3">
            {OPEN_SOURCE_STACK_LAYERS.map((layer) => (
              <article className="sm-chip text-white" key={layer.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{layer.name}</p>
                  <span className="sm-status-pill">{layer.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{layer.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Tools: {layer.tools.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Internal build teams</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The company-builder side needs visible ownership and workspaces.</h2>
          <div className="mt-6 grid gap-3">
            {BUILD_TEAMS.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{team.name}</p>
                  <span className="sm-status-pill">{team.workspace}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-3 text-sm text-white/80">Owns: {team.ownership.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {team.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Agent crews: {team.agentPods.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Success: {team.metric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Program lanes</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Track category-level bets like actual product lines.</h2>
            <div className="mt-6 grid gap-3">
              {MODULE_PROGRAMS.map((program) => {
                const crewDetails = getInternalAgentCrewDetails(program.agentCrews)
                return (
                  <article className="sm-chip text-white" key={program.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{program.name}</p>
                      <span className="sm-status-pill">{program.stage}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
                    <p className="mt-2 text-sm text-white/80">Market: {program.market}</p>
                    <p className="mt-2 text-sm text-white/80">Owner: {program.owner}</p>
                    <p className="mt-2 text-sm text-white/80">Research cell: {program.researchCell}</p>
                    <p className="mt-2 text-sm text-white/80">Starter wedge: {program.starterWedge}</p>
                    <p className="mt-2 text-sm text-white/80">Tenant proof: {program.tenantProof}</p>
                    <p className="mt-2 text-sm text-white/80">Modules: {program.modules.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
                    <div className="mt-2 text-sm text-white/80">
                      <p className="font-semibold text-white/70">Agent crews</p>
                      <div className="mt-1 space-y-1">
                        {crewDetails.map((crew) => (
                          <p key={crew.id}>
                            {crew.name} · {crew.workspace}
                          </p>
                        ))}
                        {crewDetails.length === 0 ? <p className="text-[var(--sm-muted)]">No agent crew assigned yet.</p> : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-white/80">
                      <p className="font-semibold text-[var(--sm-accent)]">Success signals</p>
                      {program.successSignals.map((signal) => (
                        <p key={signal}>{signal}</p>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-white/80">Next releases: {program.nextReleases.join(', ')}</p>
                  </article>
                )
              })}
            </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research cells</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Product discipline rests on focused research cells.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Each cell owns a signal set, a mandate, and a set of outputs so the modules and connectors deliver on measurable promises instead of vague innovation.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {RESEARCH_CELLS.map((cell) => (
            <article className="sm-demo-link sm-demo-link-card" key={cell.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{cell.ownedBy}</span>
                <span className="sm-status-pill">{cell.supports.join(' / ')}</span>
              </div>
              <strong>{cell.name}</strong>
              <span>{cell.mandate}</span>
              <small className="text-[var(--sm-muted)]">Inputs: {cell.inputs.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Outputs: {cell.outputs.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product program health</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Treat product lines like real releases.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/runtime">
              Open Runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/factory">
              Open Build
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={`health-${program.id}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-3 text-sm text-white/80">Tenant proof: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/80">Modules: {program.modules.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/80">Agent crews: {program.agentCrews.join(', ')}</p>
              <div className="mt-2 space-y-1 text-sm text-white/80">
                <p className="font-semibold text-[var(--sm-accent)]">Success signals</p>
                {program.successSignals.map((signal) => (
                  <p key={signal}>{signal}</p>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/80">Next move: {program.nextMove}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Internal AI crews</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Delegation should be persistent, scoped, and reviewable.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These internal crews keep research, prototype review, connector health, knowledge quality, and release discipline moving between human decisions.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {INTERNAL_AGENT_CREWS.map((crew) => (
            <article className="sm-proof-card" key={crew.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{crew.name}</p>
                <span className="sm-status-pill">{crew.workspace}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
              <p className="mt-3 text-sm text-white/80">Read: {crew.readScope.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Write: {crew.writeScope.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Cadence: {crew.cadence}</p>
              <p className="mt-2 text-sm text-white/80">Approval: {crew.approvalGate}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Module enablement matrix</p>
          <h2 className="mt-3 text-3xl font-bold text-white">See what is enabled, who uses it, and which phase it belongs to.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.modules.map((module) => (
              <article className="sm-proof-card" key={module.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-white">{module.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="sm-status-pill">{module.status}</span>
                    <span className="sm-status-pill">{modulePhaseMap.get(module.name) || 'Always-on layer'}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.summary}</p>
                <p className="mt-3 text-sm text-white/80">Users: {module.users.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Controls: {module.controls.join(', ')}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {module.route ? (
                    <Link className="sm-link" to={module.route}>
                      Open module
                    </Link>
                  ) : (
                    <span className="text-sm text-[var(--sm-muted)]">No app route yet</span>
                  )}
                  <span className="text-sm text-white/70">Data: {module.dataFlows.join(', ')}</span>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Role matrix</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Role homes, scopes, and security zones for this tenant.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.roles.map((role) => (
              <article className="sm-chip text-white" key={role.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{role.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="sm-status-pill">{role.defaultHome}</span>
                    {role.id === access.roleKey ? <span className="sm-status-pill">Current session role</span> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{role.summary}</p>
                <p className="mt-2 text-sm text-white/80">Capabilities: {role.capabilities.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Security zones: {role.securityZones.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Workspaces: {role.workspaces.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Current tenant controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Roles, zones, and connectors for {currentModel.publicLabel}</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.roles.map((role) => (
              <article className="sm-proof-card" key={role.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{role.name}</p>
                  <span className="sm-status-pill">{role.workspaces.join(', ')}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{role.summary}</p>
                <p className="mt-3 text-sm text-white/80">Capabilities: {role.capabilities.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector mesh</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Every tenant gets an explicit source map.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.connectors.map((connector) => (
              <article className="sm-chip text-white" key={connector.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{connector.name}</p>
                  <span className="sm-status-pill">{connector.cadence}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.scope}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {connector.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Writeback: {connector.writeBack}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Source governance</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Real Yangon Tyre source packs should be promoted deliberately.</h2>
            <div className="mt-6 grid gap-3">
              {ytfSourcePacks.map((pack) => (
                <article className="sm-proof-card" key={pack.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{pack.name}</p>
                    <span className={`sm-status-pill ${postureTone(pack.status)}`}>{pack.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.evidence}</p>
                  <p className="mt-2 text-sm text-white/80">Feeds: {pack.feedsApps.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Why it matters: {pack.note}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector expansion governance</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Website, analytics, social, chat, and shopfloor inputs should land through one tenant contract.</h2>
            <div className="mt-6 grid gap-3">
              {ytfConnectorExpansion.map((item) => (
                <article className="sm-chip text-white" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{item.name}</p>
                    <span className={`sm-status-pill ${postureTone(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.purpose}</p>
                  <p className="mt-2 text-sm text-white/80">Apps: {item.apps.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">First jobs: {item.firstJobs.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Platform pods</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Named platform teams should keep the runtime and launches moving.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.platformTeams.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{team.name}</p>
                  <span className="sm-status-pill">{team.workspace}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-3 text-sm text-white/80">Scope: {team.scope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Success: {team.successMetric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout phases</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Every tenant and every shared layer needs a visible graduation path.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.rolloutPhases.map((phase) => (
              <article className="sm-chip text-white" key={phase.id}>
                <p className="font-semibold">{phase.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{phase.outcome}</p>
                <p className="mt-2 text-sm text-white/80">Modules: {phase.modules.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Deliverables: {phase.deliverables.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Autonomous teams should be scoped, named, and reviewable.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.agentPods.map((pod) => (
              <article className="sm-proof-card" key={pod.id}>
                <p className="font-semibold text-white">{pod.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pod.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Workspace: {pod.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Read: {pod.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write: {pod.writeScope.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Portfolio and rollout</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Treat tenants as reusable operating models.</h2>
          <div className="mt-6 grid gap-3">
            <article className="sm-chip text-white">
              <p className="font-semibold">{currentModel.publicLabel}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{currentModel.narrative}</p>
            </article>
            {otherModels.map((model) => (
              <article className="sm-chip text-white" key={model.id}>
                <p className="font-semibold">{model.publicLabel}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{model.thesis}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/runtime">
              Open Runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/factory">
              Open Build
            </Link>
            <Link className="sm-button-secondary" to="/app/architect">
              Open architect
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Open Agent Ops
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Open YTF public demo
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Highest-value next work</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Focus the next engineering cycle where the platform still breaks trust.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Do not expand the catalog faster than the runtime. The best next returns come from connector depth, governance, knowledge canon, and agent reliability.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {RESEARCH_PRIORITIES.map((priority) => (
            <article className="sm-chip text-white" key={priority.id}>
              <p className="font-semibold">{priority.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{priority.thesis}</p>
              <p className="mt-2 text-sm text-white/80">Graduation: {priority.graduation}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
