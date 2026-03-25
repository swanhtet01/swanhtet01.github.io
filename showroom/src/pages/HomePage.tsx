import { Link } from 'react-router-dom'

import { flagshipSystem, miniProducts, packages, products, proofPoints, servicePacks } from '../content'

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
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise AI operations software</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              One operating system for companies still running on Gmail, Drive, and spreadsheets.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              SuperMega starts with Action OS, then adds intake, receiving, inventory, supplier, quality, and cash control only where the business actually needs them. Long term, the same system expands into a broader work OS across the tools people already use, from Gmail and Drive to chat, coding, and creative workspaces.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See Action OS
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
              <Link className="sm-button-accent" to="/contact">
                Start pilot
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
                  <p className="sm-kicker text-[var(--sm-accent)]">Live proof</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">What this already does</h2>
                </div>
                <span className="sm-status-pill">
                  <span className="sm-led bg-emerald-400" />
                  Live pilot
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="sm-proof-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Supplier Watch</p>
                  <p className="mt-3 text-lg font-bold text-white">Delay, payment, and customs risk in one queue.</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Live supplier signals turn into owners, due dates, and escalation notes.</p>
                </div>

                <div className="sm-proof-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Action OS</p>
                  <p className="mt-3 text-lg font-bold text-white">One action board for managers and directors.</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Messy updates get cleaned into one owner queue instead of scattered follow-up.</p>
                </div>

                <div className="sm-proof-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Quality Closeout</p>
                  <p className="mt-3 text-lg font-bold text-white">Incident to CAPA to closeout.</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Quality issues move into containment, action, and verification instead of dying in email threads.</p>
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
            <p className="sm-kicker text-[var(--sm-accent)]">What enterprises buy</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Three clear rollout tracks.</h2>
          </div>
          <Link className="sm-link" to="/products">
            See product stack
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {servicePacks.map((pack) => (
            <article className="sm-pack-card p-6" key={pack.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{pack.audience}</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
              <div className="mt-5 grid gap-3">
                {pack.outcomes.map((outcome) => (
                  <div className="sm-chip text-white" key={outcome}>
                    {outcome}
                  </div>
                ))}
              </div>
              <Link className="sm-button-accent mt-5" to={`/contact?package=${encodeURIComponent(pack.name)}`}>
                Start this rollout
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Deployable systems</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Core modules behind the rollout.</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Book walkthrough
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coreModules.map((product) => (
            <article className="sm-surface-soft p-5" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-white">{product.name}</h3>
                <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">Deploy</span>
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

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Add-on utilities</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Smaller workflows that support the core system.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            These help teams start faster, but they are not the main story. The main story is still Action OS plus the control modules.
          </p>
          <div className="mt-5 grid gap-3">
            {miniProducts.map((tool) => (
              <div className="sm-command-row" key={tool.name}>
                <div>
                  <p className="font-semibold text-white">{tool.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{tool.tagline}</p>
                </div>
                <Link className="sm-link" to={tool.path ?? '/contact'}>
                  {tool.path ? 'Open it' : 'Use it'}
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">How rollout works</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Start small. Keep what works. Then expand.</h2>
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
