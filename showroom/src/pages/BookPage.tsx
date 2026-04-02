import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'

export function BookPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Schedule"
        title="Book a short call."
        description="Start with one workflow. Keep the first rollout small."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we cover</p>
          <div className="mt-5 grid gap-3">
            {[
              'One workflow to fix first',
              'What data already exists',
              'What the first board should be',
            ].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-[var(--sm-muted)]">Best fit: teams that want one working board before a bigger rollout.</p>
        </aside>

        <section className="sm-surface p-6">
          {bookingUrl ? (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Scheduling is enabled. Use the booking link below to choose a slot.
              </div>
              <div className="flex flex-wrap gap-3">
                <a className="sm-button-primary" href={bookingUrl} rel="noreferrer" target="_blank">
                  Open calendar
                </a>
                <Link className="sm-button-secondary" to="/lead-finder">
                  Open Lead Finder
                </Link>
              </div>
              <div className="overflow-hidden rounded-3xl border border-white/8 bg-[rgba(255,255,255,0.02)]">
                <iframe className="h-[720px] w-full bg-white" src={bookingUrl} title="Schedule a call with SuperMega" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Booking is not live on this host yet. Use Lead Finder and Workspace first, then book once the calendar is connected.
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/lead-finder">Find leads</Link>
                <Link className="sm-button-secondary" to="/workspace">Open workspace</Link>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
