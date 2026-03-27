import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'

export function BookPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Book demo"
        title="Book a 20-minute demo."
        description="We will look at one workflow, one data source, and the fastest first rollout. Keep it simple."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we cover</p>
          <div className="mt-5 grid gap-3">
            {[
              'The one workflow that wastes the most time today',
              'What data already exists in Gmail, Drive, or Sheets',
              'The first live board or queue we would ship',
            ].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-[var(--sm-muted)]">
            Best fit: owner-led teams, factories, distributors, and managers who want one working operating layer before any bigger rollout.
          </p>
        </aside>

        <section className="sm-surface p-6">
          {bookingUrl ? (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Scheduling is enabled. Use the booking link below to choose a slot.
              </div>
              <div className="flex flex-wrap gap-3">
                <a className="sm-button-primary" href={bookingUrl} rel="noreferrer" target="_blank">
                  Open booking calendar
                </a>
                <Link className="sm-button-secondary" to="/lead-finder">
                  Try Lead Finder first
                </Link>
              </div>
              <div className="overflow-hidden rounded-3xl border border-white/8 bg-[rgba(255,255,255,0.02)]">
                <iframe className="h-[720px] w-full bg-white" src={bookingUrl} title="Book a demo with SuperMega" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="sm-chip text-[var(--sm-muted)]">
                Booking is not configured on this host yet. Set <code>VITE_BOOKING_URL</code> to your calendar link to make demo scheduling live.
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/contact">
                  Request a demo manually
                </Link>
                <Link className="sm-button-secondary" to="/lead-finder">
                  Try Lead Finder first
                </Link>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
