import { Link } from 'react-router-dom'

import { coreProduct, hero, leadFinder, publicModules, starterTemplates } from '../content'

const steps = [
  {
    title: '1. Search',
    detail: 'Search by place or niche.',
  },
  {
    title: '2. Save',
    detail: 'Save the best 3 leads.',
  },
  {
    title: '3. Run',
    detail: 'Open Workspace and run the next step.',
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/lead-finder">
                Start with Lead Finder
              </Link>
              <Link className="sm-button-secondary" to="/workspace">
                See workspace
              </Link>
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">How it works</p>
            <div className="mt-5 grid gap-3">
              {steps.map((step) => (
                <div className="sm-proof-card" key={step.title}>
                  <p className="text-base font-bold text-white">{step.title}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {publicModules.map((module) => (
          <article className="sm-surface p-6" key={module.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{module.name}</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{module.tagline}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{module.bestFor}</p>
            <div className="mt-5">
              <Link className={module.name === 'Lead Finder' ? 'sm-button-primary' : 'sm-button-secondary'} to={module.path}>
                Open {module.name}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">{leadFinder.title}</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Why not just use Google?</h2>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Google shows pages.</div>
            <div className="sm-chip text-white">Lead Finder keeps the shortlist.</div>
            <div className="sm-chip text-white">Workspace turns it into the next action.</div>
          </div>
          <div className="mt-5">
            <Link className="sm-button-primary" to="/lead-finder">
              Start with Lead Finder
            </Link>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">{coreProduct.name}</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use one queue, not ten trackers.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{coreProduct.tagline}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {starterTemplates.map((item) => (
              <div className="sm-chip text-white" key={item.name}>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/workspace?view=queue">
              Open queue
            </Link>
            <Link className="sm-button-secondary" to="/workspace">
              Open workspace
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
