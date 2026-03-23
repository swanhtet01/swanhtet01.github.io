import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trialModules } from '../content'

type TrialTab = 'lead-finder' | 'news-brief' | 'action-planner'

type LeadRow = {
  name: string
  email: string
  phone: string
  website: string
  score: number
  priority: 'high' | 'medium' | 'low'
}

type NewsItem = {
  source: string
  headline: string
  tag: string
}

type PlannedAction = {
  task: string
  owner: string
  due: string
  priority: 'high' | 'medium' | 'low'
}

const LEAD_SAMPLE_TEXT = `Shwe Auto House | www.shweautohouse.com | sales@shweautohouse.com | +95 9 777 111 222 | tyre distributor Yangon
Mingalar Tyre Service, www.mingalartyreservice.com, contact@mingalartyreservice.com, +95 9 765 444 222, auto service and tyre retail
Golden Highway Parts | www.goldenhighwayparts.com | +95 9 500 113 221 | truck and industrial tyre buyer
Delta Auto Care | hello@deltaautocare.com | +95 9 330 888 999 | vehicle maintenance and tyres`

const NEWS_SAMPLE_TEXT = `Long queues form as vehicles line up for fuel in Yangon
MAI cuts baggage allowances due to jet fuel shortage
Myanmar rubber prices hold steady amid softer regional demand
Customs clearance delays reported at key import checkpoints
MRPPA updates RSS market range for current week`

const ACTION_SAMPLE_TEXT = `Supplier shipment may slip by 4 days due to customs. Confirm ETA today. Review overdue invoice list and call top 3 customers. Prepare quality check for incoming batch tomorrow. Update weekly director brief by Friday.`

const LEAD_SAMPLE_KEYWORDS = 'tyre,auto,service,distributor,industrial'

function resolveInitialTab(): TrialTab {
  const hash = window.location.hash.replace('#', '').trim()
  if (hash === 'lead-finder' || hash === 'news-brief' || hash === 'action-planner') {
    return hash
  }
  return 'lead-finder'
}

function normalizeUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

async function fetchReadableText(url: string) {
  const normalized = normalizeUrl(url)
  const withoutProtocol = normalized.replace(/^https?:\/\//i, '')
  const proxyUrl = `https://r.jina.ai/http://${withoutProtocol}`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(proxyUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }
    return response.text()
  } finally {
    window.clearTimeout(timeout)
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function parseLeads(rawText: string, keywordCsv: string): LeadRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const keywords = keywordCsv
    .split(',')
    .map((item) => item.trim().toLowerCase())
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

    const firstChunk = line.split('|')[0]?.split(',')[0]?.trim() ?? ''
    let name = firstChunk
    if (!name || /^[\d+().\s-]+$/.test(name)) {
      name = websites[0]?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? 'Unknown Lead'
    }

    let score = 0
    if (emails.length > 0) score += 2
    if (websites.length > 0) score += 1
    if (phones.length > 0) score += 1
    if (keywords.some((keyword) => line.toLowerCase().includes(keyword))) score += 2

    const priority = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'
    rows.push({
      name,
      email: emails[0] ?? '',
      phone: phones[0] ?? '',
      website: websites[0] ?? '',
      score,
      priority,
    })
  }

  const deduped = new Map<string, LeadRow>()
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.email.toLowerCase()}|${row.website.toLowerCase()}`
    if (!deduped.has(key) || (deduped.get(key)?.score ?? 0) < row.score) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score)
}

function rowsToCsv(rows: LeadRow[]) {
  const header = 'name,email,phone,website,score,priority'
  const body = rows.map((row) => {
    const fields = [row.name, row.email, row.phone, row.website, String(row.score), row.priority]
    return fields.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')
  })
  return [header, ...body].join('\n')
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function extractHeadlines(rawText: string, maxCount = 8) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 28 && line.length <= 180)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^[-*#>\d.]/.test(line))

  return uniqueValues(lines).slice(0, maxCount)
}

function classifyHeadline(headline: string) {
  const value = headline.toLowerCase()
  if (/(fuel|energy|power|gas|diesel)/.test(value)) return 'Energy'
  if (/(port|shipment|logistics|customs|transport)/.test(value)) return 'Logistics'
  if (/(policy|law|tax|government|ministry)/.test(value)) return 'Policy'
  if (/(rubber|price|market|trade|demand|inflation|currency)/.test(value)) return 'Market'
  return 'General'
}

function buildNewsBrief(items: NewsItem[]) {
  if (items.length === 0) {
    return ['No headlines found.']
  }
  const tags = new Map<string, number>()
  for (const item of items) {
    tags.set(item.tag, (tags.get(item.tag) ?? 0) + 1)
  }
  const topTags = [...tags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tag]) => tag)

  const top = items.slice(0, 3).map((item) => `${item.source}: ${item.headline}`)
  return [
    `Watch today: ${topTags.join(' + ') || 'General'} signals.`,
    `Top headline: ${items[0].headline}`,
    `Action: review supplier and pricing assumptions against today's news.`,
    ...top,
  ]
}

function parseActions(rawText: string): PlannedAction[] {
  const chunks = rawText
    .split(/\r?\n|[.](?=\s+[A-Z]|\s+$)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8)

  const planned: PlannedAction[] = []

  for (const chunk of chunks) {
    const value = chunk.toLowerCase()
    if (!/(send|check|review|follow|confirm|call|visit|pay|approve|update|close|prepare|arrange)/.test(value)) {
      continue
    }

    let owner = 'Operations'
    if (/(supplier|purchase|procurement|shipment|customs)/.test(value)) owner = 'Procurement'
    if (/(quality|defect|claim|capa|nonconformance)/.test(value)) owner = 'Quality'
    if (/(invoice|payment|cash|collection|bank)/.test(value)) owner = 'Finance'
    if (/(sales|customer|demand|distributor)/.test(value)) owner = 'Sales'

    let priority: PlannedAction['priority'] = 'medium'
    let due = 'This week'
    if (/(urgent|today|asap|immediately|critical|delay)/.test(value)) {
      priority = 'high'
      due = 'Today'
    } else if (/(next week|later|follow up next)/.test(value)) {
      priority = 'low'
      due = 'Next week'
    }

    planned.push({ task: chunk, owner, due, priority })
  }

  return planned.slice(0, 15)
}

const SAMPLE_LEAD_ROWS = parseLeads(LEAD_SAMPLE_TEXT, LEAD_SAMPLE_KEYWORDS)
const SAMPLE_NEWS_ITEMS = extractHeadlines(NEWS_SAMPLE_TEXT, 12).map((headline) => ({
  source: 'Sample',
  headline,
  tag: classifyHeadline(headline),
}))
const SAMPLE_NEWS_BRIEF = buildNewsBrief(SAMPLE_NEWS_ITEMS)
const SAMPLE_ACTION_ROWS = parseActions(ACTION_SAMPLE_TEXT)

export function TryPage() {
  const [activeTab, setActiveTab] = useState<TrialTab>(resolveInitialTab)

  const [leadUrl, setLeadUrl] = useState('')
  const [leadKeywords, setLeadKeywords] = useState(LEAD_SAMPLE_KEYWORDS)
  const [leadRawText, setLeadRawText] = useState(LEAD_SAMPLE_TEXT)
  const [leadRows, setLeadRows] = useState<LeadRow[]>(SAMPLE_LEAD_ROWS)
  const [leadStatus, setLeadStatus] = useState(`Sample loaded with ${SAMPLE_LEAD_ROWS.length} leads.`)
  const [leadFetching, setLeadFetching] = useState(false)

  const [newsUrls, setNewsUrls] = useState('https://www.gnlm.com.mm/\nhttps://elevenmyanmar.com/')
  const [newsFallbackText, setNewsFallbackText] = useState(NEWS_SAMPLE_TEXT)
  const [newsItems, setNewsItems] = useState<NewsItem[]>(SAMPLE_NEWS_ITEMS)
  const [newsBrief, setNewsBrief] = useState<string[]>(SAMPLE_NEWS_BRIEF)
  const [newsStatus, setNewsStatus] = useState(`Sample loaded with ${SAMPLE_NEWS_ITEMS.length} headlines.`)
  const [newsFetching, setNewsFetching] = useState(false)

  const [plannerInput, setPlannerInput] = useState(ACTION_SAMPLE_TEXT)
  const [plannerRows, setPlannerRows] = useState<PlannedAction[]>(SAMPLE_ACTION_ROWS)

  function activateTab(tab: TrialTab) {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  async function handleLeadFetch() {
    if (!leadUrl.trim()) {
      setLeadStatus('Enter a page URL first.')
      return
    }
    setLeadFetching(true)
    try {
      const text = await fetchReadableText(leadUrl)
      setLeadRawText(text.slice(0, 30000))
      setLeadStatus('Fetched source text. Now run it on your input.')
    } catch {
      setLeadStatus('Could not fetch page. Paste text manually or reset sample.')
    } finally {
      setLeadFetching(false)
    }
  }

  function handleLeadRun() {
    const rows = parseLeads(leadRawText, leadKeywords)
    setLeadRows(rows)
    setLeadStatus(rows.length > 0 ? `Generated ${rows.length} leads.` : 'No leads found. Try different input.')
  }

  function handleLeadSample() {
    setLeadRawText(LEAD_SAMPLE_TEXT)
    setLeadKeywords(LEAD_SAMPLE_KEYWORDS)
    setLeadRows(SAMPLE_LEAD_ROWS)
    setLeadStatus(`Sample loaded with ${SAMPLE_LEAD_ROWS.length} leads.`)
  }

  async function handleNewsFetch() {
    setNewsFetching(true)
    const items: NewsItem[] = []

    try {
      const urls = newsUrls
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 6)

      for (const url of urls) {
        try {
          const text = await fetchReadableText(url)
          const source = normalizeUrl(url).replace(/^https?:\/\//, '').split('/')[0]
          const headlines = extractHeadlines(text, 4)
          headlines.forEach((headline) => {
            items.push({ source, headline, tag: classifyHeadline(headline) })
          })
        } catch {
          continue
        }
      }
    } finally {
      setNewsFetching(false)
    }

    if (items.length > 0) {
      setNewsItems(items)
      setNewsBrief(buildNewsBrief(items))
      setNewsStatus(`Generated brief from ${items.length} fetched headlines.`)
      return
    }

    setNewsStatus('Live fetch failed. Use your own headlines or reset sample.')
  }

  function handleManualNewsRun() {
    const fallback = extractHeadlines(newsFallbackText, 12).map((headline) => ({
      source: 'Manual',
      headline,
      tag: classifyHeadline(headline),
    }))
    setNewsItems(fallback)
    setNewsBrief(buildNewsBrief(fallback))
    setNewsStatus(fallback.length > 0 ? `Generated brief from ${fallback.length} headlines.` : 'No headlines found.')
  }

  function handleNewsSample() {
    setNewsFallbackText(NEWS_SAMPLE_TEXT)
    setNewsItems(SAMPLE_NEWS_ITEMS)
    setNewsBrief(SAMPLE_NEWS_BRIEF)
    setNewsStatus(`Sample loaded with ${SAMPLE_NEWS_ITEMS.length} headlines.`)
  }

  function handlePlannerRun() {
    setPlannerRows(parseActions(plannerInput))
  }

  function handlePlannerSample() {
    setPlannerInput(ACTION_SAMPLE_TEXT)
    setPlannerRows(SAMPLE_ACTION_ROWS)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Try Tools"
        title="Run these tools now."
        description="Each tool opens in sample mode first, so it always works. Live fetching is optional beta."
      />

      <section className="sm-surface p-4 text-sm text-[var(--sm-muted)]">
        <strong className="text-[var(--sm-ink)]">Default mode:</strong> sample data is already loaded.
        <span className="ml-2">Switch to your own input when you want, and use live fetch only as a beta test.</span>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {trialModules.map((module) => (
          <button
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              activeTab === module.id
                ? 'border-cyan-400/70 bg-white/80 shadow-[0_20px_46px_-34px_rgba(13,110,112,0.65)] backdrop-blur-xl'
                : 'border-white/60 bg-white/58 backdrop-blur-xl hover:bg-white/76'
            }`}
            key={module.id}
            onClick={() => activateTab(module.id)}
            type="button"
          >
            <p className="text-sm font-bold text-[var(--sm-ink)]">{module.name}</p>
            <p className="mt-1 text-sm text-[var(--sm-muted)]">{module.promise}</p>
          </button>
        ))}
      </section>

      {activeTab === 'lead-finder' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Lead Finder</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste raw listings first. Use page fetch only if you want to test beta mode.</p>
            <label className="mt-4 block text-sm font-semibold text-[var(--sm-muted)]">
              Source URL for beta fetch (optional)
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2"
                  onChange={(event) => setLeadUrl(event.target.value)}
                  placeholder="https://example.com/business-directory"
                  type="text"
                  value={leadUrl}
                />
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                  disabled={leadFetching}
                  onClick={handleLeadFetch}
                  type="button"
                >
                  {leadFetching ? 'Fetching...' : 'Fetch page'}
                </button>
              </div>
            </label>
            <label className="mt-4 block text-sm font-semibold text-[var(--sm-muted)]">
              ICP keywords
              <input
                className="mt-2 w-full rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2"
                onChange={(event) => setLeadKeywords(event.target.value)}
                type="text"
                value={leadKeywords}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-[var(--sm-muted)]">
              Raw text input
              <textarea
                className="mt-2 min-h-52 w-full rounded-2xl border border-[var(--sm-line)] bg-white/70 px-3 py-3 text-sm"
                onChange={(event) => setLeadRawText(event.target.value)}
                placeholder="Paste directory listings here..."
                value={leadRawText}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="sm-button-primary" onClick={handleLeadRun} type="button">
                Run my input
              </button>
              <button className="sm-button-secondary" onClick={handleLeadSample} type="button">
                Reset sample
              </button>
              {leadRows.length > 0 ? (
                <button className="sm-button-secondary" onClick={() => downloadTextFile('lead_finder_results.csv', rowsToCsv(leadRows))} type="button">
                  Download CSV
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{leadStatus}</p>
          </article>

          <article className="sm-surface-deep p-6 text-white">
            <h3 className="text-lg font-bold">Output</h3>
            <p className="mt-2 text-sm text-cyan-100">{leadRows.length} leads</p>
            <div className="mt-4 space-y-2">
              {leadRows.slice(0, 10).map((row) => (
                <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" key={`${row.name}|${row.email}|${row.website}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-xs uppercase tracking-wider text-cyan-200">{row.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-200">
                    {row.email || 'no email'} | {row.phone || 'no phone'} | {row.website || 'no website'} | score {row.score}
                  </p>
                </div>
              ))}
              {leadRows.length === 0 ? <p className="text-sm text-slate-200">Run the tool to see results.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'news-brief' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Market Brief</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Use sample headlines first. Live source fetch is optional beta.</p>
            <label className="mt-4 block text-sm font-semibold text-[var(--sm-muted)]">
              Source URLs for beta fetch (one per line)
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-[var(--sm-line)] bg-white/70 px-3 py-3 text-sm"
                onChange={(event) => setNewsUrls(event.target.value)}
                value={newsUrls}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="sm-button-primary disabled:opacity-60" disabled={newsFetching} onClick={handleNewsFetch} type="button">
                {newsFetching ? 'Fetching...' : 'Fetch sources'}
              </button>
              <button className="sm-button-secondary" onClick={handleNewsSample} type="button">
                Reset sample
              </button>
            </div>
            <label className="mt-4 block text-sm font-semibold text-[var(--sm-muted)]">
              Your own headlines
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-[var(--sm-line)] bg-white/70 px-3 py-3 text-sm"
                onChange={(event) => setNewsFallbackText(event.target.value)}
                placeholder="Paste headlines here..."
                value={newsFallbackText}
              />
            </label>
            <button className="sm-button-secondary mt-4" onClick={handleManualNewsRun} type="button">
              Run my headlines
            </button>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{newsStatus}</p>
          </article>

          <article className="sm-surface-deep p-6 text-white">
            <h3 className="text-lg font-bold">Brief Output</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-100">
              {newsBrief.length > 0 ? newsBrief.map((line) => <li key={line}>- {line}</li>) : <li>Run the tool to generate your brief.</li>}
            </ul>
            <div className="mt-5 space-y-2">
              {newsItems.slice(0, 10).map((item) => (
                <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" key={`${item.source}-${item.headline}`}>
                  <p className="font-semibold">{item.headline}</p>
                  <p className="mt-1 text-xs text-cyan-200">
                    {item.source} | {item.tag}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'action-planner' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Action Board</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste notes. Get a clean owner-ready action list.</p>
            <textarea
              className="mt-4 min-h-64 w-full rounded-2xl border border-[var(--sm-line)] bg-white/70 px-3 py-3 text-sm"
              onChange={(event) => setPlannerInput(event.target.value)}
              value={plannerInput}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="sm-button-primary" onClick={handlePlannerRun} type="button">
                Run my notes
              </button>
              <button className="sm-button-secondary" onClick={handlePlannerSample} type="button">
                Reset sample
              </button>
            </div>
          </article>

          <article className="sm-surface-deep p-6 text-white">
            <h3 className="text-lg font-bold">Output</h3>
            <div className="mt-4 space-y-2">
              {plannerRows.map((row) => (
                <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" key={`${row.task}-${row.owner}`}>
                  <p className="font-semibold">{row.task}</p>
                  <p className="mt-1 text-xs text-cyan-200">
                    {row.owner} | {row.due} | {row.priority}
                  </p>
                </div>
              ))}
              {plannerRows.length === 0 ? <p className="text-sm text-slate-200">Run the tool to generate actions.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      <section className="sm-surface p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Want this on your real data?</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-accent" to="/contact?intent=pilot">
            Start Pilot
          </Link>
          <Link className="sm-button-secondary" to="/products">
            Back to Products
          </Link>
        </div>
      </section>
    </div>
  )
}
