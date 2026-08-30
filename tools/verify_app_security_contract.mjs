import { readFile as readRawFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const normalizeSourceText = (value) => value.replace(/\r\n?/g, '\n')
const read = async (path) => normalizeSourceText(await readRawFile(resolve(root, path), 'utf8'))
const commerceWorkspace = await import(pathToFileURL(resolve(root, 'showroom/src/core/commerce-workspace.ts')).href)
const [runtime, supabaseAuth, cloudRuntime, schedulerActivation, agentGovernance, vercelEntry, portableEntry, trialRuntime, trialStore, commerceRuntime, productionRuntime, websiteRuntime, managedTrialClient, coreApp, workspaceRuntime, settingsPage, websiteWorkspaceHook, rolePreflight, foundationMigration, decisionMigration, websiteMigration, hardeningMigration, readCapabilityMigration, databaseValidator, databaseActivator, managedRuntimeEnvironmentVerifier, liveVerifier, workflow, requirements, dockerfile, appEnvironment, storagePrivacyVerifier, appRouter, coreShell, visionProduct, visionStyles, visionProofRaw] = await Promise.all([
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
  read('showroom/src/core/workspace-runtime.ts'),
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
  read('tools/verify_managed_runtime_environment_values.mjs'),
  read('tools/verify_app_release_live.mjs'),
  read('.github/workflows/supermega-app-deploy.yml'),
  read('requirements.txt'),
  read('Dockerfile'),
  read('.env.app.example'),
  read('tools/verify_private_storage_privacy.py'),
  read('showroom/src/App.tsx'),
  read('showroom/src/core/CoreShell.tsx'),
  read('showroom/src/products/vision/VisionProduct.tsx'),
  read('showroom/src/products/vision/vision-product.css'),
  read('showroom/src/products/vision/vision-proof.json'),
])
const activationMigration = await read('supabase/migrations/20260730113000_private_trial_backend_v6_managed_activation.sql')
const workspaceDiscoveryMigration = await read('supabase/migrations/20260730123000_private_trial_backend_v7_workspace_discovery.sql')
const rlsInitplanMigration = await read('supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql')
const metadataRlsMigration = await read('supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql')
const sessionRevocationMigration = await read('supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql')
const selfServeGrantsMigration = await read('supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql')
const publicBrowserQuarantine = await read('supabase/rehearsal/20260804_public_browser_quarantine.sql')
const publicBrowserQuarantineVerifier = await read('tools/verify_public_browser_quarantine.mjs')
const managedActivation = await read('supermega_runtime/managed_activation.py')
const managedEnvironmentValueVerifier = await read('tools/verify_managed_runtime_environment_values.mjs')
const runtimeRoleProvisioner = await read('tools/provision_supermega_runtime_role.py')
const managedAccountPage = await read('showroom/src/core/ManagedAccountPage.tsx')
const consoleApi = await read('kernel/console/api.mjs')
const consoleStore = await read('kernel/store.mjs')
const consoleDeal = await read('kernel/console/deal.mjs')
const consoleDealPacketTest = await read('kernel/console-deal-packet.test.mjs')
const consoleErrorRecordingTest = await read('kernel/console-error-recording.test.mjs')
const visionProof = JSON.parse(visionProofRaw)
const migration = `${rolePreflight}\n${foundationMigration}\n${decisionMigration}\n${websiteMigration}\n${hardeningMigration}\n${readCapabilityMigration}\n${activationMigration}\n${workspaceDiscoveryMigration}\n${rlsInitplanMigration}\n${metadataRlsMigration}\n${sessionRevocationMigration}`
const productionMaterialHandoff = await read('supermega_runtime/production_material_handoff.py')
const managedContextRuntime = await read('supermega_runtime/managed_context.py')
const managedContextClient = await read('showroom/src/core/managed-context.ts')
const managedContextConsent = await read('showroom/src/core/ManagedContextConsent.tsx')
const operatingBaselineClient = await read('showroom/src/core/operating-baseline.ts')
const companyBackupClient = await read('showroom/src/core/company-backup.ts')
const companyBackupPanel = await read('showroom/src/core/CompanyBackupPanel.tsx')
const companyBriefRuntime = await read('supermega_runtime/company_brief.py')
const clientProvisioning = await read('supermega_runtime/client_provisioning.py')
const siteManifest = await read('site-manifest.json')
const shopInventoryRuntime = await read('supermega_runtime/shop_inventory_runtime.py')
const orderIntakeProvider = await read('supermega_runtime/order_intake_provider.py')
const clientImportRuntime = await read('supermega_runtime/client_import_runtime.py')
const clientOnboardingUi = await read('showroom/src/core/ClientDataOnboarding.tsx')
const clientOnboardingModel = await read('showroom/src/core/client-onboarding.ts')
const plantIndustryPacks = await read('showroom/src/core/plant-industry-packs.ts')
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
const managedSupplierReturnAuthority = trialStore.slice(
  trialStore.indexOf('if event_type == "commerce.supplier_return.authorized":'),
  trialStore.indexOf('if event_type == "commerce.supplier_credit.recorded":'),
)
const managedSupplierCreditAuthority = trialStore.slice(
  trialStore.indexOf('if event_type == "commerce.supplier_credit.recorded":'),
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
  'commerce.collection_action.recorded',
  'commerce.customer_credit_policy.saved',
  'commerce.inventory.initialized',
  'commerce.inventory.master_created',
  'commerce.inventory.supplier_policy_saved',
  'commerce.inventory.transferred',
  'commerce.item.created',
  'commerce.item.updated',
  'commerce.order.advanced',
  'commerce.order.cancelled',
  'commerce.order.correction_recorded',
  'commerce.order.created',
  'commerce.order.return_recorded',
  'commerce.order.support_case_opened',
  'commerce.order.support_case_reopened',
  'commerce.order.support_case_resolved',
  'commerce.order.support_case_service_recorded',
  'commerce.payment.reconciled',
  'commerce.payment_policy.saved',
  'commerce.production_batch.received',
  'commerce.production_material.issued',
  'commerce.production_material.returned',
  'commerce.promotion_policy.saved',
  'commerce.purchase_budget.approved',
  'commerce.purchase_order.cancelled',
  'commerce.purchase_order.created',
  'commerce.purchase_order.received',
  'commerce.purchase_requisition.approved',
  'commerce.refund.settled',
  'commerce.service_schedule.initialized',
  'commerce.service_schedule.saved',
  'commerce.shipping_policy.saved',
  'commerce.stock.counted',
  'commerce.stock.received',
  'commerce.storefront.configuration.saved',
  'commerce.storefront.merchandising.imported',
  'commerce.supplier_credit.recorded',
  'commerce.supplier_invoice.payable_ready',
  'commerce.supplier_invoice.recorded',
  'commerce.supplier_return.authorized',
  'commerce.supplier_sourcing.approved',
  'commerce.tax_configuration.saved',
  'commerce.website_intake.converted',
  'commerce.workspace.initialized',
]
const expectedHumanProductionEvents = [
  'production.downtime.ended',
  'production.downtime.started',
  'production.equipment.commissioned',
  'production.equipment_maintenance_strategy.saved',
  'production.equipment_master.imported',
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
  'production.shift.closed',
  'production.workspace.initialized',
]
const expectedHumanWebsiteEvents = [
  'website.evidence.recorded',
  'website.inquiry.received',
  'website.inquiry.reviewed',
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
  && /_require_spa_owner_schedule_action\(readiness, next_state\)/.test(serviceScheduleRoute)
  && /latest_event\["happenedAt"\] = _current_utc_timestamp\(\)/.test(serviceScheduleRoute)
  && /"privacy_owner"/.test(serviceScheduleRoute)
  && /event_type=event_type/.test(serviceScheduleRoute)
  && /commerce\.service_schedule\.initialized/.test(trialStore)
  && /commerce\.service_schedule\.saved/.test(trialStore)
  && /_validate_service_schedule_initialized/.test(commerceRuntime)
  && /service schedule evidence history is immutable/.test(commerceRuntime)
  && /client_retention_set/.test(commerceRuntime)
  && /client_exported/.test(commerceRuntime)
  && /client_anonymized/.test(commerceRuntime)
  && /_service_client_export_csv/.test(commerceRuntime)
  && /contains overlapping bookings/.test(commerceRuntime))
requireContract('runtime exposes bounded health truth', /operating_mode = "managed_trial" if not requirements else "isolated_demo"/.test(runtime) && /"operating_mode": operating_mode/.test(runtime) && /"browser_service_role_exposed": False/.test(runtime))
requireContract('managed browser auth is readiness gated and cannot accept a secret key', /runtime\.status === 'enterprise' && managedTrialAuthConfigured\(\)/.test(settingsPage) && /validPublishableKey/.test(managedTrialClient) && !/VITE_SUPABASE_(?:SERVICE_ROLE|SECRET)/.test(managedTrialClient))
requireContract('managed approval evidence is never persisted in demo storage', /localApprovalsOnly/.test(workspaceRuntime) && /persist \? persist\(normalizedState\)/.test(workspaceRuntime) && /current\.filter\(\(approval\) => !approval\.managed\)/.test(settingsPage))
requireContract('production CORS is bounded',
  /https:\/\/app\.supermega\.dev,https:\/\/supermega\.dev/.test(runtime)
  && /def _cors_origins\(value: object\)/.test(runtime)
  && /origin == "null"/.test(runtime)
  && /"\*" in origin/.test(runtime)
  && /parsed\.username is not None/.test(runtime)
  && /parsed\.scheme\.casefold\(\) != "https" and not loopback/.test(runtime)
  && /"strict_exact_origins": True/.test(runtime)
  && !/allow_origins=\["\*"\]/.test(runtime))
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
requireContract('Plant client packs are package-bound, tenant-retained, fail-closed, and require reviewed costs',
  /PLANT_INDUSTRY_PACK_IDS/.test(clientImportRuntime)
  && /package\["plantIndustryPackId"\]/.test(clientImportRuntime)
  && /\{"plantIndustryPackId": plant_industry_pack_id\}/.test(clientImportRuntime)
  && /"industryPackId": industry_pack_id/.test(trialRuntime)
  && /_PLANT_INDUSTRY_PACK_IDS/.test(productionRuntime)
  && /openingPlan\.industryPackId !== stagingPackage\.plantIndustryPackId/.test(managedTrialClient)
  && /plantIndustryPackIdRef\.current !== expectedPlantIndustryPackId/.test(clientOnboardingUi)
  && /standardCostPerUnitMmk: ''/.test(plantIndustryPacks)
  && /standardCostPerMinuteMmk: ''/.test(plantIndustryPacks))
requireContract('Website and Ecommerce client activation provenance is package-bound and server-stamped',
  /supermega\.website\.opening-plan\.v1/.test(websiteRuntime)
  && /Website opening plan is immutable after activation/.test(websiteRuntime)
  && /"workflowTemplateId": package\["workflowTemplateId"\]/.test(trialRuntime)
  && /authoritative_state\["openingPlan"\]/.test(trialStore)
  && /openingPlan\.packageDigest !== expectedPackageDigest/.test(managedTrialClient)
  && /supermega\.ecommerce\.activation\.v1/.test(commerceRuntime)
  && /"packageDigest": validation\.package_digest/.test(commerceRuntime)
  && /Ecommerce activation provenance is immutable while imported content is retained/.test(commerceRuntime)
  && /Ecommerce activation provenance must be cleared when imported content changes/.test(commerceRuntime)
  && /activation\.packageDigest !== expectedPackageDigest/.test(managedTrialClient)
  && /activation\.skus/.test(managedTrialClient))
requireContract('client demo setup kits are bounded, canonical, and explicitly data-free',
  /CLIENT_DEMO_KIT_MAX_BYTES = 128 \* 1024/.test(clientOnboardingModel)
  && /export function restoreClientDemoKit/.test(clientOnboardingModel)
  && /!hasExactKeys\(value, \['schema', 'blueprint', 'exportedAt', 'controls'\]\)/.test(clientOnboardingModel)
  && /canonicalClientDemoBlueprint\(source\.blueprint\)/.test(clientOnboardingModel)
  && /source\.controls\.clientRecordsIncluded !== false/.test(clientOnboardingModel)
  && /source\.controls\.productProgressIncluded !== false/.test(clientOnboardingModel)
  && /source\.controls\.humanReviewRequired !== true/.test(clientOnboardingModel)
  && /file\.size < 1 \|\| file\.size > CLIENT_DEMO_KIT_MAX_BYTES/.test(settingsPage)
  && /origin === 'created' && blueprint\.products\.some/.test(settingsPage)
  && /Client records, product packs, and progress were not changed/.test(settingsPage))
requireContract('managed Shop location inventory and order allocation are human-only, server-stamped, and digest-chained',
  /commerce\.inventory\.initialized/.test(managedTrialClient)
  && /commerce\.inventory\.master_created/.test(managedTrialClient)
  && /commerce\.inventory\.transferred/.test(managedTrialClient)
  && /_validate_inventory_initialized/.test(commerceRuntime)
  && /_validate_inventory_master_created/.test(commerceRuntime)
  && /_validate_inventory_transferred/.test(commerceRuntime)
  && /master_create/.test(shopInventoryRuntime)
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
requireContract('managed supplier return claims are server attributable and remain internal-only',
  /supplier_return\.get\("receiptMovementId"\)/.test(managedSupplierReturnAuthority)
  && /effective_captured_at = _not_before\(/.test(managedSupplierReturnAuthority)
  && /"actor": principal\.actor_id/.test(managedSupplierReturnAuthority)
  && /"createdAt": effective_captured_at/.test(managedSupplierReturnAuthority)
  && /"authorization": deepcopy\(authoritative_evidence\)/.test(managedSupplierReturnAuthority)
  && /physicalReturnStatus/.test(commerceRuntime)
  && /not_dispatched/.test(commerceRuntime)
  && /supplierContacted/.test(commerceRuntime)
  && /accountingPosted/.test(commerceRuntime))
requireContract('managed supplier credits are server attributable and do not imply accounting posting',
  /credit_note\.get\("issuedAt"\)/.test(managedSupplierCreditAuthority)
  && /effective_captured_at = _not_before\(/.test(managedSupplierCreditAuthority)
  && /"actor": principal\.actor_id/.test(managedSupplierCreditAuthority)
  && /"recording": deepcopy\(authoritative_evidence\)/.test(managedSupplierCreditAuthority)
  && /accountingPosted/.test(commerceRuntime))
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
requireContract('managed schema contract advances through additive v2 through v11 migrations', /def _env_schema_version\(default: int = 10\) -> int:/.test(trialStore) && /TRIAL_SCHEMA_VERSION = _env_schema_version\(\)/.test(trialStore) && /set schema_version = 11/.test(selfServeGrantsMigration) && /private trial backend v11 requires schema version 10/.test(selfServeGrantsMigration) && /authorization_contract = 'self_serve_claim_v1'/.test(selfServeGrantsMigration) && /current_setting\('app\.workspace_id', true\)/.test(selfServeGrantsMigration) && /set schema_version = 2/.test(decisionMigration) && /schema_version = 1/.test(decisionMigration) && /set schema_version = 3/.test(websiteMigration) && /schema_version = 2/.test(websiteMigration) && /set schema_version = 4/.test(hardeningMigration) && /schema version 3/.test(hardeningMigration) && /set schema_version = 5/.test(readCapabilityMigration) && /schema version 4/.test(readCapabilityMigration) && /set schema_version = 6/.test(activationMigration) && /schema version 5/.test(activationMigration) && /set schema_version = 7/.test(workspaceDiscoveryMigration) && /schema version 6/.test(workspaceDiscoveryMigration) && /set schema_version = 8/.test(rlsInitplanMigration) && /schema version 7/.test(rlsInitplanMigration) && /set schema_version = 9/.test(metadataRlsMigration) && /schema version 8/.test(metadataRlsMigration) && /set schema_version = 10/.test(sessionRevocationMigration) && /schema version 9/.test(sessionRevocationMigration) && /alter table app_private\.trial_schema_meta enable row level security/.test(metadataRlsMigration) && /to supermega_trial_backend/.test(metadataRlsMigration) && /using \(component = 'private_trial_backend'\)/.test(metadataRlsMigration) && !/force row level security/.test(metadataRlsMigration) && (rlsInitplanMigration.match(/drop policy/g) || []).length === 10 && !rlsInitplanMigration.replace(/\(\s*select\s+current_setting\(/g, '').includes('current_setting(') && /workspace_state\.surface \|\| '\.read'/.test(readCapabilityMigration) && /'approvals\.read'/.test(readCapabilityMigration))
requireContract('managed runtime keeps operational workspace gates and caller-only discovery', /workspace_access_controls/.test(activationMigration) && /workspace access can only transition from active to suspended/.test(activationMigration) && /create function app_private\.workspace_is_active/.test(activationMigration) && /workspace_memberships_access_gate/.test(activationMigration) && /workspace_state_access_gate/.test(activationMigration) && /workspace_events_access_gate/.test(activationMigration) && /approval_requests_access_gate/.test(activationMigration) && /create function app_private\.actor_workspace_directory\(\)/.test(workspaceDiscoveryMigration) && /security definer/.test(workspaceDiscoveryMigration) && /revoke all on function app_private\.actor_workspace_directory\(\)/.test(workspaceDiscoveryMigration) && /actor_id = current_setting\('app\.actor_id'/.test(workspaceDiscoveryMigration) && /access_control\.status = 'active'/.test(workspaceDiscoveryMigration) && /set transaction read only/.test(trialStore) && /from app_private\.actor_workspace_directory\(\)/.test(trialStore))
requireContract('managed workspace directory requires verified named-user bearer auth and bounded redacted output', /resolve_workspace_discovery_principal/.test(runtime) && /verify_supabase_user_identity/.test(runtime) && /@app\.get\("\/api\/trial\/v1\/workspaces"\)/.test(runtime) && /list_actor_workspaces\(principal, limit=50\)/.test(runtime) && /supermega\.managed_workspace_directory\.v1/.test(runtime) && /external_writes_performed": False/.test(runtime) && /secret_values_exposed": False/.test(runtime) && /signInAndDiscoverManagedWorkspaces/.test(managedTrialClient) && /completeManagedWorkspaceSignIn/.test(managedTrialClient))
requireContract('managed Supabase sessions are database-checked before membership, discovery, and activation', /session_id=identity\.session_id/.test(runtime) && /identity_provider="supabase"/.test(runtime) && /_assert_active_identity_session\(cursor, normalized\)/.test(trialStore) && /supabase_session_is_active/.test(trialStore) && /from auth\.sessions as session_record/.test(sessionRevocationMigration) && /security definer/.test(sessionRevocationMigration) && /set search_path = ''/.test(sessionRevocationMigration) && /from public, anon, authenticated, service_role/.test(sessionRevocationMigration) && /to supermega_trial_backend/.test(sessionRevocationMigration) && /verified_owner_session_id/.test(managedActivation))
requireContract('legacy public Data API access has an exact fail-closed browser quarantine',
  /^begin;/m.test(publicBrowserQuarantine)
  && /current_user <> 'postgres'/.test(publicBrowserQuarantine)
  && /observed_tables <> expected_tables/.test(publicBrowserQuarantine)
  && /observed_sequences <> expected_sequences/.test(publicBrowserQuarantine)
  && /browser-callable routine/.test(publicBrowserQuarantine)
  && (publicBrowserQuarantine.match(/revoke all privileges on table public\./g) || []).length === 27
  && (publicBrowserQuarantine.match(/alter default privileges for role (?:postgres|supabase_admin) in schema public/g) || []).length === 6
  && /from public, anon, authenticated/.test(publicBrowserQuarantine)
  && /has_table_privilege\(\s*'service_role',\s*'public\.supermega_leads'/m.test(publicBrowserQuarantine)
  && /commit;\s*$/.test(publicBrowserQuarantine))
requireContract('public browser quarantine is compatibility, idempotence, drift, and server-path verified',
  /omitLastTable: true/.test(publicBrowserQuarantineVerifier)
  && /schemaDriftRejected: true/.test(publicBrowserQuarantineVerifier)
  && /serviceRolePreserved: true/.test(publicBrowserQuarantineVerifier)
  && /idempotent: true/.test(publicBrowserQuarantineVerifier)
  && /productionMutated: false/.test(publicBrowserQuarantineVerifier)
  && rootPackage.scripts?.['database:public-browser-quarantine:verify'] === 'node tools/verify_public_browser_quarantine.mjs'
  && rootPackage.scripts?.['app:verify'] === 'node tools/run_app_verify.mjs --serial'
  && rootPackage.scripts?.['app:verify:steps']?.includes('database:public-browser-quarantine:verify'))
requireContract('managed account links are explicitly bounded, single-flight, scrubbed, and excluded from behavior memory', /detectSessionInUrl: false/.test(managedTrialClient) && /AUTH_CODE = \/\^\[A-Za-z0-9\._~\-\]\{16,2048\}\$\//.test(managedTrialClient) && /AUTH_TOKEN = \/\^\[A-Za-z0-9\._~\-\]\{16,16384\}\$\//.test(managedTrialClient) && /exactAuthParameters/.test(managedTrialClient) && /rawQuery\.length > 4096/.test(managedTrialClient) && /rawFragment\.length > 40000/.test(managedTrialClient) && /new Set\(purposes\)\.size > 1/.test(managedTrialClient) && /pendingManagedAccountSetup/.test(managedTrialClient) && /window\.history\.replaceState\(window\.history\.state, '', '\/account\/setup'\)/.test(managedTrialClient) && /exchangeCodeForSession\(code\)/.test(managedTrialClient) && /setSession\(\{/.test(managedTrialClient) && /const sensitiveAccountRoute = location\.pathname\.startsWith\('\/account\/'\)/.test(coreShell) && /const route = sensitiveAccountRoute \? location\.pathname/.test(coreShell))
requireContract('managed recovery is non-enumerating and password setup remains named-user only', /resetPasswordForEmail/.test(managedTrialClient) && /redirectTo: managedAccountRedirectUrl\(\)/.test(managedTrialClient) && /origin\.protocol !== 'https:'/.test(managedTrialClient) && /password\.length < 12/.test(managedTrialClient) && /updateUser\(\{ password \}\)/.test(managedTrialClient) && /data\.user\.is_anonymous !== false/.test(managedTrialClient) && /For privacy, the result is the same whether or not the address has an account\./.test(managedAccountPage) && /If this email belongs to a managed account/.test(managedAccountPage))
requireContract('managed password setup requires current callback evidence even when a named session exists', /\} else \{\n    throw accountLinkError\(\)\n  \}\n\n  forgetWorkspace/.test(managedTrialClient) && !/initializeManagedAccountSetup[\s\S]*?supabase\.auth\.getSession\(\)[\s\S]*?export function beginManagedAccountSetup/.test(managedTrialClient))
requireContract('managed activation requires durable named-owner authorization and encrypted admin transport', /ACTIVATION_AUTHORIZATION_CONTRACT/.test(managedActivation) && /"contract": "decision_packet\.v1"/.test(managedActivation) && /from app_private\.approval_requests/.test(managedActivation) && /verify_supabase_user_identity/.test(managedActivation) && /Durable owner authorization is missing/.test(managedActivation) && /explicit encrypted sslmode/.test(managedActivation) && /--untracked-files=all/.test(managedActivation))
requireContract('client owner onboarding is create-only, privacy scrubbed, live-auth verified, and activation-bound without copied identity', /supermega\.client_owner_identity_plan\.v1/.test(await read('tools/manage_client_owner_identity.py')) && /invite_named_owner/.test(await read('tools/manage_client_owner_identity.py')) && /verify_supabase_user_identity/.test(await read('tools/manage_client_owner_identity.py')) && /authorizationFromUserMetadataAllowed/.test(await read('tools/manage_client_owner_identity.py')) && /containsRawEmail/.test(await read('tools/manage_client_owner_identity.py')) && /providerCallsPerformed/.test(await read('tools/manage_client_owner_identity.py')) && /prepare-activation/.test(await read('tools/manage_client_owner_identity.py')) && /compile_proof_bound_activation/.test(await read('tools/manage_client_owner_identity.py')) && !/prepare_activation\.add_argument\("--owner-actor-id"/.test(await read('tools/manage_client_owner_identity.py')) && rootPackage.scripts?.['client:owner-identity'] === 'python -s tools/manage_client_owner_identity.py' && rootPackage.scripts?.['client:prepare:self-test']?.includes('tests.test_client_owner_identity'))
requireContract('managed database role collision is rejected before foundation grants', /pre-existing supermega trial backend role attributes are unsafe/.test(rolePreflight) && /dependency\.refclassid = 'pg_authid'::regclass/.test(rolePreflight) && migration.indexOf('backend_role_preflight') < migration.indexOf('create schema if not exists app_private'))
requireContract('hosted database administration cannot inherit or set the backend role', /member_role\.rolname = 'postgres'/.test(hardeningMigration) && /grantor_role\.rolname in \('postgres', 'supabase_admin'\)/.test(hardeningMigration) && /not membership\.inherit_option/.test(hardeningMigration) && /not membership\.set_option/.test(hardeningMigration) && /safe_hosted_admin_membership/.test(databaseValidator) && /row\.get\("inherit_option"\) is False/.test(databaseValidator) && /row\.get\("set_option"\) is False/.test(databaseValidator))
requireContract('managed database readiness validator targets exact PostgreSQL and schema contracts', /CONTRACT = "supermega_private_trial_database_v11"/.test(databaseValidator) && /EXPECTED_POSTGRES_MAJOR = 17/.test(databaseValidator) && /pg_db_role_setting/.test(databaseValidator) && /SCHEMA_VERSION = 11/.test(databaseValidator) && /complete v11 schema contract/.test(databaseValidator) && /workspace_access_controls_self_serve_insert/.test(databaseValidator) && /workspace_memberships_self_serve_insert/.test(databaseValidator) && /metadata_table_rls/.test(databaseValidator) && /select current_setting\('app\.workspace_id'/.test(databaseValidator) && /workspace_access_controls/.test(databaseValidator) && /workspace_is_active/.test(databaseValidator) && /supabase_session_is_active/.test(databaseValidator) && /RESTRICTIVE/.test(databaseValidator) && /EXPECTED_POLICY_FINGERPRINTS/.test(databaseValidator) && /security_constraints_exact/.test(databaseValidator))
requireContract('managed Vercel mode requires value-aware target, dedicated runtime login, TLS, browser-auth, and write-flag proof', /managed_database_target_or_tls_invalid/.test(managedEnvironmentValueVerifier) && /managed_browser_auth_url_invalid/.test(managedEnvironmentValueVerifier) && /managed_browser_publishable_key_invalid/.test(managedEnvironmentValueVerifier) && /managed_writes_flag_not_enabled/.test(managedEnvironmentValueVerifier) && /runtimeRole = 'supermega_trial_login'/.test(managedEnvironmentValueVerifier) && /username === `\$\{runtimeRole\}\.\$\{projectRef\}`/.test(managedEnvironmentValueVerifier) && /parsed\.port === '6543'/.test(managedEnvironmentValueVerifier) && /queryKeys\.length === 1/.test(managedEnvironmentValueVerifier) && /secretValuesExposed: false/.test(managedEnvironmentValueVerifier))
requireContract('managed clients treat capability-filtered product states as partial', /states: Partial<Record<ManagedSurface, ManagedStateRecord>>/.test(managedTrialClient) && /requireManagedSurfaceState/.test(managedTrialClient) && /trial_capability_required/.test(managedTrialClient) && /requireManagedSurfaceState\(bootstrap, 'commerce', 'Shop'\)/.test(workspaceRuntime) && /requireManagedSurfaceState\(bootstrap, 'production', 'Plant'\)/.test(workspaceRuntime))
requireContract('managed product entitlements constrain server capabilities and direct data access', /def capabilities_for_product_entitlements\(/.test(trialStore) && /An explicit empty or malformed grant/.test(trialStore) && (trialStore.match(/capabilities = capabilities_for_product_entitlements\(/g) || []).length >= 2 && /product_entitlements = self\._product_entitlements\(/.test(trialStore) && /store\.get_state\(principal, "production"\)/.test(await read('tests/test_product_entitlements.py')) && /test_activation_entitlements_override_mismatched_product_capabilities/.test(await read('tests/test_trial_runtime.py')))
requireContract('managed bootstrap responses stay bound to the exact actor', /export function sameManagedIdentity/.test(managedTrialClient) && /loadManagedBootstrap\(managedIdentity\)/.test(workspaceRuntime) && /loadManagedBootstrap\(identity\)/.test(settingsPage) && !/loadManagedBootstrap\(\)/.test(`${coreApp}\n${workspaceRuntime}\n${settingsPage}`) && /sameManagedIdentity\(identityRef\.current, managedIdentity\)/.test(workspaceRuntime))
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
requireContract('production Supabase target requires separately committed activation authority', /productionSupabaseTargetStatus/.test(databaseActivator) && /protected-unapproved/.test(databaseActivator) && /activation-approved/.test(databaseActivator) && /ProductionHandoff is blocked until the committed Supabase target status is activation-approved/.test(databaseActivator))
requireContract('managed runtime login provisioning is atomic, least-privilege, secret-safe, and separately owner-gated', /supermega\.runtime_role_provisioning\.v1/.test(runtimeRoleProvisioner) && /production_target_not_activation_approved/.test(runtimeRoleProvisioner) && /apply_requires_reviewed_approval_id/.test(runtimeRoleProvisioner) && /admin_transaction_pooler_not_allowed/.test(runtimeRoleProvisioner) && /with connection\.transaction\(\):/.test(runtimeRoleProvisioner) && /pg_advisory_xact_lock/.test(runtimeRoleProvisioner) && /login inherit nosuperuser nocreatedb nocreaterole/.test(runtimeRoleProvisioner) && /noreplication nobypassrls password/.test(runtimeRoleProvisioner) && /with inherit true, set false, admin false/.test(runtimeRoleProvisioner) && /runtime_role_atomic_postcondition_failed/.test(runtimeRoleProvisioner) && /_assert_runtime_role_postconditions\(cursor\)/.test(runtimeRoleProvisioner) && /secret_values_exposed/.test(runtimeRoleProvisioner))
requireContract('managed activation evidence plan is bounded, explicit, and redacted', /def _activation_evidence_plan\(/.test(runtime) && /"id": "postgres17_rehearsal"/.test(runtime) && /"id": "runtime_role_audit"/.test(runtime) && /"id": "identity_gateway"/.test(runtime) && /"id": "storage_privacy"/.test(runtime) && /"id": "write_acceptance"/.test(runtime) && /"evidence_plan": evidence_plan/.test(runtime) && /"evidence_ready": all\(item\["ready"\] for item in evidence_plan\)/.test(runtime) && /secret_values_exposed": False/.test(runtime) && !/_activation_evidence_plan[\s\S]{0,3500}(password|token|secret|key)=/i.test(runtime))
requireContract('managed activation manifest is bounded, explicit, and redacted', /def _activation_manifest\(/.test(runtime) && /"contract": "supermega\.activation_manifest\.v1"/.test(runtime) && /"blocked_gate_ids": blocked_steps/.test(runtime) && /"proof_commands": proof_commands/.test(runtime) && /"safe_enable": safe_enable/.test(runtime) && /customer writes, payments, messages, deployments, and production changes require managed controls plus human approval/.test(runtime) && /"manifest": activation_manifest/.test(runtime) && /"secret_values_exposed": False/.test(runtime) && !/_activation_manifest[\s\S]{0,2500}(password|token|key)=/i.test(runtime))
requireContract('managed import provisioning readiness is bounded, explicit, and redacted', /def _import_provisioning_readiness\(/.test(runtime) && /"contract": "supermega\.import_provisioning_readiness\.v1"/.test(runtime) && /"id": "managed_identity_confirmed"/.test(runtime) && /"id": "private_workspace_schema"/.test(runtime) && /"id": "zero_write_validation_receipt"/.test(runtime) && /"id": "owner_import_approval"/.test(runtime) && /"id": "atomic_adapter_receipt"/.test(runtime) && /"id": "durable_revision_confirmation"/.test(runtime) && /"import_provisioning": import_provisioning/.test(runtime) && /"secret_values_exposed": False/.test(runtime) && !/_import_provisioning_readiness[\s\S]{0,4500}(password|token|secret|key)=/i.test(runtime))
requireContract('managed import apply requires a tenant human capability and revision-bound zero-write preflight', /@router\.post\("\/imports\/apply-preflight"\)/.test(trialRuntime) && /_require_write_ready\(readiness, "setup\.write"\)/.test(trialRuntime) && /principal\.actor_kind != "human"/.test(trialRuntime) && /_require_write_ready\(readiness, validation\.required_capability\)/.test(trialRuntime) && /current_state\.version != expected_version/.test(trialRuntime) && /_CLIENT_IMPORT_APPLY_PREFLIGHT_CONTRACT = "supermega\.client_import_apply_preflight\.v1"/.test(trialRuntime) && /"external_writes_performed": False/.test(trialRuntime) && /body\.preflight_digest != expected_preflight_digest/.test(trialRuntime) && /"client_import_apply_preflight_mismatch"/.test(trialRuntime) && /preflight_digest: request\.preflight\.preflight_digest/.test(managedTrialClient))
requireContract('managed AI context is owner-consented, summary-only, tenant-bound, and revision-bound',
  /@router\.post\("\/managed-context\/validate"\)/.test(trialRuntime)
  && /@router\.post\("\/managed-context\/retain"\)/.test(trialRuntime)
  && /principal\.actor_kind != "human"/.test(trialRuntime.slice(trialRuntime.indexOf('@router.post("/managed-context/validate")'), trialRuntime.indexOf('@router.post("/commerce/order-intake/drafts")')))
  && /"company\.write" not in readiness\.capabilities/.test(trialRuntime)
  && /_require_write_ready\(readiness, "company\.write"\)/.test(trialRuntime)
  && /"company\.control\.approve" not in readiness\.capabilities/.test(trialRuntime.slice(trialRuntime.indexOf('@router.post("/managed-context/retain")'), trialRuntime.indexOf('@router.post("/commerce/order-intake/drafts")')))
  && /required_capability="company\.control\.approve"/.test(trialRuntime.slice(trialRuntime.indexOf('@router.post("/managed-context/retain")'), trialRuntime.indexOf('@router.post("/commerce/order-intake/drafts")')))
  && /managed_context_validation_digest/.test(trialRuntime)
  && /body\.validation_digest != expected_validation_digest/.test(trialRuntime)
  && /MANAGED_CONTEXT_PROFILE_CONTRACT = "supermega\.managed_context_profile\.v2"/.test(managedContextRuntime)
  && /MANAGED_CONTEXT_VALIDATION_CONTRACT = "supermega\.managed_context_profile_validation\.v2"/.test(managedContextRuntime)
  && /MANAGED_CONTEXT_RETENTION_CONTRACT = "supermega\.managed_context_profile_retention\.v2"/.test(managedContextRuntime)
  && /validate_managed_ai_context_export/.test(managedContextRuntime)
  && /approvedContextDigest/.test(managedContextRuntime)
  && /acceptedOutcomeDigest/.test(managedContextRuntime)
  && /rawProductRecordsIncluded.*False/s.test(managedContextRuntime)
  && /rawBehaviorEntriesIncluded.*False/s.test(managedContextRuntime)
  && /rawDecisionRecordsIncluded.*False/s.test(managedContextRuntime)
  && /modelTrainingAllowed.*False/s.test(managedContextRuntime)
  && /_PRODUCT_TEMPLATES/.test(managedContextRuntime)
  && !/behavior_detail|"detail"/.test(managedContextRuntime)
  && /managed_context_from_company_state\([\s\S]*workspace_id=workspace_id/.test(companyBriefRuntime)
  && /managed_context_brief_projection/.test(companyBriefRuntime)
  && /criticalIssues/.test(companyBriefRuntime)
  && /managedContextValidationProjection/.test(managedContextClient)
  && /approvedContext: submittedContext/.test(managedContextConsent)
  && /reviewedDecisions: 0/.test(await read('tools/verify_app_build.mjs'))
  && /I approve retention of this exact summary and accepted outcome/.test(managedContextConsent)
  && /Keep approved context/.test(managedContextConsent)
  && /validate_managed_ai_context_export\(value\.get\("approvedAiContext"\)\)/.test(managedActivation)
  && /approvedContextContract/.test(managedActivation)
  && /approvedContextDigest/.test(managedActivation)
  && /approvedContextOutcomeDigest/.test(managedActivation)
  && /approvedContextRawRecordsIncluded/.test(managedActivation)
  && /approvedContextModelTrainingAllowed/.test(managedActivation))
requireContract('managed operating learning is aggregate-only, tenant-bound, checkpointed, and explainable',
  /OPERATING_BASELINE_CONTRACT = "supermega\.operating_baseline\.v1"/.test(companyBriefRuntime)
  && /OPERATING_BASELINE_CHANGE_CONTRACT = "supermega\.operating_baseline_change\.v1"/.test(companyBriefRuntime)
  && /rawRecordsIncluded/.test(companyBriefRuntime)
  && /value\["rawRecordsIncluded"\] is not False/.test(companyBriefRuntime)
  && /workspace_id is not None and retained_workspace != workspace_id/.test(companyBriefRuntime)
  && /record\.workspace_id != workspace_id or record\.surface != surface/.test(companyBriefRuntime)
  && /supermega\.operating_projection_source\.v1/.test(companyBriefRuntime)
  && /projectionDigest/.test(companyBriefRuntime)
  && !/_digest\(record\.state\)/.test(companyBriefRuntime)
  && /baseline_digest != _digest\(basis\)/.test(companyBriefRuntime)
  && /unavailable baseline contains operating facts/.test(companyBriefRuntime)
  && /_previous_operating_baseline/.test(companyBriefRuntime)
  && /baseline\["baselineDigest"\] != current_digest/.test(companyBriefRuntime)
  && /except TrialValidationError:\s+continue/.test(companyBriefRuntime)
  && /retained = \[validated, \*retained\]\[:30\]/.test(companyBriefRuntime)
  && /assert_brief_sources_unchanged/.test(trialRuntime)
  && /company = states\["company"\]/.test(trialRuntime)
  && !/company = _invoke\(lambda: store\.get_state\(principal, "company"\)\)/.test(trialRuntime.slice(trialRuntime.indexOf('@router.post("/company-brief/receipts")'), trialRuntime.indexOf('@router.post("/managed-context/validate")')))
  && /expected_related_versions=expected_related_versions/.test(trialRuntime)
  && /related_record\.version != expected_related_version/.test(trialStore)
  && /related_version != expected_related_version/.test(trialStore)
  && /principal\.actor_kind != "human"/.test(trialRuntime.slice(trialRuntime.indexOf('@router.post("/company-brief/receipts")'), trialRuntime.indexOf('@router.post("/managed-context/validate")')))
  && /_require_write_ready\(readiness, "company\.write"\)/.test(trialRuntime)
  && /"company\.baseline\.approve" not in readiness\.capabilities/.test(trialRuntime)
  && /"company\.baseline\.approve"/.test(clientProvisioning)
  && /"company\.baseline\.approve"/.test(siteManifest)
  && /structurallyValidOperatingBaseline/.test(operatingBaselineClient)
  && /structurallyValidOperatingBaselineChange/.test(operatingBaselineClient)
  && /validBaselineSources/.test(managedTrialClient)
  && /AI learned/.test(settingsPage))
requireContract('managed database runtime is Supavisor transaction-pool safe', /autocommit": False/.test(trialStore) && /prepare_threshold": None/.test(trialStore) && /with connection\.transaction\(\)/.test(trialStore) && /set_config\('app\.workspace_id', %s, true\)/.test(trialStore) && /sslmode/.test(trialStore) && /supermega-trial-runtime/.test(trialStore))
requireContract('managed database runtime revalidates role and TLS per connection', /_assert_runtime_role/.test(trialStore) && /rolbypassrls/.test(trialStore) && /pg_stat_ssl/.test(trialStore) && /"role_ready": readiness\.role_ready/.test(runtime) && /managed_trial_runtime_role_unsafe/.test(liveVerifier))
requireContract('free company backup is encrypted, bounded, customer-owned, excludes identity, and rolls back atomically',
  /supermega\.company_backup\.v1/.test(companyBackupClient)
  && /supermega\.local_company_snapshot\.v1/.test(companyBackupClient)
  && /COMPANY_BACKUP_KDF_ITERATIONS = 600_000/.test(companyBackupClient)
  && /AES-GCM/.test(companyBackupClient)
  && /PBKDF2/.test(companyBackupClient)
  && /tagLength: 128/.test(companyBackupClient)
  && /MAX_BACKUP_BYTES/.test(companyBackupClient)
  && /MAX_SNAPSHOT_BYTES/.test(companyBackupClient)
  && /MAX_RECORD_BYTES/.test(companyBackupClient)
  && /MAX_RECORDS/.test(companyBackupClient)
  && /authRecordsIncluded: false/.test(companyBackupClient)
  && /managedWorkspaceRecordsIncluded: false/.test(companyBackupClient)
  && /restoreValues\(storage, previous,/.test(companyBackupClient)
  && /valuesMatch\(storage, previous\)/.test(companyBackupClient)
  && /previous company state was restored/.test(companyBackupClient)
  && !/fetch\s*\(/.test(companyBackupClient)
  && /backupFile\.size > COMPANY_BACKUP_MAX_FILE_BYTES/.test(companyBackupPanel)
  && /Auth sessions, company account IDs, and credentials are excluded/.test(companyBackupPanel)
  && /SuperMega cannot recover a lost password/.test(companyBackupPanel)
  && /inspectEncryptedCompanyBackup/.test(companyBackupPanel)
  && /restoreCompanyBackup/.test(companyBackupPanel)
  && !/fetch\s*\(/.test(companyBackupPanel))
requireContract('console deal packets are shape-whitelisted before persistence and outreach',
  /export function normalizeDealPacket\(input\)/.test(consoleDeal)
  && /if \(!record\(input\)\) return \{ ok: false, reason: 'invalid_packet' \}/.test(consoleDeal)
  && /headline: clip\(input\.headline, 300\)/.test(consoleDeal)
  && /modules: arr\(input\.modules, 5/.test(consoleDeal)
  && /\.filter\(\(m\) => m\.name \|\| m\.why\)/.test(consoleDeal)
  && /pricing: \{[\s\S]*build_fee_mmk: clip/.test(consoleDeal)
  && /if \(!packet\.headline && !packet\.pain\) return \{ ok: false, reason: 'empty_packet' \}/.test(consoleDeal)
  && /import \{ generateDeal, normalizeDealPacket \} from '\.\/deal\.mjs'/.test(consoleApi)
  && /const normalized = normalizeDealPacket\(body\.packet\)/.test(consoleApi)
  && /if \(!normalized\.ok\) return bad\(400, normalized\.reason\)/.test(consoleApi)
  && /packet: normalized\.packet/.test(consoleApi)
  && /onDealSaved\(normalized\.packet, deal\.id\)/.test(consoleApi)
  && /persists only the normalized packet shape/.test(consoleDealPacketTest)
  && /raw_html/.test(consoleDealPacketTest)
  && /Object\.hasOwn\(response\.json\.deal\.packet, 'raw_html'\)/.test(consoleDealPacketTest))
requireContract('console errors and partial lead conversions are recorded with safe metadata',
  /import \{ captureError \} from '\.\.\/alert\.mjs'/.test(consoleApi)
  && /const safePath = \(value\) => String\(value \|\| ''\)\.split\('\?'\)\[0\]\.slice\(0, 120\)/.test(consoleApi)
  && /const recordConsoleError = \(context, detail, meta = \{\}\) => captureError/.test(consoleApi)
  && /store\.logActivity\(\{ kind, summary, ref \}\)[\s\S]{0,180}console\.activity_log_failed/.test(consoleApi)
  && /const wonTransition = await store\.markLeadWon\(seg\[1\]\)\.catch\(async \(error\) =>/.test(consoleApi)
  && /if \(!wonTransition \|\| wonTransition\.lead\?\.stage !== 'won'\)/.test(consoleApi)
  && /if \(wonTransition\.changed\) log\('won'/.test(consoleApi)
  && /replayed: !wonTransition\.changed/.test(consoleApi)
  && /export async function markLeadWon\(id\)/.test(consoleStore)
  && /console\.lead_convert_won_stage_failed/.test(consoleApi)
  && /console\.lead_convert_partial_project/.test(consoleApi)
  && /return bad\(500, 'lead_won_stage_update_failed'\)/.test(consoleApi)
  && /log\('won', `Won \$\{lead\.company \|\| lead\.name\} → \$\{project\.offer\} project`, project\.id\)/.test(consoleApi)
  && /console\.project_shipped_graduation_failed/.test(consoleApi)
  && /console\.deal_graduation_failed/.test(consoleApi)
  && /await recordConsoleError\('console\.api_unhandled_error', err, \{ method, path: safePath\(path\) \}\)/.test(consoleApi)
  && !/console\.api_unhandled_error[\s\S]{0,160}body/.test(consoleApi)
  && /lead conversion records the won stage before it logs a clean win/.test(consoleErrorRecordingTest)
  && /console error handling contract records safe metadata and never request bodies/.test(consoleErrorRecordingTest))
requireContract('managed database secret handoff is staged, release-bound, value-verified, and compensated', /vercel@56\.1\.0/.test(databaseActivator) && /--sensitive/.test(databaseActivator) && /AppVercelProjectId = 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'/.test(databaseActivator) && /VercelOrgId = 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'/.test(databaseActivator) && /--cwd/.test(databaseActivator) && !/--project/.test(databaseActivator) && /\$addedEnvironmentKeys\.Add\(\$Key\)/.test(databaseActivator) && /Remove-StagedEnvironmentValues/.test(databaseActivator) && /\$VercelCli env rm/.test(databaseActivator) && /verify_managed_runtime_environment_values\.mjs/.test(databaseActivator) && /Activation plan must target the reviewed managed schema version 11/.test(databaseActivator) && /Activation plan must bind the exact reviewed 40-character release commit/.test(databaseActivator) && databaseActivator.includes("-Key 'SUPERMEGA_TRIAL_SCHEMA_VERSION'") && databaseActivator.includes("-Key 'SUPERMEGA_SUPABASE_PROJECT_REF'") && !databaseActivator.includes("-Key 'SUPERMEGA_RELEASE_COMMIT'") && /VERCEL_GIT_COMMIT_SHA remains authoritative after deployment/.test(databaseActivator) && databaseActivator.indexOf("-Key 'SUPERMEGA_DATABASE_URL'") < databaseActivator.indexOf("-Key 'SUPERMEGA_TRIAL_WRITES_ENABLED'") && databaseActivator.indexOf("Write-Output '==> activate the workspace gate") < databaseActivator.indexOf("-Key 'SUPERMEGA_TRIAL_WRITES_ENABLED'") && /managedSchemaVersion = '11'/.test(managedRuntimeEnvironmentVerifier) && /SUPERMEGA_SUPABASE_PROJECT_REF/.test(managedRuntimeEnvironmentVerifier) && /SUPERMEGA_RELEASE_COMMIT[\s\S]+VERCEL_GIT_COMMIT_SHA[\s\S]+GITHUB_SHA/.test(managedRuntimeEnvironmentVerifier) && /managed_self_serve_window_not_open/.test(managedRuntimeEnvironmentVerifier))
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
requireContract('Vision product preview is gated out of normal production routing',
  /const visionPreviewEnabled = import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_SUPERMEGA_VISION_PREVIEW === '1'/.test(appRouter)
  && /visionPreviewEnabled && VisionProduct \? <Route[\s\S]*path="vision\/\*"/.test(appRouter)
  && /visionPreviewEnabled && \(demo === 'vision'/.test(appRouter)
  && /location\.pathname\.startsWith\('\/vision\/'\)[\s\S]{0,80}\? 'Vision'/.test(coreShell)
  && /if \(location\.pathname\.startsWith\('\/vision\/'\)\) return/.test(coreShell))
requireContract('Vision preview is bound to the source-authenticated privacy-reduced proof',
  visionProof.schema === 'supermega.vision.private-demo-proof.v1'
  && visionProof.proof_id === '560aeb776a93f323f22cbbf6'
  && visionProof.source_identity?.private_demo_package_id === 'dd5698ecd24dac2278e45cb2'
  && visionProof.verified_evidence?.screens_processed_locally === 56
  && visionProof.verified_evidence?.model_observations === 92
  && visionProof.verified_evidence?.private_demo_files_verified === 239)
requireContract('Vision preview retains publication and commercial authority boundaries',
  visionProof.decision === 'not_approved_for_publication'
  && visionProof.authority?.owner_review_required === true
  && Object.entries(visionProof.authority).filter(([key]) => key !== 'owner_review_required').every(([, value]) => value === false)
  && Object.values(visionProof.claims ?? {}).every((value) => value === false)
  && Object.values(visionProof.effects ?? {}).every((value) => value === 0)
  && /Not approved for publication, pricing, customer outreach, production sale, or payment requests/.test(visionProduct)
  && /Engineering counts, not accuracy metrics/.test(visionProduct)
  && !/<form|mailto:|https?:\/\/|checkout|price\s*[:=]/i.test(visionProduct))
requireContract('Vision preview contains no private visual evidence or source locator',
  visionProof.privacy?.screenshot_pixels_included === false
  && visionProof.privacy?.source_filenames_included === false
  && visionProof.privacy?.source_paths_included === false
  && visionProof.privacy?.customer_labels_included === false
  && !/data:image|[A-Z]:\\|OneDrive|\.png|\.jpe?g|\.webp|<script|https?:\/\//i.test(`${visionProofRaw}\n${visionProduct}\n${visionStyles}`))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_security', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_security', checks: checks.length }, null, 2))
