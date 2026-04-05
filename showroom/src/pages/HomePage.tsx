import { Link } from 'react-router-dom'

import { customBuilds, hero, systemOffers } from '../content'
import { trackEvent } from '../lib/analytics'

const proofTools = [
  {
    name: 'Find clients',
    detail: 'Search for new companies, keep the shortlist, and draft the first outreach.',
    to: '/find-companies',
  },
  {
    name: 'Clean a list',
    detail: 'Paste the names you already have from Google, Facebook, Viber, WhatsApp, Excel, or CRM.',
    to: '/company-list?setup=leads',
  },
]

export function HomePage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="relative left-1/2 w-screen max-w-none -translate-x-1/2 overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_82%_22%,rgba(37,208,255,0.2),transparent_18%),radial-gradient(circle_at_16%_78%,rgba(255,122,24,0.18),transparent_16%),linear-gradient(180deg,rgba(2,8,23,0.98),rgba(4,10,22,0.95))]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
        <div className="mx-auto grid min-h-[calc(100svh-7rem)] w-full max-w-6xl gap-10 px-4 pb-12 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.78fr)] lg:px-8 lg:pb-16 lg:pt-20">
          <div className="flex flex-col justify-end">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">{hero.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Built for Myanmar teams still running work through Facebook pages, Viber or WhatsApp notes, email, spreadsheets, and old SaaS that never really fits. We build one working system around the real flow instead of asking the team to juggle five tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Systems' })} to="/systems">
                See what we build
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('public_start_click', { offer: 'Find clients' })} to="/find-companies">
                Try a free tool
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Sales desks</span>
              <span className="sm-status-pill">Ops desks</span>
              <span className="sm-status-pill">Director briefs</span>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="border-l border-white/10 pl-5 lg:pl-8">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Main systems</p>
              <div className="mt-6 space-y-5">
                {systemOffers.map((offer, index) => (
                  <div className="border-b border-white/8 pb-5 last:border-b-0 last:pb-0" key={offer.name}>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--sm-muted)]">0{index + 1}</p>
                    <h2 className="mt-2 text-2xl font-bold text-white">{offer.name}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{offer.outcome}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">What makes this different</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Not another generic SaaS stack.</h2>
          <div className="mt-6 space-y-3">
            {[
              'We start from the real data you already have, even if it is messy.',
              'AI handles the cleanup, triage, drafting, and daily follow-up loops.',
              'The team works from one clear queue instead of scattered apps and chats.',
            ].map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Free proof tools</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Try the approach before a rollout.</h2>
          <div className="mt-5 space-y-4">
            {proofTools.map((tool) => (
              <Link className="block border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={tool.name} to={tool.to}>
                <p className="text-xl font-bold text-white">{tool.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">{tool.detail}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-surface p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Custom builds</p>
            <h2 className="mt-3 text-3xl font-bold text-white">We do not only ship list tools.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              We also build full AI-native internal systems for teams that need more than a proof tool.
            </p>
          </div>
          <Link className="sm-button-primary" onClick={() => trackEvent('book_demo_click', { source: 'home_custom_builds' })} to="/book">
            Book rollout call
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customBuilds.map((item) => (
            <div className="sm-chip text-white" key={item.name}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
