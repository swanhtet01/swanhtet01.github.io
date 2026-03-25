import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type ReceivingRow = {
  receiving_id: string
  received_at: string
  supplier: string
  po_or_pi: string
  grn_or_batch: string
  material: string
  expected_qty: string
  received_qty: string
  variance_note: string
  status: string
  owner: string
  next_action: string
  evidence_link: string
}

type ReceivingSummary = {
  receiving_count?: number
  by_status?: Record<string, number>
  variance_count?: number
  hold_count?: number
  top_suppliers?: Array<{ supplier: string; receiving_count: number }>
}

export function ReceivingControlPage() {
  const [apiReady, setApiReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReceivingRow[]>([])
  const [summary, setSummary] = useState<ReceivingSummary | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      setApiReady(health.ready)
      if (!health.ready) {
        setLoading(false)
        return
      }

      try {
        const payload = await workspaceFetch<{ rows: ReceivingRow[]; summary: ReceivingSummary }>('/api/receiving/records')
        if (cancelled) return
        setRows(payload.rows ?? [])
        setSummary(payload.summary ?? null)
      } catch {
        if (cancelled) return
        setError('Receiving service is not responding yet.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const blockedRows = useMemo(
    () => rows.filter((row) => ['hold', 'blocked', 'review'].includes(String(row.status || '').toLowerCase())),
    [rows],
  )

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Deployable system"
        title="Receiving Control"
        description="Track inbound material, GRN or batch status, quantity variance, and the next action to clear the receipt."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Why this matters</p>
          <h2 className="mt-3 text-3xl font-bold text-white">This is where the ERP story becomes real.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            A lot of companies know what they ordered, but not what was actually received, what is on hold, and what still needs action.
            Receiving Control fixes that first.
          </p>

          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">PI / PO to receipt trace</div>
            <div className="sm-chip text-white">GRN or batch-level status</div>
            <div className="sm-chip text-white">Quantity variance visibility</div>
            <div className="sm-chip text-white">Owner + next action for release or follow-up</div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact?package=Receiving%20Control">
              Use on my team
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See all systems
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading receiving records...</p>
          ) : !apiReady ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Workspace API is not connected on this host yet.</p>
              <div className="sm-chip text-white">Run the local workspace service to see live receiving records.</div>
            </div>
          ) : error ? (
            <p className="text-sm text-[var(--sm-muted)]">{error}</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Live status</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Inbound receipt board</h2>
                </div>
                <span className="sm-status-pill">
                  <span className={`sm-led ${rows.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {rows.length} records
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Total receipts</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.receiving_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Variance</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.variance_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Needs review</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.hold_count ?? 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                {(blockedRows.length ? blockedRows : rows).slice(0, 8).map((row) => (
                  <div className="sm-proof-card" key={row.receiving_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.material || 'Inbound material'}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">
                          {row.supplier} · {row.po_or_pi || 'No PI/PO'} · {row.grn_or_batch || 'No GRN'}
                        </p>
                      </div>
                      <span className="sm-status-pill">{row.status || 'review'}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Quantity</p>
                        <p className="mt-2">Expected: {row.expected_qty || '-'}</p>
                        <p className="mt-1">Received: {row.received_qty || '-'}</p>
                        <p className="mt-1 text-[var(--sm-accent-alt)]">{row.variance_note || 'matched'}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Next action</p>
                        <p className="mt-2">{row.next_action || 'Review receipt status'}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">Owner: {row.owner || 'Stores Team'}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {rows.length === 0 ? (
                  <div className="sm-chip text-[var(--sm-muted)]">No receiving rows have been synced into the workspace yet.</div>
                ) : null}
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
