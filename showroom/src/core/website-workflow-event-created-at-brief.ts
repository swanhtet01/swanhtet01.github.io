import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteWorkflowEventCreatedAtBrief = {
  totalEvents: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectWebsiteWorkflowEventCreatedAtBrief(
  workspace: WebsiteWorkspace,
): WebsiteWorkflowEventCreatedAtBrief {
  const total = workspace.events.length
  if (total === 0)
    return { totalEvents: 0, earliestCreatedAt: null, latestCreatedAt: null, spannedDays: 0 }
  let earliest = workspace.events[0].createdAt
  let latest = workspace.events[0].createdAt
  for (const event of workspace.events) {
    if (event.createdAt < earliest) earliest = event.createdAt
    if (event.createdAt > latest) latest = event.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return { totalEvents: total, earliestCreatedAt: earliest, latestCreatedAt: latest, spannedDays }
}
