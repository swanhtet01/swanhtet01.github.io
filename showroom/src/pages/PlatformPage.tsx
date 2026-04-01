import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  browserWorkspaceSummary,
  listBrowserWorkspaceActions,
  listBrowserWorkspaceLeads,
  removeBrowserWorkspaceAction,
  saveBrowserWorkspaceActions,
  seedBrowserWorkspaceActionsFromLeads,
  type BrowserWorkspaceTask,
  updateBrowserWorkspaceAction,
} from '../lib/browserWorkspace'
import { buildActionBoard } from '../lib/tooling'

type ActionTemplateId = 'lead' | 'ops' | 'receiving'

type ActionDraft = {
  subject: string
  detail: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
}

const templateMeta: Record<
  ActionTemplateId,
  {
    label: string
    description: string
    defaults: ActionDraft
  }
> = {
  lead: {
    label: 'Lead follow-up',
    description: 'Use this for outreach, reply, or discovery follow-up.',
    defaults: {
      subject: '',
      detail: '',
      owner: 'Sales',
      priority: 'High',
      due: 'Today',
    },
  },
  ops: {
    label: 'Ops blocker',
    description: 'Use this for a daily issue, missed update, or owner handoff.',
    defaults: {
      subject: '',
      detail: '',
      owner: 'Operations',
      priority: 'Medium',
      due: 'This week',
    },
  },
  receiving: {
    label: 'Receiving issue',
    description: 'Use this for GRN, hold, batch, or quantity variance follow-up.',
    defaults: {
      subject: '',
      detail: '',
      owner: 'Procurement',
      priority: 'High',
      due: 'Today',
    },
  },
}

function buildTitle(template: ActionTemplateId, draft: ActionDraft) {
  const prefix = templateMeta[template].label
  const subject = draft.subject.trim()
  const detail = draft.detail.trim()
  if (detail) {
    return `${prefix}: ${subject} | ${detail}`
  }
  return `${prefix}: ${subject}`
}

export function PlatformPage() {
  const [template, setTemplate] = useState<ActionTemplateId>('lead')
  const [draft, setDraft] = useState<ActionDraft>(templateMeta.lead.defaults)
  const [bulkInput, setBulkInput] = useState('')
  const [actions, setActions] = useState(listBrowserWorkspaceActions())
  const [message, setMessage] = useState('')

  const summary = browserWorkspaceSummary(listBrowserWorkspaceLeads())
  const openActions = useMemo(() => actions.filter((action) => action.status === 'open'), [actions])

  function refresh(nextRows: BrowserWorkspaceTask[]) {
    setActions(nextRows)
  }

  function switchTemplate(nextTemplate: ActionTemplateId) {
    setTemplate(nextTemplate)
    setDraft(templateMeta[nextTemplate].defaults)
  }

  function saveAction() {
    if (!draft.subject.trim()) {
      setMessage('Enter the action first.')
      return
    }

    refresh(
      saveBrowserWorkspaceActions([
        {
          title: buildTitle(template, draft),
          owner: draft.owner,
          priority: draft.priority,
          due: draft.due,
        },
      ]),
    )
    setMessage(`Saved ${templateMeta[template].label.toLowerCase()} into the queue.`)
    setDraft(templateMeta[template].defaults)
  }

  function saveBulkActions() {
    const rows = buildActionBoard(bulkInput)
    if (!rows.length) {
      setMessage('Paste one update per line first.')
      return
    }
    refresh(
      saveBrowserWorkspaceActions(
        rows.map((row) => ({
          title: row.title,
          owner: row.owner,
          priority: row.priority,
          due: row.due,
        })),
      ),
    )
    setMessage(`Saved ${rows.length} action${rows.length === 1 ? '' : 's'} from the pasted list.`)
    setBulkInput('')
  }

  function seedFromLeads() {
    refresh(seedBrowserWorkspaceActionsFromLeads())
    setMessage('Created follow-up actions from saved leads.')
  }

  function markDone(actionId: string) {
    refresh(updateBrowserWorkspaceAction(actionId, { status: 'done' }))
  }

  function reopen(actionId: string) {
    refresh(updateBrowserWorkspaceAction(actionId, { status: 'open' }))
  }

  function remove(actionId: string) {
    refresh(removeBrowserWorkspaceAction(actionId))
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Action OS"
        title="Run one simple queue."
        description="Pick a template, save the action, and work the queue. No blank board needed."
      />

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Templates</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {(Object.keys(templateMeta) as ActionTemplateId[]).map((item) => (
              <button
                className={`sm-chip text-left ${template === item ? 'border-[rgba(37,208,255,0.28)] text-white' : 'text-[var(--sm-muted)]'}`}
                key={item}
                onClick={() => switchTemplate(item)}
                type="button"
              >
                <p className="font-semibold">{templateMeta[item].label}</p>
                <p className="mt-2 text-sm">{templateMeta[item].description}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              What needs to happen?
              <input
                className="sm-input"
                onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                placeholder="Supplier needs docs, send first outreach, check GRN variance..."
                value={draft.subject}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Extra detail
              <input
                className="sm-input"
                onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value }))}
                placeholder="Optional detail for the queue"
                value={draft.detail}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Owner
                <input className="sm-input" onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} value={draft.owner} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Priority
                <select
                  className="sm-input"
                  onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as ActionDraft['priority'] }))}
                  value={draft.priority}
                >
                  {['High', 'Medium', 'Low'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Due
                <select className="sm-input" onChange={(event) => setDraft((current) => ({ ...current, due: event.target.value }))} value={draft.due}>
                  {['Today', 'Tomorrow', 'This week', 'Next review'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" onClick={saveAction} type="button">
              Save action
            </button>
            <button className="sm-button-secondary" onClick={seedFromLeads} type="button">
              Pull in lead follow-ups
            </button>
            <Link className="sm-button-secondary" to="/workspace">
              Open workspace
            </Link>
          </div>

          <details className="sm-details mt-5">
            <summary>Paste multiple updates</summary>
            <div className="sm-details-content grid gap-4">
              <textarea
                className="sm-input min-h-36"
                onChange={(event) => setBulkInput(event.target.value)}
                placeholder="Paste one update per line."
                value={bulkInput}
              />
              <div>
                <button className="sm-button-secondary" onClick={saveBulkActions} type="button">
                  Save pasted list
                </button>
              </div>
            </div>
          </details>

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Open</p>
              <p className="mt-2 text-3xl font-bold">{summary.openActionCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Saved leads</p>
              <p className="mt-2 text-3xl font-bold">{summary.total}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Qualified</p>
              <p className="mt-2 text-3xl font-bold">{summary.qualifiedCount}</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {actions.length ? (
              actions.map((action) => (
                <div className="sm-proof-card" key={action.action_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{action.title}</p>
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
                    <button className="sm-button-secondary" onClick={() => remove(action.action_id)} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No actions yet. Save one from a template or pull actions from the saved lead workspace.</div>
            )}
          </div>

          {openActions.length ? (
            <div className="mt-5 sm-chip text-[var(--sm-muted)]">
              Start with the top open actions. Keep the queue short and close what is done.
            </div>
          ) : null}
        </article>
      </section>
    </div>
  )
}
