import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { packages } from '../content'

export function PackagesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Packages"
        title="Three ways to land it."
        description="We start small, prove value, then scale only if the workflow earns it."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {packages.map((pkg) => (
          <article className="sm-surface p-6" key={pkg.name}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-accent)]">{pkg.name}</p>
            <p className="mt-2 text-2xl font-extrabold text-[var(--sm-ink)]">{pkg.timeline}</p>
            <p className="mt-1 text-sm font-medium text-[var(--sm-muted)]">{pkg.commercialModel}</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{pkg.bestFor}</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
              {pkg.deliverables.map((deliverable) => (
                <li className="sm-chip" key={deliverable}>
                  {deliverable}
                </li>
              ))}
            </ul>
            <Link className="sm-button-accent mt-5" to={`/contact?intent=proposal&package=${pkg.name}`}>
              Request {pkg.name} proposal
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
