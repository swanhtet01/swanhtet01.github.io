import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const offers = [
  {
    name: 'Sales Setup',
    detail: 'Find companies, keep the right ones, and run first outreach.',
    tools: 'Find Companies + Saved Companies',
    to: '/find-companies',
  },
  {
    name: 'Operations Setup',
    detail: 'Turn messy updates or receiving issues into one short daily task list.',
    tools: 'Daily Tasks',
    to: '/daily-tasks',
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="max-w-4xl">
          <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white lg:text-7xl">Two setups. Sales or operations.</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
            SuperMega should start with one real workflow, not a big rollout. Pick the sales flow or the operations flow.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="sm-button-primary" onClick={() => trackEvent('public_start_click', { offer: 'Sales Setup' })} to="/find-companies">
              Start sales setup
            </Link>
            <Link className="sm-button-secondary" onClick={() => trackEvent('public_start_click', { offer: 'Operations Setup' })} to="/daily-tasks">
              Start operations setup
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {offers.map((offer) => (
          <Link
            className="sm-surface p-6 transition hover:border-[rgba(37,208,255,0.24)] hover:bg-white/6"
            key={offer.name}
            onClick={() => trackEvent('offer_open_click', { offer: offer.name })}
            to={offer.to}
          >
            <p className="sm-kicker text-[var(--sm-accent)]">{offer.name}</p>
            <h2 className="mt-3 text-3xl font-bold text-white">{offer.detail}</h2>
            <p className="mt-4 text-sm text-[var(--sm-muted)]">Tools used: {offer.tools}</p>
            <p className="mt-6 sm-link">Open</p>
          </Link>
        ))}
      </section>

      <section className="sm-surface-soft p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xl font-bold text-white">Need help with the first rollout?</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">Book one setup call. We use your real data and keep the scope small.</p>
          </div>
          <Link className="sm-button-secondary" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
            Book setup call
          </Link>
        </div>
      </section>
    </div>
  )
}
