import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { defaultStarterModules, defaultWedgeProduct, normalizeSolutionPack } from '../lib/salesControl'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type LeadPipelineRow = {
  lead_id: string
  company_name: string
  archetype: string
  stage: string
  status: string
  owner: string
  campaign_goal: string
  service_pack: string
  wedge_product: string
  starter_modules: string[]
  semi_products: string[]
  contact_email: string
  contact_phone: string
  website: string
  source: string
  source_url: string
  provider: string
  score: number
  outreach_subject: string
  outreach_message: string
  discovery_questions: string[]
  notes: string
}

type LeadPipelineResponse = {
  summary: {
    lead_count: number
    by_stage: Record<string, number>
    by_status: Record<string, number>
    by_pack: Record<string, number>
  }
  rows: LeadPipelineRow[]
}

type LeadHuntProfile = {
  hunt_id: string
  name: string
  owner: string
  status: string
  query: string
  raw_text: string
  keywords: string[]
  sources: string[]
  limit: number
  campaign_goal: string
  export_workspace: boolean
  last_run_at: string
  last_provider: string
  last_engine: string
  last_saved_count: number
  last_summary: string
}

type WorkspaceTaskRow = {
  task_id: string
  lead_id: string
  template: string
  title: string
  owner: string
  priority: string
  due: string
  status: string
  notes: string
}

type HuntRunResponse = {
  status: string
  provider: string
  engine: string
  row_count: number
  saved_count: number
  summary: string
}

type LeadOutreachResponse = {
  status: string
  draft?: {
    status?: string
    compose_url?: string
    message?: string
  }
}

const stageOptions = [
  { value: 'offer_ready', label: 'Offer ready' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
] as const

function stageLabel(value: string) {
  return stageOptions.find((item) => item.value === value)?.label ?? value
}

function formatContact(row: LeadPipelineRow) {
  return row.contact_email || row.contact_phone || row.website || 'Public source only'
}

function formatLastRun(value: string) {
  if (!value) {
    return 'Never run'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function packLabel(value: string) {
  return normalizeSolutionPack(value)
}

function isInboundRow(row: LeadPipelineRow) {
  const source = String(row.source || '').trim().toLowerCase()
  const provider = String(row.provider || '').trim().toLowerCase()
  const archetype = String(row.archetype || '').trim().toLowerCase()
  return source === 'website_request' || provider === 'website' || archetype === 'inbound_request'
}

function noteValue(notes: string, key: string) {
  const normalizedKey = key.trim().toLowerCase()
  for (const line of String(notes || '').split('\n')) {
    const [label, ...rest] = line.split(':')
    if (label && label.trim().toLowerCase() === normalizedKey) {
      return rest.join(':').trim()
    }
  }
  return ''
}

export function LeadPipelinePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pipeline, setPipeline] = useState<LeadPipelineResponse | null>(null)
  const [hunts, setHunts] = useState<LeadHuntProfile[]>([])
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const session = await getWorkspaceSession()
    if (!session.authenticated) {
      throw new Error('Login is required to open the revenue pipeline.')
    }

    const [pipelinePayload, huntPayload, taskPayload] = await Promise.all([
      workspaceFetch<LeadPipelineResponse & { status: string; count: number }>('/api/lead-pipeline'),
      workspaceFetch<{ status: string; count: number; rows: LeadHuntProfile[] }>('/api/lead-hunts'),
      workspaceFetch<{ status: string; count: number; rows: WorkspaceTaskRow[] }>('/api/workspace-tasks?status=open&limit=50'),
    ])

    setPipeline({
      summary: pipelinePayload.summary,
      rows: pipelinePayload.rows,
    })
    setHunts(huntPayload.rows ?? [])
    setTasks(taskPayload.rows ?? [])
    setNoteDrafts(Object.fromEntries((pipelinePayload.rows ?? []).map((row) => [row.lead_id, row.notes || ''])))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await loadData()
        if (!cancelled) {
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load the revenue pipeline.')
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
  }, [loadData])

  const stageCounts = useMemo(
    () => ({
      total: pipeline?.summary.lead_count ?? 0,
      offerReady: pipeline?.summary.by_stage.offer_ready ?? 0,
      discovery: pipeline?.summary.by_stage.discovery ?? 0,
      activeSearches: hunts.filter((hunt) => hunt.status === 'active').length,
      openTasks: tasks.length,
    }),
    [hunts, pipeline, tasks],
  )

  const packCounts = useMemo(
    () =>
      (pipeline?.rows ?? []).reduce(
        (current, row) => {
          const key = normalizeSolutionPack(row.service_pack)
          if (key === 'Company List') {
            current.companyCleanup += 1
          } else if (key === 'Receiving Control') {
            current.receivingControl += 1
          } else {
            current.salesSetup += 1
          }
          return current
        },
        {
          salesSetup: 0,
          companyCleanup: 0,
          receivingControl: 0,
        },
      ),
    [pipeline],
  )

  const inboundRows = useMemo(() => (pipeline?.rows ?? []).filter((row) => isInboundRow(row)), [pipeline])
  const activeRows = useMemo(() => (pipeline?.rows ?? []).filter((row) => !isInboundRow(row)), [pipeline])

  async function runSavedSearch(huntId: string) {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<HuntRunResponse>(`/api/lead-hunts/${encodeURIComponent(huntId)}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setMessage(payload.summary || `Saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'} from the saved search.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the saved search.')
    } finally {
      setBusy(false)
    }
  }

  async function runAllSearches() {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<{ count: number; saved_count: number }>('/api/lead-hunts/run-active', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setMessage(`Ran ${payload.count} saved search${payload.count === 1 ? '' : 'es'} and saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'}.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the saved searches.')
    } finally {
      setBusy(false)
    }
  }

  async function saveLead(leadId: string, patch: { stage?: string; notes?: string }) {
    setBusy(true)
    setMessage('')
    try {
      await workspaceFetch(`/api/lead-pipeline/${encodeURIComponent(leadId)}`, {
        method: 'POST',
        body: JSON.stringify(patch),
      })
      setMessage('Lead updated.')
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not update the lead.')
    } finally {
      setBusy(false)
    }
  }

  async function openGmailOutreach(leadId: string) {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<LeadOutreachResponse>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/outreach/gmail`, {
        method: 'POST',
        body: JSON.stringify({ create_gmail_draft: false }),
      })
      const composeUrl = payload.draft?.compose_url?.trim()
      if (composeUrl) {
        window.open(composeUrl, '_blank', 'noopener,noreferrer')
      }
      setMessage(payload.draft?.message?.trim() || 'Opened Gmail compose for this lead.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not open Gmail compose.')
    } finally {
      setBusy(false)
    }
  }

  async function copyOutreach(row: LeadPipelineRow) {
    const lines = [
      row.outreach_subject,
      '',
      row.outreach_message,
      '',
      'Discovery questions:',
      ...row.discovery_questions.slice(0, 3).map((question) => `- ${question}`),
    ]
    await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
    setMessage(`Copied outreach for ${row.company_name}.`)
  }

  async function copyOfferBrief(row: LeadPipelineRow) {
    const normalizedPack = packLabel(row.service_pack)
    const lines = [
      row.company_name,
      `Best fit: ${normalizedPack}`,
      `Wedge: ${row.wedge_product || defaultWedgeProduct(row.service_pack)}`,
      `Starter tools: ${(row.starter_modules ?? []).join(', ') || defaultStarterModules(row.service_pack).join(', ')}`,
      '',
      'Questions to ask:',
      ...row.discovery_questions.slice(0, 3).map((question) => `- ${question}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setMessage(`Copied offer brief for ${row.company_name}.`)
  }

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading revenue pipeline...</section>
  }

  if (error) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">{error}</section>
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Revenue Pipeline"
        title="Work the live deal queue."
        description="Use this page for inbound requests, stage updates, and next actions. Prospecting stays available, but it no longer crowds the deal view."
      />

      <section className="grid gap-4 md:grid-cols-5">
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Open deals</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.total}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Inbound requests</p>
          <p className="mt-2 text-3xl font-bold">{inboundRows.length}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Offer ready</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.offerReady}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Discovery</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.discovery}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Open tasks</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.openTasks}</p>
        </div>
      </section>

      {message ? <section className="sm-chip text-[var(--sm-muted)]">{message}</section> : null}

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Inbound requests</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Reply to the newest asks first.</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">These came in from the public site and should become a concrete next step the same day.</p>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue">
              Open revenue desk
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {inboundRows.length ? (
              inboundRows.slice(0, 5).map((row) => {
                const requestedPackage = noteValue(row.notes, 'Requested package') || row.wedge_product || packLabel(row.service_pack)
                const firstTeam = noteValue(row.notes, 'First team')
                const goal = noteValue(row.notes, 'Goal')

                return (
                  <article className="sm-proof-card" key={row.lead_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.company_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{formatContact(row)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="sm-status-pill">{requestedPackage}</span>
                        <span className="sm-status-pill">{stageLabel(row.stage)}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">First team</p>
                        <p className="mt-2 text-sm">{firstTeam || 'Not set yet'}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Goal</p>
                        <p className="mt-2 text-sm">{goal || row.campaign_goal || 'Review and confirm the first rollout.'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                      <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                        Stage
                        <select
                          className="sm-input"
                          onChange={(event) => void saveLead(row.lead_id, { stage: event.target.value })}
                          value={row.stage}
                        >
                          {stageOptions.map((stage) => (
                            <option key={stage.value} value={stage.value}>
                              {stage.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                        Notes
                        <div className="flex gap-3">
                          <input
                            className="sm-input"
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [row.lead_id]: event.target.value,
                              }))
                            }
                            placeholder="What happened, what is blocked, what is next?"
                            value={noteDrafts[row.lead_id] ?? ''}
                          />
                          <button
                            className="sm-button-secondary shrink-0"
                            disabled={busy}
                            onClick={() => void saveLead(row.lead_id, { notes: noteDrafts[row.lead_id] ?? '' })}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="sm-button-primary" disabled={busy} onClick={() => void openGmailOutreach(row.lead_id)} type="button">
                        Draft reply
                      </button>
                      <button className="sm-button-secondary" onClick={() => void copyOfferBrief(row)} type="button">
                        Copy brief
                      </button>
                      {row.source_url ? (
                        <a className="sm-button-secondary" href={row.source_url} rel="noreferrer" target="_blank">
                          Open source
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No new website requests right now.</div>
            )}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Active deals</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Move the next committed accounts.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue">
              Open revenue desk
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {activeRows.length ? (
              activeRows.map((row) => (
                <article className="sm-proof-card" key={row.lead_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.company_name}</p>
                      <p className="mt-1 text-sm text-[var(--sm-muted)]">{formatContact(row)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="sm-status-pill">Score {row.score}</span>
                      <span className="sm-status-pill">{stageLabel(row.stage)}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Best fit</p>
                      <p className="mt-2 font-semibold">{packLabel(row.service_pack)}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Wedge: {row.wedge_product || defaultWedgeProduct(row.service_pack)}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">First tools</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(row.starter_modules?.length ? row.starter_modules : defaultStarterModules(row.service_pack)).map((module) => (
                          <span className="sm-status-pill" key={module}>
                            {module}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                    <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                      Stage
                      <select
                        className="sm-input"
                        onChange={(event) => void saveLead(row.lead_id, { stage: event.target.value })}
                        value={row.stage}
                      >
                        {stageOptions.map((stage) => (
                          <option key={stage.value} value={stage.value}>
                            {stage.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                      Notes
                      <div className="flex gap-3">
                        <input
                          className="sm-input"
                          onChange={(event) =>
                            setNoteDrafts((current) => ({
                              ...current,
                              [row.lead_id]: event.target.value,
                            }))
                          }
                          placeholder="What happened, what is blocked, what is next?"
                          value={noteDrafts[row.lead_id] ?? ''}
                        />
                        <button
                          className="sm-button-secondary shrink-0"
                          disabled={busy}
                          onClick={() => void saveLead(row.lead_id, { notes: noteDrafts[row.lead_id] ?? '' })}
                          type="button"
                        >
                          Save
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" disabled={busy} onClick={() => void openGmailOutreach(row.lead_id)} type="button">
                      Draft outreach
                    </button>
                    <button className="sm-button-secondary" onClick={() => void copyOutreach(row)} type="button">
                      Copy outreach
                    </button>
                    <button className="sm-button-secondary" onClick={() => void copyOfferBrief(row)} type="button">
                      Copy brief
                    </button>
                    {row.source_url ? (
                      <a className="sm-button-secondary" href={row.source_url} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No active deals yet. Use prospecting or the public contact form to seed the queue.</div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Next actions</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What the team should do next.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {tasks.length ? (
              tasks.slice(0, 8).map((task) => (
                <div className="sm-chip" key={task.task_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{task.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{task.notes || 'No note yet.'}</p>
                    </div>
                    <span className="sm-status-pill">{task.priority}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--sm-muted)]">
                    <span>Owner: {task.owner || 'Revenue'}</span>
                    <span>Due: {task.due || 'This week'}</span>
                    <span>Template: {task.template || 'manual'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No open tasks yet. Saving leads should start the first follow-up automatically.</div>
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Prospecting lane</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Source new accounts without crowding the deal queue.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue/prospecting">
              Open prospecting
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved hunts</p>
              <p className="mt-2 text-2xl font-bold">{stageCounts.activeSearches}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Find Clients</p>
              <p className="mt-2 text-2xl font-bold">{packCounts.salesSetup}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Receiving Control</p>
              <p className="mt-2 text-2xl font-bold">{packCounts.receivingControl}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy || !hunts.length} onClick={() => void runAllSearches()} type="button">
              Run saved hunts
            </button>
            <span className="self-center text-xs text-[var(--sm-muted)]">Prospecting remains live, but it no longer mixes with inbound or active deal work.</span>
          </div>

          <div className="mt-5 space-y-3">
            {hunts.length ? (
              hunts.slice(0, 4).map((hunt) => (
                <div className="sm-chip" key={hunt.hunt_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{hunt.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{hunt.query}</p>
                    </div>
                    <button className="sm-button-secondary" disabled={busy} onClick={() => void runSavedSearch(hunt.hunt_id)} type="button">
                      Run
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-[var(--sm-muted)]">
                    {hunt.last_saved_count ? `Last run saved ${hunt.last_saved_count} leads.` : 'No saved run yet.'} {formatLastRun(hunt.last_run_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No saved hunts yet. Prospecting stays available when you need to source new accounts.</div>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
