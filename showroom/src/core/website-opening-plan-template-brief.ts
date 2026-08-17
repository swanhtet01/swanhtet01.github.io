import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export type WebsiteOpeningPlanTemplateBrief = {
  hasOpeningPlan: boolean
  workflowTemplateId: 'business-presence' | 'lead-generation' | 'catalog-showcase' | null
  isBusinessPresence: boolean
  isLeadGeneration: boolean
  isCatalogShowcase: boolean
}

export function projectWebsiteOpeningPlanTemplateBrief(
  workspace: WebsiteWorkspace,
): WebsiteOpeningPlanTemplateBrief {
  const plan = workspace.openingPlan
  if (plan === undefined) {
    return {
      hasOpeningPlan: false,
      workflowTemplateId: null,
      isBusinessPresence: false,
      isLeadGeneration: false,
      isCatalogShowcase: false,
    }
  }

  const templateId = plan.workflowTemplateId

  return {
    hasOpeningPlan: true,
    workflowTemplateId: templateId,
    isBusinessPresence: templateId === 'business-presence',
    isLeadGeneration: templateId === 'lead-generation',
    isCatalogShowcase: templateId === 'catalog-showcase',
  }
}
