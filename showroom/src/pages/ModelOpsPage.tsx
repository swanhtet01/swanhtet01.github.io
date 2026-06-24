import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadModelOpsPayload, type ModelOpsBenchmarkDrill, type ModelOpsCrewLane, type ModelOpsPayload, type ModelOpsProviderLane, type ModelOpsRoutingLane } from '../lib/modelOpsApi'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const modelOpsCapabilities = ['agent_ops.view', 'director.view', 'architect.view', 'security_admin.view', 'tenant_admin.view', 'platform_admin.view'] as const

function formatDateTime(value: string | null) {
  if (!value) {
    return 'No live timestamp yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function toneForProviderStatus(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'ready') {
    return 'text-emerald-300'
  }
  if (normalized === 'attention') {
    return 'text-amber-300'
  }
  return 'text-rose-300'
}

function toneForRuntimeStatus(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'healthy') {
    return 'text-emerald-300'
  }
  if (normalized === 'warning') {
    return 'text-amber-300'
  }
  return 'text-rose-300'
}

function toneForBenchmarkStatus(value: ModelOpsBenchmarkDrill['status']) {
  if (value === 'Healthy') {
    return 'text-emerald-300'
  }
  if (value === 'Attention') {
    return 'text-amber-300'
  }
  return 'text-rose-300'
}

function sortProviderLanes(rows: ModelOpsProviderLane[]) {
  const rank: Record<string, number> = { blocked: 0, attention: 1, ready: 2 }
  return [...rows].sort((left, right) => (rank[left.status] ?? 99) - (rank[right.status] ?? 99) || left.name.localeCompare(right.name))
}

function sortRoutingLanes(rows: ModelOpsRoutingLane[]) {
  const rank: Record<string, number> = { Degraded: 0, Warning: 1, 'Needs wiring': 2, Healthy: 3 }
  return [...rows].sort((left, right) => (rank[left.status] ?? 99) - (rank[right.status] ?? 99) || left.name.localeCompare(right.name))
}

function sortCrewLanes(rows: ModelOpsCrewLane[]) {
  const rank: Record<string, number> = { Degraded: 0, Warning: 1, 'Needs wiring': 2, Healthy: 3 }
  return [...rows].sort((left, right) => (rank[left.status] ?? 99) - (rank[right.status] ?? 99) || left.name.localeCompare(right.name))
}

function sortBenchmarkDrills(rows: ModelOpsBenchmarkDrill[]) {
  const rank: Record<ModelOpsBenchmarkDrill['status'], number> = { Blocked: 0, Attention: 1, Healthy: 2 }
  return [...rows].sort((left, right) => rank[left.status] - rank[right.status] || left.name.localeCompare(right.name))
}

export function ModelOpsPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [payload, setPayload] = useState<ModelOpsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...modelOpsCapabilities],
        unauthenticatedMessage: 'Login is required to open Model Ops.',
        previewMessage: 'Model Ops only runs inside the authenticated workspace.',
      })

      if (cancelled) {
        return
      }

      setAccess(nextAccess)

      if (!nextAccess.authenticated || !nextAccess.allowed) {
        setLoading(false)
        return
      }

      try {
        const nextPayload = await loadModelOpsPayload()
        if (!cancelled) {
          setPayload(nextPayload)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Model Ops could not load the current workspace contract.')
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
  }, [])

  if (loading || access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Model ops"
          title="Loading provider posture, routing contracts, and benchmark drills."
          description="Checking role access and the live model-control snapshot."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Model ops"
          title="Authenticated workspace required."
          description="This desk binds live provider posture, runtime routing, and agent crew contracts, so it only runs inside the authenticated workspace."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Login is required to open Model Ops.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/model-ops">
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
          eyebrow="Model ops"
          title="Privileged access required."
          description="This desk is for the roles that govern model routing, provider posture, crew boundaries, and high-impact benchmark drills."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an admin to grant director, architect, agent, security, or tenant-admin control scope.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/meta">
              Open meta
            </Link>
            <Link className="sm-button-secondary" to="/app/cloud">
              Open cloud ops
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Model ops"
          title="The model-control desk is unavailable."
          description="The API did not return a usable model-control snapshot."
        />
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error ?? 'No model-control payload returned.'}</p>
        </section>
      </div>
    )
  }

  const providerLanes = sortProviderLanes(payload.providerLanes)
  const routingLanes = sortRoutingLanes(payload.routingLanes)
  const crewLanes = sortCrewLanes(payload.crewLanes)
  const benchmarkDrills = sortBenchmarkDrills(payload.benchmarkDrills)

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Model ops"
        title={`Run ${payload.workspaceName || 'the workspace'} through explicit provider lanes, crew contracts, and benchmark drills.`}
        description={`${payload.dialectic.synthesis} This desk turns model choice into a governed operating layer instead of leaving it scattered across prompts, tools, and implicit habits.`}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Providers ready</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {payload.summary.readyProviderCount}/{payload.summary.providerCount}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Explicit provider lanes visible from cloud posture.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Routing lanes</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {payload.summary.healthyRoutingCount}/{payload.summary.routingProfileCount}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Profiles already healthy enough to run as default lanes.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Crew contracts</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {payload.summary.guardedCrewCount}/{payload.summary.crewCount}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Agent cells with healthy posture before broader autonomy.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Benchmark drills</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {payload.summary.readyDrillCount}/{payload.summary.drillCount}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Named workflows ready for repeat evaluation and promotion.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Toolchain ready</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.toolchainReadyCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Live builder and operator tools visible from Cloud Ops.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Trust score</p>
          <p className={`mt-3 text-3xl font-bold ${payload.summary.learningTrustScore >= 80 ? 'text-emerald-300' : payload.summary.learningTrustScore >= 60 ? 'text-sky-300' : 'text-amber-300'}`}>
            {payload.summary.learningTrustScore}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.staleJobCount} stale job families still need recovery.</p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{payload.workspaceName}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Source {payload.source}. Updated {formatDateTime(payload.updatedAt)}. Suggested crew lanes are inferred from mission, tools, and data sources so no high-impact
              cell stays unassigned.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/cloud">
              Open cloud ops
            </Link>
            <Link className="sm-button-secondary" to="/app/security">
              Open security
            </Link>
            <Link className="sm-button-secondary" to="/app/agent-space">
              Open agent space
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          { label: 'Thesis', detail: payload.dialectic.thesis },
          { label: 'Antithesis', detail: payload.dialectic.antithesis },
          { label: 'Synthesis', detail: payload.dialectic.synthesis },
        ].map((item) => (
          <article className="sm-site-panel" key={item.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
            <p className="mt-4 text-lg font-semibold text-white">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Provider lanes</p>
              <h2 className="mt-2 text-3xl font-bold text-white">See who is actually available, where they route, and which lanes still depend on fallback.</h2>
            </div>
            <span className="sm-status-pill">{providerLanes.length} providers</span>
          </div>
          <div className="mt-6 grid gap-4">
            {providerLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${toneForProviderStatus(lane.status)}`}>{lane.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{lane.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.detail}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lane.chips.map((chip) => (
                    <span className="sm-status-pill" key={`${lane.id}-${chip}`}>
                      {chip}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Primary lanes</p>
                    <p className="mt-2 text-sm text-white/80">{lane.primaryProfiles.length ? lane.primaryProfiles.join(', ') : 'No primary routing lanes assigned yet.'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Fallback lanes</p>
                    <p className="mt-2 text-sm text-white/80">{lane.fallbackProfiles.length ? lane.fallbackProfiles.join(', ') : 'No fallback lane assignments yet.'}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/60">Recommended uses</p>
                  <p className="mt-2 text-sm text-white/80">{lane.recommendedUses.join(' / ')}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Routing contracts</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Route planning, coding, crew operations, and extraction through declared lanes with provider posture attached.</h2>
            </div>
            <span className="sm-status-pill">{routingLanes.length} profiles</span>
          </div>
          <div className="mt-6 grid gap-4">
            {routingLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${toneForRuntimeStatus(lane.status)}`}>{lane.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{lane.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.useCase}</p>
                  </div>
                  <Link className="sm-link" to="/app/security">
                    Guardrails
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Preferred</p>
                    <p className="mt-2 font-semibold">{lane.preferredModel}</p>
                    <p className={`mt-1 text-sm ${toneForProviderStatus(lane.preferredProviderStatus)}`}>{lane.preferredProviderName}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Fallback</p>
                    <p className="mt-2 font-semibold">{lane.fallbackModel}</p>
                    <p className={`mt-1 text-sm ${toneForProviderStatus(lane.fallbackProviderStatus)}`}>{lane.fallbackProviderName}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Tools</p>
                    <p className="mt-2 text-sm text-white/80">{lane.tools.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Safeguards</p>
                    <p className="mt-2 text-sm text-white/80">{lane.safeguards.join(', ')}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                  <p>Reasoning: {lane.reasoning}</p>
                  <p>Next move: {lane.nextMove}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Crew assignments</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Map each agent cell to a first-pass routing lane, provider, and approval boundary.</h2>
            </div>
            <span className="sm-status-pill">{crewLanes.length} crews</span>
          </div>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">
            Suggested lane is heuristic. It uses the mission, workspace, tool classes, and data sources so the operator can see where routing is still implicit.
          </p>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {crewLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${toneForRuntimeStatus(lane.status)}`}>{lane.status}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{lane.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mission}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Suggested lane</p>
                    <p className="mt-2 text-sm text-white/80">{lane.suggestedProfileName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Suggested provider</p>
                    <p className={`mt-2 text-sm ${toneForProviderStatus(lane.suggestedProviderStatus)}`}>{lane.suggestedProviderName}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                  <p>Workspace: {lane.workspace}</p>
                  <p>Boundary: {lane.trustBoundary}</p>
                  <p>Approval gate: {lane.approvalGate}</p>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/60">Signals</p>
                  <p className="mt-2 text-sm text-white/80">{lane.signals.join(', ')}</p>
                </div>
                <p className="mt-4 text-sm text-white/80">Risks: {lane.risks.join(' ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Benchmark drills</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Use named workflows to test whether the lane is production-worthy before you expand autonomy.</h2>
            </div>
            <span className="sm-status-pill">{benchmarkDrills.length} drills</span>
          </div>
          <div className="mt-6 grid gap-4">
            {benchmarkDrills.map((drill) => (
              <article className="sm-proof-card" key={drill.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${toneForBenchmarkStatus(drill.status)}`}>{drill.status}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{drill.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{drill.objective}</p>
                  </div>
                  <Link className="sm-link" to={drill.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Routing lane</p>
                    <p className="mt-2 text-sm text-white/80">{drill.profileName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/60">Provider</p>
                    <p className="mt-2 text-sm text-white/80">{drill.providerName}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/60">Checks</p>
                  <p className="mt-2 text-sm text-white/80">{drill.checks.join(' / ')}</p>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                  <p>Owner: {drill.owner}</p>
                  <p>Next move: {drill.nextMove}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next moves</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Close the routing and provider gaps before wider rollout.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Open data fabric
            </Link>
            <Link className="sm-button-secondary" to="/app/workforce">
              Open workforce
            </Link>
            <Link className="sm-button-secondary" to="/app/connectors">
              Open connectors
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {payload.nextMoves.map((item) => (
            <article className="sm-chip text-white" key={item}>
              {item}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
