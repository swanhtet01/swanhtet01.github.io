import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'

const steps = [
  {
    number: '01',
    title: 'Find companies',
    detail: 'Search a place or niche and keep the companies worth contacting.',
  },
  {
    number: '02',
    title: 'Keep your list clean',
    detail: 'Paste your own company list or keep the results you want to work.',
  },
  {
    number: '03',
    title: 'Run the next tasks',
    detail: 'Turn follow-up notes or messy team updates into one short task list.',
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
        <p className="mt-4 text-sm text-[var(--sm-muted)]">Use it when you need more customers or a cleaner daily follow-up list.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" onClick={() => trackEvent('public_start_click', { tool: 'Find Companies' })} to="/find-companies">
            Find companies
          </Link>
          <Link className="sm-button-secondary" onClick={() => trackEvent('public_start_click', { tool: 'Task List' })} to="/task-list">
            Open task list
          </Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {steps.map((step) => (
          <article className="sm-surface p-6" key={step.number}>
            <p className="sm-kicker text-[var(--sm-accent)]">{step.number}</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{step.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step.detail}</p>
          </article>
        ))}
      </section>

      <div className="text-sm text-[var(--sm-muted)]">
        Need help with setup or rollout?{' '}
        <Link className="text-white underline underline-offset-4" onClick={() => trackEvent('book_demo_click', { source: 'home' })} to="/book">
          Book a demo
        </Link>
      </div>
    </div>
  )
}
