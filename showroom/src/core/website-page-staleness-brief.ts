import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsitePageStalenessBrief = {
  totalPages: number
  freshCount: number
  recentCount: number
  staleCount: number
  freshRate: number
  recentRate: number
  staleRate: number
  minAgeDays: number | null
  maxAgeDays: number | null
  averageAgeDays: number
}

export function projectWebsitePageStalenessBrief(
  workspace: WebsiteWorkspace,
  nowIso: string,
): WebsitePageStalenessBrief {
  const nowMs = Date.parse(nowIso)
  let freshCount = 0
  let recentCount = 0
  let staleCount = 0
  let totalAgeDays = 0
  let minAgeDays: number | null = null
  let maxAgeDays: number | null = null

  for (const page of workspace.pages) {
    const ageDays = Math.round((nowMs - Date.parse(page.updatedAt)) / (1000 * 60 * 60 * 24))
    totalAgeDays += ageDays
    if (minAgeDays === null || ageDays < minAgeDays) minAgeDays = ageDays
    if (maxAgeDays === null || ageDays > maxAgeDays) maxAgeDays = ageDays
    if (ageDays <= 7) freshCount++
    else if (ageDays <= 30) recentCount++
    else staleCount++
  }

  const totalPages = workspace.pages.length

  return {
    totalPages,
    freshCount,
    recentCount,
    staleCount,
    freshRate: totalPages > 0 ? Math.round((freshCount / totalPages) * 100) : 0,
    recentRate: totalPages > 0 ? Math.round((recentCount / totalPages) * 100) : 0,
    staleRate: totalPages > 0 ? Math.round((staleCount / totalPages) * 100) : 0,
    minAgeDays,
    maxAgeDays,
    averageAgeDays: totalPages > 0 ? Math.round(totalAgeDays / totalPages) : 0,
  }
}
