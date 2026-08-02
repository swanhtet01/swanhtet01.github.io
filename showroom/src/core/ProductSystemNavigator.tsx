import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import {
  productCapabilityCatalog,
  productCapabilitySummary,
  type ClientCapability,
} from './client-capability-plan'

const productDetails: Record<ClientSolutionId, { label: string; summary: string; setupPath: string; primaryPath: string }> = {
  commerce: { label: 'Shop', summary: 'Sell, fulfil, restock, and close the day.', setupPath: '/settings/?product=shop', primaryPath: '/shop/' },
  production: { label: 'Plant', summary: 'Plan jobs, run output, quality, and maintenance.', setupPath: '/settings/?product=plant', primaryPath: '/plant/' },
  website: { label: 'Website', summary: 'Edit pages, review leads, and prepare launch.', setupPath: '/settings/?product=website', primaryPath: '/website/' },
  ecommerce: { label: 'Ecommerce', summary: 'Run storefront orders and Shop review.', setupPath: '/settings/?product=ecommerce', primaryPath: '/ecommerce/' },
}

function WorkflowLink({ capability, fallbackPath }: { capability: ClientCapability; fallbackPath: string }) {
  return (
    <Link className="product-system-workflow" to={capability.proofPath ?? fallbackPath}>
      <span>{capability.domain.replace('-', ' ')}</span>
      <b>{capability.label}</b>
      <p>{capability.outcome}</p>
      <strong>Open</strong>
    </Link>
  )
}

export function ProductSystemNavigator({ product }: { product: ClientSolutionId }) {
  const [open, setOpen] = useState(false)
  const details = productDetails[product]
  const summary = useMemo(() => productCapabilitySummary(product), [product])
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
        <span><b>{details.label}</b><small>{details.summary}</small></span>
        <strong>{open ? 'Close' : `${summary.demoReady} run now`}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">{details.label}</span><h2>Start with the working demo.</h2><p>Use the sample workflow first. Setup and imports can wait.</p></div>
          <div className="product-system-actions"><Link className="core-button compact primary" to={details.primaryPath}>Open {details.label}</Link><Link className="core-button compact" to={details.setupPath}>Setup later</Link></div>
        </header>
        <div className="product-system-map" aria-label={`${details.label} product map`}>
          <span><small>Run now</small><strong>{summary.demoReady}</strong><em>Working sample flows</em></span>
          <span><small>Setup next</small><strong>{summary.configureNext}</strong><em>Imports and controls</em></span>
          <span><small>Scale later</small><strong>{summary.scaleLater}</strong><em>Enterprise modules</em></span>
        </div>
        <div className="product-system-workflows" aria-label={`${details.label} working workflows`}>
          {workingFlows.map((capability) => <WorkflowLink capability={capability} fallbackPath={details.primaryPath} key={capability.id} />)}
        </div>
        <details className="product-system-advanced">
          <summary><span>Add your data</span><strong>{setupModules.length}</strong></summary>
          <p>{setupModules.map((capability) => capability.label).join(' / ')}</p>
        </details>
        <footer>{summary.scaleLater} extra modules stay hidden until they are useful.</footer>
      </div>
    </details>
  )
}
