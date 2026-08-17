import { type FormEvent, useEffect, useMemo, useState } from 'react'
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
  conflictingOwnerRecord,
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
} from '../products/shop/business-templates'
import { signupBusinessChoices } from './signup-trial'
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
  const [plantTypeOpen, setPlantTypeOpen] = useState(() => product === 'production')
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  // One grouped picker, ported from the signup page so both doors ask the product's first
  // question the same way. A choice is either 'trade:<template>' or 'pack:<industry pack>';
  // the empty string keeps the standard sample on whatever pack this device already carries.
  const [businessChoiceId, setBusinessChoiceId] = useState(() => {
    if (product !== 'commerce') return ''
    const requestedTrade = shopBusinessTemplateFromQuery(new URLSearchParams(location.search).get('template'))
    return requestedTrade ? `trade:${requestedTrade}` : ''
  })
  const businessTemplateId = businessChoiceId.startsWith('trade:')
    ? shopBusinessTemplateFromQuery(businessChoiceId.slice('trade:'.length))
    : null
  // Only the packs with no trade template. signupBusinessChoices already applies that rule for
  // /signup, and it is the same rule here on purpose: a pack reachable through a trade listed
  // twice is two doors to the same room, a choice an owner cannot make correctly.
  const servicePackIds = useMemo(() => new Set(
    signupBusinessChoices(shopBusinessTemplates, shopIndustryPacks)
      .filter((choice) => choice.kind === 'pack')
      .map((choice) => choice.industryPackId),
  ), [])
  // Open by default for Shop. It used to open only when a ?template= deep link supplied the
  // answer, so an owner arriving at /settings/?product=shop -- which is how everyone actually
  // arrives -- saw a collapsed summary and completed setup on the default retail catalog. That
  // silently mis-onboarded every spa, gym and school, the exact businesses that have to choose
  // here because they have no trade template to pick.
  const [businessTypeOpen, setBusinessTypeOpen] = useState(() => product === 'commerce')

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
  const accountableOwner = setup.owner.trim()
  const ownerRecordedElsewhere = conflictingOwnerRecord(startedOwnersElsewhere, accountableOwner)
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
      const freshSeed = seedSetupForProduct(product, template.id)
      setSetup(saved ?? (sharedWorkspaceName
        ? { ...freshSeed, workspace: sharedWorkspaceName, owner: sharedOwnerName }
        : freshSeed))
      setNotice(saved
        ? `Continue your saved ${onboardingProduct.name} workspace.`
        : sharedWorkspaceName && sharedOwnerName
          ? `${onboardingProduct.name} is ready. We carried over your business name and the person accountable — change either if this workspace needs different ones.`
          : sharedWorkspaceName
            ? `${onboardingProduct.name} is ready. We matched your business name — change it if this workspace needs a different one.`
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

  function changeBusinessChoice(value: string) {
    setBusinessChoiceId(value)
    if (value.startsWith('pack:')) setShopIndustryPackId(value.slice('pack:'.length) as ShopIndustryPackId)
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
      // Every provisioner below REPORTS what it did, and every report was thrown away. A no-op
      // then reached the owner stamped as a completed setup: the appointment book left on the old
      // industry, the catalog never installed, the workspace never written -- interface advanced.
      let carriedOver = false
      if (product === 'commerce') {
        // Returns the pack ACTUALLY in force. An existing appointment keeps its own pack, so the
        // pack asked for is not always the pack installed, and the sample must follow the real one.
        const schedule = provisionLocalShopIndustryPack(selectedShopIndustryPack.id)
        const disposition = selectedBusinessTemplate
          ? await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
          : await provisionLocalShopWorkingSample(schedule.industryPackId, onboardingTemplate.id)
        carriedOver = disposition === 'preserved'
      }
      if (product === 'production') {
        savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
        await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)
      }
      if (product === 'website') {
        // Returns { ok, error } instead of throwing. Ignoring it sent the owner into a Website that
        // was never prepared, and told them it was ready.
        const activated = await activateLocalWebsiteWorkingSample({
          templateId: onboardingTemplate.id as 'business-presence' | 'lead-generation' | 'catalog-showcase',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
        if (!activated.ok) throw new Error(activated.error)
      }
      if (product === 'ecommerce' && !managedIdentity) {
        const { activateLocalEcommerceWorkingSample } = await import('./local-client-import')
        const activated = await activateLocalEcommerceWorkingSample({
          templateId: onboardingTemplate.id as 'social-storefront' | 'pickup-preorder' | 'wholesale-request',
          businessName: setup.workspace,
          capturedAt: new Date().toISOString(),
        })
        if (!activated.ok) throw new Error(activated.error)
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
      // 'preserved' means the catalog was NOT installed, because this device already carries real
      // Shop data worth keeping. Say so plainly instead of dropping the owner into a workspace
      // stocked by a previous business and calling it their new setup.
      if (carriedOver) {
        setNotice('Your existing Shop data was kept and nothing was overwritten. Open Shop to carry on, or reset this device first to load the starter catalog for this trade.')
        return
      }
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
            <details className="compact-disclosure product-onboarding-business-type" onToggle={(event) => setBusinessTypeOpen(event.currentTarget.open)} open={businessTypeOpen}>
              {/* Named after the pack actually selected. This said "Standard retail sample" for
                  every pack, so a spa or school owner -- the ones with no trade template to pick,
                  who are the whole reason this fallback exists -- was told their starter data was
                  retail. Lowercasing keeps the retail wording identical to before. */}
              <summary><span>Business type</span><small>{selectedBusinessTemplate ? `${selectedBusinessTemplate.name.en} starter data` : `Standard ${selectedShopIndustryPack.name.toLowerCase()} sample`}</small></summary>
              {/* The signup page's grouped picker, ported so both doors speak one vocabulary.
                  Trades cover shops that sell goods; a spa, gym or school has no trade template,
                  so the service packs are listed directly -- without them, that owner's only
                  route to their own industry pack was the Settings demo panel, which a real
                  client never opens, and they onboarded onto a retail catalog. */}
              <label className="demo-pack-select">What kind of business?
                <select onChange={(event) => changeBusinessChoice(event.target.value)} value={businessChoiceId}>
                  <option value="">Standard sample (current industry pack)</option>
                  <optgroup label="Shops and trades">
                    {shopBusinessTemplates.map((template) => <option key={template.id} value={`trade:${template.id}`}>{template.name.en} · {template.name.my}</option>)}
                  </optgroup>
                  <optgroup label="Service businesses">
                    {shopIndustryPacks.filter((pack) => servicePackIds.has(pack.id)).map((pack) => <option key={pack.id} value={`pack:${pack.id}`}>{pack.name} · {pack.nameMy}</option>)}
                  </optgroup>
                </select>
                <small>{selectedBusinessTemplate
                  ? `${selectedBusinessTemplate.description} ${selectedBusinessTemplate.catalog.length} starter items with whole-MMK prices and reorder levels.`
                  : `${selectedShopIndustryPack.firstWorkflow} ${selectedShopIndustryPack.description}`}</small>
              </label>
            </details>
          ) : null}
          {/* Plant shipped five industry packs and reached one. plantIndustryPackId was read from
              storage into a setter-less useState and nothing in any product screen wrote it, so
              every Plant workspace anyone could create was general-manufacturing. The other four
              packs -- and the maintenance and quality samples that only they install -- were
              unreachable. Same defect class as the spa having no signup route. */}
          {product === 'production' ? (
            <details className="compact-disclosure product-onboarding-business-type" onToggle={(event) => setPlantTypeOpen(event.currentTarget.open)} open={plantTypeOpen}>
              <summary><span>Plant type</span><small>{selectedPlantIndustryPack.name} starter data</small></summary>
              <label className="demo-pack-select">Type of production
                <select onChange={(event) => setPlantIndustryPackId(event.target.value as PlantIndustryPackId)} value={plantIndustryPackId}>
                  {plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                </select>
                <small>{selectedPlantIndustryPack.firstWorkflow}. {selectedPlantIndustryPack.description}</small>
              </label>
              <ul className="product-onboarding-capabilities">{selectedPlantIndustryPack.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
            </details>
          ) : null}
          <div className="product-onboarding-primary">
            {/* The hint below is the reason the button is disabled. aria-describedby ties them,
                so a screen reader landing on the disabled control hears "Enter a business name
                to continue" instead of an unexplained dead end. */}
            <button aria-describedby="product-onboarding-submit-hint" className="core-button primary" disabled={!workflowReady || workspaceBusy} type="submit">{workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : onboardingJourney.actionLabel}</button>
            <small id="product-onboarding-submit-hint">{workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : workflowReady ? 'Creates local sample records, then opens the first task.' : 'Enter a business name to continue.'}</small>
          </div>
          <p className="product-onboarding-help">This setup affects {onboardingProduct.name} only. Your other products stay separate.</p>
          <p className="product-onboarding-help product-onboarding-connection">{onboardingJourney.connection}</p>
          {partnerConnected ? <p className="product-onboarding-help product-onboarding-peer-ready"><strong>{partnerProductName}</strong> workspace <strong className="product-onboarding-peer-name">{partnerConnected}</strong> is ready to connect.</p> : null}
          {ownerRecordedElsewhere ? <p className="product-onboarding-help product-onboarding-owner-drift"><strong>{productContracts[ownerRecordedElsewhere.product].name}</strong> records <strong className="product-onboarding-peer-name">{ownerRecordedElsewhere.owner}</strong> as accountable, not {accountableOwner}. Update whichever is out of date — each product keeps its own record.</p> : null}
          <p className="product-onboarding-help">Need help bringing real data? <a href={managedTrialRequestUrl(product, onboardingTemplate.id)} onClick={recordGuidedSetupRequest}>Ask SuperMega to set up {onboardingProduct.name}</a>.</p>
          <p aria-live="polite" className="form-notice">{notice || 'Stays on this device. Nothing is sent or published.'}</p>
        </form>
      </div>
    </div>
  )
}
