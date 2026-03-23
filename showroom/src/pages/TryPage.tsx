import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trialModules } from '../content'

type TrialTab = 'lead-to-pilot' | 'supplier-watch' | 'director-command'

type LeadRow = {
  name: string
  email: string
  phone: string
  website: string
  score: number
}

type SupplierOutput = {
  score: number
  level: 'Low' | 'Medium' | 'High'
  tags: string[]
  owner: string
  due: string
  actions: string[]
  responseDraft: string
}

type DirectorOutput = {
  actions: string[]
  blockers: string[]
  decisions: string[]
}

const LEAD_SAMPLE_TEXT = `Shwe Auto House | www.shweautohouse.com | sales@shweautohouse.com | +95 9 777 111 222 | tyre distributor Yangon
Mingalar Tyre Service, www.mingalartyreservice.com, contact@mingalartyreservice.com, +95 9 765 444 222, auto service and tyre retail
Golden Highway Parts | www.goldenhighwayparts.com | +95 9 500 113 221 | truck and industrial tyre buyer
Delta Auto Care | hello@deltaautocare.com | +95 9 330 888 999 | vehicle maintenance and tyres`

const SUPPLIER_SAMPLE_TEXT = `From: zhuangshidong@kiic.example
Subject: Shipment update for bead wire lot

Shipment delayed by 5 days due to customs inspection.
Please settle the overdue invoice before release of the next lot.
Packing list is attached but commercial invoice needs reconfirmation.`

const DIRECTOR_SAMPLE_TEXT = `Plant A had a power fluctuation during the night shift. KIIC bead wire lot needs incoming inspection tomorrow morning. JUNKY customs documents are still pending. Sales team says distributor demand shifted to truck tyres this week. Cash collection from two overdue customers needs escalation today.`

function resolveInitialTab(): TrialTab {
  const hash = window.location.hash.replace('#', '').trim()
  if (hash === 'lead-to-pilot' || hash === 'supplier-watch' || hash === 'director-command') {
    return hash
  }
  return 'supplier-watch'
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
    if (/(tyre|truck|industrial|distributor|auto|service)/i.test(line)) score += 2

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
  const body = rows.map((row) => [row.name, row.email, row.phone, row.website, String(row.score)].map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lead_to_pilot.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function analyzeSupplierMessage(text: string): SupplierOutput {
  const lowered = text.toLowerCase()
  const tags: string[] = []
  const actions: string[] = []
  let score = 1
  let owner = 'Procurement'
  let due = 'This week'

  if (/(delay|slip|late|postpone|hold)/.test(lowered)) {
    tags.push('Delay risk')
    actions.push('Confirm revised ETA and shipment release condition.')
    score += 3
    due = 'Today'
  }
  if (/(invoice|payment|overdue|settle|advance)/.test(lowered)) {
    tags.push('Payment risk')
    actions.push('Check invoice status and assign owner for payment follow-up.')
    score += 3
    owner = 'Finance + Procurement'
  }
  if (/(customs|packing list|invoice|document|bl|form e)/.test(lowered)) {
    tags.push('Document risk')
    actions.push('Validate required documents before next supplier reply.')
    score += 2
  }
  if (/(quality|defect|reject|claim|bead wire)/.test(lowered)) {
    tags.push('Quality risk')
    actions.push('Prepare incoming inspection or quality containment check.')
    score += 2
    owner = 'Quality + Procurement'
  }

  const level = score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'

  return {
    score,
    level,
    tags: tags.length ? tags : ['General follow-up'],
    owner,
    due,
    actions: actions.length ? actions : ['Review message and assign an owner.'],
    responseDraft: `Thanks for the update. We are reviewing the ${tags.join(', ').toLowerCase() || 'issue'} now and will confirm owner, due date, and required documents shortly.`,
  }
}

function buildDirectorCommand(text: string): DirectorOutput {
  const chunks = text
    .split(/\r?\n|[.](?=\s+[A-Z]|\s*$)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8)

  const actions: string[] = []
  const blockers: string[] = []
  const decisions: string[] = []

  for (const chunk of chunks) {
    const lowered = chunk.toLowerCase()
    if (/(need|needs|confirm|review|inspect|escalation|follow)/.test(lowered)) {
      actions.push(chunk)
    }
    if (/(delay|pending|blocked|issue|risk|overdue|fluctuation)/.test(lowered)) {
      blockers.push(chunk)
    }
    if (/(demand shifted|approve|decide|priority|allocate)/.test(lowered)) {
      decisions.push(chunk)
    }
  }

  return {
    actions: actions.slice(0, 5),
    blockers: blockers.slice(0, 4),
    decisions: decisions.slice(0, 3),
  }
}

export function TryPage() {
  const [activeTab, setActiveTab] = useState<TrialTab>(resolveInitialTab)

  const [leadInput, setLeadInput] = useState('')
  const [leadRows, setLeadRows] = useState<LeadRow[]>([])

  const [supplierInput, setSupplierInput] = useState('')
  const [supplierOutput, setSupplierOutput] = useState<SupplierOutput | null>(null)

  const [directorInput, setDirectorInput] = useState('')
  const [directorOutput, setDirectorOutput] = useState<DirectorOutput | null>(null)

  function activateTab(tab: TrialTab) {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Live Lab"
        title="Run real agent workflows."
        description="These are working agent tools, not fake mockups. Paste real input, or load a sample if you want to test fast."
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

      {activeTab === 'supplier-watch' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">Supplier Watch Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste one supplier email or forwarded thread.</p>
            <textarea
              className="mt-4 min-h-72 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
              onChange={(event) => setSupplierInput(event.target.value)}
              placeholder="Paste supplier message here..."
              value={supplierInput}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => setSupplierOutput(analyzeSupplierMessage(supplierInput))} type="button">
                Analyze thread
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setSupplierInput(SUPPLIER_SAMPLE_TEXT)
                  setSupplierOutput(analyzeSupplierMessage(SUPPLIER_SAMPLE_TEXT))
                }}
                type="button"
              >
                Load sample
              </button>
            </div>
          </article>

          <article className="sm-surface-deep p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            {supplierOutput ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] px-3 py-1 text-sm font-semibold text-[var(--sm-accent-alt)]">
                    Risk {supplierOutput.level}
                  </span>
                  <span className="rounded-full border border-[rgba(37,208,255,0.18)] bg-[rgba(37,208,255,0.08)] px-3 py-1 text-sm font-semibold text-[var(--sm-accent)]">
                    Score {supplierOutput.score}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="sm-chip">
                    <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                    <p className="mt-2 text-white">{supplierOutput.owner}</p>
                  </div>
                  <div className="sm-chip">
                    <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                    <p className="mt-2 text-white">{supplierOutput.due}</p>
                  </div>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Detected risks</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {supplierOutput.tags.map((tag) => (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-white" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Next actions</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {supplierOutput.actions.map((action) => (
                      <li key={action}>- {action}</li>
                    ))}
                  </ul>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Reply draft</p>
                  <p className="mt-3 text-sm text-white">{supplierOutput.responseDraft}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--sm-muted)]">Run the agent to see risk analysis and next actions.</p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'director-command' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">Director Command Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste daily updates from operations, sales, procurement, or finance.</p>
            <textarea
              className="mt-4 min-h-72 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-white"
              onChange={(event) => setDirectorInput(event.target.value)}
              placeholder="Paste daily updates here..."
              value={directorInput}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => setDirectorOutput(buildDirectorCommand(directorInput))} type="button">
                Build command brief
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setDirectorInput(DIRECTOR_SAMPLE_TEXT)
                  setDirectorOutput(buildDirectorCommand(DIRECTOR_SAMPLE_TEXT))
                }}
                type="button"
              >
                Load sample
              </button>
            </div>
          </article>

          <article className="sm-surface-deep p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            {directorOutput ? (
              <div className="mt-4 grid gap-4">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Top actions</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {directorOutput.actions.map((action) => (
                      <li key={action}>- {action}</li>
                    ))}
                  </ul>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Blockers</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {directorOutput.blockers.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Decisions needed</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {directorOutput.decisions.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--sm-muted)]">Run the agent to generate a director-ready brief.</p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'lead-to-pilot' ? (
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <h2 className="text-xl font-bold text-white">Lead-to-Pilot Agent</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Paste a messy lead list and get a cleaner outreach-ready pack.</p>
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
                Load sample
              </button>
              {leadRows.length > 0 ? (
                <button className="sm-button-secondary" onClick={() => downloadCsv(leadRows)} type="button">
                  Download CSV
                </button>
              ) : null}
            </div>
          </article>

          <article className="sm-surface-deep p-6">
            <h3 className="text-lg font-bold text-white">Output</h3>
            <div className="mt-4 space-y-3">
              {leadRows.length > 0 ? (
                leadRows.map((row) => (
                  <div className="sm-chip" key={`${row.name}-${row.email}-${row.website}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{row.name}</p>
                      <span className="rounded-full border border-[rgba(37,208,255,0.18)] bg-[rgba(37,208,255,0.08)] px-3 py-1 text-xs font-semibold text-[var(--sm-accent)]">
                        Score {row.score}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {row.email || 'no email'} | {row.phone || 'no phone'} | {row.website || 'no website'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--sm-muted)]">Run the agent to see scored leads.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      <section className="sm-surface p-6">
        <h2 className="text-xl font-bold text-white">Need this on your real data?</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-accent" to="/contact">
            Start pilot
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See all agents
          </Link>
        </div>
      </section>
    </div>
  )
}
