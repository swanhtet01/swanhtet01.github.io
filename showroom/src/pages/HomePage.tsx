import { Link } from 'react-router-dom'

import { hero, proofPoints } from '../content'

const startCards = [
  {
    title: 'Find companies',
    detail: 'Search a place or niche, keep the shortlist, and create the first follow-up.',
    to: '/find-companies',
    button: 'Open Find Companies',
    primary: true,
  },
  {
    title: 'Run sales follow-up',
    detail: 'Bring a company list or saved companies and keep the next step in one place.',
    to: '/sales-follow-up',
    button: 'Open Sales Follow-Up',
    primary: false,
  },
  {
    title: 'Turn team updates into tasks',
    detail: 'Paste team notes or blockers and turn them into one clear task list with owners and due dates.',
    to: '/team-updates',
    button: 'Open Team Updates',
    primary: false,
  },
]

const howItWorks = [
  'Search or import what you already have.',
  'Save the right companies or updates into one tool.',
  'Run the task list every day.',
]

const offers = [
  {
    name: 'Find Companies',
    price: '$79/mo',
    detail: 'Self-serve market search, company saving, and first outreach drafts.',
  },
  {
    name: 'Sales Desk',
    price: '$750 pilot',
    detail: 'Managed setup for one sales flow, one task list, and one weekly review.',
  },
  {
    name: 'Ops Desk',
    price: '$1,500 pilot',
    detail: 'Managed setup for one ops flow such as daily blockers or receiving issues.',
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/find-companies">
                Open Find Companies
              </Link>
              <Link className="sm-button-secondary" to="/team-updates">
                Open Team Updates
              </Link>
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">What you get</p>
            <div className="mt-5 grid gap-3">
              {proofPoints.map((item) => (
                <div className="sm-proof-card" key={item.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                  <p className="mt-2 text-xl font-bold text-white">{item.value}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {startCards.map((card) => (
          <article className="sm-surface p-6" key={card.title}>
            <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{card.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{card.detail}</p>
            <div className="mt-5">
              <Link className={card.primary ? 'sm-button-primary' : 'sm-button-secondary'} to={card.to}>
                {card.button}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">How to use it</p>
        <h2 className="mt-3 text-3xl font-bold text-white">One simple operating loop.</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {howItWorks.map((step) => (
            <div className="sm-proof-card" key={step}>
              <p className="text-base font-semibold text-white">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">What we sell now</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Three offers. Nothing else on the front door.</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {offers.map((offer) => (
            <div className="sm-proof-card" key={offer.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{offer.name}</p>
              <p className="mt-2 text-2xl font-bold text-white">{offer.price}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{offer.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link className="sm-button-secondary" to="/book">
            See rollout and book
          </Link>
        </div>
      </section>
    </div>
  )
}
