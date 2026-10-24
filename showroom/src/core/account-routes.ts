const ACCOUNT_PRODUCT_SLUGS = {
  commerce: 'shop',
  shop: 'shop',
  production: 'plant',
  plant: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
} as const

const PAIRED_PUBLIC_SHOP_ENTRY = 'shop-public-preview-v1'

function accountProductSlug(value: string | null) {
  const intent = value?.trim().toLowerCase()
  if (!intent || !Object.prototype.hasOwnProperty.call(ACCOUNT_PRODUCT_SLUGS, intent)) return null
  return ACCOUNT_PRODUCT_SLUGS[intent as keyof typeof ACCOUNT_PRODUCT_SLUGS]
}

export function managedAccountRequestUrl(value: string | null) {
  const query = new URLSearchParams({
    product: accountProductSlug(value) ?? 'guide',
    template: 'managed-account',
    utm_source: 'app',
    utm_medium: 'business_setup',
  })
  return `https://supermega.dev/contact/?${query.toString()}`
}

export function managedAccountPath(path: '/login' | '/account/recovery', value: string | null, search = '') {
  const reviewPath = managedLoginReviewPath(search)
  if (reviewPath) return `${path}?product=${reviewPath.split('/')[1]}&review=${reviewPath.split('/').at(-1)}`
  const product = accountProductSlug(value)
  if (!product) return path
  const query = new URLSearchParams()
  if (product === 'shop' && isPairedPublicShopEntry(search)) query.set('entry', PAIRED_PUBLIC_SHOP_ENTRY)
  query.set('product', product)
  return `${path}?${query.toString()}`
}

export function isPairedPublicShopEntry(search: string) {
  const query = new URLSearchParams(search)
  const entries = query.getAll('entry')
  const products = query.getAll('product')
  return entries.length === 1 && entries[0] === PAIRED_PUBLIC_SHOP_ENTRY
    && products.length === 1 && products[0] === 'shop'
}

export function managedPortalEntryPath(value: string | null) {
  const product = accountProductSlug(value)
  return product ? `/${product}/` : '/?choose=1'
}

function canonicalReviewId(value: string | null) {
  // No free-form return URL. Exact length also rejects a trailing newline,
  // which JavaScript's end-of-string regex anchor alone would accept.
  return value?.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ? value : null
}

export function managedLoginReviewPath(search: string) {
  const query = new URLSearchParams(search)
  const products = query.getAll('product')
  if (products.length > 1 || (products.length === 1 && !['website', 'ecommerce'].includes(products[0]))) return null
  const product = products[0] ?? 'website'
  const values = query.getAll('review')
  const review = values.length === 1 ? canonicalReviewId(values[0]) : null
  return review ? `/${product}/review/${review}` : null
}

export function customerWebsiteReviewLoginPath(reviewId: string) {
  const review = canonicalReviewId(reviewId)
  return review ? `/login?product=website&review=${review}` : '/login?product=website'
}

export function alternateManagedWorkspaceId(
  workspaces: readonly { workspaceId: string }[],
  currentWorkspaceId: string,
) {
  return workspaces.find((workspace) => workspace.workspaceId !== currentWorkspaceId)?.workspaceId ?? ''
}

export function customerEcommerceReviewLoginPath(reviewId: string) {
  const review = canonicalReviewId(reviewId)
  return review ? `/login?product=ecommerce&review=${review}` : '/login?product=ecommerce'
}
