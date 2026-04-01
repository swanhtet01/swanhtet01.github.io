import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  browserWorkspaceSummary,
  buildBrowserOutreach,
  exportBrowserWorkspaceLeads,
  listBrowserWorkspaceActions,
  listBrowserWorkspaceLeads,
  removeBrowserWorkspaceLead,
  type BrowserWorkspaceLead,
  type BrowserWorkspaceStage,
  updateBrowserWorkspaceLead,
} from '../lib/browserWorkspace'
import { bootstrapPublicWorkspace, getWorkspaceSession, hasLiveWorkspaceApi } from '../lib/workspaceApi'

const stageOptions: BrowserWorkspaceStage[] = ['new', 'outreach', 'contacted', 'qualified']

function nextActionForLead(lead: BrowserWorkspaceLead) {
  if (lead.stage === 'new') {
    return lead.email || lead.phone || lead.website ? 'Send first outreach' : 'Find a direct contact'
  }
  if (lead.stage === 'outreach') {
    return 'Follow up and log the reply'
  }
  if (lead.stage === 'contacted') {
    return 'Move to qualified or book a call'
  }
  return 'Keep active and hand it off'
}

function groupLabel(stage: 'new' | 'outreach' | 'warm') {
  if (stage === 'new') return 'New'
  if (stage === 'outreach') return 'Outreach'
  return 'Warm'
}

export function WorkspaceLitePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState(listBrowserWorkspaceLeads())
  const [message, setMessage] = useState('')
  const [starting, setStarting] = useState(false)
  const bootstrapAttempted = useRef(false)

  const summary = useMemo(() => browserWorkspaceSummary(rows), [rows])
  const openActions = listBrowserWorkspaceActions().filter((action) => action.status === 'open')

  const groupedRows = useMemo(
    () => ({
      new: rows.filter((lead) => lead.stage === 'new'),
      outreach: rows.filter((lead) => lead.stage === 'outreach'),
      warm: rows.filter((lead) => lead.stage === 'contacted' || lead.stage === 'qualified'),
    }),
    [rows],
  )

  function refresh(nextRows: BrowserWorkspaceLead[]) {
    setRows(nextRows)
  }

  async function copyOutreach(lead: BrowserWorkspaceLead) {
    const draft = buildBrowserOutreach(lead, lead.query, lead.keywords)
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.message}`)
    setMessage(`Copied outreach for ${lead.name}.`)
  }

  function updateStage(leadId: string, stage: BrowserWorkspaceStage) {
    refresh(updateBrowserWorkspaceLead(leadId, { stage }))
  }

  function updateNotes(leadId: string, notes: string) {
    refresh(updateBrowserWorkspaceLead(leadId, { notes }))
  }

  function removeLead(leadId: string) {
    refresh(removeBrowserWorkspaceLead(leadId))
  }

  function exportWorkspace() {
    exportBrowserWorkspaceLeads()
    setMessage('Exported the workspace as CSV.')
  }

  useEffect(() => {
    if (!hasLiveWorkspaceApi()) {
      return
    }

    let cancelled = false
    const shouldAutoStart = new URLSearchParams(location.search).get('start') === '1'

    async function syncWorkspace() {
      try {
        const session = await getWorkspaceSession()
        if (cancelled) {
          return
        }
        if (session.authenticated) {
          navigate('/app/actions', { replace: true })
          return
        }
        if (shouldAutoStart && !bootstrapAttempted.current) {
          bootstrapAttempted.current = true
          setStarting(true)
          const created = await bootstrapPublicWorkspace({ company: 'My Workspace' })
          if (cancelled) {
            return
          }
          if (created.authenticated) {
            navigate('/app/actions', { replace: true })
            return
          }
          setMessage('Could not start the live workspace on this host.')
        }
      } catch (error) {
        if (!cancelled && shouldAutoStart) {
          setMessage(`${error instanceof Error ? error.message : 'Live workspace is not available on this host yet.'} Using the browser workspace instead.`)
        }
      } finally {
        if (!cancelled) {
          setStarting(false)
        }
      }
    }

    void syncWorkspace()
    return () => {
      cancelled = true
    }
  }, [location.search, navigate])

  async function startLiveWorkspace() {
    if (!hasLiveWorkspaceApi()) {
      setMessage('This host is using the browser workspace only.')
      return
    }

    setStarting(true)
    try {
      const session = await getWorkspaceSession()
      if (session.authenticated) {
        navigate('/app/actions', { replace: true })
        return
      }
      const created = await bootstrapPublicWorkspace({ company: 'My Workspace' })
      if (created.authenticated) {
        navigate('/app/actions', { replace: true })
        return
      }
      setMessage('Could not start the live workspace on this host.')
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'Live workspace is not available on this host yet.'} Using the browser workspace instead.`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Workspace"
        title="Keep the shortlist moving."
        description={
          hasLiveWorkspaceApi()
            ? 'Start the real workspace on this host, or keep working in the browser workspace on this device.'
            : 'Keep saved leads, notes, and next actions together on this device.'
        }
      />

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Overview</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Leads</p>
              <p className="mt-2 text-3xl font-bold">{summary.total}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Open actions</p>
              <p className="mt-2 text-3xl font-bold">{summary.openActionCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Qualified</p>
              <p className="mt-2 text-3xl font-bold">{summary.qualifiedCount}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {hasLiveWorkspaceApi() ? (
              <button className="sm-button-primary" disabled={starting} onClick={() => void startLiveWorkspace()} type="button">
                {starting ? 'Starting...' : 'Open live workspace'}
              </button>
            ) : null}
            <Link className="sm-button-primary" to="/lead-finder">
              Find more leads
            </Link>
            <Link className="sm-button-secondary" to="/action-os">
              Open Action OS
            </Link>
            <button className="sm-button-secondary" disabled={!rows.length} onClick={exportWorkspace} type="button">
              Export CSV
            </button>
          </div>

          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {hasLiveWorkspaceApi() ? 'This host can move you into the real saved app.' : 'This workspace is stored in this browser on this device.'}
          </div>
          {message ? <div className="mt-3 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">The next actions generated from saved leads.</p>
            </div>
            <Link className="sm-link" to="/action-os">
              Open queue
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {openActions.length ? (
              openActions.slice(0, 6).map((action) => (
                <div className="sm-proof-card" key={action.action_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{action.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {action.owner} | {action.priority} | {action.due}
                      </p>
                    </div>
                    <span className="sm-status-pill">{action.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No actions yet. Save a shortlist in Lead Finder and this queue will fill automatically.</div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {(['new', 'outreach', 'warm'] as const).map((group) => {
          const items = groupedRows[group]
          return (
            <article className="sm-surface p-6" key={group}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{groupLabel(group)}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{items.length}</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {items.length ? (
                  items.map((lead) => (
                    <div className="sm-proof-card" key={lead.lead_id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{lead.name}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{nextActionForLead(lead)}</p>
                        </div>
                        <span className="sm-status-pill">{lead.stage}</span>
                      </div>

                      <div className="mt-4 sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                        <p className="mt-2 text-sm">{lead.email || lead.phone || lead.website || 'No direct contact yet'}</p>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                          Stage
                          <select className="sm-input" onChange={(event) => updateStage(lead.lead_id, event.target.value as BrowserWorkspaceStage)} value={lead.stage}>
                            {stageOptions.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                          Notes
                          <textarea
                            className="sm-input min-h-24"
                            onChange={(event) => updateNotes(lead.lead_id, event.target.value)}
                            placeholder="Reply, blocker, or next step."
                            value={lead.notes}
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button className="sm-button-primary" onClick={() => void copyOutreach(lead)} type="button">
                          Copy outreach
                        </button>
                        {lead.source_url ? (
                          <a className="sm-button-secondary" href={lead.source_url} rel="noreferrer" target="_blank">
                            Open source
                          </a>
                        ) : null}
                        <button className="sm-button-secondary" onClick={() => removeLead(lead.lead_id)} type="button">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No leads in this column yet.</div>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
