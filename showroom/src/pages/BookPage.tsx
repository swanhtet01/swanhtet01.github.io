import { Link } from 'react-router-dom'

import { bookingUrl, clientTemplates } from '../content'
import { trackEvent } from '../lib/analytics'

export function BookPage() {
  const offers = [
    {
      name: 'Find Companies',
      price: '$79/mo',
      detail: 'Self-serve company search, shortlist, and first outreach drafting.',
    },
    {
      name: 'Sales Setup',
      price: '$750 pilot',
      detail: 'Find Companies plus Company List for one real outreach workflow. Pilot fee credits into month one.',
    },
    {
      name: 'Operations Setup',
      price: '$1,500 pilot',
      detail: 'Task List for one ops flow such as daily blockers or receiving issues. Same 2-week pilot structure.',
    },
  ]

  return (
    <div className="space-y-8">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Book setup call</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Start with one paid setup.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              We set up one real workflow first. No big rollout, no fake platform demo.
            </p>
          </div>

          <div className="space-y-3">
            {offers.map((offer) => (
              <div className="sm-command-row" key={offer.name}>
                <div>
                  <p className="font-bold text-white">{offer.name}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">{offer.detail}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{offer.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="sm-surface-soft p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What happens on the call</p>
          <div className="mt-5 space-y-3">
            {['Pick one workflow', 'Check the data you already have', 'Agree the first working list'].map((item) => (
              <div className="sm-command-row" key={item}>
                <p className="font-semibold text-white">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {clientTemplates.map((template) => (
              <div className="sm-proof-card" key={template.name}>
                <p className="font-semibold text-white">{template.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--sm-accent)]">{template.audience}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.outcome}</p>
              </div>
            ))}
          </div>
        </aside>

        <section className="sm-surface p-6">
          {bookingUrl ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <a className="sm-button-primary" href={bookingUrl} onClick={() => trackEvent('book_demo_click', { source: 'book_page' })} rel="noreferrer" target="_blank">
                  Open calendar
                </a>
                <Link className="sm-button-secondary" to="/find-companies">
                  Try Find Companies
                </Link>
              </div>
              <div className="overflow-hidden rounded-3xl border border-white/8 bg-[rgba(255,255,255,0.02)]">
                <iframe className="h-[720px] w-full bg-white" src={bookingUrl} title="Schedule a call with SuperMega" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-[var(--sm-muted)]">Calendar booking is not live on this host yet. Start with one of the public tools first.</p>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" onClick={() => trackEvent('book_page_start_click', { target: 'find_companies' })} to="/find-companies">
                  Find companies
                </Link>
                <Link className="sm-button-secondary" onClick={() => trackEvent('book_page_start_click', { target: 'company_list' })} to="/company-list">
                  Bring a company list
                </Link>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
