import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'showroom', 'dist')
const failures = []
let orderCompletionRuntimeChecks = 0
let commerceRuntimeChecks = 0
let productionRuntimeChecks = 0
const fail = (reason) => failures.push(reason)
const [manifestText, appPackageText, appSource, coreSource, commerceSource, managedTrialSource, managedCommerceRuntime, productionSource, teamSource, agentTeamsSource, teamModel, websiteSource, publishSource, commerceIntakeSource, handoffSource] = await Promise.all([
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'package.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'App.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'managed-trial.ts'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'commerce_runtime.py'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'production-workspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'TeamWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'AgentTeamsPanel.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'team-work.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'WebsiteProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'PublishWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'WebsiteCommerceIntake.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'product-handoff.ts'), 'utf8'),
])
const manifest = JSON.parse(manifestText)
const appPackage = JSON.parse(appPackageText)

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

for (const route of ['', 'work', 'operations', 'operations/commerce', 'operations/production', 'products/website', 'products/ecommerce', 'settings']) {
  const page = resolve(dist, route, 'index.html')
  if (!await exists(page)) fail(`missing_route:${route || '/'}`)
}

const releasePath = resolve(dist, '__release.json')
if (!await exists(releasePath)) fail('missing_release_metadata')
else {
  const release = JSON.parse(await readFile(releasePath, 'utf8'))
  if (release.service !== 'supermega-app') fail('wrong_release_service')
  if (release.canonicalDomain !== 'https://app.supermega.dev') fail('wrong_release_domain')
}

const faviconPath = resolve(dist, 'favicon.svg')
const manifestPath = resolve(dist, 'site.webmanifest')
if (!await exists(faviconPath)) fail('missing_terminal_favicon')
else {
  const favicon = await readFile(faviconPath, 'utf8')
  if (!favicon.includes('SuperMega terminal mark') || !favicon.includes(manifest.brand.colors.accent) || !favicon.includes(manifest.brand.colors.ink)) fail('wrong_terminal_favicon')
}
if (!await exists(manifestPath)) fail('missing_app_webmanifest')
else {
  const webmanifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (webmanifest.name !== 'SuperMega Company OS' || webmanifest.icons?.[0]?.src !== '/favicon.svg') fail('wrong_app_webmanifest')
}

const files = await walk(dist)
const textFiles = files.filter((path) => /\.(?:html|js|css|json|svg)$/.test(path))
const corpus = (await Promise.all(textFiles.map((path) => readFile(path, 'utf8')))).join('\n')
for (const required of ['SUPERMEGA', 'Teams', 'Product', 'Acceptance outcome', 'Prepare brief', 'Evidence register', 'Record evidence', 'Verified evidence', 'verifiedAt', 'Operations', 'Human confirmation', 'Confirm and record', 'Action history', 'actorKind', 'evidenceReference', 'accountableActions', 'decision_packet.v1', 'Claims and provenance', 'claimType', 'claim_type', 'source_reference', 'artifact_reference', 'managedApprovalRequests', 'packetFingerprint', 'uncertainty', 'visibility', 'artifactReference', 'Human reviewer', 'Decision note', 'Approve and record', 'Local trial', 'Delegation control', 'Pilot definition', 'Template profile', 'Workflow', 'workflowProfile', 'Current record', 'Baseline', 'Target outcome', 'Human authority boundary', 'Acceptance evidence', 'Operating mode', 'Write path', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!corpus.includes(required)) fail(`missing_context:${required}`)
}
if (!coreSource.includes("import siteManifest from '../../../site-manifest.json'")) fail('workflow_contract_not_shared')
if (coreSource.includes('const setupTemplates =') || coreSource.includes('const setupEntryPoints =')) fail('workflow_contract_duplicated')
if (coreSource.includes('className="core-panel approval-panel"')) fail('approval_queue_hidden_in_extra_panel')
if (!coreSource.includes("decidedActorKind: 'human'") || !coreSource.includes('decisionNote: note')) fail('approval_decision_not_human_attributed')
if (!coreSource.includes('dialog.showModal()') || coreSource.includes('decision-dialog-backdrop')) fail('approval_review_not_native_modal')
if (!coreSource.includes("body.operating_mode === 'managed_trial'") || !coreSource.includes('writesReady') || !coreSource.includes('requirements.length === 0')) fail('managed_readiness_not_fail_closed')
if (!coreSource.includes('LEGACY_TEAM_WORK_KEYS') || !coreSource.includes('LEGACY_COMMERCE_KEYS') || !coreSource.includes('LEGACY_PRODUCTION_KEYS') || !coreSource.includes('LEGACY_APPROVAL_KEYS') || !coreSource.includes('LEGACY_SETUP_KEYS')) fail('legacy_local_workspace_not_migrated')
if (!coreSource.includes('decisionPacketFingerprint') || !coreSource.includes("status: 'superseded' as const")) fail('stale_approval_packet_not_superseded')
if (!coreSource.includes('toManagedDecisionPacket') || !coreSource.includes('managedApprovalRequests')) fail('managed_decision_packet_serializer_missing')
if (!teamSource.includes('Accept and record') || !teamSource.includes("acceptedActorKind: 'human'") || !teamModel.includes('acceptanceEvidenceReference')) fail('product_decision_not_human_attributed')
if (!teamModel.includes("status: 'proposed'") || !teamModel.includes('isAttributedHumanAcceptance')) fail('legacy_product_acceptance_not_reopened')
if (!teamSource.includes("verifiedActorKind: 'human'") || !teamModel.includes("candidate.verifiedActorKind === 'human'") || !teamModel.includes('verifiedBy')) fail('team_evidence_not_human_attributed')
if (!teamModel.includes("supermega.team.workspace.v3") || !teamModel.includes("supermega.team.workspace.v2") || !teamModel.includes('hasValidAssignment')) fail('agent_team_migration_or_integrity_missing')
if (!agentTeamsSource.includes('No agent can send, pay, publish, merge, deploy, or write to production') || !agentTeamsSource.includes('humanOwner') || !agentTeamsSource.includes('approvalBoundary') || agentTeamsSource.includes('>Run<')) fail('agent_authority_boundary_missing')
if (!coreSource.includes('view=work&item=${item.id}') || !coreSource.includes('view=agents&agent=${agent.id}') || !teamSource.includes("const requestedItemId = searchParams.get('item')") || !teamSource.includes("const requestedAgentId = searchParams.get('agent')") || !teamSource.includes("if (view === 'work' && selectedId) next.item = selectedId") || !teamSource.includes("if (view === 'agents' && selectedId) next.agent = selectedId") || !agentTeamsSource.includes('onSelectAgent: (agentId: string) => void') || agentTeamsSource.includes('const [selectedAgentId')) fail('team_record_deep_links_missing')
if (!appSource.includes("lazy(() => import('./products/website/WebsiteProduct')") || !appSource.includes('Suspense') || appSource.includes("import('./products/ecommerce/EcommerceOrdersProduct')")) fail('website_prototype_route_not_isolated')
if (!appSource.includes('<Navigate replace to="/operations/commerce/?tab=orders" />') || !appSource.includes('path="products/ecommerce/*"')) fail('legacy_ecommerce_route_not_redirected')
if (!appPackage.scripts?.lint?.includes('src/products')) fail('prototype_sources_not_linted')
if (!websiteSource.includes('No website has been deployed.') || !websiteSource.includes('No deployment or external write occurred.')) fail('website_prototype_boundary_missing')
if (!commerceIntakeSource.includes('Browser-local evidence only.') || !commerceIntakeSource.includes('No customer message, payment, delivery request, or external write occurs.')) fail('commerce_intake_boundary_missing')
if (!handoffSource.includes("schema: 'website_ecommerce_handoff.v1'") || !handoffSource.includes("state: 'pending_acceptance'") || !handoffSource.includes('hasExactKeys') || !handoffSource.includes('validateAgainstWorkspace') || !handoffSource.includes('readinessChecks(workspace, fingerprint).every') || !handoffSource.includes('acceptWebsiteEcommerceHandoff')) fail('website_ecommerce_handoff_contract_missing')
const handoffIntakeSource = handoffSource.slice(handoffSource.indexOf('type HandoffIntake'), handoffSource.indexOf('type PendingHandoff'))
if (!handoffIntakeSource.includes('sku: string') || !handoffIntakeSource.includes('quantity: number') || ['customer', 'phone', 'township', 'payment', 'delivery', 'fulfilment'].some((field) => handoffIntakeSource.toLowerCase().includes(field))) fail('website_handoff_contains_pii_shaped_fields')
if (!handoffSource.includes("actorKind: 'human'") || !handoffSource.includes("action: 'accept_website_handoff'") || !handoffSource.includes('audit: [audit]') || !handoffSource.includes("existing.handoff.state === 'accepted'") || !handoffSource.includes('setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))')) fail('website_handoff_atomic_audit_missing')
if (!handoffSource.includes("schema: 'ecommerce_order_draft.v1'") || !handoffSource.includes("mode: 'browser-local'") || !handoffSource.includes("schema: 'website_ecommerce_handoff_store.v2'") || !handoffSource.includes('createWebsiteOrderDraft') || !handoffSource.includes('idempotencyKey: current.handoff.id') || !handoffSource.includes("missingFields: ['customer_reference', 'fulfilment_method', 'payment_method']") || !handoffSource.includes('current.draft.idempotencyKey === handoffId') || !handoffSource.includes('if (!current.display) return null')) fail('ecommerce_order_draft_contract_missing')
if (!handoffSource.includes("schema: 'ecommerce_order_record.v1'") || !handoffSource.includes("schema: 'website_ecommerce_handoff_store.v3'") || !handoffSource.includes("state: 'ready_for_confirmation'") || !handoffSource.includes("action: 'complete_website_order'") || !handoffSource.includes('customerReferenceFor(current.handoff.id)') || !handoffSource.includes('websiteEvidenceReference: current.handoff.source.localPublishId') || !handoffSource.includes('completionMatches(current.order, input)') || !handoffSource.includes('globalThis.navigator.locks.request') || !handoffSource.includes('if (!isHandoffStore(store)) return null')) fail('ecommerce_order_completion_contract_missing')
if (!websiteSource.includes('approvalIsCurrent || !publishIsCurrent') || !websiteSource.includes('checks.every((check) => check.passed)') || !websiteSource.includes('writeWebsiteEcommerceHandoff(handoff, workspace)') || !publishSource.includes('fingerprint is a revision marker, not a signature')) fail('website_handoff_gate_missing')
if (!commerceIntakeSource.includes('acceptWebsiteEcommerceHandoff') || !commerceIntakeSource.includes('matches.length === 1') || !commerceIntakeSource.includes('createWebsiteOrderDraft(context.handoff.id') || !commerceIntakeSource.includes('I reviewed this SKU, quantity, and Website evidence.')) fail('commerce_intake_approval_contract_missing')
if (!commerceIntakeSource.includes('await completeWebsiteOrderDraft') || !commerceIntakeSource.includes('opaque customer reference generated on completion') || !commerceIntakeSource.includes('Create ready order') || !commerceIntakeSource.includes('Confirm into orders')) fail('commerce_order_completion_ui_missing')
if (!coreSource.includes('function queueWebsiteOrder') || !coreSource.includes('sourceRecordId') || !coreSource.includes('item.price !== line.unitPriceMmk') || !coreSource.includes('Website order confirmation failed closed') || !coreSource.includes('Confirm ${record.id} from Website')) fail('website_order_not_integrated_with_commerce')
if (!commerceSource.includes("supermega.commerce.workspace.v2") || !commerceSource.includes('loadCommerceWorkspace') || !commerceSource.includes('mutateCommerceWorkspace') || !commerceSource.includes('lockManager.request')) fail('commerce_v2_locked_store_missing')
if (!commerceSource.includes("CommercePaymentStatus = 'pending' | 'reconciled'") || !commerceSource.includes("CommerceRefundStatus = 'none' | 'due'") || commerceSource.includes("'unrecorded'") || commerceSource.includes("'refund_due'")) fail('commerce_payment_or_refund_contract_invalid')
if (!commerceSource.includes('commerceOrderHasReleasableReservation') || !commerceSource.includes("movement.kind === 'reserve'") || !commerceSource.includes("movement.kind === 'release'") || !commerceSource.includes("kind: 'receipt'")) fail('commerce_stock_ledger_contract_missing')
if (!commerceSource.includes('Recovery failed closed') || !commerceSource.includes('currentRaw !== null') || !commerceSource.includes("movements: []")) fail('commerce_migration_fail_closed_contract_missing')
if (!managedTrialSource.includes('saveManagedCommerceCommand') || !managedTrialSource.includes('expected_version: request.expectedVersion') || !managedTrialSource.includes("surface: 'commerce'") || !managedTrialSource.includes('payload: { state: request.state }')) fail('managed_commerce_command_client_missing')
for (const eventType of ['commerce.order.created', 'commerce.order.advanced', 'commerce.order.cancelled', 'commerce.payment.reconciled', 'commerce.stock.received', 'commerce.close.saved']) {
  if (!coreSource.includes(eventType) || !managedCommerceRuntime.includes(eventType)) fail(`managed_commerce_event_missing:${eventType}`)
}
if (!coreSource.includes("mode: 'managed-unprovisioned'") || !coreSource.includes('Demo records are never copied into a managed workspace.') || !coreSource.includes('result.version !== current.version + 1') || !coreSource.includes('validateCommerceState(result.state)') || !coreSource.includes("error.code === 'trial_version_conflict'") || !coreSource.includes('managedIdentity ? null : <ActionHistory')) fail('managed_commerce_ui_not_fail_closed')
if (!managedCommerceRuntime.includes('commerce.workspace.initialized') || managedCommerceRuntime.includes('commerce.snapshot.saved') || !managedCommerceRuntime.includes('_one_changed') || !managedCommerceRuntime.includes('daily close totals must match completed, reconciled orders')) fail('managed_commerce_server_transition_contract_missing')
if (!coreSource.includes("const commerceTabs") || !coreSource.includes("{ id: 'today', label: 'Today' }") || !coreSource.includes("{ id: 'orders', label: 'Orders' }") || !coreSource.includes("{ id: 'inventory', label: 'Inventory' }") || coreSource.includes("{ id: 'payments'")) fail('commerce_three_tab_contract_changed')
if (!productionSource.includes("supermega.production.workspace.v2") || !productionSource.includes('mutateProductionWorkspace') || !productionSource.includes('lockManager.request') || !productionSource.includes('next.revision !== current.revision + 1')) fail('production_v2_locked_store_missing')
if (!productionSource.includes("'output_recorded' | 'issue_opened' | 'issue_resolved' | 'machine_state_changed'") || !productionSource.includes('events: [event, ...state.events]') || !productionSource.includes('Production revision must equal the append-only event count.')) fail('production_append_only_record_missing')
if (!productionSource.includes('currentRaw !== null') || !productionSource.includes('Migration failed closed') || !productionSource.includes('events: []')) fail('production_migration_fail_closed_contract_missing')
const productionTabsContract = coreSource.slice(coreSource.indexOf('const productionTabs'), coreSource.indexOf('function uid'))
if (!productionTabsContract.includes("{ id: 'today', label: 'Today' }") || !productionTabsContract.includes("{ id: 'production', label: 'Production' }") || !productionTabsContract.includes("{ id: 'control', label: 'Issues & equipment' }") || (productionTabsContract.match(/^\s*\{ id:/gm) || []).length !== 3) fail('production_three_tab_contract_changed')
const productionPageContract = coreSource.slice(coreSource.indexOf('function ProductionPage'), coreSource.indexOf('function JobList'))
if (coreSource.includes('Math.min(quantity') || !productionPageContract.includes('No output was recorded.') || !productionPageContract.includes('Number.isSafeInteger(quantity)') || productionPageContract.includes('max={selectedRemaining')) fail('production_output_silently_clamped')
if (!productionPageContract.includes('persisted with attributed Production evidence.') || productionPageContract.includes('<ActionHistory actions={actions} domain="production"')) fail('production_confirmation_record_not_domain_specific')
if (!coreSource.includes("addEventListener('storage', refreshFromStorage)") || !coreSource.includes("removeEventListener('storage', refreshFromStorage)")) fail('production_cross_tab_refresh_missing')
if (!coreSource.includes('headingRef.current?.focus()') || !coreSource.includes('previousFocusRef.current.focus()') || !coreSource.includes('aria-live="polite"') || !coreSource.includes('current state ${machine.state}')) fail('production_confirmation_accessibility_missing')
let workflowProfiles = 0
for (const product of manifest.products || []) {
  if (product.templates?.length !== 3) fail(`wrong_template_count:${product.id}`)
  for (const template of product.templates || []) {
    workflowProfiles += 1
    if (!template.outcome?.trim() || !template.metric?.trim() || template.workflow?.length < 5 || template.entryPoints?.length < 3) fail(`incomplete_workflow_profile:${template.id}`)
    for (const token of [template.name, template.metric, ...template.workflow, ...template.entryPoints]) {
      if (!corpus.includes(token)) fail(`workflow_profile_not_bundled:${template.id}:${token}`)
    }
  }
}
for (const route of ['/operations/commerce/', '/operations/production/', '/products/website/']) {
  if (!corpus.includes(route)) fail(`missing_canonical_module_route:${route}`)
}
for (const forbidden of ['pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a', 'Company Systems That Replace Tool Sprawl', 'Workspace draft', 'Service bookings', 'Material receiving']) {
  if (corpus.toLowerCase().includes(forbidden.toLowerCase())) fail(`retired_context:${forbidden}`)
}
for (const marker of ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']) {
  if (corpus.includes(marker)) fail('app_copy_encoding_corrupt')
}

async function verifyWebsiteOrderCompletionRuntime() {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map()
  let lockRequests = 0
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    orderCompletionRuntimeChecks += 1
  }

  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: async (_name, _options, callback) => {
            lockRequests += 1
            return await callback()
          },
        },
      },
    })

    const websiteModel = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'website-model.ts')).href}?verify=${Date.now()}`)
    const handoffContract = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'product-handoff.ts')).href}?verify=${Date.now()}`)
    const workspace = websiteModel.createInitialWorkspace()
    const fingerprint = websiteModel.workspaceFingerprint(workspace)
    const at = (offset) => new Date(Date.now() + offset).toISOString()
    workspace.evidence = ['content', 'responsive', 'links'].map((kind, index) => ({
      id: `evidence-${kind}`,
      kind,
      finding: `${kind} verified`,
      reference: `REF-${kind.toUpperCase()}`,
      verifiedBy: 'OP-OWNER',
      verifiedAt: at(-5_000 + index),
      fingerprint,
    }))
    workspace.approval = {
      id: 'approval-runtime',
      reviewer: 'OP-OWNER',
      note: 'Approved for runtime contract verification',
      approvedAt: at(-4_000),
      fingerprint,
    }
    workspace.localPublishes = [{
      id: 'local-publish-runtime',
      recordedAt: at(-3_000),
      recordedBy: 'OP-OWNER',
      fingerprint,
      readyPageIds: workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id),
    }]
    localStorage.setItem(websiteModel.WEBSITE_STORAGE_KEY, JSON.stringify(workspace))

    const pendingHandoff = handoffContract.createWebsiteEcommerceHandoff({
      fingerprint,
      approvalId: workspace.approval.id,
      localPublishId: workspace.localPublishes[0].id,
      pageId: 'page-products',
      sku: 'SM-CARE-01',
      quantity: 1,
    })
    const pending = handoffContract.writeWebsiteEcommerceHandoff(pendingHandoff, workspace)
    assert(pending?.schema === 'website_ecommerce_handoff_store.v1' && pending.audit.length === 0 && !pending.draft && !pending.order, 'runtime_v1_pending_invalid')
    const accepted = handoffContract.acceptWebsiteEcommerceHandoff(pendingHandoff.id, 'OP-OWNER')
    assert(accepted?.schema === 'website_ecommerce_handoff_store.v1' && accepted.audit.length === 1 && !accepted.draft && !accepted.order, 'runtime_v1_acceptance_invalid')
    const drafted = handoffContract.createWebsiteOrderDraft(pendingHandoff.id, {
      sku: 'SM-CARE-01',
      itemName: 'Family care set',
      variant: 'Standard bundle',
      active: true,
      unitPriceMmk: 31_000,
    })
    assert(drafted?.schema === 'website_ecommerce_handoff_store.v2' && drafted.draft?.totalMmk === 31_000 && !drafted.order && drafted.audit.length === 1, 'runtime_v2_draft_invalid')
    const v2Raw = localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY)
    const input = {
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      operatorId: 'OP-OWNER',
      evidenceReference: 'EV-TESTAB23',
    }
    const completed = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, input)
    assert(completed?.schema === 'website_ecommerce_handoff_store.v3' && completed.order?.state === 'ready_for_confirmation' && completed.audit.length === 2, 'runtime_v3_completion_invalid')
    assert(/^CREF-[A-HJ-NP-Z2-9]{12}$/.test(completed.order.customerReference), 'runtime_customer_reference_not_opaque')
    assert(completed.order.idempotencyKey === drafted.draft.id && completed.order.source.websiteEvidenceReference === workspace.localPublishes[0].id, 'runtime_source_identity_invalid')
    assert(JSON.stringify(completed.order.lines) === JSON.stringify(drafted.draft.lines) && completed.order.totalMmk === drafted.draft.totalMmk, 'runtime_price_snapshot_changed')
    const v3Raw = localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY)
    const exactRetry = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, input)
    assert(exactRetry?.order?.id === completed.order.id && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === v3Raw && exactRetry.audit.length === 2, 'runtime_exact_retry_not_idempotent')
    const conflictingRetry = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, { ...input, paymentMethod: 'manual_bank_transfer' })
    assert(conflictingRetry === null && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === v3Raw, 'runtime_conflicting_retry_overwrote_record')
    assert(lockRequests === 3, 'runtime_completion_lock_missing')

    localStorage.setItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY, v2Raw)
    localStorage.setItem(websiteModel.WEBSITE_STORAGE_KEY, JSON.stringify({ ...workspace, siteName: 'Changed Website source' }))
    const staleAttempt = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, input)
    assert(staleAttempt === null && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === v2Raw, 'runtime_stale_source_did_not_fail_closed')

    const malformed = '{broken'
    localStorage.setItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY, malformed)
    const malformedAttempt = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, input)
    assert(malformedAttempt === null && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === malformed, 'runtime_malformed_store_was_replaced')
  } catch (error) {
    fail(`ecommerce_order_completion_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  } finally {
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    else delete globalThis.localStorage
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
}

async function verifyCommerceRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    commerceRuntimeChecks += 1
  }
  const assertThrows = (callback, reason) => {
    try { callback() } catch { commerceRuntimeChecks += 1; return }
    throw new Error(reason)
  }
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  let lockRequests = 0
  let lockQueue = Promise.resolve()
  const locks = {
    request: (_name, _options, callback) => {
      lockRequests += 1
      const run = lockQueue.then(callback, callback)
      lockQueue = run.then(() => undefined, () => undefined)
      return run
    },
  }
  const proof = (actionId, offset = 0, patch = {}) => ({
    actionId,
    capturedAt: new Date(Date.parse('2026-07-23T09:00:00.000Z') + offset).toISOString(),
    actor: 'OP-OWNER',
    reason: 'Verified against the source record.',
    evidenceReference: `EV-${actionId}`,
    ...patch,
  })

  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href}?verify=${Date.now()}`)
    const legacy = {
      items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
      orders: [{ id: 'ORD-LEGACY', createdAt: '2026-07-22T09:00:00.000Z', customer: 'Customer', channel: 'Phone', item: 'Test item', quantity: 2, payment: 'Cash', total: 200, status: 'ready' }],
      closes: [{ id: 'CLOSE-1', createdAt: '2026-07-22T17:00:00.000Z', total: 200, orders: 1 }],
    }
    const migrated = model.normalizeCommerce(legacy)
    const migratedAgain = model.normalizeCommerce(legacy)
    assert(JSON.stringify(migrated) === JSON.stringify(migratedAgain), 'migration_not_deterministic')
    assert(migrated.schema === model.COMMERCE_WORKSPACE_SCHEMA && migrated.items[0].onHand === 10 && migrated.orders[0].id === 'ORD-LEGACY' && migrated.closes[0].id === 'CLOSE-1', 'migration_did_not_preserve_records')
    assert(migrated.orders[0].paymentStatus === 'pending' && migrated.orders[0].refundStatus === 'none' && migrated.movements.length === 0, 'migration_invented_payment_or_movement_history')
    assert(model.normalizeCommerce(migrated) === migrated, 'valid_v2_not_byte_idempotent')

    const ledger501 = {
      ...model.createEmptyCommerce(),
      items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
      movements: Array.from({ length: 501 }, (_, index) => ({
        id: `MOV-${index}`,
        actionId: `ACT-${index}`,
        createdAt: '2026-07-23T09:00:00.000Z',
        actor: 'OP-OWNER',
        reason: 'Counted receipt.',
        evidenceReference: `EV-${index}`,
        kind: 'receipt',
        sku: 'SKU-1',
        quantityDelta: 1,
      })),
    }
    assert(model.validateCommerceState(ledger501).movements.length === 501, 'ledger_was_silently_truncated')
    assertThrows(() => model.validateCommerceState({ ...ledger501, items: [...ledger501.items, ledger501.items[0]] }), 'duplicate_sku_was_accepted')
    assertThrows(() => model.validateCommerceState({ ...ledger501, movements: [...ledger501.movements, ledger501.movements[0]] }), 'duplicate_movement_was_accepted')

    const base = {
      ...model.createEmptyCommerce(),
      items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
    }
    const order = {
      id: 'ORD-1',
      createdAt: '2026-07-23T09:00:00.000Z',
      customer: 'Customer',
      channel: 'Website',
      item: 'Test item',
      itemSku: 'SKU-1',
      quantity: 2,
      payment: 'Manual QR review',
      paymentStatus: 'pending',
      refundStatus: 'none',
      sourceRecordId: 'WEB-1',
      total: 200,
      status: 'confirmed',
    }
    const reserveProof = proof('ACT-RESERVE')
    const reserved = model.reserveCommerceOrder(base, order, reserveProof)
    assert(reserved?.items[0].onHand === 8 && reserved.orders.length === 1 && reserved.movements.length === 1, 'reservation_did_not_apply_once')
    assert(model.reserveCommerceOrder(reserved, order, reserveProof) === reserved, 'exact_reservation_retry_not_idempotent')
    assert(model.reserveCommerceOrder(reserved, { ...order, quantity: 3, total: 300 }, reserveProof) === null, 'conflicting_reservation_retry_succeeded')
    assert(model.reserveCommerceOrder(reserved, { ...order, id: 'ORD-2' }, proof('ACT-RESERVE-2')) === null, 'duplicate_source_order_succeeded')

    const preparing = model.advanceCommerceOrder(reserved, order.id, 'confirmed')
    const ready = model.advanceCommerceOrder(preparing, order.id, 'preparing')
    assert(preparing?.orders[0].status === 'preparing' && ready?.orders[0].status === 'ready', 'fulfilment_progression_failed')
    assert(model.advanceCommerceOrder(ready, order.id, 'ready') === null, 'pending_payment_completed_order')
    const paymentProof = proof('ACT-PAYMENT', 1_000)
    const reconciled = model.reconcileCommercePayment(ready, order.id, paymentProof)
    assert(reconciled?.orders[0].paymentStatus === 'reconciled' && reconciled.orders[0].paymentReconciledBy === paymentProof.actor && reconciled.orders[0].paymentEvidenceReference === paymentProof.evidenceReference, 'payment_reconciliation_lost_human_evidence')
    assert(model.reconcileCommercePayment(reconciled, order.id, paymentProof) === reconciled, 'exact_payment_retry_not_idempotent')
    assert(model.reconcileCommercePayment(reconciled, order.id, { ...paymentProof, evidenceReference: 'EV-CONFLICT' }) === null, 'conflicting_payment_retry_succeeded')
    const completed = model.advanceCommerceOrder(reconciled, order.id, 'ready')
    assert(completed?.orders[0].status === 'completed' && model.cancelCommerceOrder(completed, order.id, proof('ACT-CANCEL-COMPLETED')) === null, 'completed_order_was_cancellable')

    const cancelOrder = { ...order, id: 'ORD-CANCEL', sourceRecordId: 'WEB-CANCEL' }
    const cancelReserved = model.reserveCommerceOrder(base, cancelOrder, proof('ACT-RESERVE-CANCEL'))
    const cancelProof = proof('ACT-CANCEL', 2_000)
    const cancelled = model.cancelCommerceOrder(cancelReserved, cancelOrder.id, cancelProof)
    assert(cancelled?.items[0].onHand === 10 && cancelled.orders[0].status === 'cancelled' && cancelled.movements.filter((movement) => movement.kind === 'release').length === 1, 'cancellation_did_not_release_once')
    assert(model.cancelCommerceOrder(cancelled, cancelOrder.id, cancelProof) === cancelled, 'exact_cancellation_retry_not_idempotent')
    assert(model.cancelCommerceOrder(cancelled, cancelOrder.id, proof('ACT-CANCEL-OTHER')) === null, 'different_cancellation_retry_succeeded')
    assert(model.cancelCommerceOrder(migrated, 'ORD-LEGACY', proof('ACT-CANCEL-LEGACY')) === null && migrated.items[0].onHand === 10, 'untracked_legacy_order_invented_stock')

    const paidOrder = { ...order, id: 'ORD-PAID-CANCEL', sourceRecordId: 'WEB-PAID-CANCEL' }
    const paidReserved = model.reserveCommerceOrder(base, paidOrder, proof('ACT-RESERVE-PAID'))
    const paid = model.reconcileCommercePayment(paidReserved, paidOrder.id, proof('ACT-PAY-PAID'))
    const paidCancelled = model.cancelCommerceOrder(paid, paidOrder.id, proof('ACT-CANCEL-PAID'))
    assert(paidCancelled?.orders[0].paymentStatus === 'reconciled' && paidCancelled.orders[0].refundStatus === 'due', 'paid_cancellation_erased_reconciliation_or_refund_exception')
    assert(model.reconcileCommercePayment(paidCancelled, paidOrder.id, proof('ACT-PAY-AFTER-CANCEL')) === null, 'cancelled_payment_reconciled_again')

    const receiptProof = proof('ACT-RECEIPT')
    const received = model.receiveCommerceStock(base, 'SKU-1', 10, receiptProof)
    assert(received?.items[0].onHand === 20 && received.movements[0].kind === 'receipt', 'receipt_not_recorded')
    assert(model.receiveCommerceStock(received, 'SKU-1', 10, receiptProof) === received, 'exact_receipt_retry_not_idempotent')
    assert(model.receiveCommerceStock(received, 'SKU-1', 11, receiptProof) === null, 'conflicting_receipt_retry_succeeded')
    assert(model.receiveCommerceStock({ ...base, items: [{ ...base.items[0], onHand: Number.MAX_SAFE_INTEGER }] }, 'SKU-1', 1, proof('ACT-OVERFLOW')) === null, 'stock_overflow_succeeded')

    values.clear()
    const currentState = model.createSeedCommerce()
    values.set(model.COMMERCE_KEY, JSON.stringify(currentState))
    values.set(model.LEGACY_COMMERCE_KEYS[0], '{malformed')
    const currentSnapshot = model.loadCommerceWorkspace(storage)
    assert(currentSnapshot.source === 'current' && currentSnapshot.state.orders.length === currentState.orders.length, 'valid_v2_did_not_take_precedence')
    const malformed = '{broken'
    values.set(model.COMMERCE_KEY, malformed)
    values.set(model.LEGACY_COMMERCE_KEYS[0], JSON.stringify(legacy))
    const recoverySnapshot = model.loadCommerceWorkspace(storage)
    assert(recoverySnapshot.source === 'recovery' && recoverySnapshot.state.orders.length === 0 && values.get(model.COMMERCE_KEY) === malformed, 'malformed_v2_restored_or_replaced_legacy')
    values.clear()
    values.set(model.LEGACY_COMMERCE_KEYS[0], JSON.stringify(legacy))
    const legacySnapshot = model.loadCommerceWorkspace(storage)
    assert(legacySnapshot.source === 'legacy' && JSON.parse(values.get(model.COMMERCE_KEY)).movements.length === 0, 'absent_v2_migration_failed')

    values.clear()
    const concurrentReserved = model.reserveCommerceOrder(base, cancelOrder, proof('ACT-CONCURRENT-RESERVE'))
    values.set(model.COMMERCE_KEY, JSON.stringify(concurrentReserved))
    const concurrentResults = await Promise.all([
      model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, cancelOrder.id, proof('ACT-CONCURRENT-CANCEL-A')), storage, locks),
      model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, cancelOrder.id, proof('ACT-CONCURRENT-CANCEL-B')), storage, locks),
    ])
    const concurrentState = JSON.parse(values.get(model.COMMERCE_KEY))
    assert(lockRequests === 2 && concurrentResults.filter((result) => result.ok).length === 1, 'concurrent_cancellation_not_serialized')
    assert(concurrentState.items[0].onHand === 10 && concurrentState.movements.filter((movement) => movement.kind === 'release').length === 1, 'concurrent_cancellation_released_twice')
    const replay = await model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, cancelOrder.id, proof('ACT-CONCURRENT-CANCEL-A')), storage, locks)
    assert(replay.ok && replay.replayed === true && JSON.parse(values.get(model.COMMERCE_KEY)).movements.length === 2, 'persisted_cancellation_replay_changed_ledger')

    const beforeFailure = values.get(model.COMMERCE_KEY)
    const failingStorage = { getItem: storage.getItem, setItem: () => { throw new Error('quota') } }
    const failedWrite = await model.mutateCommerceWorkspace((state) => model.receiveCommerceStock(state, 'SKU-1', 1, proof('ACT-WRITE-FAIL')), failingStorage, locks)
    assert(!failedWrite.ok && values.get(model.COMMERCE_KEY) === beforeFailure, 'storage_failure_advanced_interface_state')
  } catch (error) {
    fail(`commerce_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyProductionRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    productionRuntimeChecks += 1
  }
  const assertThrows = (callback, reason) => {
    try { callback() } catch { productionRuntimeChecks += 1; return }
    throw new Error(reason)
  }
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  let lockRequests = 0
  let lockQueue = Promise.resolve()
  const locks = {
    request: (_name, _options, callback) => {
      lockRequests += 1
      const run = lockQueue.then(callback, callback)
      lockQueue = run.then(() => undefined, () => undefined)
      return run
    },
  }
  const proof = (actionId, offset = 0, patch = {}) => ({
    actionId,
    capturedAt: new Date(Date.parse('2026-07-23T10:00:00.000Z') + offset).toISOString(),
    actor: 'OP-OWNER',
    reason: 'Verified against the shift record.',
    evidenceReference: `EV-${actionId}`,
    ...patch,
  })

  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'production-workspace.ts')).href}?verify=${Date.now()}`)
    const legacy = {
      jobs: [{ id: 'JOB-1', line: 'Line 01', product: 'Test batch', target: 100, output: 90 }],
      issues: [{ id: 'ISS-LEGACY', createdAt: '2026-07-22T10:00:00.000Z', area: 'Line 01', kind: 'quality', summary: 'Reviewed legacy issue', status: 'resolved' }],
      machines: [{ id: 'MC-1', name: 'Test machine', state: 'running' }],
    }
    const migrated = model.normalizeProduction(legacy)
    const migratedAgain = model.normalizeProduction(legacy)
    assert(JSON.stringify(migrated) === JSON.stringify(migratedAgain), 'production_migration_not_deterministic')
    assert(migrated.schema === model.PRODUCTION_WORKSPACE_SCHEMA && migrated.revision === 0 && migrated.jobs[0].output === 90 && migrated.issues[0].id === 'ISS-LEGACY' && migrated.machines[0].state === 'running', 'production_migration_did_not_preserve_records')
    assert(migrated.events.length === 0 && !migrated.issues[0].resolution, 'production_migration_invented_history')
    assert(model.normalizeProduction(migrated) === migrated, 'production_valid_v2_not_identity_stable')
    assertThrows(() => model.normalizeProduction({ ...legacy, jobs: [{ ...legacy.jobs[0], id: '' }] }), 'production_malformed_legacy_field_was_fabricated')

    const ledger501 = {
      ...model.createEmptyProduction(),
      revision: 501,
      jobs: [{ id: 'JOB-1', line: 'Line 01', product: 'Test batch', target: 1_000, output: 600 }],
      events: Array.from({ length: 501 }, (_, index) => ({
        id: `EVT-ACT-${index}`,
        actionId: `ACT-${index}`,
        createdAt: '2026-07-23T10:00:00.000Z',
        actor: 'OP-OWNER',
        reason: 'Verified count.',
        evidenceReference: `EV-${index}`,
        kind: 'output_recorded',
        subjectId: 'JOB-1',
        summary: 'Recorded 1 good unit',
        quantity: 1,
      })),
    }
    assert(model.validateProductionState(ledger501).events.length === 501, 'production_ledger_was_truncated')
    assertThrows(() => model.validateProductionState({ ...ledger501, jobs: [...ledger501.jobs, ledger501.jobs[0]] }), 'production_duplicate_job_accepted')
    const duplicateIssue = { id: 'ISS-1', createdAt: '2026-07-23T10:00:00.000Z', area: 'Line 01', kind: 'quality', summary: 'Issue', status: 'open' }
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), issues: [duplicateIssue, duplicateIssue] }), 'production_duplicate_issue_accepted')
    const duplicateMachine = { id: 'MC-1', name: 'Machine', state: 'running' }
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), machines: [duplicateMachine, duplicateMachine] }), 'production_duplicate_machine_accepted')
    assertThrows(() => model.validateProductionState({ ...ledger501, revision: 502, events: [...ledger501.events, ledger501.events[0]] }), 'production_duplicate_event_accepted')
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), jobs: [{ ...legacy.jobs[0], output: 101 }] }), 'production_over_target_state_accepted')
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), jobs: [{ ...legacy.jobs[0], target: Number.MAX_SAFE_INTEGER + 1 }] }), 'production_unsafe_integer_accepted')
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), machines: [{ ...duplicateMachine, state: 'unknown' }] }), 'production_invalid_machine_state_accepted')
    assertThrows(() => model.validateProductionState({ ...model.createEmptyProduction(), issues: [{ ...duplicateIssue, createdAt: 'not-a-date' }] }), 'production_invalid_issue_timestamp_accepted')
    assertThrows(() => model.validateProductionState({ ...ledger501, revision: 500 }), 'production_revision_event_mismatch_accepted')

    const base = {
      ...model.createEmptyProduction(),
      jobs: [{ id: 'JOB-1', line: 'Line 01', product: 'Test batch', target: 100, output: 90 }],
      machines: [{ id: 'MC-1', name: 'Test machine', state: 'running' }],
    }
    const outputProof = proof('ACT-OUTPUT')
    const outputState = model.recordProductionOutput(base, 'JOB-1', 10, outputProof)
    assert(outputState?.jobs[0].output === 100 && outputState.revision === 1 && outputState.events[0].quantity === 10 && outputState.events[0].actor === outputProof.actor, 'production_output_not_recorded_once')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 10, outputProof) === outputState, 'production_output_retry_not_idempotent')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 9, outputProof) === null, 'production_output_conflicting_quantity_succeeded')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 10, { ...outputProof, evidenceReference: 'EV-CONFLICT' }) === null, 'production_output_conflicting_evidence_succeeded')
    assert([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].every((quantity) => model.recordProductionOutput(base, 'JOB-1', quantity, proof(`ACT-BAD-${String(quantity)}`)) === null), 'production_invalid_output_quantity_succeeded')
    assert(model.recordProductionOutput(base, 'JOB-1', 11, proof('ACT-OVER-TARGET')) === null, 'production_over_target_output_succeeded')
    assert(model.recordProductionOutput(base, 'JOB-MISSING', 1, proof('ACT-MISSING-JOB')) === null, 'production_missing_job_output_succeeded')
    const maxed = { ...model.createEmptyProduction(), jobs: [{ ...legacy.jobs[0], target: Number.MAX_SAFE_INTEGER, output: Number.MAX_SAFE_INTEGER }] }
    assert(model.recordProductionOutput(maxed, 'JOB-1', 1, proof('ACT-OVERFLOW')) === null, 'production_output_overflow_succeeded')

    const issue = { id: 'ISS-1', createdAt: '2026-07-23T10:01:00.000Z', area: 'Line 01', kind: 'quality', summary: 'Temperature drift observed', status: 'open' }
    const openProof = proof('ACT-ISSUE-OPEN', 1_000)
    const opened = model.openProductionIssue(outputState, issue, openProof)
    assert(opened?.issues[0].id === issue.id && opened.revision === 2 && opened.events[0].kind === 'issue_opened', 'production_issue_not_opened_once')
    assert(model.openProductionIssue(opened, issue, openProof) === opened, 'production_issue_open_retry_not_idempotent')
    assert(model.openProductionIssue(opened, { ...issue, summary: 'Changed' }, openProof) === null, 'production_issue_conflicting_retry_succeeded')
    assert(model.openProductionIssue(opened, issue, proof('ACT-ISSUE-DUPLICATE')) === null, 'production_duplicate_issue_id_succeeded')
    assert(model.openProductionIssue(opened, { ...issue, id: 'ISS-2' }, openProof) === null, 'production_reused_action_id_succeeded')
    const resolutionProof = proof('ACT-ISSUE-RESOLVE', 2_000)
    const resolved = model.resolveProductionIssue(opened, issue.id, resolutionProof)
    assert(resolved?.issues[0].status === 'resolved' && resolved.issues[0].resolution?.resolvedBy === resolutionProof.actor && resolved.issues[0].resolution?.evidenceReference === resolutionProof.evidenceReference && resolved.events[0].kind === 'issue_resolved', 'production_issue_resolution_lost_proof')
    assert(model.resolveProductionIssue(resolved, issue.id, resolutionProof) === resolved, 'production_resolution_retry_not_idempotent')
    assert(model.resolveProductionIssue(resolved, issue.id, { ...resolutionProof, reason: 'Changed' }) === null, 'production_resolution_conflicting_retry_succeeded')
    assert(model.resolveProductionIssue(resolved, issue.id, proof('ACT-RESOLVE-AGAIN')) === null, 'production_second_resolution_succeeded')
    assert(model.resolveProductionIssue(resolved, 'ISS-MISSING', proof('ACT-RESOLVE-MISSING')) === null, 'production_missing_issue_resolution_succeeded')

    const machineProof = proof('ACT-MACHINE', 3_000)
    const attention = model.advanceProductionMachineState(resolved, 'MC-1', 'running', machineProof)
    assert(attention?.machines[0].state === 'attention' && attention.events[0].fromState === 'running' && attention.events[0].toState === 'attention', 'production_machine_transition_not_explicit')
    assert(model.advanceProductionMachineState(attention, 'MC-1', 'running', machineProof) === attention, 'production_machine_retry_not_idempotent')
    assert(model.advanceProductionMachineState(attention, 'MC-1', 'running', proof('ACT-MACHINE-STALE')) === null, 'production_stale_machine_transition_succeeded')
    assert(model.advanceProductionMachineState(attention, 'MC-1', 'attention', machineProof) === null, 'production_machine_conflicting_retry_succeeded')
    const stopped = model.advanceProductionMachineState(attention, 'MC-1', 'attention', proof('ACT-MACHINE-STOP', 4_000))
    assert(stopped?.machines[0].state === 'stopped' && stopped.revision === 5, 'production_machine_sequence_invalid')

    values.clear()
    const currentState = model.createSeedProduction()
    values.set(model.PRODUCTION_KEY, JSON.stringify(currentState))
    values.set(model.LEGACY_PRODUCTION_KEYS[0], '{malformed')
    const currentSnapshot = model.loadProductionWorkspace(storage)
    assert(currentSnapshot.source === 'current' && currentSnapshot.state.jobs.length === currentState.jobs.length, 'production_valid_v2_did_not_take_precedence')
    const malformed = '{broken'
    values.set(model.PRODUCTION_KEY, malformed)
    values.set(model.LEGACY_PRODUCTION_KEYS[0], JSON.stringify(legacy))
    const recoverySnapshot = model.loadProductionWorkspace(storage)
    assert(recoverySnapshot.source === 'recovery' && recoverySnapshot.state.jobs.length === 0 && values.get(model.PRODUCTION_KEY) === malformed, 'production_malformed_v2_restored_or_replaced_legacy')
    values.clear()
    values.set(model.LEGACY_PRODUCTION_KEYS[0], JSON.stringify(legacy))
    const legacySnapshot = model.loadProductionWorkspace(storage)
    assert(legacySnapshot.source === 'legacy' && JSON.parse(values.get(model.PRODUCTION_KEY)).revision === 0 && JSON.parse(values.get(model.PRODUCTION_KEY)).events.length === 0, 'production_absent_v2_migration_failed')
    values.clear()
    values.set(model.LEGACY_PRODUCTION_KEYS[0], JSON.stringify({ ...legacy, issues: [{ ...legacy.issues[0], kind: 'unknown' }] }))
    const invalidLegacy = model.loadProductionWorkspace(storage)
    assert(invalidLegacy.source === 'recovery' && !values.has(model.PRODUCTION_KEY), 'production_invalid_legacy_did_not_fail_closed')
    values.clear()
    values.set(model.LEGACY_PRODUCTION_KEYS[0], '{broken')
    values.set(model.LEGACY_PRODUCTION_KEYS[1], JSON.stringify(legacy))
    const staleLegacyFallback = model.loadProductionWorkspace(storage)
    assert(staleLegacyFallback.source === 'recovery' && !values.has(model.PRODUCTION_KEY), 'production_malformed_newer_legacy_restored_stale_data')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    lockRequests = 0
    const concurrentOutput = await Promise.all([
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 7, proof('ACT-CONCURRENT-7')), storage, locks),
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 5, proof('ACT-CONCURRENT-5')), storage, locks),
    ])
    const concurrentOutputState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(lockRequests === 2 && concurrentOutput.filter((result) => result.ok).length === 1, 'production_concurrent_output_not_serialized')
    assert(concurrentOutputState.jobs[0].output <= concurrentOutputState.jobs[0].target && concurrentOutputState.events.length === 1 && concurrentOutputState.revision === 1, 'production_concurrent_output_exceeded_target')
    const replay = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 7, proof('ACT-CONCURRENT-7')), storage, locks)
    assert(replay.ok && replay.replayed === true && JSON.parse(values.get(model.PRODUCTION_KEY)).revision === 1, 'production_persisted_retry_changed_state')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    const concurrentIssue = { ...issue, id: 'ISS-CONCURRENT' }
    const mixedResults = await Promise.all([
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 5, proof('ACT-MIXED-OUTPUT')), storage, locks),
      model.mutateProductionWorkspace((state) => model.openProductionIssue(state, concurrentIssue, proof('ACT-MIXED-ISSUE')), storage, locks),
    ])
    const mixedState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(mixedResults.every((result) => result.ok) && mixedState.jobs[0].output === 95 && mixedState.issues[0].id === concurrentIssue.id && mixedState.events.length === 2 && mixedState.revision === 2, 'production_concurrent_records_did_not_both_survive')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    const beforeFailure = values.get(model.PRODUCTION_KEY)
    const failingStorage = { getItem: storage.getItem, setItem: () => { throw new Error('quota') } }
    const failedWrite = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 1, proof('ACT-WRITE-FAIL')), failingStorage, locks)
    assert(!failedWrite.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_storage_failure_advanced_state')
    const invalidMutation = await model.mutateProductionWorkspace((state) => ({ ...state, revision: state.revision + 1 }), storage, locks)
    assert(!invalidMutation.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_non_append_mutation_succeeded')
    const throwingMutation = await model.mutateProductionWorkspace(() => { throw new Error('transition') }, storage, locks)
    assert(!throwingMutation.ok && throwingMutation.error.includes('transition failed') && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_transition_failure_was_misclassified')
    const unlocked = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 1, proof('ACT-NO-LOCK')), storage, {})
    assert(!unlocked.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_unlocked_write_succeeded')
  } catch (error) {
    fail(`production_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

await verifyWebsiteOrderCompletionRuntime()
await verifyCommerceRuntime()
await verifyProductionRuntime()

const bytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce((total, size) => total + size, 0)
if (bytes > 2_500_000) fail(`artifact_budget:${bytes}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_build', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_build', primaryRoutes: 4, operatingModules: 2, prototypeRoutes: 1, compatibilityRedirects: 1, workflowProfiles, orderCompletionRuntimeChecks, commerceRuntimeChecks, productionRuntimeChecks, bytes }, null, 2))
