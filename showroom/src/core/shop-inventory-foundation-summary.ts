import type { CommerceState } from './commerce-workspace.ts'

export type ShopInventoryFoundationSummary = {
  loaded: boolean
  revision: number
  commandCount: number
}

export function projectShopInventoryFoundationSummary(commerce: CommerceState): ShopInventoryFoundationSummary {
  const foundation = commerce.inventoryFoundation

  if (foundation === undefined) {
    return { loaded: false, revision: 0, commandCount: 0 }
  }

  return {
    loaded: true,
    revision: foundation.revision,
    commandCount: foundation.commands.length,
  }
}
