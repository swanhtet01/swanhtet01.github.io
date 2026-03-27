import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type InventoryRow = {
  inventory_id: string
  captured_at: string
  item_code: string
  item_name: string
  warehouse: string
  on_hand_qty: string
  reserved_qty: string
  available_qty: string
  reorder_point: string
  status: string
  owner: string
  next_action: string
  evidence_link: string
}

type InventorySummary = {
  inventory_count?: number
  by_status?: Record<string, number>
  reorder_count?: number
  watch_count?: number
  top_warehouses?: Array<{ warehouse: string; item_count: number }>
}

type InventoryPayload = {
  rows: InventoryRow[]
  summary: InventorySummary | null
}

const INVENTORY_FORM_DEFAULT = {
  item_code: '',
  item_name: '',
  warehouse: 'Main Warehouse',
  on_hand_qty: '',
  reserved_qty: '',
  reorder_point: '',
  status: '',
  owner: 'Stores Team',
  next_action: '',
  evidence_link: '',
}

export function InventoryPulsePage() {
  const [apiReady, setApiReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [form, setForm] = useState(INVENTORY_FORM_DEFAULT)

  async function loadRecords() {
    const payload = await workspaceFetch<InventoryPayload>('/api/inventory/records')
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
        await loadRecords()
      } catch {
        if (!cancelled) {
          setError('Inventory service is not responding yet.')
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

  const focusRows = useMemo(
    () => rows.filter((row) => ['reorder', 'watch', 'review'].includes(String(row.status || '').toLowerCase())),
    [rows],
  )

  async function saveRecord() {
    if (!apiReady || !form.item_name.trim()) {
      return
    }
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<InventoryPayload & { message?: string }>('/api/inventory/records', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setForm(INVENTORY_FORM_DEFAULT)
      setSaved(payload.message ?? 'Inventory record saved.')
    } catch {
      setError('Could not save the inventory record right now.')
    } finally {
      setSaving(false)
    }
  }

  const highlightRows = focusRows.length ? focusRows : rows

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Deployable system"
        title="Inventory Pulse"
        description="Watch stock position, reserved balance, reorder pressure, and the next action to keep material flowing."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Log a stock position</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Capture stock as a live control record.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            Inventory Pulse is where on-hand quantity, reserved quantity, and reorder pressure become one clear watch queue. Leave status blank if you want the system to infer it.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Item code</span>
              <input className="sm-input" value={form.item_code} onChange={(event) => setForm((current) => ({ ...current, item_code: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Item name</span>
              <input className="sm-input" value={form.item_name} onChange={(event) => setForm((current) => ({ ...current, item_name: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Warehouse</span>
              <input className="sm-input" value={form.warehouse} onChange={(event) => setForm((current) => ({ ...current, warehouse: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Owner</span>
              <input className="sm-input" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">On hand</span>
              <input className="sm-input" value={form.on_hand_qty} onChange={(event) => setForm((current) => ({ ...current, on_hand_qty: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Reserved</span>
              <input className="sm-input" value={form.reserved_qty} onChange={(event) => setForm((current) => ({ ...current, reserved_qty: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Reorder point</span>
              <input className="sm-input" value={form.reorder_point} onChange={(event) => setForm((current) => ({ ...current, reorder_point: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Status</span>
              <select className="sm-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="">auto</option>
                <option value="healthy">healthy</option>
                <option value="watch">watch</option>
                <option value="reorder">reorder</option>
                <option value="review">review</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--sm-muted)]">Next action</span>
            <input className="sm-input" value={form.next_action} onChange={(event) => setForm((current) => ({ ...current, next_action: event.target.value }))} />
          </label>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!apiReady || saving || !form.item_name.trim()} onClick={() => void saveRecord()} type="button">
              {saving ? 'Saving...' : 'Save inventory record'}
            </button>
            <Link className="sm-button-secondary" to="/app/receiving">
              Open Receiving Control
            </Link>
          </div>

          {saved ? <div className="mt-4 sm-chip text-white">{saved}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading inventory records...</p>
          ) : !apiReady ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Workspace API is not connected on this host yet.</p>
              <div className="sm-chip text-white">Run the local workspace service to see live inventory records.</div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Live status</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Stock watch board</h2>
                </div>
                <span className="sm-status-pill">
                  <span className={`sm-led ${rows.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {rows.length} items
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Tracked items</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.inventory_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Reorder</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.reorder_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Watch</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.watch_count ?? 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                {highlightRows.slice(0, 8).map((row) => (
                  <div className="sm-proof-card" key={row.inventory_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.item_name}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">
                          {row.item_code || 'No item code'} | {row.warehouse}
                        </p>
                      </div>
                      <span className="sm-status-pill">{row.status || 'review'}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Stock position</p>
                        <p className="mt-2">On hand: {row.on_hand_qty || '-'}</p>
                        <p className="mt-1">Reserved: {row.reserved_qty || '-'}</p>
                        <p className="mt-1">Available: {row.available_qty || '-'}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Control</p>
                        <p className="mt-2">Reorder point: {row.reorder_point || '-'}</p>
                        <p className="mt-1">Owner: {row.owner || 'Stores Team'}</p>
                        <p className="mt-1 text-[var(--sm-muted)]">{row.next_action || 'Review stock position'}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {rows.length === 0 ? (
                  <div className="sm-chip text-[var(--sm-muted)]">No inventory rows yet. Add the first live stock record from the form on the left.</div>
                ) : null}
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
