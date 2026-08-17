import type { WebsiteLeadLedger } from '../products/website/website-leads.ts'

export type WebsiteLeadOwnerBrief = {
  totalLeads: number
  assignedLeads: number
  assignmentRate: number
  uniqueOwners: number
  topOwnersByCount: Array<{ owner: string; count: number }>
  leadsWithDecisionNote: number
  decisionNoteRate: number
  uniqueDecisionNotes: number
  topDecisionNotesByCount: Array<{ note: string; count: number }>
}

export function projectWebsiteLeadOwnerBrief(ledger: WebsiteLeadLedger): WebsiteLeadOwnerBrief {
  let totalLeads = 0
  let assignedLeads = 0
  let leadsWithDecisionNote = 0
  const ownerMap = new Map<string, number>()
  const noteMap = new Map<string, number>()

  for (const lead of ledger.leads) {
    totalLeads++
    if (lead.owner !== '') {
      assignedLeads++
      ownerMap.set(lead.owner, (ownerMap.get(lead.owner) ?? 0) + 1)
    }
    if (lead.decisionNote !== '') {
      leadsWithDecisionNote++
      noteMap.set(lead.decisionNote, (noteMap.get(lead.decisionNote) ?? 0) + 1)
    }
  }

  const topOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  const topDecisionNotesByCount = Array.from(noteMap.entries())
    .map(([note, count]) => ({ note, count }))
    .sort((a, b) => b.count - a.count || a.note.localeCompare(b.note))
    .slice(0, 5)

  return {
    totalLeads,
    assignedLeads,
    assignmentRate: totalLeads > 0 ? Math.round((assignedLeads / totalLeads) * 100) : 0,
    uniqueOwners: ownerMap.size,
    topOwnersByCount,
    leadsWithDecisionNote,
    decisionNoteRate: totalLeads > 0 ? Math.round((leadsWithDecisionNote / totalLeads) * 100) : 0,
    uniqueDecisionNotes: noteMap.size,
    topDecisionNotesByCount,
  }
}
