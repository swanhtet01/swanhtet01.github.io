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

export type ActionRow = {
  title: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
}

export const LEAD_SAMPLE_QUERY = 'clinic in dubai'
export const LEAD_SAMPLE_TEXT = `North Star Clinic | www.northstarclinic.com | hello@northstarclinic.com | +1 555 111 2222 | outpatient clinic
Harbor Dental Studio | www.harbordentalstudio.com | care@harbordentalstudio.com | +1 555 333 4444 | dental practice
Atlas Logistics Hub | www.atlaslogisticshub.com | contact@atlaslogisticshub.com | +1 555 777 8888 | warehouse and distribution
Summit Industrial Supply | www.summitindustrialsupply.com | sales@summitindustrialsupply.com | +1 555 999 0000 | industrial supplier`

export const MARKET_SAMPLE_TEXT = `Long queues form as vehicles line up for fuel in Yangon.
MRPPA market note: RSS 1 at USD 1800 to 2200 per ton.
Customs clearance delay reported on one inbound industrial shipment.
Distributor demand shifts toward truck tyres this week.`

export const MARKET_SAMPLE_URLS = `https://www.gnlm.com.mm/
https://elevenmyanmar.com/`

export const ACTION_SAMPLE_TEXT = `Customer reply still waiting | Sales Team
Missing production update from Shift B | Operations Team
Confirm receiving variance on inbound batch | Procurement Team
Follow up overdue invoice with two customers | Finance Team
Check quality hold before dispatch | Quality Team`

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
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

export function buildActionBoard(text: string): ActionRow[] {
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
