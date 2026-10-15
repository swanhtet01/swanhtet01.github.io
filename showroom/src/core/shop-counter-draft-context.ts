import type { CounterTicketStorageScope } from './shop-parked-tickets'

export type ShopCounterDraftContext = {
  key: string
  persistLocalDraft: boolean
  storageScope: CounterTicketStorageScope | null
}

// Managed recovery stays device-local, but its keys and lock are bound to the
// exact workspace and user. The legacy device-wide basket remains local-only.
export function shopCounterDraftContext(confirmedLocalShop: boolean, identity: { workspaceId: string; userId: string } | null): ShopCounterDraftContext {
  if (identity) {
    const key = JSON.stringify(['managed', identity.workspaceId, identity.userId])
    const valid = Boolean(identity.workspaceId.trim() && identity.userId.trim() && identity.workspaceId.length <= 180 && identity.userId.length <= 180)
    return {
      key,
      persistLocalDraft: valid,
      storageScope: valid ? `:${key}` : null,
    }
  }
  return { key: confirmedLocalShop ? 'local' : 'checking', persistLocalDraft: confirmedLocalShop, storageScope: null }
}
