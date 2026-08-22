const ACCOUNT_PRODUCT_SLUGS = {
  commerce: 'shop',
  shop: 'shop',
  production: 'plant',
  plant: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
} as const

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
    utm_medium: 'guided_trial',
  })
  return `https://supermega.dev/contact/?${query.toString()}`
}

export function managedAccountPath(path: '/login' | '/account/recovery', value: string | null) {
  const product = accountProductSlug(value)
  return product ? `${path}?product=${encodeURIComponent(product)}` : path
}

export function managedPortalEntryPath(value: string | null) {
  const product = accountProductSlug(value)
  return product ? `/${product}/` : '/?choose=1'
}

export function alternateManagedWorkspaceId(
  workspaces: readonly { workspaceId: string }[],
  currentWorkspaceId: string,
) {
  return workspaces.find((workspace) => workspace.workspaceId !== currentWorkspaceId)?.workspaceId ?? ''
}
