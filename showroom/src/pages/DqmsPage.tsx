import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { dqmsModules } from '../content'

export function DqmsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="DQMS and Operations Add-ons"
        title="Specialized quality and operations modules for teams that need traceability."
        description="DQMS is positioned as a premium add-on. It is activated when you need a quality incident trail, CAPA tracking, and supplier nonconformance visibility."
      />

      <section className="grid gap-5 md:grid-cols-3">
        {dqmsModules.map((module) => (
          <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6" key={module.name}>
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">{module.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{module.purpose}</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
              {module.outputs.map((output) => (
                <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2" key={output}>
                  {output}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">What this adds beyond dashboards</h2>
        <ul className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)] md:grid-cols-2">
          <li className="rounded-2xl border border-[var(--sm-line)] bg-white px-3 py-3">Incident-to-CAPA chain with owner and due date</li>
          <li className="rounded-2xl border border-[var(--sm-line)] bg-white px-3 py-3">Supplier-level trend snapshots for review meetings</li>
          <li className="rounded-2xl border border-[var(--sm-line)] bg-white px-3 py-3">Weekly quality summary artifacts for leadership</li>
          <li className="rounded-2xl border border-[var(--sm-line)] bg-white px-3 py-3">Governed closure criteria and validation checkpoints</li>
        </ul>
        <Link className="mt-5 inline-flex rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]" to="/contact?intent=dqms">
          Add DQMS module
        </Link>
      </section>
    </div>
  )
}
