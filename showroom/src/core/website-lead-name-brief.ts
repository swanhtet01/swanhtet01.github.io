import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadNameBrief = {
  totalLeads: number
  uniqueNames: number
  topName: string | null
  topNameCount: number
}

export function projectWebsiteLeadNameBrief(
  ledger: WebsiteLeadLedger,
): WebsiteLeadNameBrief {
  const total = ledger.leads.length
  if (total === 0) return { totalLeads: 0, uniqueNames: 0, topName: null, topNameCount: 0 }
  const counts = new Map<string, number>()
  for (const lead of ledger.leads) {
    counts.set(lead.name, (counts.get(lead.name) ?? 0) + 1)
  }
  let topName: string | null = null
  let topNameCount = 0
  for (const [key, count] of counts) {
    if (count > topNameCount) {
      topNameCount = count
      topName = key
    }
  }
  return { totalLeads: total, uniqueNames: counts.size, topName, topNameCount }
}
