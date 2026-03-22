import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'

export function AboutPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="About SuperMega"
        title="A productized AI agency built to ship practical systems, not demos."
        description="SuperMega operates as a delivery-first AI partner. We combine workflow engineering, data grounding, and decision-ready reporting so owner-led teams can execute with clarity."
      />

      <section className="grid gap-5 md:grid-cols-2">
        <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
          <h2 className="text-xl font-bold text-[var(--sm-ink)]">What we optimize for</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Clear ROI within the first delivery sprint</li>
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Grounded outputs with file and email evidence</li>
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Repeatable operations with handover-ready SOPs</li>
          </ul>
        </article>
        <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6">
          <h2 className="text-xl font-bold text-[var(--sm-ink)]">Delivery model</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Weekly artifact-based progress reports</li>
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Human-in-the-loop checkpoints for critical actions</li>
            <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3">Controlled expansion from one workflow to operating system</li>
          </ul>
        </article>
      </section>

      <section className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Ready to start with one high-value workflow?</h2>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          We run a focused discovery, confirm outcomes, and ship the first production workflow before expanding scope.
        </p>
        <Link className="mt-4 inline-flex rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]" to="/contact">
          Book call
        </Link>
      </section>
    </div>
  )
}
