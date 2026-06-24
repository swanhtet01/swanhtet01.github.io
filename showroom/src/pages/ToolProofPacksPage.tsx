import { useEffect, useMemo, useState } from 'react'

type ProofPackSection = {
  id: string
  name: string
  value: string
}

type ProofPack = {
  id: string
  product_id: string
  product_name: string
  status: string
  priority: number
  public_anchor: string
  intake_route: string
  buyer_scene: string
  sample_input: string
  proof_output: string
  artifact_sections: ProofPackSection[]
  acceptance_checks: string[]
}

type ToolProofPackPayload = {
  status: string
  generated_at: string
  generated_for: string
  metrics?: {
    product_count?: number
    proof_pack_count?: number
  }
  proof_packs: ProofPack[]
}

function byPriorityThenName(a: ProofPack, b: ProofPack) {
  const priorityDelta = (a.priority ?? 999) - (b.priority ?? 999)
  if (priorityDelta !== 0) return priorityDelta
  return String(a.product_name || '').localeCompare(String(b.product_name || ''), undefined, { sensitivity: 'base' })
}

export function ToolProofPacksPage() {
  const [payload, setPayload] = useState<ToolProofPackPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/site/tool-proof-packs.json', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Proof pack feed not ready on this host yet.')
        }
        const nextPayload = (await response.json()) as ToolProofPackPayload
        if (!cancelled) {
          setPayload(nextPayload)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setPayload(null)
          setError(caught instanceof Error ? caught.message : 'Could not load proof packs.')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const packs = useMemo(() => (payload?.proof_packs ?? []).slice().sort(byPriorityThenName), [payload])

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero" aria-label="Proof packs">
        <div>
          <h1>Workflow proof packs.</h1>
          <p>Pick the work you want replaced, then review the screen, input, output, and acceptance checks before rollout.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid" aria-label="Proof pack catalog">
        <div className="sm-simple-form">
          <div className="sm-simple-fields">
            <div className="sm-simple-wide">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[var(--sm-ink)]">Customer-ready proof packs</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">
                    {payload
                      ? `${payload.metrics?.proof_pack_count ?? packs.length} packs - refreshed ${new Date(payload.generated_at).toLocaleString()}`
                      : 'Loading...'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="sm-button-primary" href="/start/">
                    Start intake
                  </a>
                  <a className="sm-button-secondary" href="/intake/">
                    Detailed intake
                  </a>
                </div>
              </div>
              {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
            </div>

            {packs.map((pack) => (
              <article className="sm-simple-wide rounded-3xl border border-slate-200 bg-white/70 p-6" id={pack.id} key={pack.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">Workflow replacement</p>
                    <h2 className="mt-2 text-2xl font-black leading-tight text-[var(--sm-ink)]">{pack.product_name}</h2>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.buyer_scene}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">{pack.status}</span>
                </div>

                <div className="mt-5 grid gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Real input to connect</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.sample_input}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Working output to inspect</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.proof_output}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Acceptance checks</p>
                    <ul className="mt-2 list-disc pl-6 text-sm text-[var(--sm-muted)]">
                      {(pack.acceptance_checks ?? []).slice(0, 8).map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <a className="sm-button-primary" href={pack.intake_route || '/intake/'}>
                    Start this rollout
                  </a>
                  <a className="sm-button-secondary" href={pack.public_anchor || `/proof/#${pack.id}`}>
                    Proof link
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="sm-simple-next" aria-label="Proof pack policy">
          <h2>Use policy</h2>
          <ol>
            <li>Use proof packs to choose one workflow, not to imply a finished custom deployment.</li>
            <li>Client-facing claims require human approval and source evidence.</li>
            <li>Billing activation stays manual unless configured.</li>
          </ol>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">If your case is not listed, start with the closest workflow in /start.</p>
        </aside>
      </section>
    </div>
  )
}
