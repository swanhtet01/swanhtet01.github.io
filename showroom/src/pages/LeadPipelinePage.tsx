import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { createWorkspaceTasks } from '../lib/workspaceApi'

type PipelineLead = {
  lead_id?: string | null
  task_id?: string | null
  submitted_at?: string | null
  requested_package?: string | null
  lead_score?: number | null
  lead_stage?: string | null
  status?: string | null
  next_step?: string | null
}

type PipelineAction = {
  action_id?: string | null
  lead_id?: string | null
  task_id?: string | null
  action_type?: string | null
  status?: string | null
  priority?: string | null
  owner?: string | null
  title?: string | null
  next_step?: string | null
  approval_required?: boolean | null
  approval_state?: string | null
  notification_channel?: string | null
  notification_status?: string | null
  created_at?: string | null
}

type SalesRun = {
  run_id?: string | null
  status?: string | null
  generated_at?: string | null
  owner_email?: string | null
  next_best_action?: string | null
  lead_count?: number | null
  action_count?: number | null
  approval_count?: number | null
}

type SalesDailyStatus = {
  status?: string
  local_schedule?: string
  sales_autopilot?: {
    status?: string
    prepares?: string[]
    external_send?: string
    payment_or_connector_access?: string
  }
  sales_run_ledger?: {
    status?: string
    latest_run_id?: string | null
    latest_generated_at?: string | null
  }
  email_delivery?: string
}

type PipelineStatus = {
  status?: string
  runtime_status?: string
  generated_at?: string
  primary_database?: {
    status?: string
    provider?: string
    adapter?: string
    reason?: string
    detail?: string
  }
  metrics?: {
    leads_24h?: number
    leads_7d?: number
    open_action_count?: number
    recent_action_count?: number
    recent_lead_count?: number
    recent_sales_run_count?: number
  }
  approval_inbox?: {
    status?: string
    pending_count?: number | null
    next_action?: PipelineAction | null
  }
  notifications?: {
    status?: string
    channel?: string
    human_review_required?: boolean
  }
  durable_queue?: {
    status?: string
    public_daily_cron?: string
    app_daily_cron?: string
    protected_by_bearer_token?: boolean
  }
  fallback_queue?: {
    status?: string
    mode?: string
    email_delivery?: string
    webhook_delivery?: string
    owner?: string
  }
  recent_leads?: PipelineLead[]
  recent_actions?: PipelineAction[]
  recent_sales_runs?: SalesRun[]
}

type RecommendedOffer = {
  id: string
  name: string
  package: string
  route: string
  firstOutput: string
  priceBand: string
}

const publicStatusUrl = (() => {
  const configured = String(import.meta.env.VITE_SUPERMEGA_PUBLIC_STATUS_URL ?? '').trim()
  if (configured) {
    return configured
  }
  return 'https://supermega.dev/api/pipeline-control/status'
})()

const salesDailyStatusUrl = 'https://supermega.dev/api/cron/sales-daily/status'

function formatCount(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Just now'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function normalizeLabel(value?: string | null, fallback = 'Review') {
  const normalized = String(value || fallback)
    .replace(/[_-]+/g, ' ')
    .trim()
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function trimText(value?: string | null, limit = 130) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= limit) {
    return normalized
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}...`
}

function leadTitle(lead?: PipelineLead | null) {
  if (!lead) {
    return 'No new website lead'
  }
  return lead.requested_package || lead.lead_stage || lead.lead_id || 'Website lead'
}

function actionTitle(action?: PipelineAction | null) {
  return action?.title || action?.action_type || 'Follow up lead'
}

function makeTaskTitle(action?: PipelineAction | null, lead?: PipelineLead | null) {
  const source = actionTitle(action)
  const leadPart = lead?.lead_id || action?.lead_id || action?.task_id || lead?.task_id || 'website lead'
  return `${source}: ${leadPart}`
}

function recommendedOfferForLead(lead?: PipelineLead | null, action?: PipelineAction | null): RecommendedOffer {
  const context = `${lead?.requested_package ?? ''} ${lead?.lead_stage ?? ''} ${lead?.next_step ?? ''} ${action?.title ?? ''} ${action?.next_step ?? ''}`.toLowerCase()
  if (context.includes('document') || context.includes('file') || context.includes('clean') || context.includes('pdf') || context.includes('sheet')) {
    return {
      id: 'clean-records',
      name: 'Document Extraction Ledger',
      package: 'Document Extraction Ledger',
      route: '/offer-packet?tool=clean-records',
      firstOutput: 'Source register, clean table sample, exception queue, and approval checklist.',
      priceBand: '$49-$500 diagnostic, then managed workspace if useful.',
    }
  }
  if (context.includes('lead') || context.includes('market') || context.includes('sales') || context.includes('customer')) {
    return {
      id: 'lead-radar',
      name: 'Back Office Workflow Desk',
      package: 'Sales Follow-up Screen',
      route: '/offer-packet?tool=lead-radar',
      firstOutput: 'Qualified account shortlist, evidence links, outreach angles, and human-approved next step.',
      priceBand: '$49-$750 diagnostic, then managed prospecting room.',
    }
  }
  if (context.includes('report') || context.includes('brief') || context.includes('summary') || context.includes('owner')) {
    return {
      id: 'owner-brief',
      name: 'Back Office Workflow Desk',
      package: 'Owner Brief Screen',
      route: '/offer-packet?tool=owner-brief',
      firstOutput: 'Short decision brief with sources, risks, decisions, and owner actions.',
      priceBand: '$49-$500 diagnostic, then weekly reporting room.',
    }
  }
  return {
    id: 'work-desk',
    name: 'Back Office Workflow Desk',
    package: 'First Workflow Screen',
    route: '/offer-packet?tool=work-desk',
    firstOutput: 'One screen with request, owner, source, status, approval, and next action.',
    priceBand: '$49-$1,000 diagnostic, then custom portal sprint.',
  }
}

async function loadPipelineStatus() {
  const response = await fetch(publicStatusUrl, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Website intake status failed: ${response.status}`)
  }
  return (await response.json()) as PipelineStatus
}

async function loadSalesDailyStatus() {
  const response = await fetch(salesDailyStatusUrl, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Sales autopilot status failed: ${response.status}`)
  }
  return (await response.json()) as SalesDailyStatus
}

export function LeadPipelinePage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [salesDaily, setSalesDaily] = useState<SalesDailyStatus | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await loadPipelineStatus()
      setStatus(payload)
      const salesPayload = await loadSalesDailyStatus().catch(() => null)
      setSalesDaily(salesPayload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load website intake.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const leads = status?.recent_leads ?? []
  const actions = status?.recent_actions ?? []
  const salesRuns = status?.recent_sales_runs ?? []
  const nextLead = leads[0] ?? null
  const nextAction = status?.approval_inbox?.next_action ?? actions[0] ?? null
  const latestSalesRun = salesRuns[0] ?? null
  const runtimeReady = status?.runtime_status === 'ready'
  const recommendedOffer = useMemo(() => recommendedOfferForLead(nextLead, nextAction), [nextLead, nextAction])
  const leadTimeline = useMemo(
    () => [
      {
        label: 'Captured',
        detail: nextLead?.submitted_at ? `Lead entered the public ledger at ${formatDate(nextLead.submitted_at)}.` : 'Waiting for a public submission.',
      },
      {
        label: 'Recommended',
        detail: `${recommendedOffer.package}: ${recommendedOffer.firstOutput}`,
      },
      {
        label: 'Approval',
        detail: nextAction?.approval_state ? `Current state: ${normalizeLabel(nextAction.approval_state)}.` : 'Outreach approval queued before any external reply.',
      },
      {
        label: 'Handoff',
        detail: 'Create packet, reply with one diagnostic offer, then prepare workspace only after buyer confirms the source.',
      },
    ],
    [nextAction?.approval_state, nextLead?.submitted_at, recommendedOffer.firstOutput, recommendedOffer.package],
  )
  const metricCards = useMemo(
    () => [
      {
        label: 'Today',
        value: formatCount(status?.metrics?.leads_24h),
        detail: 'new website requests',
      },
      {
        label: 'This week',
        value: formatCount(status?.metrics?.leads_7d),
        detail: 'captured in the ledger',
      },
      {
        label: 'Open',
        value: formatCount(status?.metrics?.open_action_count),
        detail: 'follow-up actions',
      },
      {
        label: 'System',
        value: runtimeReady ? 'Live' : 'Check',
        detail: status?.primary_database?.status === 'ready' ? 'database ready' : status?.primary_database?.reason || 'needs review',
      },
      {
        label: 'Daily run',
        value: latestSalesRun ? normalizeLabel(latestSalesRun.status, 'Done') : 'Waiting',
        detail: latestSalesRun?.generated_at ? formatDate(latestSalesRun.generated_at) : 'next cloud cron',
      },
    ],
    [
      latestSalesRun,
      runtimeReady,
      status?.metrics?.leads_24h,
      status?.metrics?.leads_7d,
      status?.metrics?.open_action_count,
      status?.primary_database?.reason,
      status?.primary_database?.status,
    ],
  )

  async function handleCreateTask(action?: PipelineAction | null, lead?: PipelineLead | null) {
    const actionKey = action?.action_id || lead?.lead_id || 'website-intake'
    setBusy(actionKey)
    setMessage(null)
    try {
      await createWorkspaceTasks([
        {
          lead_id: lead?.lead_id || action?.lead_id || '',
          title: makeTaskTitle(action, lead),
          owner: action?.owner || 'Founder',
          priority: action?.priority || 'high',
          due: 'Today',
          status: 'open',
          template: 'website_intake_follow_up',
          notes: [
            action?.next_step || lead?.next_step || 'Review the website request and choose the first workflow to scope.',
            `Source status: ${status?.runtime_status || 'unknown'}.`,
            `Public ledger: ${publicStatusUrl}.`,
          ].join('\n'),
        },
      ])
      setMessage('Created one internal follow-up task.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not create the task.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateOfferPacket(action?: PipelineAction | null, lead?: PipelineLead | null) {
    const offer = recommendedOfferForLead(lead, action)
    const actionKey = `offer-${action?.action_id || lead?.lead_id || offer.id}`
    setBusy(actionKey)
    setMessage(null)
    try {
      await createWorkspaceTasks([
        {
          lead_id: lead?.lead_id || action?.lead_id || '',
          title: `Create packet: ${offer.name}`,
          owner: action?.owner || 'Founder',
          priority: action?.priority || 'high',
          due: 'Today',
          status: 'open',
          template: 'offer-packet',
          notes: [
            `Offer packet route: ${offer.route}.`,
            `Package: ${offer.package}.`,
            `First output: ${offer.firstOutput}.`,
            `Price band: ${offer.priceBand}.`,
            'Outreach approval queued. Do not send the reply until founder approves wording, source request, and price gate.',
          ].join('\n'),
        },
      ])
      setMessage('Outreach approval queued. Offer packet task created.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not create the offer packet task.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCopyBrief(action?: PipelineAction | null, lead?: PipelineLead | null) {
    const brief = [
      'Website intake review',
      `Lead: ${lead?.lead_id || action?.lead_id || 'latest website lead'}`,
      `Request: ${leadTitle(lead)}`,
      `Action: ${actionTitle(action)}`,
      `Next: ${action?.next_step || lead?.next_step || 'Reply, scope one workflow, and decide if a workspace should be created.'}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(brief)
      setMessage('Copied the review brief.')
    } catch {
      setMessage(brief)
    }
  }

  if (loading && !status) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading website inbox...</section>
  }

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        compact
        eyebrow="Website inbox"
        title="Turn every contact form into one next step."
        description="This is the internal desk for SuperMega leads. The public website captures the request; this screen shows the queue, the next action, and the handoff into a client workspace."
      />

      {error ? (
        <section className="sm-surface border border-rose-400/30 bg-rose-950/20 p-5">
          <p className="text-sm font-semibold text-white">{error}</p>
          <button className="sm-button-primary mt-4" onClick={() => void refresh()} type="button">
            Retry
          </button>
        </section>
      ) : null}

      {message ? <section className="sm-chip text-white">{message}</section> : null}

      <section className="grid gap-4 md:grid-cols-5">
        {metricCards.map((metric) => (
          <article className="sm-chip text-white" key={metric.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
            <p className="mt-2 text-3xl font-black">{metric.value}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Cloud control</p>
            <h2 className="mt-2 text-3xl font-black text-white">No PC needed.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
              Leads, tasks, email alerts, and the daily sales queue now run from the deployed site and the cloud database. Agents prepare the queue; you approve replies, access, pricing, and production changes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Database', `${status?.primary_database?.provider || 'Vercel / Neon'} · ${status?.primary_database?.status || 'unknown'}`],
              ['Cron', status?.durable_queue?.public_daily_cron || '/api/cron/sales-daily'],
              ['Autopilot', `${salesDaily?.sales_autopilot?.status || 'unknown'} - ${(salesDaily?.sales_autopilot?.prepares || []).join(', ') || 'source, packet, reply'}`],
              ['Protection', status?.durable_queue?.protected_by_bearer_token ? 'Bearer token required' : 'Check auth'],
              ['Fallback', `${status?.fallback_queue?.mode || 'email'} · ${status?.fallback_queue?.email_delivery || 'unknown'}`],
            ].map(([label, value]) => (
              <article className="sm-proof-card" key={label}>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">{label}</p>
                <p className="mt-2 text-sm font-semibold text-white">{value}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="sm-button-secondary" href={publicStatusUrl} target="_blank" rel="noreferrer">
            Open pipeline status
          </a>
          <a className="sm-button-secondary" href="https://supermega.dev/api/commercial-control/status" target="_blank" rel="noreferrer">
            Open machine status
          </a>
          <a className="sm-button-secondary" href={salesDailyStatusUrl} target="_blank" rel="noreferrer">
            Open autopilot status
          </a>
          <a className="sm-button-secondary" href="https://vercel.com/swanhtet01s-projects/supermega-public" target="_blank" rel="noreferrer">
            Open Vercel project
          </a>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Next lead</p>
              <h2 className="mt-2 text-4xl font-black text-white">{leadTitle(nextLead)}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
                {nextLead?.next_step || 'No open website lead is waiting right now. Keep the public form live and review new submissions here.'}
              </p>
            </div>
            <span className="sm-status-pill">{normalizeLabel(nextLead?.lead_stage || nextLead?.status, runtimeReady ? 'Live' : 'Check')}</span>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Submitted</p>
              <p className="mt-2 text-sm">{formatDate(nextLead?.submitted_at)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Score</p>
              <p className="mt-2 text-sm">{formatCount(nextLead?.lead_score)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Ledger</p>
              <p className="mt-2 text-sm">{nextLead?.lead_id || 'Waiting'}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" onClick={() => void handleCreateTask(nextAction, nextLead)} type="button" disabled={Boolean(busy)}>
              {busy ? 'Creating...' : 'Create follow-up task'}
            </button>
            <button className="sm-button-secondary" onClick={() => void handleCreateOfferPacket(nextAction, nextLead)} type="button" disabled={Boolean(busy)}>
              {busy?.startsWith('offer-') ? 'Creating packet...' : 'Create packet'}
            </button>
            <button className="sm-button-secondary" onClick={() => void handleCopyBrief(nextAction, nextLead)} type="button">
              Copy brief
            </button>
            <a className="sm-button-secondary" href="mailto:swanhtet@supermega.dev?subject=Website intake follow-up">
              Open mailbox
            </a>
            <Link className="sm-button-secondary" to="/app/client-build">
              Prepare workspace
            </Link>
            <button className="sm-button-secondary" onClick={() => void refresh()} type="button">
              Refresh
            </button>
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Recommended offer</p>
            <h3 className="mt-2 text-2xl font-black text-white">{recommendedOffer.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{recommendedOffer.firstOutput}</p>
            <p className="mt-3 text-sm font-semibold text-white">{recommendedOffer.priceBand}</p>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating rule</p>
          <h2 className="mt-2 text-3xl font-black text-white">Reply first. Build second.</h2>
          <div className="mt-6 grid gap-3">
            {[
              ['1', 'Reply', 'Confirm the problem, owner, and first workflow.'],
              ['2', 'Scope', 'Choose one useful module and the data source it needs.'],
              ['3', 'Launch', 'Create the workspace, invite users, and keep approvals human-gated.'],
            ].map(([step, title, detail]) => (
              <div className="sm-proof-card flex gap-4" key={step}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--sm-accent)] text-sm font-black text-[#04111d]">{step}</span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Lead timeline</p>
            <h2 className="mt-2 text-3xl font-black text-white">Move from capture to approved outreach.</h2>
          </div>
          <span className="sm-status-pill">/offer-packet</span>
        </div>
        <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Cloud autopilot</p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The daily cloud run turns captured leads into source requests, offer packets, and reply drafts. External messages, payments, connector access, and production changes stay blocked until owner approval.
          </p>
          <p className="mt-3 text-sm font-semibold text-white">
            {salesDaily?.local_schedule || '09:00 Asia/Rangoon daily'} / {salesDaily?.sales_autopilot?.external_send || 'blocked_until_owner_approval'}
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {leadTimeline.map((item, index) => (
            <article className="sm-proof-card" key={item.label}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--sm-accent)] text-sm font-black text-[#04111d]">{index + 1}</span>
              <h3 className="mt-4 text-lg font-semibold text-white">{item.label}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open actions</p>
          <h2 className="mt-2 text-3xl font-black text-white">Nothing should sit in email.</h2>
          <div className="mt-6 grid gap-3">
            {actions.slice(0, 5).map((action) => (
              <article className="sm-proof-card" key={action.action_id || action.task_id || action.lead_id || action.title}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{actionTitle(action)}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{trimText(action.next_step, 150)}</p>
                  </div>
                  <span className="sm-status-pill">{normalizeLabel(action.priority, 'Priority')}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">
                    {action.owner || 'Founder'} / {normalizeLabel(action.approval_state, 'Pending')} / {formatDate(action.created_at)}
                  </p>
                  <button
                    className="sm-button-secondary"
                    disabled={busy === action.action_id}
                    onClick={() => void handleCreateTask(action, leads.find((lead) => lead.lead_id === action.lead_id))}
                    type="button"
                  >
                    {busy === action.action_id ? 'Saving...' : 'Task'}
                  </button>
                </div>
              </article>
            ))}
            {!actions.length ? <div className="sm-chip text-white">No open pipeline actions yet.</div> : null}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Recent leads</p>
          <h2 className="mt-2 text-3xl font-black text-white">Captured from the public site.</h2>
          <div className="mt-6 grid gap-3">
            {leads.slice(0, 5).map((lead) => (
              <article className="sm-proof-card" key={lead.lead_id || lead.task_id || lead.submitted_at}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{leadTitle(lead)}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{trimText(lead.next_step, 150)}</p>
                  </div>
                  <span className="sm-status-pill">{normalizeLabel(lead.lead_stage || lead.status, 'New')}</span>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">
                  {lead.lead_id || lead.task_id || 'lead'} / {formatDate(lead.submitted_at)}
                </p>
              </article>
            ))}
            {!leads.length ? <div className="sm-chip text-white">Waiting for the next public submission.</div> : null}
          </div>
        </article>
      </section>

      <section className="sm-surface p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Database</p>
            <p className="mt-2 text-sm font-semibold text-[var(--sm-ink)]">
              {status?.primary_database?.provider || 'Neon Postgres'} / {status?.primary_database?.status || 'unknown'}
            </p>
          </div>
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Email</p>
            <p className="mt-2 text-sm font-semibold text-[var(--sm-ink)]">
              {status?.notifications?.channel || 'email'} / {status?.notifications?.status || 'unknown'}
            </p>
          </div>
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Automation</p>
            <p className="mt-2 text-sm font-semibold text-[var(--sm-ink)]">
              {status?.durable_queue?.status || 'unknown'} / human approval required
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
