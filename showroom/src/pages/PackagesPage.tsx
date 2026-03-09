import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { packages } from '../content'

export function PackagesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Packages"
        title="Three productized offers. Clear scope, clear delivery, clear outcomes."
        description="Start small or scale wide, but stay execution-first. Each package includes implementation artifacts, operating documentation, and measurable checkpoints."
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {packages.map((pkg) => (
          <article className="rounded-3xl border border-slate-200 bg-white/90 p-6" key={pkg.name}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">{pkg.name}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{pkg.investment}</p>
            <p className="mt-1 text-sm font-medium text-slate-600">{pkg.timeline}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-700">{pkg.bestFor}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {pkg.deliverables.map((deliverable) => (
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3" key={deliverable}>
                  {deliverable}
                </li>
              ))}
            </ul>
            <Link
              className="mt-5 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
