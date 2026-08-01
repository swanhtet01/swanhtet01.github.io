import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import {
  clientCapabilityDependencyLabel,
  productCapabilityCatalog,
  productCapabilitySummary,
  type ClientCapability,
  type ClientCapabilityDelivery,
} from './client-capability-plan'

const productDetails: Record<ClientSolutionId, { label: string; summary: string; setupPath: string }> = {
  commerce: { label: 'Shop', summary: 'Sales, orders, stock, customers, and finance', setupPath: '/settings/?product=shop' },
  production: { label: 'Plant', summary: 'Jobs, output, materials, quality, and maintenance', setupPath: '/settings/?product=plant' },
  website: { label: 'Website', summary: 'Pages, content, inquiries, review, and launch', setupPath: '/settings/?product=website' },
  ecommerce: { label: 'Ecommerce', summary: 'Storefront, cart, orders, delivery, and returns', setupPath: '/settings/?product=ecommerce' },
}

const deliveryDetails: Record<ClientCapabilityDelivery, { label: string; copy: string }> = {
  demo: { label: 'Ready to use', copy: 'Working flows available in this sample.' },
  configure: { label: 'Customize', copy: 'Controls to tailor with your data and rules.' },
  roadmap: { label: 'Planned', copy: 'Future capability, clearly separated from working software.' },
}

function CapabilityCard({ capability }: { capability: ClientCapability }) {
  return (
    <article className="product-system-capability">
      <span>{capability.domain.replace('-', ' ')}</span>
      <strong>{capability.label}</strong>
      <p>{capability.outcome}</p>
      {capability.delivery === 'demo' && capability.proofPath
        ? <Link to={capability.proofPath}>Open workflow</Link>
        : <em>{capability.delivery === 'configure' ? 'Set up for your business' : 'On the roadmap'}</em>}
      <details className="product-system-capability-details">
        <summary>Data and controls</summary>
        <small>Records · {capability.records.join(' · ')}</small>
        <small>Roles · {capability.roles.join(' · ')}</small>
        <small>Requires · {capability.dependsOn.length ? capability.dependsOn.map(clientCapabilityDependencyLabel).join(' · ') : 'Shared operating foundation'}</small>
      </details>
    </article>
  )
}

export function ProductSystemNavigator({ product }: { product: ClientSolutionId }) {
  const [open, setOpen] = useState(false)
  const details = productDetails[product]
  const summary = useMemo(() => productCapabilitySummary(product), [product])
  const capabilities = useMemo(() => productCapabilityCatalog(product), [product])

  return (
    <details className="product-system-navigator" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary>
        <span><b>{details.label} features</b><small>{details.summary}</small></span>
        <strong>{open ? 'Close' : `All ${summary.total}`}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">{details.label}</span><h2>Everything in one place.</h2><p>Use working flows now. Customize data, permissions, and policies only when your business needs them.</p></div>
          <div className="product-system-actions"><Link className="core-button compact primary" to={details.setupPath}>Customize {details.label}</Link></div>
        </header>
        <div className="product-system-groups">
          {(Object.keys(deliveryDetails) as ClientCapabilityDelivery[]).map((delivery) => {
            const deliveryCapabilities = capabilities.filter((capability) => capability.delivery === delivery)
            return <section key={delivery}>
              <div className="product-system-group-head"><span>{deliveryDetails[delivery].label}</span><strong>{deliveryCapabilities.length}</strong><p>{deliveryDetails[delivery].copy}</p></div>
              <div>{deliveryCapabilities.map((capability) => <CapabilityCard capability={capability} key={capability.id} />)}</div>
            </section>
          })}
        </div>
        <footer>Shared foundation: access control · approvals · audit history · safe imports · recovery · connected records.</footer>
      </div>
    </details>
  )
}
