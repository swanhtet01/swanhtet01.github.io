import { Link } from 'react-router-dom'

import { hero, proofPoints } from '../content'
import { LAB_TRACKS, PUBLIC_PRODUCTS } from '../lib/salesControl'

const startCards = [
  {
    title: 'Find clients',
    detail: 'Search a place or niche, keep the shortlist, and start outreach.',
    to: '/lead-finder',
    button: 'Open Lead Finder',
    primary: true,
  },
  {
    title: 'Bring your lead list',
    detail: 'Paste names, sites, phones, or emails and turn them into saved leads.',
    to: '/workspace?setup=leads',
    button: 'Import lead list',
    primary: false,
  },
  {
    title: 'Paste messy updates',
    detail: 'Paste team notes or ops blockers and turn them into a simple queue.',
    to: '/workspace?setup=updates&view=queue',
    button: 'Build queue',
    primary: false,
  },
]

export function HomePage() {
  const liveProducts = PUBLIC_PRODUCTS.filter((product) => product.status === 'Live now')

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
              <Link className="sm-button-primary" to="/lead-finder">
                Open Lead Finder
              </Link>
              <Link className="sm-button-secondary" to="/workspace?setup=updates&view=queue">
                Start with your own data
              </Link>
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">What this does</p>
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
        <p className="sm-kicker text-[var(--sm-accent)]">Sell now</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Specific products only.</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {liveProducts.map((product) => (
            <article className="sm-proof-card" key={product.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold text-white">{product.name}</h3>
                <span className="sm-status-pill">{product.status}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.audience}</p>
            </article>
          ))}
        </div>
        <div className="mt-5">
          <Link className="sm-button-secondary" to="/products">
            See all products
          </Link>
        </div>
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent-alt)]">R&D Lab</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Agent loops we are building next.</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {LAB_TRACKS.slice(0, 3).map((track) => (
            <div className="sm-chip text-white" key={track.id}>
              <p className="font-semibold">{track.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.loop}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link className="sm-button-secondary" to="/lab">
            Open R&D Lab
          </Link>
        </div>
      </section>
    </div>
  )
}
