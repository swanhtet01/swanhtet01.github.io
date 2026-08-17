import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteLocalPublishArtifactBrief = {
  totalPublishes: number
  publishesWithArtifact: number
  artifactPresenceRate: number
  totalArtifactPages: number
  averageArtifactPageCount: number
  uniqueArtifactSiteNames: number
  topArtifactSiteNamesByCount: Array<{ name: string; count: number }>
}

export function projectWebsiteLocalPublishArtifactBrief(
  workspace: WebsiteWorkspace,
): WebsiteLocalPublishArtifactBrief {
  let totalPublishes = 0
  let publishesWithArtifact = 0
  let totalArtifactPages = 0
  const siteNameMap = new Map<string, number>()

  for (const record of workspace.localPublishes) {
    totalPublishes++
    if (record.artifact === null) continue
    publishesWithArtifact++
    totalArtifactPages += record.artifact.pages.length
    const name = record.artifact.siteName
    siteNameMap.set(name, (siteNameMap.get(name) ?? 0) + 1)
  }

  const topArtifactSiteNamesByCount = Array.from(siteNameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)

  return {
    totalPublishes,
    publishesWithArtifact,
    artifactPresenceRate:
      totalPublishes > 0 ? Math.round((publishesWithArtifact / totalPublishes) * 100) : 0,
    totalArtifactPages,
    averageArtifactPageCount:
      publishesWithArtifact > 0 ? Math.round(totalArtifactPages / publishesWithArtifact) : 0,
    uniqueArtifactSiteNames: siteNameMap.size,
    topArtifactSiteNamesByCount,
  }
}
