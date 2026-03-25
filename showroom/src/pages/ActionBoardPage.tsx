import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'
import { ACTION_SAMPLE_TEXT, buildActionBoard, type ActionRow } from '../lib/tooling'

type SaveResponse = {
  saved_count: number
  saved_at: string
}

export function ActionBoardPage() {
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<ActionRow[]>([])
  const [saved, setSaved] = useState<SaveResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function checkApi() {
      const result = await checkWorkspaceHealth()
      if (!cancelled) {
        setApiReady(result.ready)
      }
    }
    void checkApi()
    return () => {
      cancelled = true
    }
  }, [])

  const highCount = useMemo(() => rows.filter((row) => row.priority === 'High').length, [rows])

  async function runBoard(nextInput = input) {
    setBusy(true)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<{ rows: ActionRow[] }>('/api/tools/action-board', {
          method: 'POST',
          body: JSON.stringify({ raw_text: nextInput }),
        })
        setRows(payload.rows ?? [])
        return
      }

      setRows(buildActionBoard(nextInput))
    } finally {
      setBusy(false)
    }
  }

  async function saveBoard() {
    if (!apiReady || rows.length === 0) {
      return
    }
    setSaving(true)
    try {
      const payload = await workspaceFetch<SaveResponse>('/api/tools/action-board/save', {
        method: 'POST',
        body: JSON.stringify({
          rows: rows.map((row) => ({
            title: row.title,
            action: row.title,
            owner: row.owner,
            priority: row.priority.toLowerCase(),
            due: row.due,
            lane: row.priority === 'High' ? 'do_now' : row.priority === 'Medium' ? 'this_week' : 'watch',
            status: 'open',
          })),
        }),
      })
      setSaved(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free product"
        title="Action Board"
        description="Turn messy updates into owners, due windows, and a clean follow-up board. Then save the result back into the system."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Raw input</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Paste what the team actually sends.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is for the messy middle: meeting notes, forwarded updates, WhatsApp copy, or mixed operational scraps.
          </p>

          <div className="mt-6 grid gap-4">
            <textarea
              className="min-h-72 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4 text-sm font-normal text-white"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste raw team updates here."
              value={input}
            />

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => void runBoard()} type="button">
                {busy ? 'Building...' : 'Build board'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setInput(ACTION_SAMPLE_TEXT)
                  void runBoard(ACTION_SAMPLE_TEXT)
                }}
                type="button"
              >
                Load sample
              </button>
              <button className="sm-button-accent" disabled={!apiReady || rows.length === 0 || saving} onClick={() => void saveBoard()} type="button">
                {saving ? 'Saving...' : 'Save to workspace'}
              </button>
            </div>

            {saved ? <div className="sm-chip text-white">Saved {saved.saved_count} actions into the workspace at {saved.saved_at}.</div> : null}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Board output</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Owners, priority, due window.</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${rows.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {rows.length} actions
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
                <p className="mt-2 text-2xl font-bold">{rows.length}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">High priority</p>
                <p className="mt-2 text-2xl font-bold">{highCount}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Save-ready</p>
                <p className="mt-2 text-2xl font-bold">{apiReady ? 'Yes' : 'Local only'}</p>
              </div>
            </div>

            <div className="space-y-3">
              {rows.length === 0 ? (
                <div className="sm-chip text-[var(--sm-muted)]">Build the board to see owners and due windows.</div>
              ) : (
                rows.map((row) => (
                  <div className="sm-proof-card" key={`${row.title}-${row.owner}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner: {row.owner}</p>
                      </div>
                      <span className="sm-status-pill">{row.priority}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                        <p className="mt-2">{row.due}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
                        <p className="mt-2">Turn this into a real follow-up item and review it in the manager board.</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Use it for</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Daily operations review</div>
            <div className="sm-chip text-white">Plant management follow-up</div>
            <div className="sm-chip text-white">Director meeting clean-up</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Want the board to keep itself current?</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            That is where Action OS starts. The free tool proves the action logic. The deployable system keeps the board live from inboxes, files, and team updates.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-accent" to="/contact?package=Action%20OS">
              Use on my team
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See Action OS
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
