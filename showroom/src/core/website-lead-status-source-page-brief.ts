import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadStatusSourcePageBrief = {
  totalLeads: number
  newCount: number
  qualifiedCount: number
  closedCount: number
  newRate: number
  qualifiedRate: number
  closedRate: number
  uniqueSourcePages: number
  topSourcePagesByCount: Array<{ sourcePage: string; count: number }>
}

export function projectWebsiteLeadStatusSourcePageBrief(
  ledger: WebsiteLeadLedger,
): WebsiteLeadStatusSourcePageBrief {
  let newCount = 0
  let qualifiedCount = 0
  let closedCount = 0
  const pageMap = new Map<string, number>()

  for (const lead of ledger.leads) {
    switch (lead.status) {
      case 'new': newCount++; break
      case 'qualified': qualifiedCount++; break
      default: closedCount++; break
    }
    pageMap.set(lead.sourcePage, (pageMap.get(lead.sourcePage) ?? 0) + 1)
  }

  const totalLeads = ledger.leads.length

  const topSourcePagesByCount = Array.from(pageMap.entries())
    .map(([sourcePage, count]) => ({ sourcePage, count }))
    .sort((a, b) => b.count - a.count || a.sourcePage.localeCompare(b.sourcePage))
    .slice(0, 5)

  return {
    totalLeads,
    newCount,
    qualifiedCount,
    closedCount,
    newRate: totalLeads > 0 ? Math.round((newCount / totalLeads) * 100) : 0,
    qualifiedRate: totalLeads > 0 ? Math.round((qualifiedCount / totalLeads) * 100) : 0,
    closedRate: totalLeads > 0 ? Math.round((closedCount / totalLeads) * 100) : 0,
    uniqueSourcePages: pageMap.size,
    topSourcePagesByCount,
  }
}
