import { useEffect, useMemo, useState } from 'react'

type ValueCell = {
  id: string
  product_name: string
  status: string
  product_route: string
  next_automated_actions?: string[]
  auto_deliverables?: Array<{ name: string; value: string }>
  pricing_readiness?: {
    stripe_product_pending?: boolean
  }
}

type ValueEnginePayload = {
  status: string
  generated_at: string
  metrics?: {
    value_cell_count?: number
    auto_deliverable_count?: number
    stripe_readiness_count?: number
  }
  autopilot_runbook?: Array<{ step: string; automated_output: string; human_gate: string }>
  value_cells?: ValueCell[]
}

export function ValuePage() {
  const [payload, setPayload] = useState<ValueEnginePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/site/automated-value-engine.json', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Value engine feed is not ready on this host yet.')
        }
        const nextPayload = (await response.json()) as ValueEnginePayload
        if (!cancelled) {
          setPayload(nextPayload)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setPayload(null)
          setError(caught instanceof Error ? caught.message : 'Could not load value engine.')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const runbook = useMemo(() => payload?.autopilot_runbook ?? [], [payload])
  const cells = useMemo(() => payload?.value_cells ?? [], [payload])

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero" aria-label="Automated value engine">
        <div>
          <h1>Automated value engine.</h1>
          <p>Turn tools into paid outcomes.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid" aria-label="Value engine">
        <div className="sm-simple-form">
          <div className="sm-simple-fields">
            <div className="sm-simple-wide">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Automated value engine</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--sm-ink)]">
                Intake, Score, Draft, Proof pack, approval queue.
              </h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Human approval required before posting, sending, billing activation, or advice-sensitive use. Stripe products pending.
              </p>
              {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
            </div>

            <div className="sm-simple-wide grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white/70 p-4">
                <p className="text-3xl font-black text-[var(--sm-ink)]">{payload?.metrics?.value_cell_count ?? '-'}</p>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Value cells</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/70 p-4">
                <p className="text-3xl font-black text-[var(--sm-ink)]">{payload?.metrics?.auto_deliverable_count ?? '-'}</p>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Auto deliverables</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/70 p-4">
                <p className="text-3xl font-black text-[var(--sm-ink)]">{payload?.metrics?.stripe_readiness_count ?? '-'}</p>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Stripe products pending</p>
              </div>
            </div>

            {runbook.map((step) => (
              <article className="sm-simple-wide rounded-3xl border border-slate-200 bg-white/70 p-5" key={step.step}>
                <h2 className="text-2xl font-black text-[var(--sm-ink)]">{step.step}</h2>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{step.automated_output}</p>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{step.human_gate}</p>
              </article>
            ))}

            {cells.slice(0, 8).map((cell) => (
              <article className="sm-simple-wide rounded-3xl border border-slate-200 bg-white/70 p-5" id={cell.id} key={cell.id}>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{cell.status}</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--sm-ink)]">{cell.product_name}</h2>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.next_automated_actions?.[0] ?? 'Generate one reviewed value artifact.'}</p>
                <a className="sm-button-secondary mt-4 inline-flex" href={cell.product_route || '/tools/'}>
                  View tool
                </a>
              </article>
            ))}
          </div>
        </div>

        <aside className="sm-simple-next" aria-label="Value path">
          <h2>Path</h2>
          <ol>
            <li>Intake.</li>
            <li>Score.</li>
            <li>Draft.</li>
            <li>Proof pack.</li>
            <li>approval queue.</li>
          </ol>
          <a className="sm-button-secondary mt-4 inline-flex" href="/site/automated-value-engine.json">
            View value JSON
          </a>
        </aside>
      </section>
    </div>
  )
}
