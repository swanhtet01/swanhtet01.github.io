import { type FormEvent, useEffect, useState } from 'react'
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
  plantIndustryPack,
  plantIndustryPacks,
  readPlantIndustryPackId,
  savePlantIndustryPackId,
  type PlantIndustryPackId,
} from './plant-industry-packs'
import {
  shopIndustryPack,
  type ShopIndustryPackId,
} from './shop-service-scheduling'

const BUSINESS_TEMPLATE_ICONS: Record<string, string> = {
  'mini-mart': '🛒',
  'pharmacy': '💊',
  'phone-electronics': '📱',
  'fashion': '👗',
  'hardware': '🔧',
  'tea-coffee': '☕',
  'auto-parts': '🔩',
  'restaurant': '🍜',
  'spa': '💆',
  'gym': '💪',
  'school': '📚',
}
import {
  useAccountableActions,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
} from './workspace-runtime'

const PRIMARY_PARTNER: Partial<Record<SetupProductId, SetupProductId>> = {
  commerce: 'ecommerce',
  production: 'commerce',
  website: 'ecommerce',
  ecommerce: 'commerce',
}

type ProductOnboardingPageProps = {
  product: SetupProductId
}

const onboardingJourneys: Record<SetupProductId, { outcome: string; detail: string; actionLabel: string; firstTaskPath: string; connection: string }> = {
  commerce: {
    outcome: 'Complete a sample sale',
    detail: 'A realistic catalog and stock are ready. Tap an item, choose payment, then create the order.',
    actionLabel: 'Create Shop and start selling',
    firstTaskPath: '/shop/?tab=counter',
    connection: 'Shop receives online orders from Ecommerce and shares stock data with Plant.',
  },
  production: {
    outcome: 'Run a sample production job',
    detail: 'A scheduled job, materials, and line are ready. Review the job, then record output.',
    actionLabel: 'Create Plant and open the job',
    firstTaskPath: '/plant/?tab=production',
    connection: 'Plant draws material plans from Shop stock and returns finished goods to Shop.',
  },
  website: {
    outcome: 'Preview a business website',
    detail: 'A responsive homepage is ready. Check desktop and mobile, then edit the page.',
    actionLabel: 'Create Website and preview it',
    firstTaskPath: '/website/',
    connection: 'Website showcases your business and can link to Ecommerce for online ordering.',
  },
  ecommerce: {
    outcome: 'Open a working online store',
    detail: 'A storefront and checkout sample are ready. Review the store, then send an order into Shop.',
    actionLabel: 'Create Ecommerce and open the store',
    firstTaskPath: '/ecommerce/',
    connection: 'Ecommerce customer requests become Shop orders, linking the storefront to fulfilment.',
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
  const [notice, setNotice] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [shopIndustryPackId, setShopIndustryPackId] = useState<ShopIndustryPackId>(readLocalShopIndustryPackId)
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [businessTemplateId, setBusinessTemplateId] = useState<ShopBusinessTemplateId | null>(
    () => (product === 'commerce' ? shopBusinessTemplateFromQuery(new URLSearchParams(location.search).get('template')) : null),
  )
  const [partnerSetup] = useState(() => {
    if (typeof window === 'undefined') return null
    const partnerId = PRIMARY_PARTNER[product]
    return partnerId ? readProductSetup(window.localStorage, partnerId) : null
  })

  const onboardingProduct = productContracts[product]
  const onboardingJourney = onboardingJourneys[product]
  const selectedBusinessTemplate = product === 'commerce' && businessTemplateId ? shopBusinessTemplate(businessTemplateId) : null
  const selectedShopIndustryPack = shopIndustryPack(selectedBusinessTemplate?.industryPackId ?? shopIndustryPackId)
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  // Starter catalogs are written for one shop type, so offering the others here
  // would install a catalog that contradicts the schedule and capabilities.
  const onboardingTemplate = setup.product === product
    ? templateFor(product, setup.templateId)
    : product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : templateFor(product, '')
  const workspaceOwner = setup.owner.trim() || 'Business owner'
  const workflowReady = setup.product === product && Boolean(setup.workspace.trim())
  const workspaceStarted = workflowReady && Boolean(setup.startedAt)
  const partnerConnected = partnerSetup?.startedAt ? partnerSetup.workspace : null
  const partnerProductName = PRIMARY_PARTNER[product] ? productContracts[PRIMARY_PARTNER[product]!].name : null

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

  function selectBusinessTemplate(id: ShopBusinessTemplateId | null) {
    if (id === null) {
      setBusinessTemplateId(null)
    } else {
      const template = shopBusinessTemplate(id)
      setBusinessTemplateId(template.id)
      setShopIndustryPackId(template.industryPackId)
    }
    setSetup((current) => (current.product === 'commerce' ? { ...current, startedAt: undefined, savedAt: undefined } : current))
  }

  function changePlantIndustryPack(value: string) {
    const next = plantIndustryPacks.find((pack) => pack.id === value)
    if (!next) return
    setPlantIndustryPackId(next.id)
    setSetup((current) => (current.product === 'production' ? { ...current, startedAt: undefined, savedAt: undefined } : current))
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

  async function startGuidedWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workflowReady) {
      setNotice('Enter a business name.')
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
        // Shop reports a preserved workspace by return value too, so surface it
        // here or setup falsely reports success on any second run.
        const disposition = selectedBusinessTemplate
          ? await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
          : await provisionLocalShopWorkingSample(selectedShopIndustryPack.id, onboardingTemplate.id)
        if (disposition === 'preserved') {
          throw new Error('Your existing Shop catalog and orders were kept. Reset the local Shop data first to install this sample.')
        }
      }
      if (product === 'production') {
        savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
        await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)
      }
      if (product === 'website') {
        // These activations report refusal instead of throwing, so a preserved
        // workspace must be surfaced here or the flow would falsely report success.
        const activation = await activateLocalWebsiteWorkingSample({
          templateId: onboardingTemplate.id as 'business-presence' | 'lead-generation' | 'catalog-showcase',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
        if (!activation.ok) throw new Error(activation.error)
      }
      if (product === 'ecommerce' && !managedIdentity) {
        const { activateLocalEcommerceWorkingSample } = await import('./local-client-import')
        const activation = await activateLocalEcommerceWorkingSample({
          templateId: onboardingTemplate.id as 'social-storefront' | 'pickup-preorder' | 'wholesale-request',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
        if (!activation.ok) throw new Error(activation.error)
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
          <div className="product-onboarding-intro"><span className="core-eyebrow">One step</span><h2>Name your workspace</h2><p>We will add realistic sample records now; replace them with your data whenever you are ready.</p></div>
          <p className="product-onboarding-boundary"><strong>First useful result: {onboardingJourney.outcome}.</strong><br />{onboardingJourney.detail}</p>
          <label className="product-onboarding-business-name">Business name<input autoComplete="organization" maxLength={60} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" required value={setup.workspace} /></label>
          {product === 'commerce' ? (
            <div className="business-template-picker">
              <div className="business-template-picker-header">
                <span className="core-eyebrow">Business type</span>
                {selectedBusinessTemplate ? (
                  <p>{selectedBusinessTemplate.description} {selectedBusinessTemplate.catalog.length} starter items.</p>
                ) : (
                  <p>Pick your business type to get a matching starter catalog with real Myanmar prices and reorder levels.</p>
                )}
              </div>
              <div className="business-template-grid" role="group" aria-label="Business type">
                {shopBusinessTemplates.map((template) => (
                  <button
                    aria-pressed={businessTemplateId === template.id}
                    className="business-template-card"
                    data-selected={businessTemplateId === template.id || undefined}
                    key={template.id}
                    onClick={() => selectBusinessTemplate(businessTemplateId === template.id ? null : template.id)}
                    type="button"
                  >
                    <span className="business-template-icon" aria-hidden="true">{BUSINESS_TEMPLATE_ICONS[template.id]}</span>
                    <span className="business-template-name-en">{template.name.en}</span>
                    <span className="business-template-name-my">{template.name.my}</span>
                  </button>
                ))}
              </div>
              <ul className="product-onboarding-capabilities">{selectedShopIndustryPack.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
            </div>
          ) : null}
          {product === 'production' ? (
            <details className="compact-disclosure product-onboarding-business-type" open>
              <summary><span>Production type</span><small>{selectedPlantIndustryPack.name} sample</small></summary>
              <label className="demo-pack-select">Production type
                <select onChange={(event) => changePlantIndustryPack(event.target.value)} value={selectedPlantIndustryPack.id}>
                  {plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                </select>
                <small>{selectedPlantIndustryPack.firstWorkflow} {selectedPlantIndustryPack.description}</small>
              </label>
              <ul className="product-onboarding-capabilities">{selectedPlantIndustryPack.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
            </details>
          ) : null}
          <div className="product-onboarding-primary">
            <button className="core-button primary" disabled={!workflowReady || workspaceBusy} type="submit">{workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : onboardingJourney.actionLabel}</button>
            <small>{workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : workflowReady ? 'Creates local sample records, then opens the first task.' : 'Enter a business name to continue.'}</small>
          </div>
          <p className="product-onboarding-help">This setup affects {onboardingProduct.name} only. Your other products stay separate.</p>
          <p className="product-onboarding-help product-onboarding-connection">{onboardingJourney.connection}</p>
          {partnerConnected ? <p className="product-onboarding-help product-onboarding-peer-ready"><strong>{partnerProductName}</strong> workspace <strong className="product-onboarding-peer-name">{partnerConnected}</strong> is ready to connect.</p> : null}
          <p className="product-onboarding-help">Need help bringing real data? <a href={managedTrialRequestUrl(product, onboardingTemplate.id)} onClick={recordGuidedSetupRequest}>Ask SuperMega to set up {onboardingProduct.name}</a>.</p>
          <p aria-live="polite" className="form-notice">{notice || 'Stays on this device. Nothing is sent or published.'}</p>
        </form>
      </div>
    </div>
  )
}
