import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'showroom', 'dist')
const failures = []
const fail = (reason) => failures.push(reason)
const [manifestText, appPackageText, appSource, coreSource, teamSource, teamModel, websiteSource, publishSource, ecommerceSource, ecommerceModel, handoffSource] = await Promise.all([
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'package.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'App.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'TeamWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'team-work.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'WebsiteProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'PublishWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceOrdersProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-model.ts'), 'utf8'),
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
  if (!favicon.includes('SuperMega terminal mark') || !favicon.includes('#7cf5b4') || !favicon.includes('#f2f5f1')) fail('wrong_terminal_favicon')
}
if (!await exists(manifestPath)) fail('missing_app_webmanifest')
else {
  const webmanifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (webmanifest.name !== 'SuperMega Company OS' || webmanifest.icons?.[0]?.src !== '/favicon.svg') fail('wrong_app_webmanifest')
}

const files = await walk(dist)
const textFiles = files.filter((path) => /\.(?:html|js|css|json|svg)$/.test(path))
const corpus = (await Promise.all(textFiles.map((path) => readFile(path, 'utf8')))).join('\n')
for (const required of ['SUPERMEGA', 'Teams', 'Product', 'Acceptance outcome', 'Prepare brief', 'Evidence register', 'Mark verified', 'Verified evidence', 'verifiedAt', 'Operations', 'Human confirmation', 'Confirm and record', 'Action history', 'actorKind', 'evidenceReference', 'accountableActions', 'decision_packet.v1', 'Claims and provenance', 'claimType', 'claim_type', 'source_reference', 'artifact_reference', 'managedApprovalRequests', 'packetFingerprint', 'uncertainty', 'visibility', 'artifactReference', 'Human reviewer', 'Decision note', 'Approve and record', 'Local trial', 'Pilot definition', 'Template profile', 'Workflow', 'workflowProfile', 'Current record', 'Baseline', 'Target outcome', 'Human authority boundary', 'Acceptance evidence', 'Operating mode', 'Write path', '#7cf5b4', '#f2f5f1']) {
  if (!corpus.includes(required)) fail(`missing_context:${required}`)
}
if (!coreSource.includes("import siteManifest from '../../../site-manifest.json'")) fail('workflow_contract_not_shared')
if (coreSource.includes('const setupTemplates =') || coreSource.includes('const setupEntryPoints =')) fail('workflow_contract_duplicated')
if (coreSource.includes('className="core-panel approval-panel"')) fail('approval_queue_hidden_in_extra_panel')
if (!coreSource.includes("decidedActorKind: 'human'") || !coreSource.includes('decisionNote: note')) fail('approval_decision_not_human_attributed')
if (!coreSource.includes('dialog.showModal()') || coreSource.includes('decision-dialog-backdrop')) fail('approval_review_not_native_modal')
if (!coreSource.includes("body.operating_mode === 'managed_trial'") || !coreSource.includes('writesReady') || !coreSource.includes('requirements.length === 0')) fail('managed_readiness_not_fail_closed')
if (!coreSource.includes('LEGACY_COMMERCE_KEYS') || !coreSource.includes('LEGACY_PRODUCTION_KEYS') || !coreSource.includes('LEGACY_APPROVAL_KEYS') || !coreSource.includes('LEGACY_SETUP_KEYS')) fail('legacy_local_workspace_not_migrated')
if (!coreSource.includes('decisionPacketFingerprint') || !coreSource.includes("status: 'superseded' as const")) fail('stale_approval_packet_not_superseded')
if (!coreSource.includes('toManagedDecisionPacket') || !coreSource.includes('managedApprovalRequests')) fail('managed_decision_packet_serializer_missing')
if (!teamSource.includes('Accept and record') || !teamSource.includes("acceptedActorKind: 'human'") || !teamModel.includes('acceptanceEvidenceReference')) fail('product_decision_not_human_attributed')
if (!teamModel.includes("status: 'proposed'") || !teamModel.includes('isAttributedHumanAcceptance')) fail('legacy_product_acceptance_not_reopened')
if (!appSource.includes("lazy(() => import('./products/website/WebsiteProduct')") || !appSource.includes("lazy(() => import('./products/ecommerce/EcommerceOrdersProduct')") || !appSource.includes('Suspense')) fail('prototype_routes_not_lazy_loaded')
if (!appPackage.scripts?.lint?.includes('src/products')) fail('prototype_sources_not_linted')
if (!websiteSource.includes('No website has been deployed.') || !websiteSource.includes('No deployment or external write occurred.')) fail('website_prototype_boundary_missing')
if (!ecommerceSource.includes('No integrations are connected.') || !ecommerceSource.includes('Customer sends, checkout, payments, delivery, and production writes are not connected.')) fail('ecommerce_prototype_boundary_missing')
if (!handoffSource.includes("schema: 'website_ecommerce_handoff.v1'") || !handoffSource.includes("state: 'pending_acceptance'") || !handoffSource.includes('hasExactKeys') || !handoffSource.includes('validateAgainstWorkspace') || !handoffSource.includes('readinessChecks(workspace, fingerprint).every') || !handoffSource.includes('acceptWebsiteEcommerceHandoff')) fail('website_ecommerce_handoff_contract_missing')
if (['customerLabel', 'phoneSuffix', 'township', 'paymentMethod', 'deliveryMethod'].some((field) => handoffSource.includes(field))) fail('website_handoff_contains_pii_shaped_fields')
if (!handoffSource.includes("actorKind: 'human'") || !handoffSource.includes("action: 'accept_website_handoff'") || !handoffSource.includes('audit: [audit]') || !handoffSource.includes("existing.handoff.state === 'accepted'") || !handoffSource.includes('setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))')) fail('website_handoff_atomic_audit_missing')
if (!handoffSource.includes("schema: 'ecommerce_order_draft.v1'") || !handoffSource.includes("mode: 'browser-local'") || !handoffSource.includes("schema: 'website_ecommerce_handoff_store.v2'") || !handoffSource.includes('createWebsiteOrderDraft') || !handoffSource.includes('idempotencyKey: current.handoff.id') || !handoffSource.includes("missingFields: ['customer_reference', 'fulfilment_method', 'payment_method']") || !handoffSource.includes('current.draft.idempotencyKey === handoffId') || !handoffSource.includes('if (!current.display) return null')) fail('ecommerce_order_draft_contract_missing')
if (!websiteSource.includes('approvalIsCurrent || !publishIsCurrent') || !websiteSource.includes('checks.every((check) => check.passed)') || !websiteSource.includes('writeWebsiteEcommerceHandoff(handoff, workspace)') || !publishSource.includes('fingerprint is a revision marker, not a signature')) fail('website_handoff_gate_missing')
if (!ecommerceModel.includes("'accept_website_handoff'") || !ecommerceModel.includes('isValidApprovalDetails(action.approval)') || !ecommerceSource.includes('waiting for attributable human approval') || !ecommerceSource.includes('Responsible operator ID') || !ecommerceSource.includes('matchingItems.length !== 1') || !ecommerceSource.includes('createWebsiteOrderDraft(current.handoff.id') || !ecommerceSource.includes('It does not create an order, contact a customer, reserve stock, collect payment, or write to Commerce.')) fail('ecommerce_intake_approval_contract_missing')
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
for (const route of ['/operations/commerce/', '/operations/production/', '/products/website/', '/products/ecommerce/']) {
  if (!corpus.includes(route)) fail(`missing_canonical_module_route:${route}`)
}
for (const forbidden of ['pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a', 'Company Systems That Replace Tool Sprawl', 'Workspace draft', 'Service bookings', 'Material receiving']) {
  if (corpus.toLowerCase().includes(forbidden.toLowerCase())) fail(`retired_context:${forbidden}`)
}
for (const marker of ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']) {
  if (corpus.includes(marker)) fail('app_copy_encoding_corrupt')
}

const bytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce((total, size) => total + size, 0)
if (bytes > 2_500_000) fail(`artifact_budget:${bytes}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_build', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_build', primaryRoutes: 4, operatingModules: 2, prototypeRoutes: 2, workflowProfiles, bytes }, null, 2))
