import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteContentSummary = {
  totalPages: number
  draftPages: number
  readyPages: number
  visibleInNav: number
  totalSections: number
  averageSectionsPerPage: number
  lastUpdatedAt: string | null
}

export function projectWebsiteContentSummary(workspace: WebsiteWorkspace): WebsiteContentSummary {
  let draftPages = 0
  let readyPages = 0
  let visibleInNav = 0
  let totalSections = 0
  let lastUpdatedAt: string | null = null

  for (const page of workspace.pages) {
    if (page.stage === 'ready') readyPages++
    else draftPages++
    if (page.navigation.visible) visibleInNav++
    totalSections += page.sections.length
    if (!lastUpdatedAt || page.updatedAt > lastUpdatedAt) lastUpdatedAt = page.updatedAt
  }

  const totalPages = workspace.pages.length
  return {
    totalPages,
    draftPages,
    readyPages,
    visibleInNav,
    totalSections,
    averageSectionsPerPage: totalPages > 0 ? Math.round(totalSections / totalPages) : 0,
    lastUpdatedAt,
  }
}
