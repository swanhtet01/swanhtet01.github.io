import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteOpeningPlanBrief = {
  hasPlan: boolean
  pageCount: number | null
  workflowTemplate: 'business-presence' | 'lead-generation' | 'catalog-showcase' | null
  isBusinessPresence: boolean
  isLeadGeneration: boolean
  isCatalogShowcase: boolean
  hasWorkingSample: boolean
}

export function projectWebsiteOpeningPlanBrief(workspace: WebsiteWorkspace): WebsiteOpeningPlanBrief {
  const plan = workspace.openingPlan ?? null
  const sample = workspace.workingSample ?? null

  return {
    hasPlan: plan !== null,
    pageCount: plan !== null ? plan.pageIds.length : null,
    workflowTemplate: plan?.workflowTemplateId ?? null,
    isBusinessPresence: plan?.workflowTemplateId === 'business-presence',
    isLeadGeneration: plan?.workflowTemplateId === 'lead-generation',
    isCatalogShowcase: plan?.workflowTemplateId === 'catalog-showcase',
    hasWorkingSample: sample !== null,
  }
}
