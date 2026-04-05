import { Link } from 'react-router-dom'

import { customBuilds, systemOffers } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8 pb-12">
      <section className="sm-surface-deep p-6 lg:p-10">
        <p className="sm-kicker text-[var(--sm-accent)]">What we build</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">AI-native systems that replace scattered software.</h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
          We build custom software for sales, operations, and management teams. The point is not to add another app. The point is to replace manual chasing, fragmented SaaS, and copied updates with one system that fits how the company already works.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {systemOffers.map((offer) => (
          <article className="sm-surface p-6" key={offer.name}>
            <p className="sm-kicker text-[var(--sm-accent)]">{offer.audience}</p>
            <h2 className="mt-3 text-3xl font-extrabold text-white">{offer.name}</h2>
            <div className="mt-5 grid gap-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                <p className="mt-2 text-sm">{offer.replaces}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Outcome</p>
                <p className="mt-2 text-sm">{offer.outcome}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">How we build</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Start from the real mess, not a clean demo.</h2>
          <div className="mt-5 space-y-3">
            {[
              'Bring the company’s real inputs: Facebook pages, Viber or WhatsApp notes, email, Excel, PDFs, and messages.',
              'We shape the first usable system around one actual workflow.',
              'AI handles sorting, drafting, triage, and summaries so the team can work from one operating layer.',
            ].map((item) => (
              <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Common custom builds</p>
          <div className="mt-5 space-y-4">
            {customBuilds.map((item) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={item.name}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-2xl font-bold text-white">Try a free tool first, then build the real system.</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">Use the proof tools to see how the approach works before a rollout.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/find-companies">
              Try find clients
            </Link>
            <Link className="sm-button-secondary" to="/company-list?setup=leads">
              Try clean a list
            </Link>
            <Link className="sm-button-primary" to="/book">
              Book rollout call
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
