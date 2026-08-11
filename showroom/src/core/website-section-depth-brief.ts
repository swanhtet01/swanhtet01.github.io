import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteSectionDepthBrief = {
  totalPages: number
  pagesWithNoSections: number
  pagesWithSections: number
  sectionCoverage: number
  pagesWithOnlyOneSection: number
  pagesWithTwoToFive: number
  pagesWithSixPlus: number
  maxSectionsPerPage: number
}

export function projectWebsiteSectionDepthBrief(workspace: WebsiteWorkspace): WebsiteSectionDepthBrief {
  if (workspace.pages.length === 0) {
    return {
      totalPages: 0,
      pagesWithNoSections: 0,
      pagesWithSections: 0,
      sectionCoverage: 0,
      pagesWithOnlyOneSection: 0,
      pagesWithTwoToFive: 0,
      pagesWithSixPlus: 0,
      maxSectionsPerPage: 0,
    }
  }

  let pagesWithNoSections = 0
  let pagesWithOnlyOneSection = 0
  let pagesWithTwoToFive = 0
  let pagesWithSixPlus = 0
  let maxSectionsPerPage = 0

  for (const page of workspace.pages) {
    const count = page.sections.length
    if (count > maxSectionsPerPage) maxSectionsPerPage = count
    if (count === 0) {
      pagesWithNoSections++
    } else if (count === 1) {
      pagesWithOnlyOneSection++
    } else if (count <= 5) {
      pagesWithTwoToFive++
    } else {
      pagesWithSixPlus++
    }
  }

  const totalPages = workspace.pages.length
  const pagesWithSections = totalPages - pagesWithNoSections
  return {
    totalPages,
    pagesWithNoSections,
    pagesWithSections,
    sectionCoverage: Math.round((pagesWithSections / totalPages) * 100),
    pagesWithOnlyOneSection,
    pagesWithTwoToFive,
    pagesWithSixPlus,
    maxSectionsPerPage,
  }
}
