import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadRequestLengthBrief = {
  totalLeads: number
  shortRequestCount: number
  mediumRequestCount: number
  longRequestCount: number
  shortRequestRate: number
  mediumRequestRate: number
  longRequestRate: number
  minRequestLength: number | null
  maxRequestLength: number | null
  averageRequestLength: number
}

export function projectWebsiteLeadRequestLengthBrief(ledger: WebsiteLeadLedger): WebsiteLeadRequestLengthBrief {
  const leads = ledger.leads
  const total = leads.length
  let shortRequestCount = 0
  let mediumRequestCount = 0
  let longRequestCount = 0
  let minRequestLength: number | null = null
  let maxRequestLength: number | null = null
  let totalLength = 0

  for (const lead of leads) {
    const len = lead.request.length
    totalLength += len

    if (len <= 40) shortRequestCount++
    else if (len <= 120) mediumRequestCount++
    else longRequestCount++

    if (minRequestLength === null || len < minRequestLength) minRequestLength = len
    if (maxRequestLength === null || len > maxRequestLength) maxRequestLength = len
  }

  return {
    totalLeads: total,
    shortRequestCount,
    mediumRequestCount,
    longRequestCount,
    shortRequestRate: total > 0 ? Math.round((shortRequestCount / total) * 100) : 0,
    mediumRequestRate: total > 0 ? Math.round((mediumRequestCount / total) * 100) : 0,
    longRequestRate: total > 0 ? Math.round((longRequestCount / total) * 100) : 0,
    minRequestLength,
    maxRequestLength,
    averageRequestLength: total > 0 ? Math.round(totalLength / total) : 0,
  }
}
