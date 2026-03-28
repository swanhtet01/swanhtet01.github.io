import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type ApprovalRow = {
  approval_id: string
  created_at: string
  title: string
  summary: string
  approval_gate: string
  requested_by: string
  owner: string
  status: string
  due: string
  related_route: string
  related_entity: string
  evidence_link: string
  payload?: Record<string, unknown>
}

type ApprovalPayload = {
  summary?: {
    approval_count?: number
    by_status?: Record<string, number>
  }
  rows?: ApprovalRow[]
}

type ApprovalForm = {
  title: string
  summary: string
  approval_gate: string
  requested_by: string
  owner: string
  status: string
  due: string
  related_route: string
  related_entity: string
  evidence_link: string
}

const defaults: ApprovalForm = {
  title: '',
  summary: '',
  approval_gate: 'general',
  requested_by: 'Management',
  owner: 'Management',
  status: 'pending',
  due: '',
  related_route: '/app/actions',
  related_entity: '',
  evidence_link: '',
}

export function ApprovalQueuePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ApprovalPayload | null>(null)
  const [form, setForm] = useState<ApprovalForm>(defaults)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function loadRows() {
    const nextPayload = await workspaceFetch<ApprovalPayload>('/api/approvals?limit=30')
    setPayload(nextPayload)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      if (!health.ready) {
        setError('Workspace API is not connected on this host yet.')
        setLoading(false)
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setError('Login is required to open approvals.')
          setLoading(false)
          return
        }
      } catch {
        if (cancelled) return
        setError('Workspace login could not be verified on this host yet.')
        setLoading(false)
        return
      }

      try {
        await loadRows()
      } catch {
        if (cancelled) return
        setError('Approval queue could not be loaded right now.')
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

  async function saveApproval() {
    if (!form.title.trim()) {
      return
    }
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const nextPayload = await workspaceFetch<ApprovalPayload & { message?: string }>('/api/approvals', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setPayload(nextPayload)
      setForm(defaults)
      setMessage(nextPayload.message ?? 'Approval saved.')
    } catch {
      setError('Could not save the approval right now.')
    } finally {
      setSaving(false)
    }
  }

  async function updateApprovalStatus(approvalId: string, status: 'approved' | 'rejected' | 'review') {
    setUpdatingId(approvalId)
    setMessage(null)
    setError(null)
    try {
      const nextPayload = await workspaceFetch<ApprovalPayload & { message?: string }>(`/api/approvals/${encodeURIComponent(approvalId)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      setPayload(nextPayload)
      setMessage(nextPayload.message ?? 'Approval updated.')
    } catch {
      setError('Could not update the approval right now.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Approval queue"
        title="Control what needs a manager call."
        description="Turn exceptions and requests into a live approval lane with a clear gate, owner, and decision."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.approval_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Pending</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_status?.pending ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Review</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_status?.review ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Approved</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_status?.approved ?? 0}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Raise approval</p>
          <div className="mt-5 grid gap-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Title
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} value={form.title} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Summary
              <textarea className="min-h-24 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white" onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))} value={form.summary} />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Gate
                <select className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, approval_gate: event.target.value }))} value={form.approval_gate}>
                  <option value="general">general</option>
                  <option value="procurement">procurement</option>
                  <option value="quality">quality</option>
                  <option value="receiving">receiving</option>
                  <option value="inventory">inventory</option>
                  <option value="finance">finance</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Requested by
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, requested_by: event.target.value }))} value={form.requested_by} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Owner
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))} value={form.owner} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Due
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, due: event.target.value }))} value={form.due} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Related screen
                <select className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, related_route: event.target.value }))} value={form.related_route}>
                  <option value="/app/actions">Action OS</option>
                  <option value="/app/exceptions">Exception Queue</option>
                  <option value="/app/receiving">Receiving</option>
                  <option value="/app/inventory">Inventory</option>
                  <option value="/app/decisions">Decision Journal</option>
                  <option value="/app/leads">Leads</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Related entity
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, related_entity: event.target.value }))} value={form.related_entity} />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Evidence link
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, evidence_link: event.target.value }))} value={form.evidence_link} />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={saving} onClick={() => void saveApproval()} type="button">
                {saving ? 'Saving...' : 'Save approval'}
              </button>
              <Link className="sm-button-secondary" to="/app/exceptions">
                Back to exceptions
              </Link>
            </div>
            {message ? <p className="text-sm text-[var(--sm-accent)]">{message}</p> : null}
            {error ? <p className="text-sm text-[var(--sm-accent-alt)]">{error}</p> : null}
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading approvals...</p>
          ) : payload?.rows?.length ? (
            <div className="space-y-3">
              {payload.rows.map((row) => (
                <article className="sm-proof-card" key={row.approval_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary || 'Review and decide.'}</p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Gate</p>
                      <p className="mt-2">{row.approval_gate}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Requester</p>
                      <p className="mt-2">{row.requested_by}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                      <p className="mt-2">{row.owner}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Due</p>
                      <p className="mt-2">{row.due || 'Review now'}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" disabled={updatingId === row.approval_id} onClick={() => void updateApprovalStatus(row.approval_id, 'approved')} type="button">
                      Approve
                    </button>
                    <button className="sm-button-secondary" disabled={updatingId === row.approval_id} onClick={() => void updateApprovalStatus(row.approval_id, 'review')} type="button">
                      Mark review
                    </button>
                    <button className="sm-button-secondary" disabled={updatingId === row.approval_id} onClick={() => void updateApprovalStatus(row.approval_id, 'rejected')} type="button">
                      Reject
                    </button>
                    <Link className="sm-button-secondary" to={row.related_route || '/app'}>
                      Open source
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">No approvals saved yet.</p>
              <div className="sm-chip text-white">Use approvals to turn exceptions into real manager decisions.</div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
