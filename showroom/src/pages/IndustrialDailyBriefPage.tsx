import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { buildIndustrialDailyBrief, INDUSTRIAL_DAILY_BRIEF_AGENT_ACTIONS } from '../lib/industrialDailyBrief'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { getWorkspaceSession, runAgentJob } from '../lib/workspaceApi'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

function formatDate(value: string | null) {
  if (!value) return 'not synced yet'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function scoreTone(score: number) {
  if (score >= 86) return 'text-emerald-300'
  if (score >= 70) return 'text-amber-300'
  return 'text-rose-300'
}

export function IndustrialDailyBriefPage() {
  const tenant = getTenantConfig()
  const [session, setSession] = useState<SessionState | null>(null)
  const [dataset, setDataset] = useState<DataFabricDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentBusy, setAgentBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [sessionPayload, fabricPayload] = await Promise.all([getWorkspaceSession(), loadDataFabricDataset()])
        if (!cancelled) {
          setSession(sessionPayload.session ?? null)
          setDataset(fabricPayload)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Daily brief could not load live data.')
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

  const brief = useMemo(() => buildIndustrialDailyBrief(dataset), [dataset])

  async function runBriefAgent() {
    setAgentBusy(true)
    setMessage('')
    try {
      const payload = await runAgentJob({
        job_type: 'founder_brief',
        source: 'industrial_daily_brief',
        payload: {
          module: 'Industrial Daily Brief',
          score: brief.score,
          review_order: brief.reviewOrder,
          lane_ids: brief.lanes.map((lane) => lane.id),
        },
        idempotency_key: `industrial-daily-brief-${new Date().toISOString().slice(0, 13)}`,
      })
      setMessage(payload.row?.summary || 'Brief agent prepared a reviewable executive packet.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Brief agent could not run from this account.')
    } finally {
      setAgentBusy(false)
    }
  }

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening daily brief...</section>
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="sm-surface-deep overflow-hidden p-5 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{getTenantBrandLabel(tenant)} / Industrial Daily Brief</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.05em] text-white lg:text-6xl">
              One page for the plant decision.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--sm-muted)]">
              The brief compresses production, quality, maintenance, supplier recovery, source trust, and approvals into one reviewed packet.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={agentBusy} onClick={() => void runBriefAgent()} type="button">
                {agentBusy ? 'Preparing...' : 'Prepare AI brief'}
              </button>
              <Link className="sm-button-secondary" to="/app/plant-manager">
                Plant manager
              </Link>
              <Link className="sm-button-secondary" to="/app/data-fabric">
                Source truth
              </Link>
            </div>
            {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/78">{message}</p> : null}
          </div>

          <aside className="sm-calm-surface p-5">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Today</p>
            <strong className={`mt-3 block text-6xl font-black tracking-[-0.08em] ${scoreTone(brief.score)}`}>{brief.score}</strong>
            <p className="mt-2 text-xl font-bold text-white">{brief.headline}</p>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">Updated: {formatDate(brief.updatedAt)}</p>
            <div className="mt-5 grid gap-2">
              {brief.reviewOrder.map((item, index) => (
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm" key={item}>
                  <span className="text-white/80">{item}</span>
                  <span className="font-bold text-[var(--sm-accent)]">{index + 1}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {brief.sourcePosture.map((item) => (
          <article className="sm-proof-card" key={item.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
            <strong className="mt-2 block text-3xl font-black text-white">{item.value}</strong>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sm-surface p-5 lg:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Decision lanes</p>
              <h2 className="mt-2 text-3xl font-black text-white">Five checks before the next shift.</h2>
            </div>
            <span className="sm-status-pill">{session?.workspace_name ?? 'workspace'}</span>
          </div>
          <div className="mt-5 grid gap-3">
            {brief.lanes.map((lane) => (
              <article className="sm-manager-row" key={lane.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sm-status-pill">{lane.label}</span>
                    <p className="font-semibold text-white">{lane.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.signal}</p>
                  <p className="mt-2 text-sm text-white/80">{lane.decision}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/45">
                    {lane.kpi} / {lane.method}
                  </p>
                </div>
                <Link className="sm-link shrink-0" to={lane.route}>
                  Open desk
                </Link>
              </article>
            ))}
          </div>
        </div>

        <aside className="grid gap-4">
          <article className="sm-surface p-5">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent actions</p>
            <h2 className="mt-2 text-2xl font-black text-white">AI prepares. Humans decide.</h2>
            <div className="mt-4 grid gap-2">
              {INDUSTRIAL_DAILY_BRIEF_AGENT_ACTIONS.map((action) => (
                <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--sm-muted)]" key={action}>
                  {action}
                </p>
              ))}
            </div>
          </article>

          <article className="sm-surface p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Next actions</p>
            <div className="mt-4 grid gap-2">
              {brief.nextActions.map((action) => (
                <Link className="rounded-2xl border border-white/10 bg-white/5 p-3 hover:border-[var(--sm-accent)]" key={action.title} to={action.route}>
                  <strong className="text-sm text-white">{action.title}</strong>
                  <p className="mt-1 text-xs text-[var(--sm-muted)]">{action.owner}</p>
                  <p className="mt-2 text-xs text-white/60">{action.reason}</p>
                </Link>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </div>
  )
}
