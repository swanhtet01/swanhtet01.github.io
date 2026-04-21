import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  checkWorkspaceHealth,
  createWorkspaceTasks,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  listAgentRuns,
  listWorkspaceLeadPipeline,
  listWorkspaceTasks,
  runDefaultAgentJobs,
  sessionHasCapability,
  workspaceFetch,
  type AgentRunRow,
  type WorkspaceLeadRow,
  type WorkspaceTaskRow,
} from '../lib/workspaceApi'

type LeadPipelineSummary = {
  lead_count?: number
  by_stage?: Record<string, number>
  by_status?: Record<string, number>
  by_pack?: Record<string, number>
}

const trackedSalesJobs = ['revenue_scout', 'task_triage', 'founder_brief'] as const

function formatCount(value: number | undefined) {
  return String(value ?? 0)
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Never'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function formatStage(stage: string) {
  return String(stage || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPack(value: string) {
  return value || 'Sales setup'
}

function stagePriority(stage: string) {
  const normalized = String(stage || '').trim().toLowerCase()
  if (normalized === 'offer_ready') return 0
  if (normalized === 'contacted') return 1
  if (normalized === 'discovery') return 2
  if (normalized === 'proposal') return 3
  if (normalized === 'won') return 4
  if (normalized === 'lost') return 5
  return 6
}

function trimText(value: string, limit: number) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= limit) {
    return normalized
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}

function isInboundLead(lead: WorkspaceLeadRow) {
  const source = String(lead.source || '').trim().toLowerCase()
  const provider = String(lead.provider || '').trim().toLowerCase()
  const archetype = String(lead.archetype || '').trim().toLowerCase()
  return source === 'website_request' || provider === 'website' || archetype === 'inbound_request'
}

function parseLeadNotes(notes: string) {
  return new Map(
    String(notes || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split(':')
        return [label.trim().toLowerCase(), rest.join(':').trim()] as const
      }),
  )
}

function latestRunsByType(rows: AgentRunRow[]) {
  const grouped = new Map<string, AgentRunRow>()
  for (const row of rows) {
    const key = String(row.job_type || '').trim()
    if (!key || grouped.has(key)) {
      continue
    }
    grouped.set(key, row)
  }
  return grouped
}

export function SalesDeskPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [leads, setLeads] = useState<WorkspaceLeadRow[]>([])
  const [summary, setSummary] = useState<LeadPipelineSummary | null>(null)
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])

  async function loadData() {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const session = await getWorkspaceSession()
    if (!session.authenticated) {
      throw new Error('Login is required to open the revenue desk.')
    }
    if (!sessionHasCapability(session.session, 'sales.view')) {
      const profile = getCapabilityProfileForRole(session.session?.role)
      throw new Error(`Sales access is required to open this desk. Current role: ${profile.label}.`)
    }

    const [leadPayload, taskPayload, agentPayload] = await Promise.all([
      listWorkspaceLeadPipeline('', 'open', 120),
      listWorkspaceTasks('open', 40),
      listAgentRuns(20),
    ])

    const nextLeads = [...(leadPayload.rows ?? [])].sort((left, right) => {
      const stageDelta = stagePriority(left.stage) - stagePriority(right.stage)
      if (stageDelta !== 0) {
        return stageDelta
      }
      return Number(right.score ?? 0) - Number(left.score ?? 0)
    })

    setLeads(nextLeads)
    setSummary((leadPayload.summary as LeadPipelineSummary | undefined) ?? null)
    setTasks((taskPayload.rows ?? []).filter((row) => String(row.status || '').trim().toLowerCase() !== 'done'))
    setAgentRuns(agentPayload.rows ?? [])
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        await loadData()
        if (!cancelled) {
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load the revenue desk.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const offerReadyCount = Number(summary?.by_stage?.offer_ready ?? 0)
  const discoveryCount = Number(summary?.by_stage?.discovery ?? 0)
  const inboundLeads = leads.filter((lead) => isInboundLead(lead)).slice(0, 4)
  const inboundCount = inboundLeads.length
  const activeDeals = leads.filter((lead) => !isInboundLead(lead)).slice(0, 5)
  const recentTasks = tasks.slice(0, 6)
  const byPackEntries = Object.entries(summary?.by_pack ?? {}).slice(0, 4)
  const latestRunMap = latestRunsByType(agentRuns)
  const trackedRuns = trackedSalesJobs.map((jobType) => latestRunMap.get(jobType)).filter(Boolean) as AgentRunRow[]

  async function handleRunSalesRefresh() {
    setBusy('agent_refresh')
    setMessage(null)
    try {
      const payload = await runDefaultAgentJobs([...trackedSalesJobs])
      setMessage(`Ran ${payload.count ?? 0} sales automation job${payload.count === 1 ? '' : 's'}.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the sales automation refresh.')
    } finally {
      setBusy(null)
    }
  }

  async function handleOpenOutreach(leadId: string) {
    setBusy(`outreach:${leadId}`)
    setMessage(null)
    try {
      const payload = await workspaceFetch<{
        draft?: {
          compose_url?: string
          message?: string
        }
      }>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/outreach/gmail`, {
        method: 'POST',
        body: JSON.stringify({ create_gmail_draft: false }),
      })
      const composeUrl = String(payload.draft?.compose_url ?? '').trim()
      if (composeUrl) {
        window.open(composeUrl, '_blank', 'noopener,noreferrer')
      }
      setMessage(String(payload.draft?.message ?? 'Opened Gmail compose for this lead.').trim())
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not open Gmail outreach.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateFollowUp(lead: WorkspaceLeadRow) {
    setBusy(`task:${lead.lead_id}`)
    setMessage(null)
    try {
      await createWorkspaceTasks([
        {
          lead_id: lead.lead_id,
          title: `Follow up ${lead.company_name}`,
          owner: 'Revenue Desk',
          priority: 'high',
          due: 'Today',
          notes: 'Use the outreach draft, make contact, and update the stage in the sales pipeline.',
          template: 'sales_desk_follow_up',
        },
      ])
      setMessage(`Created a follow-up task for ${lead.company_name}.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not create the follow-up task.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading revenue desk...</section>
  }

  if (error) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">{error}</section>
  }

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow="Revenue Desk"
        title="Work inbound requests, live deals, and follow-up from one desk."
        description="This is the commercial home for new website requests, active accounts, and the next action that moves revenue."
      />

      {message ? <section className="sm-chip text-white">{message}</section> : null}

      <section className="flex flex-wrap items-center gap-3">
        <Link className="sm-button-primary" to="/app/revenue/pipeline">
          Open full pipeline
        </Link>
        <Link className="sm-button-secondary" to="/app/revenue/prospecting">
          Open prospecting
        </Link>
        <button
          className="sm-button-secondary"
          disabled={busy === 'agent_refresh'}
          onClick={() => void handleRunSalesRefresh()}
          type="button"
        >
          {busy === 'agent_refresh' ? 'Refreshing...' : 'Run refresh'}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <article className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Open deals</p>
          <p className="mt-2 text-3xl font-bold">{formatCount(summary?.lead_count)}</p>
        </article>
        <article className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Inbound requests</p>
          <p className="mt-2 text-3xl font-bold">{inboundCount}</p>
        </article>
        <article className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Offer ready</p>
          <p className="mt-2 text-3xl font-bold">{offerReadyCount}</p>
        </article>
        <article className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Discovery</p>
          <p className="mt-2 text-3xl font-bold">{discoveryCount}</p>
        </article>
        <article className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open tasks</p>
          <p className="mt-2 text-3xl font-bold">{recentTasks.length}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Inbound requests</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Reply to new requests before they go cold.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue/pipeline">
              Open pipeline
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {inboundLeads.map((lead) => {
              const noteMap = parseLeadNotes(lead.notes)
              const firstTeam = noteMap.get('first team')
              const goal = noteMap.get('goal')
              return (
              <article className="sm-proof-card" key={lead.lead_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-white">{lead.company_name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lead.contact_email || lead.contact_phone || 'Website request'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="sm-status-pill">{lead.wedge_product || lead.service_pack || 'Working product'}</span>
                    <span className="sm-status-pill">{formatStage(lead.stage)}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">First team</p>
                    <p className="mt-2 text-sm">{firstTeam || 'Not set yet'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Goal</p>
                    <p className="mt-2 text-sm">{trimText(goal || lead.campaign_goal || 'Review the request and confirm the first rollout.', 120)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
                  {trimText(lead.notes || lead.outreach_message || 'Review the request and send the first response.', 180)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="sm-button-primary"
                    disabled={busy === `outreach:${lead.lead_id}`}
                    onClick={() => void handleOpenOutreach(lead.lead_id)}
                    type="button"
                  >
                    {busy === `outreach:${lead.lead_id}` ? 'Opening...' : 'Draft outreach'}
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={busy === `task:${lead.lead_id}`}
                    onClick={() => void handleCreateFollowUp(lead)}
                    type="button"
                  >
                    {busy === `task:${lead.lead_id}` ? 'Saving...' : 'Create task'}
                  </button>
                </div>
              </article>
            )})}
            {!inboundLeads.length ? <div className="sm-chip text-white">No new website requests right now.</div> : null}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Active deals</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Keep the next committed accounts moving.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue/pipeline">
              Open pipeline
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {activeDeals.map((lead) => (
              <article className="sm-proof-card" key={lead.lead_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-white">{lead.company_name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{formatPack(lead.service_pack)} · {formatStage(lead.stage)}</p>
                  </div>
                  <span className="sm-status-pill">Score {lead.score}</span>
                </div>
                <p className="mt-3 text-sm text-white/80">{lead.contact_email || lead.contact_phone || lead.website || 'Public source only'}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  {trimText(lead.notes || lead.outreach_message || 'Use the existing outreach draft and update the stage after contact.', 180)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="sm-button-primary"
                    disabled={busy === `outreach:${lead.lead_id}`}
                    onClick={() => void handleOpenOutreach(lead.lead_id)}
                    type="button"
                  >
                    {busy === `outreach:${lead.lead_id}` ? 'Opening...' : 'Draft outreach'}
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={busy === `task:${lead.lead_id}`}
                    onClick={() => void handleCreateFollowUp(lead)}
                    type="button"
                  >
                    {busy === `task:${lead.lead_id}` ? 'Saving...' : 'Create task'}
                  </button>
                </div>
              </article>
            ))}
            {!activeDeals.length ? <div className="sm-chip text-white">No active deals yet. Use prospecting or the public contact form to seed the desk.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Follow-up queue</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Open tasks for the sales role.</h2>
            </div>
            <Link className="sm-link" to="/app/actions">
              Open action board
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {recentTasks.map((task) => (
              <article className="sm-proof-card" key={task.task_id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{task.title}</p>
                  <span className="sm-status-pill">{task.priority || 'normal'}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{trimText(task.notes, 160) || 'No task notes yet.'}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Owner {task.owner || 'Unassigned'} · Due {task.due || 'No due date'}</p>
              </article>
            ))}
            {!recentTasks.length ? <div className="sm-chip text-white">No open sales tasks yet.</div> : null}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Pipeline shape</p>
          <h2 className="mt-2 text-3xl font-bold text-white">See stage mix, product mix, and automation health.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {Object.entries(summary?.by_stage ?? {}).map(([stage, count]) => (
              <article className="sm-chip text-white" key={stage}>
                <p className="font-semibold">{formatStage(stage)}</p>
                <p className="mt-2 text-2xl font-bold">{count}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {byPackEntries.map(([pack, count]) => (
              <article className="sm-proof-card" key={pack}>
                <p className="font-semibold text-white">{pack}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Open deals in this product lane</p>
                <p className="mt-3 text-2xl font-bold text-white">{count}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {trackedRuns.map((run) => (
              <article className="sm-chip text-white" key={run.run_id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{formatStage(run.job_type)}</p>
                  <span className="sm-status-pill">{run.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{trimText(run.summary, 140) || 'No summary returned yet.'}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Updated {formatDateTime(run.completed_at || run.started_at || run.created_at)}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
