import type { ClientSolutionId } from './client-onboarding'

export type ManagedProductConnection = {
  id: 'online-orders' | 'demand-to-production' | 'website-intake' | 'website-storefront'
  products: readonly [ClientSolutionId, ClientSolutionId]
  label: string
  detail: string
}

const PRODUCT_CONNECTIONS: readonly ManagedProductConnection[] = [
  {
    id: 'online-orders',
    products: ['commerce', 'ecommerce'],
    label: 'Online orders to Shop',
    detail: 'Ecommerce uses the company catalog, stock, customer, and order flow in Shop.',
  },
  {
    id: 'demand-to-production',
    products: ['commerce', 'production'],
    label: 'Shop demand to Plant',
    detail: 'Shop demand can become Plant work, and completed output can return to Shop stock.',
  },
  {
    id: 'website-intake',
    products: ['commerce', 'website'],
    label: 'Website intake to Shop',
    detail: 'Website enquiries and reviewed catalog intake can enter the Shop workspace.',
  },
  {
    id: 'website-storefront',
    products: ['website', 'ecommerce'],
    label: 'Website to Ecommerce',
    detail: 'Approved Website content and catalog presentation stay aligned with the online storefront.',
  },
]

export function managedProductConnections(
  assignedProducts: readonly ClientSolutionId[],
): ManagedProductConnection[] {
  const assigned = new Set(assignedProducts)
  return PRODUCT_CONNECTIONS.filter(({ products }) => products.every((product) => assigned.has(product)))
}
