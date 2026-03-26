import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'
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

export function LeadFinderPage() {
  const [apiReady, setApiReady] = useState(false)
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
  const [pipelineBusy, setPipelineBusy] = useState(false)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipeline, setPipeline] = useState<LeadPipelineResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadApiState() {
      const result = await checkWorkspaceHealth()
      if (cancelled) {
        return
      }
      setApiReady(result.ready)
      if (result.ready) {
        await loadPipeline()
      }
    }

    void loadApiState()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedSources = useMemo(
    () =>
      (Object.entries(sources) as Array<[LeadSource, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([source]) => source),
    [sources],
  )

  const shortlistedRows = rows.filter((row) => shortlist.includes(row.name))
  const leadPackRows = shortlistedRows.length ? shortlistedRows : rows.slice(0, 3)

  async function loadPipeline() {
    try {
      const payload = await workspaceFetch<LeadPipelineResponse & { status: string; count: number }>('/api/lead-pipeline')
      setPipeline({
        summary: payload.summary,
        rows: payload.rows,
      })
    } catch {
      setPipeline(null)
    }
  }

  async function runSearch({ nextQuery = query, nextInput = manualInput }: { nextQuery?: string; nextInput?: string } = {}) {
    setBusy(true)
    setLeadPack(null)
    setPipelineMessage('')
    try {
      if (apiReady && (nextQuery.trim() || nextInput.trim())) {
        const payload = await workspaceFetch<{ rows: LeadRow[]; provider?: string }>(
          '/api/tools/lead-finder',
          {
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
          },
        )
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
      setPipeline({
        summary: payload.summary,
        rows: payload.rows,
      })
      setPipelineMessage(`Saved ${payload.saved_count} lead${payload.saved_count === 1 ? '' : 's'} into the pipeline.`)
    } catch {
      setPipelineMessage('Could not save the lead pack into the pipeline.')
    } finally {
      setPipelineBusy(false)
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
      setPipelineMessage(error instanceof Error ? error.message : 'Could not export the pipeline to Google Workspace.')
    } finally {
      setPipelineBusy(false)
    }
  }

  async function moveLeadStage(leadId: string, stage: string) {
    if (!apiReady) {
      return
    }
    setPipelineBusy(true)
    try {
      await workspaceFetch(`/api/lead-pipeline/${encodeURIComponent(leadId)}`, {
        method: 'POST',
        body: JSON.stringify({
          stage,
          status: stage === 'contacted' ? 'active' : 'open',
        }),
      })
      await loadPipeline()
    } finally {
      setPipelineBusy(false)
    }
  }

  async function copyText(value: string) {
    if (!value) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setPipelineMessage('Copied to clipboard.')
    } catch {
      setPipelineMessage('Could not copy to clipboard on this browser.')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Live product"
        title="Lead Finder"
        description="Search for real businesses, build the right SuperMega offer, save it into a pipeline, and push the pipeline into Google Workspace."
      />

      {!apiReady ? (
        <section className="sm-chip border-[rgba(255,122,24,0.22)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-muted)]">
          This host is only the public shell. Live search, saved pipeline, and Workspace export work on the app host with the backend attached.
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
            <button className="sm-button-secondary" disabled={!apiReady || !leadPack?.opportunities.length || pipelineBusy} onClick={() => void saveLeadPackToPipeline()} type="button">
              {pipelineBusy ? 'Saving...' : 'Save to pipeline'}
            </button>
            <button className="sm-button-accent" disabled={!apiReady || pipelineBusy} onClick={() => void exportPipelineToWorkspace()} type="button">
              Export to Workspace
            </button>
          </div>

          {pipelineMessage ? <p className="mt-3 text-sm text-[var(--sm-muted)]">{pipelineMessage}</p> : null}
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Lead to pilot</p>
          <h2 className="mt-3 text-2xl font-bold text-white">What to sell this shortlist.</h2>
          {leadPack ? (
            <div className="mt-5 space-y-4">
              <div className="sm-proof-card">
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

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Saved pipeline</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Real comms pipeline.</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Need outbound help?
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.84fr_1.16fr]">
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
                <p className="sm-kicker text-[var(--sm-accent)]">Contacted</p>
                <p className="mt-2 text-xl font-bold">{pipeline?.summary.by_stage.contacted ?? 0}</p>
              </div>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <div className="space-y-3">
              {pipeline?.rows?.length ? (
                pipeline.rows.map((row) => (
                  <div className="sm-proof-card" key={row.lead_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.company_name}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">
                          {row.service_pack} · {row.wedge_product}
                        </p>
                      </div>
                      <span className="sm-status-pill">{row.stage}</span>
                    </div>

                    <p className="mt-4 text-sm text-white">{row.contact_email || row.contact_phone || row.website || 'Public source only'}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.outreach_subject}</p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="sm-button-secondary" onClick={() => void copyText(row.outreach_message)} type="button">
                        Copy outreach
                      </button>
                      <button className="sm-button-secondary" onClick={() => void moveLeadStage(row.lead_id, 'contacted')} type="button">
                        Mark contacted
                      </button>
                      <button className="sm-button-accent" onClick={() => void moveLeadStage(row.lead_id, 'discovery')} type="button">
                        Move to discovery
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sm-chip text-[var(--sm-muted)]">Save a lead pack to start the real pipeline.</div>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
