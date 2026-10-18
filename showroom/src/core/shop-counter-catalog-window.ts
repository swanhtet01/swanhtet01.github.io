export const SHOP_COUNTER_PAGE_SIZE = 8

export type ShopCounterCategoryFilter = { kind: 'all' } | { kind: 'category'; value: string } | { kind: 'uncategorized' }

export function activeShopCounterCategoryFilter(
  requested: ShopCounterCategoryFilter,
  categories: readonly (readonly [string, string])[],
  hasUncategorized: boolean,
): ShopCounterCategoryFilter {
  if (requested.kind === 'category' && !categories.some(([key]) => key === requested.value)) return { kind: 'all' }
  if (requested.kind === 'uncategorized' && !hasUncategorized) return { kind: 'all' }
  return requested
}

type CounterCatalogSearchItem = {
  sku: string
  name: string
  nameMy?: string
  variant?: string
}

export function projectShopCounterCatalog<T extends CounterCatalogSearchItem>(
  items: readonly T[],
  query: string,
  requestedPage: number,
) {
  const needle = query.trim().toLocaleLowerCase()
  const matches: { item: T; index: number }[] = []
  items.forEach((item, index) => {
    if (!needle || `${item.name} ${item.nameMy ?? ''} ${item.variant ?? ''} ${item.sku}`.toLocaleLowerCase().includes(needle)) {
      matches.push({ item, index })
    }
  })
  const pageCount = Math.max(1, Math.ceil(matches.length / SHOP_COUNTER_PAGE_SIZE))
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1)
    : 0
  const start = page * SHOP_COUNTER_PAGE_SIZE
  return {
    rows: matches.slice(start, start + SHOP_COUNTER_PAGE_SIZE),
    total: matches.length,
    page,
    pageCount,
    start,
  }
}
