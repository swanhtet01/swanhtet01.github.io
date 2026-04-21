import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { AI_FOUNDRY_CREWS, FRONTIER_MODULE_CONCEPTS } from '../lib/aiFoundryModel'
import { BUILD_TEAMS, INTERNAL_AGENT_CREWS, RELEASE_GATES, RESEARCH_CELLS, RESEARCH_PRIORITIES } from '../lib/companyBuildingModel'
import { LAB_TRACKS } from '../lib/salesControl'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import { createWorkspaceTasks, listWorkspaceTasks } from '../lib/workspaceApi'

const LAB_RESEARCH_SPRINT = LAB_TRACKS.slice(0, 4).map((track, index) => ({
  id: track.id,
  title: `Prototype ${track.name.toLowerCase()} for daily operator use`,
  owner: RESEARCH_CELLS[index % RESEARCH_CELLS.length]?.ownedBy || 'R&D cell',
  priority: 'High',
  due: 'This sprint',
  notes: `${track.loop} Graduation gap: ${track.graduation}`,
}))

const LAB_FRONTIER_SPRINT = FRONTIER_MODULE_CONCEPTS.slice(0, 4).map((module, index) => ({
  id: module.id,
  title: `Model and validate ${module.name}`,
  owner: AI_FOUNDRY_CREWS[index % AI_FOUNDRY_CREWS.length]?.name || 'Foundry crew',
  priority: 'High',
  due: 'Next sprint',
  notes: `${module.whyNow} Platform move: ${module.platformMove}`,
}))

function labTemplateId(prefix: 'research' | 'frontier', taskId: string) {
  return `lab:${prefix}:${taskId}`
}

export function LabPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [executionMessage, setExecutionMessage] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [seedResearchBusy, setSeedResearchBusy] = useState(false)
  const [seedFrontierBusy, setSeedFrontierBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open the internal R&D workspace.',
        previewMessage: 'R&D command is only available in the authenticated workspace.',
      })

      if (!cancelled) {
        setAccess(nextAccess)
      }
    }

    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="R&D command"
          title="Loading research, crew, and frontier-module controls."
          description="Checking workspace access for the internal R&D desk."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="R&D command"
          title="Authenticated workspace required."
          description="This desk is reserved for the live internal workspace and does not run in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'R&D command is only available in the authenticated workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/lab">
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

  if (access.authenticated && !access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="R&D command"
          title="Tenant-admin access required."
          description="This desk is reserved for internal product, platform, and rollout roles that can approve research bets and module graduation."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask a tenant admin or platform admin to grant the control scopes for internal R&D work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open my queue
            </Link>
          </div>
        </section>
      </div>
    )
  }

  async function handleSeedSprint(prefix: 'research' | 'frontier') {
    const taskPack = prefix === 'research' ? LAB_RESEARCH_SPRINT : LAB_FRONTIER_SPRINT
    const setBusy = prefix === 'research' ? setSeedResearchBusy : setSeedFrontierBusy
    setBusy(true)
    setExecutionMessage(null)
    setExecutionError(null)
    try {
      const taskBoard = await listWorkspaceTasks(undefined, 200)
      const existingTemplates = new Set(
        (taskBoard.rows ?? [])
          .map((row) => String(row.template ?? '').trim())
          .filter(Boolean),
      )
      const rowsToCreate = taskPack
        .filter((task) => !existingTemplates.has(labTemplateId(prefix, task.id)))
        .map((task) => ({
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          due: task.due,
          status: 'open',
          notes: task.notes,
          template: labTemplateId(prefix, task.id),
        }))

      if (!rowsToCreate.length) {
        setExecutionMessage(prefix === 'research' ? 'R&D experiment sprint is already seeded into the workspace queue.' : 'Frontier prototype sprint is already seeded into the workspace queue.')
        return
      }

      const payload = await createWorkspaceTasks(rowsToCreate)
      const savedCount = Number(payload.saved_count ?? payload.rows?.length ?? rowsToCreate.length)
      setExecutionMessage(
        prefix === 'research'
          ? `Seeded ${savedCount} R&D experiment tasks into the workspace queue.`
          : `Seeded ${savedCount} frontier prototype tasks into the workspace queue.`,
      )
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Could not seed the lab task pack right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="R&D command"
        title="Run research, experiments, and frontier module bets from one desk."
        description="This is the operating surface for SUPERMEGA R&D: active experiment loops, named research cells, bounded AI crews, and the graduation gates that decide what becomes a real product."
      />

      {access.error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error}</p>
        </section>
      ) : null}

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Execution controls</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Turn R&D theory into assigned work.</h2>
            <p className="mt-3 max-w-3xl text-sm text-[var(--sm-muted)]">
              Seed the current experiment sprint and frontier prototype sprint straight into the workspace queue so the research cells and foundry crews work from the same operating board.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={seedResearchBusy} onClick={() => void handleSeedSprint('research')} type="button">
              {seedResearchBusy ? 'Seeding research sprint...' : 'Seed research sprint'}
            </button>
            <button className="sm-button-secondary" disabled={seedFrontierBusy} onClick={() => void handleSeedSprint('frontier')} type="button">
              {seedFrontierBusy ? 'Seeding prototype sprint...' : 'Seed prototype sprint'}
            </button>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>
        </div>
        {executionMessage ? <div className="mt-4 sm-chip text-white">{executionMessage}</div> : null}
        {executionError ? <div className="mt-4 sm-chip text-white">{executionError}</div> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: 'Active loops',
            value: `${LAB_TRACKS.length}`,
            detail: 'Experiment threads currently being hardened into durable product behavior.',
          },
          {
            label: 'Research cells',
            value: `${RESEARCH_CELLS.length}`,
            detail: 'Named problem-solving units with explicit inputs, outputs, and portfolio support.',
          },
          {
            label: 'Frontier modules',
            value: `${FRONTIER_MODULE_CONCEPTS.length}`,
            detail: 'Next product lines pulled from incumbent teardown and runtime capability expansion.',
          },
          {
            label: 'Autonomous crews',
            value: `${INTERNAL_AGENT_CREWS.length}`,
            detail: 'Internal AI crews with bounded write scopes and promotion gates.',
          },
        ].map((item) => (
          <article className="sm-metric-card" key={item.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Research mandate</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Research should produce build-ready wedges.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            The lab exists to convert painful workflow reality, weak incumbent software, and tenant friction into concrete modules with a named owner and a route to production.
          </p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Failure mode</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Abstract R&D becomes slideware.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            If experiments are not attached to operator replay, source depth, and release gates, they become a pile of interesting ideas that never improve the product or help win clients.
          </p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating response</p>
          <h2 className="mt-3 text-2xl font-bold text-white">One desk governs bets, crews, and graduation.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            The R&D command layer ties experiment loops, research cells, AI workforce charters, and frontier modules into one machine that can decide what to prototype, what to kill, and what to promote.
          </p>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Active experiment board</p>
            <h2 className="mt-3 text-3xl font-bold text-white">These loops are worth building only if they graduate cleanly.</h2>
          </div>
          <span className="sm-status-pill">R&D should feed product, not distract from it</span>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {LAB_TRACKS.map((track) => (
            <article className="sm-proof-card" key={track.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">Experiment loop</p>
              <h3 className="mt-2 text-2xl font-bold text-white">{track.name}</h3>
              <div className="mt-4 grid gap-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Loop</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.loop}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Why now</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.why}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Graduation gap</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.graduation}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Research cells</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Every R&D unit needs a mandate, owner, and output contract.</h2>
          <div className="mt-6 grid gap-4">
            {RESEARCH_CELLS.map((cell) => (
              <article className="sm-proof-card" key={cell.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{cell.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.mandate}</p>
                  </div>
                  <span className="sm-status-pill">{cell.ownedBy}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Supports: {cell.supports.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Inputs: {cell.inputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {cell.outputs.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Research priorities</p>
          <h2 className="mt-3 text-3xl font-bold text-white">These priorities compound the whole platform, not just one app.</h2>
          <div className="mt-6 grid gap-4">
            {RESEARCH_PRIORITIES.map((priority) => (
              <article className="sm-proof-card" key={priority.id}>
                <p className="font-semibold text-white">{priority.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{priority.thesis}</p>
                <p className="mt-3 text-sm text-white/80">Graduation: {priority.graduation}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The product company needs named teams, not one vague AI bucket.</h2>
          <div className="mt-6 grid gap-4">
            {BUILD_TEAMS.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{team.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                  </div>
                  <span className="sm-status-pill">{team.workspace}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Owns: {team.ownership.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {team.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">AI pods: {team.agentPods.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Success: {team.metric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomous crews</p>
          <h2 className="mt-3 text-3xl font-bold text-white">These crews can research, score, and prepare work without losing control.</h2>
          <div className="mt-6 grid gap-4">
            {INTERNAL_AGENT_CREWS.map((crew) => (
              <article className="sm-proof-card" key={crew.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{crew.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                  </div>
                  <span className="sm-status-pill">{crew.workspace}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Reads: {crew.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Writes: {crew.writeScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Cadence: {crew.cadence}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {crew.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Frontier module queue</p>
            <h2 className="mt-3 text-3xl font-bold text-white">These are the next product bets worth pulling into the machine.</h2>
          </div>
          <span className="sm-status-pill">{AI_FOUNDRY_CREWS.length} foundry crew templates</span>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {FRONTIER_MODULE_CONCEPTS.map((module) => (
            <article className="sm-proof-card" key={module.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{module.category}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{module.name}</h3>
                </div>
                <Link className="sm-link" to={module.route}>
                  Open related desk
                </Link>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{module.whyNow}</p>
              <p className="mt-3 text-sm text-white/80">Strategic bet: {module.thesis}</p>
              <p className="mt-2 text-sm text-white/80">Platform move: {module.platformMove}</p>
              <p className="mt-2 text-sm text-white/80">Borrowed from: {module.borrowedFrom.join(', ')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Graduation gates</p>
          <h2 className="mt-3 text-3xl font-bold text-white">A prototype is not a product until it clears these gates.</h2>
          <div className="mt-6 grid gap-4">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-proof-card" key={gate.id}>
                <p className="font-semibold text-white">{gate.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-3 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next operator moves</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use the neighboring desks to turn R&D into execution.</h2>
          <div className="mt-6 grid gap-3">
            {[
              {
                title: 'Open Build Studio',
                detail: 'See the current factory portfolio, launch work, and module programs.',
                route: '/app/factory',
              },
              {
                title: 'Open Foundry Release Desk',
                detail: 'Score readiness, hackathon tracks, and module promotion posture.',
                route: '/app/foundry',
              },
              {
                title: 'Open Agent Ops',
                detail: 'Review live teams, runtime state, and bounded autonomy contracts.',
                route: '/app/teams',
              },
              {
                title: 'Open Control Workbench',
                detail: 'Convert research, platform, and delivery pressure into staffed execution tracks.',
                route: '/app/workbench',
              },
            ].map((item) => (
              <Link className="sm-command-row" key={item.title} to={item.route}>
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
