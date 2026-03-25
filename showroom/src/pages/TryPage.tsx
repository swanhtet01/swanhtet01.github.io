import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trialModules } from '../content'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type TrialTab = 'lead-finder' | 'market-brief' | 'action-board'
type LeadSource = 'web' | 'social' | 'maps'

type LeadRow = {
  name: string
  email: string
  phone: string
  website: string
  source: string
  source_url: string
  snippet: string
  social_profiles: string[]
  fit_reasons: string[]
  provider: string
  score: number
}

type MarketOutput = {
  summary: string
  themes: string[]
  watchItems: string[]
  actions: string[]
}

type ActionRow = {
  title: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
}

const LEAD_SAMPLE_QUERY = 'spa in yangon'
const LEAD_SAMPLE_TEXT = `Shwe Auto House | www.shweautohouse.com | sales@shweautohouse.com | +95 9 777 111 222 | tyre distributor Yangon
Mingalar Tyre Service, www.mingalartyreservice.com, contact@mingalartyreservice.com, +95 9 765 444 222, auto service and tyre retail
Golden Highway Parts | www.goldenhighwayparts.com | +95 9 500 113 221 | truck and industrial tyre buyer
Delta Auto Care | hello@deltaautocare.com | +95 9 330 888 999 | vehicle maintenance and tyres`

const MARKET_SAMPLE_TEXT = `Long queues form as vehicles line up for fuel in Yangon.
MRPPA market note: RSS 1 at USD 1800 to 2200 per ton.
Customs clearance delay reported on one inbound industrial shipment.
Distributor demand shifts toward truck tyres this week.`
const MARKET_SAMPLE_URLS = `https://www.gnlm.com.mm/
https://elevenmyanmar.com/`

const ACTION_SAMPLE_TEXT = `Bead wire defect | KIIC | Quality Team
Confirm customs docs | JUNKY | Procurement Team
Demand shift toward truck tyres | Yangon distributors | Sales Team
Power fluctuation at Plant A | Operations Team
Overdue collection follow-up for two customers | Finance Team`

function resolveInitialTab(): TrialTab {
  const hash = window.location.hash.replace('#', '').trim()
  if (hash === 'lead-finder' || hash === 'market-brief' || hash === 'action-board') {
    return hash
  }
  return 'lead-finder'
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function parseLeads(rawText: string): LeadRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const rows: LeadRow[] = []
  for (const line of lines) {
    const emails = uniqueValues(line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
    const websites = uniqueValues(
      line.match(/(?:https?:\/\/|www\.)[^\s,;]+/gi)?.map((value) => value.replace(/[),.;]$/, '')) ?? [],
    )
    const phones = uniqueValues(
      line.match(/\+?\d[\d\s\-()]{7,}\d/g)?.map((value) => value.replace(/\s+/g, ' ').trim()) ?? [],
    )

    let score = 0
    if (emails.length) score += 2
    if (websites.length) score += 2
    if (phones.length) score += 1
    if (/(tyre|truck|industrial|distributor|auto|service|retail|buyer)/i.test(line)) score += 2

    rows.push({
      name: line.split('|')[0]?.split(',')[0]?.trim() || 'Unknown lead',
      email: emails[0] ?? '',
      phone: phones[0] ?? '',
      website: websites[0] ?? '',
      source: 'Pasted list',
      source_url: '',
      snippet: '',
      social_profiles: [],
      fit_reasons: ['manual input'],
      provider: 'Manual',
      score,
    })
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, 10)
}

function buildMarketBrief(text: string): MarketOutput {
  const lowered = text.toLowerCase()
  const themes: string[] = []
  const watchItems: string[] = []
  const actions: string[] = []

  if (/(fuel|logistics|shipment|eta|port|customs|delay)/.test(lowered)) {
    themes.push('Supply')
    watchItems.push('Supply chain pressure is showing up in logistics or fuel movement.')
    actions.push('Check shipment timing and inbound exposure today.')
  }
  if (/(rss|rubber|price|cost|usd|currency|kyat)/.test(lowered)) {
    themes.push('Cost')
    watchItems.push('Input cost or raw material pricing moved in the latest signal set.')
    actions.push('Compare raw material movement against current buying assumptions.')
  }
  if (/(policy|tax|regulation|permit|import|export|government)/.test(lowered)) {
    themes.push('Policy')
    watchItems.push('Policy or clearance conditions may change timing or handling.')
    actions.push('Review exposure to import or compliance changes.')
  }
  if (/(demand|sales|distributor|customer|market|truck tyre|retail)/.test(lowered)) {
    themes.push('Demand')
    watchItems.push('Commercial demand is shifting by channel, product, or buyer type.')
    actions.push('Push the latest demand signal into sales and procurement review.')
  }

  if (themes.length === 0) {
    themes.push('General')
    watchItems.push('Signals were detected but need manual categorization.')
    actions.push('Review the incoming notes and set one owner for follow-up.')
  }

  const summary =
    themes.length === 1
      ? `${themes[0]} moved in the latest signal set.`
      : `${themes.slice(0, 2).join(' and ')} moved in the latest signal set.`

  return {
    summary,
    themes,
    watchItems: watchItems.slice(0, 3),
    actions: [...new Set(actions)].slice(0, 3),
  }
}

function inferOwner(text: string) {
  const lowered = text.toLowerCase()
  if (/(quality|defect|capa|reject|inspection|bead wire)/.test(lowered)) return 'Quality'
  if (/(supplier|customs|eta|shipment|po|docs|procurement|junky|kiic)/.test(lowered)) return 'Procurement'
  if (/(cash|invoice|payment|overdue|collection|finance)/.test(lowered)) return 'Finance'
  if (/(sales|demand|distributor|customer|market)/.test(lowered)) return 'Sales'
  if (/(plant|production|power|shift|downtime|operations)/.test(lowered)) return 'Operations'
  return 'Management'
}

function inferPriority(text: string): ActionRow['priority'] {
  const lowered = text.toLowerCase()
  if (/(defect|delay|blocked|overdue|urgent|customs|power|shortage|risk)/.test(lowered)) return 'High'
  if (/(confirm|review|check|follow|inspect)/.test(lowered)) return 'Medium'
  return 'Low'
}

function inferDue(priority: ActionRow['priority']) {
  if (priority === 'High') return 'Today'
  if (priority === 'Medium') return 'This week'
  return 'Next review'
}

function buildActionBoard(text: string): ActionRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const priority = inferPriority(line)
      return {
        title: line.split('|')[0]?.trim() || line,
        owner: inferOwner(line),
        priority,
        due: inferDue(priority),
      }
    })
}

function downloadCsv(rows: LeadRow[]) {
  const header = 'name,email,phone,website,score'
  const body = rows.map((row) =>
    [row.name, row.email, row.phone, row.website, String(row.score)]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(','),
  )
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lead_finder.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function TryPage() {
  const [activeTab, setActiveTab] = useState<TrialTab>(resolveInitialTab)
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const [leadQuery, setLeadQuery] = useState('')
  const [leadKeywords, setLeadKeywords] = useState('')
  const [leadLimit, setLeadLimit] = useState(8)
  const [leadSources, setLeadSources] = useState<Record<LeadSource, boolean>>({
    web: true,
    social: true,
    maps: true,
  })
  const [leadInput, setLeadInput] = useState('')
  const [leadRows, setLeadRows] = useState<LeadRow[]>([])
  const [leadProvider, setLeadProvider] = useState('')

  const [marketInput, setMarketInput] = useState('')
  const [marketUrls, setMarketUrls] = useState('')
  const [marketOutput, setMarketOutput] = useState<MarketOutput | null>(null)

  const [actionInput, setActionInput] = useState('')
  const [actionRows, setActionRows] = useState<ActionRow[]>([])

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

  function activateTab(tab: TrialTab) {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  function selectedLeadSources() {
    return (Object.entries(leadSources) as Array<[LeadSource, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([source]) => source)
  }

  function toggleLeadSource(source: LeadSource) {
    setLeadSources((previous) => ({ ...previous, [source]: !previous[source] }))
  }

  async function runLeadFinder({ query = leadQuery, text = leadInput }: { query?: string; text?: string } = {}) {
    setBusy(true)
    try {
      if (apiReady && (query.trim() || text.trim())) {
        const payload = await workspaceFetch<{ rows: LeadRow[]; provider?: string }>('/api/tools/lead-finder', {
          method: 'POST',
          body: JSON.stringify({
            raw_text: text,
            query,
            keywords: leadKeywords
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            sources: selectedLeadSources(),
            limit: leadLimit,
          }),
        })
        setLeadRows(payload.rows ?? [])
        setLeadProvider(payload.provider ?? '')
      } else {
        setLeadRows(parseLeads(text))
        setLeadProvider('Manual')
      }
    } finally {
      setBusy(false)
    }
  }

  async function runNewsBrief(text: string, urlsText = marketUrls) {
    setBusy(true)
    try {
      if (apiReady) {
        const urls = urlsText
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean)
        const payload = await workspaceFetch<{ summary: string; themes: string[]; watch_items: string[]; actions: string[] }>(
          '/api/tools/news-brief',
          {
            method: 'POST',
            body: JSON.stringify({ raw_text: text, urls }),
          },
        )
        setMarketOutput({
          summary: payload.summary,
          themes: payload.themes,
          watchItems: payload.watch_items,
          actions: payload.actions,
        })
      } else {
        setMarketOutput(buildMarketBrief(text))
      }
    } finally {
      setBusy(false)
    }
  }

  async function runActionBoard(text: string) {
    setBusy(true)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<{ rows: ActionRow[] }>('/api/tools/action-board', {
          method: 'POST',
          body: JSON.stringify({ raw_text: text }),
        })
        setActionRows(payload.rows ?? [])
      } else {
        setActionRows(buildActionBoard(text))
      }
    } finally {
      setBusy(false)
    }
  }

  async function loadLiveWorkspaceActions() {
    setBusy(true)
    try {
      const payload = await workspaceFetch<{ items: Array<{ title: string; owner: string; priority: string; due: string }> }>('/api/actions?limit=10')
      setActionRows(
        (payload.items ?? []).map((item) => ({
          title: item.title,
          owner: item.owner,
          priority: (item.priority?.charAt(0).toUpperCase() + item.priority?.slice(1).toLowerCase()) as ActionRow['priority'],
          due: item.due,
        })),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free tools"
        title="Try the real free tools."
        description="These are the fast proof tools. Use sample input now, then connect the same logic to your live data in a pilot."
      />

      <section className="sm-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="sm-status-pill">
            <span className={`sm-led ${apiReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {apiReady ? 'Live tool mode' : 'Quick sample mode'}
          </span>
          <span className="text-sm text-[var(--sm-muted)]">
            {apiReady
              ? 'This tool is connected to the live workspace service on this machine.'
              : 'This tool is still usable with sample input even when the workspace service is not running.'}
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {trialModules.map((module) => (
          <button
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              activeTab === module.id
                ? 'border-[rgba(37,208,255,0.28)] bg-[rgba(37,208,255,0.08)] shadow-[0_0_32px_rgba(37,208,255,0.08)]'
                : 'border-white/8 bg-white/4 hover:bg-white/7'
            }`}
            key={module.id}
            onClick={() => activateTab(module.id)}
            type="button"
          >
            <p className="text-sm font-bold text-white">{module.name}</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">{module.promise}</p>
          </button>
        ))}
      </section>

      {activeTab === 'lead-finder' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">Lead Finder</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Search live sources for businesses, then extract cleaner lead candidates with contact clues and source links.
            </p>

            <div className="mt-4 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Search phrase
                <input
                  className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white"
                  onChange={(event) => setLeadQuery(event.target.value)}
                  placeholder="For example: spa in yangon"
                  value={leadQuery}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Keywords to rank for
                <input
                  className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white"
                  onChange={(event) => setLeadKeywords(event.target.value)}
                  placeholder="spa, wellness, massage, premium"
                  value={leadKeywords}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-semibold text-[var(--sm-muted)]">Sources</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['web', 'social', 'maps'] as LeadSource[]).map((source) => (
                      <button
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          leadSources[source]
                            ? 'border-[rgba(37,208,255,0.28)] bg-[rgba(37,208,255,0.08)] text-[var(--sm-accent)]'
                            : 'border-white/10 bg-white/4 text-[var(--sm-muted)]'
                        }`}
                        key={source}
                        onClick={() => toggleLeadSource(source)}
                        type="button"
                      >
                        {source === 'web' ? 'Websites' : source === 'social' ? 'Social' : 'Maps'}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Result limit
                  <select
                    className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white"
                    onChange={(event) => setLeadLimit(Number(event.target.value))}
                    value={leadLimit}
                  >
                    <option value={5}>5</option>
                    <option value={8}>8</option>
                    <option value={12}>12</option>
                  </select>
                </label>
              </div>

              <details className="sm-chip">
                <summary className="cursor-pointer text-sm font-semibold text-white">Manual fallback: paste a list instead</summary>
                <textarea
                  className="mt-4 min-h-48 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
                  onChange={(event) => setLeadInput(event.target.value)}
                  placeholder="Paste leads here if you already have a rough list..."
                  value={leadInput}
                />
              </details>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="sm-button-primary"
                disabled={busy || (!apiReady && !leadInput.trim())}
                onClick={() => void runLeadFinder()}
                type="button"
              >
                {busy ? 'Running...' : apiReady ? 'Search live sources' : 'Parse pasted list'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setLeadQuery(LEAD_SAMPLE_QUERY)
                  setLeadKeywords('spa, wellness, massage')
                  setLeadInput(LEAD_SAMPLE_TEXT)
                  void runLeadFinder({ query: LEAD_SAMPLE_QUERY, text: LEAD_SAMPLE_TEXT })
                }}
                type="button"
              >
                Load sample search
              </button>
              {leadRows.length > 0 ? (
                <button className="sm-button-secondary" onClick={() => downloadCsv(leadRows)} type="button">
                  Download CSV
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">
              {apiReady
                ? 'Live search is on. When a maps key is configured, the tool can also use Google Places results.'
                : 'Live search needs the workspace service. You can still test the scoring and CSV flow with a pasted list here.'}
            </p>
          </article>

          <article className="sm-terminal p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white">Output</h3>
              {leadProvider ? <span className="sm-status-pill">{leadProvider}</span> : null}
            </div>
            <div className="mt-4 space-y-3">
              {leadRows.length > 0 ? (
                leadRows.map((row) => (
                  <div className="sm-chip" key={`${row.name}-${row.email}-${row.website}-${row.source_url}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{row.name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="sm-status-pill">{row.source}</span>
                        <span className="sm-status-pill">Score {row.score}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {row.email || 'no email'} | {row.phone || 'no phone'} | {row.website || 'no website'}
                    </p>
                    {row.snippet ? <p className="mt-3 text-sm text-white">{row.snippet}</p> : null}
                    {row.fit_reasons.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.fit_reasons.map((reason) => (
                          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-white" key={reason}>
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {row.social_profiles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.social_profiles.map((profile) => (
                          <a
                            className="rounded-full border border-[rgba(37,208,255,0.18)] bg-[rgba(37,208,255,0.06)] px-3 py-1 text-xs font-semibold text-[var(--sm-accent)]"
                            href={profile}
                            key={profile}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Social profile
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {row.source_url ? (
                      <div className="mt-3">
                        <a className="sm-link" href={row.source_url} rel="noreferrer" target="_blank">
                          Open source
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--sm-muted)]">Run the tool to see extracted lead candidates here.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'market-brief' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">News Brief</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste headlines, copied notes, or a quick news dump.</p>
            <textarea
              className="mt-4 min-h-72 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
              onChange={(event) => setMarketInput(event.target.value)}
              placeholder="Paste headlines or notes here..."
              value={marketInput}
            />
            <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Optional source URLs
              <textarea
                className="min-h-28 rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm font-normal text-white"
                onChange={(event) => setMarketUrls(event.target.value)}
                placeholder="Paste article or source URLs here, one per line..."
                value={marketUrls}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy} onClick={() => runNewsBrief(marketInput)} type="button">
                {busy ? 'Running...' : apiReady ? 'Fetch + build brief' : 'Build brief'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setMarketInput(MARKET_SAMPLE_TEXT)
                  setMarketUrls(MARKET_SAMPLE_URLS)
                  void runNewsBrief(MARKET_SAMPLE_TEXT, MARKET_SAMPLE_URLS)
                }}
                type="button"
              >
                Load example
              </button>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            {marketOutput ? (
              <div className="mt-4 space-y-4">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Summary</p>
                  <p className="mt-3 text-white">{marketOutput.summary}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="sm-chip">
                    <p className="sm-kicker text-[var(--sm-accent)]">Themes</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {marketOutput.themes.map((theme) => (
                        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-white" key={theme}>
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Actions</p>
                    <ul className="mt-3 space-y-2 text-sm text-white">
                      {marketOutput.actions.map((action) => (
                        <li key={action}>- {action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Watch items</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {marketOutput.watchItems.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--sm-muted)]">Run the tool to generate a short operating brief.</p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'action-board' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">Action Board</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste raw updates and turn them into cleaner follow-up actions.</p>
            <textarea
              className="mt-4 min-h-72 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
              onChange={(event) => setActionInput(event.target.value)}
              placeholder="Paste updates here..."
              value={actionInput}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy} onClick={() => runActionBoard(actionInput)} type="button">
                {busy ? 'Running...' : apiReady ? 'Run on workspace API' : 'Build board'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setActionInput(ACTION_SAMPLE_TEXT)
                  void runActionBoard(ACTION_SAMPLE_TEXT)
                }}
                type="button"
              >
                Load example
              </button>
              {apiReady ? (
                <button className="sm-button-secondary" disabled={busy} onClick={() => void loadLiveWorkspaceActions()} type="button">
                  Load live workspace board
                </button>
              ) : null}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            <div className="mt-4 space-y-3">
              {actionRows.length > 0 ? (
                actionRows.map((row) => (
                  <div className="sm-chip" key={`${row.title}-${row.owner}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-white">{row.title}</p>
                      <span
                        className={`sm-status-pill ${
                          row.priority === 'High'
                            ? 'border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]'
                            : row.priority === 'Medium'
                              ? 'border-[rgba(37,208,255,0.18)] bg-[rgba(37,208,255,0.08)] text-[var(--sm-accent)]'
                              : ''
                        }`}
                      >
                        {row.priority}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                        <p className="mt-2 text-white">{row.owner}</p>
                      </div>
                      <div>
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Due</p>
                        <p className="mt-2 text-white">{row.due}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--sm-muted)]">Run the tool to create a cleaner action board.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Want the same logic on your own data?</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              The free tools prove behavior first. The service packs connect the same logic to Gmail, Drive, Sheets, and live team workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-accent" to="/products">
              See service packs
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Use on my data
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
