import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import { getCurrentPublish, loadWebsiteWorkspace } from '../products/website/website-model'
import { COMMERCE_KEY, LEGACY_COMMERCE_KEYS } from './commerce-workspace'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  collectLocalProductRecords,
  LEGACY_APPROVAL_KEYS,
  LEGACY_SETUP_KEYS,
  LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  LEGACY_STOREFRONT_DRAFT_RESET_PREFIX,
  managedTrialRequestUrl,
  mergeManagedApprovals,
  PageHeading,
  pilotProgress,
  pilotReady,
  productContracts,
  productDisplayName,
  RuntimeBadge,
  SETUP_KEY,
  setupProductFromQuery,
  setupProductPreviewPath,
  SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
  SHOP_ORDER_DRAFT_RESET_PREFIX,
  STOREFRONT_DRAFT_RESET_PREFIX,
  templateFor,
  templatesFor,
  toManagedApprovalRequest,
  useAccountableActions,
  useApprovalWorkspace,
  useCommerceWorkspace,
  useManagedIdentity,
  useProductionWorkspace,
  useSetupWorkspace,
  type RuntimeHealth,
  type SetupState,
  type SetupProductId,
} from './CoreApp'
import {
  currentManagedWorkspace,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  signInManagedTrial,
  signOutManagedTrial,
} from './managed-trial'
import { LEGACY_PRODUCTION_KEYS, PRODUCTION_KEY } from './production-workspace'
import { formatTime, LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY, useTeamWorkspace } from './team-work'
import {
  buildClientDemoBlueprint,
  buildClientDemoRunbook,
  CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
  clientDemoPresets,
  clientImportWorkflowTemplateIds,
  createClientDemoWorkspace,
  restoreClientDemoWorkspace,
  updateClientDemoWorkspaceProgress,
  type ClientDemoBlueprint,
  type ClientDemoProductProgress,
  type ClientDemoPresetId,
  type ClientDemoWorkspace,
} from './client-onboarding'
import { projectPlantOrder } from './plant-order-foundation'

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ManagedActivationRunbook = lazy(() => import('./ManagedActivationRunbook').then((module) => ({ default: module.ManagedActivationRunbook })))

function loadClientDemoWorkspace() {
  if (typeof window === 'undefined') return null
  try { return restoreClientDemoWorkspace(JSON.parse(window.localStorage.getItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY) || 'null')) } catch { return null }
}

const demoProgressLabels: Record<ClientDemoProductProgress['status'], string> = {
  not_started: 'Not started',
  needs_fix: 'Needs fixes',
  data_ready: 'Data ready',
  workspace_checked: 'Workspace checked',
  applied: 'Applied',
}

const demoRunbookLabels = {
  prepare_data: 'Prepare data',
  needs_fix: 'Fix data',
  ready_to_run: 'Ready to run',
  proven: 'Evidence proven',
} as const

export function SettingsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [setupSearchParams] = useSearchParams()
  const [setup, setSetup] = useSetupWorkspace()
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [actions] = useAccountableActions()
  const [teamWorkspace] = useTeamWorkspace()
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [settingsStep, setSettingsStep] = useState<'workflow' | 'success'>('workflow')
  const [managedIdentity, setManagedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [managedEmail, setManagedEmail] = useState('')
  const [managedPassword, setManagedPassword] = useState('')
  const [managedWorkspace, setManagedWorkspace] = useState(currentManagedWorkspace())
  const [managedNotice, setManagedNotice] = useState('')
  const [managedBusy, setManagedBusy] = useState(false)
  const [demoWorkspace, setDemoWorkspace] = useState<ClientDemoWorkspace | null>(loadClientDemoWorkspace)
  const [demoPresetId, setDemoPresetId] = useState<ClientDemoPresetId>(() => demoWorkspace?.blueprint.client.presetId ?? 'social-seller')
  const [demoSelections, setDemoSelections] = useState<Partial<Record<SetupProductId, string>>>(() => Object.fromEntries((demoWorkspace?.blueprint.products ?? clientDemoPresets[0].selections).map((selection) => [selection.product, selection.templateId])))
  const [demoBlueprint, setDemoBlueprint] = useState<ClientDemoBlueprint | null>(() => demoWorkspace?.blueprint ?? null)
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const requestedProduct = setupProductFromQuery(setupSearchParams.get('product'))
  const selectedDemoEntries = Object.entries(demoSelections).filter((entry): entry is [SetupProductId, string] => Boolean(entry[1]))
  const workflowReady = requestedProduct
    ? Boolean(setup.workspace.trim() && setup.owner.trim() && setup.entryPoint.trim())
    : Boolean(setup.workspace.trim() && setup.owner.trim() && selectedDemoEntries.length)
  const workflowCompletion = requestedProduct
    ? Math.round(([setup.templateId, setup.entryPoint, setup.workspace.trim(), setup.owner.trim()].filter(Boolean).length / 4) * 100)
    : Math.round(([setup.workspace.trim(), setup.owner.trim(), selectedDemoEntries.length ? 'products' : ''].filter(Boolean).length / 3) * 100)
  const displayedCompletion = settingsStep === 'workflow' ? workflowCompletion : completion
  const displayedReady = settingsStep === 'workflow' ? workflowReady : isPilotReady
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const demoBlueprintFilename = `supermega-client-demo-${setup.workspace.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || evidenceDate}.json`
  const demoBlueprintHref = demoBlueprint ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ ...demoBlueprint, exportedAt: new Date().toISOString() }, null, 2))}` : ''
  const demoReadyCount = demoWorkspace?.products.filter((product) => ['data_ready', 'workspace_checked', 'applied'].includes(product.status)).length ?? 0
  const plantReleasedBatches = (() => {
    try { return production.orderExecution && projectPlantOrder(production.orderExecution).status === 'released_to_stock' ? 1 : 0 } catch { return 0 }
  })()
  const approvedWebsiteReleases = (() => {
    const loaded = loadWebsiteWorkspace(window.localStorage)
    return loaded.ok && getCurrentPublish(loaded.workspace) ? 1 : 0
  })()
  const demoRunbook = demoWorkspace ? buildClientDemoRunbook(demoWorkspace, {
    commerce: {
      completedOrders: commerce.orders.filter((order) => order.status === 'completed').length,
      reconciledOrders: commerce.orders.filter((order) => order.paymentStatus === 'reconciled').length,
    },
    production: { releasedBatches: plantReleasedBatches },
    website: { approvedReleases: approvedWebsiteReleases },
    ecommerce: {
      savedStorefronts: commerce.storefrontConfiguration ? 1 : 0,
      reviewedRequests: commerce.storefrontRequests?.length ?? 0,
    },
  }) : null
  const nextDemoMission = demoRunbook?.products.find((product) => product.product === demoRunbook.nextProduct) ?? null
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const localRecordCount = Object.keys(localProductRecords).length
  const learningRows = [
    ['Data', localRecordCount ? `${localRecordCount} records` : 'Import'],
    ['Trust', `${runtime.coverageScore}%`],
    ['Review', `${managedApprovalRequests.length || approvals.length} packets`],
    ['AI', runtime.enterpriseDbReady && runtime.writesReady ? 'Ready' : 'Locked'],
  ] as const
  const learningPlanRows = [
    ['Source graph', localRecordCount ? `${localRecordCount} local records prepared` : 'No local records yet', localRecordCount ? 'Exported evidence keeps the browser-local source package for managed validation.' : 'Use Shop, Plant, Website, Ecommerce, or import setup to create the first record.'],
    ['Behavior trail', actions.length ? `${actions.length} accountable actions` : 'No accountable actions yet', actions.length ? 'Premium can rank next actions from reviewed operator behavior after import.' : 'Use the product sample so the system can capture local action history.'],
    ['Decision memory', managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} review packets` : 'No review packets yet', managedApprovalRequests.length || approvals.length ? 'Human approvals become reusable context after managed activation.' : 'Approve or decline at least one prepared decision before relying on AI context.'],
    ['Owner gate', isPilotReady ? 'Ready for managed review' : `${completion}% trial evidence`, isPilotReady ? 'Export evidence, then request managed trial; writes stay locked until server controls pass.' : 'Complete baseline, target, authority boundary, and acceptance evidence first.'],
  ] as const
  const activationRows: Array<readonly [string, string]> = [
    ['Trial', isPilotReady ? 'Ready' : `${completion}%`],
    ['Runtime', runtime.serviceStatus],
    ['Mode', runtime.operatingMode.replace('_', ' ')],
    ...(runtime.activationSteps.length
      ? runtime.activationSteps.map((step) => [step.label, step.ready ? 'Ready' : 'Needed'] as const)
      : [
        ['Database', runtime.enterpriseDbReady ? 'Ready' : 'Needed'] as const,
        ['Identity', runtime.authReady ? 'Ready' : 'Needed'] as const,
        ['Audit', runtime.auditReady ? 'Ready' : 'Needed'] as const,
        ['Writes', runtime.writesReady ? 'Ready' : 'Needed'] as const,
      ]),
    ['Coverage', `${runtime.coverageScore}%`],
  ]
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 13, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords, activationRows, activationSteps: runtime.activationSteps, activationEvidencePlan: runtime.evidencePlan, learningRows, learningPlanRows }, null, 2))}`

  useEffect(() => {
    if (!requestedProduct || requestedProduct === setup.product) return
    const template = templateFor(requestedProduct, '')
    const selectionTimer = window.setTimeout(() => {
      setSetup((current) => ({
        ...current,
        product: requestedProduct,
        templateId: template.id,
        entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
        startedAt: undefined,
        savedAt: undefined,
      }))
      setSettingsStep('workflow')
      setNotice(`Selected ${productDisplayName(requestedProduct)}. Your client details were kept.`)
    }, 0)
    return () => window.clearTimeout(selectionTimer)
  }, [requestedProduct, setSetup, setup.product])

  useEffect(() => {
    try {
      if (demoWorkspace) window.localStorage.setItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(demoWorkspace))
      else window.localStorage.removeItem(CLIENT_DEMO_WORKSPACE_STORAGE_KEY)
    } catch {
      setNotice('This browser could not save the client workspace. The current setup remains open for this session.')
    }
  }, [demoWorkspace])

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => ({ ...current, ...patch, savedAt: undefined }))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function chooseDemoPreset(presetId: ClientDemoPresetId) {
    const preset = clientDemoPresets.find((candidate) => candidate.id === presetId) ?? clientDemoPresets[0]
    setDemoPresetId(preset.id)
    setDemoSelections(Object.fromEntries(preset.selections.map((selection) => [selection.product, selection.templateId])))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
    setNotice(`${preset.name} modules selected. Adjust products only if this client needs a different operating loop.`)
  }

  function toggleDemoProduct(product: SetupProductId) {
    setDemoSelections((current) => {
      const next = { ...current }
      if (next[product]) delete next[product]
      else next[product] = clientImportWorkflowTemplateIds(product)[0]
      return next
    })
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function changeDemoTemplate(product: SetupProductId, templateId: string) {
    setDemoSelections((current) => ({ ...current, [product]: templateId }))
    setDemoBlueprint(null)
    setDemoWorkspace(null)
  }

  function configureDemoProduct(product: SetupProductId, templateId: string, openProduct: boolean) {
    const template = templateFor(product, templateId)
    setSetup((current) => ({
      ...current,
      product,
      templateId: template.id,
      entryPoint: template.entryPoints[0] ?? '',
      startedAt: openProduct ? new Date().toISOString() : current.startedAt,
      savedAt: undefined,
    }))
    if (openProduct) navigate(setupProductPreviewPath(product))
    else setNotice(`${productDisplayName(product)} is selected below. Add client data or try the prepared sample.`)
  }

  function prepareDemoProduct(product: SetupProductId, templateId: string) {
    configureDemoProduct(product, templateId, false)
    window.requestAnimationFrame(() => document.getElementById('client-data-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function createDemoKit() {
    try {
      const blueprint = buildClientDemoBlueprint({
        workspace: setup.workspace,
        owner: setup.owner,
        presetId: demoPresetId,
        selections: selectedDemoEntries.map(([product, templateId]) => ({ product, templateId })),
      })
      setDemoBlueprint(blueprint)
      setDemoWorkspace(createClientDemoWorkspace(blueprint, new Date().toISOString()))
      const first = blueprint.products[0]
      if (first) configureDemoProduct(first.product, first.templateId, false)
      setNotice(`${blueprint.products.length}-product demo kit ready. Prepare data or open a product.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The client demo kit could not be prepared.')
    }
  }

  function recordDemoProductProgress(progress: ClientDemoProductProgress) {
    setDemoWorkspace((current) => {
      const previous = current?.products.find((product) => product.product === progress.product)
      if (!current || !previous) return current
      if (previous.status === progress.status && previous.rows === progress.rows && previous.readyRows === progress.readyRows && previous.issueRows === progress.issueRows) return current
      try { return updateClientDemoWorkspaceProgress(current, progress, new Date().toISOString()) } catch { return current }
    })
  }

  function chooseSettingsStep(step: 'workflow' | 'success') {
    setSettingsStep(step)
    if (location.hash) navigate('/settings/', { replace: true })
  }

  function changeTemplate(templateId: string) {
    const template = templateFor(setup.product, templateId)
    updateSetup({ templateId: template.id, entryPoint: template.entryPoints.includes(setup.entryPoint) ? setup.entryPoint : template.entryPoints[0] ?? '', startedAt: undefined })
  }

  function startGuidedTrial() {
    if (!workflowReady) {
      setNotice('Name the trial workspace and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    const startedAt = new Date().toISOString()
    setSetup((current) => ({ ...current, startedAt }))
    navigate(setupProductPreviewPath(setup.product))
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!workflowReady) {
      setNotice('Complete the workflow name and responsible owner first.')
      chooseSettingsStep('workflow')
      return
    }
    const savedAt = new Date().toISOString()
    setSetup((current) => ({ ...current, startedAt: current.startedAt || savedAt, savedAt }))
    setNotice('Trial plan saved locally. No external action was connected.')
  }

  async function resetDemoWorkspace() {
    setResetBusy(true)
    try {
      const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')
      await resetCommerceOrderDraftRecovery()
      const retainedKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
          || key?.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)
          || key?.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)))
      ;[
        COMMERCE_KEY,
        PRODUCTION_KEY,
        APPROVAL_KEY,
        SETUP_KEY,
        ACTION_KEY,
        SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
        TEAM_WORK_KEY,
        WEBSITE_STORAGE_KEY,
        LEGACY_WEBSITE_STORAGE_KEY,
        WEBSITE_ECOMMERCE_HANDOFF_KEY,
        CLIENT_DEMO_WORKSPACE_STORAGE_KEY,
        LEGACY_STOREFRONT_DRAFT_RESET_KEY,
        ...retainedKeys,
        ...LEGACY_TEAM_WORK_KEYS,
        ...LEGACY_COMMERCE_KEYS,
        ...LEGACY_PRODUCTION_KEYS,
        ...LEGACY_APPROVAL_KEYS,
        ...LEGACY_SETUP_KEYS,
      ].forEach((key) => window.localStorage.removeItem(key))
      window.location.assign('/')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The local trial could not be reset safely.')
      setResetBusy(false)
    }
  }

  async function connectManagedWorkspace(event: FormEvent) {
    event.preventDefault()
    setManagedBusy(true)
    setManagedNotice('Checking workspace membership...')
    try {
      const identity = await signInManagedTrial(managedEmail, managedPassword, managedWorkspace)
      setManagedIdentity(identity)
      setManagedPassword('')
      try {
        const bootstrap = await loadManagedBootstrap(identity)
        setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
        setManagedNotice(`Connected to ${identity.workspaceId}. Managed approvals are ready.`)
      } catch (workspaceError) {
        setManagedNotice(workspaceError instanceof Error ? workspaceError.message : 'Signed in, but this workspace is not ready.')
      }
    } catch (error) {
      setManagedNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setManagedBusy(false)
    }
  }

  async function disconnectManagedWorkspace() {
    setManagedBusy(true)
    await signOutManagedTrial()
    setManagedIdentity(null)
    setApprovals((current) => current.filter((approval) => !approval.managed))
    setManagedNotice('Managed account disconnected.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow={requestedProduct ? 'Guided trial' : 'Internal demo builder'} title={requestedProduct ? `Set up ${selectedProduct.name}` : 'Set up one client. Open the whole system.'} copy={requestedProduct ? 'Name the client, choose one workflow, and prepare their data.' : 'Choose a business type once. SuperMega prepares the connected products, templates, data checklists, and demo links.'} />
      <nav aria-label="Setup steps" className="settings-step-nav">
        <button aria-current={settingsStep === 'workflow' ? 'step' : undefined} onClick={() => chooseSettingsStep('workflow')} type="button"><span>1</span>{requestedProduct ? 'Template' : 'Demo kit'}</button>
        <button aria-current={settingsStep === 'success' ? 'step' : undefined} onClick={() => chooseSettingsStep('success')} type="button"><span>2</span>Trial plan</button>
      </nav>
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">{requestedProduct ? 'One product' : 'Client system'}</span><h2>{settingsStep === 'workflow' ? requestedProduct ? 'Choose the trial' : 'Build the demo kit' : 'Define success'}</h2></div><span className={`status-pill ${displayedReady ? 'approved' : 'bounded'}`}>{displayedReady ? 'ready' : `${displayedCompletion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${displayedCompletion}%` }} /></div><small>{settingsStep === 'workflow' ? requestedProduct ? 'Template - owner' : 'Client - products - data' : 'Record - target - evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          {requestedProduct ? <div className="setup-selected-product"><span><small>Selected product</small><strong>{selectedProduct.name}</strong></span><Link className="text-link" to="/settings/">Build full demo kit</Link></div> : null}
          <div className="form-row"><label>Client or workspace name<input maxLength={60} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder="Example: Golden Valley Trading" /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          {requestedProduct ? <>
            <div className="form-row"><label>Workflow<select value={setup.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Current starting point<select value={setup.entryPoint} onChange={(event) => updateSetup({ entryPoint: event.target.value })}>{selectedTemplate.entryPoints.map((entryPoint) => <option key={entryPoint}>{entryPoint}</option>)}</select></label></div>
            <div className="setup-template-summary"><div><span>Outcome</span><strong>{selectedTemplate.outcome}</strong></div><ol aria-label={`${selectedTemplate.name} workflow`}>{selectedTemplate.workflow.map((step) => <li key={step}>{step}</li>)}</ol><small>Measure success with {selectedTemplate.metric.toLowerCase()}.</small></div>
          </> : <>
            <div aria-label="Choose client business type" className="demo-preset-grid" role="group">{clientDemoPresets.map((preset) => <button aria-pressed={demoPresetId === preset.id} key={preset.id} onClick={() => chooseDemoPreset(preset.id)} type="button"><strong>{preset.name}</strong><small>{preset.description}</small></button>)}</div>
            <div><span className="core-eyebrow">Products and workflows</span><p className="panel-copy">Keep only what this client will actually use. Every selected product shares the client name and owner.</p></div>
            <div aria-label="Choose products for the client demo" className="demo-solution-grid">{Object.values(productContracts).map((product) => {
              const templateId = demoSelections[product.id]
              return <section className="demo-solution-card" data-selected={Boolean(templateId)} key={product.id}>
                <label><input checked={Boolean(templateId)} onChange={() => toggleDemoProduct(product.id)} type="checkbox" /><span><strong>{product.name}</strong><small>{product.headline}</small></span></label>
                {templateId ? <select aria-label={`${product.name} workflow`} onChange={(event) => changeDemoTemplate(product.id, event.target.value)} value={templateId}>{templatesFor(product.id).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select> : <small>Not included in this demo.</small>}
              </section>
            })}</div>
            <div className="settings-step-actions"><span>Creates a local setup package. No client data is sent.</span><button className="core-button primary" disabled={!workflowReady} onClick={createDemoKit} type="button">Build client demo kit</button></div>
            {demoBlueprint ? <section aria-label="Client demo kit" className="demo-kit-result">
              <div className="panel-head"><div><span className="core-eyebrow">Client workspace</span><h3>{demoBlueprint.client.workspace}</h3><p>{demoRunbook?.provenCount ?? 0} proven · {demoReadyCount} data-ready · owner {demoBlueprint.client.owner}</p></div><a className="core-button" download={demoBlueprintFilename} href={demoBlueprintHref}>Download setup kit</a></div>
              {demoBlueprint.integrations.length ? <ol className="demo-integration-flow">{demoBlueprint.integrations.map((integration) => <li key={`${integration.from}-${integration.to}`}><strong>{productDisplayName(integration.from)} → {productDisplayName(integration.to)}</strong><span>{integration.outcome}</span></li>)}</ol> : <p className="form-notice">This demo has one standalone product.</p>}
              {nextDemoMission ? <div className="demo-next-mission"><div><span className="core-eyebrow">Do this next</span><strong>{nextDemoMission.label}: {nextDemoMission.scenario}</strong><small>{nextDemoMission.status === 'ready_to_run' ? nextDemoMission.evidenceRequirement : 'Prepare clean client data, then run the real workflow.'}</small></div>{nextDemoMission.status === 'prepare_data' || nextDemoMission.status === 'needs_fix' ? <button className="core-button primary" onClick={() => prepareDemoProduct(nextDemoMission.product, demoBlueprint.products.find((product) => product.product === nextDemoMission.product)?.templateId ?? '')} type="button">{nextDemoMission.actionLabel}</button> : <Link className="core-button primary" to={nextDemoMission.actionPath}>{nextDemoMission.actionLabel}</Link>}</div> : <div className="demo-next-mission complete"><div><span className="core-eyebrow">Demo evidence complete</span><strong>All selected product missions are proven.</strong><small>Export the setup kit and use the recorded product evidence for the client review.</small></div></div>}
              <div className="demo-runbook-products">{demoRunbook?.products.map((mission, index) => {
                const blueprintProduct = demoBlueprint.products.find((product) => product.product === mission.product)
                const statusClass = mission.status === 'proven' ? 'approved' : mission.status === 'needs_fix' ? 'pending' : 'bounded'
                return <details data-status={mission.status} key={mission.product}><summary><span><small>Mission {index + 1} · {templateFor(mission.product, blueprintProduct?.templateId ?? '').name}</small><strong>{mission.label}: {mission.scenario}</strong></span><span className={`status-pill ${statusClass}`}>{demoRunbookLabels[mission.status]}</span></summary><div><ol>{mission.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="demo-proof-contract"><small>Required proof</small><strong>{mission.evidenceRequirement}</strong><em>Observed: {mission.evidenceObserved} · data {demoProgressLabels[mission.importStatus].toLowerCase()}</em></div>{mission.status === 'prepare_data' || mission.status === 'needs_fix' ? <button className="core-button" onClick={() => prepareDemoProduct(mission.product, blueprintProduct?.templateId ?? '')} type="button">{mission.actionLabel}</button> : <Link className="core-button" to={mission.actionPath}>{mission.actionLabel}</Link>}</div></details>
              })}</div>
            </section> : null}
          </>}
          {requestedProduct || demoBlueprint ? <section className="demo-data-setup" id="client-data-setup"><div><span className="core-eyebrow">Client data</span><h3>Prepare {selectedProduct.name}</h3><p>Try the safe sample now or drop in the client's matching CSV for review.</p></div><Suspense fallback={<p className="form-notice" role="status">Loading the client data template...</p>}><ClientDataOnboarding managedIdentity={managedIdentity} onProgress={recordDemoProductProgress} owner={setup.owner} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense></section> : null}
          <div className="settings-step-actions"><span>{requestedProduct ? 'Sample first. Plan when needed.' : 'Add measurable success criteria after the demo kit is ready.'}</span><div className="setup-action-group"><button className="text-link" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Add trial plan</button>{requestedProduct ? <button className="core-button primary" disabled={!workflowReady} onClick={startGuidedTrial} type="button">Start guided sample</button> : null}</div></div>
          </fieldset>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'success'} hidden={settingsStep !== 'success'}>
          <div className="template-contract settings-workflow-summary"><span>{productDisplayName(setup.product)}</span><strong>{setup.workspace || 'Unnamed workspace'}</strong><small>{selectedTemplate.name} - {setup.owner || 'Owner needed'}</small></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="Chat, paper, sheet, system, or log." /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which actions need owner approval?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What proves the pilot works?" /></label></div>
          <div className="settings-step-actions"><button className="text-link" onClick={() => chooseSettingsStep('workflow')} type="button">Back</button><button className="core-button primary" type="submit">Save client setup</button></div>
          {setup.savedAt ? <div className="setup-complete"><div><strong>Trial plan saved.</strong><small>Export evidence before managed import.</small></div><div className="setup-complete-actions"><Link className="core-button" to={setupProductPreviewPath(setup.product)}>Open {productDisplayName(setup.product)}</Link><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a><a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id)}>Request managed trial</a></div></div> : null}
          </fieldset>
          <p className="form-notice" aria-live="polite">{notice || (setup.savedAt ? `Last saved ${formatTime(setup.savedAt)}` : setup.startedAt ? `Guided ${selectedTemplate.name} sample started.` : 'Draft stays local.')}</p>
        </form>
      </div>
      <details className="settings-advanced" id="controls" open={location.hash === '#controls' || undefined}>
        <summary><span>Advanced controls</span><small>Security, evidence, reset</small></summary>
        <div className="settings-advanced-content">
          <section className="core-panel system-boundary-panel">
            <div className="panel-head"><div><span className="core-eyebrow">System boundary</span><h2>{runtime.status === 'enterprise' ? 'Managed mode ready' : 'Managed mode locked'}</h2></div><RuntimeBadge status={runtime.status} /></div>
            {runtime.status === 'enterprise' && managedTrialAuthConfigured() ? managedIdentity ? <div className="template-contract"><span>Managed account</span><strong>{managedIdentity.email}</strong><small>{managedIdentity.workspaceId} - API checked</small><button className="text-link" disabled={managedBusy} onClick={() => void disconnectManagedWorkspace()} type="button">Disconnect</button></div> : <form className="core-form compact-form" onSubmit={(event) => void connectManagedWorkspace(event)}><span className="core-eyebrow">Managed workspace</span><div className="form-row"><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></div><label>Workspace ID<input maxLength={128} onChange={(event) => setManagedWorkspace(event.target.value)} placeholder="Provisioned workspace" required value={managedWorkspace} /></label><button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking...' : 'Connect workspace'}</button></form> : null}
            {managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}
            <div className="readiness-list" aria-label="Managed activation readiness">{activationRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="readiness-list" aria-label="AI learning readiness">{learningRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
            <div className="learning-plan" aria-label="Premium AI context plan">
              <div><span className="core-eyebrow">Premium AI context</span><h3>What the system can learn</h3><p>Free mode prepares the evidence package. Premium imports approved data, behavior, and decisions only after managed controls pass.</p></div>
              <div className="learning-plan-rows">{learningPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              <div className="learning-plan-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export AI context package</a>{setup.savedAt ? <a className="core-button primary" href={managedTrialRequestUrl(setup.product, selectedTemplate.id)}>Request managed trial</a> : <button className="core-button primary" disabled type="button">Save trial first</button>}</div>
            </div>
            <Suspense fallback={<p className="form-notice" role="status">Loading managed activation plan...</p>}><ManagedActivationRunbook runtime={runtime} /></Suspense>
            {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
            <p className="authority-note">AI learns from imported records; owners approve consequential actions.</p>
          </section>
          <section className="core-panel trial-control-panel"><div><span className="core-eyebrow">Local evidence</span><h2>Export or reset.</h2><p>Reset clears Shop, unfinished order drafts, Plant, Website, Ecommerce setup, and handoff records.</p></div><div className="trial-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a>{resetArmed ? <><button className="text-link" disabled={resetBusy} onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" disabled={resetBusy} onClick={() => void resetDemoWorkspace()} type="button">{resetBusy ? 'Resetting...' : 'Confirm reset'}</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}</div></section>
        </div>
      </details>
    </div>
  )
}
