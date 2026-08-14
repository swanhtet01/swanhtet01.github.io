import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteOpeningPlanSummary = {
  loaded: boolean
  pageCount: number
  workflowTemplateId: 'business-presence' | 'lead-generation' | 'catalog-showcase' | null
  confirmedAt: string | null
}

export function projectWebsiteOpeningPlanSummary(workspace: WebsiteWorkspace): WebsiteOpeningPlanSummary {
  const plan = workspace.openingPlan

  if (plan === undefined) {
    return { loaded: false, pageCount: 0, workflowTemplateId: null, confirmedAt: null }
  }

  return {
    loaded: true,
    pageCount: plan.pageIds.length,
    workflowTemplateId: plan.workflowTemplateId,
    confirmedAt: plan.confirmedAt,
  }
}
