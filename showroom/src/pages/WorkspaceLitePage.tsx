import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  browserWorkspaceSummary,
  buildBrowserOutreach,
  exportBrowserWorkspaceLeads,
  listBrowserWorkspaceActions,
  listBrowserWorkspaceLeads,
  removeBrowserWorkspaceAction,
  removeBrowserWorkspaceLead,
  saveBrowserWorkspaceActions,
  seedBrowserWorkspaceActionsFromLeads,
  updateBrowserWorkspaceAction,
  updateBrowserWorkspaceLead,
  type BrowserWorkspaceLead,
  type BrowserWorkspaceStage,
  type BrowserWorkspaceTask,
} from '../lib/browserWorkspace'
import {
  bootstrapPublicWorkspace,
  createWorkspaceTasks,
  getWorkspaceSession,
  hasLiveWorkspaceApi,
  importLeadPipeline,
  listWorkspaceLeadPipeline,
  listWorkspaceTasks,
  removeWorkspaceTask,
  updateWorkspaceLeadPipeline,
  updateWorkspaceTask,
  type WorkspaceLeadRow,
  type WorkspaceTaskRow,
} from '../lib/workspaceApi'
import { downloadLeadCsv, type LeadRow } from '../lib/tooling'

type WorkspaceView = 'leads' | 'queue'
type WorkspaceMode = 'local' | 'shared'
type QueueTemplateId = 'lead_follow_up' | 'ops_blocker' | 'receiving_issue'

type WorkspaceLeadItem = {
  id: string
  name: string
  email: string
  phone: string
  website: string
  sourceUrl: string
  stage: string
  notes: string
  outreachSubject: string
  outreachMessage: string
  score: number
  provider: string
}

type WorkspaceTaskItem = {
  id: string
  leadId: string
  title: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
  status: 'open' | 'done'
  notes: string
}

const localStageOptions: BrowserWorkspaceStage[] = ['new', 'outreach', 'contacted', 'qualified']
const sharedStageOptions = ['offer_ready', 'contacted', 'discovery', 'qualified']
const publicQueueTemplates: QueueTemplateId[] = ['lead_follow_up']
const localStageLabels: Record<BrowserWorkspaceStage, string> = {
  new: 'saved',
  outreach: 'outreach sent',
  contacted: 'reply or discovery',
  qualified: 'qualified',
}
const sharedStageLabels: Record<string, string> = {
  offer_ready: 'saved',
  contacted: 'outreach sent',
  discovery: 'reply or discovery',
  qualified: 'qualified',
}

const queueTemplates: Record<
  QueueTemplateId,
  {
    label: string
    description: string
    owner: string
    priority: 'High' | 'Medium' | 'Low'
    due: string
    placeholder: string
  }
> = {
  lead_follow_up: {
    label: 'Lead follow-up',
    description: 'For first outreach, reply chase, or booking follow-up.',
    owner: 'Sales',
    priority: 'High',
    due: 'Today',
    placeholder: 'Send first note to Emerald Spa and follow up tomorrow',
  },
  ops_blocker: {
    label: 'Ops blocker',
    description: 'For a daily issue, owner gap, or missed update.',
    owner: 'Operations',
    priority: 'Medium',
    due: 'Today',
    placeholder: 'Chase missing production update from Line 2',
  },
  receiving_issue: {
    label: 'Receiving issue',
    description: 'For GRN, hold, batch, or quantity variance follow-up.',
    owner: 'Procurement',
    priority: 'High',
    due: 'Today',
    placeholder: 'Check variance on inbound compound batch',
  },
}

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === 'queue' || value === 'leads'
}

function viewHref(view: WorkspaceView) {
  return `/workspace?view=${view}`
}

function normalizeBrowserLead(row: BrowserWorkspaceLead): WorkspaceLeadItem {
  return {
    id: row.lead_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    sourceUrl: row.source_url,
    stage: row.stage,
    notes: row.notes,
    outreachSubject: row.outreach_subject,
    outreachMessage: row.outreach_message,
    score: row.score,
    provider: row.provider,
  }
}

function normalizeSharedLead(row: WorkspaceLeadRow): WorkspaceLeadItem {
  return {
    id: row.lead_id,
    name: row.company_name,
    email: row.contact_email,
    phone: row.contact_phone,
    website: row.website,
    sourceUrl: row.source_url,
    stage: row.stage,
    notes: row.notes,
    outreachSubject: row.outreach_subject,
    outreachMessage: row.outreach_message,
    score: row.score,
    provider: row.provider,
  }
}

function normalizeBrowserTask(row: BrowserWorkspaceTask): WorkspaceTaskItem {
  return {
    id: row.action_id,
    leadId: row.lead_id,
    title: row.title,
    owner: row.owner,
    priority: row.priority,
    due: row.due,
    status: row.status,
    notes: '',
  }
}

function normalizeSharedTask(row: WorkspaceTaskRow): WorkspaceTaskItem {
  return {
    id: row.task_id,
    leadId: row.lead_id,
    title: row.title,
    owner: row.owner,
    priority: (row.priority as 'High' | 'Medium' | 'Low') || 'Medium',
    due: row.due,
    status: (row.status as 'open' | 'done') || 'open',
    notes: row.notes,
  }
}

function nextActionForLead(lead: WorkspaceLeadItem) {
  if (lead.stage === 'new' || lead.stage === 'offer_ready') {
    return lead.email || lead.phone || lead.website ? 'Send first outreach' : 'Find a direct contact'
  }
  if (lead.stage === 'outreach' || lead.stage === 'contacted') {
    return 'Follow up and log the reply'
  }
  if (lead.stage === 'discovery') {
    return 'Run discovery and qualify the lead'
  }
  return 'Keep warm and hand it off'
}

function toCsvRow(lead: WorkspaceLeadItem): LeadRow {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    source: lead.provider || 'Workspace',
    source_url: lead.sourceUrl,
    snippet: '',
    social_profiles: [],
    fit_reasons: [],
    provider: lead.provider || 'Workspace',
    score: lead.score,
  }
}

function toSharedStage(stage: string) {
  if (stage === 'outreach') {
    return 'contacted'
  }
  if (stage === 'contacted') {
    return 'discovery'
  }
  if (stage === 'qualified') {
    return 'qualified'
  }
  return 'offer_ready'
}

export function WorkspaceLitePage() {
  const location = useLocation()
  const [mode, setMode] = useState<WorkspaceMode>('local')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState('')
  const [leads, setLeads] = useState<WorkspaceLeadItem[]>([])
  const [tasks, setTasks] = useState<WorkspaceTaskItem[]>([])
  const [queueTemplate, setQueueTemplate] = useState<QueueTemplateId>('lead_follow_up')
  const [queueTitle, setQueueTitle] = useState('')
  const [queueOwner, setQueueOwner] = useState(queueTemplates.lead_follow_up.owner)
  const [queuePriority, setQueuePriority] = useState<'High' | 'Medium' | 'Low'>(queueTemplates.lead_follow_up.priority)
  const [queueDue, setQueueDue] = useState(queueTemplates.lead_follow_up.due)

  const requestedView = new URLSearchParams(location.search).get('view')
  const shouldStartShared = new URLSearchParams(location.search).get('start') === '1'
  const activeView: WorkspaceView = isWorkspaceView(requestedView) ? requestedView : 'leads'
  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open'), [tasks])
  const summary = useMemo(() => {
    if (mode === 'local') {
      return browserWorkspaceSummary(listBrowserWorkspaceLeads())
    }
    return {
      total: leads.length,
      newCount: leads.filter((lead) => lead.stage === 'new' || lead.stage === 'offer_ready').length,
      outreachCount: leads.filter((lead) => lead.stage === 'outreach' || lead.stage === 'contacted').length,
      contactedCount: leads.filter((lead) => lead.stage === 'discovery').length,
      qualifiedCount: leads.filter((lead) => lead.stage === 'qualified').length,
      actionCount: tasks.length,
      openActionCount: openTasks.length,
    }
  }, [leads, mode, openTasks.length, tasks.length])

  const loadLocalState = useCallback(() => {
    setMode('local')
    setLeads(listBrowserWorkspaceLeads().map(normalizeBrowserLead))
    setTasks(listBrowserWorkspaceActions().map(normalizeBrowserTask))
  }, [])

  const loadSharedState = useCallback(async () => {
    const [leadPayload, taskPayload] = await Promise.all([listWorkspaceLeadPipeline('', 'open', 200), listWorkspaceTasks('', 200)])
    setMode('shared')
    setLeads((leadPayload.rows ?? []).map(normalizeSharedLead))
    setTasks((taskPayload.rows ?? []).map(normalizeSharedTask))
  }, [])

  function applyQueueTemplate(templateId: QueueTemplateId) {
    const template = queueTemplates[templateId]
    setQueueTemplate(templateId)
    setQueueOwner(template.owner)
    setQueuePriority(template.priority)
    setQueueDue(template.due)
    setQueueTitle('')
  }

  const startSharedWorkspace = useCallback(async () => {
    if (!hasLiveWorkspaceApi()) {
      setMessage('The shared workspace is not available here yet.')
      return
    }
    setStarting(true)
    try {
      const localLeads = listBrowserWorkspaceLeads()
      const localTasks = listBrowserWorkspaceActions()
      await bootstrapPublicWorkspace({ company: 'My Workspace' })
      if (localLeads.length) {
        const imported = await importLeadPipeline(
          localLeads.map((lead) => ({
            name: lead.name,
            stage: toSharedStage(lead.stage),
            status: 'open',
            owner: 'Growth Studio',
            service_pack: 'Workspace',
            wedge_product: 'Lead Finder',
            semi_products: ['Lead Finder'],
            outreach_subject: lead.outreach_subject,
            outreach_message: lead.outreach_message,
            email: lead.email,
            phone: lead.phone,
            website: lead.website,
            source: 'workspace_migration',
            source_url: lead.source_url,
            provider: lead.provider,
            score: lead.score,
            notes: lead.notes,
          })),
          'Migrate public workspace',
        )
        const leadIdMap = new Map<string, string>()
        localLeads.forEach((lead, index) => {
          const savedLeadId = String(imported.saved_lead_ids?.[index] ?? '').trim()
          if (savedLeadId) {
            leadIdMap.set(lead.lead_id, savedLeadId)
          }
        })
        if (localTasks.length) {
          await createWorkspaceTasks(
            localTasks.map((task) => ({
              title: task.title,
              owner: task.owner,
              priority: task.priority,
              due: task.due,
              status: task.status,
              notes: task.source === 'lead' ? 'Migrated from local workspace' : '',
              lead_id: leadIdMap.get(task.lead_id) ?? '',
              template: task.source === 'lead' ? 'lead_follow_up' : 'manual',
            })),
          )
        }
      }
      await loadSharedState()
      setMessage(localLeads.length || localTasks.length ? 'Turned on cloud save and moved this workspace into it.' : 'Started the shared workspace.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the shared workspace.')
    } finally {
      setStarting(false)
    }
  }, [loadSharedState])

  useEffect(() => {
    let cancelled = false

    async function syncState() {
      setLoading(true)
      try {
        if (!hasLiveWorkspaceApi()) {
          loadLocalState()
          return
        }

        const session = await getWorkspaceSession()
        if (cancelled) {
          return
        }

        if (session.authenticated) {
          await loadSharedState()
        } else if (shouldStartShared) {
          await startSharedWorkspace()
        } else {
          loadLocalState()
        }
      } catch (error) {
        if (!cancelled) {
          loadLocalState()
          setMessage(error instanceof Error ? `${error.message} Using this device workspace instead.` : 'Using this device workspace instead.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setStarting(false)
        }
      }
    }

    void syncState()
    return () => {
      cancelled = true
    }
  }, [loadLocalState, loadSharedState, shouldStartShared, startSharedWorkspace])

  async function copyOutreach(lead: WorkspaceLeadItem) {
    const subject = lead.outreachSubject || `Quick intro from SuperMega for ${lead.name}`
    const messageText = lead.outreachMessage || buildBrowserOutreach(toCsvRow(lead), lead.name, []).message
    await navigator.clipboard.writeText(`${subject}\n\n${messageText}`)
    setMessage(`Copied outreach for ${lead.name}.`)
  }

  async function updateStage(leadId: string, stage: string) {
    if (mode === 'shared') {
      await updateWorkspaceLeadPipeline(leadId, { stage })
      await loadSharedState()
      return
    }
    setLeads(updateBrowserWorkspaceLead(leadId, { stage: stage as BrowserWorkspaceStage }).map(normalizeBrowserLead))
  }

  async function updateNotes(leadId: string, notes: string) {
    if (mode === 'shared') {
      await updateWorkspaceLeadPipeline(leadId, { notes })
      await loadSharedState()
      return
    }
    setLeads(updateBrowserWorkspaceLead(leadId, { notes }).map(normalizeBrowserLead))
  }

  async function removeLead(leadId: string) {
    if (mode === 'shared') {
      setMessage('Remove is only available in the private app for shared workspaces.')
      return
    }
    setLeads(removeBrowserWorkspaceLead(leadId).map(normalizeBrowserLead))
    setTasks(listBrowserWorkspaceActions().map(normalizeBrowserTask))
  }

  function exportWorkspace() {
    if (mode === 'local') {
      exportBrowserWorkspaceLeads()
    } else {
      downloadLeadCsv(leads.map(toCsvRow))
    }
    setMessage('Exported workspace leads as CSV.')
  }

  async function seedQueue() {
    if (mode === 'shared') {
      const leadIdsWithTasks = new Set(tasks.filter((task) => task.leadId).map((task) => task.leadId))
      const rows = leads
        .filter((lead) => !leadIdsWithTasks.has(lead.id))
        .map((lead) => ({
          title: `Follow up ${lead.name}`,
          owner: 'Sales',
          priority: (lead.stage === 'qualified' ? 'Medium' : 'High') as 'High' | 'Medium' | 'Low',
          due: lead.stage === 'qualified' ? 'This week' : 'Today',
          status: 'open',
          notes: 'First outreach',
          lead_id: lead.id,
          template: 'lead_follow_up',
        }))
      if (!rows.length) {
        setMessage('No new follow-up actions were needed.')
        return
      }
      await createWorkspaceTasks(rows)
      await loadSharedState()
      setMessage(`Created ${rows.length} follow-up action${rows.length === 1 ? '' : 's'} from saved leads.`)
      return
    }
    setTasks(seedBrowserWorkspaceActionsFromLeads().map(normalizeBrowserTask))
    setMessage('Created follow-up actions from saved leads.')
  }

  async function saveQuickAction() {
    if (!queueTitle.trim()) {
      setMessage('Write the next action first.')
      return
    }
    if (mode === 'shared') {
      await createWorkspaceTasks([
        {
          title: queueTitle.trim(),
          owner: queueOwner.trim() || queueTemplates[queueTemplate].owner,
          priority: queuePriority,
          due: queueDue.trim() || queueTemplates[queueTemplate].due,
          status: 'open',
          notes: '',
          template: queueTemplate,
        },
      ])
      await loadSharedState()
    } else {
      setTasks(
        saveBrowserWorkspaceActions([
          {
            title: queueTitle.trim(),
            owner: queueOwner.trim() || queueTemplates[queueTemplate].owner,
            priority: queuePriority,
            due: queueDue.trim() || queueTemplates[queueTemplate].due,
          },
        ]).map(normalizeBrowserTask),
      )
    }
    setQueueTitle('')
    setMessage(`Saved ${queueTemplates[queueTemplate].label.toLowerCase()} into the queue.`)
  }

  async function markDone(taskId: string) {
    if (mode === 'shared') {
      await updateWorkspaceTask(taskId, { status: 'done' })
      await loadSharedState()
      return
    }
    setTasks(updateBrowserWorkspaceAction(taskId, { status: 'done' }).map(normalizeBrowserTask))
  }

  async function reopen(taskId: string) {
    if (mode === 'shared') {
      await updateWorkspaceTask(taskId, { status: 'open' })
      await loadSharedState()
      return
    }
    setTasks(updateBrowserWorkspaceAction(taskId, { status: 'open' }).map(normalizeBrowserTask))
  }

  async function removeAction(taskId: string) {
    if (mode === 'shared') {
      await removeWorkspaceTask(taskId)
      await loadSharedState()
      return
    }
    setTasks(removeBrowserWorkspaceAction(taskId).map(normalizeBrowserTask))
  }

  return (
    <div className="space-y-8">
      <PageIntro compact eyebrow="Workspace" title="Keep the shortlist and the queue together." description="One workspace for saved leads, notes, and the next actions." />

      <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{activeView === 'queue' ? 'Run the next actions.' : 'Work the shortlist.'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            {mode === 'shared'
              ? 'Saved leads and queue items are shared in one workspace.'
              : 'Saved leads and queue items stay on this device unless you turn on cloud save.'}
          </p>

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
            <Link className={activeView === 'leads' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('leads')}>
              Leads
            </Link>
            <Link className={activeView === 'queue' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('queue')}>
              Queue
            </Link>
            {!hasLiveWorkspaceApi() || mode === 'shared' ? null : (
              <button className="sm-button-secondary" disabled={starting} onClick={() => void startSharedWorkspace()} type="button">
                {starting ? 'Starting...' : 'Turn on cloud save'}
              </button>
            )}
          </div>

          {activeView === 'leads' ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/lead-finder">
                Find leads
              </Link>
              {leads.length ? (
                <>
                  <button className="sm-button-secondary" onClick={exportWorkspace} type="button">
                    Export CSV
                  </button>
                  <Link className="sm-button-secondary" to={viewHref('queue')}>
                    Open queue
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{activeView === 'queue' ? 'Queue' : 'Saved leads'}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {activeView === 'queue' ? 'Keep the queue short. Start with the top open actions.' : 'Move the right leads forward and leave a clear next note.'}
              </p>
            </div>
            <span className="sm-status-pill">{loading ? 'LOADING' : mode === 'shared' ? 'CLOUD' : 'THIS DEVICE'}</span>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="sm-chip text-[var(--sm-muted)]">Loading workspace...</div>
            ) : activeView === 'queue' ? (
              <>
                <div className="sm-proof-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Quick add</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {publicQueueTemplates.map((templateId) => {
                      const template = queueTemplates[templateId]
                      const active = queueTemplate === templateId
                      return (
                        <button className={`sm-chip text-left ${active ? 'border-[rgba(37,208,255,0.28)] text-white' : 'text-[var(--sm-muted)]'}`} key={templateId} onClick={() => applyQueueTemplate(templateId)} type="button">
                          <p className="font-semibold">{template.label}</p>
                          <p className="mt-2 text-sm">{template.description}</p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                      What needs to happen?
                      <input className="sm-input" onChange={(event) => setQueueTitle(event.target.value)} placeholder={queueTemplates[queueTemplate].placeholder} value={queueTitle} />
                    </label>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                        Owner
                        <input className="sm-input" onChange={(event) => setQueueOwner(event.target.value)} value={queueOwner} />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                        Priority
                        <select className="sm-input" onChange={(event) => setQueuePriority(event.target.value as 'High' | 'Medium' | 'Low')} value={queuePriority}>
                          {['High', 'Medium', 'Low'].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                        Due
                        <select className="sm-input" onChange={(event) => setQueueDue(event.target.value)} value={queueDue}>
                          {['Today', 'Tomorrow', 'This week', 'Next review'].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" onClick={() => void saveQuickAction()} type="button">
                      Save to queue
                    </button>
                    {leads.length ? (
                      <button className="sm-button-secondary" onClick={() => void seedQueue()} type="button">
                        Pull from leads
                      </button>
                    ) : null}
                  </div>
                </div>

                {openTasks.length ? (
                  openTasks.slice(0, 8).map((task) => (
                    <div className="sm-proof-card" key={task.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{task.title}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">
                            {task.owner} | {task.priority} | {task.due}
                          </p>
                        </div>
                        <span className="sm-status-pill">{task.status}</span>
                      </div>
                      {task.notes ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{task.notes}</div> : null}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button className="sm-button-primary" onClick={() => void markDone(task.id)} type="button">
                          Mark done
                        </button>
                        <button className="sm-button-secondary" onClick={() => void reopen(task.id)} type="button">
                          Reopen
                        </button>
                        <button className="sm-button-secondary" onClick={() => void removeAction(task.id)} type="button">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-proof-card">
                    <p className="font-semibold text-white">No queue yet</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Start with one action above or pull follow-up actions from saved leads.</p>
                  </div>
                )}
              </>
            ) : leads.length ? (
              leads.slice(0, 8).map((lead) => (
                <div className="sm-proof-card" key={lead.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{lead.name}</p>
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
                      <select className="sm-input" onChange={(event) => void updateStage(lead.id, event.target.value)} value={lead.stage}>
                        {(mode === 'shared' ? sharedStageOptions : localStageOptions).map((stage) => (
                          <option key={stage} value={stage}>
                            {mode === 'shared' ? sharedStageLabels[stage] ?? stage : localStageLabels[stage as BrowserWorkspaceStage] ?? stage}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                      Note
                      <textarea className="sm-input min-h-24" onChange={(event) => void updateNotes(lead.id, event.target.value)} placeholder="Reply, blocker, or next step." value={lead.notes} />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" onClick={() => void copyOutreach(lead)} type="button">
                      Copy outreach
                    </button>
                    {lead.sourceUrl ? (
                      <a className="sm-button-secondary" href={lead.sourceUrl} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : null}
                    {mode === 'local' ? (
                      <button className="sm-button-secondary" onClick={() => void removeLead(lead.id)} type="button">
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-proof-card">
                <p className="font-semibold text-white">No saved leads yet</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Start with Lead Finder or switch to Queue if you already know the next action.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to="/lead-finder">
                    Open Lead Finder
                  </Link>
                  <Link className="sm-button-secondary" to={viewHref('queue')}>
                    Open queue
                  </Link>
                </div>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
