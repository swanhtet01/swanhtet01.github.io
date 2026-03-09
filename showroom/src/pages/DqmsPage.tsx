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
          <article className="rounded-3xl border border-slate-200 bg-white/90 p-6" key={module.name}>
            <h2 className="text-xl font-bold text-slate-900">{module.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{module.purpose}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {module.outputs.map((output) => (
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2" key={output}>
                  {output}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-bold text-slate-900">What this adds beyond dashboards</h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <li className="rounded-2xl border border-amber-100 bg-white px-3 py-3">Incident-to-CAPA chain with owner and due date</li>
          <li className="rounded-2xl border border-amber-100 bg-white px-3 py-3">Supplier-level trend snapshots for review meetings</li>
          <li className="rounded-2xl border border-amber-100 bg-white px-3 py-3">Weekly quality summary artifacts for leadership</li>
          <li className="rounded-2xl border border-amber-100 bg-white px-3 py-3">Governed closure criteria and validation checkpoints</li>
        </ul>
        <Link className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700" to="/contact?intent=dqms">
          Add DQMS module
        </Link>
      </section>
    </div>
  )
}
