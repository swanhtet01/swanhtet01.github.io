import { Link } from 'react-router-dom'

import { customBuilds, hero, systemOffers, templatePacks } from '../content'
import { trackEvent } from '../lib/analytics'

const startPoints = [
  {
    name: 'Sales',
    detail: 'Find companies, clean lists, and keep follow-up moving from one queue.',
  },
  {
    name: 'Operations',
    detail: 'Log receiving issues, blockers, and approvals without another heavy ERP rollout.',
  },
  {
    name: 'Management',
    detail: 'Give founders and managers one short daily view of what needs attention.',
  },
]

export function HomePage() {
  return (
    <div className="space-y-8 pb-12">
      <section className="sm-surface-deep p-6 lg:p-10">
        <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-7xl">{hero.title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Templates' })} to="/templates">
            See starter packs
          </Link>
          <Link className="sm-button-secondary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
            Contact us
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {startPoints.map((item) => (
          <article className="sm-surface p-6" key={item.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.name}</p>
            <p className="mt-3 text-xl font-bold text-white">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">What we build</p>
          <div className="mt-5 space-y-4">
            {systemOffers.map((offer) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={offer.name}>
                <p className="text-xl font-bold text-white">{offer.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{offer.outcome}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">How we start</p>
          <div className="mt-5 space-y-4">
            {['Pick one workflow.', 'Use the data and tools the team already has.', 'Ship one working system fast.'].map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Starter packs</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Reusable systems we can ship first.</h2>
          </div>
          <Link className="sm-button-secondary" to="/templates">
            Open all starter packs
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {templatePacks.slice(0, 4).map((pack) => (
            <article className="sm-chip text-white" key={pack.name}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{pack.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
                </div>
                <span className="sm-status-pill">{pack.live ? 'Ready' : 'Planned'}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Custom builds</p>
          <div className="mt-5 grid gap-3">
            {customBuilds.slice(0, 4).map((item) => (
              <div className="sm-chip text-white" key={item.name}>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Tell us the workflow you want fixed.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Sales follow-up, receiving, approvals, training, reporting, or another internal process. We start with one narrow rollout and one team.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" onClick={() => trackEvent('contact_open_click', { source: 'home_contact' })} to="/contact">
              Contact us
            </Link>
            <Link className="sm-button-secondary" to="/systems">
              What we build
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
