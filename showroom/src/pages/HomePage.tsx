import { Link } from 'react-router-dom'

import { enterpriseSignals, hero, publicModules, ytfDeployment } from '../content'
import { trackEvent } from '../lib/analytics'
import { BUILD_TEAMS, MODULE_PROGRAMS } from '../lib/companyBuildingModel'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { getTenantConfig } from '../lib/tenantConfig'

const usageModes = [
  {
    name: 'Run your own company',
    detail: 'Use the same stack for sales, approvals, operations, and management review.',
  },
  {
    name: 'Launch tenant workspaces',
    detail: 'Spin up client, supplier, site, or department workspaces without rebuilding the stack.',
  },
  {
    name: 'Keep internal tools connected',
    detail: 'Run rollout planning, director review, and agent operations on the same base.',
  },
  {
    name: 'Start small, scale later',
    detail: 'Begin with one live module, then add controls, automation, and new workspaces over time.',
  },
] as const

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function HomePage() {
  const tenant = getTenantConfig()
  const featuredProducts = STARTER_PACK_DETAILS

  if (tenant.key !== 'default') {
    return (
      <div className="space-y-10 pb-16">
        <section className="sm-site-panel">
          <div className="sm-site-proof-strip">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{tenant.homeEyebrow}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{tenant.homeTitle}</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{tenant.homeDescription}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={tenant.homePrimaryCta.to}>
                  {tenant.homePrimaryCta.label}
                </Link>
                <Link className="sm-button-secondary" to={tenant.homeSecondaryCta.to}>
                  {tenant.homeSecondaryCta.label}
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {tenant.toolCards.map((item) => (
                <article className="sm-demo-link sm-demo-link-card" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <Link className="sm-link" to={item.to}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sm-site-panel">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Roles and controls</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Built for real plant work, review, and recovery.</h2>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.roles.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.controls.map((item) => (
                  <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="sm-terminal p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Connected inputs</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Bring Gmail, Drive, Sheets, exports, and files into one tenant workspace.</h2>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.dataSources.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">Agent teams: {ytfDeployment.agentTeams.join(', ')}</p>
            </article>
          </div>
        </section>

        <section className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the tenant workspace or review the operating model.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              This tenant shows the current live model: receiving, task control, files, approvals, management review, and agent operations on one base.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login">
              Team login
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Operating model
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Control plane
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero">
        <div className="sm-site-hero-grid">
          <div className="sm-site-hero-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Products overview' })} to="/products">
                See live products
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Start rollout
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-[var(--sm-muted)]">
              <span>Live now: Find Clients</span>
              <span>Company List</span>
              <span>Receiving Control</span>
              <span>Gmail, Drive, Sheets, CSV, API</span>
              <span>Roles + audit</span>
              <span>Tenant workspaces</span>
            </div>
          </div>

          <div className="sm-site-stage" aria-label="SUPERMEGA.dev live products">
            <img alt="SUPERMEGA.dev company list module" className="sm-site-shot sm-site-shot-main object-cover object-top" src="/site/company-list-live.png" />
            <img alt="SUPERMEGA.dev find clients module" className="sm-site-shot sm-site-shot-top object-cover object-top" src="/site/find-clients-live.png" />
            <img alt="SUPERMEGA.dev receiving control module" className="sm-site-shot sm-site-shot-bottom object-cover object-top" src="/site/receiving-control-live.png" />
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Live products that solve one job clearly.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with one workflow, connect the data you already have, and give the team one live screen they can trust. Expand into approvals,
            roles, and automation later.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
              <img
                alt={`${product.name} live screenshot`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
                loading="lazy"
                src={product.image}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-semibold">{product.name}</p>
                <span className="sm-status-pill">Live now</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-4 space-y-2">
                {product.problemsSolved.slice(0, 2).map((item) => (
                  <div className="sm-site-point text-sm" key={item}>
                    <span className="sm-site-point-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Integrations: {product.integrations.join(', ')}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/45">Controls: {product.controls.join(', ')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
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
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          These screenshots are from live modules, not generic mockups. The system already supports roles, history, approvals, tenant workspaces,
          and API-backed state around them.
        </p>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise model</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">One system behind the product screens.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Every product shares the same base: roles, history, approvals, connectors, and agent jobs. That is how one live module grows into a wider
            company system without adding more tool sprawl.
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
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/clients/yangon-tyre">
            View Yangon Tyre system
          </Link>
          <Link className="sm-button-secondary" to="/app/teams">
            See agent ops
          </Link>
          <Link className="sm-button-secondary" to="/factory">
            See how it is built
          </Link>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">How products grow</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each product has a clear owner and a clear next step.</h2>
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
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {MODULE_PROGRAMS.slice(0, 3).map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <span>{program.target}</span>
              <p className="mt-2 text-sm text-white/80">{program.commercialStory}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Market: {program.market}</p>
              <p className="mt-2 text-sm text-white/80">Starts with: {program.starterWedge}</p>
              <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Live example: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/80">Internal crews: {program.agentCrews.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Adds next: {program.nextReleases.join(', ')}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="sm-link" to={program.route}>
                  Open program
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-[var(--sm-muted)]">
          These products are reviewed by the same build teams that handle rollout, connectors, and controls, so each release stays tied to real operating work.
        </p>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">The same system sold to clients also runs the internal build work.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            SUPERMEGA.dev is not shipping isolated tools. The same base runs product build, rollout planning, tenant delivery, and internal operations.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUILD_TEAMS.slice(0, 4).map((team) => (
            <article className="sm-demo-link sm-demo-link-card" key={team.id}>
              <strong>{team.name}</strong>
              <span>{team.mission}</span>
              <small className="text-[var(--sm-muted)]">Workspace: {team.workspace}</small>
              <small className="text-[var(--sm-muted)]">Owns: {team.ownership.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Agent crews: {team.agentPods.join(', ')}</small>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/factory">
            See how products are built
          </Link>
          <Link className="sm-button-secondary" to="/portfolio">
            View product portfolio
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See all products
          </Link>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Ways to use it</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Run the same base for your company, tenants, and internal tools.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            SUPERMEGA.dev is not only a public site. The same base can run internal operations, client workspaces, and the meta tools used to manage
            rollouts.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {usageModes.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tenant example</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">{ytfDeployment.domain}</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">{ytfDeployment.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/clients/yangon-tyre">
                Open tenant blueprint
              </Link>
              <Link className="sm-button-secondary" to="/factory">
                Open Build
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open Platform Admin
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
              <strong>Controls</strong>
              <span>{ytfDeployment.controls.join(', ')}</span>
            </article>
          </div>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <article className="sm-surface p-6 lg:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">Onboarding</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start with one workflow and the data you already have.</h2>
            <div className="mt-6 space-y-3">
              {[
                'Pick the first workflow that still depends on inboxes, sheets, or manual chasing.',
                'Import the rows, notes, files, and owners the team already uses today.',
                'Launch one live screen with clear roles, history, and review habits.',
                'Add approvals, extra modules, and agent jobs after the base workflow is trusted.',
              ].map((item, index) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{index + 1}. {item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact">
                Start rollout
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
            </div>
          </article>

          <article className="sm-terminal p-6 lg:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">What ships first</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                'One mapped workflow',
                'Imported data from current tools',
                'One live screen for the team',
                'One shared list or queue',
                'Roles and permissions',
                'Connector and agent jobs',
              ].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">
              Common starting inputs: Gmail, Google Drive, Sheets, CSV exports, ERP exports, uploaded files, APIs, and internal task updates.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live modules</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Open the live products now, then connect them into a full system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">These are working entry points, not concept cards.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{item.name}</p>
                <span className="sm-status-pill">Live now</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Best for {item.bestFor}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Outputs: {item.outputs.join(', ')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={item.path}>
                  Open {item.name}
                </Link>
                <Link className="sm-button-secondary" to={contactLink(item.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">SUPERMEGA.dev</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Bring one workflow. Leave with a working system.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Tell us the process, the tools you already use, and who needs the first live screen. We will map the product, the controls, and the rollout
            path.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See live products
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See enterprise setup
          </Link>
        </div>
      </section>
    </div>
  )
}
