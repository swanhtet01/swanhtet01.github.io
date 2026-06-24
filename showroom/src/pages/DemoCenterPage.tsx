import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { PLATFORM_BUILD_STACK } from '../lib/platformBuildStack'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'

const featuredPacks = STARTER_PACK_DETAILS.slice(0, 3)
const primaryPack = STARTER_PACK_DETAILS[0]!

const proofAgenda = [
  {
    label: '1. Current pain',
    detail: 'Start by naming the spreadsheet, inbox, or exception loop the buyer already hates.',
  },
  {
    label: '2. Working screen',
    detail: 'Open the product screen that replaces that work and show one clean workflow from input to owner.',
  },
  {
    label: '3. Connected evidence',
    detail: 'Show the files, email, exports, or uploads that stay attached to the work instead of living beside it.',
  },
  {
    label: '4. Controlled rollout',
    detail: 'Close with the first team, the first workflow, and the next expansion step only after daily use is proven.',
  },
] as const

const buyerProof = [
  {
    label: 'What is live',
    title: 'Working software, not a concept deck',
    detail: 'Every module shown here maps to a route, a buyer workflow, and a productized first rollout.',
  },
  {
    label: 'What connects',
    title: 'Current tools feed the same system',
    detail: 'Gmail, Drive, Sheets, CSV, and exported records stay attached to the work instead of being left in side folders.',
  },
  {
    label: 'What expands',
    title: 'The rollout grows from the first workflow',
    detail: 'Approvals, role screens, writeback, and prepared checks come after the first daily workflow is trusted.',
  },
] as const

const liveEntryPattern = [
  {
    label: 'Team home',
    value: '/app/portal',
    detail: 'Role-based start screen for the customer team.',
  },
  {
    label: 'Manager System',
    value: '/app/manager-system',
    detail: 'Factory manager home for the daily operating loop.',
  },
  {
    label: 'Factory Operations App',
    value: '/app/operations',
    detail: 'Inbound issues, exceptions, approvals, and supplier chase.',
  },
  {
    label: 'DQMS desk',
    value: '/app/dqms',
    detail: 'Incidents, CAPA, root cause, and closeout discipline.',
  },
] as const

const featuredModules = SOFTWARE_MODULE_DETAILS.filter((item) => item.featured).slice(0, 6)

export function DemoCenterPage() {
  return (
    <div className="space-y-10 pb-16">
      <PageIntro
        eyebrow="Product proof"
        title="Show the product in one clean workflow."
        description="Lead with the job being replaced, show the working screen, then close on a narrow rollout that can be used on day one."
      />

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div className="space-y-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Meeting flow</p>
            <h2 className="text-4xl font-bold tracking-tight text-white lg:text-6xl">Show the product like software, not a platform lecture.</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Buyers should leave knowing the manual work it replaces, the screen that proves it, and the first workflow their team can run.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={primaryPack.proofTool.route}>
                Open primary proof
              </Link>
              <Link className="sm-button-secondary" to="/products">
                Review products
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Book rollout
              </Link>
            </div>
          </div>

          <article className="sm-site-proof-panel overflow-hidden">
            <div className="relative">
              <img
                alt={`${primaryPack.name} live screenshot`}
                className="aspect-[16/10] w-full object-cover object-top"
                decoding="async"
                fetchPriority="high"
                src={primaryPack.image}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020612] via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="sm-kicker text-[var(--sm-accent)]">{primaryPack.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{primaryPack.name}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">{primaryPack.promise}</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Agenda</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Four moves are enough.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            If the proof path needs more than this, it is probably trying to sell complexity instead of value.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {proofAgenda.map((item) => (
            <article className="sm-proof-card" key={item.label}>
              <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live proof</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use one working screen as the hero.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Start with the workflow that matches the buyer's current pain. The broader rollout becomes believable after that.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {featuredPacks.map((pack) => (
            <article className="sm-demo-link sm-demo-link-card" key={pack.slug}>
              <div className="relative h-48 overflow-hidden rounded-2xl bg-slate-900/60">
                <img alt={pack.name} className="h-full w-full object-cover" decoding="async" src={pack.image} />
              </div>
              <p className="sm-home-proof-label">{pack.audience}</p>
              <strong className="text-lg">{pack.name}</strong>
              <span>{pack.promise}</span>
              <div className="flex flex-wrap gap-2 pt-2">
                {pack.launchDeliverables.slice(0, 3).map((deliverable) => (
                  <span className="sm-status-pill text-[var(--sm-accent)]" key={`${pack.slug}-${deliverable}`}>
                    {deliverable}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className="sm-link" to={pack.proofTool.route}>
                  Open live route
                </Link>
                <Link className="sm-link" to={`/products/${pack.slug}`}>
                  Review setup
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Operator entry pattern</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Show the working route, not fake credentials.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The buyer should understand where the team starts, what route they open, and what screen they use first. That is stronger proof than public login
            theater.
          </p>
          <div className="mt-6 grid gap-3">
            {liveEntryPattern.map((item) => (
              <div className="sm-manager-row" key={item.label}>
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-status-pill">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/portal">
              Open team route
            </Link>
            <Link className="sm-button-secondary" to="/app/manager-system">
              Open manager system
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Core software</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The offer should read like tools that replace workflows.</h2>
          <div className="mt-6 grid gap-3">
            {featuredModules.map((module) => (
              <article className="sm-proof-card" key={module.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{module.category}</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{module.name}</h3>
                  </div>
                  <span className="sm-status-pill">{module.status}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{module.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {module.surfaces.slice(0, 3).map((surface) => (
                    <span className="sm-status-pill" key={`${module.id}-${surface}`}>
                      {surface}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sm-link" to={`/products/${module.id}`}>
                    Review module
                  </Link>
                  {module.workspaceRoute ? (
                    <Link className="sm-link" to={module.workspaceRoute}>
                      Open route
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Buyer proof</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">What the buyer needs to believe.</h2>
          <div className="mt-6 grid gap-4">
            {buyerProof.map((item) => (
              <article className="sm-proof-card" key={item.label}>
                <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                <h3 className="mt-3 text-2xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Customer proof</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Make the enterprise story concrete without exposing client work.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Use a private customer workspace to show that the same product model scales into role screens, connected records, approvals, and controlled AI support.
          </p>
          <div className="mt-6 grid gap-3">
            {[
              'Private customer host with isolated workspace routing',
              'Role-based manager, operations, quality, and maintenance views',
              'Data fabric, writeback, review loops, and prepared checks on one operating layer',
            ].map((item, index) => (
              <div className="sm-manager-rule" key={item}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <p className="text-sm leading-relaxed text-white/92">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/products">
              Open products
            </Link>
            <Link className="sm-button-secondary" to="/contact?package=Private%20tenant%20portal">
              Start customer rollout
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">R&D stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use stronger infrastructure where it changes the offering.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Keep the product simple on the surface. Upgrade the runtime only where it makes customer rollout, agent control, or knowledge quality materially better.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {PLATFORM_BUILD_STACK.map((item) => (
            <article className="sm-proof-card" key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">{item.stage}</p>
                <span className="sm-status-pill">{item.primaryTool}</span>
              </div>
              <h3 className="mt-3 text-2xl font-bold text-white">{item.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.summary}</p>
              <p className="mt-4 text-sm leading-relaxed text-white/80">{item.outcome}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the live screen, show the current input, then scope the first rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to={primaryPack.proofTool.route}>
            Open private proof
          </Link>
          <Link className="sm-button-secondary" to="/products">
            Review products
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Request rollout
          </Link>
        </div>
      </section>
    </div>
  )
}
