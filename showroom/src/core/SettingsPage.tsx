import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router'

import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-handoff'
import { COMMERCE_KEY, LEGACY_COMMERCE_KEYS } from './commerce-workspace'
import { BEHAVIOR_TRAIL_KEY, readBehaviorTrail } from './behavior-trail'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  collectLocalProductRecords,
  clientSetupPath,
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

const ClientDataOnboarding = lazy(() => import('./ClientDataOnboarding').then((module) => ({ default: module.ClientDataOnboarding })))
const ManagedActivationRunbook = lazy(() => import('./ManagedActivationRunbook').then((module) => ({ default: module.ManagedActivationRunbook })))

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
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const workflowReady = Boolean(setup.workspace.trim() && setup.owner.trim() && setup.entryPoint.trim())
  const workflowCompletion = Math.round(([setup.templateId, setup.entryPoint, setup.workspace.trim(), setup.owner.trim()].filter(Boolean).length / 4) * 100)
  const displayedCompletion = settingsStep === 'workflow' ? workflowCompletion : completion
  const displayedReady = settingsStep === 'workflow' ? workflowReady : isPilotReady
  const requestedProduct = setupProductFromQuery(setupSearchParams.get('product'))
  const selectedProduct = productContracts[setup.product]
  const selectedTemplate = templateFor(setup.product, setup.templateId)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const localProductRecords = collectLocalProductRecords(window.localStorage)
  const localRecordCount = Object.keys(localProductRecords).length
  const behaviorTrail = readBehaviorTrail(window.localStorage)
  const behaviorSignalCount = behaviorTrail.length
  const agentBehaviorSignals = behaviorTrail.filter((entry) => entry.event === 'agent_job_seen' || entry.event === 'agent_job_chosen')
  const chosenAgentSignals = agentBehaviorSignals.filter((entry) => entry.event === 'agent_job_chosen')
  const agentJobCounts = new Map<string, { product: string; job: string; seen: number; chosen: number; lastAt: string }>()
  agentBehaviorSignals.forEach((entry) => {
    const key = `${entry.product}:${entry.detail}`
    const current = agentJobCounts.get(key) ?? { product: entry.product, job: entry.detail, seen: 0, chosen: 0, lastAt: entry.createdAt }
    if (entry.event === 'agent_job_seen') current.seen += 1
    if (entry.event === 'agent_job_chosen') current.chosen += 1
    if (entry.createdAt > current.lastAt) current.lastAt = entry.createdAt
    agentJobCounts.set(key, current)
  })
  const rankedAgentJobs = [...agentJobCounts.values()].sort((left, right) => (
    right.chosen - left.chosen
    || right.seen - left.seen
    || right.lastAt.localeCompare(left.lastAt)
  ))
  const agentProductName = (product: string) => (
    product === 'commerce'
    || product === 'production'
    || product === 'website'
    || product === 'ecommerce'
      ? productDisplayName(product)
      : productDisplayName(setup.product)
  )
  const topAgentJob = rankedAgentJobs[0]
  const lastChosenAgentJob = chosenAgentSignals.at(-1)
  const agentBehaviorRows = [
    ['Signals', agentBehaviorSignals.length ? `${agentBehaviorSignals.length} queue signals` : 'No queue signals', agentBehaviorSignals.length ? 'Seen and chosen recommendations are saved locally for export.' : 'Open a product queue to start behavior memory.'],
    ['Top job', topAgentJob ? `${agentProductName(topAgentJob.product)}: ${topAgentJob.job}` : 'No pattern yet', topAgentJob ? `${topAgentJob.seen} seen - ${topAgentJob.chosen} chosen.` : 'The system waits for repeated owner behavior before ranking work.'],
    ['Last chosen', lastChosenAgentJob ? `${agentProductName(lastChosenAgentJob.product)}: ${lastChosenAgentJob.detail}` : 'Nothing chosen yet', lastChosenAgentJob ? `Captured ${formatTime(lastChosenAgentJob.createdAt)}.` : 'Click a recommended agent job to teach the next handoff.'],
  ] as const
  const learningRows = [
    ['Data', localRecordCount ? `${localRecordCount} records` : 'Import'],
    ['Trust', `${runtime.coverageScore}%`],
    ['Review', `${managedApprovalRequests.length || approvals.length} packets`],
    ['Behavior', behaviorSignalCount ? `${behaviorSignalCount} signals` : 'Local only'],
  ] as const
  const learningPlanRows = [
    ['Source graph', localRecordCount ? `${localRecordCount} local records prepared` : 'No local records yet', localRecordCount ? 'Exported evidence keeps the browser-local source package for managed validation.' : 'Use Shop, Plant, Website, Ecommerce, or import setup to create the first record.'],
    ['Behavior trail', behaviorSignalCount ? `${behaviorSignalCount} local signals` : 'No local signals yet', behaviorSignalCount ? 'Premium can rank next actions from reviewed workspace behavior after import.' : 'Open Shop, Plant, Website, Ecommerce, or setup so the system can capture local activity history.'],
    ['Decision memory', managedApprovalRequests.length || approvals.length ? `${managedApprovalRequests.length || approvals.length} review packets` : 'No review packets yet', managedApprovalRequests.length || approvals.length ? 'Human approvals become reusable context after managed activation.' : 'Approve or decline at least one prepared decision before relying on AI context.'],
    ['Owner gate', isPilotReady ? 'Ready for managed review' : `${completion}% trial evidence`, isPilotReady ? 'Export evidence, then request managed trial; writes stay locked until server controls pass.' : 'Complete baseline, target, authority boundary, and acceptance evidence first.'],
  ] as const
  const agentPlanRows = [
    ['Agent worker', `${selectedProduct.name} operator`, `Prepares ${selectedTemplate.name.toLowerCase()} from approved sources.`],
    ['First job', selectedTemplate.workflow[0] ?? selectedTemplate.outcome, selectedTemplate.outcome],
    ['Tool boundary', runtime.writesReady ? 'Write gate ready' : 'Writes locked', 'Drafts, imports, messages, publishes, payments, and production changes wait for human approval.'],
    ['Learning loop', localRecordCount || actions.length || behaviorSignalCount ? `${localRecordCount + actions.length + behaviorSignalCount} signals` : 'No signals yet', 'Premium learns only from exported records, local behavior, accountable actions, and reviewed decisions.'],
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
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 16, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace, localProductRecords, behaviorTrail, agentBehaviorRows, activationRows, activationSteps: runtime.activationSteps, activationEvidencePlan: runtime.evidencePlan, learningRows, learningPlanRows, agentPlanRows }, null, 2))}`

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

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => ({ ...current, ...patch, savedAt: undefined }))
  }

  function chooseSettingsStep(step: 'workflow' | 'success') {
    setSettingsStep(step)
    if (location.hash) navigate('/settings/', { replace: true })
  }

  function changeProduct(product: SetupProductId) {
    const template = templateFor(product, '')
    navigate(clientSetupPath(product), { replace: true })
    setSetup((current) => ({
      ...current,
      product,
      templateId: template.id,
      entryPoint: template.entryPoints.includes(current.entryPoint) ? current.entryPoint : template.entryPoints[0] ?? '',
      startedAt: undefined,
      savedAt: undefined,
    }))
    setNotice(`Selected ${productDisplayName(product)}. Your client details were kept.`)
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
        BEHAVIOR_TRAIL_KEY,
        SHOP_ORDER_DRAFT_RESET_EPOCH_KEY,
        TEAM_WORK_KEY,
        WEBSITE_STORAGE_KEY,
        LEGACY_WEBSITE_STORAGE_KEY,
        WEBSITE_ECOMMERCE_HANDOFF_KEY,
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
      <PageHeading eyebrow="Guided trial" title="Start with one workflow" copy="Pick template, owner, sample." />
      <nav aria-label="Setup steps" className="settings-step-nav">
        <button aria-current={settingsStep === 'workflow' ? 'step' : undefined} onClick={() => chooseSettingsStep('workflow')} type="button"><span>1</span>Template</button>
        <button aria-current={settingsStep === 'success' ? 'step' : undefined} onClick={() => chooseSettingsStep('success')} type="button"><span>2</span>Trial plan</button>
      </nav>
      <div className="settings-grid settings-step-content">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">One product</span><h2>{settingsStep === 'workflow' ? 'Choose the trial' : 'Define success'}</h2></div><span className={`status-pill ${displayedReady ? 'approved' : 'bounded'}`}>{displayedReady ? 'ready' : `${displayedCompletion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${displayedCompletion}%` }} /></div><small>{settingsStep === 'workflow' ? 'Template - owner' : 'Record - target - evidence'}</small></div>
          <fieldset className="settings-step-fields" disabled={settingsStep !== 'workflow'} hidden={settingsStep !== 'workflow'}>
          {requestedProduct ? <div className="setup-selected-product"><span><small>Selected product</small><strong>{selectedProduct.name}</strong></span><Link className="text-link" to="/">Change product</Link></div> : <div aria-label="Choose solution" className="setup-product-grid" role="group">{Object.values(productContracts).map((product) => <button aria-pressed={setup.product === product.id} key={product.id} onClick={() => changeProduct(product.id)} type="button"><span><strong>{product.name}</strong><small>{product.headline}</small></span><b>{product.templates.length} templates</b></button>)}</div>}
          <div className="form-row"><label>Starting template<select value={setup.templateId} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Starting point<select value={setup.entryPoint} onChange={(event) => updateSetup({ entryPoint: event.target.value })}>{selectedTemplate.entryPoints.map((entryPoint) => <option key={entryPoint}>{entryPoint}</option>)}</select></label></div>
          <div className="setup-template-summary"><div><span>Outcome</span><strong>{selectedTemplate.outcome}</strong></div><ol aria-label={`${selectedTemplate.name} workflow`}>{selectedTemplate.workflow.map((step) => <li key={step}>{step}</li>)}</ol><small>Measure success with {selectedTemplate.metric.toLowerCase()}.</small></div>
          <div className="form-row"><label>Workspace name<input maxLength={80} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={setup.product === 'commerce' ? 'Example: Social sales team' : setup.product === 'production' ? 'Example: Main plant' : setup.product === 'website' ? 'Example: Company website' : 'Example: Online order desk'} /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          <Suspense fallback={<p className="form-notice" role="status">Loading the client data template...</p>}><ClientDataOnboarding managedIdentity={managedIdentity} owner={setup.owner} product={setup.product} productName={selectedProduct.name} productSlug={selectedProduct.slug} workflowTemplateId={selectedTemplate.id} workspace={setup.workspace} /></Suspense>
          <div className="settings-step-actions"><span>Sample first. Plan when needed.</span><div className="setup-action-group"><button className="text-link" disabled={!workflowReady} onClick={() => chooseSettingsStep('success')} type="button">Add trial plan</button><button className="core-button primary" disabled={!workflowReady} onClick={startGuidedTrial} type="button">Start guided sample</button></div></div>
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
              <div aria-label="Premium agent operating plan" className="learning-plan-agent">
                <div><span className="core-eyebrow">Premium agent plan</span><h3>What the agent can run</h3><p>The agent prepares the next workflow from this product setup; managed writes stay locked until the activation gates pass.</p></div>
                <div className="learning-plan-rows">{agentPlanRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
              <div aria-label="Agent behavior memory" className="learning-plan-agent">
                <div><span className="core-eyebrow">Behavior memory</span><h3>What owners keep choosing</h3><p>Free mode keeps this local. Premium can use approved queue behavior after managed import.</p></div>
                <div className="learning-plan-rows">{agentBehaviorRows.map(([label, value, detail]) => <span key={label}><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>)}</div>
              </div>
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
