import { PageIntro } from '../components/PageIntro'
import { LAB_TRACKS } from '../lib/salesControl'

export function LabPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="R&D Lab"
        title="Keep experiments visible, but separate from the main offer."
        description="These are the AI-agent loops we are building. They matter, but they should not be sold as finished products until they are durable."
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {LAB_TRACKS.map((track) => (
          <article className="sm-surface p-6" key={track.id}>
            <p className="sm-kicker text-[var(--sm-accent)]">Lab track</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{track.name}</h2>
            <div className="mt-5 space-y-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Loop</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.loop}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Why it matters</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.why}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Needs before launch</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.graduation}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating rule</p>
        <h2 className="mt-3 text-3xl font-bold text-white">R&D should feed the product, not confuse the front door.</h2>
        <div className="mt-5 grid gap-3">
          <div className="sm-chip text-[var(--sm-muted)]">Ship simple products first: Lead Finder, Workspace, Action OS Starter.</div>
          <div className="sm-chip text-[var(--sm-muted)]">Use the lab to harden recurring agent loops until they can run safely and recover cleanly.</div>
          <div className="sm-chip text-[var(--sm-muted)]">Only graduate an agent loop when it has shared state, recovery, evals, and a clear owner.</div>
        </div>
      </section>
    </div>
  )
}
