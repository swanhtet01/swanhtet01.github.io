const exactWorkspaceKeys = new Set([
  'supermega.commerce.workspace.v2',
  'supermega.production.workspace.v2',
  'supermega.approvals.v3',
  'supermega.setup.v3',
  'supermega.product_setups.v1',
  'supermega.accountable.actions.v1',
  'supermega.behavior-trail.v1',
  'supermega.shop.order_draft_reset.v1',
  // The trial signup record, which can hold a consented email address. Registered so
  // "Reset this device" actually erases it and a workspace backup carries it -- an unregistered
  // key would leave a person's contact details behind after they asked for a clean device.
  'supermega.trial_signup.v1',
  // The in-progress counter sale and the remembered operator name. Registered so
  // "Confirm local reset", restore points and backup restore all reach them. The reset UI
  // promises to clear drafts; without these it reseeds the catalog while the previous
  // basket and the previous person's name survive on top of the supposedly clean workspace.
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
  'supermega.website.release-foundation.v1:',
  'supermega.ecommerce.buying_lifecycle.v1.',
]

type WorkspaceStorageReader = Pick<Storage, 'key' | 'length'>

/**
 * Exported so a guard can compare the RESET scope against the BACKUP scope. Restore deletes every
 * resettable key the backup did not capture (company-backup.ts), so any key that is in one list and
 * not deliberately excluded from the other is silent data loss. Without this export the two lists
 * can only be compared by scraping source text, which is exactly the check that rots.
 */
export const localWorkspaceExactKeys: readonly string[] = [...exactWorkspaceKeys]
export const localWorkspaceKeyPrefixes: readonly string[] = [...workspaceKeyPrefixes]

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
