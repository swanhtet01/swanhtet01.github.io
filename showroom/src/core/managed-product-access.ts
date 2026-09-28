import type { ClientSolutionId } from './client-onboarding'

const PRODUCT_PATHS: Record<ClientSolutionId, string> = {
  commerce: '/shop/',
  production: '/plant/',
  website: '/website/',
  ecommerce: '/ecommerce/',
}

export type ManagedProductRouteDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; product: ClientSolutionId; path: string }
  | { kind: 'empty' }

export type ManagedProductHomeDecision =
  | { kind: 'launcher' }
  | { kind: 'redirect'; product: ClientSolutionId; path: string }

export function managedProductPath(product: ClientSolutionId) {
  return PRODUCT_PATHS[product]
}

export function managedProductIsVisible(
  assignedProducts: readonly ClientSolutionId[],
  product: ClientSolutionId,
) {
  return assignedProducts.includes(product)
}

export function productSwitcherVisible(
  status: 'checking' | 'local' | 'ready' | 'reauthenticate' | 'error',
  assignedProducts: readonly ClientSolutionId[],
) {
  return status === 'local' || status === 'ready' && assignedProducts.filter(product => product !== 'production').length > 1
}

export function resolveManagedProductRoute(
  requestedProduct: ClientSolutionId | null,
  assignedProducts: readonly ClientSolutionId[],
): ManagedProductRouteDecision {
  if (!requestedProduct || managedProductIsVisible(assignedProducts, requestedProduct)) {
    return { kind: 'allow' }
  }
  // Retained Plant access remains explicit; never promote it as a fallback.
  const fallback = assignedProducts.find(product => product !== 'production')
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
  if (requestedProduct && managedProductIsVisible(assignedProducts, requestedProduct)) {
    return {
      kind: 'redirect',
      product: requestedProduct,
      path: requestedPath ?? managedProductPath(requestedProduct),
    }
  }
  if (choosingProduct || assignedProducts.length === 0) return { kind: 'launcher' }
  const activeAssignments = assignedProducts.filter(product => product !== 'production')
  const fallbackProduct = activeAssignments[0]
  if (!fallbackProduct) return { kind: 'launcher' }
  const product = rememberedProduct && rememberedProduct !== 'production' && activeAssignments.includes(rememberedProduct)
    ? rememberedProduct
    : fallbackProduct
  return { kind: 'redirect', product, path: managedProductPath(product) }
}
