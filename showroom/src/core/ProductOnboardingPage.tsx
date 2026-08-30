import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { activateLocalWebsiteWorkingSample } from '../products/website/website-starter'
import { recordBehaviorSignal } from './behavior-trail'
import { emitOutcomeTelemetry } from '../analytics/outcome-telemetry'
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
  resolveSetupTemplateDoor,
  resolveSetupVariantDoor,
  seedSetupForProduct,
  templateFor,
  type SetupProductId,
  type SetupState,
} from './product-setup'
import {
  MANAGED_ECOMMERCE_ONBOARDING_HINT,
  MANAGED_ECOMMERCE_ONBOARDING_INTRO,
  MANAGED_ECOMMERCE_ONBOARDING_JOURNEY,
  MANAGED_PLANT_ONBOARDING_HINT,
  MANAGED_PLANT_ONBOARDING_INTRO,
  MANAGED_PLANT_ONBOARDING_JOURNEY,
  MANAGED_SHOP_ONBOARDING_HINT,
  MANAGED_SHOP_ONBOARDING_INTRO,
  MANAGED_SHOP_ONBOARDING_JOURNEY,
  MANAGED_WEBSITE_ONBOARDING_HINT,
  MANAGED_WEBSITE_ONBOARDING_INTRO,
  MANAGED_WEBSITE_ONBOARDING_JOURNEY,
  managedOnboardingAccountCheckPending,
  managedShopOnboardingNotice,
  provisionLocalPlantWorkingSample,
  provisionLocalShopBusinessTemplateSample,
  provisionLocalShopIndustryPack,
  provisionLocalShopWorkingSample,
  readLocalShopIndustryPackId,
} from './product-onboarding-runtime'
import {
  shopBusinessTemplate,
  shopBusinessChoiceFromIndustryPack,
  shopBusinessTemplateManagedCatalogPath,
  shopBusinessTemplateFromQuery,
  shopBusinessTemplates,
} from '../products/shop/business-templates'
import { signupBusinessChoices } from './signup-trial'
import {
  plantIndustryPack,
  plantIndustryPackManagedPlanPath,
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
    detail: 'A storefront and checkout sample are ready. Review the store, then send an order into Shop.',
    actionLabel: 'Create Ecommerce and open the store',
    firstTaskPath: '/ecommerce/',
  },
}

const onboardingFirstRunSteps: Record<SetupProductId, readonly { title: string; detail: string }[]> = {
  commerce: [
    { title: 'Pick your business type', detail: 'Use Beauty spa for the first spa pilot, or choose another Shop starter.' },
    { title: 'Load starter data or import your services/products', detail: 'SuperMega prepares catalog, stock, appointments, and starter sales locally.' },
    { title: 'Take one sale', detail: 'Use Cash, KBZPay, WavePay, AYA Pay, or MMQR at the counter.' },
    { title: 'Reconcile payment and close day', detail: 'Orders, payment status, stock movement, and daily close stay tied together.' },
  ],
  production: [
    { title: 'Pick your plant type', detail: 'Choose the closest production starter before creating anything.' },
    { title: 'Load jobs, materials, quality, and equipment', detail: 'SuperMega prepares one realistic production day.' },
    { title: 'Record one production event', detail: 'Capture output, scrap, issue notes, and owner evidence.' },
    { title: 'Review risk and next action', detail: 'Use the issue, maintenance, and close views to decide what needs attention.' },
  ],
  website: [
    { title: 'Name the business website', detail: 'Start with one clear homepage instead of a blank builder.' },
    { title: 'Preview desktop and mobile', detail: 'Check what a customer sees before editing copy.' },
    { title: 'Adjust sections and lead capture', detail: 'Keep only the useful pages, offers, proof, and contact path.' },
    { title: 'Approve before publishing', detail: 'Publishing stays gated until the owner reviews evidence.' },
  ],
  ecommerce: [
    { title: 'Name the storefront', detail: 'Start from a small product list that can be governed by Shop.' },
    { title: 'Review products and fulfilment', detail: 'Check SKUs, pickup/delivery promise, and payment instructions.' },
    { title: 'Create one customer request', detail: 'Turn storefront demand into a reviewed order path.' },
    { title: 'Send approved orders into Shop', detail: 'Inventory, payment, and support decisions stay connected.' },
  ],
}

export function ProductOnboardingPage({ product }: ProductOnboardingPageProps) {
  const runtime = useOutletContext<RuntimeHealth>()
  const navigate = useNavigate()
  const location = useLocation()
  const [setup, setSetup] = useSetupWorkspace()
  const [actions] = useAccountableActions()
  const [production] = useProductionWorkspace()
  const [managedIdentity, , managedIdentitySettled] = useManagedIdentity(runtime.status === 'enterprise')
  const [notice, setNotice] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [shopIndustryPackId, setShopIndustryPackId] = useState<ShopIndustryPackId>(readLocalShopIndustryPackId)
  const requestedPlantIndustryPackId = useMemo<PlantIndustryPackId | null>(() => {
    const requested = new URLSearchParams(location.search).get('pack')?.trim().toLowerCase()
    return plantIndustryPacks.find((pack) => pack.id === requested)?.id ?? null
  }, [location.search])
  const [savedPlantIndustryPackId] = useState<PlantIndustryPackId>(() => readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
  const [hasSavedPlantSetup] = useState(() => typeof window !== 'undefined' && Boolean(readProductSetup(window.localStorage, 'production')))
  const plantPackDoorSelection = resolveSetupVariantDoor(savedPlantIndustryPackId, requestedPlantIndustryPackId, hasSavedPlantSetup)
  const [plantIndustryPackId, setPlantIndustryPackId] = useState<PlantIndustryPackId>(() => plantPackDoorSelection.activeId)
  const [plantPackChangeSelected, setPlantPackChangeSelected] = useState(false)
  const [plantTypeOpen, setPlantTypeOpen] = useState(() => product === 'production')
  const selectedPlantIndustryPack = plantIndustryPack(plantIndustryPackId)
  const pendingRequestedPlantIndustryPack = product === 'production' && plantPackDoorSelection.choiceRequired && plantPackDoorSelection.requestedId
    ? plantIndustryPack(plantPackDoorSelection.requestedId)
    : null
  // One grouped picker, ported from the signup page so both doors ask the product's first
  // question the same way. A choice is either 'trade:<template>' or 'pack:<industry pack>';
  // the empty string keeps the standard sample on whatever pack this device already carries.
  const [businessChoiceId, setBusinessChoiceId] = useState(() => {
    if (product !== 'commerce') return ''
    const query = new URLSearchParams(location.search)
    const requestedTrade = shopBusinessTemplateFromQuery(query.get('template'))
    if (requestedTrade) return `trade:${requestedTrade}`
    const requestedPack = query.get('pack')?.trim().toLowerCase()
    const pack = shopIndustryPacks.find((candidate) => candidate.id === requestedPack)
    return pack ? shopBusinessChoiceFromIndustryPack(pack.id) : ''
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
  const visiblePackIds = useMemo(() => {
    const ids = new Set(servicePackIds)
    if (businessChoiceId.startsWith('pack:')) ids.add(businessChoiceId.slice('pack:'.length) as ShopIndustryPackId)
    return ids
  }, [businessChoiceId, servicePackIds])
  // Open by default for Shop. It used to open only when a ?template= deep link supplied the
  // answer, so an owner arriving at /settings/?product=shop -- which is how everyone actually
  // arrives -- saw a collapsed summary and completed setup on the default retail catalog. That
  // silently mis-onboarded every spa, gym and school, the exact businesses that have to choose
  // here because they have no trade template to pick.
  const [businessTypeOpen, setBusinessTypeOpen] = useState(() => product === 'commerce')

  const onboardingProduct = productContracts[product]
  const requestedTemplateId = product === 'commerce' ? null : new URLSearchParams(location.search).get('template')
  const templateDoorSelection = resolveSetupTemplateDoor(product, setup, requestedTemplateId)
  const requestedWorkflowTemplate = templateDoorSelection.requestedTemplate ?? templateFor(product, '')
  const pendingRequestedWorkflowTemplate = product !== 'commerce' && templateDoorSelection.choiceRequired
    ? templateDoorSelection.requestedTemplate
    : null
  const selectedBusinessTemplate = product === 'commerce' && businessTemplateId ? shopBusinessTemplate(businessTemplateId) : null
  // Shop and Plant setup for a signed-in company account. Plant packs and generic Shop packs are
  // still device-only. A named Shop trade now has a separate reviewed server activation path;
  // onboarding routes there but does not claim the catalog exists before the owner approves it.
  const managedCommerce = product === 'commerce' && Boolean(managedIdentity)
  const managedProduction = product === 'production' && Boolean(managedIdentity)
  const managedWebsite = product === 'website' && Boolean(managedIdentity)
  const managedEcommerce = product === 'ecommerce' && Boolean(managedIdentity)
  const accountCheckPending = managedOnboardingAccountCheckPending(runtime.status, managedIdentitySettled)
  const managedTemplateJourney = selectedBusinessTemplate ? {
    outcome: `Review the ${selectedBusinessTemplate.name.en} starter catalog`,
    detail: `Check ${selectedBusinessTemplate.catalog.length} items, prices, and opening counts before one server-backed company catalog is created.`,
    actionLabel: 'Continue to catalog review',
  } : MANAGED_SHOP_ONBOARDING_JOURNEY
  const onboardingJourney = managedCommerce
    ? { ...onboardingJourneys[product], ...managedTemplateJourney }
    : managedProduction
      ? { ...onboardingJourneys[product], ...MANAGED_PLANT_ONBOARDING_JOURNEY }
      : managedWebsite
        ? { ...onboardingJourneys[product], ...MANAGED_WEBSITE_ONBOARDING_JOURNEY }
        : managedEcommerce
          ? { ...onboardingJourneys[product], ...MANAGED_ECOMMERCE_ONBOARDING_JOURNEY }
      : onboardingJourneys[product]
  const selectedShopIndustryPack = shopIndustryPack(selectedBusinessTemplate?.industryPackId ?? shopIndustryPackId)
  const onboardingTemplate = product === 'commerce'
    ? setup.product === product
      ? templateFor(product, setup.templateId)
      : templateFor(product, selectedShopIndustryPack.workflowTemplateId)
    : templateDoorSelection.activeTemplate
  // The trade, or the plant type, she actually picked -- named the way each picker names it, so
  // the notice can carry her choice forward instead of dropping it.
  const managedShopBusinessTypeName = selectedBusinessTemplate?.name.en ?? selectedShopIndustryPack.name
  const managedShopIntro = selectedBusinessTemplate
    ? `Name this workspace, then review the ${selectedBusinessTemplate.name.en} starter values before they become company records.`
    : MANAGED_SHOP_ONBOARDING_INTRO
  const managedShopHint = selectedBusinessTemplate
    ? 'Opens a review of the starter catalog. Nothing is created until you confirm its values and source.'
    : MANAGED_SHOP_ONBOARDING_HINT
  const managedIntro = managedCommerce
    ? managedShopIntro
    : managedProduction
      ? MANAGED_PLANT_ONBOARDING_INTRO
      : managedWebsite
        ? MANAGED_WEBSITE_ONBOARDING_INTRO
        : managedEcommerce
          ? MANAGED_ECOMMERCE_ONBOARDING_INTRO
          : 'We will add realistic sample records now; replace them with your data whenever you are ready.'
  const managedHint = managedCommerce
    ? managedShopHint
    : managedProduction
      ? MANAGED_PLANT_ONBOARDING_HINT
      : managedWebsite
        ? MANAGED_WEBSITE_ONBOARDING_HINT
        : managedEcommerce
          ? MANAGED_ECOMMERCE_ONBOARDING_HINT
          : null
  const businessNamePlaceholder = product === 'commerce'
    ? 'Example: Yangon Wellness Spa'
    : product === 'production'
      ? 'Example: Bago Food Production'
      : product === 'website'
        ? 'Example: Mandalay Clinic'
        : 'Example: Yangon Home Store'
  const workspaceOwner = setup.owner.trim() || 'Business owner'
  const workflowReady = setup.product === product
    && Boolean(setup.workspace.trim())
    && !pendingRequestedWorkflowTemplate
    && !pendingRequestedPlantIndustryPack
  const workspaceStarted = workflowReady && Boolean(setup.startedAt) && !(product === 'production' && plantPackChangeSelected)
  // A schedule that predates the current integrity contract is protected, so provisioning must
  // fail closed. The error used to be rendered as one sentence with no action, leaving a new owner
  // unable to finish setup and unable to discover the backup-and-reset controls that can recover
  // the device without silently deleting appointment evidence.
  const appointmentRecoveryRequired = product === 'commerce'
    && notice.startsWith('Saved appointments are unreadable')

  useEffect(() => {
    if (setup.product === product) return undefined
    const template = product === 'commerce'
      ? templateFor(product, selectedShopIndustryPack.workflowTemplateId)
      : requestedWorkflowTemplate
    const selectionTimer = window.setTimeout(() => {
      rememberProductSetup(window.localStorage, setup)
      const saved = readProductSetup(window.localStorage, product)
      setSetup(saved ?? seedSetupForProduct(product, template.id))
      setNotice(saved
        ? `Continue your saved ${onboardingProduct.name} workspace.`
        : `${onboardingProduct.name} is ready. Add only the details needed for this workspace.`)
    }, 0)
    return () => window.clearTimeout(selectionTimer)
  }, [onboardingProduct.name, product, requestedWorkflowTemplate, selectedShopIndustryPack.workflowTemplateId, setSetup, setup])

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

  function clearTemplateDoorQuery() {
    navigate(`/settings/?product=${encodeURIComponent(onboardingProduct.slug)}`, { replace: true })
  }

  function continueSavedTemplate() {
    if (!pendingRequestedWorkflowTemplate) return
    if (product === 'production') {
      setPlantIndustryPackId(readPlantIndustryPackId(typeof window === 'undefined' ? undefined : window.localStorage))
    }
    clearTemplateDoorQuery()
    setNotice(`Continuing the saved ${onboardingTemplate.name} setup. The requested ${pendingRequestedWorkflowTemplate.name} starting point was not applied.`)
  }

  function useRequestedTemplate() {
    if (!pendingRequestedWorkflowTemplate) return
    const requested = pendingRequestedWorkflowTemplate
    setSetup((current) => current.product !== product ? current : {
      ...current,
      templateId: requested.id,
      entryPoint: requested.entryPoints[0] ?? '',
      startedAt: undefined,
      savedAt: undefined,
    })
    clearTemplateDoorQuery()
    setNotice(`${requested.name} is selected for reviewed setup. Existing ${onboardingProduct.name} records were not overwritten; setup will run only after you submit this form.`)
  }

  function continueSavedPlantPack() {
    if (!pendingRequestedPlantIndustryPack) return
    setPlantIndustryPackId(savedPlantIndustryPackId)
    setPlantPackChangeSelected(false)
    clearTemplateDoorQuery()
    setNotice(`Continuing the saved ${plantIndustryPack(savedPlantIndustryPackId).name} Plant type. The requested ${pendingRequestedPlantIndustryPack.name} pack was not applied.`)
  }

  function useRequestedPlantPack() {
    if (!pendingRequestedPlantIndustryPack) return
    const requested = pendingRequestedPlantIndustryPack
    setPlantIndustryPackId(requested.id)
    setPlantPackChangeSelected(true)
    clearTemplateDoorQuery()
    setNotice(`${requested.name} is selected for reviewed setup. Existing Plant records and the saved plant type were not changed; provisioning runs only after you submit this form.`)
  }

  function changePlantIndustryPack(id: PlantIndustryPackId) {
    setPlantIndustryPackId(id)
    setPlantPackChangeSelected(hasSavedPlantSetup && id !== savedPlantIndustryPackId)
  }

  async function startGuidedWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack) {
      setNotice('Choose the saved setup or the requested starting point before continuing.')
      return
    }
    if (accountCheckPending) {
      setNotice('Checking whether this workspace uses a company account.')
      return
    }
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
      // `&& !managedIdentity` mirrors the ecommerce branch below, and the asymmetry between them
      // WAS the bug: these provisioners write to window.localStorage, a store a managed Shop never
      // reads, so for a signed-in owner they reported a trade template as installed while the
      // company workspace stayed at version 0 and rendered 'managed-unprovisioned'. Measured in
      // hq/research/MANAGED-TEMPLATE-PROVISIONING.md -- disposition 'installed', zero fetch calls.
      // A named trade is routed to the reviewed server-backed catalog step below; a generic pack
      // still goes to Shop's one-real-item boundary. Neither browser-local provisioner runs.
      if (product === 'commerce' && !managedIdentity) {
        // Returns the pack ACTUALLY in force. An existing appointment keeps its own pack, so the
        // pack asked for is not always the pack installed, and the sample must follow the real one.
        const schedule = provisionLocalShopIndustryPack(selectedShopIndustryPack.id)
        const disposition = selectedBusinessTemplate
          ? await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
          : await provisionLocalShopWorkingSample(schedule.industryPackId, onboardingTemplate.id)
        carriedOver = disposition === 'preserved'
      }
      // The twin of the commerce guard above, and the same defect: mutateProductionWorkingSample
      // is window.localStorage, which a managed Plant never reads. Re-measured the same way before
      // this guard was added -- disposition 'installed', zero fetch calls, across all five plant
      // packs -- while the company workspace stayed at version 0 and ProductionPage rendered
      // 'managed-unprovisioned'. See managedPlantOnboardingNotice in product-onboarding-runtime.ts.
      if (product === 'production' && !managedIdentity) {
        await provisionLocalPlantWorkingSample(plantIndustryPackId, onboardingTemplate.id, workspaceOwner)
      }
      // Save the reviewed device preference only after local provisioning succeeds. A rejected
      // or failed pack request must leave both the production record and the retained Plant type
      // untouched. Managed Plant has no local sample write, but still saves this device preference
      // after the owner submits the same reviewed form.
      if (product === 'production') {
        savePlantIndustryPackId(plantIndustryPackId, window.localStorage)
        setPlantPackChangeSelected(false)
      }
      if (product === 'website' && !managedIdentity) {
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
          const checkpoint = startPilotOutcome(window.localStorage, {
            product,
            workspace: setup.workspace,
            owner: workspaceOwner,
            templateId: onboardingTemplate.id,
          }, metric, new Date(startedAt))
          emitOutcomeTelemetry({
            pilotProduct: product,
            stage: 'workflow_started',
            evidenceDigest: checkpoint.checkpointDigest,
          })
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
      // Same shape as the 'preserved' case above, and for the same reason: nothing was installed,
      // so say so here rather than letting a navigation stand in for a claim. The workspace is now
      // started, which relabels the button to "Open my Shop" / "Open my Plant", so each notice's
      // "Open Shop" / "Open Plant" is the button she is already looking at -- routed onward, not
      // stuck.
      if (managedCommerce) {
        if (selectedBusinessTemplate) {
          navigate(shopBusinessTemplateManagedCatalogPath(selectedBusinessTemplate.id))
          return
        }
        setNotice(managedShopOnboardingNotice(managedShopBusinessTypeName))
        return
      }
      if (managedProduction) {
        navigate(plantIndustryPackManagedPlanPath(plantIndustryPackId))
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

  async function recoverUnreadableAppointments() {
    if (workspaceBusy) return
    setWorkspaceBusy(true)
    try {
      const [{ downloadBlob }, {
        clearUnreadableShopSchedule,
        prepareUnreadableShopScheduleRecovery,
      }] = await Promise.all([
        import('./download-file'),
        import('./shop-recover'),
      ])
      const recovery = prepareUnreadableShopScheduleRecovery(window.localStorage)
      downloadBlob(
        recovery.filename,
        new Blob([`${JSON.stringify(recovery.backup, null, 2)}\n`], { type: 'application/json' }),
      )
      clearUnreadableShopSchedule(window.localStorage, recovery.raw)
      setNotice('Workspace backup downloaded. Unreadable appointments were cleared; create Shop again to load the Spa starter data.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Appointment recovery could not be completed. Nothing was cleared.')
    } finally {
      setWorkspaceBusy(false)
    }
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
          <div className="product-onboarding-intro"><span className="core-eyebrow">One step</span><h2>Name your workspace</h2><p>{accountCheckPending ? 'Checking whether this is a company workspace before preparing anything.' : managedIntro}</p></div>
          <p className="product-onboarding-boundary"><strong>First useful result: {onboardingJourney.outcome}.</strong><br />{onboardingJourney.detail}</p>
          <ol aria-label={`${onboardingProduct.name} first-run path`} className="product-onboarding-path">
            {onboardingFirstRunSteps[product].map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <p><strong>{step.title}</strong>{step.detail}</p>
              </li>
            ))}
          </ol>
          {pendingRequestedWorkflowTemplate ? (
            <section aria-label="Template starting-point choice" className="product-onboarding-proof">
              <div>
                <span className="core-eyebrow">Saved setup protected</span>
                <h3>Choose which starting point to continue</h3>
                <p>This device has {onboardingTemplate.name} saved. The public door requested {pendingRequestedWorkflowTemplate.name}. Nothing has changed yet.</p>
              </div>
              <div className="actions">
                <button className="core-button" onClick={continueSavedTemplate} type="button">Continue saved {onboardingTemplate.name}</button>
                <button className="core-button primary" onClick={useRequestedTemplate} type="button">Use {pendingRequestedWorkflowTemplate.name} for reviewed setup</button>
              </div>
              <p>Both choices preserve existing product records. Loading different sample data still requires the reviewed setup action below and may fail closed when existing records cannot be replaced safely.</p>
            </section>
          ) : null}
          {pendingRequestedPlantIndustryPack ? (
            <section aria-label="Plant type choice" className="product-onboarding-proof">
              <div>
                <span className="core-eyebrow">Saved Plant type protected</span>
                <h3>Choose which Plant type to continue</h3>
                <p>This device has {plantIndustryPack(savedPlantIndustryPackId).name} saved. The public door requested {pendingRequestedPlantIndustryPack.name}. Nothing has changed yet.</p>
              </div>
              <div className="actions">
                <button className="core-button" onClick={continueSavedPlantPack} type="button">Continue saved {plantIndustryPack(savedPlantIndustryPackId).name}</button>
                <button className="core-button primary" onClick={useRequestedPlantPack} type="button">Use {pendingRequestedPlantIndustryPack.name} for reviewed setup</button>
              </div>
              <p>No Plant record or saved plant type changes until the requested pack is explicitly selected and the setup form is submitted.</p>
            </section>
          ) : null}
          {product === 'commerce' ? (
            <section aria-label="Shop pilot proof rule" className="product-onboarding-proof">
              <div>
                <span className="core-eyebrow">Pilot proof</span>
                <h3>Run one day before adding modules</h3>
                <p>Spa services vertical pack: package sale, treatment redemption, invalid redemption refusal, daily close, then reload check.</p>
              </div>
              <ul>
                <li><strong>20</strong><span>accepted order-to-close runs</span></li>
                <li><strong>5</strong><span>daily closes observed</span></li>
                <li><strong>0</strong><span>unexplained payment or stock changes</span></li>
              </ul>
              <p>Paid pilot only after the owner can name faster close, fewer package mistakes, or clearer payment reconciliation.</p>
            </section>
          ) : null}
          <label className="product-onboarding-business-name">Business name<input autoComplete="organization" maxLength={60} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={businessNamePlaceholder} required value={setup.workspace} /></label>
          {product === 'commerce' ? (
            <details className="compact-disclosure product-onboarding-business-type" onToggle={(event) => setBusinessTypeOpen(event.currentTarget.open)} open={businessTypeOpen}>
              {/* Named after the pack actually selected. This said "Standard retail sample" for
                  every pack, so a spa or school owner -- the ones with no trade template to pick,
                  who are the whole reason this fallback exists -- was told their starter data was
                  retail. */}
              <summary><span>Business type</span><small>{selectedBusinessTemplate ? `${selectedBusinessTemplate.name.en} starter data` : `${selectedShopIndustryPack.name} starter sample`}</small></summary>
              {/* The signup page's grouped picker, ported so both doors speak one vocabulary.
                  Trades cover shops that sell goods; a spa, gym or school has no trade template,
                  so the service packs are listed directly -- without them, that owner's only
                  route to their own industry pack was the Settings demo panel, which a real
                  client never opens, and they onboarded onto a retail catalog. */}
              <label className="demo-pack-select">What kind of business?
                <select onChange={(event) => changeBusinessChoice(event.target.value)} value={businessChoiceId}>
                  <option value="">Use the current starter sample</option>
                  <optgroup label="Shops and trades">
                    {shopBusinessTemplates.map((template) => <option key={template.id} value={`trade:${template.id}`}>{template.name.en} · {template.name.my}</option>)}
                  </optgroup>
                  <optgroup label="Service businesses">
                    {shopIndustryPacks.filter((pack) => visiblePackIds.has(pack.id)).map((pack) => <option key={pack.id} value={`pack:${pack.id}`}>{pack.name} · {pack.nameMy}</option>)}
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
                <select disabled={Boolean(pendingRequestedPlantIndustryPack)} onChange={(event) => changePlantIndustryPack(event.target.value as PlantIndustryPackId)} value={plantIndustryPackId}>
                  {plantIndustryPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                </select>
                <small>{selectedPlantIndustryPack.firstWorkflow}. {selectedPlantIndustryPack.description}</small>
              </label>
            </details>
          ) : null}
          <div className="product-onboarding-primary">
            {/* The hint below is the reason the button is disabled. aria-describedby ties them,
                so a screen reader landing on the disabled control hears "Enter a business name
                to continue" instead of an unexplained dead end. */}
            <button aria-describedby="product-onboarding-submit-hint" className="core-button primary" disabled={!workflowReady || workspaceBusy || accountCheckPending} type="submit">{accountCheckPending ? 'Checking company account...' : workspaceBusy ? 'Preparing your workspace...' : workspaceStarted ? `Open my ${onboardingProduct.name}` : onboardingJourney.actionLabel}</button>
            <small id="product-onboarding-submit-hint">{pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack ? 'Choose the saved setup or requested starting point first.' : accountCheckPending ? 'Setup stays paused until account access is known.' : managedHint && workflowReady ? managedHint : workspaceStarted ? `${setup.workspace} is ready. Opening it will not run setup again.` : workflowReady ? 'Creates local sample records, then opens the first task.' : 'Enter a business name to continue.'}</small>
          </div>
          <p className="product-onboarding-help">This setup affects {onboardingProduct.name} only. Your other products stay separate.</p>
          <p className="product-onboarding-help">Need help bringing real data? <a href={managedTrialRequestUrl(product, onboardingTemplate.id)} onClick={recordGuidedSetupRequest}>Ask SuperMega to set up {onboardingProduct.name}</a>.</p>
          {appointmentRecoveryRequired ? (
            <div aria-live="assertive" className="product-onboarding-recovery" role="alert">
              <p>{notice}</p>
              <p>This downloads a full local workspace backup, then removes only the unreadable appointment record. Valid or changed appointments are never cleared.</p>
              <button className="core-button" disabled={workspaceBusy} onClick={recoverUnreadableAppointments} type="button">{workspaceBusy ? 'Preparing recovery...' : 'Download backup and clear appointments'}</button>
              <Link to="/settings/#workspace-recovery">Review all recovery options</Link>
            </div>
          ) : <p aria-live="polite" className="form-notice">{notice || (accountCheckPending ? 'Checking account access before setup.' : managedIdentity ? 'Uses this company account. Nothing is published or sent externally.' : 'Stays on this device. Nothing is sent or published.')}</p>}
        </form>
      </div>
    </div>
  )
}
