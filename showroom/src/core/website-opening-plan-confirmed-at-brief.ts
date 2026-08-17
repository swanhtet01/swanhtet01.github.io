import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteOpeningPlanConfirmedAtBrief = {
  hasPlan: boolean
  confirmedAt: string | null
  pageCount: number
}

export function projectWebsiteOpeningPlanConfirmedAtBrief(
  workspace: WebsiteWorkspace,
): WebsiteOpeningPlanConfirmedAtBrief {
  const plan = workspace.openingPlan ?? null
  return {
    hasPlan: plan !== null,
    confirmedAt: plan !== null ? plan.confirmedAt : null,
    pageCount: plan !== null ? plan.pageIds.length : 0,
  }
}
