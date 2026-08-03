export type ShopNextActionInput = {
  actionOrderCount: number
  activePurchaseOrderCount: number
  canWrite: boolean
  catalogItemCount: number
  inventoryReady: boolean
  lowStockCount: number
  pendingAction: boolean
  pendingOnlineRequestCount: number
}

export type ShopNextActionDecision = {
  job: string
  nextAction: string
  ownerGate: string
  path: string
  reason: string
  stage: string
  track: 'Review' | 'Orders' | 'Inventory' | 'Counter'
}

export function decideShopNextAction(input: ShopNextActionInput): ShopNextActionDecision {
  const counts = [input.actionOrderCount, input.activePurchaseOrderCount, input.catalogItemCount, input.lowStockCount, input.pendingOnlineRequestCount]
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) throw new Error('Shop next-action counts must be non-negative safe integers.')

  if (!input.canWrite) return {
    job: 'Restore Shop write readiness',
    nextAction: 'Open setup controls',
    ownerGate: 'Open Settings before any Shop write is allowed.',
    path: '/settings/#controls',
    reason: 'Writes are paused until durable storage or company account readiness is confirmed.',
    stage: 'Restore Shop readiness',
    track: 'Review',
  }
  if (input.pendingAction) return {
    job: 'Approve pending Shop change',
    nextAction: 'Finish review',
    ownerGate: 'Approve or cancel the pending accountable action.',
    path: '/shop/?tab=orders',
    reason: 'A reviewed Shop change is waiting for a named human confirmation.',
    stage: 'Review pending Shop change',
    track: 'Review',
  }
  if (!input.catalogItemCount) return {
    job: 'Import your first products',
    nextAction: 'Open catalog import',
    ownerGate: 'Review mapped SKU, price, opening stock, and reorder fields before anything is saved.',
    path: '/shop/?tab=inventory#shop-catalog-import',
    reason: 'Shop needs products and opening stock before the counter or Ecommerce can take a real order.',
    stage: 'Prepare Shop catalog',
    track: 'Inventory',
  }
  if (input.pendingOnlineRequestCount) return {
    job: 'Review online order requests',
    nextAction: 'Open online request review',
    ownerGate: 'Choose whether each online request becomes a Shop order.',
    path: '/shop/?tab=orders',
    reason: `${input.pendingOnlineRequestCount} online request${input.pendingOnlineRequestCount === 1 ? '' : 's'} need Shop review before order, stock, payment, or delivery changes.`,
    stage: 'Review online requests',
    track: 'Orders',
  }
  if (input.actionOrderCount) return {
    job: 'Finish fulfilment queue',
    nextAction: 'Open fulfilment queue',
    ownerGate: 'Confirm fulfilment, payment, return, cancellation, or settlement.',
    path: '/shop/?tab=orders',
    reason: `${input.actionOrderCount} order${input.actionOrderCount === 1 ? '' : 's'} need fulfilment or payment review.`,
    stage: 'Finish order queue',
    track: 'Orders',
  }
  if (input.activePurchaseOrderCount) return {
    job: 'Receive purchase orders',
    nextAction: 'Open receiving queue',
    ownerGate: 'Confirm received quantity, location, lot, and evidence.',
    path: '/shop/?tab=inventory',
    reason: `${input.activePurchaseOrderCount} purchase order${input.activePurchaseOrderCount === 1 ? '' : 's'} can be checked against received stock evidence.`,
    stage: 'Receive purchase orders',
    track: 'Inventory',
  }
  if (input.lowStockCount) return {
    job: 'Reorder low stock',
    nextAction: 'Open reorder queue',
    ownerGate: 'Confirm supplier reference, expected arrival, and quantity.',
    path: '/shop/?tab=inventory',
    reason: `${input.lowStockCount} SKU${input.lowStockCount === 1 ? '' : 's'} are at or below reorder level.`,
    stage: 'Reorder low stock',
    track: 'Inventory',
  }
  if (!input.inventoryReady) return {
    job: 'Set up stock locations',
    nextAction: 'Open inventory setup',
    ownerGate: 'Enable the inventory foundation before location-level stock control.',
    path: '/shop/?tab=inventory',
    reason: 'Stock can move from simple on-hand counts to location, lot, ATP, reservation, and count evidence.',
    stage: 'Set up stock foundation',
    track: 'Inventory',
  }
  return {
    job: 'Open counter for next sale',
    nextAction: 'Open counter',
    ownerGate: 'Confirm each sale before stock or cash records change.',
    path: '/shop/?tab=counter',
    reason: 'Orders, inventory, purchase orders, and stock foundation are ready for front-counter work.',
    stage: 'Open counter sales',
    track: 'Counter',
  }
}
