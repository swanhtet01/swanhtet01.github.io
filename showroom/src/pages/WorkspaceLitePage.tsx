import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  browserWorkspaceSummary,
  buildBrowserOutreach,
  exportBrowserWorkspaceLeads,
  listBrowserWorkspaceActions,
  listBrowserWorkspaceLeads,
  removeBrowserWorkspaceAction,
  removeBrowserWorkspaceLead,
  seedBrowserWorkspaceActionsFromLeads,
  updateBrowserWorkspaceAction,
  updateBrowserWorkspaceLead,
  type BrowserWorkspaceLead,
  type BrowserWorkspaceStage,
} from '../lib/browserWorkspace'
import { bootstrapPublicWorkspace, getWorkspaceSession, hasLiveWorkspaceApi } from '../lib/workspaceApi'

type WorkspaceView = 'shortlist' | 'queue'

const stageOptions: BrowserWorkspaceStage[] = ['new', 'outreach', 'contacted', 'qualified']

function viewHref(view: WorkspaceView) {
  return `/workspace?view=${view}`
}

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
  return 'Keep warm and hand it off'
}

function isQueueView(value: string | null): value is WorkspaceView {
  return value === 'queue' || value === 'shortlist'
}

export function WorkspaceLitePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState(listBrowserWorkspaceLeads())
  const [actions, setActions] = useState(listBrowserWorkspaceActions())
  const [message, setMessage] = useState('')
  const [starting, setStarting] = useState(false)
  const bootstrapAttempted = useRef(false)

  const requestedView = new URLSearchParams(location.search).get('view')
  const activeView: WorkspaceView = isQueueView(requestedView) ? requestedView : 'shortlist'
  const summary = useMemo(() => browserWorkspaceSummary(rows), [rows])
  const openActions = useMemo(() => actions.filter((action) => action.status === 'open'), [actions])
  const isEmptyWorkspace = rows.length === 0

  function refreshLeads(nextRows: BrowserWorkspaceLead[]) {
    setRows(nextRows)
  }

  function refreshActions() {
    setActions(listBrowserWorkspaceActions())
  }

  async function copyOutreach(lead: BrowserWorkspaceLead) {
    const draft = buildBrowserOutreach(lead, lead.query, lead.keywords)
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.message}`)
    setMessage(`Copied outreach for ${lead.name}.`)
  }

  function updateStage(leadId: string, stage: BrowserWorkspaceStage) {
    refreshLeads(updateBrowserWorkspaceLead(leadId, { stage }))
  }

  function updateNotes(leadId: string, notes: string) {
    refreshLeads(updateBrowserWorkspaceLead(leadId, { notes }))
  }

  function removeLead(leadId: string) {
    refreshLeads(removeBrowserWorkspaceLead(leadId))
    refreshActions()
  }

  function exportWorkspace() {
    exportBrowserWorkspaceLeads()
    setMessage('Exported the workspace as CSV.')
  }

  function seedQueue() {
    setActions(seedBrowserWorkspaceActionsFromLeads())
    setMessage('Created follow-up actions from saved leads.')
    navigate(viewHref('queue'), { replace: true })
  }

  function markDone(actionId: string) {
    setActions(updateBrowserWorkspaceAction(actionId, { status: 'done' }))
  }

  function reopen(actionId: string) {
    setActions(updateBrowserWorkspaceAction(actionId, { status: 'open' }))
  }

  function removeAction(actionId: string) {
    setActions(removeBrowserWorkspaceAction(actionId))
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
        title="Keep leads and next steps together."
        description={
          hasLiveWorkspaceApi()
            ? 'Keep leads, notes, and next actions together. Open the shared app only if you need the same workspace across devices.'
            : 'Keep leads, notes, and next actions together on this device.'
        }
      />

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">{isEmptyWorkspace ? 'Start here' : 'Workspace'}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Leads</p>
              <p className="mt-2 text-3xl font-bold">{summary.total}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Open queue</p>
              <p className="mt-2 text-3xl font-bold">{summary.openActionCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Qualified</p>
              <p className="mt-2 text-3xl font-bold">{summary.qualifiedCount}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/lead-finder">
              Find more leads
            </Link>
            <Link className={activeView === 'shortlist' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('shortlist')}>
              Leads
            </Link>
            <Link className={activeView === 'queue' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('queue')}>
              Queue
            </Link>
            {rows.length && !openActions.length ? (
              <button className="sm-button-secondary" onClick={seedQueue} type="button">
                Create queue
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="sm-button-secondary" disabled={!rows.length} onClick={exportWorkspace} type="button">
              Export CSV
            </button>
            {hasLiveWorkspaceApi() ? (
              <button className="sm-button-secondary" disabled={starting} onClick={() => void startLiveWorkspace()} type="button">
                {starting ? 'Starting...' : 'Open shared app'}
              </button>
            ) : null}
          </div>

          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {hasLiveWorkspaceApi() ? 'Use this page for quick work. Open the shared app only when you need the same workspace across devices.' : 'This shortlist is stored in this browser on this device.'}
          </div>
          {message ? <div className="mt-3 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{activeView === 'queue' ? 'Queue' : 'Leads'}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {activeView === 'queue'
                  ? 'Run the next actions here.'
                  : 'Keep only the leads worth chasing.'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {isEmptyWorkspace ? (
              <>
                <div className="sm-proof-card">
                  <p className="font-semibold text-white">1. Search a market</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Start in Lead Finder with a place or niche.</p>
                </div>
                <div className="sm-proof-card">
                  <p className="font-semibold text-white">2. Keep the right leads</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Save only the leads worth chasing first.</p>
                </div>
                <div className="sm-proof-card">
                  <p className="font-semibold text-white">3. Run the queue</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">The workspace builds the follow-up queue for you.</p>
                </div>
              </>
            ) : activeView === 'queue' ? (
              openActions.length ? (
                openActions.slice(0, 8).map((action) => (
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
                    <div className="mt-4 flex flex-wrap gap-3">
                      {action.status === 'open' ? (
                        <button className="sm-button-primary" onClick={() => markDone(action.action_id)} type="button">
                          Mark done
                        </button>
                      ) : (
                        <button className="sm-button-secondary" onClick={() => reopen(action.action_id)} type="button">
                          Reopen
                        </button>
                      )}
                      <button className="sm-button-secondary" onClick={() => removeAction(action.action_id)} type="button">
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sm-proof-card">
                  <p className="font-semibold text-white">No queue yet</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Save some leads first, then create the queue from those leads.</p>
                  <div className="mt-4">
                    <button className="sm-button-primary" disabled={!rows.length} onClick={seedQueue} type="button">
                      Create queue from shortlist
                    </button>
                  </div>
                </div>
              )
            ) : (
              rows.slice(0, 6).map((lead) => (
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
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" onClick={() => void copyOutreach(lead)} type="button">
                      Copy outreach
                    </button>
                    {lead.source_url ? (
                      <a className="sm-button-secondary" href={lead.source_url} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {rows.length && activeView === 'shortlist' ? (
        <section className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Saved leads</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Update the stage, add a note, and remove anything not worth chasing.</p>
            </div>
            {openActions.length ? (
              <Link className="sm-link" to={viewHref('queue')}>
                Open queue
              </Link>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {rows.map((lead) => (
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

                <div className="mt-4 grid gap-3 md:grid-cols-[0.36fr_0.64fr]">
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
                    Note
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
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
