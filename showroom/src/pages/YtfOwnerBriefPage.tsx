import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  getYtfActionFeedbackLatest,
  getYtfOwnerBrief,
  syncYtfOwnerBrief,
  writebackYtfOwnerDecisions,
  type YtfActionFeedbackResult,
  type YtfOwnerBriefResult,
} from '../lib/workspaceApi'

function formatDateTime(value?: string) {
  if (!value) return 'No brief yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function urgencyTone(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'critical') return 'text-rose-100'
  if (normalized === 'high') return 'text-amber-100'
  return 'text-emerald-100'
}

export function YtfOwnerBriefPage() {
  const [brief, setBrief] = useState<YtfOwnerBriefResult | null>(null)
  const [feedback, setFeedback] = useState<YtfActionFeedbackResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const payload = await getYtfOwnerBrief()
        const latestFeedback = await getYtfActionFeedbackLatest().catch(() => null)
        if (!cancelled) {
          setBrief(payload)
          setFeedback(latestFeedback)
        }
      } catch {
        if (!cancelled) setError('Could not load the owner brief.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRefresh() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await syncYtfOwnerBrief()
      setBrief(payload)
      setMessage('Owner brief refreshed from live Drive, KPIs, RAG, and evaluation state.')
    } catch {
      setError('Could not refresh the owner brief right now.')
    } finally {
      setBusy(false)
    }
  }

  async function handleWriteback() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await writebackYtfOwnerDecisions()
      const savedTasks = result.workspace_tasks?.saved_count ?? 0
      const savedActions = result.actions?.saved_count ?? 0
      const payload = await getYtfOwnerBrief()
      const latestFeedback = await getYtfActionFeedbackLatest().catch(() => null)
      setBrief(payload)
      setFeedback(latestFeedback)
      setMessage(`Owner decisions written back: ${savedTasks} workspace tasks and ${savedActions} action-board rows.`)
    } catch {
      setError('Could not write owner decisions into the action system right now.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <PageIntro eyebrow="Owner brief" title="Loading management brief." description="Preparing readiness, Drive changes, KPI posture, and next decisions." />
      </div>
    )
  }

  const today = brief?.today ?? {}
  const ragSummary = brief?.rag?.rag?.summary ?? {}
  const externalDatabase = Boolean(brief?.evaluation?.database?.external)

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Owner brief"
        title="One morning brief for the factory."
        description="A compact operating brief: what changed, what is weak, what needs a decision, and where the evidence lives."
      />

      {error ? <section className="sm-chip text-white">{error}</section> : null}
      {message ? <section className="sm-chip text-white">{message}</section> : null}

      <section className="sm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[0.78fr_1.22fr]">
          <div className="bg-[linear-gradient(135deg,rgba(12,10,9,0.98),rgba(28,25,23,0.92)),radial-gradient(circle_at_15%_10%,rgba(251,191,36,0.3),transparent_28%)] p-6 md:p-8">
            <p className="sm-kicker text-amber-100">Readiness</p>
            <h2 className="mt-3 text-6xl font-black text-white">{brief?.readiness ?? 0}%</h2>
            <p className="mt-4 text-sm leading-relaxed text-amber-50/80">{brief?.headline ?? 'No owner brief has been generated yet.'}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-amber-50/60">Last run: {formatDateTime(brief?.synced_at)}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy} onClick={() => void handleRefresh()} type="button">
                {busy ? 'Refreshing...' : 'Refresh owner brief'}
              </button>
              <Link className="sm-button-secondary" to="/app/evaluation">Evaluation</Link>
              <button className="sm-button-secondary" disabled={busy} onClick={() => void handleWriteback()} type="button">
                Write to actions
              </button>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 md:p-8 xl:grid-cols-4">
            {[
              ['Drive changes', today.watched_change_count ?? 0, `${today.owner_brief_count ?? 0} owner briefs`],
              ['Open actions', today.open_action_count ?? 0, `${today.weak_dimension_count ?? 0} weak dimensions`],
              ['KPI queue', today.candidate_count ?? 0, `${today.official_count ?? 0} official KPIs`],
              ['Source memory', today.chunk_count ?? ragSummary.chunk_count ?? 0, `${today.entity_count ?? ragSummary.entity_count ?? 0} entities`],
              ['Ready lanes', today.ready_lane_count ?? 0, `${today.shortcut_debt_count ?? 0} shortcut debt`],
              ['Persistence', externalDatabase ? 'Live' : 'Local', brief?.evaluation?.database?.mode ?? 'checking'],
              ['Relations', today.relation_count ?? ragSummary.relation_count ?? 0, `${ragSummary.retrieval_trace_count ?? 0} matches`],
              ['Metrics', today.metric_count ?? 0, 'enterprise mirror'],
            ].map(([label, value, detail]) => (
              <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4" key={String(label)}>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{label}</p>
                <p className="mt-2 text-3xl font-black text-white">{value}</p>
                <p className="mt-1 text-xs text-[var(--sm-muted)]">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Next decisions</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Do these in order.</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy} onClick={() => void handleWriteback()} type="button">
              {busy ? 'Writing...' : 'Turn decisions into tasks'}
            </button>
            <Link className="sm-button-secondary" to="/app/action-board">Open Action Board</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {feedback?.status && feedback.status !== 'empty' ? (
              <article className="sm-chip text-sm text-white">
                Closure loop: task {feedback.task_id || 'latest'} is {feedback.task_status || 'updated'}.
                {' '}
                {feedback.next_step}
              </article>
            ) : null}
            {(brief?.next_decisions ?? []).map((item) => (
              <Link className="sm-proof-card block" key={item.id ?? item.title} to={item.route || '/app/action-board'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.owner}</p>
                  </div>
                  <span className={`sm-status-pill ${urgencyTone(item.urgency)}`}>{item.urgency}</span>
                </div>
                <p className="mt-3 text-sm text-white">{item.decision}</p>
                <p className="mt-2 text-xs text-[var(--sm-muted)]">{item.why}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI evidence</p>
          <h2 className="mt-2 text-2xl font-bold text-white">RAG answer with source chunks.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{brief?.rag?.answer ?? 'No AI evidence brief yet.'}</p>
          <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Semantic rerank</p>
            <p className="mt-2 text-sm text-white">
              {brief?.rag?.rag?.semantic?.matched_chunk_count ?? 0} matched chunks / {brief?.rag?.rag?.semantic?.model ?? 'local-bow-v1'}
            </p>
            <p className="mt-1 text-xs text-[var(--sm-muted)]">{brief?.rag?.rag?.semantic?.next_upgrade ?? 'Attach managed Postgres plus pgvector or embeddings for persistent semantic search.'}</p>
          </div>
          <div className="mt-5 grid gap-3">
            {(brief?.rag?.rag?.semantic?.top_chunks ?? []).slice(0, 2).map((chunk) => (
              <Link className="sm-chip block text-sm text-white" key={chunk.chunk_id ?? chunk.text} to={chunk.route || '/app/change-monitor'}>
                {chunk.text}
              </Link>
            ))}
            {(brief?.rag?.rag?.chunks ?? []).slice(0, 3).map((chunk) => (
              <Link className="sm-chip block text-sm text-white" key={chunk.chunk_id ?? chunk.text} to={chunk.route || '/app/change-monitor'}>
                {chunk.text}
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="sm-surface p-5 md:p-6 lg:col-span-2">
          <p className="sm-kicker text-[var(--sm-accent)]">Top changes</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {(brief?.top_changes ?? []).slice(0, 6).map((item) => (
              <Link className="sm-proof-card block" key={item.id ?? item.title} to={item.route || '/app/change-monitor'}>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-xs text-[var(--sm-muted)]">{item.owner} / {item.priority} / {item.domain}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.next_action ?? item.signal}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Daily rhythm</p>
          <div className="mt-5 grid gap-3">
            {(brief?.operating_rhythm ?? []).map((item) => (
              <p className="sm-chip text-sm text-white" key={item}>{item}</p>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
