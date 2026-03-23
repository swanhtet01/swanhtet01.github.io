import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { packages } from '../content'

export function PackagesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Packages"
        title="Simple pricing."
        description="Pick Starter, Growth, or Scale."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {packages.map((pkg) => (
          <article className="rounded-3xl border border-white/65 bg-white/45 p-6 backdrop-blur-xl" key={pkg.name}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--sm-accent)]">{pkg.name}</p>
            <p className="mt-2 text-2xl font-extrabold text-[var(--sm-ink)]">{pkg.investment}</p>
            <p className="mt-1 text-sm font-medium text-[var(--sm-muted)]">{pkg.timeline}</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{pkg.bestFor}</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
              {pkg.deliverables.map((deliverable) => (
                <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3" key={deliverable}>
                  {deliverable}
                </li>
              ))}
            </ul>
            <Link
              className="mt-5 inline-flex rounded-full bg-[var(--sm-accent-alt)] px-4 py-2 text-sm font-bold text-white hover:bg-[#b84d1d]"
              to={`/contact?intent=proposal&package=${pkg.name}`}
            >
              Request {pkg.name} proposal
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
