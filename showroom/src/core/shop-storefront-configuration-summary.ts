import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontConfigurationSummary = {
  configured: boolean
  revision: number
  selectedSkuCount: number
  merchandisingCount: number
  isActivated: boolean
  workflowTemplate: 'social-storefront' | 'pickup-preorder' | 'wholesale-request' | null
}

export function projectShopStorefrontConfigurationSummary(commerce: CommerceState): ShopStorefrontConfigurationSummary {
  const cfg = commerce.storefrontConfiguration

  if (cfg === undefined) {
    return {
      configured: false,
      revision: 0,
      selectedSkuCount: 0,
      merchandisingCount: 0,
      isActivated: false,
      workflowTemplate: null,
    }
  }

  return {
    configured: true,
    revision: cfg.revision,
    selectedSkuCount: cfg.selectedSkus.length,
    merchandisingCount: cfg.merchandising?.length ?? 0,
    isActivated: cfg.activation !== undefined,
    workflowTemplate: cfg.activation?.workflowTemplateId ?? null,
  }
}
