import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { getWorkspaceSession, listWorkspaceTasks, runAgentJob, type WorkspaceTaskRow } from '../lib/workspaceApi'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

type PlantDemoEvent = {
  id: string
  area: string
  issue: string
  owner: string
  severity: 'high' | 'review' | 'normal'
  status: 'open' | 'review' | 'closed'
  createdAt: string
}

const industrialDemoEventsKey = 'supermega.industrialPlantDemoEvents.v1'

const defaultIndustrialEvents: PlantDemoEvent[] = [
  {
    id: 'press-07-downtime',
    area: 'Curing',
    issue: 'Press 07 repeated downtime before shift handover',
    owner: 'Maintenance',
    severity: 'high',
    status: 'open',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'supplier-coa-hold',
    area: 'Receiving',
    issue: 'Inbound batch needs QC disposition before stock release',
    owner: 'QC + Stores',
    severity: 'review',
    status: 'review',
    createdAt: new Date(Date.now() - 92 * 60 * 1000).toISOString(),
  },
]

const industrialModuleChecklist = [
  ['Issues', 'What happened, where, and who owns it', 'Open'],
  ['Quality proof', 'Photos, files, checks, and CAPA evidence', 'Review'],
  ['Maintenance', 'Downtime, repeat faults, and next action', 'High'],
  ['Receiving', 'Supplier holds and release decisions', 'Hold'],
] as const

function loadIndustrialDemoEvents() {
  if (typeof window === 'undefined') {
    return defaultIndustrialEvents
  }

  try {
    const raw = window.localStorage.getItem(industrialDemoEventsKey)
    if (!raw) {
      return defaultIndustrialEvents
    }
    const parsed = JSON.parse(raw) as PlantDemoEvent[]
    return Array.isArray(parsed) && parsed.length ? parsed : defaultIndustrialEvents
  } catch {
    return defaultIndustrialEvents
  }
}

function saveIndustrialDemoEvents(events: PlantDemoEvent[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(industrialDemoEventsKey, JSON.stringify(events))
  } catch {
    // Local demo storage should never block the plant screen.
  }
}

function isOpenTask(task: WorkspaceTaskRow) {
  return !['done', 'closed', 'cancelled', 'canceled'].includes(String(task.status || '').toLowerCase())
}

function isHighPriority(task: WorkspaceTaskRow) {
  return ['high', 'urgent', 'critical'].includes(String(task.priority || '').toLowerCase())
}

function compact(value: string, limit = 92) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit - 1).trim()}...`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not synced'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function connectorWeight(status: string) {
  if (status === 'Needs wiring') {
    return 4
  }
  if (status === 'Degraded') {
    return 3
  }
  if (status === 'Warning') {
    return 2
  }
  return 1
}

function sourceWeight(status: string) {
  if (status === 'live') {
    return 3
  }
  if (status === 'mapped') {
    return 2
  }
  return 1
}

function buildFallbackActions(dataFabric: DataFabricDataset | null) {
  const connectors = [...(dataFabric?.connectorSignals ?? [])]
    .sort((left, right) => connectorWeight(right.status) - connectorWeight(left.status))
    .slice(0, 3)

  if (connectors.length) {
    return connectors.map((item) => ({
      title: item.name,
      detail: compact(item.risks?.[0] || item.nextAutomation || 'Review connector status and decide the owner action.'),
      route: '/app/connectors',
      meta: item.status,
    }))
  }

  return [
    {
      title: 'Review daily blockers',
      detail: 'Open the plant review, confirm the blocker owner, and close anything already resolved.',
      route: '/app/plant-manager',
      meta: 'Review',
    },
    {
      title: 'Check data quality',
      detail: 'Confirm which source changed and whether the system needs cleanup before managers use it.',
      route: '/app/data-quality',
      meta: 'Data',
    },
    {
      title: 'Approve next actions',
      detail: 'Move prepared work from queue to owner action only when evidence is clear.',
      route: '/app/action-board',
      meta: 'Decision',
    },
  ]
}

function buildIndustrialDemoActions() {
  return [
    {
      title: 'Close the top production blocker before shift handover',
      detail: 'Confirm owner, evidence, expected finish time, and whether the issue needs CAPA escalation.',
      route: '/app/action-board',
      meta: 'High',
    },
    {
      title: 'Review repeat downtime cluster on curing line',
      detail: 'Ask maintenance to attach the last repair note, likely cause, and next preventive action.',
      route: '/app/maintenance',
      meta: 'High',
    },
    {
      title: 'Prepare supplier hold decision for incoming materials',
      detail: 'Compare receiving evidence, QC result, and procurement impact before release or return.',
      route: '/app/receiving',
      meta: 'Review',
    },
  ]
}

function buildIndustrialDemoRisks() {
  return [
    {
      title: 'Repeat downtime needs root-cause review',
      detail: 'Maintenance notes show recurring line stoppage; open 5W1H and assign preventive action.',
      meta: 'Maintenance',
    },
    {
      title: 'Supplier batch is waiting for disposition',
      detail: 'Receiving and QC evidence disagree; manager decision needed before stock release.',
      meta: 'Supplier',
    },
    {
      title: 'CAPA evidence is incomplete',
      detail: 'One corrective action has owner and due date, but no verification attachment yet.',
      meta: 'DQMS',
    },
  ]
}

export function PlantOperatingSystemPage() {
  const tenant = getTenantConfig()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState | null>(null)
  const [dataFabric, setDataFabric] = useState<DataFabricDataset | null>(null)
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [error, setError] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentMessage, setAgentMessage] = useState('')
  const [demoEvents, setDemoEvents] = useState<PlantDemoEvent[]>(() => loadIndustrialDemoEvents())
  const isIndustrialProductRoutePath = /\/app\/(industrial-os|plant-os)/.test(location.pathname)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        if (isIndustrialProductRoutePath) {
          if (!cancelled) {
            setSession(null)
            setTasks([])
            setDataFabric(null)
            setError('')
          }
          return
        }

        const [sessionPayload, taskPayload, nextDataFabric] = await Promise.all([
          getWorkspaceSession(),
          listWorkspaceTasks('open', 80).catch(() => ({ rows: [] })),
          loadDataFabricDataset(),
        ])

        if (!cancelled) {
          setSession(sessionPayload.session ?? null)
          setTasks(taskPayload.rows ?? [])
          setDataFabric(nextDataFabric)
          setError('')
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Plant screen could not load.')
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
  }, [isIndustrialProductRoutePath])

  useEffect(() => {
    if (tenant.key === 'default') {
      saveIndustrialDemoEvents(demoEvents)
    }
  }, [demoEvents, tenant.key])

  const openTasks = useMemo(() => tasks.filter(isOpenTask), [tasks])
  const isSandboxIndustrialDemo = tenant.key === 'default'
  const isIndustrialProductRoute = isSandboxIndustrialDemo && isIndustrialProductRoutePath
  const operatingTasks = useMemo(() => (isSandboxIndustrialDemo ? [] : openTasks), [isSandboxIndustrialDemo, openTasks])
  const urgentTasks = useMemo(() => operatingTasks.filter(isHighPriority), [operatingTasks])
  const demoHighCount = useMemo(() => demoEvents.filter((event) => event.severity === 'high' && event.status !== 'closed').length, [demoEvents])
  const liveSources = useMemo(() => (dataFabric?.sourceRegistry ?? []).filter((item) => item.status === 'live').length, [dataFabric])
  const attentionConnectors = useMemo(
    () => (dataFabric?.connectorSignals ?? []).filter((item) => item.status !== 'Healthy').length,
    [dataFabric],
  )
  const trustScore = dataFabric?.learningDatabase.trustScore ?? 0
  const changedSources = dataFabric?.sourceEvents.length ?? 0
  const lastSync = formatDateTime(dataFabric?.updatedAt)

  const priorityActions = useMemo(() => {
    if (isSandboxIndustrialDemo && !operatingTasks.length) {
      const eventActions = demoEvents.slice(0, 4).map((event) => ({
        title: event.issue,
        detail: `${event.area} / ${event.owner} / ${event.status}`,
        route: '/app/action-board',
        meta: event.severity === 'high' ? 'High' : event.severity === 'review' ? 'Review' : 'Open',
      }))
      return eventActions.length ? eventActions : buildIndustrialDemoActions()
    }

    const fromTasks = operatingTasks.slice(0, 4).map((task) => ({
      title: task.title,
      detail: task.notes || `${task.owner || 'Owner'} / ${task.priority || 'normal'} priority`,
      route: '/app/action-board',
      meta: task.priority || task.status || 'Open',
    }))

    return fromTasks.length ? fromTasks : buildFallbackActions(dataFabric)
  }, [dataFabric, demoEvents, isSandboxIndustrialDemo, operatingTasks])

  const topRisks = useMemo(() => {
    if (isSandboxIndustrialDemo) {
      return buildIndustrialDemoRisks()
    }

    const connectorRisks = [...(dataFabric?.connectorSignals ?? [])]
      .filter((item) => item.status !== 'Healthy' || item.risks?.length)
      .sort((left, right) => connectorWeight(right.status) - connectorWeight(left.status))
      .slice(0, 3)
      .map((item) => ({
        title: item.name,
        detail: compact(item.risks?.[0] || item.nextAutomation || 'Needs owner review.'),
        meta: item.status,
      }))

    if (connectorRisks.length) {
      return connectorRisks
    }

    return [...(dataFabric?.sourceRegistry ?? [])]
      .sort((left, right) => {
        const statusDelta = sourceWeight(right.status) - sourceWeight(left.status)
        return statusDelta || right.evidenceCount - left.evidenceCount
      })
      .slice(0, 3)
      .map((item) => ({
        title: item.name,
        detail: compact(item.nextAutomation || `${item.evidenceCount} records attached to ${item.sourceType}.`),
        meta: item.status,
      }))
  }, [dataFabric, isSandboxIndustrialDemo])

  async function handleRunBrief() {
    setAgentBusy(true)
    setAgentMessage('')
    try {
      const payload = await runAgentJob({
        job_type: 'director_daily_brief',
        source: 'director_mobile_review',
        payload: {
          tenant: tenant.key,
          open_tasks: operatingTasks.length || priorityActions.length,
          urgent_tasks: urgentTasks.length,
          live_sources: liveSources,
          attention_connectors: attentionConnectors,
          trust_score: trustScore,
          updated_at: dataFabric?.updatedAt ?? null,
        },
        idempotency_key: `director-brief-${tenant.key}-${new Date().toISOString().slice(0, 10)}`,
      })
      setAgentMessage(payload.row?.summary || 'Director brief prepared. Review the queue before sending actions.')
    } catch (nextError) {
      setAgentMessage(nextError instanceof Error ? nextError.message : 'Director brief could not run.')
    } finally {
      setAgentBusy(false)
    }
  }

  function handleDemoEventSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const issue = String(form.get('issue') || '').trim()
    if (!issue) {
      return
    }

    const nextEvent: PlantDemoEvent = {
      id: `plant-event-${Date.now()}`,
      area: String(form.get('area') || 'Production').trim() || 'Production',
      issue,
      owner: String(form.get('owner') || 'Plant Manager').trim() || 'Plant Manager',
      severity: String(form.get('severity') || 'review') as PlantDemoEvent['severity'],
      status: 'open',
      createdAt: new Date().toISOString(),
    }

    setDemoEvents((current) => [nextEvent, ...current].slice(0, 12))
    setAgentMessage('Plant event saved. Owner actions and open work updated.')
    event.currentTarget.reset()
  }

  function resetIndustrialDemo() {
    setDemoEvents(defaultIndustrialEvents)
    setAgentMessage('Starter data reset.')
  }

  if (loading) {
    return <section className="sm-ytf-panel text-sm text-[var(--sm-muted)]">Opening plant screen...</section>
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">
            {isIndustrialProductRoute ? 'Factory Operations App' : `${getTenantBrandLabel(tenant)} / Director`}
          </p>
          <h1>{isIndustrialProductRoute ? 'Factory work, simplified.' : 'Director review.'}</h1>
          <p>
            {isIndustrialProductRoute
              ? 'Daily factory issues, proof, owners, and next decisions in one clean screen.'
              : 'One screen for today: what is open, what changed, what needs a decision.'}
          </p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{isIndustrialProductRoute ? 'demo' : session?.role || 'owner'}</span>
          <span>{lastSync}</span>
        </div>
      </section>

      <section className="sm-ytf-metric-strip">
        <article>
          <span>Open work</span>
          <strong>{operatingTasks.length || demoEvents.filter((event) => event.status !== 'closed').length || priorityActions.length}</strong>
          <small>{urgentTasks.length || demoHighCount} high priority</small>
        </article>
        <article>
          <span>Live sources</span>
          <strong>{isIndustrialProductRoute ? 8 : liveSources}</strong>
          <small>{isIndustrialProductRoute ? 'production, QC, maintenance, receiving' : `${dataFabric?.sourceRegistry.length ?? 0} mapped`}</small>
        </article>
        <article>
          <span>Changed records</span>
          <strong>{isIndustrialProductRoute ? 14 : changedSources}</strong>
          <small>{isIndustrialProductRoute ? 'today source events' : 'latest source events'}</small>
        </article>
        <article>
          <span>Trust score</span>
          <strong>{isIndustrialProductRoute ? 96 : trustScore}</strong>
          <small>{isIndustrialProductRoute ? '6 evidence checks' : `${attentionConnectors} connector checks`}</small>
        </article>
      </section>

      {isIndustrialProductRoute ? (
        <section className="sm-ytf-split sm-product-one-screen">
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Daily loop</p>
                <h2>See the issue. Check the proof. Decide next.</h2>
              </div>
              <span className="sm-status-pill">Live-style screen</span>
            </div>
            <div className="sm-ytf-compact-list">
              {industrialModuleChecklist.map(([name, detail, status]) => (
                <article className="sm-ytf-list-row" key={name}>
                  <span>
                    <strong>{name}</strong>
                    <small>{detail}</small>
                  </span>
                  <em>{status}</em>
                </article>
              ))}
            </div>
          </article>
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Quick input</p>
                <h2>Log one issue.</h2>
              </div>
              <button className="sm-button-secondary" onClick={resetIndustrialDemo} type="button">
                Reset
              </button>
            </div>
            <form className="grid gap-3" onSubmit={handleDemoEventSubmit}>
              <input className="sm-ytf-input" name="area" placeholder="Area" />
              <input className="sm-ytf-input" name="issue" placeholder="Issue or blocker" required />
              <div className="grid gap-3 md:grid-cols-[1fr_0.75fr]">
                <input className="sm-ytf-input" name="owner" placeholder="Owner" />
                <select className="sm-ytf-input" name="severity" defaultValue="review">
                  <option value="high">High</option>
                  <option value="review">Review</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
              <button className="sm-button-primary" type="submit">
                Save event
              </button>
            </form>
          </article>
          <article className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Open issues</p>
                <h2>What needs a decision.</h2>
              </div>
              <button className="sm-button-primary" disabled={agentBusy} onClick={() => void handleRunBrief()} type="button">
                {agentBusy ? 'Preparing...' : 'Prepare brief'}
              </button>
            </div>
            <div className="sm-ytf-compact-list">
              {priorityActions.slice(0, 3).map((item) => (
                <Link className="sm-ytf-list-row" key={`${item.title}-${item.meta}`} to={item.route}>
                  <span>
                    <strong>{compact(item.title, 58)}</strong>
                    <small>{compact(item.detail, 78)}</small>
                  </span>
                  <em>{item.meta}</em>
                </Link>
              ))}
            </div>
            {agentMessage ? <p className="mt-3 text-sm font-semibold text-[var(--sm-ink)]">{agentMessage}</p> : null}
            {error ? <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p> : null}
          </article>
        </section>
      ) : null}

      {!isIndustrialProductRoute ? (
        <>
          <section className="sm-ytf-panel">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Decide next</p>
                <h2>Owner actions</h2>
              </div>
              <button className="sm-button-primary" disabled={agentBusy} onClick={() => void handleRunBrief()} type="button">
                {agentBusy ? 'Preparing...' : 'Prepare brief'}
              </button>
            </div>
            <div className="sm-ytf-action-list">
              {priorityActions.map((item) => (
                <Link className="sm-ytf-action-row" key={`${item.title}-${item.meta}`} to={item.route}>
                  <div className="sm-ytf-action-main">
                    <strong>{compact(item.title, 78)}</strong>
                    <small>{compact(item.detail, 128)}</small>
                  </div>
                  <em>{item.meta}</em>
                </Link>
              ))}
            </div>
            {agentMessage ? <p className="mt-3 text-sm font-semibold text-[var(--sm-ink)]">{agentMessage}</p> : null}
            {error ? <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p> : null}
          </section>

          <section className="sm-ytf-split">
            <article className="sm-ytf-panel">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Risk</p>
                  <h2>Needs attention</h2>
                </div>
                <Link className="sm-mini-link" to="/app/data-quality">
                  Data quality
                </Link>
              </div>
              <div className="sm-ytf-compact-list">
                {topRisks.map((item) => (
                  <div className="sm-ytf-list-row" key={`${item.title}-${item.meta}`}>
                    <div>
                      <strong>{compact(item.title, 72)}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <em>{item.meta}</em>
                  </div>
                ))}
              </div>
            </article>

            <article className="sm-ytf-panel">
              <div className="sm-ytf-section-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Open</p>
                  <h2>Working screens</h2>
                </div>
              </div>
              <div className="sm-ytf-action-grid">
                <Link className="sm-ytf-action-tile" to="/app/plant-manager">
                  <strong>Plant manager</strong>
                  <small>Daily review, blockers, and closeout.</small>
                </Link>
                <Link className="sm-ytf-action-tile" to="/app/action-board">
                  <strong>Action board</strong>
                  <small>Owner queue and decision status.</small>
                </Link>
                <Link className="sm-ytf-action-tile" to="/app/data-quality">
                  <strong>Quality evidence</strong>
                  <small>Records, changed sources, and proof gaps.</small>
                </Link>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  )
}
