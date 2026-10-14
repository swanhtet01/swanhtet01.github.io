export const SHOP_COUNTER_PAGE_SIZE = 8

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
