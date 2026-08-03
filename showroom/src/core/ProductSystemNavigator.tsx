import { lazy, Suspense, type SyntheticEvent, useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { ClientSolutionId } from './client-onboarding'
import { recordBehaviorSignal } from './behavior-trail'
import {
  productCapabilityCatalog,
  type ClientCapability,
} from './client-capability-plan'
import { readPlantIndustryPackId, type PlantIndustryPackId } from './plant-industry-packs'
import { productContracts, templateFor } from './product-setup'
import {
  readShopServiceSchedule,
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  shopIndustryPack,
  shopIndustryPacks,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import { useManagedIdentity, useSetupWorkspace } from './workspace-runtime'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))

type ProductSystemDetail = { label: string; primaryPath: string; requestPath: string; dataTitle: string; dataAction: string }
type ProductActivationEvent = 'next_steps_opened' | 'data_setup_opened' | 'product_requested'

const productDetails: Record<ClientSolutionId, ProductSystemDetail> = {
  commerce: { label: 'Shop', primaryPath: '/shop/', requestPath: 'https://supermega.dev/contact/?product=shop&utm_source=app&utm_medium=product&utm_campaign=working-sample', dataTitle: 'Use your items and stock', dataAction: 'Use my Shop data' },
  production: { label: 'Plant', primaryPath: '/plant/', requestPath: 'https://supermega.dev/contact/?product=plant&utm_source=app&utm_medium=product&utm_campaign=working-sample', dataTitle: 'Use your jobs and plan', dataAction: 'Use my Plant data' },
  website: { label: 'Website', primaryPath: '/website/', requestPath: 'https://supermega.dev/contact/?product=website&utm_source=app&utm_medium=product&utm_campaign=working-sample', dataTitle: 'Use your pages and content', dataAction: 'Use my website content' },
  ecommerce: { label: 'Ecommerce', primaryPath: '/ecommerce/', requestPath: 'https://supermega.dev/contact/?product=ecommerce&utm_source=app&utm_medium=product&utm_campaign=working-sample', dataTitle: 'Use your store catalog', dataAction: 'Use my store data' },
}

function readCurrentShopIndustryPackId(): ShopIndustryPackId {
  const fallback = shopIndustryPacks[0]?.id ?? 'retail'
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
    return stored ? readShopServiceSchedule(stored).industryPackId : fallback
  } catch {
    return fallback
  }
}

function ProductDataImport({ product, managed, details }: { product: ClientSolutionId; managed: boolean; details: ProductSystemDetail }) {
  const [setup] = useSetupWorkspace()
  const [managedIdentity] = useManagedIdentity(managed)
  const [shopIndustryPackId] = useState<ShopIndustryPackId>(readCurrentShopIndustryPackId)
  const [plantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const contract = productContracts[product]
  const selectedTemplate = setup.product === product
    ? templateFor(product, setup.templateId)
    : product === 'commerce'
      ? templateFor(product, shopIndustryPack(shopIndustryPackId).workflowTemplateId)
      : templateFor(product, '')
  const workspace = setup.product === product && setup.workspace.trim() ? setup.workspace.trim() : `My ${details.label}`
  const owner = setup.product === product && setup.owner.trim() ? setup.owner.trim() : 'Business owner'

  return <Suspense fallback={<p className="form-notice" role="status">Loading {details.label} data tools...</p>}><ClientDataOnboarding initiallyOpen managedIdentity={managedIdentity} owner={owner} plantIndustryPackId={product === 'production' ? plantIndustryPackId : undefined} product={product} productName={details.label} productSlug={contract.slug} shopIndustryPackId={product === 'commerce' ? shopIndustryPackId : undefined} workflowTemplateId={selectedTemplate.id} workspace={workspace} /></Suspense>
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

export function ProductSystemNavigator({ product, managed = false }: { product: ClientSolutionId; managed?: boolean }) {
  const [open, setOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
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
  const dataPanelId = `product-system-import-${product}`

  function recordActivationSignal(event: ProductActivationEvent, detail: string) {
    if (typeof window === 'undefined') return
    recordBehaviorSignal(window.localStorage, {
      event,
      product,
      route: details.primaryPath,
      detail,
    })
  }

  function toggleNextSteps(event: SyntheticEvent<HTMLDetailsElement>) {
    const isOpen = event.currentTarget.open
    setOpen(isOpen)
    if (isOpen) recordActivationSignal('next_steps_opened', `Opened ${details.label} next steps`)
  }

  function toggleDataSetup() {
    const isOpening = !dataOpen
    setDataOpen(isOpening)
    if (isOpening) recordActivationSignal('data_setup_opened', `Opened ${details.label} data setup`)
  }

  return (
    <details className="product-system-navigator" onToggle={toggleNextSteps} open={open}>
      <summary>
        <span><b>Next steps</b><small>More workflows or your data</small></span>
        <strong>{open ? 'Hide' : 'Show'}</strong>
      </summary>
      <div className="product-system-body">
        <header>
          <div><span className="core-eyebrow">{details.label}</span><h2>Keep working in {details.label}</h2><p>Choose another working flow, use your data, or ask us to set up {details.label} for your business.</p></div>
          <div className="product-system-actions"><a className="core-button compact primary" href={details.requestPath} onClick={() => recordActivationSignal('product_requested', `Requested ${details.label} setup`)}>Get {details.label} for my business</a></div>
        </header>
        <div className="product-system-workflows" aria-label={`${details.label} working workflows`}>
          {workingFlows.map((capability) => <WorkflowLink capability={capability} fallbackPath={details.primaryPath} key={capability.id} />)}
        </div>
        <section aria-label={`${details.label} data`} className="product-system-data">
          <div><span className="core-eyebrow">Your data</span><h3>{details.dataTitle}</h3><p>Upload a CSV or try a sample. SuperMega matches columns locally and asks before changing {details.label}.</p><small>Only {details.label} is prepared here.</small></div>
          <button aria-controls={dataPanelId} aria-expanded={dataOpen} className="core-button compact" onClick={toggleDataSetup} type="button">{dataOpen ? 'Close data setup' : details.dataAction}</button>
        </section>
        {dataOpen ? <div className="product-system-import" id={dataPanelId}><ProductDataImport details={details} managed={managed} product={product} /></div> : null}
      </div>
    </details>
  )
}
