import { Link } from 'react-router-dom'

import { enterpriseSignals, metaTools, ytfDeployment } from '../content'
import { PageIntro } from '../components/PageIntro'
import { BUILD_TEAMS, MODULE_FACTORY_STAGES, RESEARCH_PRIORITIES } from '../lib/companyBuildingModel'
import { PLATFORM_LAYER_DETAILS, STARTER_PACK_DETAILS } from '../lib/salesControl'

const disruptionPoints = [
  'Replace CRM + spreadsheet + chat handoff with one owned queue per job.',
  'Keep files, approvals, decisions, and follow-up attached to the same record.',
  'Let agents prepare work, while humans keep approval over the risky writes.',
]

const memoryPrinciples = [
  'Company memory should store accounts, files, tasks, decisions, and workflow state together.',
  'Uploads, Drive files, inbox threads, and notes should become reusable records instead of dead attachments.',
  'The same records should power operator queues, management review, and agent jobs.',
]

const runtimePrinciples = [
  'Use one connector layer for Gmail, Drive, Sheets, CSV, ERP exports, uploads, and APIs.',
  'Use one workflow layer for ownership, timers, approvals, escalations, and handoffs.',
  'Use one agent layer for cleanup, triage, monitoring, summaries, and follow-up.',
  'Use one control layer for tenant access, roles, audit, and health checks.',
]

const currentGaps = [
  'Deeper tenant isolation is still needed across every operational table, not only workspace members, tasks, and agent runs.',
  'RBAC is still coarse. Module-level policy, row-level access, SSO, and MFA are the next enterprise layer.',
  'Google connectors are live for draft, export, link, and import workflows, but not yet full bidirectional sync everywhere.',
  'Company memory is real today. A deeper knowledge-graph layer is still roadmap, not shipped.',
]

const openBuildPrinciples = [
  'Shared runtime pieces can be opened without exposing tenant workflows or customer data.',
  'Internal tools, client workspaces, and operator modules should keep sharing the same platform base.',
  'The clean split is reusable framework in public code and tenant-specific models, workflows, and connectors in private deployments.',
]

export function PlatformNarrativePage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Enterprise setup"
        title="One system for live products, tenant workspaces, and internal operations."
        description="Start with one live product. Keep roles, approvals, audit, connectors, and agent jobs on the same base. Use that base for your own company, your internal tools, and named client tenants."
      />

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Why this matters</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">The goal is to replace tool sprawl, not decorate it.</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            Most teams still split one process across CRM, sheets, inboxes, shared drives, chat approvals, and status meetings. SUPERMEGA.dev keeps the
            work in one operating layer shaped around the company itself.
          </p>

          <div className="mt-6 space-y-3">
            {disruptionPoints.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>Platform layers</span>
            <span>Products + shared records + controls</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {PLATFORM_LAYER_DETAILS.map((item) => (
              <div className="sm-demo-mini" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
          <div className="sm-site-proof-foot">
            <span>Start from one live product, then expand through the same base instead of buying another SaaS category.</span>
            <div className="flex flex-wrap gap-4">
              <Link className="sm-link" to="/factory">
                See Build
              </Link>
              <Link className="sm-link" to="/products">
                Explore products
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">What is already real</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">The app already has live modules, tenant detection, roles, and agent operations.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              The strongest live entry points today are the public products plus the internal app surfaces for approvals, decisions, receiving, metrics,
              documents, director review, and agent teams.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STARTER_PACK_DETAILS.map((pack) => (
              <article className="sm-demo-link sm-demo-link-card" key={pack.id}>
                <strong>{pack.name}</strong>
                <span>{pack.promise}</span>
                <small className="text-[var(--sm-muted)]">Starts with: {pack.starterModules.join(' + ')}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Company memory</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Shared records first, deeper knowledge layer second.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Today the honest claim is structured company memory: records, files, notes, decisions, and workflow state in one system. That is enough to
              power queues, briefs, and agent jobs now. A deeper knowledge graph can come later.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {memoryPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Connectors and runtime</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Connect real company inputs without pretending the stack is magic.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              The current system is strongest at imports, exports, file intake, app state, Gmail draft workflows, Drive links, and API-backed queues. It
              is not yet full bidirectional sync for every source, and the site should stay honest about that.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {runtimePrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise controls</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">This is the control layer under the products.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Roles, approvals, audit, connector health, and tenant workspaces are part of the platform model, not optional extras.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {enterpriseSignals.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Internal meta tools</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">The internal control layer is also part of the product strategy.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              The rollout tools, agent controls, and director views should live in the same app so implementation work and customer work do not drift
              apart.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metaTools.map((item) => (
              <article className="sm-demo-link sm-demo-link-card" key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/factory">
              Open Build
            </Link>
            <Link className="sm-button-secondary" to="/agents">
              See Agent Teams
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              See tenant blueprint
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Efficient build order</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Do not build everything at once. Graduate one workflow at a time.</h2>
          <div className="mt-6 space-y-3">
            {MODULE_FACTORY_STAGES.map((stage, index) => (
              <article className="sm-proof-card" key={stage.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">
                    {index + 1}. {stage.name}
                  </p>
                  <span className="sm-status-pill">{stage.artifacts.join(' / ')}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{stage.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution teams</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Keep the teams narrow so the platform compounds instead of fragmenting.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {BUILD_TEAMS.map((team) => (
              <article className="sm-demo-mini" key={team.id}>
                <strong>{team.name}</strong>
                <span>{team.mission}</span>
                <small className="text-[var(--sm-muted)]">Owns: {team.ownership.join(', ')}</small>
                <small className="text-[var(--sm-muted)]">Success: {team.metric}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Named tenant example</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">{ytfDeployment.domain}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{ytfDeployment.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/clients/yangon-tyre">
                Open tenant blueprint
              </Link>
              <Link className="sm-button-secondary" to="/login">
                Open tenant workspace
              </Link>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="sm-demo-mini">
              <strong>Modules</strong>
              <span>{ytfDeployment.modules.join(', ')}</span>
            </article>
            <article className="sm-demo-mini">
              <strong>Roles</strong>
              <span>{ytfDeployment.roles.join(', ')}</span>
            </article>
            <article className="sm-demo-mini">
              <strong>Data sources</strong>
              <span>{ytfDeployment.dataSources.join(', ')}</span>
            </article>
            <article className="sm-demo-mini">
              <strong>Agent teams</strong>
              <span>{ytfDeployment.agentTeams.join(', ')}</span>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-home-process-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">What grows next</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">The next enterprise layer is clear.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              The current stack is real enough to show as a branded pilot deployment. The next work is deeper isolation, stronger policy, and more
              durable connector and memory layers.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {currentGaps.map((item) => (
              <div className="sm-demo-mini" key={item}>
                <strong>Next gap</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Highest-value next work</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">The next platform work should deepen the runtime, not add more marketing pages.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The fastest path to more value is connector depth, stronger governance, and better agent reliability around the modules that already exist.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {RESEARCH_PRIORITIES.map((priority) => (
            <article className="sm-demo-link sm-demo-link-card" key={priority.id}>
              <strong>{priority.name}</strong>
              <span>{priority.thesis}</span>
              <small className="text-[var(--sm-muted)]">Done when: {priority.graduation}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Open build model</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Open runtime and private tenants can coexist.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              If the strategy includes open-source work, the right split is reusable runtime in public and tenant-specific workflows, connectors, and data
              in private deployments.
            </p>
          </div>
          <div className="space-y-3">
            {openBuildPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Choose the first workflow or tenant that should become software.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              Bring the process, the files, and the people involved. We will map the first live module, the roles, the controls, and the rollout order.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Start rollout
            </Link>
            <Link className="sm-button-secondary" to="/factory">
              See Build
            </Link>
            <Link className="sm-button-secondary" to="/agents">
              See Agent Teams
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See live products
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
