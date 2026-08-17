import type { CommerceState } from './commerce-workspace.ts'

export type ShopAccountMappingSummary = {
  totalConfigurations: number
  latestRevision: number | null
  totalMappingEntries: number
  uniqueRoles: number
  uniqueExternalCodes: number
}

export function projectShopAccountMappingSummary(commerce: CommerceState): ShopAccountMappingSummary {
  const configurations = commerce.accountMappingConfigurations ?? []
  const roleSet = new Set<string>()
  const codeSet = new Set<string>()
  let latestRevision: number | null = null
  let totalMappingEntries = 0

  for (const config of configurations) {
    if (latestRevision === null || config.revision > latestRevision) latestRevision = config.revision
    for (const entry of config.mappings) {
      roleSet.add(entry.accountRole)
      codeSet.add(entry.externalAccountCode)
      totalMappingEntries++
    }
  }

  return {
    totalConfigurations: configurations.length,
    latestRevision,
    totalMappingEntries,
    uniqueRoles: roleSet.size,
    uniqueExternalCodes: codeSet.size,
  }
}
