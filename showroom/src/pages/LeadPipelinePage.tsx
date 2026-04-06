import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  CORE_SOLUTIONS,
  defaultStarterModules,
  defaultHuntTemplate,
  defaultWedgeProduct,
  FINDER_ADVANTAGES,
  HUNT_TEMPLATES,
  normalizeSolutionPack,
  QUICK_WIN_PRODUCTS,
  type HuntTemplate,
} from '../lib/salesControl'
import { checkWorkspaceHealth, createWorkspaceTasks, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type LeadPipelineRow = {
  lead_id: string
  company_name: string
  archetype: string
  stage: string
  status: string
  owner: string
  campaign_goal: string
  service_pack: string
  wedge_product: string
  starter_modules: string[]
  semi_products: string[]
  contact_email: string
  contact_phone: string
  website: string
  source: string
  source_url: string
  provider: string
  score: number
  outreach_subject: string
  outreach_message: string
  discovery_questions: string[]
  notes: string
}

type LeadPipelineResponse = {
  summary: {
    lead_count: number
    by_stage: Record<string, number>
    by_status: Record<string, number>
    by_pack: Record<string, number>
  }
  rows: LeadPipelineRow[]
}

type LeadHuntProfile = {
  hunt_id: string
  name: string
  owner: string
  status: string
  query: string
  raw_text: string
  keywords: string[]
  sources: string[]
  limit: number
  campaign_goal: string
  export_workspace: boolean
  last_run_at: string
  last_provider: string
  last_engine: string
  last_saved_count: number
  last_summary: string
}

type WorkspaceTaskRow = {
  task_id: string
  lead_id: string
  template: string
  title: string
  owner: string
  priority: string
  due: string
  status: string
  notes: string
}

type HuntRunResponse = {
  status: string
  provider: string
  engine: string
  row_count: number
  saved_count: number
  summary: string
}

type LeadOutreachResponse = {
  status: string
  draft?: {
    status?: string
    compose_url?: string
    message?: string
  }
}

const stageOptions = [
  { value: 'offer_ready', label: 'Offer ready' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
] as const

function stageLabel(value: string) {
  return stageOptions.find((item) => item.value === value)?.label ?? value
}

function formatContact(row: LeadPipelineRow) {
  return row.contact_email || row.contact_phone || row.website || 'Public source only'
}

function formatLastRun(value: string) {
  if (!value) {
    return 'Never run'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function packLabel(value: string) {
  return normalizeSolutionPack(value)
}

function loadTemplate(template: HuntTemplate) {
  return {
    searchName: template.name,
    searchQuery: template.query,
    searchKeywords: template.keywords.join(','),
  }
}

const STARTER_PACK_TASKS: Record<
  string,
  Array<{
    title: string
    owner: string
    priority: string
    due: string
    notes: string
    template: string
  }>
> = {
  'sales-setup': [
    {
      title: 'Run one narrow market search',
      owner: 'Revenue Pod',
      priority: 'high',
      due: 'Today',
      notes: 'Use Find Companies on one Myanmar market or one clear buyer type. Keep the shortlist narrow enough to act on today.',
      template: 'starter_sales_search',
    },
    {
      title: 'Keep 10 best-fit companies',
      owner: 'Revenue Pod',
      priority: 'high',
      due: 'Today',
      notes: 'Move only the strongest companies into the working list. Ignore the rest for now.',
      template: 'starter_sales_shortlist',
    },
    {
      title: 'Send first outreach and update stage',
      owner: 'Founder Desk',
      priority: 'medium',
      due: 'Tomorrow',
      notes: 'Open Gmail from each lead card, send the first message, and move the lead stage the same day.',
      template: 'starter_sales_outreach',
    },
  ],
  'company-cleanup': [
    {
      title: 'Import the raw company list',
      owner: 'List Clerk',
      priority: 'high',
      due: 'Today',
      notes: 'Paste or upload the current spreadsheet, export, or copied names. Start from the file the team already trusts most.',
      template: 'starter_company_import',
    },
    {
      title: 'Tag the rows that are ready to contact',
      owner: 'List Clerk',
      priority: 'high',
      due: 'Today',
      notes: 'Mark only rows with enough contact clues or clear fit. Do not try to clean the whole file at once.',
      template: 'starter_company_tag',
    },
    {
      title: 'Assign the next step for each kept company',
      owner: 'Revenue Pod',
      priority: 'medium',
      due: 'Tomorrow',
      notes: 'Create one follow-up action beside each kept row so the list becomes a working queue, not another spreadsheet.',
      template: 'starter_company_followup',
    },
  ],
  'receiving-control': [
    {
      title: 'Log one receiving lane or supplier issue',
      owner: 'Delivery Pod',
      priority: 'high',
      due: 'Today',
      notes: 'Start with one inbound lane, supplier, or recurring hold. Keep the first setup narrow.',
      template: 'starter_receiving_log',
    },
    {
      title: 'Assign one owner for each open issue',
      owner: 'Delivery Pod',
      priority: 'high',
      due: 'Today',
      notes: 'Every hold, shortage, or GRN gap should have one clear owner and one next step.',
      template: 'starter_receiving_owner',
    },
    {
      title: 'Review open holds in one short daily check',
      owner: 'Founder Desk',
      priority: 'medium',
      due: 'Tomorrow',
      notes: 'Use the task list as the daily review surface until the receiving flow is stable.',
      template: 'starter_receiving_review',
    },
  ],
}

export function LeadPipelinePage() {
  const templateDefaults = loadTemplate(defaultHuntTemplate())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pipeline, setPipeline] = useState<LeadPipelineResponse | null>(null)
  const [hunts, setHunts] = useState<LeadHuntProfile[]>([])
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [searchName, setSearchName] = useState(templateDefaults.searchName)
  const [searchQuery, setSearchQuery] = useState(templateDefaults.searchQuery)
  const [searchKeywords, setSearchKeywords] = useState(templateDefaults.searchKeywords)
  const [searchLimit, setSearchLimit] = useState(8)

  const loadData = useCallback(async () => {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const session = await getWorkspaceSession()
    if (!session.authenticated) {
      throw new Error('Login is required to open the sales workspace.')
    }

    const [pipelinePayload, huntPayload, taskPayload] = await Promise.all([
      workspaceFetch<LeadPipelineResponse & { status: string; count: number }>('/api/lead-pipeline'),
      workspaceFetch<{ status: string; count: number; rows: LeadHuntProfile[] }>('/api/lead-hunts'),
      workspaceFetch<{ status: string; count: number; rows: WorkspaceTaskRow[] }>('/api/workspace-tasks?status=open&limit=50'),
    ])

    setPipeline({
      summary: pipelinePayload.summary,
      rows: pipelinePayload.rows,
    })
    setHunts(huntPayload.rows ?? [])
    setTasks(taskPayload.rows ?? [])
    setNoteDrafts(
      Object.fromEntries(
        (pipelinePayload.rows ?? []).map((row) => [row.lead_id, row.notes || '']),
      ),
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await loadData()
        if (!cancelled) {
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load the sales workspace.')
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
  }, [loadData])

  const keywordList = useMemo(
    () =>
      searchKeywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [searchKeywords],
  )

  const stageCounts = useMemo(
    () => ({
      total: pipeline?.summary.lead_count ?? 0,
      offerReady: pipeline?.summary.by_stage.offer_ready ?? 0,
      discovery: pipeline?.summary.by_stage.discovery ?? 0,
      activeSearches: hunts.filter((hunt) => hunt.status === 'active').length,
      openTasks: tasks.length,
    }),
    [hunts, pipeline, tasks],
  )

  const packCounts = useMemo(
    () =>
      (pipeline?.rows ?? []).reduce(
        (current, row) => {
          const key = normalizeSolutionPack(row.service_pack)
          if (key === 'Company Cleanup') {
            current.companyCleanup += 1
          } else if (key === 'Receiving Control') {
            current.receivingControl += 1
          } else {
            current.salesSetup += 1
          }
          return current
        },
        {
          salesSetup: 0,
          companyCleanup: 0,
          receivingControl: 0,
        },
      ),
    [pipeline],
  )

  async function saveSearchProfile() {
    if (!searchName.trim() || !searchQuery.trim()) {
      setMessage('Enter a search name and query first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await workspaceFetch<{ profile: LeadHuntProfile }>('/api/lead-hunts', {
        method: 'POST',
        body: JSON.stringify({
          name: searchName.trim(),
          query: searchQuery.trim(),
          raw_text: '',
          keywords: keywordList,
          sources: ['maps', 'web'],
          limit: searchLimit,
          campaign_goal: 'Open one SuperMega pilot conversation.',
          export_workspace: true,
          owner: 'Growth Studio',
          status: 'active',
        }),
      })
      setMessage('Saved this hunt. Run it again whenever you want fresh targets.')
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not save the search.')
    } finally {
      setBusy(false)
    }
  }

  async function runSearchNow() {
    if (!searchQuery.trim()) {
      setMessage('Enter a search query first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<HuntRunResponse>('/api/tools/lead-hunt', {
        method: 'POST',
        body: JSON.stringify({
          query: searchQuery.trim(),
          raw_text: '',
          keywords: keywordList,
          sources: ['maps', 'web'],
          limit: searchLimit,
          campaign_goal: 'Open one SuperMega pilot conversation.',
          export_workspace: true,
        }),
      })
      setMessage(payload.summary || `Saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'} from this search.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the search.')
    } finally {
      setBusy(false)
    }
  }

  async function runSavedSearch(huntId: string) {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<HuntRunResponse>(`/api/lead-hunts/${encodeURIComponent(huntId)}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setMessage(payload.summary || `Saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'} from the saved search.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the saved search.')
    } finally {
      setBusy(false)
    }
  }

  async function runAllSearches() {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<{ count: number; saved_count: number }>('/api/lead-hunts/run-active', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setMessage(`Ran ${payload.count} saved search${payload.count === 1 ? '' : 'es'} and saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'}.`)
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the saved searches.')
    } finally {
      setBusy(false)
    }
  }

  async function saveLead(leadId: string, patch: { stage?: string; notes?: string }) {
    setBusy(true)
    setMessage('')
    try {
      await workspaceFetch(`/api/lead-pipeline/${encodeURIComponent(leadId)}`, {
        method: 'POST',
        body: JSON.stringify(patch),
      })
      setMessage('Lead updated.')
      await loadData()
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not update the lead.')
    } finally {
      setBusy(false)
    }
  }

  async function openGmailOutreach(leadId: string) {
    setBusy(true)
    setMessage('')
    try {
      const payload = await workspaceFetch<LeadOutreachResponse>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/outreach/gmail`, {
        method: 'POST',
        body: JSON.stringify({ create_gmail_draft: false }),
      })
      const composeUrl = payload.draft?.compose_url?.trim()
      if (composeUrl) {
        window.open(composeUrl, '_blank', 'noopener,noreferrer')
      }
      setMessage(payload.draft?.message?.trim() || 'Opened Gmail compose for this lead.')
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not open Gmail compose.')
    } finally {
      setBusy(false)
    }
  }

  async function copyOutreach(row: LeadPipelineRow) {
    const lines = [
      row.outreach_subject,
      '',
      row.outreach_message,
      '',
      'Discovery questions:',
      ...row.discovery_questions.slice(0, 3).map((question) => `- ${question}`),
    ]
    await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
    setMessage(`Copied outreach for ${row.company_name}.`)
  }

  async function copyOfferBrief(row: LeadPipelineRow) {
    const normalizedPack = packLabel(row.service_pack)
    const lines = [
      row.company_name,
      `Best fit: ${normalizedPack}`,
      `Wedge: ${row.wedge_product || defaultWedgeProduct(row.service_pack)}`,
      `Starter tools: ${(row.starter_modules ?? []).join(', ') || defaultStarterModules(row.service_pack).join(', ')}`,
      '',
      'Questions to ask:',
      ...row.discovery_questions.slice(0, 3).map((question) => `- ${question}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setMessage(`Copied offer brief for ${row.company_name}.`)
  }

  function applyTemplate(template: HuntTemplate) {
    const next = loadTemplate(template)
    setSearchName(next.searchName)
    setSearchQuery(next.searchQuery)
    setSearchKeywords(next.searchKeywords)
    setMessage(`Loaded search play: ${template.name}.`)
  }

  async function applyStarterPack(solutionId: string) {
    const solution = CORE_SOLUTIONS.find((item) => item.id === solutionId)
    const tasksToCreate = STARTER_PACK_TASKS[solutionId] ?? []
    if (!solution || !tasksToCreate.length) {
      setMessage('This starter pack is not configured yet.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await createWorkspaceTasks(tasksToCreate)
      if (solutionId === 'sales-setup') {
        const next = loadTemplate(defaultHuntTemplate())
        setSearchName(next.searchName)
        setSearchQuery(next.searchQuery)
        setSearchKeywords(next.searchKeywords)
      }
      await loadData()
      setMessage(
        solutionId === 'sales-setup'
          ? `Applied ${solution.name}. The first queue is ready and the recommended market search is loaded.`
          : `Applied ${solution.name}. The first queue is ready for the team.`,
      )
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : `Could not apply ${solution.name}.`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading sales workspace...</section>
  }

  if (error) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">{error}</section>
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Sales control"
        title="Sell one simple setup at a time."
        description="Run saved hunts, sort leads into three repeatable offers, and push the next step into the queue."
      />

      <section className="grid gap-4 md:grid-cols-5">
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Total leads</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.total}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Offer ready</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.offerReady}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Discovery</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.discovery}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Saved hunts</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.activeSearches}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Open tasks</p>
          <p className="mt-2 text-3xl font-bold">{stageCounts.openTasks}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">What SuperMega sells</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Three core offers only.</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Each pack should create the first queue immediately. No blank rollout.</p>
            </div>
            <Link className="sm-button-secondary" to="/app/director">
              Open director
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {CORE_SOLUTIONS.map((solution) => (
              <article className="sm-proof-card" key={solution.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{solution.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{solution.promise}</p>
                  </div>
                  <span className="sm-status-pill">{solution.modules[0]}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Best buyer</p>
                    <p className="mt-2 text-sm">{solution.buyer}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">When to sell</p>
                    <p className="mt-2 text-sm">{solution.pain}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Pilot shape</p>
                    <p className="mt-2 text-sm">{solution.pilot}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {solution.modules.map((module) => (
                    <span className="sm-status-pill" key={module}>
                      {module}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="sm-button-primary" disabled={busy} onClick={() => void applyStarterPack(solution.id)} type="button">
                    Apply starter pack
                  </button>
                  <span className="self-center text-xs text-[var(--sm-muted)]">Creates the first owned tasks for this offer.</span>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Easy add-ons</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {QUICK_WIN_PRODUCTS.map((product) => (
                <div className="sm-chip text-white" key={product.id}>
                  <p className="font-semibold">{product.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.useCase}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Why use Find Companies internally</p>
          <h2 className="mt-2 text-2xl font-bold text-white">This closes the loop after search.</h2>
          <div className="mt-5 grid gap-3">
            {FINDER_ADVANTAGES.map((item) => (
              <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                {item}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Search plays</p>
            <div className="mt-3 space-y-3">
              {HUNT_TEMPLATES.map((template) => (
                <button
                  className="sm-proof-card w-full text-left"
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{template.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{template.why}</p>
                    </div>
                    <span className="sm-status-pill">Load</span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--sm-muted)]">{template.query}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Sales Setup</p>
              <p className="mt-2 text-2xl font-bold">{packCounts.salesSetup}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Company Cleanup</p>
              <p className="mt-2 text-2xl font-bold">{packCounts.companyCleanup}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Receiving Control</p>
              <p className="mt-2 text-2xl font-bold">{packCounts.receivingControl}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Internal hunt</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Run or save a market search.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/leads/advanced">
              Advanced view
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Search name
              <input className="sm-input" onChange={(event) => setSearchName(event.target.value)} value={searchName} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Query
              <input className="sm-input" onChange={(event) => setSearchQuery(event.target.value)} value={searchQuery} />
            </label>
            <div className="grid gap-4 md:grid-cols-[1fr_120px]">
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Keywords
                <input className="sm-input" onChange={(event) => setSearchKeywords(event.target.value)} value={searchKeywords} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Limit
                <select className="sm-input" onChange={(event) => setSearchLimit(Number(event.target.value) || 8)} value={searchLimit}>
                  {[6, 8, 10, 12].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy} onClick={() => void runSearchNow()} type="button">
              {busy ? 'Running...' : 'Run now'}
            </button>
            <button className="sm-button-secondary" disabled={busy} onClick={() => void saveSearchProfile()} type="button">
              Save search
            </button>
            <button className="sm-button-secondary" disabled={busy || !hunts.length} onClick={() => void runAllSearches()} type="button">
              Run all saved
            </button>
          </div>

          {message ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">{message}</div> : null}

          <div className="mt-5 space-y-3">
            {hunts.length ? (
              hunts.map((hunt) => (
                <div className="sm-chip" key={hunt.hunt_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{hunt.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{hunt.query}</p>
                    </div>
                    <button className="sm-button-secondary" disabled={busy} onClick={() => void runSavedSearch(hunt.hunt_id)} type="button">
                      Run
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-[var(--sm-muted)]">
                    {hunt.last_saved_count ? `Last run saved ${hunt.last_saved_count} leads.` : 'No saved run yet.'} {formatLastRun(hunt.last_run_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No saved hunts yet. Save the good ones and rerun them instead of starting from zero.</div>
            )}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Pipeline today</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Work the right leads.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {pipeline?.rows?.length ? (
              pipeline.rows.map((row) => (
                <div className="sm-proof-card" key={row.lead_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.company_name}</p>
                      <p className="mt-1 text-sm text-[var(--sm-muted)]">{formatContact(row)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="sm-status-pill">Score {row.score}</span>
                      <span className="sm-status-pill">{stageLabel(row.stage)}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Best fit</p>
                      <p className="mt-2 font-semibold">{packLabel(row.service_pack)}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Wedge: {row.wedge_product || defaultWedgeProduct(row.service_pack)}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">First tools</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(row.starter_modules?.length ? row.starter_modules : defaultStarterModules(row.service_pack)).map((module) => (
                          <span className="sm-status-pill" key={module}>
                            {module}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {row.discovery_questions?.length ? (
                    <div className="mt-4">
                      <p className="sm-kicker text-[var(--sm-accent)]">Questions to ask</p>
                      <ul className="mt-2 grid gap-2 text-sm text-[var(--sm-muted)]">
                        {row.discovery_questions.slice(0, 2).map((question) => (
                          <li className="sm-chip" key={question}>
                            {question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                    <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                      Stage
                      <select
                        className="sm-input"
                        onChange={(event) => void saveLead(row.lead_id, { stage: event.target.value })}
                        value={row.stage}
                      >
                        {stageOptions.map((stage) => (
                          <option key={stage.value} value={stage.value}>
                            {stage.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                      Notes
                      <div className="flex gap-3">
                        <input
                          className="sm-input"
                          onChange={(event) =>
                            setNoteDrafts((current) => ({
                              ...current,
                              [row.lead_id]: event.target.value,
                            }))
                          }
                          placeholder="What happened, what is blocked, what is next?"
                          value={noteDrafts[row.lead_id] ?? ''}
                        />
                        <button
                          className="sm-button-secondary shrink-0"
                          disabled={busy}
                          onClick={() => void saveLead(row.lead_id, { notes: noteDrafts[row.lead_id] ?? '' })}
                          type="button"
                        >
                          Save
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="sm-button-primary" disabled={busy} onClick={() => void openGmailOutreach(row.lead_id)} type="button">
                      Open Gmail
                    </button>
                    <button className="sm-button-secondary" onClick={() => void copyOutreach(row)} type="button">
                      Copy outreach
                    </button>
                    <button className="sm-button-secondary" onClick={() => void copyOfferBrief(row)} type="button">
                      Copy offer
                    </button>
                    {row.source_url ? (
                      <a className="sm-button-secondary" href={row.source_url} rel="noreferrer" target="_blank">
                        Open source
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No saved leads yet. Run one hunt, save the right companies, and come back here to work one setup at a time.</div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Next actions</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What the team should do next.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {tasks.length ? (
              tasks.slice(0, 8).map((task) => (
                <div className="sm-chip" key={task.task_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{task.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{task.notes || 'No note yet.'}</p>
                    </div>
                    <span className="sm-status-pill">{task.priority}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--sm-muted)]">
                    <span>Owner: {task.owner || 'Sales'}</span>
                    <span>Due: {task.due || 'This week'}</span>
                    <span>Template: {task.template || 'manual'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No open tasks yet. Saving leads should start the first follow-up automatically.</div>
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating rule</p>
          <h2 className="mt-2 text-2xl font-bold text-white">How SuperMega should actually sell.</h2>
          <div className="mt-5 grid gap-3">
            {[
              'Start from one narrow market or one imported list, not a huge segment.',
              'Map each lead to one setup offer only: Sales Setup, Company Cleanup, or Receiving Control.',
              'Open Gmail from the lead card, then move the stage the same day.',
              'Keep every next step in the queue so search, list cleanup, and follow-up stay connected.',
            ].map((item) => (
              <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
