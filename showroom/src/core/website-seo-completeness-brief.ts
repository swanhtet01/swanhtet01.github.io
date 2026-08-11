import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteSeoCompletenessBrief = {
  totalPages: number
  pagesWithSeoTitle: number
  pagesWithSeoDescription: number
  pagesFullySeoComplete: number
  seoCoverage: number
  readyPagesTotal: number
  readyPagesFullySeoComplete: number
  readySeoCoverage: number
}

export function projectWebsiteSeoCompletenessBrief(workspace: WebsiteWorkspace): WebsiteSeoCompletenessBrief {
  let pagesWithSeoTitle = 0
  let pagesWithSeoDescription = 0
  let pagesFullySeoComplete = 0
  let readyPagesTotal = 0
  let readyPagesFullySeoComplete = 0

  for (const page of workspace.pages) {
    const hasTitle = page.seo.title.trim().length > 0
    const hasDescription = page.seo.description.trim().length > 0
    const fullySeoComplete = hasTitle && hasDescription

    if (hasTitle) pagesWithSeoTitle++
    if (hasDescription) pagesWithSeoDescription++
    if (fullySeoComplete) pagesFullySeoComplete++

    if (page.stage === 'ready') {
      readyPagesTotal++
      if (fullySeoComplete) readyPagesFullySeoComplete++
    }
  }

  const totalPages = workspace.pages.length
  return {
    totalPages,
    pagesWithSeoTitle,
    pagesWithSeoDescription,
    pagesFullySeoComplete,
    seoCoverage: totalPages > 0 ? Math.round((pagesFullySeoComplete / totalPages) * 100) : 0,
    readyPagesTotal,
    readyPagesFullySeoComplete,
    readySeoCoverage: readyPagesTotal > 0 ? Math.round((readyPagesFullySeoComplete / readyPagesTotal) * 100) : 0,
  }
}
