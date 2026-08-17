import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteSectionContentBrief = {
  totalSections: number
  sectionsWithTitle: number
  sectionsWithBody: number
  sectionsWithEyebrow: number
  sectionsComplete: number
  titleCoverage: number
  bodyCoverage: number
  eyebrowCoverage: number
  completionRate: number
}

export function projectWebsiteSectionContentBrief(workspace: WebsiteWorkspace): WebsiteSectionContentBrief {
  let sectionsWithTitle = 0
  let sectionsWithBody = 0
  let sectionsWithEyebrow = 0
  let sectionsComplete = 0
  let totalSections = 0

  for (const page of workspace.pages) {
    for (const section of page.sections) {
      totalSections++
      const hasTitle = section.title.trim().length > 0
      const hasBody = section.body.trim().length > 0
      const hasEyebrow = section.eyebrow.trim().length > 0
      if (hasTitle) sectionsWithTitle++
      if (hasBody) sectionsWithBody++
      if (hasEyebrow) sectionsWithEyebrow++
      if (hasTitle && hasBody) sectionsComplete++
    }
  }

  return {
    totalSections,
    sectionsWithTitle,
    sectionsWithBody,
    sectionsWithEyebrow,
    sectionsComplete,
    titleCoverage: totalSections > 0 ? Math.round((sectionsWithTitle / totalSections) * 100) : 0,
    bodyCoverage: totalSections > 0 ? Math.round((sectionsWithBody / totalSections) * 100) : 0,
    eyebrowCoverage: totalSections > 0 ? Math.round((sectionsWithEyebrow / totalSections) * 100) : 0,
    completionRate: totalSections > 0 ? Math.round((sectionsComplete / totalSections) * 100) : 0,
  }
}
