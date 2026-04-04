import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
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
      <PageIntro
        compact
        eyebrow="Book Demo"
        title="Book one short demo."
        description="Start with one workflow, one task list, and one weekly review."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we sell now</p>
          <div className="mt-5 grid gap-3">
            {offers.map((offer) => (
              <div className="sm-proof-card" key={offer.name}>
                <p className="sm-kicker text-[var(--sm-accent)]">{offer.name}</p>
                <p className="mt-2 text-xl font-bold text-white">{offer.price}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{offer.detail}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 sm-kicker text-[var(--sm-accent)]">What we cover on the call</p>
          <div className="mt-5 grid gap-3">
            {[
              'One workflow to fix first',
              'What data already exists',
              'What the first task list should be',
            ].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-[var(--sm-muted)]">Best fit: teams that want one working list before a bigger rollout.</p>
        </aside>

        <section className="sm-surface p-6">
          {bookingUrl ? (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Scheduling is enabled. Use the booking link below to choose a slot.
              </div>
              <div className="flex flex-wrap gap-3">
                <a className="sm-button-primary" href={bookingUrl} onClick={() => trackEvent('book_demo_click', { source: 'book_page' })} rel="noreferrer" target="_blank">
                  Open calendar
                </a>
                <Link className="sm-button-secondary" to="/find-companies">
                  Open Find Companies
                </Link>
              </div>
              <div className="overflow-hidden rounded-3xl border border-white/8 bg-[rgba(255,255,255,0.02)]">
                <iframe className="h-[720px] w-full bg-white" src={bookingUrl} title="Schedule a call with SuperMega" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Calendar booking is not live on this host yet. Start with Find Companies or Company List first.
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" onClick={() => trackEvent('book_page_start_click', { target: 'find_companies' })} to="/find-companies">Find companies</Link>
                <Link className="sm-button-secondary" onClick={() => trackEvent('book_page_start_click', { target: 'company_list' })} to="/company-list">Open Company List</Link>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
