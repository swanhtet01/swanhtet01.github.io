import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePageSlugDepthBrief = {
  totalPages: number
  rootCount: number
  shallowCount: number
  nestedCount: number
  deepCount: number
  rootRate: number
  shallowRate: number
  nestedRate: number
  deepRate: number
  averageSlugDepth: number
  uniqueSlugs: number
}

function slugDepth(slug: string): number {
  return slug.split('/').filter(s => s.length > 0).length
}

export function projectWebsitePageSlugDepthBrief(workspace: WebsiteWorkspace): WebsitePageSlugDepthBrief {
  const pages = workspace.pages
  const total = pages.length
  let rootCount = 0
  let shallowCount = 0
  let nestedCount = 0
  let deepCount = 0
  let totalDepth = 0
  const slugSet = new Set<string>()

  for (const page of pages) {
    slugSet.add(page.slug)
    const depth = slugDepth(page.slug)
    totalDepth += depth

    if (depth === 0) rootCount++
    else if (depth === 1) shallowCount++
    else if (depth === 2) nestedCount++
    else deepCount++
  }

  return {
    totalPages: total,
    rootCount,
    shallowCount,
    nestedCount,
    deepCount,
    rootRate: total > 0 ? Math.round((rootCount / total) * 100) : 0,
    shallowRate: total > 0 ? Math.round((shallowCount / total) * 100) : 0,
    nestedRate: total > 0 ? Math.round((nestedCount / total) * 100) : 0,
    deepRate: total > 0 ? Math.round((deepCount / total) * 100) : 0,
    averageSlugDepth: total > 0 ? Math.round(totalDepth / total) : 0,
    uniqueSlugs: slugSet.size,
  }
}
