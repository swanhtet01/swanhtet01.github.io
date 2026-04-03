import { useCallback, useEffect, useMemo, useState } from 'react'
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
  saveBrowserWorkspaceActions,
  saveBrowserWorkspaceLeads,
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
  listWorkspaceLeadPipeline,
  listWorkspaceTasks,
  removeWorkspaceTask,
  savePublicLeadsToWorkspace,
  updateWorkspaceLeadPipeline,
  updateWorkspaceTask,
  type WorkspaceLeadRow,
  type WorkspaceTaskRow,
} from '../lib/workspaceApi'
import { ACTION_SAMPLE_TEXT, LEAD_SAMPLE_TEXT, buildActionBoard, downloadLeadCsv, parseLeads, type LeadRow } from '../lib/tooling'

type WorkspaceView = 'leads' | 'queue'
type WorkspaceMode = 'local' | 'shared'
type QueueTemplateId = 'lead_follow_up' | 'ops_blocker' | 'receiving_issue'
type SetupFlow = 'pick' | 'find' | 'leads' | 'updates' | 'receiving'

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
const publicQueueTemplates: QueueTemplateId[] = ['lead_follow_up', 'ops_blocker', 'receiving_issue']

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

const setupOptions: Array<{
  id: SetupFlow
  title: string
  detail: string
}> = [
  {
    id: 'find',
    title: 'Find clients',
    detail: 'Search a market with Lead Finder and keep the shortlist.',
  },
  {
    id: 'leads',
    title: 'Bring a lead list',
    detail: 'Paste names, sites, phones, or emails and turn them into saved leads.',
  },
  {
    id: 'updates',
    title: 'Paste team updates',
    detail: 'Paste messy notes and turn them into a queue with owners and due dates.',
  },
  {
    id: 'receiving',
    title: 'Log an ops issue',
    detail: 'Start with receiving, quality, or procurement issues and run the next step.',
  },
]

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === 'queue' || value === 'leads'
}

function isSetupFlow(value: string | null): value is Exclude<SetupFlow, 'pick'> {
  return value === 'find' || value === 'leads' || value === 'updates' || value === 'receiving'
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
    source: 'Workspace',
    source_url: lead.sourceUrl,
    snippet: '',
    social_profiles: [],
    fit_reasons: [],
    provider: lead.provider || 'Workspace',
    score: lead.score,
  }
}

function toSharedStage(stage: string) {
  if (stage === 'outreach') return 'contacted'
  if (stage === 'contacted') return 'discovery'
  if (stage === 'qualified') return 'qualified'
  return 'offer_ready'
}

function buildSharedLeadRow(row: LeadRow, contextLabel: string) {
  const outreach = buildBrowserOutreach(row, contextLabel, [])
  return {
    name: row.name,
    stage: 'offer_ready',
    status: 'open',
    owner: 'Growth Studio',
    service_pack: 'Action OS Starter',
    wedge_product: 'Lead Finder',
    semi_products: ['Lead Finder'],
    outreach_subject: outreach.subject,
    outreach_message: outreach.message,
    email: row.email,
    phone: row.phone,
    website: row.website,
    source_url: row.source_url,
    provider: row.provider,
    score: row.score,
    notes: row.fit_reasons.join(', '),
    task_title: `Follow up ${row.name}`,
    task_owner: 'Sales',
    task_priority: 'High',
    task_due: 'Today',
    task_notes: 'First outreach',
    task_template: 'lead_follow_up',
  }
}

export function WorkspaceLitePage() {
  const location = useLocation()
  const navigate = useNavigate()
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
  const [setupFlow, setSetupFlow] = useState<SetupFlow>('pick')
  const [leadImportText, setLeadImportText] = useState('')
  const [updateImportText, setUpdateImportText] = useState('')
  const [receivingImportText, setReceivingImportText] = useState('')

  const searchParams = new URLSearchParams(location.search)
  const requestedView = searchParams.get('view')
  const requestedSetup = searchParams.get('setup')
  const shouldStartShared = searchParams.get('start') === '1'
  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open'), [tasks])
  const hasData = leads.length > 0 || tasks.length > 0
  const activeView: WorkspaceView = isWorkspaceView(requestedView)
    ? requestedView
    : tasks.length || requestedSetup === 'updates' || requestedSetup === 'receiving'
      ? 'queue'
      : 'leads'

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

  useEffect(() => {
    setSetupFlow(isSetupFlow(requestedSetup) ? requestedSetup : 'pick')
  }, [requestedSetup])

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
      setMessage('Cloud save is not available on this host yet.')
      return
    }

    setStarting(true)
    try {
      const localLeads = listBrowserWorkspaceLeads()
      const localTasks = listBrowserWorkspaceActions()
      await bootstrapPublicWorkspace({ company: 'My Workspace' })

      if (localLeads.length) {
        await savePublicLeadsToWorkspace({
          company: 'My Workspace',
          campaign_goal: 'Migrate workspace',
          rows: localLeads.map((lead) => ({
            ...buildSharedLeadRow(lead, 'Imported lead list'),
            stage: toSharedStage(lead.stage),
            notes: lead.notes,
            provider: lead.provider,
            source_url: lead.source_url,
            score: lead.score,
          })),
        })
      }

      const extraTasks = localTasks.filter((task) => task.source !== 'lead')
      if (extraTasks.length) {
        await createWorkspaceTasks(
          extraTasks.map((task) => ({
            title: task.title,
            owner: task.owner,
            priority: task.priority,
            due: task.due,
            status: task.status,
            notes: 'Migrated from device workspace',
            template: 'manual',
          })),
        )
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

  async function saveLeadRows(rows: LeadRow[], successMessage: string) {
    if (!rows.length) {
      setMessage('Paste at least one lead first.')
      return
    }

    if (mode === 'shared') {
      await savePublicLeadsToWorkspace({
        company: 'My Workspace',
        campaign_goal: 'Imported lead list',
        rows: rows.map((row) => buildSharedLeadRow(row, 'Imported lead list')),
      })
      await loadSharedState()
    } else {
      const saved = saveBrowserWorkspaceLeads(rows, {
        query: 'Imported lead list',
        keywords: [],
      })
      setLeads(saved.rows.map(normalizeBrowserLead))
      setTasks(listBrowserWorkspaceActions().map(normalizeBrowserTask))
    }

    setLeadImportText('')
    setMessage(successMessage)
    navigate('/workspace?view=leads', { replace: true })
  }

  async function importLeadList() {
    const rows = parseLeads(leadImportText)
    await saveLeadRows(rows, `Saved ${rows.length} lead${rows.length === 1 ? '' : 's'} and created the first follow-up.`)
  }

  async function saveTaskRows(
    rows: Array<{
      title: string
      owner: string
      priority: 'High' | 'Medium' | 'Low'
      due: string
      notes?: string
      template: QueueTemplateId | 'manual'
    }>,
    successMessage: string,
  ) {
    if (!rows.length) {
      setMessage('Paste at least one item first.')
      return
    }

    if (mode === 'shared') {
      await createWorkspaceTasks(
        rows.map((row) => ({
          title: row.title,
          owner: row.owner,
          priority: row.priority,
          due: row.due,
          status: 'open',
          notes: row.notes || '',
          template: row.template,
        })),
      )
      await loadSharedState()
    } else {
      setTasks(
        saveBrowserWorkspaceActions(
          rows.map((row) => ({
            title: row.title,
            owner: row.owner,
            priority: row.priority,
            due: row.due,
            source: 'manual',
          })),
        ).map(normalizeBrowserTask),
      )
    }

    setMessage(successMessage)
    navigate('/workspace?view=queue', { replace: true })
  }

  async function importUpdates() {
    const rows = buildActionBoard(updateImportText).map((row) => ({
      ...row,
      template: 'ops_blocker' as const,
    }))
    await saveTaskRows(rows, `Saved ${rows.length} queue item${rows.length === 1 ? '' : 's'} from the pasted updates.`)
    setUpdateImportText('')
    applyQueueTemplate('ops_blocker')
  }

  async function importReceivingIssues() {
    const rows = receivingImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        title: line,
        owner: 'Procurement',
        priority: 'High' as const,
        due: 'Today',
        notes: 'Imported from receiving issues',
        template: 'receiving_issue' as const,
      }))
    await saveTaskRows(rows, `Saved ${rows.length} receiving issue${rows.length === 1 ? '' : 's'} into the queue.`)
    setReceivingImportText('')
    applyQueueTemplate('receiving_issue')
  }

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
          status: 'open' as const,
          notes: 'First outreach',
          lead_id: lead.id,
          template: 'lead_follow_up' as const,
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

  const setupPanel =
    setupFlow === 'find' ? (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Use Lead Finder when you need net-new clients.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Search a place or niche, keep the shortlist, then come back here to run the queue.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/lead-finder">
            Open Lead Finder
          </Link>
          <button className="sm-button-secondary" onClick={() => setSetupFlow('leads')} type="button">
            I already have a list
          </button>
        </div>
      </div>
    ) : setupFlow === 'leads' ? (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Paste a lead list.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Names, websites, emails, and phones are enough. Workspace will save the leads and create the first follow-up.</p>
        <textarea
          className="sm-input mt-4 min-h-40"
          onChange={(event) => setLeadImportText(event.target.value)}
          placeholder="North Star Clinic | www.northstarclinic.com | hello@northstarclinic.com | +1 555 111 2222"
          value={leadImportText}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="sm-button-primary" onClick={() => void importLeadList()} type="button">
            Import lead list
          </button>
          <button className="sm-button-secondary" onClick={() => setLeadImportText(LEAD_SAMPLE_TEXT)} type="button">
            Load example
          </button>
        </div>
      </div>
    ) : setupFlow === 'updates' ? (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Paste messy team updates.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Workspace will turn them into a simple queue with owner and due date suggestions.</p>
        <textarea
          className="sm-input mt-4 min-h-40"
          onChange={(event) => setUpdateImportText(event.target.value)}
          placeholder="Power fluctuation at Plant A | Operations Team"
          value={updateImportText}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="sm-button-primary" onClick={() => void importUpdates()} type="button">
            Build queue
          </button>
          <button className="sm-button-secondary" onClick={() => setUpdateImportText(ACTION_SAMPLE_TEXT)} type="button">
            Load example
          </button>
        </div>
      </div>
    ) : setupFlow === 'receiving' ? (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Log receiving or procurement issues.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste one issue per line. Workspace will put them straight into the queue.</p>
        <textarea
          className="sm-input mt-4 min-h-40"
          onChange={(event) => setReceivingImportText(event.target.value)}
          placeholder="Variance on inbound compound batch"
          value={receivingImportText}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="sm-button-primary" onClick={() => void importReceivingIssues()} type="button">
            Log issues
          </button>
          <button
            className="sm-button-secondary"
            onClick={() =>
              setReceivingImportText('Variance on inbound compound batch\nMissing GRN on truck tyre receipt\nHold release pending customs document')
            }
            type="button"
          >
            Load example
          </button>
        </div>
      </div>
    ) : (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Pick one starting point.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">This workspace works with anyone’s data. Start with what you already have, not with a blank board.</p>
      </div>
    )

  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Workspace"
        title={hasData ? 'Keep the leads and the queue in one place.' : 'Start with something you already have.'}
        description={
          hasData
            ? 'Use one workspace for saved leads, notes, and the next actions.'
            : 'Paste a lead list, paste messy updates, or log one ops issue. Workspace will turn it into something usable.'
        }
      />

      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{hasData ? 'Add more or work what you already saved.' : 'Choose one way to begin.'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            {mode === 'shared'
              ? 'This workspace is using shared cloud save.'
              : 'This workspace works in this browser now. Turn on cloud save only when you need the shared version.'}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {setupOptions.map((option) => {
              const active = setupFlow === option.id
              return (
                <button
                  className={`sm-chip text-left transition ${active ? 'border-[rgba(37,208,255,0.28)] bg-[rgba(37,208,255,0.08)] text-white' : 'text-[var(--sm-muted)]'}`}
                  key={option.id}
                  onClick={() => setSetupFlow(option.id)}
                  type="button"
                >
                  <p className="font-semibold">{option.title}</p>
                  <p className="mt-2 text-sm">{option.detail}</p>
                </button>
              )
            })}
          </div>

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
              <p className="sm-kicker text-[var(--sm-accent)]">Mode</p>
              <p className="mt-2 text-base font-bold">{mode === 'shared' ? 'Cloud save' : 'This device'}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link className={activeView === 'leads' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('leads')}>
              Leads
            </Link>
            <Link className={activeView === 'queue' ? 'sm-button-primary' : 'sm-button-secondary'} to={viewHref('queue')}>
              Queue
            </Link>
            {mode === 'local' && hasLiveWorkspaceApi() ? (
              <button className="sm-button-secondary" disabled={starting} onClick={() => void startSharedWorkspace()} type="button">
                {starting ? 'Starting...' : 'Turn on cloud save'}
              </button>
            ) : null}
          </div>

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          {!hasData ? (
            <div className="space-y-4">
              {setupPanel}
              <div className="sm-chip text-[var(--sm-muted)]">
                Use Lead Finder for net-new clients. Use Workspace when you already have a list, updates, or issues.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {setupFlow !== 'pick' ? (
                <div className="space-y-4">
                  {setupPanel}
                  <div className="flex flex-wrap gap-3">
                    <button className="sm-button-secondary" onClick={() => setSetupFlow('pick')} type="button">
                      Back to workspace
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{activeView === 'queue' ? 'Queue' : 'Saved leads'}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {activeView === 'queue'
                          ? 'Keep the queue short. Start with the top open actions.'
                          : 'Move the right leads forward and leave one clear next note.'}
                      </p>
                    </div>
                    <span className="sm-status-pill">{loading ? 'LOADING' : mode === 'shared' ? 'CLOUD' : 'THIS DEVICE'}</span>
                  </div>

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
                              <button
                                className={`sm-chip text-left ${active ? 'border-[rgba(37,208,255,0.28)] text-white' : 'text-[var(--sm-muted)]'}`}
                                key={templateId}
                                onClick={() => applyQueueTemplate(templateId)}
                                type="button"
                              >
                                <p className="font-semibold">{template.label}</p>
                                <p className="mt-2 text-sm">{template.description}</p>
                              </button>
                            )
                          })}
                        </div>

                        <div className="mt-4 grid gap-3">
                          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                            What needs to happen?
                            <input
                              className="sm-input"
                              onChange={(event) => setQueueTitle(event.target.value)}
                              placeholder={queueTemplates[queueTemplate].placeholder}
                              value={queueTitle}
                            />
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
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">Start with one action above, or import messy updates from the left.</p>
                        </div>
                      )}
                    </>
                  ) : leads.length ? (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <Link className="sm-button-secondary" to="/lead-finder">
                          Find more leads
                        </Link>
                        <button className="sm-button-secondary" onClick={exportWorkspace} type="button">
                          Export CSV
                        </button>
                        <button className="sm-button-secondary" onClick={() => setSetupFlow('leads')} type="button">
                          Import list
                        </button>
                      </div>

                      {leads.slice(0, 8).map((lead) => (
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
                      ))}
                    </>
                  ) : (
                    <div className="sm-proof-card">
                      <p className="font-semibold text-white">No saved leads yet</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Find clients with Lead Finder, paste a lead list, or switch to Queue if you already know the next action.</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link className="sm-button-primary" to="/lead-finder">
                          Open Lead Finder
                        </Link>
                        <button className="sm-button-secondary" onClick={() => setSetupFlow('leads')} type="button">
                          Import lead list
                        </button>
                        <Link className="sm-button-secondary" to={viewHref('queue')}>
                          Open queue
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
