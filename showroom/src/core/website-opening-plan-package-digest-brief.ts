import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteOpeningPlanPackageDigestBrief = {
  hasOpeningPlan: boolean
  packageDigest: string | null
  packageDigestAlgorithm: string | null
}

export function projectWebsiteOpeningPlanPackageDigestBrief(
  workspace: WebsiteWorkspace,
): WebsiteOpeningPlanPackageDigestBrief {
  const plan = workspace.openingPlan
  if (plan === undefined) {
    return { hasOpeningPlan: false, packageDigest: null, packageDigestAlgorithm: null }
  }
  const colonIdx = plan.packageDigest.indexOf(':')
  const packageDigestAlgorithm = colonIdx >= 0 ? plan.packageDigest.slice(0, colonIdx) : null
  return {
    hasOpeningPlan: true,
    packageDigest: plan.packageDigest,
    packageDigestAlgorithm,
  }
}
