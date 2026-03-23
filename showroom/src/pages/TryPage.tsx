import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trialModules } from '../content'

type TrialTab = 'lead-finder' | 'market-brief' | 'action-board'

type LeadRow = {
  name: string
  email: string
  phone: string
  website: string
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

const LEAD_SAMPLE_TEXT = `Shwe Auto House | www.shweautohouse.com | sales@shweautohouse.com | +95 9 777 111 222 | tyre distributor Yangon
Mingalar Tyre Service, www.mingalartyreservice.com, contact@mingalartyreservice.com, +95 9 765 444 222, auto service and tyre retail
Golden Highway Parts | www.goldenhighwayparts.com | +95 9 500 113 221 | truck and industrial tyre buyer
Delta Auto Care | hello@deltaautocare.com | +95 9 330 888 999 | vehicle maintenance and tyres`

const MARKET_SAMPLE_TEXT = `Long queues form as vehicles line up for fuel in Yangon.
MRPPA market note: RSS 1 at USD 1800 to 2200 per ton.
Customs clearance delay reported on one inbound industrial shipment.
Distributor demand shifts toward truck tyres this week.`

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
      score,
    })
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, 10)
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

export function TryPage() {
  const [activeTab, setActiveTab] = useState<TrialTab>(resolveInitialTab)

  const [leadInput, setLeadInput] = useState('')
  const [leadRows, setLeadRows] = useState<LeadRow[]>([])

  const [marketInput, setMarketInput] = useState('')
  const [marketOutput, setMarketOutput] = useState<MarketOutput | null>(null)

  const [actionInput, setActionInput] = useState('')
  const [actionRows, setActionRows] = useState<ActionRow[]>([])

  function activateTab(tab: TrialTab) {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Tools"
        title="Try the real free tools."
        description="Paste your own input, or load one Myanmar ops example and see how the tool behaves."
      />

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
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste a rough list. The tool scores it and makes it easier to work.</p>
            <textarea
              className="mt-4 min-h-72 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
              onChange={(event) => setLeadInput(event.target.value)}
              placeholder="Paste leads here..."
              value={leadInput}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => setLeadRows(parseLeads(leadInput))} type="button">
                Score leads
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setLeadInput(LEAD_SAMPLE_TEXT)
                  setLeadRows(parseLeads(LEAD_SAMPLE_TEXT))
                }}
                type="button"
              >
                Load example
              </button>
              {leadRows.length > 0 ? (
                <button className="sm-button-secondary" onClick={() => downloadCsv(leadRows)} type="button">
                  Download CSV
                </button>
              ) : null}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            <div className="mt-4 space-y-3">
              {leadRows.length > 0 ? (
                leadRows.map((row) => (
                  <div className="sm-chip" key={`${row.name}-${row.email}-${row.website}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{row.name}</p>
                      <span className="sm-status-pill">Score {row.score}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {row.email || 'no email'} | {row.phone || 'no phone'} | {row.website || 'no website'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--sm-muted)]">Run the tool to see cleaner leads here.</p>
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
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => setMarketOutput(buildMarketBrief(marketInput))} type="button">
                Build brief
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setMarketInput(MARKET_SAMPLE_TEXT)
                  setMarketOutput(buildMarketBrief(MARKET_SAMPLE_TEXT))
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
              <button className="sm-button-primary" onClick={() => setActionRows(buildActionBoard(actionInput))} type="button">
                Build board
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setActionInput(ACTION_SAMPLE_TEXT)
                  setActionRows(buildActionBoard(ACTION_SAMPLE_TEXT))
                }}
                type="button"
              >
                Load example
              </button>
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
              The free tools show the behavior. The deploy modules connect it to Gmail, Drive, and Sheets.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-accent" to="/products">
              See deploy modules
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Start a pilot
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
