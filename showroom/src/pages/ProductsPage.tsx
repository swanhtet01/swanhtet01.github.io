import { Link } from 'react-router-dom'

import { enterpriseSignals, metaTools, ytfDeployment } from '../content'
import { MODULE_FACTORY_STAGES, MODULE_PROGRAMS } from '../lib/companyBuildingModel'
import { PLATFORM_LAYER_DETAILS, QUICK_WIN_PRODUCTS, STARTER_PACK_DETAILS } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const packagingModes = [
  {
    name: 'For your company',
    detail: 'Run the products as your own operating stack for queues, approvals, data flow, and automation.',
  },
  {
    name: 'For tenant workspaces',
    detail: 'Use the same modules for client, supplier, site, or department workspaces.',
  },
  {
    name: 'For internal meta tools',
    detail: 'Run rollout planning, agent operations, and director review on the same base.',
  },
  {
    name: 'For founder control',
    detail: 'Use the same system for daily review, decisions, and follow-up across the company.',
  },
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Live products first. Full company system behind them.</h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each product starts with one workflow, real data, and a live screen. Underneath, the products share roles, approvals, history, connectors,
            and agent jobs so you do not need separate tools for every step.
          </p>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Platform stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every product shares the same foundation.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              You start with one product, but the data, permissions, controls, connectors, and agent jobs stay connected behind it.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/platform">
            See enterprise setup
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLATFORM_LAYER_DETAILS.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.id}>
              <span className="sm-home-proof-label">{item.layer}</span>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
              <small className="text-[var(--sm-muted)]">{item.modules.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Ways to use it</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The same products can run your company, tenants, and internal tools.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are not only public demos. They can also become your internal operating base, your founder workspace, and your tenant delivery layer.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packagingModes.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">How products grow</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each product has a clear owner, a live use case, and a next release plan.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/portfolio">
              Open portfolio
            </Link>
            <Link className="sm-button-secondary" to="/factory">
              See Build
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {MODULE_PROGRAMS.slice(0, 3).map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <span>{program.target}</span>
              <small className="text-[var(--sm-muted)]">{program.commercialStory}</small>
              <small className="text-[var(--sm-muted)]">Market: {program.market}</small>
              <small className="text-[var(--sm-muted)]">Starts with: {program.starterWedge}</small>
              <small className="text-[var(--sm-muted)]">Live example: {program.tenantProof}</small>
              <small className="text-[var(--sm-muted)]">Build team: {program.researchCell}</small>
              <small className="text-[var(--sm-muted)]">Release train: {program.releaseTrain}</small>
              <small className="text-[var(--sm-muted)]">Internal crews: {program.agentCrews.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Adds next: {program.nextReleases.join(', ')}</small>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link className="sm-link" to={program.route}>
                  Open program
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-[var(--sm-muted)]">
          Each product has a clear owner, a proven rollout path, and a next module instead of becoming a one-off demo.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {STARTER_PACK_DETAILS.map((product) => (
          <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
            <img
              alt={`${product.name} live screenshot`}
              className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              loading="lazy"
              src={product.image}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
              <span className="sm-status-pill">Live now</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {product.audience}</p>
            <div className="mt-4 space-y-2">
              {product.problemsSolved.slice(0, 2).map((item) => (
                <div className="sm-site-point text-sm" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Product</p>
                <p className="mt-2 text-sm text-white">{product.starterModules.join(' + ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Shared data</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.knowledgeModules.join(', ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Connections</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.integrations.join(', ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.controls.join(', ')}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={product.proofTool.route}>
                Open {product.proofTool.label}
              </Link>
              <Link className="sm-button-secondary" to={contactLink(product.name)}>
                Start rollout
              </Link>
            </div>
            <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={`/products/${product.slug}`}>
              See full setup
            </Link>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise modules</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Enterprise modules that extend the live products.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The live products prove the first job. These broader modules add CRM, ERP, portals, approvals, and knowledge on the same system without
            starting a second stack.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {SOFTWARE_MODULE_DETAILS.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module.id}>
              <span className="sm-home-proof-label">{module.category}</span>
              <strong>{module.name}</strong>
              <span>{module.summary}</span>
              <small className="text-[var(--sm-muted)]">{module.status}</small>
              <small className="text-[var(--sm-muted)]">Agent teams: {module.agentTeams.join(', ')}</small>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link className="sm-link" to={`/products/${module.id}`}>
                  See module
                </Link>
                <Link className="sm-link" to={contactLink(module.name)}>
                  Start with this module
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build system</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every module needs a clear rollout path, not a loose backlog.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/portfolio">
              Open portfolio
            </Link>
            <Link className="sm-button-secondary" to="/factory">
              See Build
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {MODULE_FACTORY_STAGES.map((stage, index) => (
            <article className="sm-demo-link sm-demo-link-card" key={stage.id}>
              <span className="sm-home-proof-label">Stage {index + 1}</span>
              <strong>{stage.name}</strong>
              <span>{stage.detail}</span>
              <small className="text-[var(--sm-muted)]">Artifacts: {stage.artifacts.join(', ')}</small>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-chip text-white" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{program.name}</p>
                <span className="sm-status-pill">{program.stage}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-2 text-sm text-white/80">Market: {program.market}</p>
              <p className="mt-2 text-sm text-white/80">{program.commercialStory}</p>
              <p className="mt-2 text-sm text-white/80">Build team: {program.researchCell}</p>
              <p className="mt-2 text-sm text-white/80">Starts with: {program.starterWedge}</p>
              <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/80">Live example: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/80">Modules: {program.modules.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Internal crews: {program.agentCrews.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Success signals: {program.successSignals.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Adds next: {program.nextReleases.join(', ')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise controls</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Built for rollout, not only for demo day.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The current stack already supports roles, tenant workspaces, approvals, audit history, and agent operations around the live products.
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

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How rollout starts</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Short rollout. Real data. Small team.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Pick the product that matches the actual bottleneck.',
              'Import the spreadsheet, notes, inbox, or issue log the team already uses.',
              'Give the working team one shared queue with clear owners and review habits.',
              'Turn on approvals and agent jobs after the workflow is trusted.',
            ].map((item, index) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Add after the base product works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These extend the same system without fragmenting the stack.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {QUICK_WIN_PRODUCTS.map((item) => (
              <article className="sm-chip text-white" key={item.id}>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.useCase}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tenant example</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">{ytfDeployment.domain} can run as a real client workspace.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{ytfDeployment.summary}</p>
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
              <strong>Controls</strong>
              <span>{ytfDeployment.controls.join(', ')}</span>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Internal tools</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The rollout tools use the same app base.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/factory">
              See Build
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open Platform Admin
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metaTools.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/clients/yangon-tyre">
            View Yangon Tyre rollout
          </Link>
          <Link className="sm-button-secondary" to="/factory">
            See Build
          </Link>
          <Link className="sm-button-secondary" to="/app/teams">
            Open Agent Ops
          </Link>
        </div>
      </section>
    </div>
  )
}
