import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadCreatedAtBrief = {
  totalLeads: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectWebsiteLeadCreatedAtBrief(
  ledger: WebsiteLeadLedger,
): WebsiteLeadCreatedAtBrief {
  const total = ledger.leads.length
  if (total === 0)
    return { totalLeads: 0, earliestCreatedAt: null, latestCreatedAt: null, spannedDays: 0 }
  let earliest = ledger.leads[0].createdAt
  let latest = ledger.leads[0].createdAt
  for (const lead of ledger.leads) {
    if (lead.createdAt < earliest) earliest = lead.createdAt
    if (lead.createdAt > latest) latest = lead.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return { totalLeads: total, earliestCreatedAt: earliest, latestCreatedAt: latest, spannedDays }
}
