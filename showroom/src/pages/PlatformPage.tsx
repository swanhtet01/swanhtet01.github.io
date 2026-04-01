import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  browserWorkspaceSummary,
  listBrowserWorkspaceActions,
  removeBrowserWorkspaceAction,
  saveBrowserWorkspaceActions,
  seedBrowserWorkspaceActionsFromLeads,
  type BrowserWorkspaceTask,
  updateBrowserWorkspaceAction,
} from '../lib/browserWorkspace'
import { ACTION_SAMPLE_TEXT, buildActionBoard } from '../lib/tooling'

export function PlatformPage() {
  const [input, setInput] = useState('')
  const [actions, setActions] = useState(listBrowserWorkspaceActions())
  const [message, setMessage] = useState('')
  const summary = browserWorkspaceSummary()

  const openActions = actions.filter((action) => action.status === 'open')

  function refresh(nextRows: BrowserWorkspaceTask[]) {
    setActions(nextRows)
  }

  function buildBoard(rawText = input) {
    const rows = buildActionBoard(rawText)
    if (!rows.length) {
      setMessage('Paste a few updates first.')
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
    setMessage(`Saved ${rows.length} action${rows.length === 1 ? '' : 's'} into Action OS.`)
  }

  function seedFromLeads() {
    const nextRows = seedBrowserWorkspaceActionsFromLeads()
    refresh(nextRows)
    setMessage('Created follow-up actions from the saved lead workspace.')
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
        title="One board for the work."
        description="Capture follow-up, blockers, and next actions in one real board on this device."
      />

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Quick capture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Turn messy updates into actions.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Paste meeting notes, ops updates, or sales follow-up. Action OS turns them into one live board.</p>

          <textarea
            className="sm-input mt-5 min-h-56"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a few updates here."
            value={input}
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" onClick={() => buildBoard()} type="button">
              Add to board
            </button>
            <button
              className="sm-button-secondary"
              onClick={() => {
                setInput(ACTION_SAMPLE_TEXT)
                buildBoard(ACTION_SAMPLE_TEXT)
              }}
              type="button"
            >
              Load sample
            </button>
            <button className="sm-button-secondary" onClick={seedFromLeads} type="button">
              Add lead follow-ups
            </button>
          </div>

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
              <p className="mt-2 text-3xl font-bold">{summary.openActionCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Total actions</p>
              <p className="mt-2 text-3xl font-bold">{summary.actionCount}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved leads</p>
              <p className="mt-2 text-3xl font-bold">{summary.total}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Qualified</p>
              <p className="mt-2 text-3xl font-bold">{summary.qualifiedCount}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {openActions.length ? (
              openActions.slice(0, 8).map((action) => (
                <div className="sm-proof-card" key={action.action_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{action.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {action.owner} · {action.due} · {action.source === 'lead' ? 'Lead follow-up' : 'Manual action'}
                      </p>
                    </div>
                    <span className="sm-status-pill">{action.priority}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" onClick={() => markDone(action.action_id)} type="button">
                      Mark done
                    </button>
                    <button className="sm-button-secondary" onClick={() => remove(action.action_id)} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No actions yet. Add a few updates or seed the board from Lead Finder.</div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What this does</p>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-white">One board for follow-up</div>
            <div className="sm-chip text-white">One place for owners and due windows</div>
            <div className="sm-chip text-white">One working layer above your lead shortlist</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use the public product flow.</h2>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-white">1. Find leads</div>
            <div className="sm-chip text-white">2. Save them into the workspace</div>
            <div className="sm-chip text-white">3. Run follow-up in Action OS</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/lead-finder">
              Open Lead Finder
            </Link>
            <Link className="sm-button-secondary" to="/workspace">
              Open workspace
            </Link>
          </div>
        </article>
      </section>

      {actions.some((action) => action.status === 'done') ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Completed</p>
          <div className="mt-5 space-y-3">
            {actions
              .filter((action) => action.status === 'done')
              .slice(0, 6)
              .map((action) => (
                <div className="sm-proof-card" key={action.action_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{action.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{action.owner}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <span className="sm-status-pill">Done</span>
                      <button className="sm-button-secondary" onClick={() => reopen(action.action_id)} type="button">
                        Reopen
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
