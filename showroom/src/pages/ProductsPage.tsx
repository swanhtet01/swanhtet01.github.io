import { Link } from 'react-router-dom'

import { enterpriseSignals, ytfDeployment } from '../content'
import { PageIntro } from '../components/PageIntro'
import { QUICK_WIN_PRODUCTS, STARTER_PACK_DETAILS } from '../lib/salesControl'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const rolloutIncludes = [
  'Import the current list, files, or issue log the team already uses.',
  'Give the working team one shared queue with owners and next actions.',
  'Add approvals, history, and automation after the first workflow is trusted.',
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Products"
        title="Pick the first workflow to fix."
        description="These are the three clearest starting products today. Each one has a live demo, a defined rollout path, and a shared enterprise foundation behind it."
      />

      <section className="grid gap-6 xl:grid-cols-3">
        {STARTER_PACK_DETAILS.map((product) => (
          <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
            <img
              alt={`${product.name} live screenshot`}
              className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              decoding="async"
              height={screenshotSize.height}
              loading="lazy"
              src={product.image}
              width={screenshotSize.width}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
              <span className="sm-status-pill">Live demo</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {product.audience}</p>
            <div className="mt-4 space-y-2">
              {product.problemsSolved.map((item) => (
                <div className="sm-site-point text-sm" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.integrations.join(', ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.controls.join(', ')}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={product.proofTool.route}>
                Open demo
              </Link>
              <Link className="sm-button-secondary" to={contactLink(product.name)}>
                Get rollout plan
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What every rollout includes</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Keep the first rollout small and useful.</h2>
          <div className="mt-6 space-y-3">
            {rolloutIncludes.map((item, index) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Common add-ons</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Add these after the base product works.</h2>
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise layer</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The products sit on a real operating-system base.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The demos are only the entry points. The shared base already covers access, approvals, tenant scope, audit history, and connector monitoring.
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
        <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Example tenant</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{ytfDeployment.domain}</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{ytfDeployment.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See enterprise setup
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Start rollout
              </Link>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What that tenant includes</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.modules.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Roles</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.roles.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Data sources</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.dataSources.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Controls</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.controls.join(', ')}</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the demo that matches your bottleneck.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            If the workflow is already painful enough to explain in one sentence, it is enough to start a rollout.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See enterprise setup
          </Link>
        </div>
      </section>
    </div>
  )
}
