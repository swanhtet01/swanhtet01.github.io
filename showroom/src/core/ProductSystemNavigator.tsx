import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import {
  productCapabilityCatalog,
  productCapabilitySummary,
  type ClientCapability,
  type ClientCapabilityDelivery,
} from './client-capability-plan'

const productDetails: Record<ClientSolutionId, { label: string; setupPath: string }> = {
  commerce: { label: 'Shop', setupPath: '/settings/?product=shop' },
  production: { label: 'Plant', setupPath: '/settings/?product=plant' },
  website: { label: 'Website', setupPath: '/settings/?product=website' },
  ecommerce: { label: 'Ecommerce', setupPath: '/settings/?product=ecommerce' },
}

const deliveryDetails: Record<ClientCapabilityDelivery, { label: string; copy: string }> = {
  demo: { label: 'Use now', copy: 'Complete workflows already present in this product.' },
  configure: { label: 'Configure next', copy: 'Client-specific controls to implement after discovery and data review.' },
  roadmap: { label: 'Scale later', copy: 'Expansion modules; shown honestly and not presented as working software.' },
}

const systemFlow: Array<{ product: ClientSolutionId; label: string; path: string }> = [
  { product: 'website', label: 'Website', path: '/website/' },
  { product: 'ecommerce', label: 'Ecommerce', path: '/ecommerce/' },
  { product: 'commerce', label: 'Shop', path: '/shop/' },
  { product: 'production', label: 'Plant', path: '/plant/' },
]

function CapabilityCard({ capability }: { capability: ClientCapability }) {
  return (
    <article className="product-system-capability">
      <span>{capability.domain.replace('-', ' ')}</span>
      <strong>{capability.label}</strong>
      <p>{capability.outcome}</p>
      <small>{capability.records.join(' · ')}</small>
      {capability.delivery === 'demo' && capability.proofPath
        ? <Link to={capability.proofPath}>Open workflow</Link>
        : <em>{capability.delivery === 'configure' ? 'Needs client configuration' : 'Not yet claimed as available'}</em>}
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
        <span><b>{details.label} system</b><small>{summary.demoReady} usable workflows · {summary.configureNext} configure next · {summary.scaleLater} scale later</small></span>
        <strong>{open ? 'Close modules' : `View ${summary.total} modules`}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">Integrated operating system</span><h2>Simple daily work. Enterprise depth when needed.</h2><p>Only verified demo workflows are actionable. Configuration and scale modules remain explicit without pretending unfinished software is live.</p></div>
          <div className="product-system-actions"><Link className="core-button compact primary" to={details.setupPath}>Prepare client data</Link><Link className="core-button compact" to="/settings/">Build full demo</Link></div>
        </header>
        <nav aria-label="Connected product flow" className="product-system-flow">
          {systemFlow.map((item, index) => <span key={item.product}>{index ? <i aria-hidden="true">→</i> : null}<Link aria-current={item.product === product ? 'page' : undefined} to={item.path}>{item.label}</Link></span>)}
        </nav>
        <div className="product-system-groups">
          {(Object.keys(deliveryDetails) as ClientCapabilityDelivery[]).map((delivery) => {
            const deliveryCapabilities = capabilities.filter((capability) => capability.delivery === delivery)
            return <section key={delivery}>
              <div className="product-system-group-head"><span>{deliveryDetails[delivery].label}</span><strong>{deliveryCapabilities.length} modules</strong><p>{deliveryDetails[delivery].copy}</p></div>
              <div>{deliveryCapabilities.map((capability) => <CapabilityCard capability={capability} key={capability.id} />)}</div>
            </section>
          })}
        </div>
        <footer>Shared foundation: managed identity · least privilege · approvals · immutable evidence · versioned imports · recovery · cross-product record IDs · idempotent commands.</footer>
      </div>
    </details>
  )
}
