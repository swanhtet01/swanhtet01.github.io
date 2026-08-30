import type { ClientSolutionId } from './client-onboarding'
import { managedProductConnections } from './managed-product-connections'

export function ManagedProductConnections({ products }: { products: readonly ClientSolutionId[] }) {
  const connections = managedProductConnections(products)
  if (connections.length === 0) return null

  return <section aria-labelledby="connected-products-title" className="connected-products">
    <div className="connected-products-heading">
      <span className="core-eyebrow">Connected workspace</span>
      <h2 id="connected-products-title">One company flow</h2>
    </div>
    <ul>{connections.map((connection) => <li key={connection.id}>
      <span aria-hidden="true">↳</span>
      <div><strong>{connection.label}</strong><small>{connection.detail}</small></div>
    </li>)}</ul>
  </section>
}
