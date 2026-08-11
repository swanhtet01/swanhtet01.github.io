import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseSourceEvidenceBrief = {
  totalEvidence: number
  contentCount: number
  linksCount: number
  responsiveCount: number
  contentRate: number
  linksRate: number
  responsiveRate: number
  uniqueVerifiers: number
  hasAllThreeKinds: boolean
}

export function projectWebsiteReleaseSourceEvidenceBrief(
  pkg: WebsiteReleasePackage,
): WebsiteReleaseSourceEvidenceBrief {
  const evidence = pkg.source.evidence
  const totalEvidence = evidence.length

  let contentCount = 0
  let linksCount = 0
  let responsiveCount = 0
  const verifiers = new Set<string>()

  for (const item of evidence) {
    if (item.kind === 'content') contentCount++
    else if (item.kind === 'links') linksCount++
    else if (item.kind === 'responsive') responsiveCount++
    verifiers.add(item.verifiedBy)
  }

  return {
    totalEvidence,
    contentCount,
    linksCount,
    responsiveCount,
    contentRate: totalEvidence > 0 ? Math.round((contentCount / totalEvidence) * 100) : 0,
    linksRate: totalEvidence > 0 ? Math.round((linksCount / totalEvidence) * 100) : 0,
    responsiveRate: totalEvidence > 0 ? Math.round((responsiveCount / totalEvidence) * 100) : 0,
    uniqueVerifiers: verifiers.size,
    hasAllThreeKinds: contentCount > 0 && linksCount > 0 && responsiveCount > 0,
  }
}
