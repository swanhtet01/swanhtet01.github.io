import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { identifyUser, trackEvent } from '../lib/analytics'
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
  isPublicWorkspaceProfileReady,
  listWorkspaceLeadPipeline,
  listWorkspaceTasks,
  loadPublicWorkspaceProfile,
  removeWorkspaceTask,
  savePublicWorkspaceProfile,
  savePublicLeadsToWorkspace,
  updateWorkspaceLeadPipeline,
  updateWorkspaceTask,
  type PublicWorkspaceProfile,
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

function isSetupFlow(value: string | null): value is Exclude<SetupFlow, 'pick'> {
  return value === 'find' || value === 'leads' || value === 'updates' || value === 'receiving'
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
    source: 'Company List',
    source_url: lead.sourceUrl,
    snippet: '',
    social_profiles: [],
    fit_reasons: [],
    provider: lead.provider || 'Company List',
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
  const importedList = contextLabel.toLowerCase().includes('imported')
  return {
    name: row.name,
    stage: 'offer_ready',
    status: 'open',
    owner: 'Growth Studio',
    service_pack: importedList ? 'Company Cleanup' : 'Sales Setup',
    wedge_product: importedList ? 'Company List' : 'Find Companies',
    semi_products: importedList ? ['Company List', 'Task List'] : ['Find Companies', 'Company List'],
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
  const normalizedPathname = location.pathname.replace(/\/+$/, '') || '/'
  const [mode, setMode] = useState<WorkspaceMode>('local')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [showCloudSetup, setShowCloudSetup] = useState(false)
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<PublicWorkspaceProfile>(() => loadPublicWorkspaceProfile())
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
  const requestedSetup = searchParams.get('setup')
  const shouldStartShared = searchParams.get('start') === '1'
  const isReceivingDesk = requestedSetup === 'receiving' || normalizedPathname === '/receiving' || normalizedPathname === '/receiving-log'
  const publicSurface = isReceivingDesk || normalizedPathname === '/team-updates' || normalizedPathname === '/team-tasks' || normalizedPathname === '/task-list' ? 'updates' : 'sales'
  const publicBasePath = isReceivingDesk ? '/receiving-log' : publicSurface === 'sales' ? '/company-list' : '/task-list'
  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open'), [tasks])
  const hasData = leads.length > 0 || tasks.length > 0
  const activeView: WorkspaceView = publicSurface === 'updates' ? 'queue' : 'leads'
  const hasSharedProfile = isPublicWorkspaceProfileReady(profile)
  const pageEyebrow = isReceivingDesk ? 'Log receiving' : publicSurface === 'sales' ? 'Clean list' : 'Task list'

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
    if (isSetupFlow(requestedSetup)) {
      setSetupFlow(requestedSetup)
      return
    }
    setSetupFlow(hasData ? 'pick' : isReceivingDesk ? 'receiving' : publicSurface === 'sales' ? 'leads' : 'updates')
  }, [hasData, isReceivingDesk, publicSurface, requestedSetup])

  function applyQueueTemplate(templateId: QueueTemplateId) {
    const template = queueTemplates[templateId]
    setQueueTemplate(templateId)
    setQueueOwner(template.owner)
    setQueuePriority(template.priority)
    setQueueDue(template.due)
    setQueueTitle('')
  }

  function updateProfileField(field: keyof PublicWorkspaceProfile, value: string) {
    const nextProfile = savePublicWorkspaceProfile({
      ...profile,
      [field]: value,
    })
    setProfile(nextProfile)
  }

  function promptCloudSetup(nextMessage: string) {
    setShowCloudSetup(true)
    setMessage(nextMessage)
  }

  async function ensureSharedWorkspaceReady(actionLabel: string) {
    if (!hasLiveWorkspaceApi()) {
      return false
    }

    if (!hasSharedProfile) {
      promptCloudSetup(`Enter your company and work email before ${actionLabel}.`)
      return false
    }

    const nextProfile = savePublicWorkspaceProfile(profile)
    setProfile(nextProfile)
    setShowCloudSetup(false)

    try {
      await bootstrapPublicWorkspace({
        name: nextProfile.name,
        email: nextProfile.email,
        company: nextProfile.company,
        goal: 'Save and run this desk',
      })
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this list to the team workspace.')
      return false
    }
  }

  const startSharedWorkspace = useCallback(async () => {
    if (!hasLiveWorkspaceApi()) {
      setMessage('Team workspace save is not available on this host yet.')
      return
    }
    if (!hasSharedProfile) {
      promptCloudSetup('Enter your company and work email before saving this list to the team workspace.')
      return
    }

    setStarting(true)
    try {
      const localLeads = listBrowserWorkspaceLeads()
      const localTasks = listBrowserWorkspaceActions()
      const nextProfile = savePublicWorkspaceProfile(profile)
      setProfile(nextProfile)
      await bootstrapPublicWorkspace({
        name: nextProfile.name,
        email: nextProfile.email,
        company: nextProfile.company,
        goal: 'Keep this list online',
      })

      if (localLeads.length) {
        await savePublicLeadsToWorkspace({
          name: nextProfile.name,
          email: nextProfile.email,
          company: nextProfile.company,
          goal: 'Keep this list online',
          campaign_goal: 'Migrate desk',
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
            notes: 'Migrated from device desk',
            template: 'manual',
          })),
        )
      }

      await loadSharedState()
      setShowCloudSetup(false)
      identifyUser(nextProfile.email, {
        company: nextProfile.company,
        surface: publicSurface,
      })
      trackEvent('shared_workspace_started', {
        surface: publicSurface,
        local_leads: localLeads.length,
        local_tasks: localTasks.length,
      })
      setMessage(localLeads.length || localTasks.length ? 'Moved this list into the team workspace.' : 'Started the team workspace.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the team workspace.')
    } finally {
      setStarting(false)
    }
  }, [hasSharedProfile, loadSharedState, profile, publicSurface])

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
          setMessage(error instanceof Error ? `${error.message} Using this computer instead.` : 'Using this computer instead.')
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
      setMessage('Paste at least one company first.')
      return
    }

    if (mode === 'shared' || hasLiveWorkspaceApi()) {
      if (mode !== 'shared') {
        const ready = await ensureSharedWorkspaceReady('saving into Company List')
        if (!ready) {
          return
        }
      }
      await savePublicLeadsToWorkspace({
        name: profile.name,
        email: profile.email,
        company: profile.company,
        goal: 'Save company list into Company List',
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
    trackEvent('company_list_imported', {
      mode,
      count: rows.length,
    })
    setMessage(successMessage)
    navigate(`${publicBasePath}?view=leads`, { replace: true })
  }

  async function importLeadList() {
    const rows = parseLeads(leadImportText)
    await saveLeadRows(rows, `Saved ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} and created the first follow-up.`)
  }

  async function importLeadFile(file: File | null) {
    if (!file) {
      return
    }
    const text = await file.text()
    setLeadImportText(text)
    const rows = parseLeads(text)
    if (!rows.length) {
      setMessage('Could not find any companies in that file.')
      return
    }
    await saveLeadRows(rows, `Saved ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} and created the first follow-up.`)
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

    if (mode === 'shared' || hasLiveWorkspaceApi()) {
      if (mode !== 'shared') {
        const ready = await ensureSharedWorkspaceReady('saving into the task list')
        if (!ready) {
          return
        }
      }
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

    trackEvent('task_list_imported', {
      mode,
      count: rows.length,
      surface: publicSurface,
    })
    setMessage(successMessage)
    navigate(`${publicBasePath}?view=queue`, { replace: true })
  }

  async function importUpdates() {
    const rows = buildActionBoard(updateImportText).map((row) => ({
      ...row,
      template: 'ops_blocker' as const,
    }))
    await saveTaskRows(rows, `Saved ${rows.length} task${rows.length === 1 ? '' : 's'} from the pasted updates.`)
    setUpdateImportText('')
    applyQueueTemplate('ops_blocker')
  }

  async function importTaskFile(file: File | null) {
    if (!file) {
      return
    }
    const text = await file.text()
    setUpdateImportText(text)
    const rows = buildActionBoard(text).map((row) => ({
      ...row,
      template: 'ops_blocker' as const,
    }))
    if (!rows.length) {
      setMessage('Could not find any task lines in that file.')
      return
    }
    await saveTaskRows(rows, `Saved ${rows.length} task${rows.length === 1 ? '' : 's'} from the uploaded file.`)
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
    await saveTaskRows(rows, `Saved ${rows.length} receiving issue${rows.length === 1 ? '' : 's'} into the task list.`)
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
      setMessage('Remove is only available in the full app for team workspaces.')
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
    setMessage('Exported companies as CSV.')
  }

  async function seedQueue() {
    if (mode === 'shared' || hasLiveWorkspaceApi()) {
      if (mode !== 'shared') {
        const ready = await ensureSharedWorkspaceReady('pulling companies into the task list')
        if (!ready) {
          return
        }
      }
      const [leadPayload, taskPayload] = await Promise.all([listWorkspaceLeadPipeline('', 'open', 200), listWorkspaceTasks('', 200)])
      const sharedLeads = (leadPayload.rows ?? []).map(normalizeSharedLead)
      const sharedTasks = (taskPayload.rows ?? []).map(normalizeSharedTask)
      const leadIdsWithTasks = new Set(sharedTasks.filter((task) => task.leadId).map((task) => task.leadId))
      const rows = sharedLeads
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
      setMessage(`Created ${rows.length} follow-up task${rows.length === 1 ? '' : 's'} from the company list.`)
      return
    }

    setTasks(seedBrowserWorkspaceActionsFromLeads().map(normalizeBrowserTask))
    setMessage('Created follow-up tasks from the company list.')
  }

  async function saveQuickAction() {
    if (!queueTitle.trim()) {
      setMessage('Write the next action first.')
      return
    }

    if (mode === 'shared' || hasLiveWorkspaceApi()) {
      if (mode !== 'shared') {
        const ready = await ensureSharedWorkspaceReady('saving into the task list')
        if (!ready) {
          return
        }
      }
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
    trackEvent('task_created', {
      mode,
      surface: publicSurface,
      template: queueTemplate,
    })
    setMessage(`Saved ${queueTemplates[queueTemplate].label.toLowerCase()} into the task list.`)
  }

  async function markDone(taskId: string) {
    if (mode === 'shared') {
      await updateWorkspaceTask(taskId, { status: 'done' })
      await loadSharedState()
      return
    }
    setTasks(updateBrowserWorkspaceAction(taskId, { status: 'done' }).map(normalizeBrowserTask))
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
        <p className="text-lg font-bold text-white">Need new clients first?</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Search a place or niche, keep the shortlist, then come back here to run the next steps.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/find-companies">
            Open Find clients
          </Link>
          <button className="sm-button-secondary" onClick={() => setSetupFlow('leads')} type="button">
            I already have a list
          </button>
        </div>
      </div>
    ) : setupFlow === 'leads' ? (
      <div className="sm-proof-card">
        <p className="text-sm text-[var(--sm-muted)]">Names, websites, emails, and phones are enough. The first follow-up task will be created automatically.</p>
        <textarea
          className="sm-input mt-4 min-h-40"
          onChange={(event) => setLeadImportText(event.target.value)}
          placeholder="North Star Clinic | www.northstarclinic.com | hello@northstarclinic.com | +1 555 111 2222"
          value={leadImportText}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="sm-button-primary" onClick={() => void importLeadList()} type="button">
              Paste company list
            </button>
          <label className="sm-button-secondary cursor-pointer">
            Upload file
            <input
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                void importLeadFile(file)
                event.currentTarget.value = ''
              }}
              type="file"
            />
          </label>
          <button className="sm-button-secondary" onClick={() => setLeadImportText(LEAD_SAMPLE_TEXT)} type="button">
            Load example
          </button>
        </div>
      </div>
    ) : setupFlow === 'updates' ? (
      <div className="sm-proof-card">
        <p className="text-sm text-[var(--sm-muted)]">Paste messy notes, blockers, or receiving issues. They will be turned into a simple task list.</p>
        <textarea
          className="sm-input mt-4 min-h-40"
          onChange={(event) => setUpdateImportText(event.target.value)}
          placeholder="Power fluctuation at Plant A | Operations Team"
          value={updateImportText}
        />
        <div className="mt-4 flex flex-wrap gap-3">
            <button className="sm-button-primary" onClick={() => void importUpdates()} type="button">
              Build task list
            </button>
          <label className="sm-button-secondary cursor-pointer">
            Upload file
            <input
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                void importTaskFile(file)
                event.currentTarget.value = ''
              }}
              type="file"
            />
          </label>
          <button className="sm-button-secondary" onClick={() => setUpdateImportText(ACTION_SAMPLE_TEXT)} type="button">
            Load example
          </button>
        </div>
      </div>
    ) : setupFlow === 'receiving' ? (
      <div className="sm-proof-card">
        <p className="text-lg font-bold text-white">Log receiving or procurement issues.</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste one issue per line. Receiving Log will put them straight into the follow-up list.</p>
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
        <p className="mt-2 text-sm text-[var(--sm-muted)]">This tool works with anyone's data. Start with what you already have, not with a blank board.</p>
      </div>
    )

  const cloudSavePanel =
    hasLiveWorkspaceApi() && mode === 'local' && showCloudSetup ? (
      <div className="sm-proof-card">
        <p className="sm-kicker text-[var(--sm-accent)]">Use with your team</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">Use your company and work email once. After that, this list can stay in the shared team list.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
            Name
            <input className="sm-input" onChange={(event) => updateProfileField('name', event.target.value)} placeholder="Your name" value={profile.name} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
            Work email
            <input className="sm-input" onChange={(event) => updateProfileField('email', event.target.value)} placeholder="you@company.com" value={profile.email} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
            Company
            <input className="sm-input" onChange={(event) => updateProfileField('company', event.target.value)} placeholder="Company name" value={profile.company} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="sm-button-secondary" disabled={starting || !hasSharedProfile} onClick={() => void startSharedWorkspace()} type="button">
            {starting ? 'Starting...' : 'Use with your team'}
          </button>
          <button className="sm-button-secondary" onClick={() => setShowCloudSetup(false)} type="button">
            Hide
          </button>
        </div>
      </div>
    ) : null

  if (!hasData) {
    return (
      <div className="space-y-6">
        <section className="sm-surface p-6 lg:p-8">
          <p className="sm-kicker text-[var(--sm-accent)]">{pageEyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold text-white lg:text-4xl">
            {isReceivingDesk ? 'Log receiving issues.' : publicSurface === 'sales' ? 'Clean a company list.' : 'Paste task notes.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            {isReceivingDesk
              ? 'Paste GRN, hold, batch, customs, or quantity issues and turn them into one short follow-up list.'
              : publicSurface === 'sales'
              ? 'Paste names, sites, emails, or phones. If you need new clients first, use Find clients.'
              : 'Paste messy notes, blockers, or updates and turn them into a short task list.'}
          </p>
          {setupPanel}
          {publicSurface === 'sales' ? (
            <div className="mt-5 text-sm text-[var(--sm-muted)]">
              Need new clients first?{' '}
              <Link className="text-white underline underline-offset-4" to="/find-companies">
                Find clients
              </Link>
            </div>
          ) : null}
          {cloudSavePanel ? <div className="mt-5">{cloudSavePanel}</div> : null}
          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
    <article className="sm-surface p-6">
      <p className="sm-kicker text-[var(--sm-accent)]">{isReceivingDesk ? 'Log receiving' : publicSurface === 'sales' ? 'Clean list' : 'Task list'}</p>
      <h2 className="mt-3 text-3xl font-bold text-white">
        {isReceivingDesk ? 'Keep only the receiving follow-up.' : publicSurface === 'sales' ? 'Keep the list short and usable.' : 'Keep only the next tasks.'}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
        {isReceivingDesk
          ? 'Log one issue, assign the next step, and close it when the material is clear.'
          : publicSurface === 'sales'
          ? 'Save companies, move the right ones forward, and open the task list when follow-up is due.'
          : 'Add one task, finish it, then move to the next one.'}
      </p>

          {hasData ? (
            <>
              <div className={`mt-5 grid gap-3 ${publicSurface === 'sales' ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                {publicSurface === 'sales' ? (
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Companies</p>
                    <p className="mt-2 text-3xl font-bold">{summary.total}</p>
                  </div>
                ) : null}
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Open tasks</p>
                  <p className="mt-2 text-3xl font-bold">{summary.openActionCount}</p>
                </div>
              </div>

            </>
          ) : (
        <div className="mt-5 sm-chip text-[var(--sm-muted)]">
          {mode === 'shared' ? 'Team workspace ready.' : `Nothing saved yet. Start with one ${isReceivingDesk ? 'receiving issue' : publicSurface === 'sales' ? 'company list' : 'task list'}.`}
        </div>
      )}

          {hasData && hasLiveWorkspaceApi() && mode === 'local' ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="sm-button-secondary" onClick={() => setShowCloudSetup((current) => !current)} type="button">
                {showCloudSetup ? 'Hide team setup' : 'Use with your team'}
              </button>
            </div>
          ) : null}

          {cloudSavePanel ? <div className="mt-5">{cloudSavePanel}</div> : null}
          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          {!hasData ? (
            <div className="space-y-4">
              {setupPanel}
          <div className="sm-chip text-[var(--sm-muted)]">
            {isReceivingDesk
              ? 'Paste receiving issues and build the follow-up list.'
              : publicSurface === 'sales'
                ? 'Use Find clients for net-new prospects. Use Clean list when you already have names.'
                      : "Paste today's notes and build the task list."}
          </div>
            </div>
          ) : (
            <div className="space-y-5">
              {setupFlow !== 'pick' ? (
                <div className="space-y-4">
                  {setupPanel}
                  <div className="flex flex-wrap gap-3">
                    <button className="sm-button-secondary" onClick={() => setSetupFlow('pick')} type="button">
                      Back to desk
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{activeView === 'queue' ? "Today's next steps" : 'Your list'}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {activeView === 'queue'
                          ? 'Keep the task list short. Start with the top open items.'
                          : 'Move the right companies forward and leave one clear next note.'}
                      </p>
                    </div>
                  </div>

                  {loading ? (
                    <div className="sm-chip text-[var(--sm-muted)]">Loading desk...</div>
                  ) : activeView === 'queue' ? (
                    <>
                      <div className="sm-proof-card">
                        <p className="sm-kicker text-[var(--sm-accent)]">Add one task</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-[0.28fr_0.72fr]">
                          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                            Type
                            <select className="sm-input" onChange={(event) => applyQueueTemplate(event.target.value as QueueTemplateId)} value={queueTemplate}>
                              {publicQueueTemplates.map((templateId) => (
                                <option key={templateId} value={templateId}>
                                  {queueTemplates[templateId].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                            Task
                            <input
                              className="sm-input"
                              onChange={(event) => setQueueTitle(event.target.value)}
                              placeholder={queueTemplates[queueTemplate].placeholder}
                              value={queueTitle}
                            />
                          </label>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button className="sm-button-primary" onClick={() => void saveQuickAction()} type="button">
                            Add task
                          </button>
                          {leads.length ? (
                            <button className="sm-button-secondary" onClick={() => void seedQueue()} type="button">
                              Pull from companies
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 text-sm text-[var(--sm-muted)]">
                          Default owner: {queueOwner}. Default due: {queueDue}. Priority: {queuePriority}.
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
                              <button className="sm-button-secondary" onClick={() => void removeAction(task.id)} type="button">
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="sm-proof-card">
                          <p className="font-semibold text-white">No tasks yet</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">Start with one next step above, or paste messy updates first.</p>
                        </div>
                      )}
                    </>
                  ) : leads.length ? (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <Link className="sm-button-primary" to="/task-list">
                          Open task list
                        </Link>
                        <Link className="sm-button-secondary" to="/find-companies">
                          Find more clients
                        </Link>
                        <button className="sm-button-secondary" onClick={exportWorkspace} type="button">
                          Export CSV
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
                      <p className="font-semibold text-white">No companies yet</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Find clients, paste a company list, or start with one task.</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link className="sm-button-primary" to="/find-companies">
                          Find clients
                        </Link>
                        <button className="sm-button-secondary" onClick={() => setSetupFlow('leads')} type="button">
                          Paste company list
                        </button>
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
