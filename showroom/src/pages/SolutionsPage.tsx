import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { solutions } from '../content'

export function SolutionsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Solutions"
        title="Focused AI operating solutions built around owner-level outcomes."
        description="Every solution is designed to move decisions faster, reduce operational friction, and keep execution grounded in real evidence from your business data."
      />

      <section className="grid gap-5">
        {solutions.map((solution) => (
          <article className="rounded-3xl border border-slate-200 bg-white/90 p-6" key={solution.name}>
            <h2 className="text-2xl font-bold text-slate-900">{solution.name}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">{solution.summary}</p>
            <ul className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
              {solution.outcomes.map((outcome) => (
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3" key={outcome}>
                  {outcome}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6">
        <h2 className="text-xl font-bold text-slate-900">Need a custom blend?</h2>
        <p className="mt-2 text-sm text-slate-700">
          We can combine modules into one implementation plan while keeping package boundaries and delivery speed.
        </p>
        <Link className="mt-4 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700" to="/contact?intent=discovery">
          Book Discovery Call
        </Link>
      </section>
    </div>
  )
}
