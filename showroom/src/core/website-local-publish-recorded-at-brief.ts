import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteLocalPublishRecordedAtBrief = {
  totalPublishes: number
  earliestRecordedAt: string | null
  latestRecordedAt: string | null
  spannedDays: number
}

export function projectWebsiteLocalPublishRecordedAtBrief(
  workspace: WebsiteWorkspace,
): WebsiteLocalPublishRecordedAtBrief {
  const total = workspace.localPublishes.length
  if (total === 0) {
    return { totalPublishes: 0, earliestRecordedAt: null, latestRecordedAt: null, spannedDays: 0 }
  }

  let earliest = workspace.localPublishes[0].recordedAt
  let latest = workspace.localPublishes[0].recordedAt

  for (const p of workspace.localPublishes) {
    if (p.recordedAt < earliest) earliest = p.recordedAt
    if (p.recordedAt > latest) latest = p.recordedAt
  }

  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0

  return { totalPublishes: total, earliestRecordedAt: earliest, latestRecordedAt: latest, spannedDays }
}
