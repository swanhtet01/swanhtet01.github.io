const exactWorkspaceKeys = new Set([
  'supermega.commerce.workspace.v2',
  'supermega.production.workspace.v2',
  'supermega.approvals.v3',
  'supermega.setup.v3',
  'supermega.product_setups.v1',
  'supermega.accountable.actions.v1',
  'supermega.behavior-trail.v1',
  'supermega.shop.order_draft_reset.v1',
  // The in-progress counter sale and remembered operator name must participate in local
  // reset, restore points, and backup restore so a reset cannot retain the previous sale.
  'supermega.shop.counter_draft.v1',
  'supermega.last_operator.v1',
  'supermega.ecommerce.storefront_draft_reset.v1',
  'supermega.team.workspace.v4',
  'supermega.website.workspace.v2',
  'supermega.website.workspace.v1',
  'supermega.website.leads.v1',
  'supermega.website-ecommerce-handoff.v1',
  'supermega.client-demo-workspace.v1',
  'supermega.ecommerce.storefront_draft.v1',
  'supermega.shop.service-schedule.v1',
  'supermega.plant.industry-pack.v1',
  'supermega.pilot-outcome.v1',
  'supermega.owner-control-acknowledgements.v1',
  'supermega.team.workspace.v3',
  'supermega.team.workspace.v2',
  'supermega.commerce.workspace.v1',
  'supermega.shop.workspace.v2',
  'supermega.production.workspace.v1',
  'supermega.plant.workspace.v2',
  'supermega.approvals.v2',
  'supermega.setup.v2',
])

const workspaceKeyPrefixes = [
  'supermega.plant.order-foundation.v1:',
  'supermega.ecommerce.storefront_draft.v2.',
  'supermega.ecommerce.storefront_draft.v1.',
  'supermega.shop.order_draft.v1.',
  'supermega.website.workspace.recovery.v1.',
  'supermega.website.closed-inquiry-entry.v1.',
  'supermega.website.release-foundation.v1:',
  'supermega.ecommerce.buying_lifecycle.v1.',
  'supermega.ecommerce.closed-checkout-entry.v1.',
]

type WorkspaceStorageReader = Pick<Storage, 'key' | 'length'>

export function isLocalWorkspaceKey(key: string) {
  return exactWorkspaceKeys.has(key) || workspaceKeyPrefixes.some((prefix) => key.startsWith(prefix))
}

export function listLocalWorkspaceStorageKeys(storage: WorkspaceStorageReader) {
  const keys = new Set<string>()
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && isLocalWorkspaceKey(key)) keys.add(key)
  }
  return [...keys].sort()
}
