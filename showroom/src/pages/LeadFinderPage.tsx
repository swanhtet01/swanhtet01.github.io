import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'
import { downloadLeadCsv, LEAD_SAMPLE_QUERY, LEAD_SAMPLE_TEXT, type LeadRow, type LeadSource, parseLeads } from '../lib/tooling'

const sourceLabels: Array<{ key: LeadSource; label: string; hint: string }> = [
  { key: 'web', label: 'Websites', hint: 'Find company sites and directories' },
  { key: 'social', label: 'Social', hint: 'Pull public profile clues' },
  { key: 'maps', label: 'Maps', hint: 'Look for listings and location pages' },
]

type LeadOpportunity = {
  name: string
  archetype: string
  stage: string
  status: string
  owner: string
  service_pack: string
  wedge_product: string
  starter_modules: string[]
  semi_products: string[]
  pain_signals: string[]
  why_now: string
  pilot_scope: string
  outreach_subject: string
  outreach_message: string
  discovery_questions: string[]
  source_url: string
  contact_hint: string
  email: string
  phone: string
  website: string
  source: string
  provider: string
  score: number
}

type LeadToPilotPayload = {
  summary: string
  engine?: string
  dominant_archetype: string
  recommended_play: {
    wedge_product: string
    service_pack: string
    starter_modules: string[]
    semi_products: string[]
  }
  opportunity_count: number
  opportunities: LeadOpportunity[]
}

type LeadPipelineRow = {
  lead_id: string
  company_name: string
  stage: string
  status: string
  owner: string
  service_pack: string
  wedge_product: string
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

type LeadActivity = {
  activity_id: string
  lead_id: string
  created_at: string
  actor: string
  activity_type: string
  channel: string
  direction: string
  message: string
  stage_after: string
  next_step: string
}

type LeadActivityDraft = {
  activity_type: string
  channel: string
  direction: string
  message: string
  stage_after: string
  next_step: string
}

type LeadOutreachResponse = {
  status: string
  draft?: {
    status?: string
    compose_url?: string
    draft_id?: string
    message?: string
  }
  activities?: LeadActivity[]
}

type LeadHuntPayload = {
  status: string
  provider: string
  engine: string
  row_count: number
  saved_count: number
  summary: string
  export?: {
    web_view_link?: string
  } | null
}

const defaultActivityDraft = (message = ''): LeadActivityDraft => ({
  activity_type: 'note',
  channel: 'email',
  direction: 'outbound',
  message,
  stage_after: '',
  next_step: '',
})

const stageLabel: Record<string, string> = {
  offer_ready: 'Offer ready',
  contacted: 'Contacted',
  discovery: 'Discovery',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

function formatActivityTime(value: string) {
  if (!value) {
    return 'recent'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export function LeadFinderPage() {
  const location = useLocation()
  const isPrivateApp = location.pathname.startsWith('/app/')
  const [apiReady, setApiReady] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState('spa,wellness,massage,yangon')
  const [limit, setLimit] = useState(8)
  const [sources, setSources] = useState<Record<LeadSource, boolean>>({ web: true, social: true, maps: true })
  const [manualInput, setManualInput] = useState('')
  const [rows, setRows] = useState<LeadRow[]>([])
  const [provider, setProvider] = useState('')
  const [shortlist, setShortlist] = useState<string[]>([])
  const [campaignGoal, setCampaignGoal] = useState('Book 3 discovery calls with companies still running on Gmail, Drive, Sheets, and manual follow-up.')
  const [offerBusy, setOfferBusy] = useState(false)
  const [leadPack, setLeadPack] = useState<LeadToPilotPayload | null>(null)
  const [leadHuntBusy, setLeadHuntBusy] = useState(false)
  const [leadHunt, setLeadHunt] = useState<LeadHuntPayload | null>(null)
  const [pipelineBusy, setPipelineBusy] = useState(false)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipeline, setPipeline] = useState<LeadPipelineResponse | null>(null)
  const [activitiesByLead, setActivitiesByLead] = useState<Record<string, LeadActivity[]>>({})
  const [activityDrafts, setActivityDrafts] = useState<Record<string, LeadActivityDraft>>({})

  const loadActivitiesForLeadIds = useCallback(
    async (leadIds: string[]) => {
      if (!authenticated || !leadIds.length) {
        setActivitiesByLead({})
        return
      }
      const uniqueIds = [...new Set(leadIds.filter(Boolean))]
      const results = await Promise.all(
        uniqueIds.map(async (leadId) => {
          try {
            const payload = await workspaceFetch<{ rows: LeadActivity[] }>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/activities`)
            return [leadId, payload.rows ?? []] as const
          } catch {
            return [leadId, []] as const
          }
        }),
      )
      setActivitiesByLead(Object.fromEntries(results))
      setActivityDrafts((current) => {
        const next = { ...current }
        for (const [leadId] of results) {
          if (!next[leadId]) {
            next[leadId] = defaultActivityDraft()
          }
        }
        return next
      })
    },
    [authenticated],
  )

  const loadPipeline = useCallback(async () => {
    if (!authenticated) {
      setPipeline(null)
      setActivitiesByLead({})
      return
    }
    try {
      const payload = await workspaceFetch<LeadPipelineResponse & { status: string; count: number }>('/api/lead-pipeline')
      const nextPipeline = {
        summary: payload.summary,
        rows: payload.rows,
      }
      setPipeline(nextPipeline)
      await loadActivitiesForLeadIds(nextPipeline.rows.map((row) => row.lead_id))
    } catch {
      setPipeline(null)
      setActivitiesByLead({})
    }
  }, [authenticated, loadActivitiesForLeadIds])

  useEffect(() => {
    let cancelled = false

    async function loadApiState() {
      const result = await checkWorkspaceHealth()
      if (cancelled) {
        return
      }
      setApiReady(result.ready)
      let canLoadPipeline = false
      if (result.ready) {
        try {
          const session = await getWorkspaceSession()
          if (cancelled) {
            return
          }
          canLoadPipeline = Boolean(session.authenticated)
          setAuthenticated(canLoadPipeline)
        } catch {
          if (!cancelled) {
            setAuthenticated(false)
          }
        }
      } else {
        setAuthenticated(false)
      }
      if (result.ready && canLoadPipeline && !cancelled) {
        await loadPipeline()
      }
      if (!cancelled) {
        setAuthLoading(false)
      }
    }

    void loadApiState()
    return () => {
      cancelled = true
    }
  }, [loadPipeline])

  const selectedSources = useMemo(
    () =>
      (Object.entries(sources) as Array<[LeadSource, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([source]) => source),
    [sources],
  )

  const shortlistedRows = rows.filter((row) => shortlist.includes(row.name))
  const leadPackRows = shortlistedRows.length ? shortlistedRows : rows.slice(0, 3)

  async function runSearch({ nextQuery = query, nextInput = manualInput }: { nextQuery?: string; nextInput?: string } = {}) {
    setBusy(true)
    setLeadPack(null)
    setLeadHunt(null)
    setPipelineMessage('')
    try {
      if (apiReady && (nextQuery.trim() || nextInput.trim())) {
        const payload = await workspaceFetch<{ rows: LeadRow[]; provider?: string }>('/api/tools/lead-finder', {
          method: 'POST',
          body: JSON.stringify({
            raw_text: nextInput,
            query: nextQuery,
            keywords: keywords
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            sources: selectedSources,
            limit,
          }),
        })
        setRows(payload.rows ?? [])
        setProvider(payload.provider ?? '')
        return
      }

      setRows(parseLeads(nextInput))
      setProvider(nextInput.trim() ? 'Manual fallback' : 'Offline shell')
    } finally {
      setBusy(false)
    }
  }

  function toggleShortlist(name: string) {
    setShortlist((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  async function buildLeadPack() {
    if (leadPackRows.length === 0) {
      setLeadPack(null)
      return
    }

    setOfferBusy(true)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<LeadToPilotPayload>('/api/tools/lead-to-pilot', {
          method: 'POST',
          body: JSON.stringify({
            leads: leadPackRows,
            campaign_goal: campaignGoal,
          }),
        })
        setLeadPack(payload)
        return
      }

      setLeadPack({
        summary: 'Live offer building needs the app backend. You can still shortlist leads here, but the proper sales pack is generated on the live app host.',
        dominant_archetype: 'manual',
        recommended_play: {
          wedge_product: 'Action OS',
          service_pack: 'Owner / Director OS',
          starter_modules: ['Action OS'],
          semi_products: ['Director Flash'],
        },
        opportunity_count: leadPackRows.length,
        opportunities: leadPackRows.map((row) => ({
          name: row.name,
          archetype: 'manual',
          stage: 'offer_ready',
          status: 'open',
          owner: 'Growth Studio',
          service_pack: 'Owner / Director OS',
          wedge_product: 'Action OS',
          starter_modules: ['Action OS'],
          semi_products: ['Director Flash'],
          pain_signals: ['Run the app backend to generate a real lead-specific offer.'],
          why_now: 'Start with one live management board first.',
          pilot_scope: 'Launch one Action OS board for the target lead.',
          outreach_subject: `${row.name}: Action OS pilot`,
          outreach_message: `Hi ${row.name} team, we help companies turn messy follow-up into one live operating board.`,
          discovery_questions: ['What still depends on manual chasing today?'],
          source_url: row.source_url,
          contact_hint: row.email || row.phone || row.website || 'Public source only',
          email: row.email,
          phone: row.phone,
          website: row.website,
          source: row.source,
          provider: row.provider,
          score: row.score,
        })),
      })
    } finally {
      setOfferBusy(false)
    }
  }

  async function saveLeadPackToPipeline() {
    if (!apiReady || !leadPack?.opportunities.length) {
      return
    }
    setPipelineBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<LeadPipelineResponse & { saved_count: number; status: string }>('/api/lead-pipeline/import', {
        method: 'POST',
        body: JSON.stringify({
          rows: leadPack.opportunities,
          campaign_goal: campaignGoal,
        }),
      })
      const nextPipeline = {
        summary: payload.summary,
        rows: payload.rows,
      }
      setPipeline(nextPipeline)
      await loadActivitiesForLeadIds(nextPipeline.rows.map((row) => row.lead_id))
      setPipelineMessage(`Saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'} into the pipeline.`)
    } catch {
      setPipelineMessage(authenticated ? 'Could not save the lead pack into the pipeline.' : 'Login is required before the lead pack can be saved.')
    } finally {
      setPipelineBusy(false)
    }
  }

  async function runLeadHunt() {
    if (!apiReady || !authenticated) {
      setPipelineMessage('Login is required before the agent can run the hunt for you.')
      return
    }
    setLeadHuntBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<LeadHuntPayload & { pipeline?: LeadPipelineResponse }>('/api/tools/lead-hunt', {
        method: 'POST',
        body: JSON.stringify({
          query,
          raw_text: manualInput,
          keywords: keywords
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          sources: selectedSources,
          limit,
          campaign_goal: campaignGoal,
          export_workspace: true,
        }),
      })
      setLeadHunt(payload)
      if (payload.pipeline) {
        setPipeline({
          summary: payload.pipeline.summary,
          rows: payload.pipeline.rows,
        })
        await loadActivitiesForLeadIds((payload.pipeline.rows ?? []).map((row) => row.lead_id))
      } else {
        await loadPipeline()
      }
      setPipelineMessage(payload.export?.web_view_link ? `Hunt ran and exported. ${payload.export.web_view_link}` : 'Hunt ran and saved the pipeline.')
    } catch (error) {
      setPipelineMessage(error instanceof Error ? error.message : 'Could not run the autonomous hunt.')
    } finally {
      setLeadHuntBusy(false)
    }
  }

  async function exportPipelineToWorkspace() {
    if (!apiReady) {
      return
    }
    setPipelineBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<{
        status: string
        export?: { web_view_link?: string; row_count?: number }
      }>('/api/lead-pipeline/export/workspace', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const link = payload.export?.web_view_link?.trim()
      setPipelineMessage(link ? `Lead pipeline exported to Google Workspace. ${link}` : 'Lead pipeline exported to Google Workspace.')
    } catch (error) {
      setPipelineMessage(
        error instanceof Error && 'status' in error && (error as Error & { status?: number }).status === 401
          ? 'Login is required before the pipeline can be exported.'
          : error instanceof Error
            ? error.message
            : 'Could not export the pipeline to Google Workspace.',
      )
    } finally {
      setPipelineBusy(false)
    }
  }

  async function saveLeadActivity(leadId: string) {
    if (!apiReady || !authenticated) {
      setPipelineMessage('Login is required before saving activity.')
      return
    }
    const draft = activityDrafts[leadId] ?? defaultActivityDraft()
    if (!draft.message.trim()) {
      setPipelineMessage('Add a message before saving lead activity.')
      return
    }
    setPipelineBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<{ activities: LeadActivity[] }>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: draft.activity_type,
          channel: draft.channel,
          direction: draft.direction,
          message: draft.message,
          stage_after: draft.stage_after,
          next_step: draft.next_step,
        }),
      })
      setActivitiesByLead((current) => ({ ...current, [leadId]: payload.activities ?? current[leadId] ?? [] }))
      setActivityDrafts((current) => ({ ...current, [leadId]: defaultActivityDraft() }))
      setPipelineMessage('Lead activity saved.')
      await loadPipeline()
    } catch {
      setPipelineMessage('Could not save the lead activity.')
    } finally {
      setPipelineBusy(false)
    }
  }

  async function moveLeadStage(leadId: string, stage: string) {
    if (!apiReady || !authenticated) {
      setPipelineMessage('Login is required before moving the lead.')
      return
    }
    const nextStep = stage === 'contacted' ? 'Wait for reply or send one follow-up.' : stage === 'discovery' ? 'Schedule discovery call.' : ''
    setPipelineBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<{ activities: LeadActivity[] }>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: 'stage_change',
          channel: 'workflow',
          direction: 'internal',
          message: `Moved lead to ${stageLabel[stage] ?? stage}.`,
          stage_after: stage,
          next_step: nextStep,
        }),
      })
      setActivitiesByLead((current) => ({ ...current, [leadId]: payload.activities ?? current[leadId] ?? [] }))
      setPipelineMessage(`Lead moved to ${stageLabel[stage] ?? stage}.`)
      await loadPipeline()
    } catch {
      setPipelineMessage('Could not move the lead stage.')
    } finally {
      setPipelineBusy(false)
    }
  }

  async function copyText(value: string, leadId?: string) {
    if (!value) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setPipelineMessage('Copied to clipboard.')
      if (leadId) {
        setActivityDrafts((current) => ({
          ...current,
          [leadId]: {
            ...(current[leadId] ?? defaultActivityDraft()),
            activity_type: 'outreach_draft',
            channel: 'email',
            direction: 'outbound',
            message: value,
          },
        }))
      }
    } catch {
      setPipelineMessage('Could not copy to clipboard on this browser.')
    }
  }

  async function openGmailOutreach(leadId: string) {
    if (!apiReady || !authenticated) {
      setPipelineMessage('Login is required before opening Gmail outreach.')
      return
    }
    setPipelineBusy(true)
    setPipelineMessage('')
    try {
      const payload = await workspaceFetch<LeadOutreachResponse>(`/api/lead-pipeline/${encodeURIComponent(leadId)}/outreach/gmail`, {
        method: 'POST',
        body: JSON.stringify({ create_gmail_draft: false }),
      })
      const composeUrl = payload.draft?.compose_url?.trim()
      if (composeUrl) {
        window.open(composeUrl, '_blank', 'noopener,noreferrer')
      }
      setActivitiesByLead((current) => ({ ...current, [leadId]: payload.activities ?? current[leadId] ?? [] }))
      setPipelineMessage(payload.draft?.message?.trim() || 'Opened Gmail compose for this lead.')
      await loadPipeline()
    } catch (error) {
      setPipelineMessage(error instanceof Error ? error.message : 'Could not open Gmail outreach.')
    } finally {
      setPipelineBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isPrivateApp ? 'Private app' : 'Proof tool'}
        title="Lead Finder"
        description={
          isPrivateApp
            ? 'Search, shape the offer, and move leads through the live pipeline.'
            : 'Search real businesses and let the agent turn them into an offer-ready shortlist.'
        }
      />

      {!apiReady && !isPrivateApp ? (
        <section className="sm-chip border-[rgba(255,122,24,0.22)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-muted)]">
          This host is only the public shell. Live search, saved pipeline, and Workspace export work on the app host with the backend attached.
        </section>
      ) : !authLoading && !authenticated && !isPrivateApp ? (
        <section className="sm-chip border-[rgba(37,208,255,0.2)] bg-[rgba(37,208,255,0.08)] text-[var(--sm-muted)]">
          Search works here. Login is required to save the pipeline, keep an outreach history, and export the queue to Google Workspace.
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Search setup</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Tell it what to hunt.</h2>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Search intent
              <input
                className="sm-input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="For example: spa in yangon"
                value={query}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Fit keywords
              <input className="sm-input" onChange={(event) => setKeywords(event.target.value)} value={keywords} />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              {sourceLabels.map((source) => (
                <button
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    sources[source.key]
                      ? 'border-[rgba(37,208,255,0.34)] bg-[rgba(37,208,255,0.1)] text-white'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] text-[var(--sm-muted)]'
                  }`}
                  key={source.key}
                  onClick={() => setSources((current) => ({ ...current, [source.key]: !current[source.key] }))}
                  type="button"
                >
                  <p className="font-semibold">{source.label}</p>
                  <p className="mt-2 text-sm">{source.hint}</p>
                </button>
              ))}
            </div>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Result count
              <select className="sm-input" onChange={(event) => setLimit(Number(event.target.value))} value={limit}>
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
                <option value={12}>12</option>
              </select>
            </label>

            <details className="sm-chip">
              <summary className="cursor-pointer font-semibold text-white">Manual list fallback</summary>
              <div className="mt-3 grid gap-2">
                <textarea
                  className="min-h-40 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                  onChange={(event) => setManualInput(event.target.value)}
                  placeholder="Paste a lead list if you already have one."
                  value={manualInput}
                />
              </div>
            </details>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Find leads'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setQuery(LEAD_SAMPLE_QUERY)
                  setManualInput(LEAD_SAMPLE_TEXT)
                  void runSearch({ nextQuery: LEAD_SAMPLE_QUERY, nextInput: LEAD_SAMPLE_TEXT })
                }}
                type="button"
              >
                Load sample
              </button>
              <button className="sm-button-secondary" disabled={rows.length === 0} onClick={() => downloadLeadCsv(rows)} type="button">
                Export CSV
              </button>
            </div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Lead stream</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Results</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${rows.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {provider || 'Ready'}
            </span>
          </div>

        <div className="mt-5 space-y-3">
          {provider ? <div className="sm-chip text-[var(--sm-muted)]">Live search provider: {provider}</div> : null}
          {rows.length === 0 ? (
            <div className="sm-chip text-[var(--sm-muted)]">Run a search to see real leads, contact clues, and fit reasons.</div>
          ) : (
              rows.map((row) => {
                const isSaved = shortlist.includes(row.name)
                return (
                  <div className="sm-proof-card" key={`${row.name}-${row.source_url}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.name}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">{row.snippet || row.source || 'Public source result'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="sm-status-pill">Score {row.score}</span>
                        <button className={isSaved ? 'sm-button-accent' : 'sm-button-secondary'} onClick={() => toggleShortlist(row.name)} type="button">
                          {isSaved ? 'Shortlisted' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-sm text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                        <p className="mt-2">{row.email || 'No email found'}</p>
                        <p className="mt-1">{row.phone || 'No phone found'}</p>
                        <p className="mt-1 break-all">{row.website || 'No website found'}</p>
                      </div>
                      <div className="sm-chip text-sm text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Why it matched</p>
                        <ul className="mt-2 space-y-1">
                          {(row.fit_reasons.length ? row.fit_reasons : ['Public source matched your market search']).map((reason) => (
                            <li key={reason}>- {reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Offer builder</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Turn the shortlist into a sales play.</h2>

          <div className="mt-5 grid gap-3">
            {shortlistedRows.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">Shortlist a few leads first. If you skip that, the top three results will be used.</div>
            ) : (
              shortlistedRows.map((row) => (
                <div className="sm-chip" key={`shortlist-${row.name}`}>
                  <p className="font-semibold text-white">{row.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.email || row.phone || row.website || 'Public source only'}</p>
                </div>
              ))
            )}
          </div>

          <label className="mt-6 grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
            Campaign goal
            <textarea className="sm-input min-h-28" onChange={(event) => setCampaignGoal(event.target.value)} value={campaignGoal} />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" onClick={() => void buildLeadPack()} type="button">
              {offerBusy ? 'Building...' : 'Build offer'}
            </button>
            <button
              className="sm-button-accent"
              disabled={!apiReady || !authenticated || leadHuntBusy}
              onClick={() => void runLeadHunt()}
              type="button"
            >
              {leadHuntBusy ? 'Running hunt...' : 'Run autopilot'}
            </button>
            {isPrivateApp ? (
              <>
                <button
                  className="sm-button-secondary"
                  disabled={!apiReady || !authenticated || !leadPack?.opportunities.length || pipelineBusy}
                  onClick={() => void saveLeadPackToPipeline()}
                  type="button"
                >
                  {pipelineBusy ? 'Saving...' : 'Save to pipeline'}
                </button>
                <button className="sm-button-accent" disabled={!apiReady || !authenticated || pipelineBusy} onClick={() => void exportPipelineToWorkspace()} type="button">
                  Export to Workspace
                </button>
              </>
            ) : (
              <Link className="sm-button-secondary" to="/signup">
                Create workspace
              </Link>
            )}
          </div>

          {pipelineMessage ? <p className="mt-3 text-sm text-[var(--sm-muted)]">{pipelineMessage}</p> : null}
          {leadHunt ? (
            <div className="mt-4 sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Autopilot result</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{leadHunt.summary}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="sm-chip text-white">
                  <p className="text-sm font-semibold">{leadHunt.row_count} leads found</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="text-sm font-semibold">{leadHunt.saved_count} saved</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="text-sm font-semibold">{leadHunt.engine}</p>
                </div>
              </div>
            </div>
          ) : null}
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Lead to pilot</p>
          <h2 className="mt-3 text-2xl font-bold text-white">What to sell this shortlist.</h2>
      {leadPack ? (
        <div className="mt-5 space-y-4">
          <div className="sm-proof-card">
            {leadPack.engine ? <p className="sm-kicker text-[var(--sm-accent)]">Offer engine: {leadPack.engine}</p> : null}
            <p className="text-sm text-[var(--sm-muted)]">{leadPack.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Wedge</p>
                    <p className="mt-2">{leadPack.recommended_play.wedge_product}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Pack</p>
                    <p className="mt-2">{leadPack.recommended_play.service_pack}</p>
                  </div>
                </div>
              </div>

              {leadPack.opportunities.map((item) => (
                <div className="sm-chip text-white" key={`opportunity-${item.name}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.why_now}</p>
                    </div>
                    <span className="sm-status-pill">Score {item.score}</span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-sm text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
                      <p className="mt-2">{item.starter_modules.join(', ')}</p>
                    </div>
                    <div className="sm-chip text-sm text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Contact</p>
                      <p className="mt-2">{item.email || item.phone || item.website || 'Public source only'}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="sm-kicker text-[var(--sm-accent)]">Outreach subject</p>
                    <p className="mt-2 text-sm text-white">{item.outreach_subject}</p>
                  </div>
                  <div className="mt-4">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Outreach message</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.outreach_message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 sm-chip text-[var(--sm-muted)]">
              Build the offer to get the wedge product, service pack, pilot scope, and outreach draft.
            </div>
          )}
        </article>
      </section>

      {isPrivateApp ? (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Saved pipeline</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Private comms pipeline.</h2>
          </div>
          {authenticated ? (
            <Link className="sm-link" to="/app">
              Open private app
            </Link>
          ) : (
            <Link className="sm-link" to="/login?next=/app/leads">
              Login
            </Link>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <article className="sm-surface p-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Leads</p>
                <p className="mt-2 text-xl font-bold">{pipeline?.summary.lead_count ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Offer ready</p>
                <p className="mt-2 text-xl font-bold">{pipeline?.summary.by_stage.offer_ready ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Discovery</p>
                <p className="mt-2 text-xl font-bold">{pipeline?.summary.by_stage.discovery ?? 0}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">How to use it</p>
                <ol className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                  <li>1. Search and shortlist leads.</li>
                  <li>2. Build the offer and save the shortlist.</li>
                  <li>3. Copy the outreach and log the send.</li>
                  <li>4. Move the lead to discovery once they reply.</li>
                </ol>
              </div>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <div className="space-y-4">
              {pipeline?.rows?.length ? (
                pipeline.rows.map((row) => {
                  const draft = activityDrafts[row.lead_id] ?? defaultActivityDraft()
                  const activities = activitiesByLead[row.lead_id] ?? []
                  return (
                    <div className="sm-proof-card" key={row.lead_id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{row.company_name}</p>
                          <p className="mt-1 text-sm text-[var(--sm-muted)]">
                            {row.service_pack} · {row.wedge_product}
                          </p>
                        </div>
                        <span className="sm-status-pill">{stageLabel[row.stage] ?? row.stage}</span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="sm-chip text-sm text-white">
                          <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                          <p className="mt-2">{row.contact_email || row.contact_phone || row.website || 'Public source only'}</p>
                        </div>
                        <div className="sm-chip text-sm text-white">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next outreach</p>
                          <p className="mt-2">{row.outreach_subject}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          className="sm-button-primary"
                          disabled={pipelineBusy || !row.contact_email}
                          onClick={() => void openGmailOutreach(row.lead_id)}
                          type="button"
                        >
                          Open in Gmail
                        </button>
                        <button className="sm-button-secondary" onClick={() => void copyText(row.outreach_message, row.lead_id)} type="button">
                          Copy outreach
                        </button>
                        <button className="sm-button-secondary" onClick={() => void moveLeadStage(row.lead_id, 'contacted')} type="button">
                          Mark contacted
                        </button>
                        <button className="sm-button-accent" onClick={() => void moveLeadStage(row.lead_id, 'discovery')} type="button">
                          Move to discovery
                        </button>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent)]">Log activity</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                              Type
                              <select
                                className="sm-input"
                                onChange={(event) =>
                                  setActivityDrafts((current) => ({
                                    ...current,
                                    [row.lead_id]: { ...draft, activity_type: event.target.value },
                                  }))
                                }
                                value={draft.activity_type}
                              >
                                <option value="note">Note</option>
                                <option value="outreach">Outreach</option>
                                <option value="reply">Reply</option>
                                <option value="meeting">Meeting</option>
                                <option value="stage_change">Stage change</option>
                              </select>
                            </label>
                            <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                              Channel
                              <select
                                className="sm-input"
                                onChange={(event) =>
                                  setActivityDrafts((current) => ({
                                    ...current,
                                    [row.lead_id]: { ...draft, channel: event.target.value },
                                  }))
                                }
                                value={draft.channel}
                              >
                                <option value="email">Email</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="call">Call</option>
                                <option value="meeting">Meeting</option>
                                <option value="manual">Manual</option>
                              </select>
                            </label>
                          </div>

                          <label className="mt-3 grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                            Message
                            <textarea
                              className="sm-input min-h-28"
                              onChange={(event) =>
                                setActivityDrafts((current) => ({
                                  ...current,
                                  [row.lead_id]: { ...draft, message: event.target.value },
                                }))
                              }
                              placeholder="Log what was sent, what they replied, or the next thing you need to do."
                              value={draft.message}
                            />
                          </label>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                              Move stage after save
                              <select
                                className="sm-input"
                                onChange={(event) =>
                                  setActivityDrafts((current) => ({
                                    ...current,
                                    [row.lead_id]: { ...draft, stage_after: event.target.value },
                                  }))
                                }
                                value={draft.stage_after}
                              >
                                <option value="">Keep current stage</option>
                                <option value="contacted">Contacted</option>
                                <option value="discovery">Discovery</option>
                                <option value="proposal">Proposal</option>
                                <option value="won">Won</option>
                                <option value="lost">Lost</option>
                              </select>
                            </label>
                            <label className="grid gap-2 text-xs font-semibold text-[var(--sm-muted)]">
                              Next step
                              <input
                                className="sm-input"
                                onChange={(event) =>
                                  setActivityDrafts((current) => ({
                                    ...current,
                                    [row.lead_id]: { ...draft, next_step: event.target.value },
                                  }))
                                }
                                placeholder="For example: follow up next Tuesday"
                                value={draft.next_step}
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button className="sm-button-primary" disabled={pipelineBusy || !draft.message.trim()} onClick={() => void saveLeadActivity(row.lead_id)} type="button">
                              Save activity
                            </button>
                            <button
                              className="sm-button-secondary"
                              onClick={() =>
                                setActivityDrafts((current) => ({
                                  ...current,
                                  [row.lead_id]: defaultActivityDraft(row.outreach_message),
                                }))
                              }
                              type="button"
                            >
                              Load outreach
                            </button>
                          </div>
                        </div>

                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent activity</p>
                          <div className="mt-3 space-y-3">
                            {activities.length ? (
                              activities.map((activity) => (
                                <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3" key={activity.activity_id}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-white">
                                      {activity.activity_type} / {activity.channel}
                                    </p>
                                    <span className="text-xs text-[var(--sm-muted)]">{formatActivityTime(activity.created_at)}</span>
                                  </div>
                                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{activity.message}</p>
                                  {activity.stage_after || activity.next_step ? (
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--sm-muted)]">
                                      {activity.stage_after ? <span className="sm-status-pill">Stage: {stageLabel[activity.stage_after] ?? activity.stage_after}</span> : null}
                                      {activity.next_step ? <span className="sm-status-pill">Next: {activity.next_step}</span> : null}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--sm-muted)]">
                                No activity logged yet. Save the first outreach, reply, or next-step note here.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : apiReady && !authenticated ? (
                <div className="sm-chip text-[var(--sm-muted)]">
                  Login to keep a private lead pipeline, move leads through stages, and export the queue into Google Workspace.
                </div>
              ) : (
                <div className="sm-chip text-[var(--sm-muted)]">Save a lead pack to start the real pipeline.</div>
              )}
            </div>
          </article>
        </div>
      </section>
      ) : null}
    </div>
  )
}
