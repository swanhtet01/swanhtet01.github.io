import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type ExceptionRow = {
  exception_id: string
  source_type: string
  priority: string
  status: string
  owner: string
  title: string
  summary: string
  entity: string
  next_action: string
  due: string
  route: string
}

type ExceptionPayload = {
  summary?: {
    total_items?: number
    by_source?: Record<string, number>
    by_priority?: Record<string, number>
  }
  rows?: ExceptionRow[]
}

export function ExceptionQueuePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ExceptionPayload | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null)

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
          setError('Login is required to open the private exception queue.')
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
        const nextPayload = await workspaceFetch<ExceptionPayload>('/api/exceptions?limit=40')
        if (cancelled) return
        setPayload(nextPayload)
      } catch {
        if (cancelled) return
        setError('Exception queue could not be loaded right now.')
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

  const rows = payload?.rows ?? []

  async function sendToApprovals(row: ExceptionRow) {
    setApprovalBusyId(row.exception_id)
    setMessage(null)
    setError(null)
    try {
      await workspaceFetch('/api/approvals', {
        method: 'POST',
        body: JSON.stringify({
          title: row.title,
          summary: row.summary,
          approval_gate: row.source_type,
          requested_by: row.owner || 'System',
          owner: 'Management',
          status: 'pending',
          due: row.due,
          related_route: row.route,
          related_entity: row.entity,
          payload: row,
        }),
      })
      setMessage(`Sent "${row.title}" to approvals.`)
    } catch {
      setError('Could not send the item to approvals right now.')
    } finally {
      setApprovalBusyId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Exception queue"
        title="One queue for what is starting to break."
        description="This screen pulls supplier risk, quality incidents, receiving exceptions, and inventory pressure into one place."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.total_items ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">High</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_priority?.high ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Supplier</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.by_source?.supplier_risk ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Receiving + inventory</p>
          <p className="mt-3 text-3xl font-bold text-white">
            {(payload?.summary?.by_source?.receiving ?? 0) + (payload?.summary?.by_source?.inventory ?? 0)}
          </p>
        </div>
      </section>

      <section className="sm-surface p-6">
        {message ? <p className="mb-4 text-sm text-[var(--sm-accent)]">{message}</p> : null}
        {loading ? (
          <p className="text-sm text-[var(--sm-muted)]">Loading exception queue...</p>
        ) : error ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--sm-muted)]">{error}</p>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/login?next=/app/exceptions">
                Login
              </Link>
              <Link className="sm-button-secondary" to="/app">
                Back to app
              </Link>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--sm-muted)]">No exception rows yet. Start with receiving, inventory, supplier watch, or quality intake.</p>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-secondary" to="/app/receiving">
                Open Receiving
              </Link>
              <Link className="sm-button-secondary" to="/app/inventory">
                Open Inventory
              </Link>
              <Link className="sm-button-secondary" to="/app/actions">
                Open Action OS
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <article className="sm-proof-card" key={row.exception_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{row.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                  </div>
                  <span className="sm-status-pill">{row.priority}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Source</p>
                    <p className="mt-2">{row.source_type}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Owner</p>
                    <p className="mt-2">{row.owner || 'Unassigned'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Entity</p>
                    <p className="mt-2">{row.entity || 'General'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Due / ref</p>
                    <p className="mt-2">{row.due || row.status || 'Review'}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="sm-chip text-white">
                    <span className="sm-kicker text-[var(--sm-accent)]">Next action</span>
                    <p className="mt-2 text-sm">{row.next_action || 'Review and assign next step.'}</p>
                  </div>
                  <button
                    className="sm-button-primary"
                    disabled={approvalBusyId === row.exception_id}
                    onClick={() => void sendToApprovals(row)}
                    type="button"
                  >
                    {approvalBusyId === row.exception_id ? 'Sending...' : 'Send to approvals'}
                  </button>
                  <Link className="sm-button-secondary" to={row.route}>
                    Open source screen
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
