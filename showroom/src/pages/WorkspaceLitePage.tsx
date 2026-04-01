import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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

const stageOptions: BrowserWorkspaceStage[] = ['new', 'outreach', 'contacted', 'qualified']

function nextActionForLead(lead: BrowserWorkspaceLead) {
  if (lead.stage === 'new') {
    return lead.email || lead.phone || lead.website ? 'Send first outreach' : 'Find a direct contact'
  }
  if (lead.stage === 'outreach') {
    return 'Follow up and log the reply'
  }
  if (lead.stage === 'contacted') {
    return 'Book a call or move it to qualified'
  }
  return 'Keep active and move into delivery'
}

export function WorkspaceLitePage() {
  const [rows, setRows] = useState(listBrowserWorkspaceLeads())
  const [message, setMessage] = useState('')

  const summary = useMemo(() => browserWorkspaceSummary(rows), [rows])
  const openActionCount = listBrowserWorkspaceActions().filter((action) => action.status === 'open').length
  const topActions = useMemo(
    () =>
      rows.slice(0, 5).map((lead) => ({
        lead_id: lead.lead_id,
        title: lead.name,
        detail: nextActionForLead(lead),
      })),
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
    setMessage('Exported the browser workspace as CSV.')
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Browser workspace"
        title="Run the shortlist."
        description="Keep leads, notes, and follow-up actions in one working workspace on this device."
      />

      <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Overview</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved leads</p>
              <p className="mt-2 text-3xl font-bold">{summary.total}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">New</p>
              <p className="mt-2 text-3xl font-bold">{summary.newCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Outreach</p>
              <p className="mt-2 text-3xl font-bold">{summary.outreachCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Qualified</p>
              <p className="mt-2 text-3xl font-bold">{summary.qualifiedCount}</p>
            </div>
            <div className="sm-chip text-white md:col-span-2">
              <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
              <p className="mt-2 text-3xl font-bold">{openActionCount}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/lead-finder">
              Find more leads
            </Link>
            <Link className="sm-button-secondary" to="/action-os">
              Open Action OS
            </Link>
            <button className="sm-button-secondary" disabled={!rows.length} onClick={exportWorkspace} type="button">
              Export workspace
            </button>
          </div>

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
          <div className="mt-5 space-y-3">
            {topActions.length ? (
              topActions.map((action) => (
                <div className="sm-proof-card" key={action.lead_id}>
                  <p className="font-semibold text-white">{action.title}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{action.detail}</p>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No leads yet. Start with Lead Finder, keep a shortlist, then run it here.</div>
            )}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Lead list</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Saved leads</h2>
          </div>
          <Link className="sm-link" to="/action-os">
            See Action OS
          </Link>
        </div>

        <div className="mt-5 space-y-4">
          {rows.length ? (
            rows.map((lead) => (
              <div className="sm-proof-card" key={lead.lead_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{lead.name}</p>
                    <p className="mt-1 text-sm text-[var(--sm-muted)]">{lead.query || lead.source || 'Saved lead'}</p>
                  </div>
                  <span className="sm-status-pill">{lead.stage}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                    <p className="mt-2 text-sm">{lead.email || lead.phone || lead.website || 'No direct contact yet'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Next action</p>
                    <p className="mt-2 text-sm">{nextActionForLead(lead)}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Provider</p>
                    <p className="mt-2 text-sm">{lead.provider || 'Browser'}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[0.24fr_0.76fr]">
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
                      placeholder="Capture a contact, reply, blocker, or next step."
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
            <div className="sm-chip text-[var(--sm-muted)]">This workspace is empty. Use Lead Finder first, then save the shortlist here.</div>
          )}
        </div>
      </section>
    </div>
  )
}
