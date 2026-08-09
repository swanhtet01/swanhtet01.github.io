import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'

import { activateLocalWebsiteWorkingSample } from '../products/website/website-starter'
import { recordBehaviorSignal } from './behavior-trail'
import { PageHeading, type RuntimeHealth } from './CoreShell'
import {
  buildPlantGuidedShiftCloseOutcomeMetric,
  buildShopGuidedSaleOutcomeMetric,
  startPilotOutcome,
} from './pilot-outcome'
import { currentProductionShiftClose } from './production-workspace'
import { commerceBusinessCatalogItems, loadCommerceWorkspace } from './commerce-workspace'
import type { ClientDemoProductProgress } from './client-onboarding'
import {
  productContracts,
  managedTrialRequestUrl,
  readProductSetup,
  rememberProductSetup,
  seedSetupForProduct,
  templateFor,
  type SetupProductId,
  type SetupState,
} from './product-setup'
import {
  provisionLocalPlantWorkingSample,
  provisionLocalShopBusinessTemplateSample,
  provisionLocalShopIndustryPack,
  provisionLocalShopWorkingSample,
  readLocalShopIndustryPackId,
} from './product-onboarding-runtime'
import {
  shopBusinessTemplate,
  shopBusinessTemplateFromQuery,
  shopBusinessTemplates,
  type ShopBusinessTemplateId,
} from '../products/shop/business-templates'
import {
  readPlantIndustryPackId,
  savePlantIndustryPackId,
  type PlantIndustryPackId,
} from './plant-industry-packs'
import {
  shopIndustryPack,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import {
  useAccountableActions,
  useManagedIdentity,
  useCommerceWorkspace,
  useProductionWorkspace,
  useSetupWorkspace,
} from './workspace-runtime'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))

type ProductOnboardingPageProps = {
  product: SetupProductId
}

const onboardingJourneys: Record<SetupProductId, { outcome: string; detail: string; actionLabel: string; firstTaskPath: string }> = {
  commerce: {
    outcome: 'Complete a sample sale',
    detail: 'A realistic catalog and stock are ready. Tap an item, choose payment, then create the order.',
    actionLabel: 'Create Shop and start selling',
    firstTaskPath: '/shop/?tab=counter',
  },
  production: {
    outcome: 'Run a sample production job',
    detail: 'A scheduled job, materials, and line are ready. Review the job, then record output.',
    actionLabel: 'Create Plant and open the job',
    firstTaskPath: '/plant/?tab=production',
  },
  website: {
    outcome: 'Preview a business website',
    detail: 'A responsive homepage is ready. Check desktop and mobile, then edit the page.',
    actionLabel: 'Create Website and preview it',
    firstTaskPath: '/website/',
  },
  ecommerce: {
    outcome: 'Open a working online store',
    detail: 'Shop stays the source of products, stock, and prices. Ecommerce presents them online and sends each order request back for review.',
    actionLabel: 'Build Ecommerce from Shop',
    firstTaskPath: '/ecommerce/',
  },
}

export function ProductOnboardingPage({ product }: ProductOnboardingPageProps) {
  const runtime = useOutletContext<RuntimeHealth>()
  const navigate = useNavigate()
  const location = useLocation()
  const [setup, setSetup] = useSetupWorkspace()
  const [actions] = useAccountableActions()
  const [production] = useProductionWorkspace()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [commerceWorkspace] = useCommerceWorkspace(managedIdentity)
  const [notice, setNotice] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [catalogImportRows, setCatalogImportRows] = useState(0)
  const [shopIndustryPackId] = useState<ShopIndustryPackId>(readLocalShopIndustryPackId)
  const [plantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [businessTemplateId, setBusinessTemplateId] = useState<ShopBusinessTemplateId | null>(
    () => (product === 'commerce' ? shopBusinessTemplateFromQuery(new URLSearchParams(location.search).get('template')) : null),
  )
  const [businessTypeOpen, setBusinessTypeOpen] = useState(() => businessTemplateId !== null)

  const onboardingProduct = productContracts[product]
  const onboardingJourney = onboardingJourneys[product]
  const selectedBusinessTemplate = product === 'commerce' && businessTemplateId ? shopBusinessTemplate(businessTemplateId) : null
  const selectedShopIndustryPack = shopIndustryPack(selectedBusinessTemplate?.industryPackId ?? shopIndustryPackId)
  const onboardingTemplate = setup.product === product
    ? templateFor(product, setup.templateId)
    : product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : templateFor(product, '')
  const workspaceOwner = setup.owner.trim() || 'Business owner'
  const workflowReady = setup.product === product && Boolean(setup.workspace.trim())
  const workspaceStarted = workflowReady && Boolean(setup.startedAt)
  const currentBusinessCatalog = product === 'ecommerce' ? commerceBusinessCatalogItems(commerceWorkspace) : []
  const ecommerceCatalogRows = Math.max(currentBusinessCatalog.length, catalogImportRows)
  const ecommerceCatalogReady = ecommerceCatalogRows > 0

  useEffect(() => {
    if (setup.product === product) return undefined
    const template = product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : templateFor(product, '')
    const selectionTimer = window.setTimeout(() => {
      rememberProductSetup(window.localStorage, setup)
      const saved = readProductSetup(window.localStorage, product)
      setSetup(saved ?? seedSetupForProduct(product, template.id))
      setNotice(saved
        ? `Continue your saved ${onboardingProduct.name} workspace.`
        : product === 'ecommerce'
          ? 'Enter the business name, then connect its Shop products.'
          : `${onboardingProduct.name} is ready. Add only the details needed for this workspace.`)
    }, 0)
    return () => window.clearTimeout(selectionTimer)
  }, [onboardingProduct.name, product, selectedShopIndustryPack.workflowTemplateId, setSetup, setup])

  useEffect(() => {
    if (setup.product !== product) return
    rememberProductSetup(window.localStorage, setup)
  }, [product, setup])

  useEffect(() => {
    if (product !== 'commerce' || setup.product !== 'commerce') return undefined
    const template = templateFor('commerce', selectedShopIndustryPack.workflowTemplateId)
    if (setup.templateId === template.id && setup.entryPoint === selectedShopIndustryPack.entryPoint) return undefined
    const packTimer = window.setTimeout(() => {
      setSetup((current) => current.product !== 'commerce'
        || (current.templateId === template.id && current.entryPoint === selectedShopIndustryPack.entryPoint)
        ? current
        : {
            ...current,
            templateId: template.id,
            entryPoint: selectedShopIndustryPack.entryPoint,
            startedAt: undefined,
            savedAt: undefined,
          })
    }, 0)
    return () => window.clearTimeout(packTimer)
  }, [product, selectedShopIndustryPack.entryPoint, selectedShopIndustryPack.workflowTemplateId, setSetup, setup.entryPoint, setup.product, setup.templateId])

  function changeBusinessTemplate(value: string) {
    const next = shopBusinessTemplateFromQuery(value)
    setBusinessTemplateId(next)
    setSetup((current) => (current.product === 'commerce' ? { ...current, startedAt: undefined, savedAt: undefined } : current))
  }

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => {
      const template = current.product === product
        ? templateFor(product, current.templateId)
        : product === 'commerce'
          ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
          : templateFor(product, '')
      return {
        ...current,
        product,
        templateId: template.id,
        entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
        ...patch,
        startedAt: undefined,
        savedAt: undefined,
      }
    })
  }

  function recordEcommerceCatalogProgress(progress: ClientDemoProductProgress) {
    if (progress.product !== 'commerce' || progress.status !== 'applied') return
    setCatalogImportRows(progress.readyRows)
    setSetup((current) => current.product === 'ecommerce' ? { ...current, startedAt: undefined, savedAt: undefined } : current)
    setNotice(`${progress.readyRows} Shop products are ready. Build the storefront when you are ready.`)
  }

  async function prepareGuidedWorkspace(useEcommerceDemo = false) {
    if (!workflowReady) {
      setNotice('Enter a business name.')
      return
    }
    if (product === 'ecommerce' && !useEcommerceDemo && !ecommerceCatalogReady) {
      setNotice('Import real Shop products first, or choose the demo option below.')
      return
    }
    if (workspaceStarted) {
      navigate(onboardingJourney.firstTaskPath)
      return
    }
    if (workspaceBusy) return
    setWorkspaceBusy(true)
    setNotice(`Preparing the working ${onboardingProduct.name} workspace...`)
    try {
      if (product === 'commerce') {
        provisionLocalShopIndustryPack(selectedShopIndustryPack.id)
        if (selectedBusinessTemplate) {
          await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
        } else {
          await provisionLocalShopWorkingSample(shopIndustryPackId, onboardingTemplate.id)
        }
      }
      if (product === 'production') {
        savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
        await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)
      }
      if (product === 'website') {
        await activateLocalWebsiteWorkingSample({
          templateId: onboardingTemplate.id as 'business-presence' | 'lead-generation' | 'catalog-showcase',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
      }
      if (product === 'ecommerce' && !managedIdentity) {
        const { activateLocalEcommerceWorkingSample } = await import('./local-client-import')
        const realCatalog = useEcommerceDemo ? undefined : commerceBusinessCatalogItems(loadCommerceWorkspace().state)
        if (!useEcommerceDemo && !realCatalog?.length) throw new Error('No reviewed Shop products are available for Ecommerce yet.')
        const result = await activateLocalEcommerceWorkingSample({
          templateId: onboardingTemplate.id as 'social-storefront' | 'pickup-preorder' | 'wholesale-request',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        }, realCatalog ? { catalog: realCatalog } : undefined)
        if (!result.ok) throw new Error(result.error)
      }
      const startedAt = new Date().toISOString()
      setSetup((current) => ({ ...current, product, owner: workspaceOwner, startedAt, savedAt: undefined }))
      if (product === 'commerce' || product === 'production') {
        const currentPlantShiftClose = currentProductionShiftClose(production)
        const metric = product === 'commerce'
          ? buildShopGuidedSaleOutcomeMetric(actions, startedAt)
          : buildPlantGuidedShiftCloseOutcomeMetric(currentPlantShiftClose ? [currentPlantShiftClose] : [], startedAt)
        if (metric) {
          startPilotOutcome(window.localStorage, {
          product,
          workspace: setup.workspace,
          owner: workspaceOwner,
          templateId: onboardingTemplate.id,
          }, metric, new Date(startedAt))
        }
      }
      recordBehaviorSignal(window.localStorage, {
        event: 'agent_job_chosen',
        product,
        route: onboardingJourney.firstTaskPath,
        detail: onboardingJourney.outcome,
      })
      navigate(onboardingJourney.firstTaskPath)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `The ${onboardingProduct.name} workspace could not be prepared.`)
    } finally {
      setWorkspaceBusy(false)
    }
  }

  async function startGuidedWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await prepareGuidedWorkspace()
  }

  function recordGuidedSetupRequest() {
    recordBehaviorSignal(window.localStorage, {
      event: 'product_requested',
      product,
      route: `/settings/?product=${onboardingProduct.slug}`,
      detail: `Requested guided ${onboardingProduct.name} setup`,
    })
  }

  return (
    <div className="workspace-screen settings-screen product-onboarding-screen" data-product={product}>
      <PageHeading
        copy={`Name this ${onboardingProduct.name} workspace once. SuperMega prepares a working copy and opens one useful first task.`}
        eyebrow={`${onboardingProduct.name} setup`}
        title={`Make ${onboardingProduct.name} yours`}
      />
      <div aria-label={`${onboardingProduct.name} onboarding`} className="product-onboarding-grid">
        <form className="core-panel product-onboarding-card product-onboarding-form" onSubmit={startGuidedWorkspace}>
          <div className="product-onboarding-intro"><span className="core-eyebrow">{product === 'ecommerce' ? 'Quick setup' : 'One step'}</span><h2>Name your workspace</h2><p>{product === 'ecommerce' ? 'Use the products already reviewed in Shop, or import them below. Demo products stay optional.' : 'We will add realistic sample records now; replace them with your data whenever you are ready.'}</p></div>
          <p className="product-onboarding-boundary"><strong>First useful result: {onboardingJourney.outcome}.</strong><br />{onboardingJourney.detail}</p>
          <label className="product-onboarding-business-name">Business name<input autoComplete="organization" maxLength={60} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" required value={setup.workspace} /></label>
          {product === 'commerce' ? (
            <details className="compact-disclosure product-onboarding-business-type" onToggle={(event) => setBusinessTypeOpen(event.currentTarget.open)} open={businessTypeOpen}>
              <summary><span>Business type</span><small>{selectedBusinessTemplate ? `${selectedBusinessTemplate.name.en} starter data` : 'Standard retail sample'}</small></summary>
              <label className="demo-pack-select">Starter data
                <select onChange={(event) => changeBusinessTemplate(event.target.value)} value={businessTemplateId ?? ''}>
                  <option value="">Standard sample (current industry pack)</option>
                  {shopBusinessTemplates.map((template) => <option key={template.id} value={template.id}>{template.name.en} · {template.name.my}</option>)}
                </select>
                <small>{selectedBusinessTemplate ? `${selectedBusinessTemplate.description} ${selectedBusinessTemplate.catalog.length} starter items with whole-MMK prices and reorder levels.` : 'Keep the standard sample, or pick a business type for a fuller starter catalog.'}</small>
              </label>
            </details>
          ) : null}
          {product === 'ecommerce' && !ecommerceCatalogReady ? <Suspense fallback={<p className="form-notice" role="status">Loading the Shop import...</p>}><ClientDataOnboarding allowSample={false} managedIdentity={managedIdentity} onProgress={recordEcommerceCatalogProgress} owner={workspaceOwner} product="commerce" productName="Shop" productSlug="shop" replacePristineCommerceDemo shopIndustryPackId={selectedShopIndustryPack.id} workflowTemplateId={selectedShopIndustryPack.workflowTemplateId} workspace={setup.workspace} /></Suspense> : null}
          {product !== 'ecommerce' || ecommerceCatalogReady ? <div className="product-onboarding-primary">
            <button className="core-button primary" disabled={!workflowReady || workspaceBusy} type="submit">{workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : product === 'ecommerce' ? `Build from ${ecommerceCatalogRows} Shop product${ecommerceCatalogRows === 1 ? '' : 's'}` : onboardingJourney.actionLabel}</button>
            <small>{workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : product === 'ecommerce' ? 'Uses Shop as the catalogue authority and opens the customer storefront.' : workflowReady ? 'Creates local sample records, then opens the first task.' : 'Enter a business name to continue.'}</small>
          </div> : null}
          {product === 'ecommerce' && !ecommerceCatalogReady ? <details className="compact-disclosure"><summary><span>Just exploring?</span><small>Demo products are optional</small></summary><div className="form-actions"><button className="core-button" disabled={!workflowReady || workspaceBusy} onClick={() => void prepareGuidedWorkspace(true)} type="button">Use demo products</button></div></details> : null}
          <p className="product-onboarding-help">{product === 'ecommerce' ? 'Ecommerce reads products, stock, and prices from Shop; confirmed requests return there as orders.' : <>This setup affects {onboardingProduct.name} only. Your other products stay separate.</>}</p>
          {product !== 'ecommerce' ? <p className="product-onboarding-help">Need help bringing real data? <a href={managedTrialRequestUrl(product, onboardingTemplate.id)} onClick={recordGuidedSetupRequest}>Ask SuperMega to set up {onboardingProduct.name}</a>.</p> : null}
          <p aria-live="polite" className="form-notice">{notice || 'Stays on this device. Nothing is sent or published.'}</p>
        </form>
      </div>
    </div>
  )
}
