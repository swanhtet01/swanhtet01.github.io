import { readFile as readRawFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const normalizeSourceText = (value) => value.replace(/\r\n?/g, '\n')
const read = async (path) => normalizeSourceText(await readRawFile(resolve(root, path), 'utf8'))
const commerceWorkspace = await import(pathToFileURL(resolve(root, 'showroom/src/core/commerce-workspace.ts')).href)
const [runtime, supabaseAuth, cloudRuntime, schedulerActivation, agentGovernance, vercelEntry, portableEntry, trialRuntime, trialStore, commerceRuntime, productionRuntime, websiteRuntime, managedTrialClient, coreApp, settingsPage, websiteWorkspaceHook, rolePreflight, foundationMigration, decisionMigration, websiteMigration, hardeningMigration, readCapabilityMigration, databaseValidator, databaseActivator, liveVerifier, workflow, requirements, dockerfile, appEnvironment, storagePrivacyVerifier] = await Promise.all([
  read('supermega_runtime/runtime.py'),
  read('supermega_runtime/supabase_auth.py'),
  read('supermega_runtime/cloud_runtime.py'),
  read('supermega_runtime/scheduler_activation.py'),
  read('supermega_runtime/agent_governance.py'),
  read('api/app.py'),
  read('api_app.py'),
  read('supermega_runtime/trial_runtime.py'),
  read('supermega_runtime/trial_store.py'),
  read('supermega_runtime/commerce_runtime.py'),
  read('supermega_runtime/production_runtime.py'),
  read('supermega_runtime/website_runtime.py'),
  read('showroom/src/core/managed-trial.ts'),
  read('showroom/src/core/CoreApp.tsx'),
  read('showroom/src/core/SettingsPage.tsx'),
  read('showroom/src/products/website/useWebsiteWorkspace.ts'),
  read('supabase/migrations/20260722004500_private_trial_backend_role_preflight.sql'),
  read('supabase/migrations/20260722005134_private_trial_backend_foundation.sql'),
  read('supabase/migrations/20260722142801_private_trial_backend_v2.sql'),
  read('supabase/migrations/20260723094500_private_trial_backend_v3_website.sql'),
  read('supabase/migrations/20260723144500_private_trial_backend_v4_hardening.sql'),
  read('supabase/migrations/20260724204920_private_trial_backend_v5_read_capabilities.sql'),
  read('tools/validate_supermega_database_url.py'),
  read('tools/activate_supermega_database.ps1'),
  read('tools/verify_app_release_live.mjs'),
  read('.github/workflows/supermega-app-deploy.yml'),
  read('requirements.txt'),
  read('Dockerfile'),
  read('.env.app.example'),
  read('tools/verify_private_storage_privacy.py'),
])
const migration = `${rolePreflight}\n${foundationMigration}\n${decisionMigration}\n${websiteMigration}\n${hardeningMigration}\n${readCapabilityMigration}`
const productionMaterialHandoff = await read('supermega_runtime/production_material_handoff.py')
const shopInventoryRuntime = await read('supermega_runtime/shop_inventory_runtime.py')
const orderIntakeProvider = await read('supermega_runtime/order_intake_provider.py')
const orderIntakeRoute = trialRuntime.slice(
  trialRuntime.indexOf('@router.post("/commerce/order-intake/drafts")'),
  trialRuntime.indexOf('@router.get("/commerce/service-schedule")'),
)
const serviceScheduleRoute = trialRuntime.slice(
  trialRuntime.indexOf('@router.get("/commerce/service-schedule")'),
  trialRuntime.indexOf('@router.post("/imports/validate")'),
)
const managedPurchaseReceiptAuthority = trialStore.slice(
  trialStore.indexOf('if event_type == "commerce.purchase_order.received":'),
  trialStore.indexOf('if event_type == "commerce.purchase_order.cancelled":'),
)
const managedOrderCalculationAuthority = trialStore.slice(
  trialStore.indexOf('def _authoritative_order_calculation('),
  trialStore.indexOf('def _authoritative_command_payload('),
)
const managedPurchaseCancellationAuthority = trialStore.slice(
  trialStore.indexOf('if event_type == "commerce.purchase_order.cancelled":'),
  trialStore.indexOf('if event_type == "commerce.payment.reconciled":'),
)
const apiSourceEntries = (await readdir(resolve(root, 'api'), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(?:py|js|mjs|cjs)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
const rootPackage = JSON.parse(await read('package.json'))
const rootDependencies = { ...(rootPackage.dependencies || {}), ...(rootPackage.devDependencies || {}) }
const storefrontCatalogDigestGolden = 'sha256:c03d623521a78627b7c324771c02be32dcc2f25c7e61d0883ebc6106042e0af2'
const storefrontCatalogDigestVector = {
  schema: 'supermega.commerce.workspace.v2',
  items: [
    { sku: 'SM-😀', name: 'Emoji item', onHand: 4, reorderAt: 1, price: 400 },
    { sku: 'SM-a', name: 'Lowercase item', variant: 'v2', onHand: 2, reorderAt: 1, price: 200 },
    { sku: 'SM-\ue000', name: 'Private-use item', onHand: 3, reorderAt: 1, price: 300 },
    { sku: 'SM-A', name: 'မြန်မာ လက်ဖက်ရည်', variant: 'သေး', onHand: 1, reorderAt: 1, price: 100 },
  ],
  orders: [],
  movements: [],
  closes: [],
}
const storefrontCatalogDigestResult = await commerceWorkspace.commerceCatalogDigest(storefrontCatalogDigestVector)
const storefrontConfigurationInput = {
  storeName: 'Mingalar Shop',
  summary: 'A small customer-ready catalog.',
  selectedSkus: ['SM-😀', 'SM-A'],
  shopCatalogDigest: storefrontCatalogDigestResult,
}
const storefrontConfigurationProof = (revision, actionId = commerceWorkspace.commerceStorefrontConfigurationActionId(
  revision,
  storefrontCatalogDigestResult,
)) => ({
  actionId,
  capturedAt: '2026-07-25T00:00:00.000Z',
  actor: 'contract-verifier',
  reason: 'Verify the managed storefront configuration boundary.',
  evidenceReference: `ECOMMERCE-STOREFRONT:${storefrontCatalogDigestResult}:R${revision}`,
})
const savedStorefrontConfiguration = await commerceWorkspace.saveCommerceStorefrontConfiguration(
  storefrontCatalogDigestVector,
  storefrontConfigurationInput,
  storefrontConfigurationProof(1),
)
const mutableStorefrontState = structuredClone(storefrontCatalogDigestVector)
const mutableStorefrontSave = commerceWorkspace.saveCommerceStorefrontConfiguration(
  mutableStorefrontState,
  storefrontConfigurationInput,
  storefrontConfigurationProof(1),
)
mutableStorefrontState.items[0].price += 1
const mutationSafeStorefrontConfiguration = await mutableStorefrontSave
const forgedCatalogDigest = `sha256:${'0'.repeat(64)}`
const forgedStorefrontConfiguration = await commerceWorkspace.saveCommerceStorefrontConfiguration(
  storefrontCatalogDigestVector,
  {
    ...storefrontConfigurationInput,
    shopCatalogDigest: forgedCatalogDigest,
  },
  {
    ...storefrontConfigurationProof(1),
    actionId: commerceWorkspace.commerceStorefrontConfigurationActionId(1, forgedCatalogDigest),
    evidenceReference: `ECOMMERCE-STOREFRONT:${forgedCatalogDigest}:R1`,
  },
)
const reusedStorefrontAction = savedStorefrontConfiguration
  ? await commerceWorkspace.saveCommerceStorefrontConfiguration(
      savedStorefrontConfiguration,
      {
        ...storefrontConfigurationInput,
        summary: 'Changed copy with a reused historical action.',
      },
      storefrontConfigurationProof(2, storefrontConfigurationProof(1).actionId),
    )
  : undefined
let explicitNullStorefrontRejected = false
try {
  commerceWorkspace.validateCommerceState({
    ...storefrontCatalogDigestVector,
    storefrontConfiguration: null,
  })
} catch {
  explicitNullStorefrontRejected = true
}
const newlineCatalogState = {
  schema: 'supermega.commerce.workspace.v2',
  items: [
    { sku: 'a\na', name: 'Embedded newline', onHand: 1, reorderAt: 1, price: 100 },
    { sku: 'a', name: 'Short SKU', onHand: 1, reorderAt: 1, price: 200 },
  ],
  orders: [],
  movements: [],
  closes: [],
}
const newlineCatalogDigest = await commerceWorkspace.commerceCatalogDigest(newlineCatalogState)
let unsortedNewlineSkusRejected = false
try {
  commerceWorkspace.validateCommerceState({
    ...newlineCatalogState,
    storefrontConfiguration: {
      schema: 'supermega.ecommerce.storefront.v1',
      revision: 1,
      shopCatalogSnapshotRevision: 1,
      shopCatalogDigest: newlineCatalogDigest,
      storeName: 'Newline test',
      summary: 'Reject a joined-array ordering collision.',
      selectedSkus: ['a\na', 'a'],
      saved: {
        actionId: commerceWorkspace.commerceStorefrontConfigurationActionId(1, newlineCatalogDigest),
        capturedAt: '2026-07-25T00:00:00.000Z',
        actor: 'contract-verifier',
        reason: 'Verify structural SKU ordering.',
        evidenceReference: `ECOMMERCE-STOREFRONT:${newlineCatalogDigest}:R1`,
      },
    },
  })
} catch {
  unsortedNewlineSkusRejected = true
}

const integrityProof = {
  actionId: 'ACT-WEBSITE-INTAKE',
  capturedAt: '2026-07-23T09:00:00.000Z',
  actor: 'OP-OWNER',
  reason: 'Verified against the source record.',
  evidenceReference: 'EV-ACT-WEBSITE-INTAKE',
}
const integrityBase = {
  ...commerceWorkspace.createEmptyCommerce(),
  items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
}
const boundWebsiteIntake = commerceWorkspace.createCommerceWebsiteIntake(integrityBase, {
  id: 'WINT-12345678',
  source: {
    fingerprint: 'web-1234abcd',
    approvalId: 'approval-1',
    snapshotId: 'snapshot-1',
    pageId: 'page-products',
    siteName: 'Test Website',
    pagePath: '/products',
  },
  sku: 'SKU-1',
  quantity: 2,
}, integrityProof)
let rewrittenWebsiteSnapshotRejected = false
try {
  const tampered = structuredClone(boundWebsiteIntake)
  tampered.websiteIntakes[0].unitPrice = 125
  tampered.websiteIntakes[0].total = 250
  commerceWorkspace.validateCommerceState(tampered)
} catch {
  rewrittenWebsiteSnapshotRejected = true
}
const legacyUnboundWebsiteState = structuredClone(boundWebsiteIntake)
delete legacyUnboundWebsiteState.websiteIntakes[0].snapshotDigest
const readableLegacyWebsiteState = commerceWorkspace.validateCommerceState(legacyUnboundWebsiteState)
const legacyWebsiteConversion = commerceWorkspace.convertCommerceWebsiteIntake(
  readableLegacyWebsiteState,
  'WINT-12345678',
  {
    customer: 'Customer reference',
    fulfilmentMethod: 'pickup',
    paymentMethod: 'cash_on_delivery',
  },
  {
    ...integrityProof,
    actionId: 'ACT-WEBSITE-CONVERT',
    capturedAt: '2026-07-23T09:01:00.000Z',
    evidenceReference: 'EV-ACT-WEBSITE-CONVERT',
  },
)
const catalogIntegrityProof = {
  ...integrityProof,
  actionId: 'ACT-ITEM-UPDATE',
  capturedAt: '2026-07-23T09:00:02.000Z',
  evidenceReference: 'EV-ACT-ITEM-UPDATE',
}
const catalogIntegrityState = commerceWorkspace.updateCommerceItem(integrityBase, {
  sku: 'SKU-1',
  expectedPrice: 100,
  nextPrice: 125,
  expectedReorderAt: 2,
  nextReorderAt: 3,
}, catalogIntegrityProof)
let rewrittenCatalogOpeningRejected = false
try {
  const tampered = structuredClone(catalogIntegrityState)
  tampered.catalogChanges[0].previousPrice = 99
  commerceWorkspace.validateCommerceState(tampered)
} catch {
  rewrittenCatalogOpeningRejected = true
}

const failures = []
const checks = []
const requireContract = (name, condition) => {
  checks.push(name)
  if (!condition) failures.push(name)
}
requireContract('source line endings normalize across platforms',
  normalizeSourceText('line one\r\nline two\rline three') === 'line one\nline two\nline three')
const expectedHumanCommerceEvents = [
  'commerce.account_mapping.saved',
  'commerce.close.saved',
  'commerce.inventory.initialized',
  'commerce.inventory.transferred',
  'commerce.item.created',
  'commerce.item.updated',
  'commerce.order.advanced',
  'commerce.order.cancelled',
  'commerce.order.correction_recorded',
  'commerce.order.created',
  'commerce.order.return_recorded',
  'commerce.payment.reconciled',
  'commerce.production_material.issued',
  'commerce.purchase_order.cancelled',
  'commerce.purchase_order.created',
  'commerce.purchase_order.received',
  'commerce.refund.settled',
  'commerce.service_schedule.initialized',
  'commerce.service_schedule.saved',
  'commerce.stock.counted',
  'commerce.stock.received',
  'commerce.storefront.configuration.saved',
  'commerce.storefront.merchandising.imported',
  'commerce.tax_configuration.saved',
  'commerce.website_intake.converted',
  'commerce.workspace.initialized',
]
const expectedHumanProductionEvents = [
  'production.downtime.ended',
  'production.downtime.started',
  'production.issue.opened',
  'production.issue.resolved',
  'production.job.closed',
  'production.job.created',
  'production.job.schedule_updated',
  'production.machine_state.changed',
  'production.maintenance.completed',
  'production.maintenance.started',
  'production.material.consumed',
  'production.order_execution.recorded',
  'production.output.recorded',
  'production.quality_hold.placed',
  'production.quality_hold.released',
  'production.workspace.initialized',
]
const expectedHumanWebsiteEvents = [
  'website.evidence.recorded',
  'website.release.recorded',
  'website.revision.approved',
  'website.snapshot.recorded',
]
const humanEventList = (source, start, end, domain = 'commerce') => {
  const contract = source.slice(source.indexOf(start), source.indexOf(end))
  const pattern = new RegExp(`"(${domain}\\.[^"]+)"`, 'g')
  return [...contract.matchAll(pattern)].map((match) => match[1]).sort()
}

requireContract('Vercel entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(vercelEntry) && !/serve_solution/.test(vercelEntry))
requireContract('portable entrypoint uses canonical runtime', /from supermega_runtime\.runtime import app/.test(portableEntry) && !/serve_solution/.test(portableEntry))
requireContract('API directory exposes exactly one function source', JSON.stringify(apiSourceEntries) === JSON.stringify(['app.py']))
requireContract('legacy Node API dependencies are removed', !['pg', 'playwright'].some((name) => name in rootDependencies))
requireContract('legacy client runtime is unreachable', !/serve_solution|yangon|\bytf\b|\bpos\b/i.test([runtime, vercelEntry, portableEntry].join('\n')))
requireContract('managed store is server-side Postgres', /PostgresTrialStore/.test(runtime) && /SUPERMEGA_DATABASE_URL/.test(runtime))
requireContract('trial writes default fail closed', /SUPERMEGA_TRIAL_WRITES_ENABLED/.test(runtime) && /default: bool = False/.test(runtime))
requireContract('identity is gateway signed', /SUPERMEGA_TRIAL_IDENTITY_SECRET/.test(runtime) && /hmac\.compare_digest/.test(runtime))
requireContract('identity signing secret has a fail-closed entropy floor', /_MIN_IDENTITY_SECRET_BYTES = 32/.test(runtime) && /_MIN_IDENTITY_SECRET_DISTINCT_BYTES/.test(runtime) && /_IDENTITY_SECRET_PLACEHOLDER_MARKERS/.test(runtime) && /_identity_secret_ready/.test(runtime))
requireContract('Supabase identity accepts only a confirmed named-user token', /\/auth\/v1\/user/.test(supabaseAuth) && /_is_publishable_key/.test(supabaseAuth) && /is_anonymous"\) is not False/.test(supabaseAuth) && /actor_kind="human"/.test(runtime))
requireContract('Supabase token verification disables proxy and redirect forwarding', /ProxyHandler\(\{\}\)/.test(supabaseAuth) && /_NoRedirectHandler/.test(supabaseAuth) && /opener\.open/.test(supabaseAuth))
requireContract('identity is rejected from request bodies', /_CLIENT_IDENTITY_FIELDS/.test(trialRuntime) && /client_identity_forbidden/.test(trialRuntime))
requireContract('trial router is mounted with bounded order intake', /create_trial_router\([\s\S]*store=store,[\s\S]*resolve_principal=resolve_trial_principal,[\s\S]*order_intake_provider=order_intake_provider,[\s\S]*\)/.test(runtime))
requireContract('AI order intake is authenticated, human-only, read-scoped, and non-mutating',
  /_resolve_principal\(request, resolve_principal\)/.test(orderIntakeRoute)
  && /has_surface_read_capability\(readiness\.capabilities, "commerce"\)/.test(orderIntakeRoute)
  && /principal\.actor_kind != "human"/.test(orderIntakeRoute)
  && /_bounded_json_body\(/.test(orderIntakeRoute)
  && /store\.get_state\(principal, "commerce"\)/.test(orderIntakeRoute)
  && !/store\.(?:apply_command|create_approval|decide_approval)/.test(orderIntakeRoute))
requireContract('AI order intake provider cannot use tools, store responses, redirect credentials, or bypass hosted budget',
  /"store": False/.test(orderIntakeProvider)
  && /"strict": True/.test(orderIntakeProvider)
  && /"type": "json_schema"/.test(orderIntakeProvider)
  && /"safety_identifier"/.test(orderIntakeProvider)
  && !/"tools"\s*:/.test(orderIntakeProvider)
  && /build_opener\(ProxyHandler\(\{\}\), _NoRedirectHandler\(\)\)/.test(orderIntakeProvider)
  && /PostgresOrderIntakeBudget\(database_url, cap\)/.test(orderIntakeProvider)
  && /else UnavailableOrderIntakeBudget\(\)/.test(orderIntakeProvider)
  && /order_intake_provider_quota_exhausted/.test(orderIntakeProvider))
requireContract('managed Shop appointments are tenant-scoped, human-only, identity-bound, and optimistic',
  /_resolve_principal\(request, resolve_principal\)/.test(serviceScheduleRoute)
  && /has_surface_read_capability\(readiness\.capabilities, "commerce"\)/.test(serviceScheduleRoute)
  && /_require_write_ready\(readiness, "commerce\.write"\)/.test(serviceScheduleRoute)
  && /principal\.actor_kind != "human"/.test(serviceScheduleRoute)
  && /_reject_client_identity\(body\.schedule/.test(serviceScheduleRoute)
  && /expected_version=body\.expected_version/.test(serviceScheduleRoute)
  && /event_type\s*=\s*"commerce\.service_schedule\.initialized"/.test(serviceScheduleRoute)
  && /event_type\s*=\s*"commerce\.service_schedule\.saved"/.test(serviceScheduleRoute)
  && /event_type=event_type/.test(serviceScheduleRoute)
  && /commerce\.service_schedule\.initialized/.test(trialStore)
  && /commerce\.service_schedule\.saved/.test(trialStore)
  && /_validate_service_schedule_initialized/.test(commerceRuntime)
  && /service schedule evidence history is immutable/.test(commerceRuntime)
  && /contains overlapping bookings/.test(commerceRuntime))
requireContract('runtime exposes bounded health truth', /"operating_mode": "managed_trial" if not requirements else "isolated_demo"/.test(runtime) && /"browser_service_role_exposed": False/.test(runtime))
requireContract('managed browser auth is readiness gated and cannot accept a secret key', /runtime\.status === 'enterprise' && managedTrialAuthConfigured\(\)/.test(settingsPage) && /validPublishableKey/.test(managedTrialClient) && !/VITE_SUPABASE_(?:SERVICE_ROLE|SECRET)/.test(managedTrialClient))
requireContract('managed approval evidence is never persisted in demo storage', /localApprovalsOnly/.test(coreApp) && /persist \? persist\(normalizedState\)/.test(coreApp) && /current\.filter\(\(approval\) => !approval\.managed\)/.test(settingsPage))
requireContract('production CORS is bounded', /https:\/\/app\.supermega\.dev,https:\/\/supermega\.dev/.test(runtime) && !/allow_origins=\["\*"\]/.test(runtime))
requireContract('API documentation is not public', /docs_url=None/.test(runtime) && /openapi_url=None/.test(runtime))
requireContract('surface commands use optimistic versions', /expected_version/.test(trialRuntime) && /TrialVersionConflict/.test(trialStore))
requireContract('commands are idempotent', /TrialIdempotencyConflict/.test(trialStore) && /command_fingerprint/.test(migration))
requireContract('Ecommerce storefront catalog digest is cross-runtime deterministic', storefrontCatalogDigestResult === storefrontCatalogDigestGolden)
requireContract('Website order snapshots are digest-bound and legacy records fail closed at conversion',
  boundWebsiteIntake?.websiteIntakes?.[0]?.snapshotDigest === 'sha256:58c85cb3640d6e4510551181009bd0cbae46f5f51a6db6c7b0f6485d76e4933d'
  && rewrittenWebsiteSnapshotRejected
  && readableLegacyWebsiteState.websiteIntakes[0].snapshotDigest === undefined
  && legacyWebsiteConversion === null
  && /commerce_website_intake_snapshot_digest/.test(commerceRuntime)
  && /legacy Website intakes without a snapshot digest cannot be converted/.test(commerceRuntime))
requireContract('Shop catalog change history is anchored to a deterministic opening baseline',
  catalogIntegrityState?.catalogBaselines?.[0]?.anchorDigest === 'sha256:fe1d49f917797c9b6f35354c7787c21dffee2746d82a7a16c7ed19b1e0dbb35e'
  && catalogIntegrityState?.catalogChanges?.[0]?.previousPrice === 100
  && rewrittenCatalogOpeningRejected
  && /commerce_catalog_baseline_digest/.test(commerceRuntime)
  && /has no anchored baseline/.test(commerceRuntime))
requireContract('Ecommerce storefront save binds current catalog and deterministic proof identity',
  savedStorefrontConfiguration?.storefrontConfiguration?.revision === 1
  && JSON.stringify(savedStorefrontConfiguration.storefrontConfiguration.selectedSkus) === JSON.stringify(['SM-A', 'SM-😀'])
  && forgedStorefrontConfiguration === null
  && reusedStorefrontAction === null
  && explicitNullStorefrontRejected
  && unsortedNewlineSkusRejected
  && mutationSafeStorefrontConfiguration?.items[0].price === storefrontCatalogDigestVector.items[0].price
  && mutationSafeStorefrontConfiguration?.storefrontConfiguration?.shopCatalogDigest === storefrontCatalogDigestGolden
  && ['items', 'orders', 'movements', 'closes'].every((field) => (
    JSON.stringify(savedStorefrontConfiguration[field]) === JSON.stringify(storefrontCatalogDigestVector[field])
  )))
requireContract('company queue is a managed surface', /"company": "company\.write"/.test(trialStore) && /when 'company' then 'company\.write'/.test(migration))
requireContract('Website is an authenticated managed surface', /"website": "website\.write"/.test(trialStore) && /reduce_website_state/.test(runtime) && /WEBSITE_HUMAN_EVENTS/.test(trialRuntime) && /when 'website' then 'website\.write'/.test(websiteMigration) && /saveManagedWebsiteCommand/.test(managedTrialClient) && /validate_website_state/.test(websiteRuntime) && /evidence\["actor"\] == event\["actor"\] == record\[actor_field\]/.test(websiteRuntime) && /exact current ready-page set/.test(websiteRuntime) && /sort_keys=True/.test(websiteRuntime))
requireContract('consequential Website events are human-only and actor-bound in router and store', /WEBSITE_HUMAN_EVENTS/.test(trialRuntime)
  && JSON.stringify(humanEventList(trialStore, 'HUMAN_COMMAND_EVENTS', 'SURFACE_WRITE_CAPABILITIES', 'website')) === JSON.stringify(expectedHumanWebsiteEvents)
  && JSON.stringify(humanEventList(websiteRuntime, 'WEBSITE_HUMAN_EVENTS', '_MAX_SAFE_INTEGER', 'website')) === JSON.stringify(expectedHumanWebsiteEvents)
  && /surface == "website" and event_type in HUMAN_COMMAND_EVENTS/.test(trialStore)
  && /f"\{surface\.title\(\)\} evidence actor must match the authenticated principal\."/.test(trialStore))
requireContract('Website Commerce intake source is transactionally verified with replay-safe retained proof', /commerce\.website_intake\.created/.test(trialRuntime) && /validate_website_snapshot_source/.test(trialRuntime) && /related_surfaces = \("website",\)/.test(trialRuntime) && /state_precondition=state_precondition/.test(trialRuntime) && /_commerce_retains_website_source/.test(trialRuntime) && /_website_fingerprint\(state\) != fingerprint/.test(websiteRuntime) && /not _same_source\(snapshot\["source"\], current_source\)/.test(websiteRuntime) && /event_type == "commerce\.website_intake\.created"/.test(trialStore) && /intake\["snapshotDigest"\] = f"sha256:/.test(trialStore) && /locked_surfaces/.test(trialStore) && /for update/i.test(trialStore))
requireContract('Plant material and Shop stock are cross-surface digest-bound before progress',
  /commerce\.production_material\.issued/.test(trialRuntime)
  && /related_surfaces = \("production",\)/.test(trialRuntime)
  && /related_surfaces = \("commerce",\)/.test(trialRuntime)
  && /require_shop_issue_matches_plant/.test(productionMaterialHandoff)
  && /require_shop_issue_before_plant_progress/.test(productionMaterialHandoff)
  && /productionCommandDigest/.test(commerceRuntime))
requireContract('managed Shop location inventory and order allocation are human-only, server-stamped, and digest-chained',
  /commerce\.inventory\.initialized/.test(managedTrialClient)
  && /commerce\.inventory\.transferred/.test(managedTrialClient)
  && /_validate_inventory_initialized/.test(commerceRuntime)
  && /_validate_inventory_transferred/.test(commerceRuntime)
  && /_order_inventory_transition/.test(commerceRuntime)
  && /order_reserve/.test(shopInventoryRuntime)
  && /order_release/.test(shopInventoryRuntime)
  && /order_fulfil/.test(shopInventoryRuntime)
  && /restamp_latest_shop_inventory_command/.test(trialStore)
  && /_restamp_order_inventory/.test(trialStore)
  && /validate_shop_inventory_state/.test(shopInventoryRuntime)
  && /inventory command digest is invalid/.test(shopInventoryRuntime)
  && /location ATP drifted from aggregate Shop stock/.test(commerceRuntime))
requireContract('consequential Commerce events are human-only in router and store', /COMMERCE_HUMAN_EVENTS/.test(trialRuntime)
  && JSON.stringify(humanEventList(trialStore, 'HUMAN_COMMAND_EVENTS', 'SURFACE_WRITE_CAPABILITIES')) === JSON.stringify(expectedHumanCommerceEvents)
  && JSON.stringify(humanEventList(commerceRuntime, 'COMMERCE_HUMAN_EVENTS', '_ORDER_STATUSES')) === JSON.stringify(expectedHumanCommerceEvents)
  && /TrialHumanApprovalRequired/.test(trialStore))
requireContract('consequential Production events are human-only in router and store', /PRODUCTION_HUMAN_EVENTS/.test(trialRuntime)
  && JSON.stringify(humanEventList(trialStore, 'HUMAN_COMMAND_EVENTS', 'SURFACE_WRITE_CAPABILITIES', 'production')) === JSON.stringify(expectedHumanProductionEvents)
  && /PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS/.test(productionRuntime)
  && JSON.stringify(humanEventList(productionRuntime, 'PRODUCTION_EVENTS', 'PRODUCTION_HUMAN_EVENTS', 'production')) === JSON.stringify(expectedHumanProductionEvents)
  && /TrialHumanApprovalRequired/.test(trialStore))
requireContract('Shop order and payment attribution is server authoritative',
  /commerce\.order\.created/.test(trialStore)
  && /authoritative_order\["createdAt"\] = captured_at/.test(trialStore)
  && /authoritative_movement\["actor"\] = principal\.actor_id/.test(trialStore)
  && /commerce\.payment\.reconciled/.test(trialStore)
  && /authoritative_order\["paymentReconciledAt"\] = captured_at/.test(trialStore)
  && /authoritative_order\["paymentReconciledBy"\] = principal\.actor_id/.test(trialStore))
requireContract('managed Shop order calculation is server-derived and tax-honest',
  /catalog_changes = state\.get\("catalogChanges", \[\]\)/.test(managedOrderCalculationAuthority)
  && /subtotal_mmk \+= quantity \* unit_price/.test(managedOrderCalculationAuthority)
  && /"catalogRevision": len\(catalog_changes\)/.test(managedOrderCalculationAuthority)
  && /"taxMode": "not_configured"/.test(managedOrderCalculationAuthority)
  && /"taxMmk": 0/.test(managedOrderCalculationAuthority)
  && /authoritative_order\["calculation"\] = calculation/.test(trialStore)
  && /a new order requires the current deterministic pricing calculation/.test(commerceRuntime))
requireContract('Shop catalog update attribution is server authoritative',
  /event_type == "commerce\.item\.updated"/.test(trialStore)
  && /authoritative_change\["proof"\] = deepcopy\(authoritative_evidence\)/.test(trialStore)
  && /authoritative_baseline\["proof"\] = deepcopy\(authoritative_evidence\)/.test(trialStore)
  && /authoritative_baseline\["anchorDigest"\]/.test(trialStore)
  && /authoritative_evidence\["actor"\] = principal\.actor_id/.test(trialStore)
  && /effective_captured_at = _not_before\(/.test(trialStore))
requireContract('managed Shop purchase receipts are server attributable and monotonic',
  /receipt\.get\("kind"\) != "receipt"/.test(managedPurchaseReceiptAuthority)
  && /receipt\.get\("actionId"\) != evidence\.get\("actionId"\)/.test(managedPurchaseReceiptAuthority)
  && /prior\.get\("purchaseOrderId"\) == purchase_order_id/.test(managedPurchaseReceiptAuthority)
  && /effective_captured_at = _not_before\(/.test(managedPurchaseReceiptAuthority)
  && /authoritative_movement\["actor"\] = principal\.actor_id/.test(managedPurchaseReceiptAuthority)
  && /authoritative_movement\["createdAt"\] = effective_captured_at/.test(managedPurchaseReceiptAuthority)
  && /authoritative\["evidence"\] = authoritative_evidence/.test(managedPurchaseReceiptAuthority))
requireContract('managed Shop purchase cancellations are server attributable and monotonic',
  /purchase_order\["cancellation"\]\.get\("actionId"\)/.test(managedPurchaseCancellationAuthority)
  && /movement\.get\("kind"\) == "receipt"/.test(managedPurchaseCancellationAuthority)
  && /movement\.get\("purchaseOrderId"\) == purchase_order_id/.test(managedPurchaseCancellationAuthority)
  && /effective_captured_at = _not_before\(/.test(managedPurchaseCancellationAuthority)
  && /authoritative_evidence\["actor"\] = principal\.actor_id/.test(managedPurchaseCancellationAuthority)
  && /authoritative_evidence\["capturedAt"\] = effective_captured_at/.test(managedPurchaseCancellationAuthority)
  && /authoritative_purchase_order\["cancellation"\] = deepcopy\(/.test(managedPurchaseCancellationAuthority))
requireContract('Shop return and completion attribution is server authoritative and monotonic',
  /commerce\.order\.return_recorded/.test(trialStore)
  && /authoritative_return\["actor"\] = principal\.actor_id/.test(trialStore)
  && /authoritative_return\["createdAt"\] = effective_captured_at/.test(trialStore)
  && /effective_captured_at = _not_before\(/.test(trialStore)
  && /authoritative_order\["completion"\] = deepcopy\(/.test(trialStore))
requireContract('Shop lifecycle action IDs remain state-bound before completion',
  /advancementActionIds/.test(commerceRuntime)
  && /order advancement must append one unique action ID/.test(commerceRuntime)
  && /advancementActionIds/.test(await read('showroom/src/core/commerce-workspace.ts')))
requireContract('Commerce action IDs cannot be reused across immutable command history', trialStore.includes("payload_json #>> '{evidence,actionId}'")
  && trialStore.includes(':commerce-action:')
  && trialStore.includes('_commerce_action_ids')
  && trialStore.includes('Commerce actionId was already used by an earlier command.'))
requireContract('audit events are immutable', /workspace_events_immutable/.test(migration) && /reject_workspace_event_mutation/.test(migration))
requireContract('private schema forces RLS', /create schema if not exists app_private/.test(migration) && /force row level security/gi.test(migration))
requireContract('browser roles have no private schema grant', /revoke all on schema app_private from public, anon, authenticated, service_role/.test(migration))
requireContract('approval transitions are controlled', /pending to approved or declined/.test(migration) && /APPROVAL_DECIDE_CAPABILITY/.test(trialRuntime))
requireContract('approval decisions require trusted human identity', /x-supermega-actor-kind/.test(runtime) && /v2\\n/.test(runtime) && /TrialHumanApprovalRequired/.test(trialStore) && /decided_actor_kind = 'human'/.test(migration) && /app\.actor_kind/.test(migration))
requireContract('approvals require a typed decision packet', /TrialDecisionPacket/.test(trialRuntime) && /TrialDecisionClaim/.test(trialRuntime) && /claim_type: Literal\["fact", "analysis"\]/.test(trialRuntime) && /status == "verified" and not digest/.test(trialStore) && /Every decision claim source_reference must be present in evidence_refs/.test(trialStore) && /DECISION_PACKET_CONTRACT = "decision_packet\.v1"/.test(trialStore) && /proposal_json ->> 'contract' = 'decision_packet\.v1'/.test(migration))
requireContract('approval decisions require a trimmed nonblank note', /note: str = Field\(min_length=1, max_length=500\)/.test(trialRuntime) && /decision note must not be blank/.test(trialRuntime) && /1 <= len\(note_value\) <= 500/.test(trialStore) && /decision_note = btrim\(decision_note\)/.test(decisionMigration) && /char_length\(decision_note\) between 1 and 500/.test(decisionMigration))
requireContract('managed schema contract advances through additive v2, v3, v4, and v5 migrations', /TRIAL_SCHEMA_VERSION = 5/.test(trialStore) && /set schema_version = 2/.test(decisionMigration) && /schema_version = 1/.test(decisionMigration) && /set schema_version = 3/.test(websiteMigration) && /schema_version = 2/.test(websiteMigration) && /set schema_version = 4/.test(hardeningMigration) && /schema version 3/.test(hardeningMigration) && /set schema_version = 5/.test(readCapabilityMigration) && /schema version 4/.test(readCapabilityMigration) && /workspace_state\.surface \|\| '\.read'/.test(readCapabilityMigration) && /'approvals\.read'/.test(readCapabilityMigration))
requireContract('managed database role collision is rejected before foundation grants', /pre-existing supermega trial backend role attributes are unsafe/.test(rolePreflight) && /dependency\.refclassid = 'pg_authid'::regclass/.test(rolePreflight) && migration.indexOf('backend_role_preflight') < migration.indexOf('create schema if not exists app_private'))
requireContract('managed database readiness validator targets exact PostgreSQL and schema contracts', /CONTRACT = "supermega_private_trial_database_v5"/.test(databaseValidator) && /EXPECTED_POSTGRES_MAJOR = 17/.test(databaseValidator) && /pg_db_role_setting/.test(databaseValidator) && /SCHEMA_VERSION = 5/.test(databaseValidator) && /complete v5 schema contract/.test(databaseValidator) && /EXPECTED_POLICY_FINGERPRINTS/.test(databaseValidator) && /security_constraints_exact/.test(databaseValidator))
requireContract('managed clients treat capability-filtered product states as partial', /states: Partial<Record<ManagedSurface, ManagedStateRecord>>/.test(managedTrialClient) && /requireManagedSurfaceState/.test(managedTrialClient) && /trial_capability_required/.test(managedTrialClient) && /requireManagedSurfaceState\(bootstrap, 'commerce', 'Shop'\)/.test(coreApp) && /requireManagedSurfaceState\(bootstrap, 'production', 'Plant'\)/.test(coreApp))
requireContract('managed bootstrap responses stay bound to the exact actor', /export function sameManagedIdentity/.test(managedTrialClient) && /loadManagedBootstrap\(managedIdentity\)/.test(coreApp) && /loadManagedBootstrap\(identity\)/.test(settingsPage) && !/loadManagedBootstrap\(\)/.test(`${coreApp}\n${settingsPage}`) && /sameManagedIdentity\(identityRef\.current, managedIdentity\)/.test(coreApp))
requireContract('Website hides browser-local records from managed roles without Website access', /error instanceof ManagedTrialError && error\.code === 'trial_capability_required'/.test(websiteWorkspaceHook) && /Browser-local Website content is hidden while this managed account is connected/.test(websiteWorkspaceHook) && /setWorkspace\(hiddenLocalWorkspace\)/.test(websiteWorkspaceHook))
requireContract('in-memory idempotent replay is actor-bound', /stored_actor_id != actor_id/.test(trialStore) && /stored_actor_kind != actor_kind/.test(trialStore))
requireContract('Python runtime dependencies are minimal', !/beautifulsoup|google-cloud|sentry|sqlmodel|python-dotenv/i.test(requirements))
requireContract('Cloud Run uses the canonical ASGI entrypoint', /uvicorn api_app:app/.test(dockerfile) && /COPY supermega_runtime \/app\/supermega_runtime/.test(dockerfile) && !/serve_solution/.test(dockerfile))
requireContract('release CI executes every API test', workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && workflow.includes("- 'supermega_runtime/**'"))
requireContract('environment example exposes only canonical server contracts', /SUPERMEGA_HOSTED_SCHEDULER_ENABLED=0/.test(appEnvironment) && /SUPERMEGA_SCHEDULER_ACTIVATION_EVIDENCE=/.test(appEnvironment) && /SUPERMEGA_SCHEDULER_ACTIVATION_SIGNING_SECRET=/.test(appEnvironment) && /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(appEnvironment) && /SUPERMEGA_TRIAL_WRITES_ENABLED=0/.test(appEnvironment) && !/OPENAI_API_KEY|ANTHROPIC|STRIPE|VITE_SUPABASE|SUPERMEGA_APP_PASSWORD/.test(appEnvironment))
requireContract('hosted agent scheduler has bounded jobs, explicit activation, and explicit egress', /SCHEDULER_ENABLED_ENV = "SUPERMEGA_HOSTED_SCHEDULER_ENABLED"/.test(cloudRuntime) && /scheduler_activation_disabled/.test(cloudRuntime) && /activation_enabled/.test(cloudRuntime) && /SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS/.test(cloudRuntime) && /AGENT_AUTOMATION_LANES/.test(cloudRuntime) && /"queue": \("task_triage", "ops_watch"\)/.test(agentGovernance) && /"daily": \("founder_brief", "github_release_watch"\)/.test(agentGovernance) && /ProxyHandler\(\{\}\)/.test(cloudRuntime) && /_NoRedirectHandler/.test(cloudRuntime))
requireContract('hosted scheduler activation is signed, fresh, exact-project, and exact-release bound', /verify_scheduler_activation_evidence/.test(cloudRuntime) && /VERCEL_GIT_COMMIT_SHA/.test(cloudRuntime) && /VERCEL_PROJECT_ID/.test(cloudRuntime) && /VERCEL_ENV/.test(cloudRuntime) && /supermega\.scheduler-activation-evidence\.v1/.test(schedulerActivation) && /object_pairs_hook=_object_without_duplicate_keys/.test(schedulerActivation) && /hmac\.compare_digest/.test(schedulerActivation) && /CANONICAL_SCHEDULER_PROJECT_ID/.test(schedulerActivation) && /REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS/.test(schedulerActivation) && /activation_evidence_expired/.test(schedulerActivation))
requireContract('hosted agent scheduler reports side effects fail closed', /worker_side_effect_report_required/.test(cloudRuntime) && /worker_reported_unverified/.test(cloudRuntime) && /_MAX_WORKER_RESPONSE_BYTES/.test(cloudRuntime))
requireContract('managed database activation audit is read-only and fail closed', /set transaction read only/i.test(databaseValidator) && /rolbypassrls/i.test(databaseValidator) && /relforcerowsecurity/i.test(databaseValidator) && /mutation_statements_executed": 0/.test(databaseValidator) && /database_connection_or_audit_failed/.test(databaseValidator))
requireContract('managed activation evidence plan is bounded, explicit, and redacted', /def _activation_evidence_plan\(/.test(runtime) && /"id": "postgres17_rehearsal"/.test(runtime) && /"id": "runtime_role_audit"/.test(runtime) && /"id": "identity_gateway"/.test(runtime) && /"id": "storage_privacy"/.test(runtime) && /"id": "write_acceptance"/.test(runtime) && /"evidence_plan": evidence_plan/.test(runtime) && /"evidence_ready": all\(item\["ready"\] for item in evidence_plan\)/.test(runtime) && /secret_values_exposed": False/.test(runtime) && !/_activation_evidence_plan[\s\S]{0,3500}(password|token|secret|key)=/i.test(runtime))
requireContract('managed database runtime is Supavisor transaction-pool safe', /autocommit": False/.test(trialStore) && /prepare_threshold": None/.test(trialStore) && /with connection\.transaction\(\)/.test(trialStore) && /set_config\('app\.workspace_id', %s, true\)/.test(trialStore) && /sslmode/.test(trialStore) && /supermega-trial-runtime/.test(trialStore))
requireContract('managed database runtime revalidates role and TLS per connection', /_assert_runtime_role/.test(trialStore) && /rolbypassrls/.test(trialStore) && /pg_stat_ssl/.test(trialStore) && /"role_ready": readiness\.role_ready/.test(runtime) && /managed_trial_runtime_role_unsafe/.test(liveVerifier))
requireContract('managed database secret handoff is atomic and sensitive', /--force/.test(databaseActivator) && /--sensitive/.test(databaseActivator) && /--project megaos/.test(databaseActivator) && !/vercel env rm/.test(databaseActivator))
requireContract('managed storage privacy proof is bounded, read-only, owner-confirmed, and redacted',
  /supermega\.private-storage-privacy\.v1/.test(storagePrivacyVerifier)
  && /supabase_storage_rest_v2/.test(storagePrivacyVerifier)
  && /--confirm-read-only-audit/.test(storagePrivacyVerifier)
  && /ProxyHandler\(\{\}\)/.test(storagePrivacyVerifier)
  && /_NoRedirectHandler/.test(storagePrivacyVerifier)
  && /MAX_RESPONSE_BYTES = 32_768/.test(storagePrivacyVerifier)
  && /MAX_REQUESTS = 6/.test(storagePrivacyVerifier)
  && /SIGNED_URL_TTL_SECONDS = 60/.test(storagePrivacyVerifier)
  && /READ_ONLY_METHODS = frozenset\(\{"GET", "HEAD", "POST"\}\)/.test(storagePrivacyVerifier)
  && /service_role_key_forbidden/.test(storagePrivacyVerifier)
  && /persistent_mutations_performed": 0/.test(storagePrivacyVerifier)
  && /secrets_exposed": False/.test(storagePrivacyVerifier)
  && workflow.includes('npm run storage:privacy:self-test')
  && workflow.includes('node tools/verify_app_security_contract.mjs')
  && workflow.includes("- 'tools/verify_private_storage_privacy.py'")
  && workflow.includes("- 'tools/verify_app_security_contract.mjs'")
  && rootPackage.scripts?.['storage:privacy:self-test'] === 'node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --self-test')

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_security', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_security', checks: checks.length }, null, 2))
