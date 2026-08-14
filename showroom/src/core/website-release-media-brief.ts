import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseMediaBrief = {
  totalMedia: number
  totalBytes: number
  averageBytes: number
  minBytes: number | null
  maxBytes: number | null
  decorativeCount: number
  nonDecorativeCount: number
  decorativeRate: number
  uniqueAltLocales: number
}

export function projectWebsiteReleaseMediaBrief(pkg: WebsiteReleasePackage): WebsiteReleaseMediaBrief {
  const media = pkg.media
  const total = media.length
  let totalBytes = 0
  let minBytes: number | null = null
  let maxBytes: number | null = null
  let decorativeCount = 0
  const altLocaleSet = new Set<string>()

  for (const item of media) {
    totalBytes += item.bytes
    if (minBytes === null || item.bytes < minBytes) minBytes = item.bytes
    if (maxBytes === null || item.bytes > maxBytes) maxBytes = item.bytes
    if (item.decorative) decorativeCount++
    for (const entry of item.alt) altLocaleSet.add(entry.locale)
  }

  return {
    totalMedia: total,
    totalBytes,
    averageBytes: total > 0 ? Math.round(totalBytes / total) : 0,
    minBytes,
    maxBytes,
    decorativeCount,
    nonDecorativeCount: total - decorativeCount,
    decorativeRate: total > 0 ? Math.round((decorativeCount / total) * 100) : 0,
    uniqueAltLocales: altLocaleSet.size,
  }
}
