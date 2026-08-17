import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePageStageNavigationBrief = {
  totalPages: number
  draftCount: number
  readyCount: number
  draftRate: number
  readyRate: number
  visibleInNavigationCount: number
  navigationVisibilityRate: number
  uniqueNavigationLabels: number
  topNavigationLabelsByCount: Array<{ label: string; count: number }>
}

export function projectWebsitePageStageNavigationBrief(
  workspace: WebsiteWorkspace,
): WebsitePageStageNavigationBrief {
  let draftCount = 0
  let readyCount = 0
  let visibleInNavigationCount = 0
  const labelMap = new Map<string, number>()

  for (const page of workspace.pages) {
    if (page.stage === 'ready') readyCount++
    else draftCount++
    if (page.navigation.visible) visibleInNavigationCount++
    labelMap.set(page.navigation.label, (labelMap.get(page.navigation.label) ?? 0) + 1)
  }

  const totalPages = workspace.pages.length

  const topNavigationLabelsByCount = Array.from(labelMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)

  return {
    totalPages,
    draftCount,
    readyCount,
    draftRate: totalPages > 0 ? Math.round((draftCount / totalPages) * 100) : 0,
    readyRate: totalPages > 0 ? Math.round((readyCount / totalPages) * 100) : 0,
    visibleInNavigationCount,
    navigationVisibilityRate: totalPages > 0 ? Math.round((visibleInNavigationCount / totalPages) * 100) : 0,
    uniqueNavigationLabels: labelMap.size,
    topNavigationLabelsByCount,
  }
}
