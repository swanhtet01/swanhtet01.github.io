import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const startCards = [
  {
    title: 'Find companies',
    detail: 'Search a place or niche, keep the shortlist, and create the first follow-up.',
    to: '/find-companies',
    button: 'Search companies',
    primary: true,
  },
  {
    title: 'Keep a company list',
    detail: 'Bring a company list or saved companies and keep the next step in one place.',
    to: '/company-list',
    button: 'Paste company list',
    primary: false,
  },
  {
    title: 'Turn updates into tasks',
    detail: 'Paste team notes or blockers and turn them into one clear task list with owners and due dates.',
    to: '/task-list',
    button: 'Build task list',
    primary: false,
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{hero.title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
        <p className="mt-4 text-sm text-[var(--sm-muted)]">Example: tyre shop in Yangon, warehouse in Mandalay, daily ops updates</p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {startCards.map((card) => (
          <article className="sm-surface p-6" key={card.title}>
            <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{card.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{card.detail}</p>
            <div className="mt-5">
              <Link
                className={card.primary ? 'sm-button-primary' : 'sm-button-secondary'}
                onClick={() => trackEvent('public_start_click', { tool: card.title })}
                to={card.to}
              >
                {card.button}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <div className="text-sm text-[var(--sm-muted)]">
        Need help setting it up?{' '}
        <Link className="text-white underline underline-offset-4" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
          Book a demo
        </Link>
      </div>
    </div>
  )
}
