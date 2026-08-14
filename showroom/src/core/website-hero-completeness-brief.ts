import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteHeroCompletenessBrief = {
  totalPages: number
  pagesWithEyebrow: number
  pagesWithHeadline: number
  pagesWithSummary: number
  pagesWithCtaLabel: number
  pagesWithCtaHref: number
  pagesWithFullHero: number
  heroCoverage: number
}

export function projectWebsiteHeroCompletenessBrief(workspace: WebsiteWorkspace): WebsiteHeroCompletenessBrief {
  let pagesWithEyebrow = 0
  let pagesWithHeadline = 0
  let pagesWithSummary = 0
  let pagesWithCtaLabel = 0
  let pagesWithCtaHref = 0
  let pagesWithFullHero = 0

  for (const page of workspace.pages) {
    const { eyebrow, headline, summary, ctaLabel, ctaHref } = page.hero
    const hasEyebrow = eyebrow.trim().length > 0
    const hasHeadline = headline.trim().length > 0
    const hasSummary = summary.trim().length > 0
    const hasCtaLabel = ctaLabel.trim().length > 0
    const hasCtaHref = ctaHref.trim().length > 0

    if (hasEyebrow) pagesWithEyebrow++
    if (hasHeadline) pagesWithHeadline++
    if (hasSummary) pagesWithSummary++
    if (hasCtaLabel) pagesWithCtaLabel++
    if (hasCtaHref) pagesWithCtaHref++
    if (hasEyebrow && hasHeadline && hasSummary && hasCtaLabel && hasCtaHref) pagesWithFullHero++
  }

  const totalPages = workspace.pages.length
  return {
    totalPages,
    pagesWithEyebrow,
    pagesWithHeadline,
    pagesWithSummary,
    pagesWithCtaLabel,
    pagesWithCtaHref,
    pagesWithFullHero,
    heroCoverage: totalPages > 0 ? Math.round((pagesWithFullHero / totalPages) * 100) : 0,
  }
}
