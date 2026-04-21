import { startTransition, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadPilotCommandDataset, savePilotFeedback, type PilotCommandDataset, type PilotScenario } from '../lib/pilotCommandApi'
import { getTenantConfig } from '../lib/tenantConfig'
import { createWorkspaceTasks } from '../lib/workspaceApi'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const pilotCapabilities = [
  'actions.view',
  'sales.view',
  'receiving.view',
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'approvals.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function toneForStatus(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'healthy' || normalized === 'ready' || normalized === 'live') {
    return 'text-emerald-300'
  }
  if (normalized === 'warning' || normalized === 'mapped' || normalized === 'review') {
    return 'text-amber-300'
  }
  if (normalized === 'degraded' || normalized === 'needs wiring' || normalized === 'open') {
    return 'text-rose-300'
  }
  return 'text-white/80'
}

function formatLabel(value: string) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function dueDateFromNow(days: number) {
  const next = new Date()
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function buildFeedbackDraft(scenario?: PilotScenario | null) {
  return {
    surface: scenario?.route ?? '/app/operations',
    category: 'bug',
    priority: scenario?.priority ?? 'medium',
    note: scenario?.noteStarter ?? '',
    createTask: true,
    taskOwner: scenario?.suggestedOwner ?? 'manager',
    taskDue: dueDateFromNow(scenario?.priority === 'high' ? 1 : 3),
  }
}

export function PilotCommandPage() {
  const tenant = getTenantConfig()
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [dataset, setDataset] = useState<PilotCommandDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingTasks, setCreatingTasks] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [feedbackForm, setFeedbackForm] = useState(() => buildFeedbackDraft())

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...pilotCapabilities],
        unauthenticatedMessage: 'Login is required to open Pilot Command.',
        previewMessage: 'Pilot Command only runs inside the authenticated workspace.',
      })

      if (cancelled) {
        return
      }

      setAccess(nextAccess)
      if (!nextAccess.authenticated || !nextAccess.allowed) {
        setLoading(false)
        return
      }

      try {
        const nextDataset = await loadPilotCommandDataset()
        if (!cancelled) {
          setDataset(nextDataset)
          const initialScenario = nextDataset.scenarios[0]
          setSelectedScenarioId(initialScenario?.id ?? '')
          setFeedbackForm(buildFeedbackDraft(initialScenario))
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Pilot Command could not be loaded.')
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
  }, [])

  const selectedScenario = useMemo(
    () => dataset?.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? dataset?.scenarios[0] ?? null,
    [dataset?.scenarios, selectedScenarioId],
  )

  async function refreshPilotDataset() {
    setRefreshing(true)
    setMessage(null)
    setError(null)
    try {
      const nextDataset = await loadPilotCommandDataset()
      startTransition(() => {
        setDataset(nextDataset)
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Pilot Command could not refresh.')
    } finally {
      setRefreshing(false)
    }
  }

  function applyScenarioToForm(scenario: PilotScenario) {
    setSelectedScenarioId(scenario.id)
    setFeedbackForm((current) => ({
      ...current,
      ...buildFeedbackDraft(scenario),
    }))
    setMessage(null)
    setError(null)
  }

  async function handleSaveFeedback() {
    if (!feedbackForm.note.trim()) {
      setError('Write what you tried and what broke before saving the note.')
      return
    }

    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const result = await savePilotFeedback(feedbackForm)
      await refreshPilotDataset()
      setMessage(
        feedbackForm.createTask
          ? `${result.feedbackMessage} Follow-up task created for ${feedbackForm.taskOwner || 'manager'}.`
          : result.feedbackMessage,
      )
      setFeedbackForm(buildFeedbackDraft(selectedScenario))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The pilot note could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreatePilotTasks() {
    if (!dataset) {
      return
    }

    const rows = dataset.scenarios.slice(0, 4).map((scenario) => ({
      title: `Pilot test ${scenario.home}`,
      owner: scenario.suggestedOwner || scenario.role,
      priority: scenario.priority,
      due: dueDateFromNow(scenario.priority === 'high' ? 1 : 3),
      status: 'open',
      template: 'pilot_command_walkthrough',
      notes: `[pilot_command]\nRoute: ${scenario.route}\nObjective: ${scenario.objective}\nWatch for: ${scenario.watchFor.join(' / ')}\nQueue signal: ${scenario.queueSignal}`,
    }))

    if (!rows.length) {
      setMessage('No pilot scenarios are available to convert into tasks right now.')
      return
    }

    setCreatingTasks(true)
    setMessage(null)
    setError(null)
    try {
      const payload = await createWorkspaceTasks(rows)
      setMessage(`Created ${payload.saved_count ?? rows.length} guided pilot task${(payload.saved_count ?? rows.length) === 1 ? '' : 's'}.`)
      await refreshPilotDataset()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Guided pilot tasks could not be created.')
    } finally {
      setCreatingTasks(false)
    }
  }

  if (loading || access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Pilot command"
          title="Loading the live usage and bug loop."
          description="Checking staff routes, pilot scenarios, bug backlog, and follow-up tasks."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Pilot command"
          title="Authenticated workspace required."
          description="Pilot Command saves bugs and follow-up work into the live workspace, so it only runs inside the authenticated portal."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Login is required to open Pilot Command.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/pilot">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Open products
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed || !dataset) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Pilot command"
          title="Pilot Command is unavailable."
          description="This desk needs a role that can access the live operating lanes and save workspace feedback."
        />
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error ?? access.error ?? 'No pilot dataset returned.'}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Pilot command"
        title={`Use ${tenant.tenantName || tenant.defaultCompany || tenant.brandName} live, record what breaks, and turn it into tracked work.`}
        description="This is the operator program for ytf.supermega.dev: it tells staff what to test, where to test it, how to describe friction, and how to convert bugs into follow-up tasks."
      />

      <section className="grid gap-4 md:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Readiness</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.readinessScore}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Combined adoption, workforce, bug backlog, and connector attention.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Scenarios</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.scenarioCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{dataset.summary.attentionScenarioCount} currently need closer review.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Open bugs</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.openBugCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{dataset.summary.highPriorityBugCount} are high priority.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Follow-up tasks</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.followUpTaskCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Pilot tasks already linked to the workspace backlog.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Connector attention</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.summary.connectorAttentionCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">External data lanes still needing closer monitoring.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Last refresh</p>
          <p className="mt-3 text-xl font-bold text-white">{formatDateTime(dataset.updatedAt)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{dataset.source === 'live' ? 'Reading live workspace state.' : 'Using fallback model state.'}</p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-semibold">{dataset.guidance.headline}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Updated {formatDateTime(dataset.updatedAt)}. Use the scenario cards below, then log friction from the same desk so it becomes evidence and work.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={refreshing} onClick={() => void refreshPilotDataset()} type="button">
              {refreshing ? 'Refreshing…' : 'Run live check'}
            </button>
            <button className="sm-button-secondary" disabled={creatingTasks} onClick={() => void handleCreatePilotTasks()} type="button">
              {creatingTasks ? 'Creating tasks…' : 'Create guided pilot tasks'}
            </button>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Adoption
            </Link>
            <Link className="sm-button-secondary" to="/app/workforce">
              Workforce
            </Link>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How to use it</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The desk tells people what to try and how to report friction.</h2>
          <div className="mt-6 grid gap-3">
            {dataset.guidance.steps.map((step, index) => (
              <article className="sm-proof-card" key={step}>
                <p className="text-sm font-semibold text-white">Step {index + 1}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{step}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {dataset.guidance.evidenceRules.map((rule) => (
              <p className="text-sm text-white/80" key={rule}>
                {rule}
              </p>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Scenario list</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Start with the lane that is most likely to fail or confuse people.</h2>
          <div className="mt-6 grid gap-4">
            {dataset.scenarios.map((scenario) => (
              <article className="sm-proof-card" key={scenario.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{scenario.title}</p>
                    <p className={`mt-2 text-sm font-semibold ${toneForStatus(scenario.status)}`}>{scenario.status}</p>
                  </div>
                  <Link className="sm-status-pill" to={scenario.route}>
                    Open lane
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">{scenario.objective}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{scenario.whyNow}</p>
                <p className="mt-3 text-sm text-white/80">Must capture: {scenario.mustCapture.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Useful outputs: {scenario.usefulOutputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Queue signal: {scenario.queueSignal}</p>
                <p className="mt-2 text-sm text-white/80">Watch for: {scenario.watchFor.join(' / ') || 'No extra warnings recorded.'}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="sm-button-secondary" onClick={() => applyScenarioToForm(scenario)} type="button">
                    Report issue from this lane
                  </button>
                  <span className="sm-status-pill">{formatLabel(scenario.priority)} priority</span>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Bug and friction capture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Record the exact problem while the staff member still has the context.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/80">
              <span>Surface or route</span>
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
                onChange={(event) => setFeedbackForm((current) => ({ ...current, surface: event.target.value }))}
                value={feedbackForm.surface}
              />
            </label>
            <label className="grid gap-2 text-sm text-white/80">
              <span>Category</span>
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
                onChange={(event) => setFeedbackForm((current) => ({ ...current, category: event.target.value }))}
                value={feedbackForm.category}
              >
                <option value="bug">Bug</option>
                <option value="workflow">Workflow friction</option>
                <option value="data-quality">Data quality</option>
                <option value="training">Training gap</option>
                <option value="idea">Improvement idea</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-white/80">
              <span>Priority</span>
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
                onChange={(event) => setFeedbackForm((current) => ({ ...current, priority: event.target.value }))}
                value={feedbackForm.priority}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-white/80">
              <span>Follow-up owner</span>
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
                onChange={(event) => setFeedbackForm((current) => ({ ...current, taskOwner: event.target.value }))}
                value={feedbackForm.taskOwner}
              />
            </label>
          </div>
          <label className="mt-4 grid gap-2 text-sm text-white/80">
            <span>What happened</span>
            <textarea
              className="min-h-[220px] rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm leading-relaxed text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
              onChange={(event) => setFeedbackForm((current) => ({ ...current, note: event.target.value }))}
              value={feedbackForm.note}
            />
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-[auto_auto_1fr] md:items-center">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                checked={feedbackForm.createTask}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, createTask: event.target.checked }))}
                type="checkbox"
              />
              <span>Create follow-up task</span>
            </label>
            <label className="grid gap-2 text-sm text-white/80">
              <span>Task due</span>
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-[rgba(37,208,255,0.4)]"
                onChange={(event) => setFeedbackForm((current) => ({ ...current, taskDue: event.target.value }))}
                type="date"
                value={feedbackForm.taskDue}
              />
            </label>
            <div className="flex justify-start md:justify-end">
              <button className="sm-button-primary" disabled={saving} onClick={() => void handleSaveFeedback()} type="button">
                {saving ? 'Saving…' : 'Save pilot note'}
              </button>
            </div>
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Selected scenario</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{selectedScenario?.title ?? 'Choose a scenario'}</h2>
          {selectedScenario ? (
            <div className="mt-6 grid gap-4">
              <article className="sm-proof-card">
                <p className="text-sm font-semibold text-white">Objective</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{selectedScenario.objective}</p>
              </article>
              <article className="sm-proof-card">
                <p className="text-sm font-semibold text-white">Why this lane now</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{selectedScenario.whyNow}</p>
              </article>
              <article className="sm-proof-card">
                <p className="text-sm font-semibold text-white">What to watch</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{selectedScenario.watchFor.join(' / ') || 'No extra warnings recorded.'}</p>
              </article>
              <article className="sm-proof-card">
                <p className="text-sm font-semibold text-white">Suggested owner</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{selectedScenario.suggestedOwner}</p>
              </article>
            </div>
          ) : (
            <p className="mt-6 text-sm text-[var(--sm-muted)]">Select a scenario from the list to prefill the bug report with the right route and context.</p>
          )}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="sm-surface p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Recent pilot notes</p>
              <h2 className="mt-3 text-3xl font-bold text-white">What users already reported.</h2>
            </div>
            <span className="sm-status-pill">{dataset.feedbackRows.length} notes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {dataset.feedbackRows.length ? (
              dataset.feedbackRows.map((row) => (
                <article className="sm-proof-card" key={row.feedbackId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.surface}</p>
                      <p className={`mt-2 text-sm font-semibold ${toneForStatus(row.status)}`}>{formatLabel(row.status)}</p>
                    </div>
                    <span className="sm-status-pill">
                      {formatLabel(row.priority)} {formatLabel(row.category)}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)] whitespace-pre-wrap">{row.note}</p>
                  <p className="mt-3 text-xs text-white/60">{formatDateTime(row.createdAt)}</p>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="text-sm text-[var(--sm-muted)]">No pilot notes have been saved yet. Use the form above during live testing.</p>
              </article>
            )}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Follow-up tasks and next moves</p>
              <h2 className="mt-3 text-3xl font-bold text-white">The bug loop should end in owned work.</h2>
            </div>
            <span className="sm-status-pill">{dataset.followUpTasks.length} tasks</span>
          </div>
          <div className="mt-6 grid gap-4">
            {dataset.followUpTasks.length ? (
              dataset.followUpTasks.map((task) => (
                <article className="sm-proof-card" key={task.taskId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{task.title}</p>
                      <p className={`mt-2 text-sm font-semibold ${toneForStatus(task.status)}`}>{formatLabel(task.status)}</p>
                    </div>
                    <span className="sm-status-pill">{formatLabel(task.priority)}</span>
                  </div>
                  <p className="mt-4 text-sm text-white/80">Owner: {task.owner || 'Unassigned'}</p>
                  <p className="mt-2 text-sm text-white/80">Due: {task.due || 'No due date set'}</p>
                  <p className="mt-2 text-xs text-white/60">Updated {formatDateTime(task.updatedAt)}</p>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="text-sm text-[var(--sm-muted)]">No pilot follow-up tasks yet. Save a pilot note with task creation enabled or create guided pilot tasks.</p>
              </article>
            )}
          </div>
          <div className="mt-6 grid gap-3">
            {dataset.nextMoves.map((move) => (
              <p className="text-sm text-white/80" key={move}>
                {move}
              </p>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
