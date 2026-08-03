import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router'

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
  readProductSetup,
  rememberProductSetup,
  seedSetupForProduct,
  setupProductPreviewPath,
  templateFor,
  type SetupProductId,
  type SetupState,
} from './product-setup'
import {
  provisionLocalPlantWorkingSample,
  provisionLocalShopIndustryPack,
  provisionLocalShopWorkingSample,
  readLocalShopIndustryPackId,
} from './product-onboarding-runtime'
import {
  plantIndustryPack,
  plantIndustryPacks,
  readPlantIndustryPackId,
  savePlantIndustryPackId,
  type PlantIndustryPackId,
} from './plant-industry-packs'
import {
  shopIndustryPack,
  shopIndustryPacks,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import {
  useAccountableActions,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
} from './workspace-runtime'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))

type ProductOnboardingPageProps = {
  product: SetupProductId
}

export function ProductOnboardingPage({ product }: ProductOnboardingPageProps) {
  const runtime = useOutletContext<RuntimeHealth>()
  const navigate = useNavigate()
  const [setup, setSetup] = useSetupWorkspace()
  const [actions] = useAccountableActions()
  const [production] = useProductionWorkspace()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [notice, setNotice] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [dataSetupOpen, setDataSetupOpen] = useState(false)
  const [shopIndustryPackId, setShopIndustryPackId] = useState<ShopIndustryPackId>(readLocalShopIndustryPackId)
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))

  const onboardingProduct = productContracts[product]
  const selectedShopIndustryPack = shopIndustryPack(shopIndustryPackId)
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const onboardingTemplate = setup.product === product
    ? templateFor(product, setup.templateId)
    : product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : templateFor(product, '')
  const workspaceOwner = setup.owner.trim() || 'Business owner'
  const workflowReady = setup.product === product && Boolean(setup.workspace.trim())
  const workspaceStarted = workflowReady && Boolean(setup.startedAt)

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

  function changeShopIndustryPack(industryPackId: ShopIndustryPackId) {
    const pack = shopIndustryPack(industryPackId)
    const template = templateFor('commerce', pack.workflowTemplateId)
    setShopIndustryPackId(pack.id)
    updateSetup({ templateId: template.id, entryPoint: pack.entryPoint })
    setNotice(`${pack.name} is ready with the ${template.name} workflow.`)
  }

  function changePlantIndustryPack(industryPackId: PlantIndustryPackId) {
    const pack = plantIndustryPack(industryPackId)
    setPlantIndustryPackId(pack.id)
    setNotice(`${pack.name} is ready. Your starting workflow stays simple and can be expanded later.`)
  }

  async function startGuidedWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workflowReady) {
      setNotice('Enter the business name first.')
      return
    }
    if (workspaceStarted) {
      navigate(setupProductPreviewPath(product))
      return
    }
    if (workspaceBusy) return
    setWorkspaceBusy(true)
    setNotice(`Preparing the working ${onboardingProduct.name} workspace...`)
    try {
      if (product === 'commerce') {
        provisionLocalShopIndustryPack(shopIndustryPackId)
        await provisionLocalShopWorkingSample(shopIndustryPackId, onboardingTemplate.id)
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
        await activateLocalEcommerceWorkingSample({
          templateId: onboardingTemplate.id as 'social-storefront' | 'pickup-preorder' | 'wholesale-request',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
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
        route: setupProductPreviewPath(product),
        detail: product === 'commerce'
          ? 'Start Shop outcome proof'
          : product === 'production'
            ? 'Start Plant shift-close proof'
            : `Create ${onboardingProduct.name} workspace`,
      })
      navigate(setupProductPreviewPath(product))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `The ${onboardingProduct.name} workspace could not be prepared.`)
    } finally {
      setWorkspaceBusy(false)
    }
  }

  return (
    <div className="workspace-screen settings-screen product-onboarding-screen" data-product={product}>
      <PageHeading
        actions={<div className="product-onboarding-demo-action"><Link className="core-button primary" to={setupProductPreviewPath(product)}>Open {onboardingProduct.name} sample</Link><small>Instant. No account, form, or upload.</small></div>}
        copy={`Use the working ${onboardingProduct.name} sample immediately. If it fits, add your business name to keep a personalized workspace; importing data can wait.`}
        eyebrow={`${onboardingProduct.name} only`}
        title={`Try ${onboardingProduct.name} now`}
      />
      <div aria-label={`${onboardingProduct.name} onboarding`} className="product-onboarding-grid">
        <form className="core-panel product-onboarding-card product-onboarding-form" onSubmit={startGuidedWorkspace}>
          <div className="product-onboarding-intro"><span className="core-eyebrow">Optional personalization</span><h2>Use your business name</h2><p>One field turns the sample into a named workspace on this device.</p></div>
          <label className="product-onboarding-business-name">Business name<input autoComplete="organization" maxLength={60} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" required value={setup.workspace} /></label>
          <div className="product-onboarding-primary">
            <button className="core-button primary" disabled={!workflowReady || workspaceBusy} type="submit">{workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : `Create my ${onboardingProduct.name} workspace`}</button>
            <small>{workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : workflowReady ? 'Adds realistic sample records. You can replace them with your data later.' : 'Or open the sample above with no setup.'}</small>
          </div>
          {product === 'commerce' || product === 'production' ? <details className="compact-disclosure product-onboarding-details">
            <summary><span>Choose business type</span><small>Optional</small></summary>
            <div className="product-onboarding-options">
              {product === 'commerce' ? <div className="form-row"><label>Business type<select onChange={(event) => changeShopIndustryPack(event.target.value as ShopIndustryPackId)} value={shopIndustryPackId}>{shopIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label><div className="setup-pack-summary"><strong>{selectedShopIndustryPack.firstWorkflow}</strong><small>{selectedShopIndustryPack.description}</small></div></div> : null}
              {product === 'production' ? <div className="form-row"><label>Factory type<select onChange={(event) => changePlantIndustryPack(event.target.value as PlantIndustryPackId)} value={plantIndustryPackId}>{plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label><div className="setup-pack-summary"><strong>{selectedPlantIndustryPack.firstWorkflow}</strong><small>{selectedPlantIndustryPack.description}</small></div></div> : null}
            </div>
          </details> : null}
          <details className="compact-disclosure product-onboarding-details" onToggle={(event) => setDataSetupOpen(event.currentTarget.open)}>
            <summary><span>Import existing data</span><small>Later</small></summary>
            {dataSetupOpen ? workflowReady ? <section className="demo-data-setup" id="client-data-setup"><div><span className="core-eyebrow">Your data</span><h3>Replace the sample when ready</h3><p>Import only {onboardingProduct.name} data. The other SuperMega products remain separate.</p></div><Suspense fallback={<p className="form-notice" role="status">Loading the data template...</p>}><ClientDataOnboarding initiallyOpen={false} managedIdentity={managedIdentity} owner={workspaceOwner} plantIndustryPackId={product === 'production' ? plantIndustryPackId : undefined} product={product} productName={onboardingProduct.name} productSlug={onboardingProduct.slug} shopIndustryPackId={product === 'commerce' ? shopIndustryPackId : undefined} workflowTemplateId={onboardingTemplate.id} workspace={setup.workspace} /></Suspense></section> : <p className="form-notice">Enter the business name before importing data.</p> : null}
          </details>
          <p className="product-onboarding-boundary">Only {onboardingProduct.name} changes. The other products stay separate.</p>
          <p aria-live="polite" className="form-notice">{notice || 'Nothing is sent or published.'}</p>
        </form>
      </div>
    </div>
  )
}
