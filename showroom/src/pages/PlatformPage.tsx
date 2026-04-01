import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { coreProduct, leadFinder } from '../content'

export function PlatformPage() {
  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Action OS" title="One board for the work." description="Pull follow-up out of inboxes and sheets. Keep owners, due dates, blockers, and approvals in one place." />

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface-deep p-6">
          <h2 className="text-4xl font-bold text-white">{coreProduct.tagline}</h2>

          <div className="mt-6 grid gap-3">
            {coreProduct.rollout.map((step) => (
              <div className="sm-chip text-white" key={step}>
                {step}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/book">
              Book call
            </Link>
            <Link className="sm-button-secondary" to="/lead-finder">
              Open Lead Finder
            </Link>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">{leadFinder.title}</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Find the next company to sell into.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{leadFinder.description}</p>
          <div className="mt-5 grid gap-3">
            {leadFinder.steps.map((step) => (
              <div className="sm-chip text-white" key={step}>
                {step}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
