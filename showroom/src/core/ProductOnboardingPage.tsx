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
import { currentProductionShiftClose, productionBusinessJobs } from './production-workspace'
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
import {
  reviewManagedSpaStaffAccess,
  type ManagedSpaStaffAccessReview,
  type SpaStaffAccessRole,
} from './managed-trial'
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
    outcome: 'Complete a first counter sale',
    detail: 'Your reviewed catalogue and opening stock are ready. Tap an item, choose payment, then create the order.',
    actionLabel: 'Open Shop Sell',
    firstTaskPath: '/shop/?tab=counter',
  },
  production: {
    outcome: 'Record output for a first production job',
    detail: 'Your reviewed opening jobs are ready. Open Jobs, choose the current job, then record output.',
    actionLabel: 'Open Plant Jobs',
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

const spaOnboardingJourney = {
  outcome: 'Book and complete the first spa appointment',
  detail: 'Realistic services and therapist-room stations are ready. Hold the time, confirm the client, check in, complete the treatment, then review checkout.',
  actionLabel: 'Open Spa appointments',
  firstTaskPath: '/shop/?tab=orders#shop-service-schedule',
} as const

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
  const [shopImportRows, setShopImportRows] = useState(0)
  const [plantImportRows, setPlantImportRows] = useState(0)
  const [shopIndustryPackId] = useState<ShopIndustryPackId>(readLocalShopIndustryPackId)
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [businessTemplateId, setBusinessTemplateId] = useState<ShopBusinessTemplateId | null>(
    () => (product === 'commerce' ? shopBusinessTemplateFromQuery(new URLSearchParams(location.search).get('template')) : null),
  )
  const [businessTypeOpen, setBusinessTypeOpen] = useState(() => businessTemplateId !== null)
  const [spaStaffName, setSpaStaffName] = useState('')
  const [spaStaffEmail, setSpaStaffEmail] = useState('')
  const [spaStaffAccessRole, setSpaStaffAccessRole] = useState<SpaStaffAccessRole>('front-desk')
  const [spaStaffReview, setSpaStaffReview] = useState<ManagedSpaStaffAccessReview | null>(null)

  const onboardingProduct = productContracts[product]
  const selectedBusinessTemplate = product === 'commerce' && businessTemplateId ? shopBusinessTemplate(businessTemplateId) : null
  const selectedShopIndustryPack = shopIndustryPack(selectedBusinessTemplate?.industryPackId ?? shopIndustryPackId)
  const spaOnboardingSelected = product === 'commerce' && selectedShopIndustryPack.id === 'spa'
  const onboardingJourney = spaOnboardingSelected ? spaOnboardingJourney : onboardingJourneys[product]
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const onboardingTemplate = setup.product === product
    ? templateFor(product, setup.templateId)
    : product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : templateFor(product, '')
  const workspaceOwner = setup.owner.trim() || 'Business owner'
  const workflowReady = setup.product === product && Boolean(setup.workspace.trim())
  const workspaceStarted = workflowReady && Boolean(setup.startedAt)
  const currentBusinessCatalog = product === 'commerce' || product === 'ecommerce' ? commerceBusinessCatalogItems(commerceWorkspace) : []
  const currentBusinessJobs = product === 'production' ? productionBusinessJobs(production) : []
  const reviewedShopCatalogRows = Math.max(currentBusinessCatalog.length, shopImportRows)
  const reviewedShopCatalogReady = reviewedShopCatalogRows > 0
  const reviewedPlantJobRows = Math.max(currentBusinessJobs.length, plantImportRows)
  const reviewedPlantJobsReady = reviewedPlantJobRows > 0
  const reviewedBusinessDataReady = product === 'production' ? reviewedPlantJobsReady : reviewedShopCatalogReady

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
          : product === 'production'
            ? 'Enter the business name, then import the production jobs you plan to run.'
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

  function recordBusinessDataProgress(progress: ClientDemoProductProgress) {
    if (progress.status !== 'applied' || (progress.product !== 'commerce' && progress.product !== 'production')) return
    if (progress.product === 'production') setPlantImportRows(progress.readyRows)
    else setShopImportRows(progress.readyRows)
    setSetup((current) => current.product === product ? { ...current, startedAt: undefined, savedAt: undefined } : current)
    setNotice(product === 'production'
      ? `${progress.readyRows} Plant jobs are ready. Open Jobs when you are ready.`
      : product === 'commerce'
        ? `${progress.readyRows} Shop items are ready. Open Sell when you are ready.`
        : `${progress.readyRows} Shop products are ready. Build the storefront when you are ready.`)
  }

  function changePlantIndustryPack(value: string) {
    const next = plantIndustryPack(value).id
    setPlantIndustryPackId(next)
    setSetup((current) => current.product === 'production' ? { ...current, startedAt: undefined, savedAt: undefined } : current)
  }

  async function prepareGuidedWorkspace(useDemo = false) {
    if (!workflowReady) {
      setNotice('Enter a business name.')
      return
    }
    if (workspaceStarted) {
      navigate(onboardingJourney.firstTaskPath)
      return
    }
    if ((product === 'commerce' || product === 'ecommerce' || product === 'production') && !useDemo && !reviewedBusinessDataReady) {
      setNotice(`Import real ${product === 'production' ? 'Plant jobs' : 'Shop products'} first${managedIdentity ? '.' : ', or choose the demo option below.'}`)
      return
    }
    if (workspaceBusy) return
    setWorkspaceBusy(true)
    setNotice(`Preparing the working ${onboardingProduct.name} workspace...`)
    try {
      if (product === 'commerce' && !managedIdentity) {
        provisionLocalShopIndustryPack(selectedShopIndustryPack.id)
        if (useDemo) {
          if (selectedBusinessTemplate) {
            await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
          } else {
            await provisionLocalShopWorkingSample(shopIndustryPackId, onboardingTemplate.id)
          }
        }
      }
      if (product === 'production') {
        savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
        if (useDemo) await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)
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
        const realCatalog = useDemo ? undefined : commerceBusinessCatalogItems(loadCommerceWorkspace().state)
        if (!useDemo && !realCatalog?.length) throw new Error('No reviewed Shop products are available for Ecommerce yet.')
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

  async function reviewSpaStaffAccess() {
    if (!managedIdentity || managedIdentity.access !== 'owner') {
      setNotice('Sign in as the company owner to review staff access.')
      return
    }
    setWorkspaceBusy(true)
    setSpaStaffReview(null)
    setNotice('')
    try {
      const review = await reviewManagedSpaStaffAccess({
        identity: managedIdentity,
        displayName: spaStaffName,
        email: spaStaffEmail,
        role: spaStaffAccessRole,
      })
      setSpaStaffReview(review)
      setNotice('Review ready. No invitation or access was created.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Staff access could not be reviewed.')
    } finally {
      setWorkspaceBusy(false)
    }
  }

  return (
    <div className="workspace-screen settings-screen product-onboarding-screen" data-product={product}>
      <PageHeading
        copy={spaOnboardingSelected ? 'Name the spa once. SuperMega prepares appointments, checkout, stock, and one clear first task.' : `Name this ${onboardingProduct.name} workspace once. SuperMega prepares a working copy and opens one useful first task.`}
        eyebrow={spaOnboardingSelected ? 'Spa starter' : `${onboardingProduct.name} setup`}
        title={spaOnboardingSelected ? 'Set up your Spa' : `Make ${onboardingProduct.name} yours`}
      />
      <div aria-label={`${onboardingProduct.name} onboarding`} className="product-onboarding-grid" role="region">
        <form className="core-panel product-onboarding-card product-onboarding-form" onSubmit={startGuidedWorkspace}>
          <div className="product-onboarding-intro"><span className="core-eyebrow">{product === 'website' ? 'One step' : spaOnboardingSelected ? 'Guided Spa setup' : 'Quick setup'}</span><h2>{spaOnboardingSelected ? 'Name the spa' : 'Name your workspace'}</h2><p>{spaOnboardingSelected ? 'Start with a realistic working day, then replace the sample services, staff, products, and clients with the spa’s own records.' : product === 'commerce' ? 'Bring the products you actually sell. Business-template demo records stay optional.' : product === 'ecommerce' ? 'Use the products already reviewed in Shop, or import them below. Demo products stay optional.' : product === 'production' ? 'Bring the production jobs you actually plan to run. Industry demo records stay optional.' : 'We will add a realistic website draft now; replace it with your content whenever you are ready.'}</p></div>
          <p className="product-onboarding-boundary"><strong>First useful result: {onboardingJourney.outcome}.</strong><br />{onboardingJourney.detail}</p>
          {spaOnboardingSelected ? <section aria-label="Spa first-day roles" className="spa-onboarding-brief">
            <div><span className="core-eyebrow">First workday</span><h3>One simple handoff</h3><p>Front desk books and collects payment. The therapist completes the checked-in treatment. The owner reviews setup, refunds, stock, and Daily close.</p></div>
            <p className="spa-onboarding-result">Keep notes to service preferences only; do not enter diagnoses, medical history, IDs, or payment details.</p>
          </section> : null}
          {spaOnboardingSelected && managedIdentity?.access === 'owner' ? <details className="compact-disclosure spa-staff-access-review">
            <summary><span>Staff access</span><small>One role · nothing sent</small></summary>
            <p>Review one account. Sending needs owner confirmation.</p>
            <label>Staff name<input autoComplete="name" maxLength={80} onChange={(event) => { setSpaStaffName(event.target.value); setSpaStaffReview(null) }} placeholder="Example: Su Su" value={spaStaffName} /></label>
            <label>Staff work email<input autoComplete="email" inputMode="email" maxLength={160} onChange={(event) => { setSpaStaffEmail(event.target.value); setSpaStaffReview(null) }} placeholder="staff@example.com" type="email" value={spaStaffEmail} /></label>
            <label>One role
              <select onChange={(event) => { setSpaStaffAccessRole(event.target.value as SpaStaffAccessRole); setSpaStaffReview(null) }} value={spaStaffAccessRole}>
                <option value="front-desk">Front desk</option>
                <option value="therapist">Therapist</option>
              </select>
            </label>
            <button className="core-button primary" disabled={workspaceBusy || spaStaffName.trim().length < 2 || !spaStaffEmail.trim()} onClick={() => void reviewSpaStaffAccess()} type="button">{workspaceBusy ? 'Checking access...' : 'Review staff access'}</button>
            {spaStaffReview ? <p aria-label="Reviewed Spa staff access" className="product-onboarding-boundary"><strong>{spaStaffReview.candidate.display_name} · {spaStaffReview.candidate.role === 'front-desk' ? 'Front desk' : 'Therapist'}.</strong> Nothing was sent or activated. Mobile access checks remain. <small title={spaStaffReview.review_digest}>Review {spaStaffReview.review_digest.slice(7, 23)}…</small></p> : null}
          </details> : null}
          <label className="product-onboarding-business-name">Business name<input autoComplete="organization" maxLength={60} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={spaOnboardingSelected ? 'Example: Thiri Wellness Spa' : 'Example: Golden Valley Trading'} required value={setup.workspace} /></label>
          {(product === 'commerce' || product === 'ecommerce') && !reviewedShopCatalogReady ? <Suspense fallback={<p className="form-notice" role="status">Loading the Shop import...</p>}><ClientDataOnboarding allowSample={false} managedIdentity={managedIdentity} onProgress={recordBusinessDataProgress} owner={workspaceOwner} product="commerce" productName="Shop" productSlug="shop" replacePristineCommerceDemo requiredFor={product === 'commerce' ? 'Shop' : 'Ecommerce'} shopIndustryPackId={selectedShopIndustryPack.id} workflowTemplateId={selectedShopIndustryPack.workflowTemplateId} workspace={setup.workspace} /></Suspense> : null}
          {product === 'production' && !reviewedPlantJobsReady ? <Suspense fallback={<p className="form-notice" role="status">Loading the Plant import...</p>}><ClientDataOnboarding allowSample={false} managedIdentity={managedIdentity} onProgress={recordBusinessDataProgress} owner={workspaceOwner} plantIndustryPackId={plantIndustryPackId} product="production" productName="Plant" productSlug="plant" requiredFor="Plant" workflowTemplateId={onboardingTemplate.id} workspace={setup.workspace} /></Suspense> : null}
          {product === 'website' || reviewedBusinessDataReady || workspaceStarted ? <div className="product-onboarding-primary">
            <button className="core-button primary" disabled={!workflowReady || workspaceBusy} type="submit">{workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : product === 'commerce' ? `Open Sell with ${reviewedShopCatalogRows} item${reviewedShopCatalogRows === 1 ? '' : 's'}` : product === 'ecommerce' ? `Build from ${reviewedShopCatalogRows} Shop product${reviewedShopCatalogRows === 1 ? '' : 's'}` : product === 'production' ? `Open Jobs with ${reviewedPlantJobRows} job${reviewedPlantJobRows === 1 ? '' : 's'}` : onboardingJourney.actionLabel}</button>
            <small>{workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : product === 'commerce' ? 'Opens Sell with the reviewed Shop catalogue; no demo items are added.' : product === 'ecommerce' ? 'Uses Shop as the catalogue authority and opens the customer storefront.' : product === 'production' ? 'Opens Jobs with the reviewed production plan; no demo jobs are added.' : workflowReady ? 'Creates a local website draft, then opens the first task.' : 'Enter a business name to continue.'}</small>
          </div> : null}
          {product === 'commerce' && !reviewedShopCatalogReady && !workspaceStarted && !managedIdentity ? <details className="compact-disclosure product-onboarding-business-type" onToggle={(event) => setBusinessTypeOpen(event.currentTarget.open)} open={businessTypeOpen}>
            <summary><span>{spaOnboardingSelected ? 'Start with a working Spa' : 'Just exploring?'}</span><small>{spaOnboardingSelected ? 'Realistic sample · replace anytime' : 'Business demo is optional'}</small></summary>
            <label className="demo-pack-select">Demo business type
              <select onChange={(event) => changeBusinessTemplate(event.target.value)} value={businessTemplateId ?? ''}>
                <option value="">Standard Shop demo</option>
                {shopBusinessTemplates.map((template) => <option key={template.id} value={template.id}>{template.name.en} · {template.name.my}</option>)}
              </select>
              <small>{selectedBusinessTemplate ? `${selectedBusinessTemplate.description} ${selectedBusinessTemplate.catalog.length} sample items with whole-MMK prices and reorder levels. Sample people and contacts are fictional.` : 'Use realistic sample items for an isolated walkthrough. They are not client data.'}</small>
            </label>
            <div className="form-actions"><button className="core-button" disabled={!workflowReady || workspaceBusy} onClick={() => void prepareGuidedWorkspace(true)} type="button">{selectedBusinessTemplate?.id === 'spa-wellness' ? 'Create Spa starter and open appointments' : `Use ${selectedBusinessTemplate?.name.en ?? selectedShopIndustryPack.name} demo`}</button></div>
          </details> : null}
          {product === 'ecommerce' && !reviewedShopCatalogReady && !workspaceStarted && !managedIdentity ? <details className="compact-disclosure"><summary><span>Just exploring?</span><small>Demo products are optional</small></summary><div className="form-actions"><button className="core-button" disabled={!workflowReady || workspaceBusy} onClick={() => void prepareGuidedWorkspace(true)} type="button">Use demo products</button></div></details> : null}
          {product === 'production' && !reviewedPlantJobsReady && !workspaceStarted && !managedIdentity ? <details className="compact-disclosure product-onboarding-business-type">
            <summary><span>Just exploring?</span><small>Industry demo is optional</small></summary>
            <label className="demo-pack-select">Demo production type
              <select onChange={(event) => changePlantIndustryPack(event.target.value)} value={plantIndustryPackId}>{plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select>
              <small>{selectedPlantIndustryPack.firstWorkflow}. {selectedPlantIndustryPack.description} Sample jobs stay separate from client data.</small>
            </label>
            <div className="form-actions"><button className="core-button" disabled={!workflowReady || workspaceBusy} onClick={() => void prepareGuidedWorkspace(true)} type="button">Use {selectedPlantIndustryPack.name} demo</button></div>
          </details> : null}
          <p className="product-onboarding-help">{product === 'commerce' ? spaOnboardingSelected ? 'Spa runs inside Shop: appointments, checkout, stock, orders, payments, and close stay together. Website and Ecommerce remain separate products.' : 'Shop keeps one catalogue for Sell, stock, orders, and Ecommerce.' : product === 'ecommerce' ? 'Ecommerce reads products, stock, and prices from Shop; confirmed requests return there as orders.' : <>This setup affects {onboardingProduct.name} only. Your other products stay separate.</>}</p>
          {product !== 'ecommerce' ? <p className="product-onboarding-help">Need help bringing real data? <a href={managedTrialRequestUrl(product, onboardingTemplate.id)} onClick={recordGuidedSetupRequest}>Ask SuperMega to set up {onboardingProduct.name}</a>.</p> : null}
          <p aria-live="polite" className="form-notice">{notice || 'Stays on this device. Nothing is sent or published.'}</p>
        </form>
      </div>
    </div>
  )
}
