import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  checkWorkspaceHealth,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  loadCachedWorkspaceSession,
  listWorkspaceTasks,
  sessionHasCapability,
  updateWorkspaceTask,
  workspaceFetch,
  type WorkspaceCapability,
  type WorkspaceTaskRow,
} from '../lib/workspaceApi'
import { getTenantConfig } from '../lib/tenantConfig'
import { ACTION_SAMPLE_TEXT, buildActionBoard, hydrateActionRow, type ActionRow } from '../lib/tooling'
import { isYtfFactoryFacingTask, isYtfInternalOrBuildTask, summarizeYtfTaskNotes, ytfOwnerLabel, ytfStorageOwner } from '../lib/ytfUiFormat'

type SaveResponse = {
  saved_count: number
  saved_at: string
}

type ActionBoardPreset = {
  id: string
  label: string
  sample: string
}

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']
type PlantFilter = 'plant-a' | 'plant-b' | 'shared' | ''

const ACTION_WRITE_CAPABILITIES: WorkspaceCapability[] = [
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'receiving.view',
  'documents.view',
  'sales.view',
  'approvals.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
]
const ACTION_ALL_QUEUE_CAPABILITIES: WorkspaceCapability[] = [
  'operations.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
]
const CUSTOMER_SAMPLE_ACTIONS = [
  {
    issue: 'Curing press 07 repeated downtime',
    owner: 'Maintenance',
    due: 'Today',
    source: 'Shift log',
    nextStep: 'Attach the last repair note and assign one preventive action before handover.',
    priority: 'High',
    status: 'sample',
  },
  {
    issue: 'Supplier batch waiting for QC disposition',
    owner: 'QC + Stores',
    due: 'Today',
    source: 'Receiving note',
    nextStep: 'Compare COA, receiving variance, and QC result before release or return.',
    priority: 'Check',
    status: 'sample',
  },
  {
    issue: 'Daily production close needs output numbers',
    owner: 'Plant Manager',
    due: 'Close',
    source: 'Manager entry',
    nextStep: 'Add output, rejects, downtime, WIP, and handover notes so the day is visible.',
    priority: 'Normal',
    status: 'sample',
  },
]

function hasAnyCapability(session: SessionState | null | undefined, capabilities: WorkspaceCapability[]) {
  return capabilities.some((capability) => sessionHasCapability(session, capability))
}

function sessionLooksLikeYtfAction(session: SessionState | null | undefined) {
  const text = [session?.workspace_slug, session?.workspace_name, session?.username, session?.display_name, session?.role]
    .map((value) => String(value || '').toLowerCase())
    .join(' ')
  return text.includes('ytf') || text.includes('yangon') || text.includes('tyre')
}

const ACTION_BOARD_PRESETS: ActionBoardPreset[] = [
  {
    id: 'factory',
    label: 'Factory',
    sample: `Bead wire splice defect found on morning batch 24A | Quality Team | Today
Mixer SOP revision needs Shift B training note | Admin Team | This week
Curing press 07 downtime repeated twice this week | Maintenance Team | Today`,
  },
  {
    id: 'supplier',
    label: 'Supplier',
    sample: `Receiving variance on carbon black COA for inbound lot 5521 | Procurement Team | Today
Supplier COA packet is still missing for bead wire shipment | Procurement Team | Today
Inbound hold should stay active until GRN and variance note are complete | Stores Team | This week`,
  },
  {
    id: 'review',
    label: 'Daily close',
    sample: `Packing area follow-up needs one clear board update | Plant Manager | Friday
Weekly loss report needs one owner and daily note | Operations Team | Today
Forklift safety refresher is overdue for warehouse crew | HR Team | This week`,
  },
]

function formatSavedAt(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function priorityWeight(value?: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'critical') return 4
  if (normalized === 'high') return 3
  if (normalized === 'medium') return 2
  if (normalized === 'low') return 1
  return 0
}

function isOpenTask(row: WorkspaceTaskRow) {
  const normalized = String(row.status || '').trim().toLowerCase()
  return normalized !== 'done' && normalized !== 'closed' && normalized !== 'cancelled' && normalized !== 'resolved'
}

function taskMatchesRoleScope(task: WorkspaceTaskRow, session: SessionState | null | undefined) {
  if (!session) return false
  if (hasAnyCapability(session, ACTION_ALL_QUEUE_CAPABILITIES)) return true

  const haystack = `${task.title} ${task.template} ${task.notes} ${task.owner}`.toLowerCase()
  if (sessionHasCapability(session, 'maintenance.view')) return /maintenance|downtime|press|utility|repair|breakdown/.test(haystack)
  if (sessionHasCapability(session, 'dqms.view')) return /quality|audit|capa|defect|evidence|iso|qc|deviation/.test(haystack)
  if (sessionHasCapability(session, 'receiving.view')) return /receiving|supplier|inbound|grn|stores|procurement|coa|variance/.test(haystack)
  if (sessionHasCapability(session, 'sales.view')) return /sales|customer|quote|order|pipeline|revenue|lead/.test(haystack)

  const userScope = [session.username, session.display_name, session.role].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
  return userScope.some((scope) => haystack.includes(scope))
}

function normalizePlantFilter(value?: string | null): PlantFilter {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'plant-a' || normalized === 'a') return 'plant-a'
  if (normalized === 'plant-b' || normalized === 'b' || normalized === 'bilin') return 'plant-b'
  if (normalized === 'shared' || normalized === 'all' || normalized === 'ab' || normalized === 'a-b' || normalized === 'a+b') return 'shared'
  return ''
}

function taskMatchesPlantFilter(task: WorkspaceTaskRow, plant: PlantFilter) {
  if (!plant) return true

  const haystack = `${task.title} ${task.template} ${task.notes} ${task.owner}`.toLowerCase().replace(/_/g, '-')
  const hasPlantA = /plant[-\s]?a|shwe|yangon|spt|mixing|curing|tyre building|qc|utility/.test(haystack)
  const hasPlantB = /plant[-\s]?b|bilin|radial|motorcycle|mc|no\.?2|large machinery/.test(haystack)
  const hasShared = /shared|a\+b|a&b|company|ceo|director|supplier|sales|inventory|finance|procurement/.test(haystack)

  if (plant === 'plant-a') return hasPlantA || (!hasPlantB && !hasShared)
  if (plant === 'plant-b') return hasPlantB
  if (plant === 'shared') return hasShared || (hasPlantA && hasPlantB)
  return true
}

function plantFilterLabel(plant: PlantFilter) {
  if (plant === 'plant-a') return 'Plant A'
  if (plant === 'plant-b') return 'Plant B'
  if (plant === 'shared') return 'Shared A+B'
  return ''
}

function plantFilterFromSession(session: SessionState | null | undefined): PlantFilter {
  const role = String(session?.role || '').trim().toLowerCase()
  const text = [session?.workspace_slug, session?.workspace_name, session?.username, session?.display_name, role]
    .map((value) => String(value || '').toLowerCase().replace(/_/g, '-'))
    .join(' ')
  if (role === 'ceo' || role === 'director') return 'shared'
  if (text.includes('plant-b') || text.includes('bilin') || role === 'manager-plant-b') return 'plant-b'
  if (text.includes('plant-a') || text.includes('shwe') || role === 'manager-plant-a') return 'plant-a'
  return ''
}

function isManagerFacingYtfTask(task: WorkspaceTaskRow) {
  const haystack = `${task.title} ${task.template} ${task.notes} ${task.owner}`.toLowerCase().replace(/_/g, ' ')
  if (
    /\b(extract kpi|kpi candidate|changed data|changed source|source change|source record|structured source|structured record|review structured|workbook|file agent|agent runtime|governance update|setup gap|oauth|database|postgres|cron|sync plan|build knowledge|full refresh|shortcut evidence|shortcut-style|target files|promote stable|structured erp|showroom pc|data review|confirm owner|convert signal|open director|codex|deployment|vercel|browser smoke|release gate|source lane|schema drift|policy exception|knowledge graph|current modified time|classification)\b|promote .*structured|promote .*record/i.test(
      haystack,
    )
  ) {
    return false
  }
  return isYtfFactoryFacingTask(task)
}

function withTimeoutFallback<T>(promise: Promise<T>, fallback: T, timeoutMs = 3000) {
  return new Promise<T>((resolve) => {
    const timer = globalThis.setTimeout(() => resolve(fallback), timeoutMs)
    promise
      .then((value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        globalThis.clearTimeout(timer)
        resolve(fallback)
      })
  })
}

function compact(value?: string | null, max = 96) {
  const trimmed = String(value || '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function compactDateTime(value?: string | null) {
  if (!value) return 'Updated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function displayTaskStatus(value?: string | null) {
  const normalized = String(value || 'open').trim().toLowerCase()
  if (normalized === 'needs_proof' || normalized === 'needs_source' || normalized === 'in_progress') return 'follow up'
  if (normalized === 'done' || normalized === 'closed' || normalized === 'resolved') return 'done'
  return normalized.replace(/[_-]+/g, ' ')
}

function looksLikeStructuredDump(value?: string | null) {
  return /[{[]\s*"|classification_id|source_record_id|workspace_task|owner_hint|current_modified_time|source_ref_json/i.test(String(value || ''))
}

function cleanActionIssue(task: WorkspaceTaskRow, note: ReturnType<typeof summarizeYtfTaskNotes>) {
  const haystack = `${task.title} ${task.notes} ${task.template} ${note.source}`.toLowerCase()
  if (looksLikeStructuredDump(task.title) || looksLikeStructuredDump(task.notes)) return 'Team update'
  if (haystack.includes('supplier') && haystack.includes('gmail')) return 'Supplier email follow-up'
  if (haystack.includes('ceo-forwarded') || haystack.includes('ceo forwarded')) return 'CEO-forwarded email'
  return compact(task.title || note.summary, 72)
}

function cleanActionNextStep(task: WorkspaceTaskRow, note: ReturnType<typeof summarizeYtfTaskNotes>) {
  const haystack = `${task.title} ${task.notes} ${task.template} ${note.source}`.toLowerCase()
  if (looksLikeStructuredDump(task.title) || looksLikeStructuredDump(task.notes) || looksLikeStructuredDump(note.summary)) {
    return 'Pick the right team, add one clear update if needed, and close it when no work is needed.'
  }
  if (haystack.includes('supplier') && haystack.includes('gmail')) {
    return 'Put the email into the supplier lane and add the next follow-up if needed.'
  }
  if (haystack.includes('ceo-forwarded') || haystack.includes('ceo forwarded')) {
    return 'Turn the email into one clear work item or close it as information only.'
  }
  return compact(note.summary, 92)
}

function actionCardForTask(task: WorkspaceTaskRow) {
  const note = summarizeYtfTaskNotes(task.notes || task.template, task.title)
  return {
    issue: cleanActionIssue(task, note),
    owner: ytfOwnerLabel(task.owner),
    due: task.due || 'No due',
    source: compact(note.source.replace(/^Source:\s*/i, ''), 64),
    nextStep: cleanActionNextStep(task, note),
  }
}

export function ActionBoardPage() {
  const tenant = getTenantConfig()
  const [searchParams] = useSearchParams()
  const requestedPlantFilter = normalizePlantFilter(searchParams.get('plant'))
  const queueMode = searchParams.get('limit') === 'all' ? 'all' : 'compact'
  const cachedSessionPayload = useMemo(() => loadCachedWorkspaceSession(), [])
  const [apiReady, setApiReady] = useState(Boolean(cachedSessionPayload?.authenticated))
  const [session, setSession] = useState<SessionState | null>(cachedSessionPayload?.session ?? null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closingTaskId, setClosingTaskId] = useState('')
  const [followUpTaskId, setFollowUpTaskId] = useState('')
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<ActionRow[]>([])
  const [liveTasks, setLiveTasks] = useState<WorkspaceTaskRow[]>([])
  const [saved, setSaved] = useState<SaveResponse | null>(null)
  const [taskMessage, setTaskMessage] = useState('')

  async function reloadLiveTasks() {
    try {
      const payload = await listWorkspaceTasks('open', 80, { timeoutMs: 7000 })
      setLiveTasks(payload.rows ?? [])
      return true
    } catch {
      setLiveTasks([])
      return false
    }
  }

  useEffect(() => {
    let cancelled = false

    async function checkApi() {
      const [result, taskApiReady, sessionPayload] = await Promise.all([
        withTimeoutFallback(checkWorkspaceHealth(), { ready: false }, 2500),
        withTimeoutFallback(reloadLiveTasks(), false, 5000),
        withTimeoutFallback(getWorkspaceSession(), null, 2500),
      ])
      if (!cancelled) {
        setApiReady(Boolean(sessionPayload?.authenticated || cachedSessionPayload?.authenticated || result.ready || taskApiReady))
        setSession(sessionPayload?.session ?? cachedSessionPayload?.session ?? null)
      }
    }

    void checkApi()
    return () => {
      cancelled = true
    }
  }, [cachedSessionPayload?.authenticated, cachedSessionPayload?.session])

  const openTasks = useMemo(
    () =>
      liveTasks
        .filter(isOpenTask)
        .filter((task) => taskMatchesRoleScope(task, session))
        .filter((task) => taskMatchesPlantFilter(task, requestedPlantFilter || plantFilterFromSession(session)))
        .filter((task) => !isYtfInternalOrBuildTask(task))
        .filter(isManagerFacingYtfTask)
        .sort((left, right) => {
          const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority)
          if (priorityDelta !== 0) return priorityDelta
          return String(right.updated_at || right.created_at).localeCompare(String(left.updated_at || left.created_at))
        })
        .slice(0, 10),
    [liveTasks, requestedPlantFilter, session],
  )
  const liveHighCount = useMemo(() => openTasks.filter((row) => priorityWeight(row.priority) >= 3).length, [openTasks])
  const visibleOpenTasks = useMemo(() => (queueMode === 'all' ? openTasks : openTasks.slice(0, 5)), [openTasks, queueMode])
  const effectivePlantFilter = requestedPlantFilter || plantFilterFromSession(session)
  const compactQueueRoute = effectivePlantFilter ? `/app/action-board?plant=${effectivePlantFilter}` : '/app/action-board'
  const fullQueueRoute = effectivePlantFilter ? `/app/action-board?plant=${effectivePlantFilter}&limit=all` : '/app/action-board?limit=all'
  const hasLiveTaskData = openTasks.length > 0
  const highCount = useMemo(() => rows.filter((row) => row.priority === 'High').length, [rows])
  const deskCount = useMemo(() => new Set(rows.map((row) => row.desk)).size, [rows])
  const categoryBreakdown = useMemo(
    () =>
      Object.entries(
        rows.reduce<Record<string, number>>((accumulator, row) => {
          accumulator[row.category] = (accumulator[row.category] ?? 0) + 1
          return accumulator
        }, {}),
      ).sort((left, right) => right[1] - left[1]),
    [rows],
  )
  const roleLabel = getCapabilityProfileForRole(session?.role).label
  const isYtfTenant = tenant.key === 'ytf-plant-a' || sessionLooksLikeYtfAction(session)
  const canRouteIssues = sessionHasCapability(session, 'actions.view')
  const canWriteActions = hasAnyCapability(session, ACTION_WRITE_CAPABILITIES)
  const actionBoardIntro = isYtfTenant
    ? 'One practical work queue: owner, due, follow-up, done.'
    : 'Customer work only. Internal build tasks are hidden from product views.'
  const collaborationRows = useMemo(
    () =>
      openTasks.slice(0, 5).map((task) => {
        const note = summarizeYtfTaskNotes(task.notes || task.template, task.title)
        return {
          key: task.task_id,
          title: cleanActionIssue(task, note),
          message: compact(note.summary || 'Shared work update.', 88),
          owner: ytfOwnerLabel(task.owner),
          updatedAt: compactDateTime(task.updated_at || task.created_at),
        }
      }),
    [openTasks],
  )

  async function runBoard(nextInput = input) {
    if (!canRouteIssues) {
      setTaskMessage('Action routing requires workspace action access.')
      return
    }
    const trimmed = nextInput.trim()
    setSaved(null)

    if (!trimmed) {
      setRows([])
      return
    }

    setBusy(true)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<{ rows: ActionRow[] }>('/api/tools/action-board', {
          method: 'POST',
          body: JSON.stringify({ raw_text: trimmed }),
        })
        setRows((payload.rows ?? []).map((row) => hydrateActionRow(row)))
        return
      }

      setRows(buildActionBoard(trimmed))
    } finally {
      setBusy(false)
    }
  }

  async function saveBoard() {
    if (!canWriteActions) {
      setTaskMessage('Saving actions is limited to manager, plant, quality, receiving, maintenance, director, or admin roles.')
      return
    }
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
            action: `${row.nextStep} Route: ${row.desk}.`,
            owner: ytfStorageOwner(row.owner),
            priority: row.priority.toLowerCase(),
            due: row.due,
            lane: row.lane,
            status: 'open',
          })),
        }),
      })
      setSaved(payload)
      await reloadLiveTasks()
    } finally {
      setSaving(false)
    }
  }

  async function closeTask(task: WorkspaceTaskRow) {
    if (!canWriteActions) {
      setTaskMessage('Closing actions is limited to manager, plant, quality, receiving, maintenance, director, or admin roles.')
      return
    }
    setClosingTaskId(task.task_id)
    setTaskMessage('')
    try {
      await updateWorkspaceTask(task.task_id, { status: 'done' })
      await reloadLiveTasks()
      setTaskMessage('Closed one action.')
    } catch {
      setTaskMessage('Could not close this action. Refresh and try again.')
    } finally {
      setClosingTaskId('')
    }
  }

  async function markFollowUp(task: WorkspaceTaskRow) {
    if (!canWriteActions) {
      setTaskMessage('Follow-up requests are limited to manager, plant, quality, receiving, maintenance, director, or admin roles.')
      return
    }
    setFollowUpTaskId(task.task_id)
    setTaskMessage('')
    try {
      await updateWorkspaceTask(task.task_id, {
        status: 'in_progress',
        notes: `${task.notes || task.template || ''}\nFollow-up: add the daily update, board photo, or owner note before finishing.`.trim(),
      })
      await reloadLiveTasks()
      setTaskMessage('Marked one item for follow-up.')
    } catch {
      setTaskMessage('Could not mark follow-up. Refresh and try again.')
    } finally {
      setFollowUpTaskId('')
    }
  }

  function applyPreset(preset: ActionBoardPreset) {
    setInput(preset.sample)
    void runBoard(preset.sample)
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Work</p>
          <h1>Team board</h1>
          <p>{actionBoardIntro}</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{apiReady || hasLiveTaskData ? 'Ready' : 'Offline'}</span>
          <span>{openTasks.length} open</span>
          <span>{liveHighCount} high</span>
          {effectivePlantFilter ? <span>{plantFilterLabel(effectivePlantFilter)}</span> : null}
          <span>{roleLabel}</span>
        </div>
      </section>

      <section className="sm-ytf-split">
        <details className="sm-ytf-panel sm-ytf-details" style={{ order: 2 }}>
          <summary>Share team update</summary>
          <div>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Input</p>
              <h2>Route one note</h2>
            </div>
            <span className="sm-status-pill">issue | team | due</span>
          </div>

          <textarea
            className="sm-ytf-textarea"
            onChange={(event) => {
              setInput(event.target.value)
              setSaved(null)
            }}
            placeholder="Curing press 07 repeated downtime | Maintenance team | Today"
            rows={3}
            value={input}
          />

          <div className="sm-ytf-button-row">
            <button className="sm-button-primary" disabled={!canRouteIssues} onClick={() => void runBoard()} type="button">
              {busy ? 'Adding...' : 'Add to board'}
            </button>
            <button className="sm-button-accent" disabled={!apiReady || rows.length === 0 || saving || !canWriteActions} onClick={() => void saveBoard()} type="button">
              {saving ? 'Saving...' : 'Save work'}
            </button>
            <button
              className="sm-button-secondary"
              onClick={() => {
                setInput(ACTION_SAMPLE_TEXT)
                void runBoard(ACTION_SAMPLE_TEXT)
              }}
              type="button"
            >
              Example
            </button>
            <button
              className="sm-button-secondary"
              onClick={() => {
                setInput('')
                setRows([])
                setSaved(null)
              }}
              type="button"
            >
              Clear
            </button>
          </div>

          <details className="sm-ytf-inline-details">
            <summary>More examples</summary>
            <div className="sm-ytf-sample-row">
            {ACTION_BOARD_PRESETS.map((preset) => (
              <button disabled={!canRouteIssues} key={preset.id} onClick={() => applyPreset(preset)} type="button">
                {preset.label}
              </button>
            ))}
            </div>
          </details>

          {saved ? <div className="sm-ytf-alert">Saved {saved.saved_count} actions at {formatSavedAt(saved.saved_at)}.</div> : null}
          </div>
        </details>

        <article className="sm-ytf-panel" style={{ order: 1 }}>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Board</p>
              <h2>Today&apos;s team work</h2>
            </div>
            <Link className="sm-link" to={queueMode === 'all' ? compactQueueRoute : fullQueueRoute}>
              {queueMode === 'all' ? 'Compact' : 'More'}
            </Link>
          </div>

          <section className="sm-ytf-metric-strip is-compact">
            <article>
              <span>Open</span>
              <strong>{openTasks.length}</strong>
            </article>
            <article>
              <span>High</span>
              <strong>{liveHighCount}</strong>
            </article>
            <article>
            <span>Follow-up</span>
              <strong>{openTasks.filter((task) => ['needs_proof', 'needs_source', 'in_progress'].includes(String(task.status || '').toLowerCase())).length}</strong>
            </article>
          </section>

          <div className="sm-ytf-action-list">
            {openTasks.length ? (
              visibleOpenTasks.map((task) => {
                const card = actionCardForTask(task)
                return (
                  <article className="sm-ytf-action-row" key={task.task_id}>
                    <div className="sm-ytf-action-main">
                      <div className="sm-ytf-row-title">
                        <strong>{card.issue}</strong>
                        <span>{task.priority || 'Normal'}</span>
                      </div>
                      <p>{card.nextStep}</p>
                    </div>
                    <div className="sm-ytf-action-meta">
                      <span>{card.owner}</span>
                      <span>{card.due}</span>
                      <em>{displayTaskStatus(task.status)}</em>
                      <button className="sm-button-secondary" disabled={followUpTaskId === task.task_id || !canWriteActions} onClick={() => void markFollowUp(task)} type="button">
                    {followUpTaskId === task.task_id ? 'Saving...' : 'Follow up'}
                      </button>
                      <button className="sm-button-secondary" disabled={closingTaskId === task.task_id || !canWriteActions} onClick={() => void closeTask(task)} type="button">
                        {closingTaskId === task.task_id ? 'Closing...' : 'Done'}
                      </button>
                    </div>
                  </article>
                )
              })
            ) : !isYtfTenant ? (
              CUSTOMER_SAMPLE_ACTIONS.map((card) => (
                <article className="sm-ytf-action-row" key={card.issue}>
                  <div className="sm-ytf-action-main">
                    <div className="sm-ytf-row-title">
                      <strong>{card.issue}</strong>
                      <span>{card.priority}</span>
                    </div>
                    <p>{card.nextStep}</p>
                  </div>
                  <div className="sm-ytf-action-meta">
                    <span>{card.owner}</span>
                    <span>{card.due}</span>
                    <em>{card.status}</em>
                  </div>
                </article>
              ))
            ) : (
              <p className="sm-ytf-empty">No open work for this role yet. Use Entry for daily routine, abnormal condition, 5S, or board photo.</p>
            )}
          </div>
          {taskMessage ? <p className="sm-ytf-alert">{taskMessage}</p> : null}
        </article>

        <article className="sm-ytf-panel" style={{ order: 3 }}>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Collaboration</p>
              <h2>Latest team updates</h2>
            </div>
            <Link className="sm-link" to={compactQueueRoute}>
              Open
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {collaborationRows.length ? (
              collaborationRows.map((row) => (
                <Link className="sm-ytf-list-row" key={row.key} to={compactQueueRoute}>
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.message}</small>
                    <small>{row.owner}</small>
                  </span>
                  <em>{row.updatedAt}</em>
                </Link>
              ))
            ) : (
              <p className="sm-ytf-empty">No collaboration updates yet. Use Entry or add one note above.</p>
            )}
          </div>
        </article>
      </section>

      <details className="sm-ytf-panel sm-ytf-details" hidden={rows.length === 0}>
        <summary>Drafts ready: {rows.length}</summary>
        <div>
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Routed work</p>
            <h2>Drafts before saving</h2>
          </div>
          <div className="sm-ytf-chip-line">
            {categoryBreakdown.length ? (
              categoryBreakdown.map(([label, count]) => (
                <span className="sm-status-pill" key={label}>
                  {label}: {count}
                </span>
              ))
            ) : (
              <span className="sm-status-pill">No drafts</span>
            )}
            {deskCount ? <span className="sm-status-pill">{deskCount} desks</span> : null}
            {highCount ? <span className="sm-status-pill">{highCount} high priority</span> : null}
          </div>
        </div>

        <div className="sm-ytf-action-list">
          {rows.length === 0 ? (
            <div className="sm-ytf-empty">Paste updates only when you need to convert rough notes into clean actions.</div>
          ) : (
            rows.map((row, index) => (
              <article className="sm-ytf-action-row" key={`${row.title}-${row.owner}-${index}`}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{row.title}</strong>
                    <span>{row.priority}</span>
                  </div>
                  <p>{row.nextStep}</p>
                  <small>{row.evidenceHint}</small>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>{ytfOwnerLabel(row.owner)}</span>
                  <span>{row.due}</span>
                  <Link to={row.deskRoute}>{row.desk}</Link>
                  <em>{row.category || row.lane}</em>
                </div>
              </article>
            ))
          )}
        </div>
        </div>
      </details>
    </div>
  )
}
