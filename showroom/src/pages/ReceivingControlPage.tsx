import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

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

type ReceivingPayload = {
  rows: ReceivingRow[]
  summary: ReceivingSummary | null
}

const RECEIVING_FORM_DEFAULT = {
  supplier: '',
  po_or_pi: '',
  grn_or_batch: '',
  material: '',
  expected_qty: '',
  received_qty: '',
  status: 'review',
  owner: 'Stores Team',
  next_action: '',
  evidence_link: '',
}

export function ReceivingControlPage() {
  const [apiReady, setApiReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [rows, setRows] = useState<ReceivingRow[]>([])
  const [summary, setSummary] = useState<ReceivingSummary | null>(null)
  const [form, setForm] = useState(RECEIVING_FORM_DEFAULT)

  async function loadRecords() {
    const payload = await workspaceFetch<ReceivingPayload>('/api/receiving/records')
    setRows(payload.rows ?? [])
    setSummary(payload.summary ?? null)
  }

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
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setAuthenticated(false)
          setLoading(false)
          return
        }
        setAuthenticated(true)
      } catch {
        if (!cancelled) {
          setError('Receiving login could not be verified on this host yet.')
          setLoading(false)
        }
        return
      }

      try {
        await loadRecords()
      } catch {
        if (!cancelled) {
          setError('Receiving service is not responding yet.')
        }
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

  async function saveRecord() {
    if (!apiReady || !form.supplier.trim() || !form.material.trim()) {
      return
    }
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<ReceivingPayload & { message?: string }>('/api/receiving/records', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setForm(RECEIVING_FORM_DEFAULT)
      setSaved(payload.message ?? 'Receiving record saved.')
    } catch {
      setError('Could not save the receiving record right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Deployable system"
        title="Receiving Control"
        description="Log inbound material, track GRN or batch status, catch quantity variance, and assign the next action before stock disappears into email and paper."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Log a receipt</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use this like the first real ERP screen.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is the point where ordered material becomes traceable operational state. Capture the inbound record once, then use the board on the right to manage exceptions.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Supplier</span>
              <input className="sm-input" value={form.supplier} onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Material</span>
              <input className="sm-input" value={form.material} onChange={(event) => setForm((current) => ({ ...current, material: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">PI / PO</span>
              <input className="sm-input" value={form.po_or_pi} onChange={(event) => setForm((current) => ({ ...current, po_or_pi: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">GRN / Batch</span>
              <input className="sm-input" value={form.grn_or_batch} onChange={(event) => setForm((current) => ({ ...current, grn_or_batch: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Expected qty</span>
              <input className="sm-input" value={form.expected_qty} onChange={(event) => setForm((current) => ({ ...current, expected_qty: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Received qty</span>
              <input className="sm-input" value={form.received_qty} onChange={(event) => setForm((current) => ({ ...current, received_qty: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Status</span>
              <select className="sm-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="review">review</option>
                <option value="received">received</option>
                <option value="hold">hold</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Owner</span>
              <input className="sm-input" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--sm-muted)]">Next action</span>
            <input className="sm-input" value={form.next_action} onChange={(event) => setForm((current) => ({ ...current, next_action: event.target.value }))} />
          </label>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!apiReady || saving || !form.supplier.trim() || !form.material.trim()} onClick={() => void saveRecord()} type="button">
              {saving ? 'Saving...' : 'Save receiving record'}
            </button>
            <Link className="sm-button-secondary" to="/app/inventory">
              Open Inventory Pulse
            </Link>
          </div>

          {saved ? <div className="mt-4 sm-chip text-white">{saved}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading receiving records...</p>
          ) : !apiReady ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Workspace API is not connected on this host yet.</p>
              <div className="sm-chip text-white">Run the local workspace service to see live receiving records.</div>
            </div>
          ) : !authenticated ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Login is required to use the live receiving board.</p>
              <Link className="sm-button-primary" to="/login?next=/receiving-control">
                Login to Receiving Control
              </Link>
            </div>
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
                          {row.supplier} | {row.po_or_pi || 'No PI/PO'} | {row.grn_or_batch || 'No GRN'}
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
                  <div className="sm-chip text-[var(--sm-muted)]">No receiving rows yet. Add the first live inbound record from the form on the left.</div>
                ) : null}
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
