import { Link } from 'react-router-dom'

import { bookingUrl, clientTemplates } from '../content'
import { trackEvent } from '../lib/analytics'

export function BookPage() {
  const offers = [
    {
      name: 'Sales Setup',
      price: '$750 pilot',
      detail: 'Find clients plus Clean my list for one real outreach workflow.',
    },
    {
      name: 'Company Cleanup',
      price: '$500 setup',
      detail: 'Bring your spreadsheet or text list. We clean it, stage it, and create the first next-step tasks.',
    },
    {
      name: 'Receiving Control',
      price: '$1,500 pilot',
      detail: 'Receiving Log for one inbound flow such as shortages, holds, GRN gaps, or customs blockers.',
    },
  ]

  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Book rollout call</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Start with one workflow, not a software project.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              We pick one list or issue flow, shape the first working version, and keep the rollout narrow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {bookingUrl ? (
                <a className="sm-button-primary" href={bookingUrl} onClick={() => trackEvent('book_demo_click', { source: 'book_page' })} rel="noreferrer" target="_blank">
                  Open calendar
                </a>
              ) : (
                <Link className="sm-button-primary" onClick={() => trackEvent('book_page_start_click', { target: 'find_companies' })} to="/find-companies">
                  Try find clients
                </Link>
              )}
              <Link className="sm-button-secondary" to="/company-list?setup=leads">
                Clean my list first
              </Link>
            </div>
          </div>

          <div className="border-l border-white/10 pl-5 lg:pl-8">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Call outcome</p>
            <div className="mt-5 space-y-4">
              {['Pick one workflow', 'Use the data they already have', 'Leave with the first working list'].map((item) => (
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
          <p className="sm-kicker text-[var(--sm-accent)]">Typical starting points</p>
          <div className="mt-5 space-y-4">
            {offers.map((offer) => (
              <div className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0" key={offer.name}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-white">{offer.name}</p>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{offer.detail}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-white">{offer.price}</p>
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
          {!bookingUrl ? (
            <div className="mt-6 text-sm text-[var(--sm-muted)]">Calendar booking is not live on this host yet. Start with one of the public tools first.</div>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
