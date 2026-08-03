import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import {
  productCapabilityCatalog,
  type ClientCapability,
} from './client-capability-plan'

const productDetails: Record<ClientSolutionId, { label: string; setupPath: string; primaryPath: string; requestPath: string }> = {
  commerce: { label: 'Shop', setupPath: '/settings/?product=shop', primaryPath: '/shop/', requestPath: 'https://supermega.dev/contact/?product=shop&utm_source=app&utm_medium=product&utm_campaign=working-sample' },
  production: { label: 'Plant', setupPath: '/settings/?product=plant', primaryPath: '/plant/', requestPath: 'https://supermega.dev/contact/?product=plant&utm_source=app&utm_medium=product&utm_campaign=working-sample' },
  website: { label: 'Website', setupPath: '/settings/?product=website', primaryPath: '/website/', requestPath: 'https://supermega.dev/contact/?product=website&utm_source=app&utm_medium=product&utm_campaign=working-sample' },
  ecommerce: { label: 'Ecommerce', setupPath: '/settings/?product=ecommerce', primaryPath: '/ecommerce/', requestPath: 'https://supermega.dev/contact/?product=ecommerce&utm_source=app&utm_medium=product&utm_campaign=working-sample' },
}

function WorkflowLink({ capability, fallbackPath }: { capability: ClientCapability; fallbackPath: string }) {
  return (
    <Link className="product-system-workflow" to={capability.proofPath ?? fallbackPath}>
      <span>{capability.domain.replace('-', ' ')}</span>
      <b>{capability.label}</b>
      <p>{capability.outcome}</p>
      <strong>Start</strong>
    </Link>
  )
}

export function ProductSystemNavigator({ product }: { product: ClientSolutionId }) {
  const [open, setOpen] = useState(false)
  const details = productDetails[product]
  const capabilities = useMemo(() => productCapabilityCatalog(product), [product])
  const workingFlows = useMemo(() => {
    const seen = new Set<string>()
    return capabilities.filter((capability) => {
      if (capability.delivery !== 'demo' || !capability.proofPath || seen.has(capability.proofPath)) return false
      seen.add(capability.proofPath)
      return true
    })
  }, [capabilities])
  const setupModules = capabilities.filter((capability) => capability.delivery === 'configure')

  return (
    <details className="product-system-navigator" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary>
        <span><b>More tools</b><small>Workflows and next steps</small></span>
        <strong>{open ? 'Hide' : 'Show'}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">{details.label}</span><h2>What&apos;s next?</h2><p>Open another working flow, or request this product for your business.</p></div>
          <div className="product-system-actions"><a className="core-button compact primary" href={details.requestPath}>Get {details.label} for my business</a></div>
        </header>
        <div className="product-system-workflows" aria-label={`${details.label} working workflows`}>
          {workingFlows.map((capability) => <WorkflowLink capability={capability} fallbackPath={details.primaryPath} key={capability.id} />)}
        </div>
        <details className="product-system-advanced">
          <summary><span>Data and imports</span><strong>Optional</strong></summary>
          <div className="product-system-setup"><p>{setupModules.map((capability) => capability.label).join(' / ')}</p><Link className="text-link" to={details.setupPath}>Prepare {details.label} data</Link></div>
        </details>
        <footer>Data import stays optional until you are ready.</footer>
      </div>
    </details>
  )
}
