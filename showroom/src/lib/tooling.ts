export type LeadSource = 'web' | 'social' | 'maps'

export type LeadRow = {
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

export type MarketOutput = {
  summary: string
  themes: string[]
  watchItems: string[]
  actions: string[]
}

export type ActionBoardCategory =
  | 'Shift issue'
  | 'Quality issue'
  | 'Supplier issue'
  | 'Document control'
  | 'Training'
  | 'Audit / review'
  | 'General follow-up'

export type ActionBoardDesk = 'Operations' | 'DQMS' | 'Approvals' | 'Knowledge' | 'Adoption' | 'Plant Manager' | 'Shared queue'

export type ActionRow = {
  title: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
  category: ActionBoardCategory
  desk: ActionBoardDesk
  deskRoute: string
  nextStep: string
  evidenceHint: string
  isoFocus: string
  lane: string
}

export const LEAD_SAMPLE_QUERY = 'clinic in dubai'
export const LEAD_SAMPLE_TEXT = `North Star Clinic | www.northstarclinic.com | hello@northstarclinic.com | +1 555 111 2222 | outpatient clinic
Harbor Dental Studio | www.harbordentalstudio.com | care@harbordentalstudio.com | +1 555 333 4444 | dental practice
Atlas Logistics Hub | www.atlaslogisticshub.com | contact@atlaslogisticshub.com | +1 555 777 8888 | warehouse and distribution
Summit Industrial Supply | www.summitindustrialsupply.com | sales@summitindustrialsupply.com | +1 555 999 0000 | industrial supplier`

export const MARKET_SAMPLE_TEXT = `Fuel costs increased across several shipping lanes this week.
RSS 1 pricing moved to USD 1,800 to 2,200 per ton in the latest commodity note.
Customs clearance delay reported on one inbound industrial shipment.
Distributor demand shifted toward truck tyres and industrial buyers this week.`

export const MARKET_SAMPLE_URLS = `https://www.reuters.com/markets/commodities/
https://www.spglobal.com/commodityinsights/en`

export const ACTION_SAMPLE_TEXT = `Bead wire splice defect found on morning batch 24A | Quality Team | Today
Containment still open for the tread crack dealer complaint | Quality Manager | Today
Receiving variance on carbon black COA for inbound lot 5521 | Procurement Team | Today
Mixer SOP revision still needs sign-off before Shift B | Admin Team | This week
Forklift safety refresher is overdue for the warehouse crew | HR Team | This week
Internal audit follow-up is still missing packing-area evidence | Plant Manager | Friday`

const ACTION_BOARD_PROFILES: Record<
  ActionBoardCategory,
  { desk: ActionBoardDesk; deskRoute: string; nextStep: string; evidenceHint: string; isoFocus: string }
> = {
  'Shift issue': {
    desk: 'Operations',
    deskRoute: '/app/operations',
    nextStep: 'Put it in the today queue, confirm the owner, and clear the shift handoff.',
    evidenceHint: 'Attach the line, machine, shift, batch, or downtime reference.',
    isoFocus: 'Operation',
  },
  'Quality issue': {
    desk: 'DQMS',
    deskRoute: '/app/dqms',
    nextStep: 'Open the incident, set containment, and assign the corrective-action owner.',
    evidenceHint: 'Attach the defect photo, batch, complaint, or test result.',
    isoFocus: 'Improvement',
  },
  'Supplier issue': {
    desk: 'Approvals',
    deskRoute: '/app/approvals',
    nextStep: 'Attach the packet, confirm the variance, and assign the approval owner.',
    evidenceHint: 'Attach supplier, PO or GRN, COA, mail trail, or discrepancy note.',
    isoFocus: 'External provider control',
  },
  'Document control': {
    desk: 'Knowledge',
    deskRoute: '/app/knowledge',
    nextStep: 'Update the controlled document, revision reason, and sign-off path.',
    evidenceHint: 'Attach the SOP, form, version, or revision reason.',
    isoFocus: 'Support and documented information',
  },
  Training: {
    desk: 'Adoption',
    deskRoute: '/app/adoption-command',
    nextStep: 'Assign the training owner, target team, and the verification check.',
    evidenceHint: 'Attach the role, station, coaching note, or proof of completion.',
    isoFocus: 'Competence and awareness',
  },
  'Audit / review': {
    desk: 'Plant Manager',
    deskRoute: '/app/plant-manager',
    nextStep: 'Add it to the review rhythm with one owner, one due date, and linked evidence.',
    evidenceHint: 'Attach the finding, KPI drift, checklist, or review note.',
    isoFocus: 'Performance evaluation',
  },
  'General follow-up': {
    desk: 'Shared queue',
    deskRoute: '/app/actions',
    nextStep: 'Keep it in the shared queue until the right desk and owner are clear.',
    evidenceHint: 'Attach one short context note or the original message.',
    isoFocus: 'Planning and follow-up',
  },
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function parseActionLine(line: string) {
  const parts = line.split('|').map((part) => part.trim())
  return {
    title: parts[0] || line.trim(),
    ownerHint: parts[1] || '',
    dueHint: parts[2] || '',
  }
}

export function parseLeads(rawText: string): LeadRow[] {
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
    if (/(tyre|tire|truck|industrial|distributor|auto|service|retail|buyer|spa|clinic|hotel)/i.test(line)) score += 2

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

  return rows.sort((a, b) => b.score - a.score).slice(0, 20)
}

export function buildMarketBrief(text: string): MarketOutput {
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
    themes.length === 1 ? `${themes[0]} moved in the latest signal set.` : `${themes.slice(0, 2).join(' and ')} moved in the latest signal set.`

  return {
    summary,
    themes,
    watchItems: watchItems.slice(0, 4),
    actions: [...new Set(actions)].slice(0, 4),
  }
}

function inferCategory(text: string): ActionBoardCategory {
  const lowered = text.toLowerCase()
  if (/(train|training|coach|coaching|awareness|competenc|skill|refresher|induction)/.test(lowered)) return 'Training'
  if (/(sop|revision|version|document|procedure|work instruction|form|policy|spec|record template)/.test(lowered)) return 'Document control'
  if (/(audit|management review|review meeting|checklist|finding|scorecard|kpi review)/.test(lowered)) return 'Audit / review'
  if (/(quality|defect|capa|reject|inspection|bead wire|ncr|nonconformance|containment|root cause|complaint|scrap|rework|release hold)/.test(lowered)) return 'Quality issue'
  if (/(supplier|customs|eta|shipment|po|coa|receiving|inbound|grn|procurement|approval|variance)/.test(lowered)) return 'Supplier issue'
  if (/(plant|production|power|shift|downtime|operations|machine|breakdown|line|packing|curing|mixing|extrusion|warehouse|dispatch)/.test(lowered)) return 'Shift issue'
  return 'General follow-up'
}

function inferOwner(text: string, category: ActionBoardCategory) {
  const lowered = text.toLowerCase()
  if (category === 'Training') return 'HR / Admin'
  if (category === 'Document control') return 'Admin'
  if (category === 'Audit / review') return 'Plant Manager'
  if (/(quality|defect|capa|reject|inspection|bead wire)/.test(lowered)) return 'Quality'
  if (/(supplier|customs|eta|shipment|po|docs|procurement|junky|kiic)/.test(lowered)) return 'Procurement'
  if (/(cash|invoice|payment|overdue|collection|finance)/.test(lowered)) return 'Finance'
  if (/(sales|demand|distributor|customer|market)/.test(lowered)) return 'Sales'
  if (/(plant|production|power|shift|downtime|operations)/.test(lowered)) return 'Operations'
  return 'Management'
}

function normalizePriority(priority: string | undefined): ActionRow['priority'] | null {
  const normalized = priority?.trim().toLowerCase()
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'low') return 'Low'
  return null
}

function inferPriority(text: string, category: ActionBoardCategory): ActionRow['priority'] {
  const lowered = text.toLowerCase()
  if (/(defect|delay|blocked|overdue|urgent|customs|power|shortage|risk|hold|stop|shutdown|failure|complaint)/.test(lowered)) return 'High'
  if (/(confirm|review|check|follow|inspect|audit|train|revision|document|sop|approve|variance)/.test(lowered)) return 'Medium'
  if (category !== 'General follow-up') return 'Medium'
  return 'Low'
}

function inferDue(priority: ActionRow['priority'], category: ActionBoardCategory) {
  if (priority === 'High') return 'Today'
  if (category === 'Audit / review' || category === 'Document control' || category === 'Training') return 'This week'
  if (priority === 'Medium') return 'This week'
  return 'Next review'
}

function inferLane(priority: ActionRow['priority']) {
  if (priority === 'High') return 'do_now'
  if (priority === 'Medium') return 'this_week'
  return 'watch'
}

type ActionRowSeed = Partial<ActionRow> & Pick<ActionRow, 'title'>

export function hydrateActionRow(row: ActionRowSeed): ActionRow {
  const title = row.title.trim() || 'Follow-up item'
  const category = row.category ?? inferCategory(title)
  const priority = normalizePriority(row.priority) ?? inferPriority(title, category)
  const profile = ACTION_BOARD_PROFILES[category]

  return {
    title,
    owner: row.owner?.trim() || inferOwner(title, category),
    priority,
    due: row.due?.trim() || inferDue(priority, category),
    category,
    desk: row.desk ?? profile.desk,
    deskRoute: row.deskRoute ?? profile.deskRoute,
    nextStep: row.nextStep ?? profile.nextStep,
    evidenceHint: row.evidenceHint ?? profile.evidenceHint,
    isoFocus: row.isoFocus ?? profile.isoFocus,
    lane: row.lane ?? inferLane(priority),
  }
}

export function buildActionBoard(text: string): ActionRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseActionLine(line)
      return hydrateActionRow({
        title: parsed.title,
        owner: parsed.ownerHint || undefined,
        due: parsed.dueHint || undefined,
      })
    })
}

export function downloadLeadCsv(rows: LeadRow[]) {
  const header = 'name,email,phone,website,score'
  const body = rows.map((row) =>
    [row.name, row.email, row.phone, row.website, String(row.score)]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(','),
  )
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'lead_finder.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
