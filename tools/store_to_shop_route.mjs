const REVIEW_PATH = '/shop/'
const REVIEW_QUERY = Object.freeze({
  tab: 'orders',
  source: 'ecommerce-handoff',
  handoff: 'order',
})

export function storeToShopReviewPath(requestId) {
  const id = String(requestId || '').trim()
  if (!id) throw new Error('store_to_shop_request_id_required')
  const query = new URLSearchParams({ ...REVIEW_QUERY, handoff_id: id })
  return `${REVIEW_PATH}?${query.toString()}`
}

export function isStoreToShopReviewPath(value, requestId) {
  const id = String(requestId || '').trim()
  if (!id || typeof value !== 'string') return false
  let url
  try {
    url = new URL(value, 'https://supermega.invalid')
  } catch {
    return false
  }
  const entries = [...url.searchParams.entries()]
  if (url.pathname !== REVIEW_PATH || entries.length !== 4) return false
  if (new Set(entries.map(([key]) => key)).size !== 4) return false
  return url.searchParams.get('tab') === REVIEW_QUERY.tab
    && url.searchParams.get('source') === REVIEW_QUERY.source
    && url.searchParams.get('handoff') === REVIEW_QUERY.handoff
    && url.searchParams.get('handoff_id') === id
}
