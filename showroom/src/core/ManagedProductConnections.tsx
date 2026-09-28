import type { ClientSolutionId } from './client-onboarding'
import { managedProductConnections } from './managed-product-connections'

export function ManagedProductConnections({ products }: { products: readonly ClientSolutionId[] }) {
  const connections = managedProductConnections(products)
  if (connections.length === 0) return null

  return <details className="connected-products">
    <summary>How products work together</summary>
    <ul>{connections.map((connection) => <li key={connection.id}>
      <span aria-hidden="true">↳</span>
      <div><strong>{connection.label}</strong><small>{connection.detail}</small></div>
    </li>)}</ul>
  </details>
}
