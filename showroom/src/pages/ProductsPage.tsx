import { Link } from 'react-router-dom'

import { publicModules, templatePacks, workExamples } from '../content'
import { CORE_SOLUTIONS, PUBLIC_PRODUCTS, QUICK_WIN_PRODUCTS } from '../lib/salesControl'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function ProductsPage() {
  const liveTools = PUBLIC_PRODUCTS.filter((product) => product.status === 'Live now')
  const addOns = [...PUBLIC_PRODUCTS.filter((product) => product.status === 'Add-on'), ...QUICK_WIN_PRODUCTS]
  const nextStarterPacks = templatePacks.filter(
    (pack) => !CORE_SOLUTIONS.some((solution) => solution.name === pack.name) && pack.live,
  )

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              The products SuperMega can set up, extend, and run for a team.
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The strategy is simple: start with a working starter pack, connect it to the shared app, then let the agent loops keep the queue, list, and brief moving.
          </p>
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          We are targeting Myanmar first: owner-led distributors, importers, warehouses, factories, and service operators with messy day-to-day work and too many disconnected tools.
        </p>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Starter packs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">These are the main products.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Every new client should start with one of these. They are the reusable setups we can deploy fast, then extend only when the workflow proves itself.
          </p>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {CORE_SOLUTIONS.map((solution) => (
            <article className="sm-pack-card p-6 text-white" key={solution.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">Starter pack</p>
                <span className="sm-status-pill">Private pack</span>
              </div>
              <h2 className="mt-4 text-2xl font-bold">{solution.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{solution.promise}</p>
              <div className="mt-5 space-y-2 text-sm">
                <div>
                  <span className="font-semibold text-white">Used by:</span> <span className="text-[var(--sm-muted)]">{solution.buyer}</span>
                </div>
                <div>
                  <span className="font-semibold text-white">Start with:</span> <span className="text-[var(--sm-muted)]">{solution.modules.join(' + ')}</span>
                </div>
                <div>
                  <span className="font-semibold text-white">Pilot shape:</span> <span className="text-[var(--sm-muted)]">{solution.pilot}</span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={contactLink(solution.name)}>
                  Set this up
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">These can be used immediately.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are the wedges and utilities that already exist in the live app today. They are not the whole business. They are entry points and reusable modules.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {liveTools.map((product) => (
            <article className="sm-chip text-white" key={product.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{product.name}</p>
                <span className="sm-status-pill">{product.status}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {product.audience}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={product.route}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">How setup works</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">This is how we set it up for another company.</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {[
            ['1', 'Pick the starter pack', 'Choose the pack that matches the job: sales, list cleanup, or receiving control.'],
            ['2', 'Load their current data', 'Start from the spreadsheet, chat notes, inbox, or issue log the team already has.'],
            ['3', 'Invite the working team', 'Give founders, managers, operators, or clerks the right view inside the shared app.'],
            ['4', 'Turn on the agent loops', 'Let cleanup, triage, and founder brief run on schedule after the first workflow is stable.'],
          ].map(([step, title, detail]) => (
            <article className="sm-chip text-white" key={step}>
              <p className="sm-kicker text-[var(--sm-accent)]">Step {step}</p>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next starter packs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">These are the other reusable systems we can deploy.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are still productized, but they are not the best first offer for most teams. Use them when the workflow is clear and the base operating layer is already understood.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {nextStarterPacks.map((pack) => (
            <article className="sm-chip text-white" key={pack.name}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{pack.name}</p>
                <span className="sm-status-pill">{pack.category}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {pack.audience}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={pack.route}>
                Ask about this pack
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        {workExamples.map((example, index) => (
          <article className={`sm-site-case ${index % 2 === 1 ? 'sm-site-case-reverse' : ''}`} key={example.name}>
            <div className="sm-site-case-copy">
              <div className="flex flex-wrap items-center gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">{example.category}</p>
                <span className="sm-status-pill">Composite rollout</span>
              </div>
              <h2 className="mt-3 max-w-xl text-3xl font-bold text-white lg:text-5xl">{example.name}</h2>
              <p className="mt-3 max-w-xl text-base font-semibold text-white/80">{example.audience}</p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{example.summary}</p>
              <div className="mt-6 space-y-3">
                {example.outcomes.map((point) => (
                  <div className="sm-site-point" key={point}>
                    <span className="sm-site-point-dot" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 max-w-xl text-xs leading-relaxed text-white/45">{example.disclosure}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={contactLink(example.name)}>
                  Ask about this system
                </Link>
              </div>
            </div>

            <div className="sm-site-case-visual">
              <img alt={example.name} className="sm-site-case-image" src={example.image} />
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Add-ons</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">These expand the base packs.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are not where most clients should start. They become useful after the main workflow is already running inside SuperMega.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {addOns.map((item) => (
            <article className="sm-chip text-white" key={item.id}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{'promise' in item ? item.promise : item.useCase}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proof tools</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These are small utilities, not the main offer. Use them if you want to test the workflow shape before a full rollout.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/contact">
            Contact us
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={item.path}>
                Open tool
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
