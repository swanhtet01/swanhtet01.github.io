import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import {
  productCapabilityCatalog,
  type ClientCapability,
} from './client-capability-plan'

const productDetails: Record<ClientSolutionId, { label: string; setupPath: string; primaryPath: string }> = {
  commerce: { label: 'Shop', setupPath: '/settings/?product=shop', primaryPath: '/shop/' },
  production: { label: 'Plant', setupPath: '/settings/?product=plant', primaryPath: '/plant/' },
  website: { label: 'Website', setupPath: '/settings/?product=website', primaryPath: '/website/' },
  ecommerce: { label: 'Ecommerce', setupPath: '/settings/?product=ecommerce', primaryPath: '/ecommerce/' },
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
        <span><b>More tools</b><small>Workflows and setup</small></span>
        <strong>{open ? 'Hide' : 'Show'}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">{details.label}</span><h2>Choose another task.</h2><p>Open a working sample flow, or set up your data when you are ready.</p></div>
          <div className="product-system-actions"><Link className="core-button compact" to={details.setupPath}>Set up {details.label}</Link></div>
        </header>
        <div className="product-system-workflows" aria-label={`${details.label} working workflows`}>
          {workingFlows.map((capability) => <WorkflowLink capability={capability} fallbackPath={details.primaryPath} key={capability.id} />)}
        </div>
        <details className="product-system-advanced">
          <summary><span>Setup and imports</span><strong>{setupModules.length}</strong></summary>
          <p>{setupModules.map((capability) => capability.label).join(' / ')}</p>
        </details>
        <footer>Use these tools only when the main workflow needs them.</footer>
      </div>
    </details>
  )
}
