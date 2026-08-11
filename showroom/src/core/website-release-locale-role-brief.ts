import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseLocaleRoleBrief = {
  totalLocales: number
  approvedLocaleCount: number
  draftLocaleCount: number
  approvedLocaleRate: number
  hasDefaultLocale: boolean
  totalRoles: number
  contentOwnerCount: number
  releaseManagerCount: number
  releaseReviewerCount: number
  uniqueActors: number
}

export function projectWebsiteReleaseLocaleRoleBrief(pkg: WebsiteReleasePackage): WebsiteReleaseLocaleRoleBrief {
  const locales = pkg.locales
  const totalLocales = locales.length
  let approvedLocaleCount = 0
  let draftLocaleCount = 0
  let hasDefaultLocale = false

  for (const locale of locales) {
    if (locale.status === 'approved') approvedLocaleCount++
    else draftLocaleCount++
    if (locale.isDefault) hasDefaultLocale = true
  }

  const roles = pkg.roles
  const totalRoles = roles.length
  let contentOwnerCount = 0
  let releaseManagerCount = 0
  let releaseReviewerCount = 0
  const actorSet = new Set<string>()

  for (const role of roles) {
    if (role.role === 'content_owner') contentOwnerCount++
    else if (role.role === 'release_manager') releaseManagerCount++
    else if (role.role === 'release_reviewer') releaseReviewerCount++
    actorSet.add(role.actor)
  }

  return {
    totalLocales,
    approvedLocaleCount,
    draftLocaleCount,
    approvedLocaleRate: totalLocales > 0 ? Math.round((approvedLocaleCount / totalLocales) * 100) : 0,
    hasDefaultLocale,
    totalRoles,
    contentOwnerCount,
    releaseManagerCount,
    releaseReviewerCount,
    uniqueActors: actorSet.size,
  }
}
