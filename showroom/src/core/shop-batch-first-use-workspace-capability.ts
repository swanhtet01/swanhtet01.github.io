export const SHOP_BATCH_FIRST_USE_LOCAL_SCOPE = 'confirmed-local' as const

export type ShopBatchFirstUseWorkspaceCapability = {
  readonly scope: typeof SHOP_BATCH_FIRST_USE_LOCAL_SCOPE
  readonly active: boolean
}

export type ShopBatchFirstUseWorkspaceCapabilityReader = () => ShopBatchFirstUseWorkspaceCapability | null

const capabilityState = new WeakMap<ShopBatchFirstUseWorkspaceCapability, { active: boolean }>()

export function createShopBatchFirstUseWorkspaceCapability(): ShopBatchFirstUseWorkspaceCapability {
  const state = { active: true }
  const capability = Object.freeze({
    scope: SHOP_BATCH_FIRST_USE_LOCAL_SCOPE,
    get active() { return state.active },
  })
  capabilityState.set(capability, state)
  return capability
}

export function revokeShopBatchFirstUseWorkspaceCapability(capability: ShopBatchFirstUseWorkspaceCapability) {
  const state = capabilityState.get(capability)
  if (state) state.active = false
}

export function shopBatchFirstUseWorkspaceCapabilityIsCurrent(
  expected: ShopBatchFirstUseWorkspaceCapability | null,
  current: ShopBatchFirstUseWorkspaceCapability | null,
) {
  return Boolean(expected
    && capabilityState.get(expected)?.active === true
    && expected.active === true
    && current === expected)
}
