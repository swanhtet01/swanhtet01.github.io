import { Link } from 'react-router-dom'

import { bookingUrl, clientTemplates } from '../content'
import { trackEvent } from '../lib/analytics'
import { CORE_SOLUTIONS } from '../lib/salesControl'

export function BookPage() {
  const offers = [
    ...CORE_SOLUTIONS.map((solution) => ({
      name: solution.name,
      detail: solution.promise,
    })),
    {
      name: 'Custom Build',
      detail: 'A focused build for a client portal, learning platform, ecommerce back office, or another internal workflow.',
    },
  ]

  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Book rollout call</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Start with one system, not another software mess.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              We start with one real workflow, turn it into a working system, and keep the rollout narrow enough to go live fast.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {bookingUrl ? (
                <a className="sm-button-primary" href={bookingUrl} onClick={() => trackEvent('book_demo_click', { source: 'book_page' })} rel="noreferrer" target="_blank">
                  Book rollout call
                </a>
              ) : (
                <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Products' })} to="/products">
                  See live products
                </Link>
              )}
              <Link className="sm-button-secondary" to="/company-list?setup=leads">
                Try a live product
              </Link>
            </div>
          </div>

          <div className="border-l border-white/10 pl-5 lg:pl-8">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Call outcome</p>
            <div className="mt-5 space-y-4">
              {['Pick one starting product', 'Use the data the team already has', 'Leave with a live rollout plan'].map((item) => (
                <div className="border-b border-white/8 pb-3 text-base text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">Most teams start with one system</p>
          <div className="mt-5 space-y-4">
            {offers.map((offer) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={offer.name}>
                <div>
                  <p className="text-xl font-bold text-white">{offer.name}</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{offer.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="sm-surface-soft p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Good fit</p>
          <div className="mt-5 space-y-4">
            {clientTemplates.map((template) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={template.name}>
                <p className="font-semibold text-white">{template.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.outcome}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-sm text-[var(--sm-muted)]">
            Best for owner-led and operations-heavy teams still running work through chat, email, spreadsheets, exports, and disconnected SaaS.
          </div>
          <div className="mt-4 text-sm text-[var(--sm-muted)]">Free tools are there to prove the approach. The main product is the system we build for your team.</div>
          {!bookingUrl ? <div className="mt-6 text-sm text-[var(--sm-muted)]">Calendar booking is not live on this host yet. Start with the products page or open a live product first.</div> : null}
        </aside>
      </section>
    </div>
  )
}
