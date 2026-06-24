import { startTransition, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  getSeedAdoptionCommandDataset,
  loadAdoptionCommandDataset,
  type AdoptionCommandDataset,
  type AdoptionRuntimeStatus,
} from '../lib/adoptionCommandApi'
import { YANGON_TYRE_ADOPTION_DIALECTIC } from '../lib/yangonTyreAdoptionModel'
import { getTenantConfig } from '../lib/tenantConfig'
import { createWorkspaceTasks, getWorkspaceSession, runDefaultAgentJobs } from '../lib/workspaceApi'

function toneForStatus(status: AdoptionRuntimeStatus) {
  if (status === 'Healthy') {
    return 'text-emerald-300'
  }
  if (status === 'Warning' || status === 'Mapped') {
    return 'text-amber-300'
  }
  if (status === 'Needs wiring' || status === 'Degraded') {
    return 'text-rose-300'
  }
  return 'text-white/80'
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function dueDateFromNow(days: number) {
  const next = new Date()
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

export function AdoptionCommandPage() {
  const tenant = getTenantConfig()
  const [dataset, setDataset] = useState<AdoptionCommandDataset>(() => getSeedAdoptionCommandDataset())
  const [taskBusy, setTaskBusy] = useState(false)
  const [loopBusy, setLoopBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextDataset = await loadAdoptionCommandDataset()
      if (!cancelled) {
        startTransition(() => {
          setDataset(nextDataset)
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const atRiskRolePacks = useMemo(
    () => dataset.rolePacks.filter((item) => item.status !== 'Healthy' || item.staleCount > 0).slice(0, 4),
    [dataset.rolePacks],
  )
  const attentionSurfaceCount = dataset.surfaceHealth.filter((item) => item.status !== 'Healthy' || item.staleCount > 0).length

  async function handleCreateReviewTasks() {
    setTaskBusy(true)
    setMessage(null)
    try {
      const session = await getWorkspaceSession()
      if (!session.authenticated) {
        throw new Error('Login is required before review tasks can be created.')
      }

      const rows = atRiskRolePacks.map((pack) => ({
        title: `Stabilize ${pack.role} adoption in ${pack.home}`,
        owner: pack.role,
        priority: pack.adoptionScore < 70 ? 'high' : 'medium',
        due: dueDateFromNow(pack.adoptionScore < 70 ? 1 : 2),
        status: 'open',
        notes: `${pack.nextEscalation}\nBlockers: ${pack.blockers.join(' / ')}\nMoves: ${pack.changeMoves.join(' / ')}`,
        template: 'adoption_command_review',
      }))

      if (!rows.length) {
        setMessage('No role packs need review tasks right now.')
        return
      }

      const payload = await createWorkspaceTasks(rows)
      setMessage(`Created ${payload.saved_count ?? rows.length} adoption review task${(payload.saved_count ?? rows.length) === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not create review tasks right now.')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleRefreshLoops() {
    setLoopBusy(true)
    setMessage(null)
    try {
      await runDefaultAgentJobs(['ops_watch', 'task_triage', 'founder_brief'])
      const nextDataset = await loadAdoptionCommandDataset()
      startTransition(() => {
        setDataset(nextDataset)
      })
      setMessage('Refreshed enforcement loops and reloaded adoption command.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not refresh the adoption loops right now.')
    } finally {
      setLoopBusy(false)
    }
  }

  if (tenant.key !== 'ytf-plant-a') {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Adoption command"
          title="Adoption Command is currently configured for the Yangon Tyre tenant."
          description="This command surface measures role usage, writeback quality, review rituals, and agent reinforcement across the live enterprise portal."
        />

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What it is</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The runtime for staff usage, role clarity, and management review.</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
              It links data entry discipline, role-specific stories, queue freshness, and agent reinforcement into one operating surface.
            </p>
          </article>
          <article className="sm-surface-deep p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Next rooms</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/adoption">
                Open playbook
              </Link>
              <Link className="sm-button-secondary" to="/app/workforce">
                Open workforce
              </Link>
            </div>
          </article>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Adoption command"
        title="Run staff usage, data discipline, and role storytelling as one enterprise control loop."
        description="This is the working adoption layer for ytf.supermega.dev: live role scoring, writeback health, manager rituals, and agent reinforcement tied back to actual Yangon Tyre workspace records."
      />

      <section className="grid gap-4 md:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Overall score</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.overallScore}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Combined role readiness, surface health, and agent reinforcement.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Healthy roles</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.healthyRoleCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Role packs with healthy freshness and adoption score.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Warning roles</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.warningRoleCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Roles drifting in completeness, freshness, or manager follow-through.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Degraded roles</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.degradedRoleCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Roles that need intervention now.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Live surfaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.liveSurfaceCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Writeback lanes already showing live operational traffic.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent coverage</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.agentCoverageScore}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">How well reinforcement loops are keeping the portal active.</p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-semibold">{dataset.source === 'live' ? 'Live adoption command connected to workspace state.' : 'Using the seeded adoption command model.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Updated: {formatDateTime(dataset.updatedAt)}. {atRiskRolePacks.length} role packs currently need attention. {attentionSurfaceCount} writeback lanes need review.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={taskBusy} onClick={() => void handleCreateReviewTasks()} type="button">
              {taskBusy ? 'Creating tasks...' : 'Create review tasks'}
            </button>
            <button className="sm-button-secondary" disabled={loopBusy} onClick={() => void handleRefreshLoops()} type="button">
              {loopBusy ? 'Refreshing...' : 'Refresh loops'}
            </button>
            <Link className="sm-button-secondary" to="/app/adoption">
              Open playbook
            </Link>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-[var(--sm-muted)]">{message}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating intent</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use the portal as the operating path.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_ADOPTION_DIALECTIC.thesis}</p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Current friction</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Manager behavior still decides whether entry matters.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_ADOPTION_DIALECTIC.antithesis}</p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Manager response</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Score the people loop the same way you score operations.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_ADOPTION_DIALECTIC.synthesis}</p>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role command packs</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Each role now has a live score, a freshness signal, and a manager escalation path.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/workforce">
              Workforce command
            </Link>
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Data fabric
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {dataset.rolePacks.map((pack) => (
            <article className="sm-proof-card" key={pack.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{pack.role}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{pack.home}</h3>
                </div>
                <div className="text-right">
                  <span className={`sm-status-pill ${toneForStatus(pack.status)}`}>{pack.status}</span>
                  <p className="mt-3 text-2xl font-bold text-white">{pack.adoptionScore}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{pack.frequency}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Live items</p>
                  <p className="mt-2 text-xl font-bold">{pack.liveCount}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Stale items</p>
                  <p className="mt-2 text-xl font-bold">{pack.staleCount}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Completeness</p>
                  <p className="mt-2 text-xl font-bold">{pack.completenessScore}%</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Must capture</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pack.mustCapture.map((item) => (
                      <span className="sm-status-pill" key={`${pack.id}-capture-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Stories and agent pods</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    <p>Stories: {pack.linkedStories.join(' / ') || 'Not linked yet'}</p>
                    <p>Pods: {pack.agentPods.join(' / ') || 'Not assigned yet'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Blockers</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {pack.blockers.map((item) => (
                      <p key={`${pack.id}-blocker-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager escalation</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{pack.nextEscalation}</p>
                  <p className="mt-3 text-sm text-white/80">Last activity: {formatDateTime(pack.lastActivityAt)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-link" to={pack.route}>
                  Open role home
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Writeback surface health</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The system stays alive only if the capture lanes stay healthy.</h2>
          <div className="mt-6 grid gap-4">
            {dataset.surfaceHealth.map((surface) => (
              <article className="sm-proof-card" key={surface.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{surface.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{surface.users.join(' / ')}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(surface.status)}`}>{surface.status}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Live rows</p>
                    <p className="mt-2 text-xl font-bold">{surface.liveCount}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Attention</p>
                    <p className="mt-2 text-xl font-bold">{surface.staleCount}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Completeness</p>
                    <p className="mt-2 text-xl font-bold">{surface.completenessScore}%</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Quality rules</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{surface.qualityRules.join(' / ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Automation</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{surface.automation}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/80">Manager rule: {surface.managerRule}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Last activity: {formatDateTime(surface.lastActivityAt)}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sm-link" to={surface.route}>
                    Open lane
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager rituals</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Review rituals are the enforcement mechanism, not an afterthought.</h2>
          <div className="mt-6 grid gap-4">
            {dataset.rituals.map((ritual) => (
              <article className="sm-proof-card" key={ritual.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{ritual.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {ritual.owner} | {ritual.cadence}
                    </p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(ritual.status)}`}>{ritual.status}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{ritual.inputs.join(' / ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{ritual.outputs.join(' / ')}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/80">{ritual.why}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ritual.freshness}. Last signal: {formatDateTime(ritual.lastSignalAt)}.</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ritual.backlog}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sm-link" to={ritual.route}>
                    Open ritual desk
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Autonomous enforcement</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Agent loops keep the operating habit from decaying between meetings.</h2>
          <div className="mt-6 grid gap-4">
            {dataset.agentLoops.map((loop) => (
              <article className="sm-proof-card" key={loop.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{loop.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {loop.owner} | {loop.cadence}
                    </p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(loop.status)}`}>{loop.status}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{loop.mission}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">Focus: {loop.focus}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Last run: {formatDateTime(loop.lastRunAt)}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/teams">
              Open agent ops
            </Link>
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Big picture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The portal becomes enterprise-grade when entry, review, and reinforcement close into one loop.</h2>
          <div className="mt-6 grid gap-4">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Current truth</p>
              <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                {dataset.bigPicture.currentTruth.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Next builds</p>
              <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                {dataset.bigPicture.nextBuilds.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/data-fabric">
              Open data fabric
            </Link>
            <Link className="sm-button-secondary" to="/app/workforce">
              Open workforce
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open platform admin
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
