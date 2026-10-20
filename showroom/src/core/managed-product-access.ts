import type { ClientSolutionId } from './client-onboarding'

const PRODUCT_PATHS: Record<ClientSolutionId, string> = {
  commerce: '/shop/',
  production: '/plant/',
  website: '/website/',
  ecommerce: '/ecommerce/',
}

// The managed customer portal is launching Shop first. Sites and Commerce stay
// internal until a separate staff authorization boundary exists; assignments
// alone must not make those products customer-visible.
const CUSTOMER_ACCESS_PRODUCTS: ReadonlySet<ClientSolutionId> = new Set(['commerce'])

export type ManagedProductRouteDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; product: ClientSolutionId; path: string }
  | { kind: 'empty' }

export type ManagedProductHomeDecision =
  | { kind: 'launcher' }
  | { kind: 'redirect'; product: ClientSolutionId; path: string }

export type ManagedPortalAccessStatus = 'checking' | 'local' | 'reauthenticate' | 'ready' | 'error'

export function hostedProductRouteRequiresLogin(
  productionBuild: boolean,
  portalStatus: ManagedPortalAccessStatus,
) {
  return productionBuild && portalStatus === 'local'
}

export function managedProductPath(product: ClientSolutionId) {
  return PRODUCT_PATHS[product]
}

export function managedProductIsVisible(
  assignedProducts: readonly ClientSolutionId[],
  product: ClientSolutionId,
) {
  return assignedProducts.includes(product)
}

export function managedCustomerProductIsVisible(
  assignedProducts: readonly ClientSolutionId[],
  product: ClientSolutionId,
) {
  return CUSTOMER_ACCESS_PRODUCTS.has(product) && assignedProducts.includes(product)
}

export function managedCustomerProducts(assignedProducts: readonly ClientSolutionId[]) {
  return assignedProducts.filter((product) => CUSTOMER_ACCESS_PRODUCTS.has(product))
}

export function ecommerceShopHandoffVisible(
  status: 'checking' | 'local' | 'ready' | 'reauthenticate' | 'error',
  assignedProducts: readonly ClientSolutionId[],
) {
  return status === 'local' || status === 'ready'
    && managedProductIsVisible(assignedProducts, 'commerce')
    && managedProductIsVisible(assignedProducts, 'ecommerce')
}

export function shopInboundRequestsVisible(
  status: 'checking' | 'local' | 'ready' | 'reauthenticate' | 'error',
  assignedProducts: readonly ClientSolutionId[],
) {
  // Website and Ecommerce are managed internally, but their submitted requests
  // are Shop fulfilment work. Shop access must not depend on editor access.
  return status === 'local' || status === 'ready'
    && managedProductIsVisible(assignedProducts, 'commerce')
}

export function productSwitcherVisible(
  status: 'checking' | 'local' | 'ready' | 'reauthenticate' | 'error',
  assignedProducts: readonly ClientSolutionId[],
) {
  return status === 'local' || status === 'ready' && managedCustomerProducts(assignedProducts).length > 1
}

export function resolveManagedProductRoute(
  requestedProduct: ClientSolutionId | null,
  assignedProducts: readonly ClientSolutionId[],
): ManagedProductRouteDecision {
  if (!requestedProduct || managedCustomerProductIsVisible(assignedProducts, requestedProduct)) {
    return { kind: 'allow' }
  }
  const fallback = managedCustomerProducts(assignedProducts)[0]
  return fallback
    ? { kind: 'redirect', product: fallback, path: managedProductPath(fallback) }
    : { kind: 'empty' }
}

export function resolveManagedProductHome({
  requestedProduct,
  requestedPath,
  rememberedProduct,
  choosingProduct,
  assignedProducts,
}: {
  requestedProduct: ClientSolutionId | null
  requestedPath: string | null
  rememberedProduct: ClientSolutionId | null
  choosingProduct: boolean
  assignedProducts: readonly ClientSolutionId[]
}): ManagedProductHomeDecision {
  if (requestedProduct && managedCustomerProductIsVisible(assignedProducts, requestedProduct)) {
    return {
      kind: 'redirect',
      product: requestedProduct,
      path: requestedPath ?? managedProductPath(requestedProduct),
    }
  }
  if (choosingProduct || assignedProducts.length === 0) return { kind: 'launcher' }
  const activeAssignments = managedCustomerProducts(assignedProducts)
  const fallbackProduct = activeAssignments[0]
  if (!fallbackProduct) return { kind: 'launcher' }
  const product = rememberedProduct && rememberedProduct !== 'production' && activeAssignments.includes(rememberedProduct)
    ? rememberedProduct
    : fallbackProduct
  return { kind: 'redirect', product, path: managedProductPath(product) }
}
