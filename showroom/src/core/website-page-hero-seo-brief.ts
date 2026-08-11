import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePageHeroSeoBrief = {
  totalPages: number
  hasEyebrowCount: number
  hasEyebrowRate: number
  averageHeadlineLength: number
  averageSummaryLength: number
  hasCtaCount: number
  hasCtaRate: number
  seoTitleCompleteCount: number
  seoDescriptionCompleteCount: number
  seoTitleCompleteRate: number
  seoDescriptionCompleteRate: number
}

export function projectWebsitePageHeroSeoBrief(workspace: WebsiteWorkspace): WebsitePageHeroSeoBrief {
  const pages = workspace.pages
  const total = pages.length
  let hasEyebrowCount = 0
  let hasCtaCount = 0
  let seoTitleCompleteCount = 0
  let seoDescriptionCompleteCount = 0
  let totalHeadlineLength = 0
  let totalSummaryLength = 0

  for (const page of pages) {
    if (page.hero.eyebrow.length > 0) hasEyebrowCount++
    if (page.hero.ctaLabel.length > 0 && page.hero.ctaHref.length > 0) hasCtaCount++
    if (page.seo.title.length > 0) seoTitleCompleteCount++
    if (page.seo.description.length > 0) seoDescriptionCompleteCount++
    totalHeadlineLength += page.hero.headline.length
    totalSummaryLength += page.hero.summary.length
  }

  return {
    totalPages: total,
    hasEyebrowCount,
    hasEyebrowRate: total > 0 ? Math.round((hasEyebrowCount / total) * 100) : 0,
    averageHeadlineLength: total > 0 ? Math.round(totalHeadlineLength / total) : 0,
    averageSummaryLength: total > 0 ? Math.round(totalSummaryLength / total) : 0,
    hasCtaCount,
    hasCtaRate: total > 0 ? Math.round((hasCtaCount / total) * 100) : 0,
    seoTitleCompleteCount,
    seoDescriptionCompleteCount,
    seoTitleCompleteRate: total > 0 ? Math.round((seoTitleCompleteCount / total) * 100) : 0,
    seoDescriptionCompleteRate: total > 0 ? Math.round((seoDescriptionCompleteCount / total) * 100) : 0,
  }
}
