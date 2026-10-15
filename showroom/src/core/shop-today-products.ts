type ShopTodayProductCandidate = {
  name: string
  onHand: number
  reorderAt: number
  sku: string
}

const MAX_VISIBLE_PRODUCTS = 6
const MAX_VISIBLE_STOCK_ALERTS = 5

export function selectShopTodayProducts<T extends ShopTodayProductCandidate>(items: readonly T[]): T[] {
  const stockAlerts = items
    .filter((item) => item.onHand <= item.reorderAt)
    .sort((left, right) => (right.reorderAt - right.onHand) - (left.reorderAt - left.onHand)
      || left.name.localeCompare(right.name))
    .slice(0, MAX_VISIBLE_STOCK_ALERTS)
  const otherProducts = items.filter((item) => item.onHand > item.reorderAt)

  return [...stockAlerts, ...otherProducts].slice(0, MAX_VISIBLE_PRODUCTS)
}
