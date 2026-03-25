import { Link } from 'react-router-dom'

import { flagshipSystem, packages, products, proofPoints, servicePacks } from '../content'

const freeTools = products.filter((product) => product.kind === 'Free tool')
const coreModules = products.filter((product) => product.kind === 'Control module')

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="animate-rise">
            <p className="sm-kicker text-[var(--sm-accent)]">AI operations software</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Replace follow-up chaos with one control system.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              SuperMega helps owner-led teams run on top of Gmail, Drive, Sheets, and existing records. Start with one live
              workflow. Expand into a full operating layer only after the first result is working.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/examples">
                Try free tools
              </Link>
              <Link className="sm-button-accent" to="/contact">
                Book pilot
              </Link>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {proofPoints.map((point) => (
                <article className="sm-metric-card" key={point.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{point.label}</p>
                  <p className="mt-3 text-lg font-bold text-white">{point.value}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{point.detail}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="animate-rise-delayed">
            <div className="sm-terminal p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Pilot control view</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">What the system already runs</h2>
                </div>
                <span className="sm-status-pill">
                  <span className="sm-led bg-emerald-400" />
                  Live pilot
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Owner / director</p>
                  <div className="mt-3 grid gap-2 text-sm text-white">
                    <span>Action OS keeps one owner board and blocker list live.</span>
                    <span>Director Flash turns updates into a short management brief.</span>
                  </div>
                </div>

                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Factory control</p>
                  <div className="mt-3 grid gap-2 text-sm text-white">
                    <span>Supplier Watch flags delay, payment, and customs risk.</span>
                    <span>Quality Closeout moves issues into containment, CAPA, and closeout.</span>
                  </div>
                </div>

                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Commercial control</p>
                  <div className="mt-3 grid gap-2 text-sm text-white">
                    <span>Cash Watch ranks overdue collections and next follow-up.</span>
                    <span>Sales Signal turns channel notes and headlines into one watchlist.</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent)]">Pilot client</p>
                  <p className="mt-2 text-sm text-white">Yangon Tyre</p>
                </div>
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Flagship path</p>
                  <p className="mt-2 text-sm text-white">{flagshipSystem.name}</p>
                </div>
              </div>

              <p className="mt-5 text-sm text-[var(--sm-muted)]">{flagshipSystem.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core services</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Three packs for real business teams.</h2>
          </div>
          <Link className="sm-link" to="/products">
            See all modules
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {servicePacks.map((pack) => (
            <article className="sm-surface p-6" key={pack.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{pack.audience}</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.promise}</p>

              <div className="mt-5 grid gap-3">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pack.includes.map((item) => (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-white" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Outcomes</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {pack.outcomes.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-4 text-sm text-[var(--sm-muted)]">{pack.rollout}</p>
              <Link className="sm-button-accent mt-5" to={`/contact?package=${encodeURIComponent(pack.name)}`}>
                Start this pack
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core modules</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The modules inside the packs.</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Book a scoping call
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coreModules.map((product) => (
            <article className="sm-surface-soft p-5" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-white">{product.name}</h3>
                <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">
                  Deploy
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
              <p className="mt-4 text-sm text-white">{product.output}</p>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Best for:</strong> {product.fit}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Free tools</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use the proof layer first.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            These are public tools. They let a team test how SuperMega turns messy input into something more usable.
          </p>
          <div className="mt-5 grid gap-3">
            {freeTools.map((tool) => (
              <div className="sm-command-row" key={tool.name}>
                <div>
                  <p className="font-semibold text-white">{tool.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{tool.tagline}</p>
                </div>
                <Link className="sm-link" to={tool.exampleId ? `/examples#${tool.exampleId}` : '/examples'}>
                  Try it
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">How we work</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Start small. Keep what works. Expand only after proof.</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {packages.map((pkg) => (
              <div className="sm-chip" key={pkg.name}>
                <p className="font-semibold text-white">{pkg.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-accent)]">{pkg.timeline}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pkg.bestFor}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/packages">
              See delivery model
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Start a pilot
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
