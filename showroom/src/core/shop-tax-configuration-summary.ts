import type { CommerceState } from './commerce-workspace.ts'

export type ShopTaxConfigurationSummary = {
  totalConfigurations: number
  uniqueCodes: number
  byMode: { exclusive: number; inclusive: number }
  highestRateBasisPoints: number
  withJurisdiction: number
  withEffectiveFrom: number
}

export function projectShopTaxConfigurationSummary(commerce: CommerceState): ShopTaxConfigurationSummary {
  const configurations = commerce.taxConfigurations ?? []
  const codeSet = new Set<string>()
  const byMode = { exclusive: 0, inclusive: 0 }
  let highestRateBasisPoints = 0
  let withJurisdiction = 0
  let withEffectiveFrom = 0

  for (const config of configurations) {
    codeSet.add(config.code)
    byMode[config.mode]++
    if (config.rateBasisPoints > highestRateBasisPoints) highestRateBasisPoints = config.rateBasisPoints
    if (config.jurisdictionCode !== undefined) withJurisdiction++
    if (config.effectiveFrom !== undefined) withEffectiveFrom++
  }

  return {
    totalConfigurations: configurations.length,
    uniqueCodes: codeSet.size,
    byMode,
    highestRateBasisPoints,
    withJurisdiction,
    withEffectiveFrom,
  }
}
