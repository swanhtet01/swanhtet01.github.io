import { Link } from 'react-router-dom'

import { featuredProducts, proofPoints, servicePacks } from '../content'

const liveNow = featuredProducts.filter((item) => ['Action OS', 'Lead Finder', 'Ops Intake', 'Receiving Control'].includes(item.name))

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Main product</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Turn Gmail, Drive, and spreadsheets into one operating system.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Start with Action OS. It gives one action board for managers and directors. Then add receiving, inventory, supplier,
              quality, or cash control only where the business needs more depth.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See Action OS
              </Link>
              <Link className="sm-button-secondary" to="/lead-finder">
                Try Lead Finder
              </Link>
              <Link className="sm-button-accent" to="/contact">
                Book call
              </Link>
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">What is live now</p>
            <div className="mt-5 grid gap-3">
              {proofPoints.map((point) => (
                <div className="sm-proof-card" key={point.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{point.label}</p>
                  <p className="mt-3 text-lg font-bold text-white">{point.value}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{point.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Where it fits</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Three simple starting points.</h2>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {servicePacks.map((pack) => (
            <article className="sm-pack-card p-6" key={pack.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{pack.audience}</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
              <div className="mt-5 grid gap-3">
                {pack.includes.slice(0, 3).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Use now</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Products you can actually open.</h2>
          </div>
          <Link className="sm-link" to="/products">
            See all modules
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {liveNow.map((item) => (
            <article className="sm-surface-soft p-5" key={item.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{item.kind}</p>
              <h3 className="mt-3 text-xl font-bold text-white">{item.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <div className="mt-5 grid gap-2">
                {item.bullets.slice(0, 3).map((bullet) => (
                  <div className="sm-chip text-white" key={bullet}>
                    {bullet}
                  </div>
                ))}
              </div>
              <Link className="sm-button-secondary mt-5" to={item.path}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How we start</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Keep the first rollout small.</h2>
          <div className="mt-5 grid gap-3">
            {[
              'Connect one data source or one daily team update.',
              'Ship one live board that people actually use.',
              'Add deeper modules only after the first board is trusted.',
            ].map((step) => (
              <div className="sm-command-row" key={step}>
                <p className="text-white">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Need a fit check?</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Tell us the workflow first.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            The best starting point is usually one management board, one receiving queue, one supplier queue, or one cash queue.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Book intro call
            </Link>
            <Link className="sm-button-secondary" to="/workbench">
              Open live demo
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
