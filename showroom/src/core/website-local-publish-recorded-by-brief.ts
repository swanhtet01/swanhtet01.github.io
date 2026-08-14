import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteLocalPublishRecordedByBrief = {
  totalPublishes: number
  uniquePublishers: number
  topPublisher: string | null
  topPublisherCount: number
}

export function projectWebsiteLocalPublishRecordedByBrief(
  workspace: WebsiteWorkspace,
): WebsiteLocalPublishRecordedByBrief {
  const total = workspace.localPublishes.length
  if (total === 0) {
    return { totalPublishes: 0, uniquePublishers: 0, topPublisher: null, topPublisherCount: 0 }
  }

  const counts = new Map<string, number>()
  for (const p of workspace.localPublishes) {
    counts.set(p.recordedBy, (counts.get(p.recordedBy) ?? 0) + 1)
  }

  let topPublisher: string | null = null
  let topPublisherCount = 0
  for (const [key, count] of counts) {
    if (count > topPublisherCount) {
      topPublisherCount = count
      topPublisher = key
    }
  }

  return {
    totalPublishes: total,
    uniquePublishers: counts.size,
    topPublisher,
    topPublisherCount,
  }
}
