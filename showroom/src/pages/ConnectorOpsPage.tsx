import { startTransition, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { SUPERMEGA_AUTONOMOUS_CLOUD_MODEL } from '../lib/autonomousCloudOperatingModel'
import { loadRuntimeControlDataset, getSeedRuntimeControlDataset } from '../lib/runtimeControlApi'
import { SUPERMEGA_CORE_MODEL, YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from '../lib/yangonTyreDriveModel'
import type { RuntimeConnectorEvent, RuntimeConnectorFeed } from '../lib/runtimeControlModel'
import { createWorkspaceTasks, getWorkspaceSession, runDefaultAgentJobs } from '../lib/workspaceApi'

const runtimeSections = [
  {
    title: 'Core platform feeds',
    tenant: 'core' as const,
    description: 'Shared feeds that keep SuperMega attached to inboxes, drive folders, GitHub delivery state, and structured operator input.',
  },
  {
    title: 'Yangon Tyre feeds',
    tenant: 'yangon-tyre' as const,
    description: 'Tenant-specific feeds that keep plant, procurement, quality, and director surfaces on the same operating data.',
  },
] as const

const statusTone: Record<RuntimeConnectorFeed['status'], string> = {
  Healthy: 'text-[#8be8ff]',
  Warning: 'text-[#ffb347]',
  Degraded: 'text-[#ff6b6b]',
  'Needs wiring': 'text-[#ff7a18]',
}

const severityTone: Record<string, string> = {
  info: 'text-sky-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
  critical: 'text-rose-300',
}

const FEED_ROUTE_MAP: Record<string, string> = {
  'ytf-sales-gmail': '/app/revenue',
  'ytf-procurement-gmail': '/app/approvals',
  'ytf-drive-quality': '/app/dqms',
  'ytf-erp-export': '/app/operations',
  'ytf-markdown-vault': '/app/director',
  'ytf-shopfloor-entry': '/app/adoption-command',
  'core-github-build': '/app/product-ops',
  'core-human-entry': '/app/platform-admin',
}

const CONNECTOR_REVIEW_OWNER_MAP: Record<string, string> = {
  'ytf-sales-gmail': 'Sales lead',
  'ytf-procurement-gmail': 'Procurement lead',
  'ytf-drive-quality': 'Quality Team',
  'ytf-erp-export': 'Operations manager',
  'ytf-markdown-vault': 'CEO / director',
  'ytf-shopfloor-entry': 'Plant manager',
  'core-github-build': 'Implementation Lead',
  'core-human-entry': 'Tenant admin',
}

function rolloutTone(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'live') {
    return 'text-emerald-300'
  }
  if (normalized === 'mapped' || normalized === 'queued') {
    return 'text-amber-300'
  }
  return 'text-white/70'
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Seeded runtime model'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function dueDateFromNow(days: number) {
  const next = new Date()
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function feedRoute(feedId: string) {
  return FEED_ROUTE_MAP[feedId] ?? '/app/connectors'
}

function feedReviewOwner(feedId: string, fallbackOwner: string) {
  return CONNECTOR_REVIEW_OWNER_MAP[feedId] ?? fallbackOwner
}

function feedCard(feed: RuntimeConnectorFeed, latestEvent?: RuntimeConnectorEvent | null) {
  const route = feedRoute(feed.id)
  return (
    <article className="sm-demo-link sm-demo-link-card" key={feed.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="sm-home-proof-label">{feed.system}</span>
        <span className={`sm-status-pill ${statusTone[feed.status]}`}>{feed.status}</span>
      </div>
      <strong>{feed.name}</strong>
      <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner: {feed.owner}</p>
      <p className="mt-2 text-sm text-white/80">Workspace: {feed.workspace}</p>
      <p className="mt-2 text-sm text-white/80">Install state: {feed.installState}</p>
      <p className="mt-2 text-sm text-white/80">Freshness: {feed.freshness}</p>
      <p className="mt-2 text-sm text-white/80">Backlog: {feed.backlog}</p>
      <p className="mt-2 text-sm text-white/80">Writeback: {feed.writeBack}</p>
      <p className="mt-2 text-sm text-white/80">Next automation: {feed.nextAutomation}</p>
      <div className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
        <p>Credential mode: {feed.credentialMode}</p>
        <p>Cursor mode: {feed.cursorMode}</p>
        <p>Last success: {feed.lastSuccessAt}</p>
        <p>Replay: {feed.replayMode}</p>
        <p>Blast radius: {feed.blastRadius}</p>
        <p>Inputs: {feed.inputs.join(', ')}</p>
        <p>Outputs: {feed.outputs.join(', ')}</p>
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-white/60">Risks</div>
      <div className="mt-2 space-y-2 text-sm text-[var(--sm-muted)]">
        {feed.risks.map((risk) => (
          <p key={`${feed.id}-${risk}`}>{risk}</p>
        ))}
      </div>
      {latestEvent ? (
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-4">
          <p className="sm-kicker text-[var(--sm-accent)]">Latest event</p>
          <p className="mt-2 text-sm text-white/80">{latestEvent.title}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{latestEvent.detail}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/60">
            {latestEvent.actor} • {formatUpdatedAt(latestEvent.createdAt)}
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Link className="sm-link" to={route}>
          Open lane
        </Link>
      </div>
    </article>
  )
}

export function ConnectorOpsPage() {
  const autonomyModel = SUPERMEGA_AUTONOMOUS_CLOUD_MODEL
  const [runtimeData, setRuntimeData] = useState(() => getSeedRuntimeControlDataset())
  const [loading, setLoading] = useState(true)
  const [taskBusy, setTaskBusy] = useState(false)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextData = await loadRuntimeControlDataset()
      if (cancelled) {
        return
      }
      startTransition(() => {
        setRuntimeData(nextData)
        setLoading(false)
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const ytfRuntimeFeeds = useMemo(() => runtimeData.connectors.filter((feed) => feed.tenant === 'yangon-tyre'), [runtimeData.connectors])
  const attentionFeeds = useMemo(() => ytfRuntimeFeeds.filter((feed) => feed.status !== 'Healthy'), [ytfRuntimeFeeds])
  const connectorEvents = useMemo(() => runtimeData.connectorEvents.slice(0, 10), [runtimeData.connectorEvents])
  const latestEventByConnector = useMemo(() => {
    const nextMap = new Map<string, RuntimeConnectorEvent>()
    for (const event of runtimeData.connectorEvents) {
      if (!nextMap.has(event.connectorId)) {
        nextMap.set(event.connectorId, event)
      }
    }
    return nextMap
  }, [runtimeData.connectorEvents])
  const liveSourceCount = YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'live').length
  const mappedSourceCount = YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'mapped').length
  const queuedConnectorCount = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'queued').length
  const mappedConnectorCount = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'mapped').length
  const healthyYtfFeedCount = ytfRuntimeFeeds.filter((feed) => feed.status === 'Healthy').length

  async function handleCreateConnectorReviewTasks() {
    setTaskBusy(true)
    setMessage(null)
    try {
      const session = await getWorkspaceSession()
      if (!session.authenticated) {
        throw new Error('Login is required before connector review tasks can be created.')
      }

      const rows = attentionFeeds.map((feed) => ({
        title: `Review ${feed.name}`,
        owner: feedReviewOwner(feed.id, feed.owner),
        priority: feed.status === 'Degraded' || feed.status === 'Needs wiring' ? 'high' : 'medium',
        due: dueDateFromNow(feed.status === 'Degraded' || feed.status === 'Needs wiring' ? 1 : 2),
        status: 'open',
        notes: `Workspace: ${feed.workspace}\nFreshness: ${feed.freshness}\nBacklog: ${feed.backlog}\nNext automation: ${feed.nextAutomation}\nRisks: ${feed.risks.join(' / ')}`,
        template: `connector_review:${feed.id}`,
      }))

      if (!rows.length) {
        setMessage('No Yangon Tyre connector feeds need review tasks right now.')
        return
      }

      const payload = await createWorkspaceTasks(rows)
      const nextData = await loadRuntimeControlDataset()
      startTransition(() => {
        setRuntimeData(nextData)
      })
      setMessage(`Created ${payload.saved_count ?? rows.length} connector review task${(payload.saved_count ?? rows.length) === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not create connector review tasks right now.')
    } finally {
      setTaskBusy(false)
    }
  }

  async function handleRefreshConnectorLoops() {
    setRefreshBusy(true)
    setMessage(null)
    try {
      await runDefaultAgentJobs(['revenue_scout', 'ops_watch', 'task_triage', 'founder_brief', 'github_release_watch'])
      const nextData = await loadRuntimeControlDataset()
      startTransition(() => {
        setRuntimeData(nextData)
      })
      setMessage('Refreshed connector-facing agent loops and reloaded Connector Control.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not refresh the connector loops right now.')
    } finally {
      setRefreshBusy(false)
    }
  }

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Connectors"
        title="Operate the runtime feeds that keep SuperMega attached to real company data."
        description="This surface shows connector freshness, backlog, risk, and next automation work across the core platform and Yangon Tyre."
      />

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{loading ? 'Refreshing runtime view.' : runtimeData.source === 'live' ? 'Live runtime feed connected.' : 'Using seeded runtime model.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Source timestamp: {formatUpdatedAt(runtimeData.updatedAt)}. Connector Control now includes a live event ledger, review-task loop, and the Yangon Tyre writeback feed
              inside the same runtime contract.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={taskBusy} onClick={() => void handleCreateConnectorReviewTasks()} type="button">
              {taskBusy ? 'Creating review tasks...' : 'Create review tasks'}
            </button>
            <button className="sm-button-secondary" disabled={refreshBusy} onClick={() => void handleRefreshConnectorLoops()} type="button">
              {refreshBusy ? 'Refreshing loops...' : 'Refresh connector loops'}
            </button>
            <Link className="sm-button-primary" to="/app/runtime">
              Runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Data Fabric
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/app/security">
              Security
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <section className="sm-chip text-white">
          <p className="font-semibold">{message}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Healthy YTF feeds</p>
          <p className="mt-3 text-3xl font-bold text-white">{healthyYtfFeedCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Yangon Tyre connector lanes currently behaving like live runtime feeds.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Need review</p>
          <p className="mt-3 text-3xl font-bold text-white">{attentionFeeds.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Feeds that are warning, degraded, or still need wiring before the runtime can trust them.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Connector events</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeData.connectorEvents.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Recent audit and workspace events now feed the connector operator ledger directly.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Latest connector event</p>
          <p className="mt-3 text-lg font-bold text-white">{connectorEvents[0]?.connectorName ?? 'No events yet'}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{connectorEvents[0] ? formatUpdatedAt(connectorEvents[0].createdAt) : 'Waiting for live runtime events.'}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Connector classes</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every connector should enter the runtime through an explicit class and unlock rule.</h2>
            </div>
            <span className="sm-status-pill">{autonomyModel.connectorClasses.length} classes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {autonomyModel.connectorClasses.map((connectorClass) => (
              <article className="sm-proof-card" key={connectorClass.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{connectorClass.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{connectorClass.mission}</p>
                  </div>
                  <Link className="sm-link" to={connectorClass.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">Unlock rule: {connectorClass.unlockRule}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Examples</p>
                    <p className="mt-2 text-sm">{connectorClass.examples.join(', ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                    <p className="mt-2 text-sm">{connectorClass.outputs.join(', ')}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector-driven action lanes</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A feed only matters if it opens or resolves real work in the right lane.</h2>
            </div>
            <span className="sm-status-pill">{autonomyModel.actionLanes.length} lanes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {autonomyModel.actionLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mission}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Execution plane</p>
                    <p className="mt-2 text-sm">{lane.executionPlane}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Queue class</p>
                    <p className="mt-2 text-sm">{lane.queueClass}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-white/80">Triggers: {lane.triggers.join(', ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Outputs: {lane.outputs.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-site-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Connector event ledger</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Recent connector, writeback, and agent-runtime movement is now visible as one operator timeline.</h2>
            </div>
            <Link className="sm-link" to="/app/data-fabric">
              Open data fabric
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {connectorEvents.length ? (
              connectorEvents.map((event) => (
                <article className="sm-proof-card" key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{event.connectorName}</p>
                      <p className="mt-2 text-xl font-bold text-white">{event.title}</p>
                    </div>
                    <span className={`sm-status-pill ${severityTone[event.severity] ?? 'text-slate-300'}`}>{event.kind}</span>
                  </div>
                  <p className="mt-4 text-sm text-white/80">{event.source}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{event.detail}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sm-muted)]">
                    <span>{event.actor}</span>
                    <span>{formatUpdatedAt(event.createdAt)}</span>
                    <Link className="sm-link" to={event.route}>
                      Open surface
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="font-semibold text-white">No live connector events have landed yet.</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  The connector ledger is ready. As Yangon Tyre teams enter receiving, quality, maintenance, approvals, metrics, and connector-review work, that activity will appear
                  here alongside agent runtime movement.
                </p>
              </article>
            )}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Review loop</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Connector issues now open manager-facing follow-through instead of staying as passive runtime warnings.</h2>
          </div>
          <div className="mt-6 grid gap-4">
            {attentionFeeds.length ? (
              attentionFeeds.map((feed) => (
                <article className="sm-proof-card" key={feed.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{feed.name}</p>
                    <span className={`sm-status-pill ${statusTone[feed.status]}`}>{feed.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/80">Owner: {feedReviewOwner(feed.id, feed.owner)}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{feed.backlog}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Next automation: {feed.nextAutomation}</p>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="font-semibold text-white">No Yangon Tyre connector lanes currently need review tasks.</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  Healthy feeds still appear in the runtime sections below. Use the refresh loop if you want to force a new runtime pass from the default agent jobs.
                </p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6">
        {runtimeSections.map((section) => {
          const feeds = runtimeData.connectors.filter((feed) => feed.tenant === section.tenant)
          return (
            <article className="sm-site-panel" key={section.title}>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{section.title}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">{section.description}</h2>
                </div>
                <span className="sm-status-pill">{feeds.length} feeds tracked</span>
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-2">{feeds.map((feed) => feedCard(feed, latestEventByConnector.get(feed.id) ?? null))}</div>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre connector operating frame</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Promote the source spine first, then widen the mesh without breaking trust.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Target state</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                Plant, quality, supplier, and leadership workflows should operate from one evidence spine instead of separate folders, chats, and extracts.
              </p>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Current friction</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The business still splits signal across Drive, Gmail, ERP snapshots, website leads, social demand, and internal Viber or LINE or WeChat threads.
              </p>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Operating response</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                Connector Ops becomes the governance desk that promotes live source packs into canonical records, then adds new channels behind explicit rollout posture
                and review gates.
              </p>
            </article>
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager rollout posture</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Managers should see which channels are live, mapped, or still queued.</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Live source packs</p>
              <p className="mt-2 text-2xl font-bold">{liveSourceCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{mappedSourceCount} mapped for the next promotion wave.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Queued channels</p>
              <p className="mt-2 text-2xl font-bold">{queuedConnectorCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{mappedConnectorCount} connector tracks already scoped.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Runtime feeds</p>
              <p className="mt-2 text-2xl font-bold">{ytfRuntimeFeeds.length}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Healthy, warning, degraded, and needs-wiring feeds already tracked for the tenant.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Priority rule</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Do not activate new channels until the record model, reviewer, and next action are clear inside the app line.
              </p>
            </article>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tenant source maps</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every tenant still needs an explicit source contract behind the feed health.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Runtime feeds show freshness and backlog. The operating model still defines which connectors each tenant is allowed to inherit and who owns them.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {[SUPERMEGA_CORE_MODEL, YANGON_TYRE_MODEL].map((model) => (
            <article className="sm-surface p-6" key={model.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{model.publicLabel}</p>
              <h3 className="mt-2 text-2xl font-bold text-white">{model.domain}</h3>
              <div className="mt-4 grid gap-3">
                {model.connectors.map((connector) => (
                  <article className="sm-proof-card" key={`${model.id}-${connector.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{connector.name}</p>
                      <span className="sm-status-pill">{connector.cadence}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.source}</p>
                    <p className="mt-2 text-sm text-white/80">Scope: {connector.scope}</p>
                    <p className="mt-2 text-sm text-white/80">Outputs: {connector.outputs.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Writeback: {connector.writeBack}</p>
                    <p className="mt-2 text-sm text-white/80">Admin owner: {connector.adminOwner}</p>
                  </article>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Current source packs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the real Yangon Tyre inputs already promoted into the connector roadmap.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_SOURCE_PACKS.map((pack) => (
              <article className="sm-proof-card" key={pack.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{pack.name}</p>
                  <span className={`sm-status-pill ${rolloutTone(pack.status)}`}>{pack.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.sourceType}</p>
                <p className="mt-2 text-sm text-white/80">{pack.evidence}</p>
                <p className="mt-2 text-sm text-white/80">Feeds: {pack.feedsApps.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Why now: {pack.note}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Progressive connector expansion</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Website, analytics, social, chat, and mobile forms now have an explicit rollout path.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_CONNECTOR_EXPANSION.map((item) => (
              <article className="sm-chip text-white" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{item.name}</p>
                  <span className={`sm-status-pill ${rolloutTone(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Apps: {item.apps.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">First jobs: {item.firstJobs.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
