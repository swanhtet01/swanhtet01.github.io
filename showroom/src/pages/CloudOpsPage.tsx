import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { AI_NATIVE_STACK_LAYERS } from '../lib/aiArchitectureBlueprint'
import { getAgentOperatingModel } from '../lib/agentOperatingModel'
import { loadCloudOpsDashboard, type CloudOpsDashboard } from '../lib/cloudOpsApi'
import { SUPERMEGA_CLOUD_OPS_MODEL } from '../lib/cloudOpsModel'
import { CLOUD_DEPLOYMENT_PATTERNS, SELLABLE_WORKSPACE_PROGRAMS, WORKFORCE_PACKAGES } from '../lib/cloudProductizationModel'
import { SUPERMEGA_HYPERSCALE_ARCHITECTURE_MODEL } from '../lib/hyperscaleArchitectureModel'
import {
  createWorkspaceTasks,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  processAgentRunQueue,
  queueDefaultAgentJobs,
  runDefaultAgentJobs,
  sessionHasCapability,
  triggerProductionDeploy,
  triggerPreviewDeploy,
  type WorkspaceCapability,
  verifyAllWorkspaceDomains,
} from '../lib/workspaceApi'

type AccessState = {
  loading: boolean
  authenticated: boolean
  allowed: boolean
  canManage: boolean
  usesDefaultCredentials: boolean
  roleLabel: string
  error: string | null
}

const cloudCapabilities: WorkspaceCapability[] = ['agent_ops.view', 'director.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view']
const cloudManageCapabilities: WorkspaceCapability[] = ['agent_ops.view', 'tenant_admin.view', 'platform_admin.view']

const outsideCodexStages = [
  {
    id: 'control-plane',
    name: 'Control plane',
    route: '/app/workbench',
    detail:
      'Codex and the portal should design, approve, observe, and intervene. They should not be the only place the workforce exists.',
    controls: ['Cloud Ops', 'Control Workbench', 'Agent Ops', 'Platform Admin'],
  },
  {
    id: 'scheduler-queue',
    name: 'Scheduler and queue',
    route: '/app/runtime',
    detail:
      'Cloud schedulers should enqueue default jobs and queue workers should drain them on a cadence, using the internal cron token and queue endpoints.',
    controls: ['internal cron token', 'enqueue defaults', 'process queue', 'cadence by job family'],
  },
  {
    id: 'worker-runtime',
    name: 'Worker runtime',
    route: '/app/teams',
    detail:
      'The backend service should execute agent jobs, persist outcomes, and expose them back to Agent Ops and Runtime whether Codex is open or not.',
    controls: ['agent job executor', 'run persistence', 'retry policy', 'operator recovery'],
  },
] as const

const externalRuntimeNextMoves = [
  'Split the control plane from the heavy worker lane once browser agents and larger queues increase runtime pressure.',
  'Move always-on tenant crews into a stateful runtime so they keep memory, sockets, and schedules outside the Codex session.',
  'Wrap long approval and launch sequences in a durable workflow engine so deploys and timeouts do not break business execution.',
] as const

function formatDateTime(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'Not synced yet'
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }
  return parsed.toLocaleString()
}

function postureTone(value: 'Healthy' | 'Attention' | 'Modeled') {
  if (value === 'Healthy') {
    return 'text-emerald-300'
  }
  if (value === 'Attention') {
    return 'text-amber-300'
  }
  return 'text-sky-300'
}

function cloudControlTone(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'ready') {
    return 'text-emerald-300'
  }
  if (normalized === 'attention') {
    return 'text-amber-300'
  }
  return 'text-rose-300'
}

function setupTaskTemplate(stepId: string) {
  return `cloud-setup:${stepId}`
}

export function CloudOpsPage() {
  const cloudModel = SUPERMEGA_CLOUD_OPS_MODEL
  const scaleModel = SUPERMEGA_HYPERSCALE_ARCHITECTURE_MODEL
  const agentModel = useMemo(() => getAgentOperatingModel('default'), [])
  const playbookMap = useMemo(() => new Map(agentModel.playbooks.map((playbook) => [playbook.id, playbook])), [agentModel.playbooks])
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    authenticated: false,
    allowed: false,
    canManage: false,
    usesDefaultCredentials: false,
    roleLabel: 'Unknown',
    error: null,
  })
  const [dashboard, setDashboard] = useState<CloudOpsDashboard | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [runCycleBusy, setRunCycleBusy] = useState(false)
  const [queueCycleBusy, setQueueCycleBusy] = useState(false)
  const [drainQueueBusy, setDrainQueueBusy] = useState(false)
  const [seedTasksBusy, setSeedTasksBusy] = useState(false)
  const [verifyDomainsBusy, setVerifyDomainsBusy] = useState(false)
  const [deployPreviewBusy, setDeployPreviewBusy] = useState(false)
  const [deployProductionBusy, setDeployProductionBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      try {
        const payload = await getWorkspaceSession()
        if (cancelled) {
          return
        }

        const authenticated = Boolean(payload.authenticated)
        const allowed = cloudCapabilities.some((capability) => sessionHasCapability(payload.session, capability))
        const canManage = cloudManageCapabilities.some((capability) => sessionHasCapability(payload.session, capability))
        const capabilityProfile = getCapabilityProfileForRole(payload.session?.role)

        setAccess({
          loading: false,
          authenticated,
          allowed,
          canManage,
          usesDefaultCredentials: Boolean(payload.uses_default_credentials),
          roleLabel: capabilityProfile.label,
          error: authenticated ? null : 'Login is required to open cloud operations.',
        })
      } catch {
        if (!cancelled) {
          setAccess({
            loading: false,
            authenticated: false,
            allowed: false,
            canManage: false,
            usesDefaultCredentials: false,
            roleLabel: 'Preview',
            error: 'Cloud operations are shown in preview mode on this host.',
          })
        }
      }
    }

    void loadAccess()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!access.allowed) {
      setDashboardLoading(false)
      return
    }

    let cancelled = false

    async function hydrate(options?: { quiet?: boolean }) {
      const quiet = Boolean(options?.quiet)
      if (quiet) {
        setRefreshing(true)
      } else {
        setDashboardLoading(true)
      }
      try {
        const nextDashboard = await loadCloudOpsDashboard()
        if (cancelled) {
          return
        }
        setDashboard(nextDashboard)
        setDashboardError(null)
      } catch {
        if (!cancelled) {
          setDashboardError('Cloud operations could not load the current workspace snapshot.')
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false)
          setRefreshing(false)
        }
      }
    }

    void hydrate()
    const intervalId = window.setInterval(() => {
      void hydrate({ quiet: true })
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [access.allowed])

  const setupTaskMap = useMemo(
    () => new Map((dashboard?.workspaceTasks ?? []).map((row) => [String(row.template || '').trim(), row])),
    [dashboard?.workspaceTasks],
  )
  const seededSetupCount = useMemo(
    () => cloudModel.setupSteps.filter((step) => setupTaskMap.has(setupTaskTemplate(step.id))).length,
    [cloudModel.setupSteps, setupTaskMap],
  )
  const doneSetupCount = useMemo(
    () =>
      cloudModel.setupSteps.filter((step) => {
        const row = setupTaskMap.get(setupTaskTemplate(step.id))
        return String(row?.status || '').trim().toLowerCase() === 'done'
      }).length,
    [cloudModel.setupSteps, setupTaskMap],
  )
  const missingSetupSteps = useMemo(
    () => cloudModel.setupSteps.filter((step) => !setupTaskMap.has(setupTaskTemplate(step.id))),
    [cloudModel.setupSteps, setupTaskMap],
  )
  const eventDrivenConnectorCount = useMemo(
    () => (dashboard?.connectorActivations ?? []).filter((item) => item.activation === 'Event-driven').length,
    [dashboard?.connectorActivations],
  )
  const cloudControl = dashboard?.cloudControl ?? null
  const preferredWorkforceMode = cloudControl?.preferredWorkforceMode ?? 'directBatch'
  const preferredWorkforceLabel = preferredWorkforceMode === 'queueWorker' ? 'Queue workforce cycle' : 'Run workforce cycle'
  const secondaryWorkforceLabel = preferredWorkforceMode === 'queueWorker' ? 'Run direct batch' : 'Queue workforce cycle'
  const preferredWorkforceBusy = preferredWorkforceMode === 'queueWorker' ? queueCycleBusy : runCycleBusy
  const staleJobCount = dashboard?.runtimeHealth.staleFamilyCount ?? 0
  const learningTrustScore = dashboard?.dataFabric.learningDatabase.trustScore ?? 0
  const liveToolCount = useMemo(
    () => (cloudControl?.agentToolchain ?? []).filter((item) => item.status === 'ready').length,
    [cloudControl?.agentToolchain],
  )
  const readyWorkspaceResourceCount = useMemo(
    () => (cloudControl?.workspaceResources ?? []).filter((item) => item.status === 'ready').length,
    [cloudControl?.workspaceResources],
  )
  const readyProviderCount = useMemo(
    () => (cloudControl?.modelProviders ?? []).filter((item) => item.status === 'ready').length,
    [cloudControl?.modelProviders],
  )
  const topologyRows = cloudControl?.topology?.rows ?? []

  async function refreshDashboard() {
    setRefreshing(true)
    setDashboardError(null)
    try {
      const nextDashboard = await loadCloudOpsDashboard()
      setDashboard(nextDashboard)
    } catch {
      setDashboardError('Cloud operations could not refresh the latest workspace snapshot.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRunWorkforceCycle() {
    if (!access.canManage) {
      return
    }
    setRunCycleBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await runDefaultAgentJobs()
      const startedCount = Number(payload.count ?? payload.rows?.length ?? 0)
      setActionMessage(startedCount ? `Started ${startedCount} default agent jobs.` : 'Triggered the default workforce cycle.')
      await refreshDashboard()
    } catch {
      setActionError('Could not trigger the default workforce cycle right now.')
    } finally {
      setRunCycleBusy(false)
    }
  }

  async function handleQueueWorkforceCycle() {
    if (!access.canManage) {
      return
    }
    setQueueCycleBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await queueDefaultAgentJobs()
      const queuedCount = Number(payload.queued_count ?? payload.count ?? payload.rows?.length ?? 0)
      setActionMessage(queuedCount ? `Queued ${queuedCount} default jobs for the cloud worker lane.` : 'Queued the default workforce cycle.')
      await refreshDashboard()
    } catch {
      setActionError('Could not queue the default workforce cycle right now.')
    } finally {
      setQueueCycleBusy(false)
    }
  }

  async function handleDrainQueue() {
    if (!access.canManage) {
      return
    }
    setDrainQueueBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await processAgentRunQueue(undefined, 12)
      const processedCount = Number(payload.processed_count ?? payload.count ?? payload.rows?.length ?? 0)
      setActionMessage(processedCount ? `Processed ${processedCount} queued jobs through the worker lane.` : 'Queue worker ran with no queued jobs to process.')
      await refreshDashboard()
    } catch {
      setActionError('Could not drain the queued jobs right now.')
    } finally {
      setDrainQueueBusy(false)
    }
  }

  async function handleSeedSetupTasks() {
    if (!access.canManage) {
      return
    }
    setSeedTasksBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      if (!missingSetupSteps.length) {
        setActionMessage('All cloud setup steps are already represented in the workspace queue.')
        return
      }

      await createWorkspaceTasks(
        missingSetupSteps.map((step) => ({
          title: step.title,
          owner: step.owner,
          priority: 'High',
          due: 'This week',
          status: 'open',
          template: setupTaskTemplate(step.id),
          notes: `Cloud Ops setup step. Outcome: ${step.outcome}`,
        })),
      )

      setActionMessage(`Seeded ${missingSetupSteps.length} cloud setup tasks into the queue.`)
      await refreshDashboard()
    } catch {
      setActionError('Could not seed the cloud setup tasks right now.')
    } finally {
      setSeedTasksBusy(false)
    }
  }

  async function handleVerifyDomains() {
    if (!access.canManage) {
      return
    }
    setVerifyDomainsBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await verifyAllWorkspaceDomains()
      const verifiedCount = Number(payload.verified_count ?? payload.rows?.length ?? 0)
      setActionMessage(verifiedCount ? `Verified ${verifiedCount} workspace domains.` : 'Domain verification ran with no domain rows returned.')
      await refreshDashboard()
    } catch {
      setActionError('Could not verify the workspace domains right now.')
    } finally {
      setVerifyDomainsBusy(false)
    }
  }

  async function handleDeployPreview() {
    if (!access.canManage) {
      return
    }
    setDeployPreviewBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await triggerPreviewDeploy()
      const result = (payload.result ?? {}) as Record<string, unknown>
      const previewUrl = String(result.previewUrl ?? result.preview_url ?? result.deploymentUrl ?? result.url ?? '').trim()
      const claimUrl = String(result.claimUrl ?? result.claim_url ?? '').trim()
      setActionMessage(
        previewUrl
          ? claimUrl
            ? `Preview deployed: ${previewUrl} (claim: ${claimUrl})`
            : `Preview deployed: ${previewUrl}`
          : 'Preview deploy completed.',
      )
      await refreshDashboard()
    } catch (error) {
      setActionError((error as Error)?.message || 'Could not trigger the preview deployment right now.')
    } finally {
      setDeployPreviewBusy(false)
    }
  }

  async function handleDeployProduction() {
    if (!access.canManage) {
      return
    }
    setDeployProductionBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const payload = await triggerProductionDeploy()
      const result = (payload.result ?? {}) as Record<string, unknown>
      const productionUrl = String(result.productionUrl ?? result.deploymentUrl ?? result.url ?? '').trim()
      const inspectUrl = String(result.inspectUrl ?? '').trim()
      setActionMessage(
        productionUrl
          ? inspectUrl
            ? `Production deploy started: ${productionUrl} (inspect: ${inspectUrl})`
            : `Production deploy started: ${productionUrl}`
          : 'Production deploy started.',
      )
      await refreshDashboard()
    } catch (error) {
      setActionError((error as Error)?.message || 'Could not trigger the production deployment right now.')
    } finally {
      setDeployProductionBusy(false)
    }
  }

  async function handlePreferredWorkforceCycle() {
    if (preferredWorkforceMode === 'queueWorker') {
      await handleQueueWorkforceCycle()
      return
    }
    await handleRunWorkforceCycle()
  }

  async function handleSecondaryWorkforceCycle() {
    if (preferredWorkforceMode === 'queueWorker') {
      await handleRunWorkforceCycle()
      return
    }
    await handleQueueWorkforceCycle()
  }

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Cloud ops"
          title="Loading the cloud operating layer."
          description="Checking access and building the internal view of pods, environments, and service lanes."
        />
      </div>
    )
  }

  if (access.authenticated && !access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Cloud ops"
          title="Cloud-ops access required."
          description="This surface is for the internal team that provisions environments, runs the AI workforce, and governs platform operations."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask a platform admin, tenant admin, or director to grant the cloud operations scopes for this workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/meta">
              Back to meta
            </Link>
            <Link className="sm-button-primary" to="/app/workbench">
              Open workbench
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Cloud ops"
        title="Run the internal team from one cloud operating layer."
        description="This is the internal map for pods, environments, always-on services, and control surfaces so the platform, the AI workforce, and every future tenant can run from audited cloud infrastructure."
      />

      {access.usesDefaultCredentials ? (
        <section className="sm-chip text-amber-100">
          <p className="font-semibold">Credential hardening required.</p>
          <p className="mt-2 text-sm text-amber-50">
            This workspace still reports default credentials on the authenticated host. Replace them before treating this environment as enterprise-ready.
          </p>
        </section>
      ) : null}

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Live cloud posture</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">
              {dashboardLoading ? 'Loading live control snapshot.' : dashboard?.summary.workspaceName || 'Workspace control'}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Use this live snapshot to watch module posture, runtime pressure, queue load, and workforce readiness before you expand agent autonomy or sell more
              internal tooling outward.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-chip text-white">Source: {dashboard?.source ?? 'loading'}</span>
              <span className="sm-chip text-white">Last sync: {formatDateTime(dashboard?.updatedAt)}</span>
              <span className="sm-chip text-white">Role: {access.roleLabel}</span>
              <span className="sm-chip text-white">Workforce mode: {preferredWorkforceMode === 'queueWorker' ? 'Queue worker' : 'Direct batch'}</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-5">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Modules live</p>
                <p className="mt-2 text-2xl font-bold">{dashboard?.summary.enabledModules ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Teams</p>
                <p className="mt-2 text-2xl font-bold">{dashboard?.summary.teamCount ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Open tasks</p>
                <p className="mt-2 text-2xl font-bold">{dashboard?.summary.openTasks ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Pending approvals</p>
                <p className="mt-2 text-2xl font-bold">{dashboard?.summary.pendingApprovals ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Runtime attention</p>
                <p className="mt-2 text-2xl font-bold">{dashboard?.summary.runtimeAttention ?? 0}</p>
              </div>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Immediate controls</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={refreshing || dashboardLoading} onClick={() => void refreshDashboard()} type="button">
                {refreshing ? 'Refreshing...' : 'Refresh snapshot'}
              </button>
              <button className="sm-button-secondary" disabled={preferredWorkforceBusy || !access.canManage} onClick={() => void handlePreferredWorkforceCycle()} type="button">
                {preferredWorkforceBusy ? (preferredWorkforceMode === 'queueWorker' ? 'Queueing...' : 'Running...') : preferredWorkforceLabel}
              </button>
              <button
                className="sm-button-secondary"
                disabled={(preferredWorkforceMode === 'queueWorker' ? runCycleBusy : queueCycleBusy) || !access.canManage}
                onClick={() => void handleSecondaryWorkforceCycle()}
                type="button"
              >
                {preferredWorkforceMode === 'queueWorker' ? (runCycleBusy ? 'Running...' : secondaryWorkforceLabel) : queueCycleBusy ? 'Queueing...' : secondaryWorkforceLabel}
              </button>
              <button className="sm-button-secondary" disabled={drainQueueBusy || !access.canManage} onClick={() => void handleDrainQueue()} type="button">
                {drainQueueBusy ? 'Draining...' : 'Drain queued jobs'}
              </button>
              <button className="sm-button-secondary" disabled={seedTasksBusy || !access.canManage} onClick={() => void handleSeedSetupTasks()} type="button">
                {seedTasksBusy ? 'Seeding...' : 'Seed setup tasks'}
              </button>
              <button className="sm-button-secondary" disabled={verifyDomainsBusy || !access.canManage} onClick={() => void handleVerifyDomains()} type="button">
                {verifyDomainsBusy ? 'Verifying...' : 'Verify domains'}
              </button>
              <button className="sm-button-secondary" disabled={deployPreviewBusy || !access.canManage} onClick={() => void handleDeployPreview()} type="button">
                {deployPreviewBusy ? 'Deploying...' : 'Deploy preview'}
              </button>
              <button className="sm-button-secondary" disabled={deployProductionBusy || !access.canManage} onClick={() => void handleDeployProduction()} type="button">
                {deployProductionBusy ? 'Promoting...' : 'Deploy production'}
              </button>
            </div>
            {cloudControl ? (
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Ready</p>
                  <p className="mt-2 text-2xl font-bold">{cloudControl.summary.readyCount}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Attention</p>
                  <p className="mt-2 text-2xl font-bold">{cloudControl.summary.attentionCount}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Blocked</p>
                  <p className="mt-2 text-2xl font-bold">{cloudControl.summary.blockerCount}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Coverage</p>
                  <p className="mt-2 text-2xl font-bold">{cloudControl.summary.coverageScore}%</p>
                </div>
              </div>
            ) : null}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Link className="sm-button-secondary" to="/app/workbench">
                Open workbench
              </Link>
              <Link className="sm-button-secondary" to="/app/teams">
                Open agent ops
              </Link>
              <Link className="sm-button-secondary" to="/app/runtime">
                Open runtime
              </Link>
              <Link className="sm-button-secondary" to="/app/model-ops">
                Open model ops
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open platform admin
              </Link>
              <Link className="sm-button-secondary" to="/app/data-fabric">
                Open data fabric
              </Link>
              <Link className="sm-button-secondary" to="/app/factory">
                Open build studio
              </Link>
            </div>
            <div className="mt-6 space-y-3 text-sm text-[var(--sm-muted)]">
              {cloudModel.nextMoves.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            {actionMessage ? <div className="mt-4 sm-chip text-white">{actionMessage}</div> : null}
            {actionError ? <div className="mt-4 sm-chip text-rose-200">{actionError}</div> : null}
            {dashboardError ? <div className="mt-4 sm-chip text-rose-200">{dashboardError}</div> : null}
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Cloud readiness</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Show what is actually wired, what is degraded, and what still blocks autonomous cloud execution.</h2>
            </div>
            <span className="sm-status-pill">{cloudControl ? formatDateTime(cloudControl.updatedAt) : 'Waiting for live cloud payload'}</span>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-4">
            {[
              { id: 'surfaces', title: 'Surfaces', items: cloudControl?.surfaces ?? [] },
              { id: 'connectors', title: 'Connectors', items: cloudControl?.connectors ?? [] },
              { id: 'development', title: 'Development', items: cloudControl?.development ?? [] },
              { id: 'infrastructure', title: 'Infrastructure', items: cloudControl?.infrastructure ?? [] },
            ].map((group) => (
              <div className="space-y-3" key={group.id}>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">{group.title}</p>
                {group.items.length ? (
                  group.items.map((item) => (
                    <article className="sm-proof-card" key={`${group.id}-${item.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`font-semibold ${cloudControlTone(item.status)}`}>{item.status}</p>
                          <h3 className="mt-2 text-lg font-bold text-white">{item.name}</h3>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                        </div>
                        {item.route ? (
                          <Link className="sm-link" to={item.route}>
                            Open
                          </Link>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.chips.map((chip) => (
                          <span className="sm-status-pill" key={`${item.id}-${chip}`}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No live {group.title.toLowerCase()} readiness data yet.</div>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Deployments and domains</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Operate the public host, shared app host, and tenant portals from one topology board.</h2>
            </div>
            <span className="sm-status-pill">{cloudControl?.topology?.summary.count ?? 0} mapped hosts</span>
          </div>
          <div className="mt-5 grid gap-3">
            {topologyRows.map((row) => (
              <article className="sm-proof-card" key={row.domainId || row.hostname}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cloudControlTone(row.status)}`}>{row.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{row.name || row.hostname}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary || row.hostname}</p>
                    <p className="mt-3 text-sm text-white/80">
                      {row.hostname} · {row.scope} · {row.provider} · {row.runtimeTarget || 'runtime target not set'}
                    </p>
                    <p className="mt-2 text-sm text-white/80">
                      Desired state: {row.desiredState || 'planned'} · Route root: {row.routeRoot || '/'}
                    </p>
                    <p className="mt-2 text-sm text-white/80">
                      DNS {row.dnsStatus || 'unknown'} · TLS {row.tlsStatus || 'unknown'} · HTTP {row.httpStatus || 'unknown'}
                    </p>
                    <p className="mt-2 text-sm text-white/80">Last verification: {formatDateTime(row.verifiedAt)}</p>
                    {row.deploymentUrl ? (
                      <a className="sm-link mt-2 inline-flex" href={row.deploymentUrl} rel="noreferrer" target="_blank">
                        Open deployment target
                      </a>
                    ) : row.liveUrl ? (
                      <a className="sm-link mt-2 inline-flex" href={row.liveUrl} rel="noreferrer" target="_blank">
                        Open live host
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.managedBy.map((item) => (
                      <span className="sm-status-pill" key={`${row.hostname}-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                {row.proofPaths.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.proofPaths.map((path) => (
                      <span className="sm-status-pill" key={`${row.hostname}-${path}`}>
                        {path}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {!topologyRows.length ? <div className="sm-chip text-[var(--sm-muted)]">The cloud topology payload has not returned any domain rows yet.</div> : null}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Operator commands</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Keep the worker lane, deploy path, and core job families observable from one control strip.</h2>
            </div>
            <span className="sm-status-pill">{cloudControl?.jobs.length ?? 0} jobs</span>
          </div>
          <div className="mt-5 grid gap-3">
            {(cloudControl?.commands ?? []).map((command) => (
              <article className="sm-proof-card" key={command.id}>
                <p className="text-lg font-bold text-white">{command.label}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{command.detail}</p>
                <div className="mt-4 sm-chip text-white">
                  <code>{command.command}</code>
                </div>
              </article>
            ))}
            {!cloudControl?.commands.length ? <div className="sm-chip text-[var(--sm-muted)]">Live operator commands will appear once the cloud control payload loads.</div> : null}
          </div>
          <div className="mt-6 grid gap-3">
            {(cloudControl?.jobs ?? []).map((job) => (
              <article className="sm-proof-card" key={job.jobType}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cloudControlTone(job.status)}`}>{job.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{job.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{job.detail}</p>
                  </div>
                  <span className="sm-status-pill">{job.cadence}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6 space-y-3 text-sm text-[var(--sm-muted)]">
            {(cloudControl?.nextMoves ?? []).map((item) => (
              <p key={item}>{item}</p>
            ))}
            {!cloudControl?.nextMoves.length ? <p>The cloud control payload will list the highest-value next moves once the live backend route responds.</p> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Agent toolchain</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Show which CLIs and execution lanes are actually available to the crews on this host.</h2>
            </div>
            <span className="sm-status-pill">
              {liveToolCount}/{cloudControl?.agentToolchain.length ?? 0} ready
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {(cloudControl?.agentToolchain ?? []).map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cloudControlTone(item.status)}`}>{item.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{item.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  {item.route ? (
                    <Link className="sm-link" to={item.route}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.chips.map((chip) => (
                    <span className="sm-status-pill" key={`${item.id}-${chip}`}>
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {!cloudControl?.agentToolchain.length ? <div className="sm-chip text-[var(--sm-muted)]">Live toolchain telemetry will appear once the cloud control payload loads.</div> : null}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace substrate</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Keep the repo, data root, runtime packs, and autonomous script surfaces visible from one board.</h2>
            </div>
            <span className="sm-status-pill">
              {readyWorkspaceResourceCount}/{cloudControl?.workspaceResources.length ?? 0} ready
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {(cloudControl?.workspaceResources ?? []).map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cloudControlTone(item.status)}`}>{item.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{item.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  {item.route ? (
                    <Link className="sm-link" to={item.route}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.chips.map((chip) => (
                    <span className="sm-status-pill" key={`${item.id}-${chip}`}>
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {!cloudControl?.workspaceResources.length ? <div className="sm-chip text-[var(--sm-muted)]">Live workspace substrate telemetry will appear once the cloud control payload loads.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-6">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Model provider runtime</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Make backend provider readiness explicit so autonomous crews do not rely on implied auth or hidden local state.</h2>
            </div>
            <span className="sm-status-pill">
              {readyProviderCount}/{cloudControl?.modelProviders.length ?? 0} ready
            </span>
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-3">
            {(cloudControl?.modelProviders ?? []).map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cloudControlTone(item.status)}`}>{item.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{item.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  {item.route ? (
                    <Link className="sm-link" to={item.route}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.chips.map((chip) => (
                    <span className="sm-status-pill" key={`${item.id}-${chip}`}>
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {!cloudControl?.modelProviders.length ? <div className="sm-chip text-[var(--sm-muted)]">Live model-provider runtime telemetry will appear once the cloud control payload loads.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Pods</p>
          <p className="mt-3 text-3xl font-bold text-white">{cloudModel.pods.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Named internal pods with explicit lead, technical, and operator ownership.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace members</p>
          <p className="mt-3 text-3xl font-bold text-white">{dashboard?.summary.memberCount ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">People currently visible in the live workspace membership snapshot.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent playbooks</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentModel.playbooks.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Reusable workforce contracts already modeled for the core platform.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Stale job families</p>
          <p className="mt-3 text-3xl font-bold text-white">{staleJobCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Autonomous job families that are outside their cloud cadence window.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Setup seeded</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {seededSetupCount}/{cloudModel.setupSteps.length}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Cloud setup steps already represented in the workspace queue.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Event-driven connectors</p>
          <p className="mt-3 text-3xl font-bold text-white">{eventDrivenConnectorCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector lanes already emitting live event evidence into the shared runtime spine.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Learning trust</p>
          <p className="mt-3 text-3xl font-bold text-white">{learningTrustScore}%</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Current trust score for the live learning database behind the tenant apps and agents.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Stack lanes</p>
          <p className="mt-3 text-3xl font-bold text-white">{AI_NATIVE_STACK_LAYERS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Recommended cloud stack layers for agent runtime, orchestration, and memory.</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Environment posture</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The cloud map now reflects live runtime and queue pressure where the backend already exposes it.</h2>
            </div>
            <span className="sm-status-pill">{dashboard?.source ?? 'seed'} snapshot</span>
          </div>
          <div className="mt-5 grid gap-4">
            {(dashboard?.environments ?? []).map((environment) => (
              <article className="sm-proof-card" key={environment.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${postureTone(environment.status)}`}>{environment.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{environment.name}</h3>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{environment.summary}</p>
                  </div>
                  <Link className="sm-link" to={environment.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {environment.stats.map((item) => (
                    <span className="sm-status-pill" key={`${environment.id}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {!dashboard?.environments.length ? <div className="sm-chip text-[var(--sm-muted)]">Live environment posture will appear once the workspace snapshot loads.</div> : null}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Queue pressure</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Treat cloud scale as a queue problem first, then an automation problem.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {(dashboard?.queueSignals ?? []).map((signal) => (
              <Link className="sm-proof-card block" key={signal.id} to={signal.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{signal.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{signal.detail}</p>
                  </div>
                  <span className="sm-status-pill">{signal.count}</span>
                </div>
              </Link>
            ))}
            {!dashboard?.queueSignals.length ? <div className="sm-chip text-[var(--sm-muted)]">Live queue pressure will appear once the workspace snapshot loads.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Agent runtime health</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Watch the cloud scheduler, worker lane, and job families as one operating strip.</h2>
            </div>
            <span className={`sm-status-pill ${postureTone(dashboard?.runtimeHealth.status ?? 'Modeled')}`}>{dashboard?.runtimeHealth.status ?? 'Modeled'}</span>
          </div>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">{dashboard?.runtimeHealth.note}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Scheduler signal</p>
              <p className="mt-2 text-sm">{formatDateTime(dashboard?.runtimeHealth.lastSchedulerRunAt)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Worker signal</p>
              <p className="mt-2 text-sm">{formatDateTime(dashboard?.runtimeHealth.lastWorkerRunAt)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Next due family</p>
              <p className="mt-2 text-sm">{dashboard?.runtimeHealth.nextDueJob ?? 'No stale family'}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Active</p>
              <p className="mt-2 text-2xl font-bold text-white">{dashboard?.runtimeHealth.activeFamilyCount ?? 0}</p>
            </div>
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Stale</p>
              <p className="mt-2 text-2xl font-bold text-white">{dashboard?.runtimeHealth.staleFamilyCount ?? 0}</p>
            </div>
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Queued</p>
              <p className="mt-2 text-2xl font-bold text-white">{dashboard?.runtimeHealth.queuedRunCount ?? 0}</p>
            </div>
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Failures</p>
              <p className="mt-2 text-2xl font-bold text-white">{dashboard?.runtimeHealth.failedRunCount ?? 0}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {(dashboard?.runtimeHealth.jobHealth ?? []).map((job) => (
              <article className="sm-proof-card" key={job.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${postureTone(job.status)}`}>{job.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{job.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{job.summary}</p>
                  </div>
                  <span className="sm-status-pill">{job.cadence}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Freshness</p>
                    <p className="mt-2 text-sm">{job.freshness}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent source</p>
                    <p className="mt-2 text-sm">{job.lastSource}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/80">{job.nextMove}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {(dashboard?.runtimeHealth.controls ?? []).map((item) => (
              <span className="sm-status-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Cloud execution cells</p>
              <h2 className="mt-2 text-2xl font-bold text-white">These are the live cloud lanes the platform now depends on.</h2>
            </div>
            <span className="sm-status-pill">{dashboard?.executionCells.length ?? 0} cells</span>
          </div>
          <div className="mt-5 grid gap-3">
            {(dashboard?.executionCells ?? []).map((cell) => (
              <article className="sm-proof-card" key={cell.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${postureTone(cell.status)}`}>{cell.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{cell.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.summary}</p>
                  </div>
                  <Link className="sm-link" to={cell.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                    <p className="mt-2 text-sm">{cell.owner}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Proof</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cell.proof.map((item) => (
                        <span className="sm-status-pill" key={`${cell.id}-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/80">{cell.nextMove}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Connector activation matrix</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Cloud usefulness depends on which connectors are truly event-driven and which are still mapped or queued.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/connectors">
              Open connectors
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {(dashboard?.connectorActivations ?? []).map((connector) => (
              <article className="sm-proof-card" key={connector.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${postureTone(connector.status)}`}>{connector.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{connector.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.system}</p>
                  </div>
                  <span className="sm-status-pill">{connector.activation}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Freshness</p>
                    <p className="mt-2 text-sm">{connector.freshness}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Writeback or touchpoint</p>
                    <p className="mt-2 text-sm">{connector.touchpoint}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="sm-status-pill">{connector.eventCount} events</span>
                  {connector.surfaces.slice(0, 3).map((item) => (
                    <span className="sm-status-pill" key={`${connector.id}-surface-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-white/80">{connector.nextMove}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {connector.risks.slice(0, 2).map((item) => (
                    <span className="sm-status-pill" key={`${connector.id}-risk-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomous crews</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The worker families should land as named crews with cadence, backlog, and owner clarity.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/teams">
              Open agent ops
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {(dashboard?.autonomousCrews ?? []).map((crew) => (
              <article className="sm-proof-card" key={crew.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${postureTone(crew.status)}`}>{crew.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{crew.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.summary}</p>
                  </div>
                  <Link className="sm-link" to={crew.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                    <p className="mt-2 text-sm">{crew.owner}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Cadence</p>
                    <p className="mt-2 text-sm">{crew.cadence}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Backlog</p>
                    <p className="mt-2 text-sm">{crew.backlog}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Latest signal</p>
                    <p className="mt-2 text-sm">{formatDateTime(crew.latestSignal)}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/80">{crew.nextMove}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {crew.risks.slice(0, 2).map((item) => (
                    <span className="sm-status-pill" key={`${crew.id}-risk-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Pod topology</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every pod has explicit control surfaces, owners, and operating contracts.</h2>
          </div>
          <span className="sm-status-pill">{agentModel.tools.length} workforce tools already modeled</span>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {cloudModel.pods.map((pod) => {
            const linkedPlaybooks = pod.playbookIds.map((playbookId) => playbookMap.get(playbookId)).filter(Boolean)

            return (
              <article className="sm-surface p-6" key={pod.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Pod</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{pod.name}</h3>
                  </div>
                  <Link className="sm-link" to={pod.route}>
                    Open surface
                  </Link>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-white/80">{pod.mission}</p>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Lead</p>
                    <p className="mt-2 text-sm">{pod.lead}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Technical owner</p>
                    <p className="mt-2 text-sm">{pod.technicalOwner}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Operator owner</p>
                    <p className="mt-2 text-sm">{pod.operatorOwner}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Approval path</p>
                    <p className="mt-2 text-sm">{pod.approvalPath}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="sm-proof-card">
                    <p className="font-semibold text-white">Responsibilities</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pod.responsibilities.map((item) => (
                        <span className="sm-status-pill" key={`${pod.id}-responsibility-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-proof-card">
                    <p className="font-semibold text-white">Default surfaces</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pod.defaultSurfaces.map((item) => (
                        <span className="sm-status-pill" key={`${pod.id}-surface-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="font-semibold text-white">Linked playbooks</p>
                  <div className="mt-3 grid gap-3">
                    {linkedPlaybooks.length ? (
                      linkedPlaybooks.map((playbook) => (
                        <div className="sm-proof-card" key={playbook?.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{playbook?.name}</p>
                              <p className="mt-2 text-sm text-[var(--sm-muted)]">{playbook?.mission}</p>
                            </div>
                            <span className="sm-status-pill">{playbook?.workspace}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="sm-chip text-[var(--sm-muted)]">Governance pod runs through Workbench, approvals, and decision control rather than one playbook.</div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Cloud environments</p>
              <h2 className="mt-2 text-2xl font-bold text-white">All core work happens in named cloud environments, not on unmanaged local machines.</h2>
            </div>
            <span className="sm-status-pill">{cloudModel.environments.length} environments</span>
          </div>
          <div className="mt-5 grid gap-4">
            {cloudModel.environments.map((environment) => (
              <article className="sm-proof-card" key={environment.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{environment.strap}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{environment.name}</h3>
                  </div>
                  <Link className="sm-link" to={environment.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{environment.purpose}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Workloads</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {environment.workloads.map((item) => (
                        <span className="sm-status-pill" key={`${environment.id}-workload-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {environment.controls.map((item) => (
                        <span className="sm-status-pill" key={`${environment.id}-control-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Internal consoles</p>
              <h2 className="mt-2 text-2xl font-bold text-white">These are the meta tools that keep the company and the platform running.</h2>
            </div>
            <span className="sm-status-pill">{cloudModel.internalTools.length} control surfaces</span>
          </div>
          <div className="mt-5 grid gap-3">
            {cloudModel.internalTools.map((tool) => (
              <Link className="sm-proof-card block" key={tool.id} to={tool.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">{tool.strap}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{tool.name}</h3>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{tool.purpose}</p>
                  </div>
                  <span className="sm-status-pill">Internal tool</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Operators</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tool.operators.map((item) => (
                        <span className="sm-status-pill" key={`${tool.id}-operator-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tool.controls.map((item) => (
                        <span className="sm-status-pill" key={`${tool.id}-control-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Always-on backbone</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The cloud machine needs stable service lanes before more agent autonomy expands.</h2>
            </div>
            <span className="sm-status-pill">{cloudModel.serviceLanes.length} lanes</span>
          </div>
          <div className="mt-5 grid gap-4">
            {cloudModel.serviceLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.purpose}</p>
                  </div>
                  <span className="sm-status-pill">Service lane</span>
                </div>
                <p className="mt-3 text-sm text-white/80">{lane.coverage}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Stack</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lane.stack.map((item) => (
                        <span className="sm-status-pill" key={`${lane.id}-stack-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Safeguards</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lane.safeguards.map((item) => (
                        <span className="sm-status-pill" key={`${lane.id}-safeguard-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Stack direction</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The repo already defines the cloud-native direction for the next runtime layer.</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {AI_NATIVE_STACK_LAYERS.map((layer) => (
              <article className="sm-proof-card" key={layer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{layer.layer}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{layer.recommendation}</p>
                  </div>
                  <span className="sm-status-pill">Direction</span>
                </div>
                <p className="mt-3 text-sm text-white/80">{layer.role}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{layer.whyNow}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">100k-scale planes</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{scaleModel.title} starts by splitting control from execution.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{scaleModel.summary}</p>
            </div>
            <span className="sm-status-pill">{scaleModel.planes.length} planes</span>
          </div>
          <p className="mt-5 text-sm text-white/80">{scaleModel.northStar}</p>
          <div className="mt-5 grid gap-4">
            {scaleModel.planes.map((plane) => (
              <article className="sm-proof-card" key={plane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">{plane.strap}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{plane.name}</h3>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{plane.mission}</p>
                  </div>
                  <Link className="sm-link" to={plane.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">{plane.scaleTarget}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Responsibilities</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {plane.responsibilities.map((item) => (
                        <span className="sm-status-pill" key={`${plane.id}-responsibility-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {plane.controls.map((item) => (
                        <span className="sm-status-pill" key={`${plane.id}-control-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Workload classes</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Scale the job families differently or they will poison each other.</h2>
            </div>
            <span className="sm-status-pill">{scaleModel.workloadClasses.length} classes</span>
          </div>
          <div className="mt-5 grid gap-4">
            {scaleModel.workloadClasses.map((workload) => (
              <article className="sm-proof-card" key={workload.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{workload.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{workload.purpose}</p>
                  </div>
                  <Link className="sm-link" to={workload.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Queue class</p>
                    <p className="mt-2 text-sm">{workload.queueClass}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Compute shape</p>
                    <p className="mt-2 text-sm">{workload.computeShape}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">State boundary</p>
                    <p className="mt-2 text-sm">{workload.stateBoundary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workload.examples.map((item) => (
                      <span className="sm-status-pill" key={`${workload.id}-example-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Partition and shard rules</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The product unit can be shared, but the noisy parts cannot stay flat forever.</h2>
            </div>
            <span className="sm-status-pill">{scaleModel.partitionRules.length} partition rules</span>
          </div>
          <div className="mt-5 grid gap-4">
            {scaleModel.partitionRules.map((rule) => (
              <article className="sm-proof-card" key={rule.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{rule.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{rule.strategy}</p>
                  </div>
                  <Link className="sm-link" to={rule.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Trigger</p>
                    <p className="mt-2 text-sm">{rule.trigger}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Result</p>
                    <p className="mt-2 text-sm">{rule.result}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Scale path</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Kill the wrong bottlenecks first, then graduate the fleet in stages.</h2>
            </div>
            <span className="sm-status-pill">{scaleModel.milestones.length} milestones</span>
          </div>
          <div className="mt-5 grid gap-3">
            {scaleModel.bottlenecks.map((bottleneck) => (
              <article className="sm-proof-card" key={bottleneck.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{bottleneck.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{bottleneck.symptom}</p>
                  </div>
                  <Link className="sm-link" to={bottleneck.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">{bottleneck.replaceWith}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 grid gap-4">
            {scaleModel.milestones.map((milestone) => (
              <article className="sm-chip text-white" key={milestone.id}>
                <p className="sm-kicker text-[var(--sm-accent)]">{milestone.stage}</p>
                <p className="mt-2 text-lg font-semibold text-white">{milestone.target}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{milestone.objective}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {milestone.mustHave.map((item) => (
                    <span className="sm-status-pill" key={`${milestone.id}-must-have-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-white/80">{milestone.graduationRule}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Outside Codex</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Agents should keep working when the design console is closed.</h2>
            </div>
            <span className="sm-status-pill">Control plane != runtime</span>
          </div>
          <div className="mt-5 grid gap-4">
            {outsideCodexStages.map((stage) => (
              <article className="sm-proof-card" key={stage.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{stage.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{stage.detail}</p>
                  </div>
                  <Link className="sm-link" to={stage.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {stage.controls.map((item) => (
                    <span className="sm-status-pill" key={`${stage.id}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">What next</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The current queue worker is the first external runtime, not the final one.</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {externalRuntimeNextMoves.map((item) => (
              <article className="sm-proof-card" key={item}>
                <p className="text-sm leading-relaxed text-white/80">{item}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/runtime">
              Open runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Open agent ops
            </Link>
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Cloud products</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The runtime should package cleanly into sellable cloud workspaces.</h2>
            </div>
            <span className="sm-status-pill">{SELLABLE_WORKSPACE_PROGRAMS.length} workspace products</span>
          </div>
          <div className="mt-5 grid gap-3">
            {SELLABLE_WORKSPACE_PROGRAMS.slice(0, 4).map((program) => (
              <article className="sm-proof-card" key={program.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{program.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.strap}</p>
                  </div>
                  <Link className="sm-link" to={program.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">Outcome: {program.outcome}</p>
                <p className="mt-2 text-sm text-white/80">Workforce: {program.workforcePacks.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Commercial runtime shape</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Sell the screen, the workforce, and the deployment pattern together.</h2>
            </div>
            <span className="sm-status-pill">
              {WORKFORCE_PACKAGES.length} packs / {CLOUD_DEPLOYMENT_PATTERNS.length} patterns
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {CLOUD_DEPLOYMENT_PATTERNS.map((pattern) => (
              <article className="sm-proof-card" key={pattern.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{pattern.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pattern.purpose}</p>
                  </div>
                  <span className="sm-status-pill">{pattern.tenancy}</span>
                </div>
                <p className="mt-3 text-sm text-white/80">Sell as: {pattern.sellAs.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Setup sequence</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The first operating loop is cloud setup, then release discipline, then scaled autonomy.</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            <span className="sm-chip text-white">
              Seeded {seededSetupCount}/{cloudModel.setupSteps.length}
            </span>
            <span className="sm-chip text-white">
              Done {doneSetupCount}/{cloudModel.setupSteps.length}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {cloudModel.setupSteps.map((step, index) => {
            const task = setupTaskMap.get(setupTaskTemplate(step.id))
            const taskStatus = String(task?.status || '').trim().toLowerCase()
            const statusLabel = !task ? 'Not seeded' : taskStatus === 'done' ? 'Done' : 'In queue'
            return (
              <article className="sm-surface p-6" key={step.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Step {index + 1}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{step.title}</h3>
                  </div>
                  <span className="sm-status-pill">{statusLabel}</span>
                </div>
                <p className="mt-4 text-sm text-[var(--sm-muted)]">{step.outcome}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                    <p className="mt-2 text-sm">{step.owner}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Queue state</p>
                    <p className="mt-2 text-sm">
                      {task ? `${task.owner || step.owner} · ${task.priority || 'Normal'} · ${task.due || 'No due date'}` : 'Not yet added to the queue'}
                    </p>
                  </div>
                </div>
                {step.route ? (
                  <div className="mt-5">
                    <Link className="sm-link" to={step.route}>
                      Open related control
                    </Link>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cloudModel.operatingRules.map((rule) => (
            <article className="sm-chip text-white" key={rule.id}>
              <p className="font-semibold">{rule.title}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{rule.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
