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
          <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6" key={study.title}>
            <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{study.title}</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Baseline</p>
                <p className="mt-2 leading-relaxed text-[var(--sm-muted)]">{study.baseline}</p>
              </div>
              <div className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Intervention</p>
                <p className="mt-2 leading-relaxed text-[var(--sm-muted)]">{study.intervention}</p>
              </div>
              <div className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sm-muted)]">Outcome</p>
                <p className="mt-2 leading-relaxed text-[var(--sm-muted)]">{study.outcome}</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold text-[var(--sm-accent)]">{study.proof}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Want a case study in your format?</h2>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          We can turn your own files and mail history into measurable baseline-versus-outcome reports for investor or board use.
        </p>
        <Link className="mt-4 inline-flex rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]" to="/contact?intent=case-study">
          Request custom case report
        </Link>
      </section>
    </div>
  )
}
