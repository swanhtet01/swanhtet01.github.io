import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadAgentWorkspaceContext, type AgentWorkspacePayload } from '../lib/agentWorkspaceApi'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'] as const

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

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function toneForTier(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'canonical') {
    return 'text-emerald-300'
  }
  if (normalized === 'normalized' || normalized === 'modeled' || normalized === 'operational') {
    return 'text-sky-300'
  }
  return 'text-amber-300'
}

function toneForMetric(value: number) {
  if (value >= 80) {
    return 'text-emerald-300'
  }
  if (value >= 50) {
    return 'text-sky-300'
  }
  return 'text-amber-300'
}

export function AgentWorkspacePage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [payload, setPayload] = useState<AgentWorkspacePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open the agent workspace.',
        previewMessage: 'The agent workspace only runs inside the authenticated app.',
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
        const nextPayload = await loadAgentWorkspaceContext()
        if (!cancelled) {
          setPayload(nextPayload)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'The agent workspace could not be loaded.')
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
          eyebrow="Agent space"
          title="Loading the tenant agent workspace."
          description="Checking access, role scope, and the live operating context."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Agent space"
          title="Authenticated workspace required."
          description="This desk is only available inside the live app because it merges role scope, internal resources, and operating commands."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Login is required to open the agent workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/agent-space">
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
          eyebrow="Agent space"
          title="Privileged access required."
          description="This desk is for the roles that design, supervise, or govern the AI workforce and its supporting control planes."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an admin to grant agent, architect, director, or tenant-admin control scope.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/meta">
              Open meta
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open my queue
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
          eyebrow="Agent space"
          title="The agent workspace is not available."
          description="The API did not return a usable operating model."
        />
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error ?? 'No payload returned.'}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Agent space"
        title={`Run ${payload.company.publicLabel || payload.company.name} as one governed AI workspace.`}
        description={`${payload.dialectic.synthesis} This desk exposes role scope, tool stacks, trust boundaries, live module posture, and runnable commands in one place.`}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.workspaceCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Named internal lanes with explicit ownership.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.aiTeamCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Bounded teams with read, write, and approval scope.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Enabled modules</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.enabledModuleCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.pilotModuleCount} pilot modules are still under controlled rollout.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Members</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.memberCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.openTaskCount} open tasks are currently attached to the workspace.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Role coverage</p>
          <p className={`mt-3 text-3xl font-bold ${toneForMetric(payload.summary.roleCoverageScore)}`}>{payload.summary.roleCoverageScore}%</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">How much of the modeled role map is represented in the live member roster.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Coverage score</p>
          <p className={`mt-3 text-3xl font-bold ${toneForMetric(payload.summary.coverageScore)}`}>{payload.summary.coverageScore}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.staleJobCount} stale job families are currently flagged by Cloud Ops.</p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">
              {payload.workspace.workspaceName} on {payload.company.domain}
            </p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Updated {formatDateTime(payload.updatedAt)}. Supervisor {payload.live.supervisor.status || 'unknown'}, cycle count {payload.live.supervisor.cycleCount},
              cloud ready {payload.summary.cloudReadyCount}, attention {payload.summary.cloudAttentionCount}, blockers {payload.summary.cloudBlockerCount}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {payload.quickLinks.slice(0, 4).map((item) => (
              <Link className="sm-button-secondary" key={item.route} to={item.route}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Thesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.thesis}</p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Antithesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.antithesis}</p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Synthesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.synthesis}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
              <h2 className="mt-3 text-3xl font-bold text-white">The operating lanes are explicit.</h2>
            </div>
            <span className="sm-status-pill">{payload.summary.workspaceCount} lanes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {payload.workspaces.map((workspace) => (
              <article className="sm-proof-card" key={workspace.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{workspace.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.mission}</p>
                  </div>
                  <Link className="sm-status-pill" to={workspace.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">Owners: {workspace.ownerRoles.map(formatLabel).join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">AI teams</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Each team has scope and a stop condition.</h2>
            </div>
            <span className="sm-status-pill">{payload.summary.aiTeamCount} teams</span>
          </div>
          <div className="mt-6 grid gap-4">
            {payload.aiTeams.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <p className="font-semibold text-white">{team.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-4 text-sm text-white/80">Workspace: {formatLabel(team.workspace)}</p>
                <p className="mt-2 text-sm text-white/80">Reads: {team.reads.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Writes: {team.writes.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Approval: {team.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Role profiles</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Homes, capabilities, and tool stacks are mapped.</h2>
          <div className="mt-6 grid gap-4">
            {payload.roleProfiles.map((role) => (
              <article className="sm-proof-card" key={role.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{role.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{role.mission}</p>
                  </div>
                  <Link className="sm-status-pill" to={role.home}>
                    Home
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">Capabilities: {role.capabilities.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Tool profile: {formatLabel(role.toolProfile)}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tool profiles</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Teams use curated stacks, not unlimited access.</h2>
          <div className="mt-6 grid gap-4">
            {payload.toolProfiles.map((toolProfile) => (
              <article className="sm-proof-card" key={toolProfile.id}>
                <p className="font-semibold text-white">{toolProfile.name}</p>
                <p className="mt-3 text-sm text-white/80">Users: {toolProfile.users.map(formatLabel).join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Tools: {toolProfile.tools.join(', ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{toolProfile.guardrails.join(' · ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Knowledge resources</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Data sources are ranked by trust and cadence.</h2>
          <div className="mt-6 grid gap-4">
            {payload.knowledgeResources.map((resource) => (
              <article className="sm-proof-card" key={resource.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{resource.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{resource.source}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForTier(resource.trustTier)}`}>{formatLabel(resource.trustTier)}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Cadence: {resource.cadence}</p>
                <p className="mt-2 text-sm text-white/80">Used by: {resource.usedBy.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Trust boundaries</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Autonomy is limited by explicit rules.</h2>
          <div className="mt-6 grid gap-4">
            {payload.trustBoundaries.map((boundary) => (
              <article className="sm-proof-card" key={boundary.id}>
                <p className="font-semibold text-white">{boundary.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{boundary.rule}</p>
                <p className="mt-4 text-sm text-white/80">Surfaces: {boundary.surfaces.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Execution loops</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The machine only matters if it closes loops.</h2>
          <div className="mt-6 grid gap-4">
            {payload.executionLoops.map((loop) => (
              <article className="sm-proof-card" key={loop.id}>
                <p className="font-semibold text-white">{loop.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.trigger}</p>
                <p className="mt-4 text-sm text-white/80">Outputs: {loop.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">KPIs: {loop.kpis.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Live posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Current module, queue, and command state.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Module posture</p>
              <div className="mt-4 grid gap-3">
                {payload.live.moduleStatusCounts.map((item) => (
                  <div className="flex items-center justify-between text-sm text-white/80" key={item.key}>
                    <span>{formatLabel(item.key)}</span>
                    <span className="font-semibold text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Member coverage</p>
              <div className="mt-4 grid gap-3">
                {payload.live.memberRoleCounts.map((item) => (
                  <div className="flex items-center justify-between text-sm text-white/80" key={item.key}>
                    <span>{formatLabel(item.key)}</span>
                    <span className="font-semibold text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="sm-proof-card md:col-span-2">
              <p className="font-semibold text-white">Runnable commands</p>
              <div className="mt-4 grid gap-3">
                {payload.live.commands.length ? (
                  payload.live.commands.map((command) => (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={command.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{command.label}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{command.detail}</p>
                        </div>
                      </div>
                      <code className="mt-3 block overflow-x-auto rounded-xl bg-black/40 px-3 py-2 text-xs text-sky-200">{command.command}</code>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--sm-muted)]">No commands are advertised by the live control layer yet.</p>
                )}
              </div>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Next moves</p>
              <div className="mt-4 grid gap-3">
                {payload.live.nextMoves.map((item) => (
                  <p className="text-sm text-[var(--sm-muted)]" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Recent audits</p>
              <div className="mt-4 grid gap-3">
                {payload.live.recentAudits.slice(0, 5).map((item, index) => (
                  <div className="text-sm text-[var(--sm-muted)]" key={`${item.eventType}-${index}`}>
                    <p className="font-semibold text-white">{item.summary || formatLabel(item.eventType)}</p>
                    <p className="mt-1">{item.detail}</p>
                    <p className="mt-1 text-white/60">{formatDateTime(item.createdAt)}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">References</p>
            <h2 className="mt-3 text-3xl font-bold text-white">This workspace is grounded in repo-native sources.</h2>
          </div>
          <span className="sm-status-pill">{payload.references.length} source files</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {payload.references.map((reference) => (
            <code className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200" key={reference}>
              {reference}
            </code>
          ))}
        </div>
      </section>
    </div>
  )
}
