import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getYtfEvaluation, syncYtfEvaluation, type YtfEvaluationResult } from '../lib/workspaceApi'
import { YTF_NEXT_BUILD_SEQUENCE, YTF_PRODUCT_STACK, YTF_WORKSPACE_SCORECARDS } from '../lib/ytfWorkspaceEvaluationModel'

function statusTone(status?: string) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'strong') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
  if (normalized === 'watch') return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  return 'border-rose-300/30 bg-rose-300/10 text-rose-100'
}

function severityTone(severity?: string) {
  const normalized = String(severity ?? '').trim().toLowerCase()
  if (normalized === 'critical') return 'text-rose-100'
  if (normalized === 'high') return 'text-amber-100'
  return 'text-sky-100'
}

function formatDateTime(value?: string) {
  if (!value) return 'No evaluation run yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function YtfEvaluationPage() {
  const [evaluation, setEvaluation] = useState<YtfEvaluationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const payload = await getYtfEvaluation()
        if (!cancelled) setEvaluation(payload)
      } catch {
        if (!cancelled) setError('Could not load the YTF evaluation report.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const weakDimensions = useMemo(
    () => (evaluation?.dimensions ?? []).filter((item) => Number(item.score ?? 0) < 80),
    [evaluation?.dimensions],
  )
  const useNowStack = YTF_PRODUCT_STACK.filter((item) => item.posture === 'Use now').slice(0, 6)

  async function handleRefresh() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const payload = await syncYtfEvaluation()
      setEvaluation(payload)
      setMessage('Evaluation refreshed from live Drive, metrics, and runtime posture.')
    } catch {
      setError('Could not refresh evaluation right now.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <PageIntro eyebrow="Evaluation" title="Loading YTF ERP score." description="Checking data quality, Drive change handling, KPI maturity, RAG readiness, ISO workflow, and infrastructure." />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evaluation"
        title="One scorecard for what is live, what is weak, and what to fix next."
        description="This is the owner/operator review surface for the AI-native ISO ERP: live evidence first, static roadmap second."
      />

      {error ? <section className="sm-chip text-white">{error}</section> : null}
      {message ? <section className="sm-chip text-white">{message}</section> : null}

      <section className="sm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.26),transparent_34%),linear-gradient(135deg,rgba(69,26,3,0.94),rgba(2,6,23,0.98))] p-6 md:p-8">
            <p className="sm-kicker text-amber-100">Overall readiness</p>
            <h2 className="mt-3 text-5xl font-black text-white">{evaluation?.overall_score ?? 0}%</h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-50/80">{evaluation?.verdict ?? 'Evaluation pending.'}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-amber-50/60">Last run: {formatDateTime(evaluation?.synced_at)}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy} onClick={() => void handleRefresh()} type="button">
                {busy ? 'Evaluating...' : 'Refresh evaluation'}
              </button>
              <Link className="sm-button-secondary" to="/app/data-quality">
                Data Quality
              </Link>
              <Link className="sm-button-secondary" to="/app/owner-brief">
                Owner Brief
              </Link>
            </div>
          </div>
          <div className="grid gap-3 p-6 md:grid-cols-2 md:p-8 xl:grid-cols-3">
            {(evaluation?.dimensions ?? []).map((dimension) => (
              <Link className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.07]" key={dimension.id} to={dimension.route || '/app/evaluation'}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black text-white">{dimension.score ?? 0}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">{dimension.title}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone(dimension.status)}`}>{dimension.status}</span>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[var(--sm-muted)]">{dimension.why}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Priority gaps</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Fix these before calling it enterprise-complete.</h2>
          <div className="mt-5 grid gap-3">
            {(evaluation?.top_gaps ?? []).map((gap) => (
              <Link className="sm-proof-card block" key={gap.id ?? gap.title} to={gap.route || '/app/platform-admin'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold text-white">{gap.title}</h3>
                  <span className={`sm-status-pill ${severityTone(gap.severity)}`}>{gap.severity}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gap.why}</p>
                <p className="mt-2 text-xs text-white/75">Done when: {gap.done_when}</p>
              </Link>
            ))}
            {evaluation?.top_gaps?.length ? null : <p className="sm-chip text-white">No critical live gaps reported by this evaluation.</p>}
          </div>
        </article>

        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Weak dimensions</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Where the system still needs evidence.</h2>
          <div className="mt-5 grid gap-3">
            {weakDimensions.map((dimension) => (
              <article className="sm-chip text-white" key={dimension.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{dimension.title}</p>
                  <span className="sm-status-pill">{dimension.score}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(dimension.evidence ?? []).map((item) => (
                    <span className="sm-status-pill" key={`${dimension.id}-${item}`}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">ERRC</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Eliminate, reduce, raise, create.</h2>
          <div className="mt-5 grid gap-3">
            {(evaluation?.errc ?? []).map((item) => (
              <article className="sm-chip text-white" key={`${item.quadrant}-${item.title}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{item.quadrant}</p>
                <p className="mt-1 font-semibold">{item.title}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next tests</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Prove the workflow, not the slide.</h2>
          <div className="mt-5 grid gap-3">
            {(evaluation?.next_tests ?? []).map((item) => (
              <p className="sm-chip text-sm text-white" key={item}>{item}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace scorecards</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Static design targets to compare against live state.</h2>
          <div className="mt-5 grid gap-3">
            {YTF_WORKSPACE_SCORECARDS.map((card) => (
              <article className="sm-proof-card" key={card.workspaceId}>
                <p className="font-semibold text-white">{card.label}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{card.verdict}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="sm-status-pill">desktop {card.desktopScore}</span>
                  <span className="sm-status-pill">mobile {card.mobileScore}</span>
                  <span className="sm-status-pill">data {card.dataScore}</span>
                  <span className="sm-status-pill">workflow {card.workflowScore}</span>
                </div>
              </article>
            ))}
          </div>
        </article>
        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Use-now stack</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Tools to employ next.</h2>
          <div className="mt-5 grid gap-3">
            {useNowStack.map((item) => (
              <a className="sm-proof-card block" href={item.href} key={item.id} rel="noreferrer" target="_blank">
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.category}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.fit}</p>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-5 md:p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Next build sequence</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {YTF_NEXT_BUILD_SEQUENCE.map((item) => (
            <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5" key={item.title}>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.why}</p>
              <p className="mt-3 text-xs text-white/75">{item.nextStep}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
