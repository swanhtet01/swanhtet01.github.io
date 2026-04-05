import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const offers = [
  {
    name: 'Find Companies',
    detail: 'Search a market and keep only the companies worth contacting.',
    tools: 'Public search + first follow-up',
    to: '/find-companies',
  },
  {
    name: 'Company List',
    detail: 'Paste the list you already have and turn it into something usable.',
    tools: 'CSV/text import + next steps',
    to: '/company-list?setup=leads',
  },
  {
    name: 'Receiving Log',
    detail: 'Paste inbound issues and keep the next receiving follow-up visible.',
    tools: 'Issue log + follow-up queue',
    to: '/receiving-log',
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
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white lg:text-7xl">Three tools. One clear next step.</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
            Start with what you already have: a market to search, a company list to clean, or receiving issues to log.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="sm-button-primary" onClick={() => trackEvent('public_start_click', { offer: 'Find Companies' })} to="/find-companies">
              Find companies
            </Link>
            <Link className="sm-button-secondary" onClick={() => trackEvent('public_start_click', { offer: 'Company List' })} to="/company-list?setup=leads">
              Clean my list
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
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
            <p className="mt-1 text-sm text-[var(--sm-muted)]">Book one setup call. We start with one list or one issue flow and keep the scope small.</p>
          </div>
          <Link className="sm-button-secondary" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
            Book setup call
          </Link>
        </div>
      </section>
    </div>
  )
}
