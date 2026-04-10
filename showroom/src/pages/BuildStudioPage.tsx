import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  BUILD_TEAMS,
  BUILD_WORKSPACES,
  COMPETITIVE_FRONTS,
  INTERNAL_AGENT_CREWS,
  MODULE_FACTORY_STAGES,
  MODULE_PROGRAMS,
  RELEASE_GATES,
  RESEARCH_CELLS,
  RESEARCH_PRIORITIES,
} from '../lib/companyBuildingModel'

export function BuildStudioPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Build system"
        title="How SUPERMEGA.dev builds and scales."
        description="The point is not to keep making isolated demos. The point is to turn painful workflows into live customer systems, then into reusable products with stronger connectors, controls, and rollout discipline."
      />

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating thesis</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">The advantage is not one giant suite. The advantage is turning workflow pain into products faster.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Find a workflow where old software is already failing the operator.',
              'Land a small live version with real files, users, and approvals.',
              'Product teams turn what repeats into reusable software.',
              'Connector, data, and control teams keep the core system stronger after launch.',
            ].map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>How products move from pilot to standard release</span>
            <span>Each stage has real artifacts, not vague product ambition</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {MODULE_FACTORY_STAGES.map((stage, index) => (
              <div className="sm-demo-mini" key={stage.id}>
                <strong>
                  {index + 1}. {stage.name}
                </strong>
                <span>{stage.detail}</span>
                <small className="text-[var(--sm-muted)]">Artifacts: {stage.artifacts.join(', ')}</small>
              </div>
            ))}
          </div>
          <div className="sm-site-proof-foot">
            <span>The win comes from making this loop faster, safer, and more repeatable than the incumbents.</span>
            <Link className="sm-link" to="/products">
              Explore live modules
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product ownership</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each program ships with a named owner, a release train, a real customer rollout, and a clear next decision.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This is the build rule we bring to the market: assign ownership, keep the proofs honest, and measure the next move inside the same surface.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={`product-owner-${program.id}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-2 text-sm text-white/80">{program.commercialStory}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {program.modules.map((module) => (
                  <span key={`${program.id}-${module}`}>{module}</span>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/70">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/70">Internal crews: {program.agentCrews.join(', ')}</p>
              <p className="mt-2 text-sm text-white/70">Live tenant: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/70">Next move: {program.nextMove}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Why clients care</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A better build model creates better rollout results.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This internal structure matters because clients do not want a nice demo. They want faster rollout, cleaner ownership, safer automation, and a system that can keep improving after launch.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            'Start from one painful workflow instead of a giant transformation project.',
            'Use real files, inboxes, exports, and roles early so rollout risk shows up before launch.',
            'Promote only the modules that survive tenant reality and release gates.',
            'Keep connectors, policy, and agent crews deepening the runtime after go-live.',
          ].map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item}>
              <strong>Client result</strong>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Human teams own the product areas. Agent teams keep the build system moving.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The internal company should already look like the platform we want to sell: bounded ownership, named workspaces, review rituals, and module
            promotion criteria.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {BUILD_TEAMS.map((team) => (
            <article className="sm-demo-link sm-demo-link-card" key={team.id}>
              <span className="sm-home-proof-label">{team.workspace}</span>
              <strong>{team.name}</strong>
              <span>{team.mission}</span>
              <small className="text-[var(--sm-muted)]">Owns: {team.ownership.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Agent crews: {team.agentPods.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Cadence: {team.rituals.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Success: {team.metric}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Build workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each workspace exists to move one type of work forward.</h2>
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

        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomous teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agents should be employed into bounded workspaces with explicit access and gates.</h2>
          <div className="mt-6 grid gap-3">
            {INTERNAL_AGENT_CREWS.map((crew) => (
              <article className="sm-chip text-white" key={crew.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{crew.name}</p>
                  <span className="sm-status-pill">{crew.cadence}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                <p className="mt-2 text-sm text-white/80">Workspace: {crew.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Read: {crew.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write: {crew.writeScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {crew.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A product company needs named research teams, not one vague catch-all team.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These cells translate raw company signal into connector depth, workflow contracts, knowledge canon, decision systems, and safe autonomy.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product programs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the product lines that can actually challenge the suite vendors.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Keep each program tied to a target category, a real customer rollout, and a precise next move. That is how the roadmap stays commercial instead
            of becoming a vague innovation list.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <span>{program.target}</span>
              <small className="text-[var(--sm-muted)]">{program.commercialStory}</small>
              <small className="text-[var(--sm-muted)]">Market: {program.market}</small>
              <small className="text-[var(--sm-muted)]">Build team: {program.researchCell}</small>
              <small className="text-[var(--sm-muted)]">Starts with: {program.starterWedge}</small>
              <small className="text-[var(--sm-muted)]">Release train: {program.releaseTrain}</small>
              <small className="text-[var(--sm-muted)]">Live tenant: {program.tenantProof}</small>
              <small className="text-[var(--sm-muted)]">Modules: {program.modules.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Internal crews: {program.agentCrews.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Differentiator: {program.differentiator}</small>
              <small className="text-[var(--sm-muted)]">Success signals: {program.successSignals.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Adds next: {program.nextReleases.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Do not let strong demos masquerade as finished enterprise modules.</h2>
          <div className="mt-6 grid gap-3">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-proof-card" key={gate.id}>
                <p className="font-semibold text-white">{gate.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-3 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Priority infrastructure</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the infrastructure bets that make the platform stronger.</h2>
          <div className="mt-6 grid gap-3">
            {RESEARCH_PRIORITIES.map((priority) => (
              <article className="sm-chip text-white" key={priority.id}>
                <p className="font-semibold">{priority.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{priority.thesis}</p>
                <p className="mt-2 text-sm text-white/80">Graduation: {priority.graduation}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Competitive fronts</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">SUPERMEGA.dev wins by shipping narrower, learning faster, and sharing more of the core system.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The strategy is not one more suite. It is a faster build system that turns real operator pain into live modules before the big vendors can
            respond.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {COMPETITIVE_FRONTS.map((front) => (
            <article className="sm-demo-link sm-demo-link-card" key={front.id}>
              <span className="sm-home-proof-label">{front.name}</span>
              <strong>{front.incumbents}</strong>
              <span>{front.supermegaAngle}</span>
              <small className="text-[var(--sm-muted)]">{front.whyItMatters}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Run the company like a product build system with release gates, not like a demo shop.</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            The next compounding move is to keep routing research, pilots, product promotion, connector depth, and tenant launches through the same
            operating layer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/agents">
            See Agent Teams
          </Link>
          <Link className="sm-button-secondary" to="/portfolio">
            View portfolio
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See Enterprise Setup
          </Link>
          <Link className="sm-button-secondary" to="/clients/yangon-tyre">
            Open tenant example
          </Link>
        </div>
      </section>
    </div>
  )
}
