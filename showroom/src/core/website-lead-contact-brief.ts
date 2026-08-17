import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadContactBrief = {
  totalLeads: number
  uniqueContacts: number
  topContact: string | null
  topContactCount: number
}

export function projectWebsiteLeadContactBrief(
  ledger: WebsiteLeadLedger,
): WebsiteLeadContactBrief {
  const total = ledger.leads.length
  if (total === 0)
    return { totalLeads: 0, uniqueContacts: 0, topContact: null, topContactCount: 0 }
  const counts = new Map<string, number>()
  for (const lead of ledger.leads) {
    counts.set(lead.contact, (counts.get(lead.contact) ?? 0) + 1)
  }
  let topContact: string | null = null
  let topContactCount = 0
  for (const [key, count] of counts) {
    if (count > topContactCount) {
      topContactCount = count
      topContact = key
    }
  }
  return { totalLeads: total, uniqueContacts: counts.size, topContact, topContactCount }
}
