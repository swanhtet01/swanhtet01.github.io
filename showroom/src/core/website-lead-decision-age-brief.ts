import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadDecisionAgeBrief = {
  totalLeads: number
  decidedLeadCount: number
  withDecisionNoteCount: number
  withDecisionNoteRate: number
  shortNoteCount: number
  mediumNoteCount: number
  longNoteCount: number
  averageDecisionNoteLength: number
  averageDecisionAgeHours: number
  minDecisionAgeHours: number | null
  maxDecisionAgeHours: number | null
}

export function projectWebsiteLeadDecisionAgeBrief(
  ledger: WebsiteLeadLedger,
): WebsiteLeadDecisionAgeBrief {
  let decidedLeadCount = 0
  let withDecisionNoteCount = 0
  let totalNoteLength = 0
  let shortNoteCount = 0
  let mediumNoteCount = 0
  let longNoteCount = 0
  let totalDecisionAgeHours = 0
  let minDecisionAgeHours: number | null = null
  let maxDecisionAgeHours: number | null = null

  for (const lead of ledger.leads) {
    const noteLen = lead.decisionNote.length
    if (noteLen > 0) {
      withDecisionNoteCount++
      totalNoteLength += noteLen
      if (noteLen <= 40) shortNoteCount++
      else if (noteLen <= 120) mediumNoteCount++
      else longNoteCount++
    }

    if (lead.status !== 'new') {
      decidedLeadCount++
      const ageHours = Math.round(
        (Date.parse(lead.updatedAt) - Date.parse(lead.createdAt)) / (1000 * 60 * 60),
      )
      totalDecisionAgeHours += ageHours
      if (minDecisionAgeHours === null || ageHours < minDecisionAgeHours) minDecisionAgeHours = ageHours
      if (maxDecisionAgeHours === null || ageHours > maxDecisionAgeHours) maxDecisionAgeHours = ageHours
    }
  }

  const totalLeads = ledger.leads.length

  return {
    totalLeads,
    decidedLeadCount,
    withDecisionNoteCount,
    withDecisionNoteRate: totalLeads > 0 ? Math.round((withDecisionNoteCount / totalLeads) * 100) : 0,
    shortNoteCount,
    mediumNoteCount,
    longNoteCount,
    averageDecisionNoteLength: withDecisionNoteCount > 0 ? Math.round(totalNoteLength / withDecisionNoteCount) : 0,
    averageDecisionAgeHours: decidedLeadCount > 0 ? Math.round(totalDecisionAgeHours / decidedLeadCount) : 0,
    minDecisionAgeHours,
    maxDecisionAgeHours,
  }
}
