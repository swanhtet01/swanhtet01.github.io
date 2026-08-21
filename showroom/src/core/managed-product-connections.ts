import type { ClientSolutionId } from './client-onboarding'

export type ManagedProductConnection = {
  id: 'online-orders' | 'demand-to-production' | 'website-intake'
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
]

export function managedProductConnections(
  assignedProducts: readonly ClientSolutionId[],
): ManagedProductConnection[] {
  const assigned = new Set(assignedProducts)
  return PRODUCT_CONNECTIONS.filter(({ products }) => products.every((product) => assigned.has(product)))
}
