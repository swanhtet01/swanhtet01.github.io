type StockThreshold = {
  onHand: number
  reorderAt: number
}

/** Keep the Today product preview useful by surfacing items that need restocking first.
 * The order within each group remains the merchant's existing catalog order.
 */
export function prioritizeShopTodayProducts<T extends StockThreshold>(items: readonly T[]): T[] {
  const needsReorder: T[] = []
  const healthy: T[] = []

  for (const item of items) {
    if (item.onHand <= item.reorderAt) needsReorder.push(item)
    else healthy.push(item)
  }

  return [...needsReorder, ...healthy]
}
