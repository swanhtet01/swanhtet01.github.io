import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type DecisionRow = {
  decision_id: string
  created_at: string
  title: string
  context: string
  decision_text: string
  rationale: string
  owner: string
  status: string
  due: string
  related_route: string
}

type DecisionPayload = {
  summary?: {
    decision_count?: number
    by_status?: Record<string, number>
  }
  rows?: DecisionRow[]
}

type DecisionForm = {
  title: string
  context: string
  decision_text: string
  rationale: string
  owner: string
  status: string
  due: string
  related_route: string
}

const defaults: DecisionForm = {
  title: '',
  context: '',
  decision_text: '',
  rationale: '',
  owner: 'Management',
  status: 'open',
  due: '',
  related_route: '/app/actions',
}

export function DecisionJournalPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<DecisionPayload | null>(null)
  const [form, setForm] = useState<DecisionForm>(defaults)

  async function loadRows() {
    const nextPayload = await workspaceFetch<DecisionPayload>('/api/decisions?limit=30')
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
          setError('Login is required to open the private decision journal.')
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
        setError('Decision journal could not be loaded right now.')
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

  async function saveDecision() {
    if (!form.title.trim() || !form.decision_text.trim()) {
      return
    }
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const nextPayload = await workspaceFetch<DecisionPayload & { message?: string }>('/api/decisions', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setPayload(nextPayload)
      setForm(defaults)
      setMessage(nextPayload.message ?? 'Decision saved.')
    } catch {
      setError('Could not save the decision right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Decision journal"
        title="Capture the decision, not just the issue."
        description="Use this for director and manager decisions so the team can see what was decided, why, and what happens next."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.decision_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_status?.open ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Decided</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_status?.decided ?? 0}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Save a decision</p>
          <div className="mt-5 grid gap-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Title
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                value={form.title}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Context
              <textarea
                className="min-h-24 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, context: event.target.value }))}
                value={form.context}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Decision
              <textarea
                className="min-h-24 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, decision_text: event.target.value }))}
                value={form.decision_text}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Why
              <textarea
                className="min-h-20 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, rationale: event.target.value }))}
                value={form.rationale}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Owner
                <input
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                  onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                  value={form.owner}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Status
                <select
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  value={form.status}
                >
                  <option value="open">open</option>
                  <option value="review">review</option>
                  <option value="decided">decided</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Due
                <input
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                  onChange={(event) => setForm((prev) => ({ ...prev, due: event.target.value }))}
                  value={form.due}
                />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Related screen
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, related_route: event.target.value }))}
                value={form.related_route}
              >
                <option value="/app/actions">Action OS</option>
                <option value="/app/exceptions">Exception Queue</option>
                <option value="/app/receiving">Receiving</option>
                <option value="/app/inventory">Inventory</option>
                <option value="/app/leads">Leads</option>
                <option value="/app/intake">Ops Intake</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={saving} onClick={() => void saveDecision()} type="button">
                {saving ? 'Saving...' : 'Save decision'}
              </button>
              <Link className="sm-button-secondary" to="/app">
                Back to app
              </Link>
            </div>
            {message ? <p className="text-sm text-[var(--sm-accent)]">{message}</p> : null}
            {error ? <p className="text-sm text-[var(--sm-accent-alt)]">{error}</p> : null}
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading decisions...</p>
          ) : payload?.rows?.length ? (
            <div className="space-y-3">
              {payload.rows.map((row) => (
                <article className="sm-proof-card" key={row.decision_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.decision_text}</p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                      <p className="mt-2">{row.owner}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Due</p>
                      <p className="mt-2">{row.due || 'No due date'}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Route</p>
                      <Link className="mt-2 block text-sm text-white underline decoration-white/20 underline-offset-4" to={row.related_route || '/app'}>
                        Open related screen
                      </Link>
                    </div>
                  </div>
                  {row.context ? <p className="mt-4 text-sm text-[var(--sm-muted)]">Context: {row.context}</p> : null}
                  {row.rationale ? <p className="mt-2 text-sm text-[var(--sm-muted)]">Why: {row.rationale}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">No decisions saved yet.</p>
              <div className="sm-chip text-white">Use this when a manager or director makes a call that the team needs to follow.</div>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
