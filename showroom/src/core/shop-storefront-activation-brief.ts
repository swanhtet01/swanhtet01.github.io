import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontActivationBrief = {
  hasActivation: boolean
  workflowTemplateId: string | null
  confirmedAt: string | null
  skuCount: number
}

export function projectShopStorefrontActivationBrief(
  commerce: CommerceState,
): ShopStorefrontActivationBrief {
  const activation = commerce.storefrontConfiguration?.activation

  if (activation === undefined) {
    return { hasActivation: false, workflowTemplateId: null, confirmedAt: null, skuCount: 0 }
  }

  return {
    hasActivation: true,
    workflowTemplateId: activation.workflowTemplateId,
    confirmedAt: activation.confirmedAt,
    skuCount: activation.skus.length,
  }
}
