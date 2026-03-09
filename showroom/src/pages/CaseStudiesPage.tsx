import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { caseStudies } from '../content'

export function CaseStudiesPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Case Studies"
        title="From fragmented prototypes to operational systems with measurable outputs."
        description="These are productized case narratives based on current SuperMega and Yangon Tyre work. Each one follows baseline, intervention, and result."
      />

      <section className="space-y-5">
        {caseStudies.map((study) => (
          <article className="rounded-3xl border border-slate-200 bg-white/90 p-6" key={study.title}>
            <h2 className="text-2xl font-bold text-slate-900">{study.title}</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Baseline</p>
                <p className="mt-2 leading-relaxed text-slate-700">{study.baseline}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Intervention</p>
                <p className="mt-2 leading-relaxed text-slate-700">{study.intervention}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Outcome</p>
                <p className="mt-2 leading-relaxed text-slate-700">{study.outcome}</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold text-cyan-700">{study.proof}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6">
        <h2 className="text-xl font-bold text-slate-900">Want a case study in your format?</h2>
        <p className="mt-2 text-sm text-slate-700">
          We can turn your own files and mail history into measurable baseline-versus-outcome reports for investor or board use.
        </p>
        <Link className="mt-4 inline-flex rounded-full bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-500" to="/contact?intent=case-study">
          Request custom case report
        </Link>
      </section>
    </div>
  )
}
