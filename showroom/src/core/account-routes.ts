const ACCOUNT_PRODUCT_SLUGS = {
  commerce: 'shop',
  shop: 'shop',
  production: 'plant',
  plant: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
} as const

const PAIRED_PUBLIC_SHOP_ENTRY = 'shop-public-preview-v1'
const ACCOUNT_HUB_ENTRY = 'account-hub-v1'

function accountProductSlug(value: string | null) {
  const intent = value?.trim().toLowerCase()
  if (!intent || !Object.prototype.hasOwnProperty.call(ACCOUNT_PRODUCT_SLUGS, intent)) return null
  return ACCOUNT_PRODUCT_SLUGS[intent as keyof typeof ACCOUNT_PRODUCT_SLUGS]
}

export function managedAccountRequestUrl(value: string | null) {
  const request = { product: accountProductSlug(value) ?? 'guide' }
  return `https://supermega.dev/contact/?product=${request.product}&template=managed-account&utm_source=app&utm_medium=business_setup`
}

export function managedAccountPath(path: '/login' | '/account/recovery', value: string | null, search = '') {
  const reviewPath = managedLoginReviewPath(search)
  if (reviewPath) {
    const [, product, , review] = reviewPath.split('/')
    return `${path}?product=${product}&review=${review}`
  }
  if (managedAccountHubEntryPath(search) || managedAccountHubRecoveryEntryPath(search)) return `${path}?entry=${ACCOUNT_HUB_ENTRY}`
  const product = accountProductSlug(value)
  if (!product) return path
  return product === 'shop' && isPairedPublicShopEntry(search)
    ? `${path}?entry=${PAIRED_PUBLIC_SHOP_ENTRY}&product=shop`
    : `${path}?product=${product}`
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

export function managedAccountHubLoginPath() {
  return `/login?entry=${ACCOUNT_HUB_ENTRY}`
}

export function managedAccountHubEntryPath(search: string) {
  const query = new URLSearchParams(search)
  const entries = query.getAll('entry')
  return [...query.keys()].every((key) => key === 'entry')
    && entries.length === 1
    && entries[0] === ACCOUNT_HUB_ENTRY
    ? '/account'
    : null
}

export function managedAccountHubRecoveryEntryPath(search: string) {
  const query = new URLSearchParams(search)
  const entries = query.getAll('entry')
  const modes = query.getAll('mode')
  const allowed = new Set(['entry', 'mode', 'code', 'error', 'error_code', 'error_description'])
  return [...query.keys()].every((key) => allowed.has(key))
    && entries.length === 1
    && entries[0] === ACCOUNT_HUB_ENTRY
    && (modes.length === 0 || (modes.length === 1 && modes[0] === 'recovery'))
    ? '/account'
    : null
}

function canonicalReviewId(value: string | null) {
  // No free-form return URL. Exact length also rejects a trailing newline,
  // which JavaScript's end-of-string regex anchor alone would accept.
  return value?.length === 36 && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(value) ? value : null
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

function customerReviewLoginPath(product: 'website' | 'ecommerce', reviewId: string) {
  const review = canonicalReviewId(reviewId)
  return `/login?product=${product}${review ? `&review=${review}` : ''}`
}

export function customerWebsiteReviewLoginPath(reviewId: string) {
  return customerReviewLoginPath('website', reviewId)
}

export function alternateManagedWorkspaceId(
  workspaces: readonly { workspaceId: string }[],
  currentWorkspaceId: string,
) {
  return workspaces.find((workspace) => workspace.workspaceId !== currentWorkspaceId)?.workspaceId ?? ''
}

export function customerEcommerceReviewLoginPath(reviewId: string) {
  return customerReviewLoginPath('ecommerce', reviewId)
}
