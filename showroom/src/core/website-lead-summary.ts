import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadSourceMetrics = {
  total: number
  qualified: number
  closed: number
}

export type WebsiteLeadSummary = {
  totalLeads: number
  newLeads: number
  qualifiedLeads: number
  closedLeads: number
  qualificationRate: number
  closureRate: number
  bySourcePage: Record<string, WebsiteLeadSourceMetrics>
}

export function projectWebsiteLeadSummary(ledger: WebsiteLeadLedger, date?: string): WebsiteLeadSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  let newLeads = 0, qualifiedLeads = 0, closedLeads = 0
  const bySourcePage: Record<string, WebsiteLeadSourceMetrics> = {}

  for (const lead of ledger.leads) {
    if (!filter(lead.createdAt)) continue
    const entry = bySourcePage[lead.sourcePage] ?? { total: 0, qualified: 0, closed: 0 }
    entry.total += 1
    if (lead.status === 'new') newLeads += 1
    else if (lead.status === 'qualified') { qualifiedLeads += 1; entry.qualified += 1 }
    else if (lead.status === 'closed') { closedLeads += 1; entry.closed += 1 }
    bySourcePage[lead.sourcePage] = entry
  }

  const totalLeads = newLeads + qualifiedLeads + closedLeads
  return {
    totalLeads,
    newLeads,
    qualifiedLeads,
    closedLeads,
    qualificationRate: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0,
    closureRate: totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0,
    bySourcePage,
  }
}
