import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'showroom', 'dist')
const failures = []
let orderCompletionRuntimeChecks = 0
let channelOrderRuntimeChecks = 0
let websiteRuntimeChecks = 0
let storefrontRuntimeChecks = 0
let storefrontDraftRuntimeChecks = 0
let storefrontRequestRuntimeChecks = 0
let commerceOrderDraftRuntimeChecks = 0
let managedWebsiteRuntimeChecks = 0
let managedStorefrontRuntimeChecks = 0
let ecommerceHandoffRuntimeChecks = 0
let catalogImportRuntimeChecks = 0
let clientOnboardingRuntimeChecks = 0
let commerceRuntimeChecks = 0
let productionRuntimeChecks = 0
const fail = (reason) => failures.push(reason)
const [manifestText, appPackageText, appSource, coreSource, catalogImportSource, clientOnboardingSource, clientOnboardingUiSource, commerceSource, commerceOrderDraftSource, channelOrderSource, managedTrialSource, managedCommerceRuntime, managedTrialStoreRuntime, managedProductionRuntime, productionSource, teamSource, agentTeamsSource, teamModel, websiteSource, contentSource, publishSource, publishCssSource, sitePreviewSource, websiteModelSource, websiteExportSource, websiteWorkspaceSource, managedWebsiteSource, websiteCssSource, commerceIntakeSource, handoffSource, ecommerceSource, managedStorefrontSource, storefrontSource, storefrontDraftSource, storefrontRequestSource, ecommerceConfirmSource, ecommerceHandoffSource, ecommerceCssSource, coreCssSource, schedulerSource] = await Promise.all([
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'package.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'App.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'shop-catalog-import.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'client-onboarding.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ClientDataOnboarding.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'commerce-order-draft.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'channel-order-intake.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'managed-trial.ts'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'commerce_runtime.py'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'trial_store.py'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'production_runtime.py'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'production-workspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'TeamWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'AgentTeamsPanel.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'team-work.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'WebsiteProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'ContentWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'PublishWorkspace.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'publish-workspace.css'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'SitePreview.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-model.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-export.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'useWebsiteWorkspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'managed-website.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-product.css'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'WebsiteCommerceIntake.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'product-handoff.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'managed-storefront.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-model.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-draft.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-request.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-shop-confirm.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-shop-handoff.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-product.css'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'core-app.css'), 'utf8'),
  readFile(resolve(root, 'tools', 'ensure_supermega_scheduler.ps1'), 'utf8'),
])
const manifest = JSON.parse(manifestText)
const appPackage = JSON.parse(appPackageText)
const indexSource = await readFile(resolve(root, 'showroom', 'index.html'), 'utf8')
const viteConfigSource = await readFile(resolve(root, 'showroom', 'vite.config.ts'), 'utf8')
const websiteStarterSource = await readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-starter.ts'), 'utf8')
const websiteStarterSetupSource = await readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'WebsiteStarterSetup.tsx'), 'utf8')

if (!viteConfigSource.includes("id.includes('/src/core/channel-order-intake.ts')")
  || !viteConfigSource.includes("id.includes('/src/core/managed-trial.ts')")
  || !viteConfigSource.includes("id.includes('/src/core/team-work.ts')")
  || !viteConfigSource.includes("return 'operating-models'")) fail('shop_order_intake_chunk_headroom_missing')
if (!viteConfigSource.includes("id.includes('/node_modules/react-router/')")
  || !viteConfigSource.includes("id.includes('/node_modules/react-router-dom/')")
  || !viteConfigSource.includes("return 'router'")) fail('router_chunk_isolation_missing')

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

function sourceBlock(source, startMarker, endMarker) {
  const normalizedSource = source.replaceAll('\r\n', '\n')
  const start = normalizedSource.indexOf(startMarker)
  const end = start < 0 ? -1 : normalizedSource.indexOf(endMarker, start + startMarker.length)
  return start >= 0 && end > start ? normalizedSource.slice(start, end) : ''
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

for (const route of ['', 'work', 'operations', 'shop', 'plant', 'website', 'ecommerce', 'operations/commerce', 'operations/production', 'products/website', 'products/ecommerce', 'agents', 'settings']) {
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
  if (webmanifest.name !== manifest.brand.name
    || webmanifest.short_name !== manifest.brand.name
    || webmanifest.description !== manifest.company.supporting
    || webmanifest.icons?.[0]?.src !== '/favicon.svg') fail('wrong_app_webmanifest')
}
if (!indexSource.includes('<title>SuperMega</title>')
  || !indexSource.includes('Run Shop and Plant, build Website and Ecommerce experiences, and keep owner decisions accountable.')
  || indexSource.includes('SuperMega Company OS')
  || indexSource.includes('Run Product, Commerce, and Production')) fail('stale_app_metadata')

const files = await walk(dist)
const textFiles = files.filter((path) => /\.(?:html|js|css|json|svg)$/.test(path))
const corpus = (await Promise.all(textFiles.map((path) => readFile(path, 'utf8')))).join('\n')
for (const required of ['SUPERMEGA', 'Teams', 'Product', 'Acceptance outcome', 'Prepare brief', 'Evidence register', 'Record evidence', 'Verified evidence', 'verifiedAt', 'Operations', 'Confirm change', 'Action history', 'actorKind', 'evidenceReference', 'accountableActions', 'decision_packet.v1', 'Claims and provenance', 'claimType', 'claim_type', 'source_reference', 'artifact_reference', 'managedApprovalRequests', 'packetFingerprint', 'uncertainty', 'visibility', 'artifactReference', 'Human reviewer', 'Decision note', 'Approve and record', 'Local trial', 'Agents prepare work', 'Pilot definition', 'Workflow', 'workflowProfile', 'Current record', 'Baseline', 'Target outcome', 'Human authority boundary', 'Acceptance evidence', 'Operating mode', 'Write path', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!corpus.includes(required)) fail(`missing_context:${required}`)
}
if (!coreSource.includes("import siteManifest from '../../../site-manifest.json'")) fail('workflow_contract_not_shared')
if (!viteConfigSource.includes("process.env.SUPERMEGA_LOCAL_API?.trim()")
  || !viteConfigSource.includes("? { '/api': { target: localApi, changeOrigin: true } }")
  || !viteConfigSource.includes("name: 'supermega-local-health'")
  || !viteConfigSource.includes('configureServer(server)')
  || !viteConfigSource.includes('configurePreviewServer(server)')
  || !viteConfigSource.includes("status: 'attention'")
  || !viteConfigSource.includes("service: 'supermega-local-preview'")
  || !viteConfigSource.includes("operating_mode: 'isolated_demo'")
  || !viteConfigSource.includes('write_enabled: false')
  || !viteConfigSource.includes('browser_service_role_exposed: false')
  || !viteConfigSource.includes("response.setHeader('cache-control', 'no-store')")
  || !viteConfigSource.includes("response.setHeader('content-type', 'application/json; charset=utf-8')")
  || !viteConfigSource.includes("response.setHeader('x-content-type-options', 'nosniff')")
  || !viteConfigSource.includes('response.statusCode = 200')
  || !viteConfigSource.includes("response.end(request.method === 'HEAD' ? undefined : isolatedHealthBody)")
  || (viteConfigSource.match(/if \(!localApi\) server\.middlewares\.use\(isolatedHealthMiddleware\)/g) ?? []).length !== 2) fail('local_health_not_truthful_or_fail_closed')
if (coreSource.includes('const setupTemplates =') || coreSource.includes('const setupEntryPoints =')) fail('workflow_contract_duplicated')
if (!coreSource.includes("{ to: '/', label: 'Home', end: true }")
  || !coreSource.includes("{ to: '/work/', label: 'HQ', end: false }")
  || !coreSource.includes("{ to: '/operations/', label: 'Products', end: false }")) fail('first_run_navigation_not_simple')
const overviewPageContract = coreSource.slice(coreSource.indexOf('export function OverviewPage'), coreSource.indexOf('export function OperationsPage'))
if (!overviewPageContract.includes('useCommerceWorkspace(managedIdentity)')
  || !overviewPageContract.includes('useProductionWorkspace(managedIdentity)')) fail('home_managed_product_sources_not_consistent')
if (!coreSource.includes('className="product-launcher home-products"')
  || !coreSource.includes('to="/shop/?tab=orders"')
  || !overviewPageContract.includes("to={openProductionIssues.length ? '/plant/?tab=control' : '/plant/?tab=production'}")
  || !overviewPageContract.includes("openProductionIssues.length === 1 ? 'issue' : 'issues'")
  || !coreSource.includes('to="/website/"')
  || !coreSource.includes('to="/ecommerce/"')
  || !overviewPageContract.includes("label: 'Shop stock'")
  || !overviewPageContract.includes("label: 'Plant problem'")
  || !overviewPageContract.includes("label: 'Shop order'")
  || !overviewPageContract.includes('<summary><span>SuperMega HQ</span><small>Internal company work</small></summary>')
  || !coreSource.includes('const homeWork = visibleWork.slice(0, 3)')) fail('first_run_product_launcher_missing')
if (!coreSource.includes('title="Choose a product" copy="Open the product for the job you need to do."')
  || !coreSource.includes('<strong>Website</strong><small>Build, preview, and review a site</small>')
  || coreSource.includes('Choose a workspace')
  || coreSource.includes('prepare to publish')) fail('product_launcher_language_not_truthful')
if (!overviewPageContract.includes('const uncoveredLowStock = lowStock.filter((item) => !activePurchaseOrderBySku.has(item.sku))')
  || !overviewPageContract.includes("urgency === 'late' || urgency === 'due_soon' || urgency === 'unrecorded'")
  || !overviewPageContract.includes("label: 'Shop purchase'")
  || !overviewPageContract.includes('nextPurchaseArrivalProblem')
  || !overviewPageContract.includes('nextPurchaseArrivalDueSoon')
  || !overviewPageContract.includes('purchaseArrivalAttention.map(')
  || overviewPageContract.includes('{lowStock.map((item)')) fail('home_purchase_commitment_priority_missing')
if (!/\.core-skip \{[^}]*min-height:\s*44px;/.test(coreCssSource)
  || !/\.evidence-disclosure > summary,[^{]*\.company-brief-disclosure > summary \{[^}]*min-height:\s*44px;/.test(coreCssSource)
  || !/\.release-review-link \{[^}]*min-height:\s*44px;/.test(coreCssSource)
  || !/\.company-brief-disclosure > \.text-link \{[^}]*min-height:\s*44px;/.test(coreCssSource)
  || !coreSource.includes('const workspaceMainRef = useRef<HTMLElement>(null)')
  || !coreSource.includes('onClick={() => requestAnimationFrame(() => workspaceMainRef.current?.focus())}')
  || !coreSource.includes('ref={workspaceMainRef} tabIndex={-1}')) fail('mobile_secondary_touch_targets_missing')
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
if (!agentTeamsSource.includes('Agents prepare work; named humans approve consequential actions.')
  || !agentTeamsSource.includes('humanOwner')
  || !agentTeamsSource.includes('approvalBoundary')
  || agentTeamsSource.includes('className="agent-roster" role="list"')
  || agentTeamsSource.includes('>Run<')) fail('agent_authority_boundary_missing')
if (!agentTeamsSource.includes('className="agent-roster-overview"')
  || !agentTeamsSource.includes("...(reviewCount ? [`${reviewCount} waiting review`] : [])")
  || agentTeamsSource.includes('className="agent-boundary-banner"')
  || agentTeamsSource.includes('className="agent-summary"')
  || coreCssSource.includes('.agent-boundary-banner')
  || coreCssSource.includes('.agent-summary')) fail('agent_roster_not_action_first')
if (!agentTeamsSource.includes('const mobileDetailOpen = Boolean(selectedAgentId && selectedAgent)')
  || !agentTeamsSource.includes("mobileDetailOpen ? 'mobile-detail-open' : 'mobile-list-open'")
  || !agentTeamsSource.includes('>Back to roles</button>')
  || !coreCssSource.includes('.agent-team-view.mobile-list-open .agent-detail-panel { display: none; }')
  || !coreCssSource.includes('.agent-team-view.mobile-detail-open .agent-roster-panel { display: none; }')) fail('agent_mobile_master_detail_missing')
if (!coreSource.includes('view=work&item=${item.id}') || !coreSource.includes('view=agents&agent=${agent.id}') || !teamSource.includes("const requestedItemId = searchParams.get('item')") || !teamSource.includes("const requestedAgentId = searchParams.get('agent')") || !teamSource.includes("if (view === 'work' && selectedId) next.item = selectedId") || !teamSource.includes("if (view === 'agents' && selectedId) next.agent = selectedId") || !agentTeamsSource.includes('onSelectAgent: (agentId: string) => void') || agentTeamsSource.includes('const [selectedAgentId')) fail('team_record_deep_links_missing')
if (!teamSource.includes('const mobileDetailOpen = Boolean(requestedItemId && selectedItem)')
  || !teamSource.includes("mobileDetailOpen ? 'mobile-detail-open' : 'mobile-list-open'")
  || !teamSource.includes('>Back to work</button>')
  || !coreCssSource.includes('.team-board-view.mobile-list-open .record-detail-panel { display: none; }')
  || !coreCssSource.includes('.team-board-view.mobile-detail-open .queue-panel { display: none; }')) fail('team_mobile_master_detail_missing')
if (!teamSource.includes('const mobileAgentDetailOpen = activeView')
  || !teamSource.includes("const mobileFocusOpen = intakeOpen || (activeView === 'work' && mobileDetailOpen) || mobileAgentDetailOpen")
  || !teamSource.includes("mobileFocusOpen ? 'mobile-focus-open' : ''")
  || !teamSource.includes("window.matchMedia('(max-width: 840px)').matches")
  || !coreCssSource.includes('.team-screen.mobile-focus-open > .page-heading')) fail('team_mobile_focus_mode_missing')
if (!teamSource.includes("activeView === 'agents'")
  || !teamSource.includes('Assign bounded roles to work; named humans keep authority.')
  || !teamSource.includes('Check release evidence and decisions before approval.')
  || !teamSource.includes('Own one outcome, its evidence, and its next status.')
  || !teamSource.includes("actions={activeView === 'work' && !intakeOpen")
  || teamSource.includes('actions={<button className="core-button primary" onClick={openNewWork}')) fail('team_view_context_missing')
if (!appSource.includes("lazy(() => import('./products/website/WebsiteProduct')") || !appSource.includes('Suspense') || appSource.includes("import('./products/ecommerce/EcommerceOrdersProduct')")) fail('website_prototype_route_not_isolated')
if (!appSource.includes("lazy(() => import('./core/TeamWorkspace')")
  || appSource.includes("import { TeamsPage } from './core/TeamWorkspace'")
  || !appSource.includes('<ProductLoading name="HQ" />')) fail('hq_route_not_isolated')
const coreLayoutRouteStart = appSource.indexOf('<Route element={<CoreLayout />}>')
const coreLayoutRouteEnd = appSource.indexOf('</Route>', coreLayoutRouteStart)
const websiteRoute = appSource.indexOf('path="website/*"')
const embeddedWebsiteCss = websiteCssSource.slice(websiteCssSource.indexOf('/* Website runs inside the shared SuperMega shell. */'))
if (coreLayoutRouteStart < 0
  || coreLayoutRouteEnd < 0
  || websiteRoute < coreLayoutRouteStart
  || websiteRoute > coreLayoutRouteEnd
  || !coreSource.includes("location.pathname.startsWith('/website/')")
  || !coreSource.includes("to === '/operations/' && (")
  || !coreSource.includes("location.pathname.startsWith('/shop/')")
  || !coreSource.includes("location.pathname.startsWith('/plant/')")
  || websiteSource.includes('className="website-topbar"')
  || websiteSource.includes('className="website-brand"')
  || websiteSource.includes('<main id="website-workspace"')
  || !embeddedWebsiteCss.includes('.website-product {')
  || !embeddedWebsiteCss.includes('overflow: visible;')
  || !embeddedWebsiteCss.includes('.website-shell {\n    height: auto;')) fail('website_shared_app_shell_missing')
if (!appSource.includes("lazy(() => import('./products/ecommerce/EcommerceProduct')")
  || !appSource.includes('<EcommerceProduct />')
  || !appSource.includes('path="ecommerce/*"')
  || !appSource.includes('<OperationsPage product="commerce" />')
  || !appSource.includes('path="shop/*"')
  || !appSource.includes('<OperationsPage product="production" />')
  || !appSource.includes('path="plant/*"')) fail('canonical_product_routes_missing')
if (!appSource.includes('<Navigate replace to="/website/" />')
  || !appSource.includes('<Navigate replace to="/ecommerce/" />')
  || !appSource.includes('path="products/website/*"')
  || !appSource.includes('path="products/ecommerce/*"')) fail('maker_product_compatibility_routes_missing')
if ((appSource.match(/<Navigate replace to="\/work\/\?view=agents" \/>/g) || []).length !== 2
  || !appSource.includes('path="agents/*"')
  || !appSource.includes('path="assist/*"')) fail('agents_not_internal_hq_capability')
if (!storefrontSource.includes("supermega.ecommerce.storefront_preview.v1")
  || !storefrontSource.includes('readStorefrontCatalog')
  || !storefrontSource.includes('buildStorefrontPreview')
  || !storefrontSource.includes("globalThis.crypto.subtle.digest('SHA-256'")
  || !storefrontSource.includes('validateCommerceState(JSON.parse(raw)).items')
  || ['setItem(', 'removeItem(', 'fetch(', 'XMLHttpRequest', 'navigator.locks'].some((marker) => storefrontSource.includes(marker))) fail('ecommerce_storefront_contract_missing_or_mutating')
if (!storefrontDraftSource.includes("supermega.ecommerce.storefront_draft.v2")
  || !storefrontDraftSource.includes("LEGACY_STOREFRONT_DRAFT_SCHEMA = 'supermega.ecommerce.storefront_draft.v1'")
  || !storefrontDraftSource.includes("['schema', 'scope', 'revision', 'savedAt', 'storeName', 'summary', 'selectedSkus', 'sourcePreviewDigest']")
  || !storefrontDraftSource.includes("status: 'legacy'")
  || !storefrontDraftSource.includes('legacyStorefrontDraftStorageKey')
  || !storefrontDraftSource.includes('/^sha256:[0-9a-f]{64}$/')
  || !storefrontDraftSource.includes('STOREFRONT_DRAFT_KEY_PREFIX')
  || !storefrontDraftSource.includes('LEGACY_STOREFRONT_DRAFT_KEY_PREFIX')
  || !storefrontDraftSource.includes('STOREFRONT_DRAFT_LOCK_PREFIX')
  || !storefrontDraftSource.includes('encodeURIComponent(canonicalScope(scope))')
  || !storefrontDraftSource.includes('readStorefrontDraft(canonicalDraftScope, storage)')
  || !storefrontDraftSource.includes('currentRevision !== expectedRevision')
  || !storefrontDraftSource.includes('sameDraftInput(current, candidate)')
  || !storefrontDraftSource.includes('storage.getItem(storageKey) !== nextRaw')
  || !storefrontDraftSource.includes('The previous saved value was restored.')
  || !storefrontDraftSource.includes("status: 'invalid'")
  || !storefrontDraftSource.includes('reconcileStorefrontSelection')
  || ['customerReference', 'requestLedger', 'payment', 'fulfilment', 'phone', 'address'].some((marker) => storefrontDraftSource.includes(marker))) fail('ecommerce_storefront_draft_contract_missing_or_contains_request_data')
const storefrontDraftStoragePrefix = /export const STOREFRONT_DRAFT_KEY_PREFIX = '([^']+)'/.exec(storefrontDraftSource)?.[1]
const legacyStorefrontDraftStoragePrefix = /export const LEGACY_STOREFRONT_DRAFT_KEY_PREFIX = '([^']+)'/.exec(storefrontDraftSource)?.[1]
const commerceOrderDraftStoragePrefix = /export const COMMERCE_ORDER_DRAFT_KEY_PREFIX = '([^']+)'/.exec(commerceOrderDraftSource)?.[1]
const commerceOrderDraftResetEpochKey = /export const COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY = '([^']+)'/.exec(commerceOrderDraftSource)?.[1]
const localProductExportBlock = sourceBlock(
  coreSource,
  'function collectLocalProductRecords(',
  '\n}\n\nfunction requireProductContract',
)
const localProductResetBlock = sourceBlock(
  coreSource,
  '  async function resetDemoWorkspace()',
  '\n  }\n\n  async function connectManagedWorkspace',
)
const rejectedEcommerceNavigationBlock = sourceBlock(
  coreSource,
  '        if (!ecommerceShopDraftMatchesCatalog(ecommerceNavigationDraft, commerce.items)) {',
  "\n          setNotice('The Ecommerce request no longer matches the current Shop catalog. Nothing was prepared.')",
)
if (!storefrontDraftStoragePrefix
  || !legacyStorefrontDraftStoragePrefix
  || !commerceOrderDraftStoragePrefix
  || !commerceOrderDraftResetEpochKey
  || !coreSource.includes(`const STOREFRONT_DRAFT_RESET_PREFIX = '${storefrontDraftStoragePrefix}'`)
  || !coreSource.includes(`const LEGACY_STOREFRONT_DRAFT_RESET_PREFIX = '${legacyStorefrontDraftStoragePrefix}'`)
  || !coreSource.includes(`const SHOP_ORDER_DRAFT_RESET_PREFIX = '${commerceOrderDraftStoragePrefix}'`)
  || !coreSource.includes(`const SHOP_ORDER_DRAFT_RESET_EPOCH_KEY = '${commerceOrderDraftResetEpochKey}'`)
  || !coreSource.includes("const LEGACY_STOREFRONT_DRAFT_RESET_KEY = 'supermega.ecommerce.storefront_draft.v1'")
  || !localProductExportBlock.includes('key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)')
  || !localProductExportBlock.includes('key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)')
  || !localProductExportBlock.includes('key.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)')
  || !localProductResetBlock.includes('key?.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)')
  || !localProductResetBlock.includes('key?.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)')
  || !localProductResetBlock.includes("const { resetCommerceOrderDraftRecovery } = await import('./commerce-order-draft')")
  || !localProductResetBlock.includes('await resetCommerceOrderDraftRecovery()')
  || !localProductResetBlock.includes('WEBSITE_ECOMMERCE_HANDOFF_KEY,\n        LEGACY_STOREFRONT_DRAFT_RESET_KEY,\n        ...retainedKeys,')
  || !coreSource.includes('Website, Ecommerce setup, and handoff records')
  || coreSource.includes("from '../products/ecommerce/storefront-draft'")) fail('ecommerce_storefront_draft_not_in_deliberate_reset_or_broke_lazy_boundary')
if (!commerceOrderDraftSource.includes("COMMERCE_ORDER_DRAFT_SCHEMA = 'supermega.shop.order_draft.v1'")
  || !commerceOrderDraftSource.includes("['sku', 'quantity', 'unitPriceMmk', 'availableAtSave']")
  || !commerceOrderDraftSource.includes('COMMERCE_ORDER_DRAFT_MAX_BYTES')
  || !commerceOrderDraftSource.includes('COMMERCE_ORDER_DRAFT_LOCK_PREFIX')
  || !commerceOrderDraftSource.includes('COMMERCE_ORDER_DRAFT_RESET_LOCK')
  || !commerceOrderDraftSource.includes('commerceOrderDraftUtf8Bytes')
  || !commerceOrderDraftSource.includes('new TextEncoder().encode(value).byteLength')
  || !commerceOrderDraftSource.includes('expectedResetEpoch')
  || !commerceOrderDraftSource.includes('expectedInvalidFingerprint')
  || !commerceOrderDraftSource.includes('unreadableDraftFingerprint(currentRaw)')
  || !commerceOrderDraftSource.includes('currentRevision !== expectedRevision')
  || !commerceOrderDraftSource.includes('storage.getItem(storageKey) !== nextRaw')
  || !commerceOrderDraftSource.includes('resetCommerceOrderDraftRecovery')
  || !commerceOrderDraftSource.includes('commerceOrderDraftMatchesInput')
  || !commerceOrderDraftSource.includes('commerceOrderDraftCatalogState')
  || !commerceOrderDraftSource.includes('rebindCommerceOrderDraft')
  || !commerceOrderDraftSource.includes('promisedAt')
  || !commerceOrderDraftSource.includes("typeof value.promisedAt === 'string' ? value.promisedAt : ''")
  || ['rawMessage', 'sourceRecordId', 'evidenceReference', 'phone', 'address'].some((marker) => commerceOrderDraftSource.includes(marker))) fail('commerce_order_draft_contract_missing_or_contains_source_data')
if (!coreSource.includes("from './commerce-order-draft'")
  || !coreSource.includes("import('./commerce-order-draft')")
  || !coreSource.includes('readCommerceOrderDraft(orderDraftScope)')
  || !coreSource.includes("window.addEventListener('storage', refreshOrderDraft)")
  || !coreSource.includes('saveCommerceOrderDraft(')
  || !coreSource.includes('discardCommerceOrderDraft(')
  || !coreSource.includes('resumeSavedOrderDraft')
  || !coreSource.includes('acceptCurrentOrderDraftCatalog')
  || !coreSource.includes('resumedOrderNeedsReview')
  || !coreSource.includes('orderDraftOperationEpochRef.current !== operationEpochAtSchedule')
  || !coreSource.includes('commerceOrderDraftMatchesInput(latestRecovery.draft, recoveryInputAtReview)')
  || !coreSource.includes('sourceBacked ? null : currentOrderRecoveryInput')
  || !coreSource.includes('Enter a manual handoff reference before recovery can save this order.')
  || !coreSource.includes("navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })")
  || !coreSource.includes('const navigationDraftId = ecommerceNavigationDraft.id')
  || !rejectedEcommerceNavigationBlock.includes('consumedEcommerceDraftId.current = navigationDraftId')
  || !rejectedEcommerceNavigationBlock.includes('setPreparedEcommerceDraft(null)')
  || !rejectedEcommerceNavigationBlock.includes("navigate({ pathname: '/shop/', search: '?tab=orders' }, { replace: true, state: null })")
  || !coreSource.includes('Loading orders')
  || !coreSource.includes('Confirmed order left a saved recovery copy')
  || !coreSource.includes('Recovery unavailable')
  || !coreSource.includes('expectedInvalidFingerprint: invalidFingerprintAtDiscard')
  || !coreSource.includes('Unfinished order saved on this device')
  || !coreSource.includes('Source-message and Ecommerce links are never recovered.')
  || !coreSource.includes('Order confirmed, but its local recovery copy remains:')
  || !coreSource.includes("setPayment('')")
  || !coreSource.includes('unfinished order drafts')) fail('commerce_order_draft_recovery_ui_missing')
if (!ecommerceSource.includes("'sourcePreviewDigest' in draft")
  || !ecommerceSource.includes('localPreviewDigest: draft.sourcePreviewDigest')
  || !ecommerceSource.includes('legacyStorefrontDraftStorageKey(LOCAL_STOREFRONT_DRAFT_SCOPE)')
  || !ecommerceSource.includes('savedDraft.localPreviewDigest === digest')
  || !ecommerceSource.includes('sourcePreviewDigest: digest')
  || !ecommerceSource.includes('Saved setup needs fingerprint upgrade')
  || !ecommerceSource.includes('Upgrade storefront')
  || !ecommerceSource.includes('localCatalogRebindRequired')
  || !ecommerceSource.includes('event.key === COMMERCE_KEY || event.key === null')
  || !ecommerceSource.includes("setDraftNotice('Shop catalog changed in another tab.")
  || !ecommerceSource.includes("event.key === legacyDraftKey && latest.status === 'ready'")) fail('ecommerce_local_storefront_fingerprint_or_sync_missing')
if (!ecommerceSource.includes('Prices and availability are read-only.')
  || !ecommerceSource.includes('Requests enter Shop review. Payment and fulfilment stay separate.')
  || !ecommerceSource.includes('cannot reserve stock, create an order, take payment, send a message, or publish a site.')
  || !ecommerceSource.includes('className="ecommerce-verification"')
  || !ecommerceSource.includes('Preview verification')
  || !ecommerceSource.includes('Local currentness check')
  || !ecommerceSource.includes('same storefront fields and Shop snapshot produce the same local fingerprint.')
  || !ecommerceSource.includes('Request an item')
  || ecommerceSource.includes('Test a customer request')
  || !ecommerceSource.includes('Connect a managed workspace for shared, recoverable retention.')
  || !ecommerceSource.includes('No Shop record or stock changed.')
  || !ecommerceSource.includes('Save storefront')
  || !ecommerceSource.includes('BROWSE &amp; REQUEST')
  || ecommerceSource.includes('ORDER ONLINE')
  || !ecommerceSource.includes('Discard')
  || !ecommerceSource.includes('Saved on this device')
  || !ecommerceSource.includes('Saved to workspace')
  || !ecommerceSource.includes('readStorefrontDraft')
  || !ecommerceSource.includes('saveStorefrontDraft')
  || ecommerceSource.includes('managed:${identity.workspaceId}')
  || !ecommerceSource.includes("window.addEventListener('storage', refreshLocalStorefront)")
  || !ecommerceSource.includes('if (managedIdentity) return')
  || !ecommerceSource.includes("eventType: 'commerce.storefront.configuration.saved'")
  || !ecommerceSource.includes("error.code === 'trial_version_conflict'")
  || !ecommerceSource.includes('current edits were kept for review')
  || !ecommerceSource.includes('loadManagedBootstrap(identity)')
  || !ecommerceSource.includes('result.command_id !== commandId')
  || !ecommerceSource.includes('disabled={catalogHydrating || draftBusy}')
  || !ecommerceSource.includes('selectionReviewRequired')
  || !ecommerceSource.includes('Open recovery settings')
  || !ecommerceSource.includes('Saved products no longer in this Shop')
  || !ecommerceCssSource.includes('.ecommerce-save-bar')
  || !ecommerceCssSource.includes('.ecommerce-save-actions .core-button')
  || !ecommerceCssSource.includes('.ecommerce-selection-warning')
  || !ecommerceCssSource.includes('font-size: 12px')
  || !coreSource.includes('<strong>Ecommerce</strong><small>Build a storefront from Shop</small>')
  || coreSource.includes('<h2>AI Agent Solutions</h2>')) fail('ecommerce_storefront_ui_boundary_missing')
if (ecommerceSource.indexOf('Request an item') > ecommerceSource.indexOf('Preview verification')) {
  fail('ecommerce_technical_verification_precedes_primary_request_flow')
}
const managedStorefrontStart = ecommerceSource.indexOf('async function saveManagedStorefront')
const managedStorefrontEnd = ecommerceSource.indexOf('async function saveCurrentStorefront', managedStorefrontStart)
const managedStorefrontAction = ecommerceSource.slice(managedStorefrontStart, managedStorefrontEnd)
const managedHydrationStart = ecommerceSource.indexOf('setManagedIdentity(identity)')
const managedHydrationEnd = ecommerceSource.indexOf('.catch((error) =>', managedHydrationStart)
const managedHydrationAction = ecommerceSource.slice(managedHydrationStart, managedHydrationEnd)
const managedViewStart = ecommerceSource.indexOf('function applyManagedView')
const managedViewEnd = ecommerceSource.indexOf('async function saveManagedStorefront', managedViewStart)
const managedViewAction = ecommerceSource.slice(managedViewStart, managedViewEnd)
if (managedStorefrontStart < 0
  || managedStorefrontEnd < 0
  || managedHydrationStart < 0
  || managedHydrationEnd < 0
  || managedViewStart < 0
  || managedViewEnd < 0
  || !managedStorefrontAction.includes('prepareManagedStorefrontSave')
  || !managedStorefrontAction.includes('loadManagedBootstrap')
  || !managedStorefrontAction.includes('saveManagedCommerceCommand')
  || !managedStorefrontAction.includes('acceptManagedStorefrontCommand')
  || !managedStorefrontAction.includes('identity,')
  || ['saveStorefrontDraft', 'readStorefrontDraft', 'localStorage', 'sessionStorage'].some((marker) => managedStorefrontAction.includes(marker))
  || ['saveStorefrontDraft', 'readStorefrontDraft', 'localStorage', 'sessionStorage'].some((marker) => managedHydrationAction.includes(marker))
  || !managedViewAction.includes('if (!replaceEdits) return')
  || !managedViewAction.includes('setStoreName(view.fields.storeName)')
  || managedViewAction.indexOf('if (!replaceEdits) return') > managedViewAction.indexOf('setStoreName(view.fields.storeName)')
  || !managedStorefrontSource.includes('commerceCatalogDigest')
  || !managedStorefrontSource.includes('commerceStorefrontConfigurationActionId')
  || !managedStorefrontSource.includes('acceptManagedStorefrontSave')
  || ['localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest'].some((marker) => managedStorefrontSource.includes(marker))) fail('managed_storefront_workspace_save_boundary_missing')
const ecommerceCatalogIndex = ecommerceSource.indexOf('className="ecommerce-catalog-list"')
const ecommerceSaveIndex = ecommerceSource.indexOf('className="ecommerce-save-bar"')
if (ecommerceCatalogIndex < 0 || ecommerceSaveIndex < ecommerceCatalogIndex) fail('ecommerce_save_precedes_product_selection')
if (!ecommerceSource.includes("useState<'setup' | 'preview'>('setup')")
  || !ecommerceSource.includes('aria-label="Ecommerce workspace" className="ecommerce-mobile-switch"')
  || !ecommerceSource.includes('aria-controls="ecommerce-setup-panel"')
  || !ecommerceSource.includes('aria-controls="ecommerce-preview-panel"')
  || !ecommerceSource.includes('data-mobile-view={mobileWorkspace}')
  || !ecommerceSource.includes("window.matchMedia('(max-width: 840px)').matches")
  || !ecommerceSource.includes("document.getElementById(`ecommerce-${view}-panel`)?.scrollIntoView({ block: 'start' })")
  || !ecommerceSource.includes('id="ecommerce-setup-panel"')
  || !ecommerceSource.includes('id="ecommerce-preview-panel"')
  || !ecommerceCssSource.includes('.ecommerce-mobile-switch {\n  display: none;')
  || !ecommerceCssSource.includes('@media (max-width: 840px)')
  || !ecommerceCssSource.includes('position: sticky;')
  || !ecommerceCssSource.includes('top: 54px;')
  || !ecommerceCssSource.includes('.ecommerce-workspace[data-mobile-view="setup"] > .ecommerce-preview-panel,')
  || !ecommerceCssSource.includes('.ecommerce-workspace[data-mobile-view="preview"] > .ecommerce-setup {')
  || !ecommerceCssSource.includes('min-height: 46px;')
  || (ecommerceCssSource.match(/scroll-margin-top: 112px;/g) ?? []).length < 2
  || !ecommerceSource.includes('Awaiting Shop handoff')
  || !ecommerceSource.includes('is awaiting Shop handoff. No Shop record or stock changed.')) fail('ecommerce_mobile_workspace_not_modular')
const directRequestStart = ecommerceSource.indexOf('function openRequestFor')
const directRequestEnd = ecommerceSource.indexOf('async function createRequestReceipt', directRequestStart)
const directRequestAction = ecommerceSource.slice(directRequestStart, directRequestEnd)
const storefrontSaveStart = ecommerceSource.indexOf('async function saveCurrentStorefront')
const storefrontSaveEnd = ecommerceSource.indexOf('function discardStorefrontChanges', storefrontSaveStart)
const storefrontSaveAction = ecommerceSource.slice(storefrontSaveStart, storefrontSaveEnd)
const finishStorefrontSetupStart = ecommerceSource.indexOf('function finishStorefrontSetup')
const finishStorefrontSetupEnd = ecommerceSource.indexOf('function applyManagedView', finishStorefrontSetupStart)
const finishStorefrontSetupAction = ecommerceSource.slice(finishStorefrontSetupStart, finishStorefrontSetupEnd)
const storefrontSavePreviewAdvanceCount = (storefrontSaveAction.match(/showSavedStorefrontPreview\(\)/g) ?? []).length
const managedStorefrontSave = storefrontSaveAction.indexOf('await saveManagedStorefront(managedIdentity)')
const localStorefrontSave = storefrontSaveAction.indexOf('const saved = await saveStorefrontDraft(')
const firstSavePreviewAdvance = storefrontSaveAction.indexOf('showSavedStorefrontPreview()')
const lastSavePreviewAdvance = storefrontSaveAction.lastIndexOf('showSavedStorefrontPreview()')
if (directRequestStart < 0
  || directRequestEnd < 0
  || storefrontSaveStart < 0
  || storefrontSaveEnd < 0
  || finishStorefrontSetupStart < 0
  || finishStorefrontSetupEnd < 0
  || !ecommerceSource.includes('onClick={() => openRequestFor(item.sku)}')
  || !ecommerceSource.includes('aria-controls="ecommerce-request-form"')
  || !ecommerceSource.includes('const storefrontSaveRef = useRef<HTMLButtonElement>(null)')
  || !ecommerceSource.includes('const storefrontPreviewHeadingRef = useRef<HTMLHeadingElement>(null)')
  || !ecommerceSource.includes('const requestReviewRef = useRef<HTMLInputElement>(null)')
  || !ecommerceSource.includes('function finishStorefrontSetup()')
  || !finishStorefrontSetupAction.includes('function showSavedStorefrontPreview()')
  || !finishStorefrontSetupAction.includes("showMobileWorkspace('preview')")
  || !finishStorefrontSetupAction.includes('storefrontPreviewHeadingRef.current?.focus({ preventScroll: true })')
  || !ecommerceSource.includes("showMobileWorkspace('setup')")
  || !ecommerceSource.includes("storefrontSaveRef.current?.scrollIntoView({ block: 'center' })")
  || !ecommerceSource.includes("storefrontSaveRef.current?.focus({ preventScroll: true })")
  || !ecommerceSource.includes('id="ecommerce-save-storefront"')
  || !ecommerceSource.includes('ref={storefrontSaveRef}')
  || !ecommerceSource.includes('ref={storefrontPreviewHeadingRef} tabIndex={-1}')
  || !ecommerceSource.includes('className="ecommerce-preview-gate"')
  || !ecommerceSource.includes('aria-controls="ecommerce-setup-panel"')
  || !ecommerceSource.includes('onClick={finishStorefrontSetup}')
  || !ecommerceSource.includes('Finish setup first')
  || !ecommerceSource.includes("className={available && savedDraftIsCurrent ? 'has-request-action' : undefined}")
  || !ecommerceSource.includes('{available && savedDraftIsCurrent ? (')
  || !ecommerceSource.includes('{savedDraftIsCurrent ? (\n            <details\n              className="ecommerce-request-lab"')
  || !ecommerceSource.includes("<b>{requestLedger.requests.length ? `${requestLedger.requests.length} pending` : 'Start'}</b>")
  || ecommerceSource.includes('Save storefront before requesting ${item.name}')
  || ecommerceSource.includes("disabled={!available || catalogHydrating || !savedDraftIsCurrent}")
  || !ecommerceSource.includes('requestCustomerRef.current?.focus')
  || !ecommerceSource.includes("requestReviewRef.current?.scrollIntoView({ block: 'center' })")
  || !ecommerceSource.includes('requestReviewRef.current?.focus({ preventScroll: true })')
  || !ecommerceSource.includes('ref={requestReviewRef} type="checkbox"')
  || !ecommerceSource.includes('open={requestOpen}')
  || !ecommerceSource.includes("'Delivery phone / area' : 'Pickup name / phone'")
  || !ecommerceSource.includes("'e.g. 09… · Hlaing' : 'e.g. Ma Su · 09…'")
  || !ecommerceSource.includes('Save this storefront before receiving a customer request.')
  || !ecommerceSource.includes('disabled={!savedDraftIsCurrent || !previewResult.preview')
  || storefrontSavePreviewAdvanceCount !== 2
  || managedStorefrontSave < 0
  || localStorefrontSave < 0
  || firstSavePreviewAdvance < managedStorefrontSave
  || lastSavePreviewAdvance < localStorefrontSave
  || !finishStorefrontSetupAction.includes("showMobileWorkspace('setup')")
  || !finishStorefrontSetupAction.includes("storefrontSaveRef.current?.scrollIntoView({ block: 'center' })")
  || !finishStorefrontSetupAction.includes("storefrontSaveRef.current?.focus({ preventScroll: true })")
  || ['saveCurrentStorefront', 'saveManagedCommerceCommand', 'saveStorefrontDraft', 'createRequestReceipt', 'setStoreName', 'setSelectedSkus', 'fetch('].some((marker) => finishStorefrontSetupAction.includes(marker))
  || !directRequestAction.includes('catalogHydrating || !savedDraftIsCurrent')
  || !ecommerceSource.includes('const latestRequestIsCurrent = Boolean(latestRequest')
  || !ecommerceSource.includes('latestRequest.sourcePreviewDigest === digest')
  || !ecommerceSource.includes("setStoreName(event.target.value); setDraftNotice(''); setHandoffConfirmed(false)")
  || !ecommerceSource.includes("setSummary(event.target.value); setDraftNotice(''); setHandoffConfirmed(false)")
  || !ecommerceSource.includes('disabled={!latestRequestIsCurrent || handoffBusy}')
  || !ecommerceSource.includes('disabled={!latestRequestIsCurrent || !handoffConfirmed')
  || !ecommerceSource.includes('This receipt no longer matches the current saved storefront.')
  || !ecommerceSource.includes("useState('')")
  || ['createRequestReceipt', 'sendToShopReview', 'retainInManagedInbox', 'navigate(', 'saveManagedCommerceCommand', 'localStorage', 'sessionStorage', 'fetch('].some((marker) => directRequestAction.includes(marker))
  || !ecommerceCssSource.includes('.ecommerce-preview-gate')
  || !ecommerceCssSource.includes('.ecommerce-preview-gate .core-button')
  || !ecommerceCssSource.includes('.storefront-request-button')
  || !ecommerceCssSource.includes('min-height: 44px')
  || !ecommerceCssSource.includes('@media (max-width: 560px)')) fail('ecommerce_direct_request_action_missing_or_consequential')
if (!storefrontRequestSource.includes("supermega.ecommerce.order_request.v1")
  || !storefrontRequestSource.includes("state: 'pending_shop_review'")
  || !storefrontRequestSource.includes('sourceStorefrontRevision')
  || !storefrontRequestSource.includes('sourceStorefrontActionId')
  || !storefrontRequestSource.includes('legacyFields')
  || !storefrontRequestSource.includes('commerceStorefrontRequestEquals')
  || !storefrontRequestSource.includes('buildStorefrontOrderRequest')
  || !storefrontRequestSource.includes('recordStorefrontOrderRequest')
  || !storefrontRequestSource.includes('storefrontRequestLedgerContains')
  || !storefrontRequestSource.includes('await storefrontPreviewDigest(preview) !== sourcePreviewDigest')
  || ['setItem(', 'removeItem(', 'fetch(', 'XMLHttpRequest', 'navigator.locks'].some((marker) => storefrontRequestSource.includes(marker))) fail('ecommerce_request_contract_missing_or_mutating')
const ecommerceOrderSubmitStart = coreSource.indexOf('<div className="order-submit-bar" data-ecommerce-payment=')
const ecommerceOrderSubmitEnd = coreSource.indexOf('</div>', ecommerceOrderSubmitStart)
const ecommerceOrderSubmit = coreSource.slice(ecommerceOrderSubmitStart, ecommerceOrderSubmitEnd)
const ecommercePaymentPosition = ecommerceOrderSubmit.indexOf('preparedEcommerceDraft ? <label className="order-ecommerce-payment">')
const ecommerceReviewPosition = ecommerceOrderSubmit.indexOf('className="core-button primary"')
if (!ecommerceConfirmSource.includes('storefrontRequestLedgerContains')
  || !ecommerceConfirmSource.includes('await storefrontPreviewDigest(preview)')
  || !ecommerceConfirmSource.includes('await storefrontPreviewDigest(currentPreview)')
  || !ecommerceConfirmSource.includes('catalogItems[0].onHand < request.line.quantity')
  || !ecommerceConfirmSource.includes('recordEcommerceShopDraft')
  || !ecommerceHandoffSource.includes("supermega.ecommerce.shop_draft.v1")
  || !ecommerceHandoffSource.includes("state: 'review_required'")
  || !ecommerceHandoffSource.includes('ecommerceShopDraftMatchesCatalog')
  || !ecommerceHandoffSource.includes('ECOMMERCE:${request.id}:${request.sourcePreviewDigest}')
  || !ecommerceSource.includes('I reviewed the SKU, quantity, MMK price, and current availability.')
  || !ecommerceSource.includes('Open draft in Shop')
  || ecommerceSource.includes('Send to Shop review')
  || !ecommerceSource.includes('state: { ecommerceShopDraft: draft }')
  || !coreSource.includes('Ecommerce request')
  || !coreSource.includes('Choose how payment will be reviewed before preparing this order.')
  || ecommerceOrderSubmitStart < 0
  || ecommerceOrderSubmitEnd < 0
  || ecommercePaymentPosition < 0
  || ecommerceReviewPosition < ecommercePaymentPosition
  || !ecommerceOrderSubmit.includes("data-ecommerce-payment={preparedEcommerceDraft ? 'true' : 'false'}")
  || !ecommerceOrderSubmit.includes('form="commerce-manual-order-form" ref={orderPaymentRef} required value={payment}')
  || !ecommerceOrderSubmit.includes('disabled={commerceControlsDisabled || resumedOrderNeedsReview || orderDraftConflict || Boolean(preparedEcommerceDraft && (!payment || !promisedAt))}')
  || !ecommerceOrderSubmit.includes('ref={orderReviewRef}')
  || !ecommerceOrderSubmit.includes("!promisedAt ? 'Choose promise' : !payment ? 'Choose payment' : resumedOrderNeedsReview ? 'Review current Shop values'")
  || !coreSource.includes('orderPaymentRef.current?.focus({ preventScroll: true })')
  || !coreSource.includes('const orderReviewRef = useRef<HTMLButtonElement>(null)')
  || !coreSource.includes('preparedEcommerceDraft && orderReviewRef.current?.isConnected')
  || !coreSource.includes("const restorePreparedEcommerce = pendingAction?.kind === 'order_create' && Boolean(preparedEcommerceDraft)")
  || !coreSource.includes('if (dialog && !dialog.open) dialog.showModal()\n      orderReviewRef.current?.focus({ preventScroll: true })')
  || !coreSource.includes('Review cancelled. The prepared Ecommerce request and Payment are unchanged; Shop data was not modified.')
  || !coreSource.includes("summary: ecommerceDraft ? 'Review Ecommerce order'")
  || !coreSource.includes('Customer ${order.customer} · ${lineReview}')
  || !coreSource.includes('Payment ${payment} · Owner confirming operator · Promise ${formatIssueDue(canonicalPromisedAt)}')
  || !coreSource.includes('Stock ${reservationReview}')
  || !coreCssSource.includes('.order-ecommerce-payment')
  || !coreSource.includes("import('../products/ecommerce/ecommerce-shop-handoff')")
  || ['setItem(', 'removeItem(', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'navigator.locks', 'convertCommerceWebsiteIntake', 'reserveCommerceOrder', 'mutateCommerceWorkspace'].some((marker) => ecommerceConfirmSource.includes(marker) || ecommerceHandoffSource.includes(marker))) fail('ecommerce_shop_handoff_contract_missing_or_mutating')
if (!commerceSource.includes('recordCommerceStorefrontRequest')
  || !commerceSource.includes('storefrontRequests?: CommerceStorefrontRequest[]')
  || !commerceSource.includes('commerceStorefrontPreviewDigest')
  || !commerceSource.includes('configuration.selectedSkus.includes(validatedRequest.line.sku)')
  || !commerceSource.includes('validatedRequest.sourceStorefrontRevision !== configuration.revision')
  || !commerceSource.includes('commerceStorefrontRequestEquals')
  || !commerceSource.includes('legacyFields')
  || !commerceSource.includes('matches[0].onHand < 1')
  || !commerceSource.includes('ECOMMERCE:${validatedRequest.id}:${validatedRequest.sourcePreviewDigest}')
  || !managedTrialSource.includes('commerce.storefront_request.received')
  || !managedCommerceRuntime.includes('commerce.storefront_request.received')
  || !ecommerceSource.includes('saveManagedCommerceCommand')
  || !ecommerceSource.includes('await recordCommerceStorefrontRequest')
  || !ecommerceSource.includes("eventType: 'commerce.storefront_request.received'")
  || !ecommerceSource.includes('Save to Shop inbox')
  || !ecommerceSource.includes('latestRequest.sourcePreviewDigest !== currentDigest')
  || !ecommerceSource.includes('sourceStorefront: sourceConfiguration')
  || !ecommerceSource.includes('expectedRequests = [latestRequest, ...commerceStorefrontRequests(currentState)]')
  || !ecommerceSource.includes('catalogRebindRequired')
  || !ecommerceSource.includes('Rebind storefront')
  || !ecommerceSource.includes('accepted.storefrontConfiguration ?? null')
  || !ecommerceSource.includes('identity.workspaceId !== managedIdentity.workspaceId')
  || !coreSource.includes('Ecommerce inbox')
  || !coreSource.includes('reviewStorefrontRequest')
  || !coreSource.includes('separate Shop action gate')) fail('managed_ecommerce_inbox_contract_missing')
if (!appPackage.scripts?.lint?.includes('src/products')) fail('prototype_sources_not_linted')
if (!websiteSource.includes('No website has been deployed.')
  || !websiteSource.includes('No deployment occurred.')
  || !publishSource.includes('Stored on this device, not verified by a managed service.')
  || !publishSource.includes('No deployment, domain, payment, stock, message, or order change happens here.')
  || !publishSource.includes('It does not deploy or change a domain.')) fail('website_deployment_boundary_missing')
if (!websiteSource.includes('starterSetupActive')
  || !websiteSource.includes('Start site')
  || !websiteSource.includes('Sample only')
  || !websiteSource.includes('applyWebsiteStarterBrief')
  || !websiteSource.includes('const canReview = !hasUnsavedChanges')
  || !websiteSource.includes("requestedView === 'publish' && canReview")
  || !websiteSource.includes("nextView === 'publish' && !canReview")
  || !websiteStarterSetupSource.includes('Start with your business')
  || !websiteStarterSetupSource.includes('Preview my site')
  || !websiteStarterSetupSource.includes('View sample')
  || !websiteStarterSetupSource.includes('no website or domain changes here')
  || !websiteStarterSetupSource.includes('aria-invalid')
  || !websiteStarterSetupSource.includes('aria-describedby')
  || !websiteStarterSetupSource.includes('noValidate')
  || !websiteStarterSetupSource.includes('const starterFormRef = useRef<HTMLFormElement>(null)')
  || !websiteStarterSetupSource.includes('ref={starterFormRef}')
  || !websiteStarterSetupSource.includes("querySelector<HTMLElement>('[aria-invalid=\"true\"]')")
  || !websiteStarterSetupSource.includes("firstInvalidField?.scrollIntoView({ block: 'center' })")
  || !websiteStarterSetupSource.includes("firstInvalidField?.focus({ preventScroll: true })")
  || websiteStarterSetupSource.includes('website-starter-errors')
  || websiteStarterSetupSource.includes('Review the brief')
  || websiteCssSource.includes('.website-starter-errors')
  || !websiteStarterSource.includes('isUntouchedWebsiteStarter')
  || !websiteStarterSource.includes("stage: 'draft'")
  || !websiteStarterSource.includes('websiteStarterBriefIssues')
  || ['fetch(', 'localStorage', 'sessionStorage', 'XMLHttpRequest'].some((marker) => websiteStarterSource.includes(marker) || websiteStarterSetupSource.includes(marker))) fail('website_named_business_starter_missing_or_side_effectful')
if (!websiteModelSource.includes("supermega.website.workspace.v2") || !websiteModelSource.includes('LEGACY_WEBSITE_STORAGE_KEY') || !websiteModelSource.includes('mutateWebsiteWorkspace') || !websiteModelSource.includes('WEBSITE_MUTATION_LOCK') || !websiteModelSource.includes('preservesAppendOnlyHistory') || !websiteModelSource.includes('canonicalJson')) fail('website_v2_locked_store_missing')
if (!websiteModelSource.includes('contentRevision') || !websiteModelSource.includes('evidenceIds') || !websiteModelSource.includes('migratedFromV1') || !websiteModelSource.includes('getCurrentApproval') || !websiteModelSource.includes('getCurrentPublish')) fail('website_release_provenance_missing')
if (!websiteModelSource.includes("supermega.website.artifact.v1")
  || !websiteModelSource.includes('createWebsiteArtifact')
  || !websiteModelSource.includes('artifact: createWebsiteArtifact(workspace)')
  || !websiteModelSource.includes('isMetadataOnlyPublishRecord')) fail('website_approved_artifact_persistence_missing')
if (!websiteExportSource.includes('buildWebsiteHtml')
  || !websiteExportSource.includes('Content-Security-Policy')
  || !websiteExportSource.includes('createWebsiteHtmlDownload')
  || !websiteExportSource.includes('escapeHtml')
  || ['fetch(', 'localStorage', 'sessionStorage', 'XMLHttpRequest'].some((marker) => websiteExportSource.includes(marker))
  || !websiteSource.includes('downloadPublishedSite')
  || !publishSource.includes('Download site')) fail('website_static_artifact_export_missing_or_side_effectful')
if (!sitePreviewSource.includes("ctaHref.startsWith('https://')") || !sitePreviewSource.includes("ctaHref.startsWith('#')") || !sitePreviewSource.includes('aria-disabled="true"')) fail('website_preview_destination_guard_missing')
if (!websiteWorkspaceSource.includes("addEventListener('storage', refreshFromStorage)") || !websiteWorkspaceSource.includes("removeEventListener('storage', refreshFromStorage)") || !websiteWorkspaceSource.includes('mutateWebsiteWorkspace(update, current.revision, current.contentRevision') || websiteWorkspaceSource.includes('localStorage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(workspace))')) fail('website_confirmed_write_or_cross_tab_refresh_missing')
if (!websiteSource.includes('Recovery settings')
  || !websiteSource.includes('href="/settings/#controls"')
  || !websiteSource.includes('Export backup')
  || !websiteModelSource.includes('The original value is untouched; export a backup or review the guided repair.')
  || !coreSource.includes('collectLocalProductRecords(window.localStorage)')
  || !coreSource.includes('localProductRecords')
  || !coreSource.includes('version: 10')
  || !coreSource.includes('WEBSITE_RECOVERY_EXPORT_PREFIX')
  || !coreSource.includes('key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)')
  || !coreSource.includes('key.startsWith(WEBSITE_RECOVERY_EXPORT_PREFIX)')
  || !coreSource.includes('LEGACY_WEBSITE_STORAGE_KEY')
  || !coreSource.includes('WEBSITE_STORAGE_KEY')
  || !coreSource.includes('WEBSITE_ECOMMERCE_HANDOFF_KEY')
  || !handoffSource.includes('export { LEGACY_WEBSITE_STORAGE_KEY, WEBSITE_STORAGE_KEY }')
  || coreSource.includes("import('../products/website/website-model')")
  || coreSource.includes("import('../products/product-handoff')")
  || coreSource.includes("from '../products/website/website-model'")
  || !websiteCssSource.includes('.website-notice-action')) fail('website_session_recovery_missing_or_eager')
if (!websiteModelSource.includes('repairInvalidWebsiteWorkspace')
  || !websiteModelSource.includes('readWebsiteRecoveryArchive')
  || !websiteModelSource.includes('listWebsiteRecoveryArchives')
  || !websiteModelSource.includes('deleteWebsiteRecoveryArchive')
  || !websiteModelSource.includes('WEBSITE_RECOVERY_INDEX_KEY')
  || !websiteModelSource.includes('WEBSITE_MUTATION_LOCK')
  || !websiteModelSource.includes('currentRaw !== candidate.expectedRaw')
  || !websiteModelSource.includes('storage.getItem(archiveKey) !== archiveRaw')
  || !websiteModelSource.includes('storage.getItem(WEBSITE_STORAGE_KEY)')
  || !websiteModelSource.includes("candidate.source === 'v1'")
  || !websiteWorkspaceSource.includes('invalidCandidateRef')
  || !websiteWorkspaceSource.includes('repairLocalWorkspace')
  || !websiteWorkspaceSource.includes('repairCandidateRevision')
  || !websiteSource.includes('repairConfirmationRevision === repairCandidateRevision')
  || !websiteWorkspaceSource.includes("storageModeRef.current === 'managed'")
  || !websiteWorkspaceSource.includes("storageModeRef.current = 'session-only'")
  || !websiteSource.includes('Review repair')
  || !websiteSource.includes('Keep copy and repair')
  || !websiteSource.includes('Download archive')
  || !websiteSource.includes('Recovery archives')
  || !websiteSource.includes('Confirm remove')
  || !websiteSource.includes('Shop, Plant, managed data, and domains stay unchanged.')
  || !websiteSource.includes('aria-busy={repairing}')) fail('website_targeted_repair_contract_missing')
const managedWebsiteCommandStart = managedTrialSource.indexOf('export async function saveManagedWebsiteCommand')
const managedWebsiteCommandEnd = managedTrialSource.indexOf('export async function createManagedApproval', managedWebsiteCommandStart)
const managedWebsiteCommandContract = managedTrialSource.slice(managedWebsiteCommandStart, managedWebsiteCommandEnd)
const managedWebsiteMutationStart = websiteWorkspaceSource.indexOf("if (storageModeRef.current === 'managed')")
const managedWebsiteMutationEnd = websiteWorkspaceSource.indexOf("} else if (storageModeRef.current === 'browser-local'", managedWebsiteMutationStart)
const managedWebsiteMutationContract = websiteWorkspaceSource.slice(managedWebsiteMutationStart, managedWebsiteMutationEnd)
const managedWebsiteNoChangeStart = managedWebsiteMutationContract.indexOf('if (!transitioned.changed)')
const managedWebsiteNoChangeEnd = managedWebsiteMutationContract.indexOf('\n          try {', managedWebsiteNoChangeStart)
const managedWebsiteNoChangeContract = managedWebsiteMutationContract.slice(managedWebsiteNoChangeStart, managedWebsiteNoChangeEnd)
if (managedWebsiteCommandStart < 0
  || managedWebsiteCommandEnd < 0
  || managedWebsiteMutationStart < 0
  || managedWebsiteMutationEnd < 0
  || managedWebsiteNoChangeStart < 0
  || managedWebsiteNoChangeEnd < 0
  || !managedWebsiteCommandContract.includes("surface: 'website'")
  || !managedWebsiteCommandContract.includes('identity: ManagedIdentity')
  || !managedWebsiteCommandContract.includes('request.identity')
  || !websiteWorkspaceSource.includes('loadManagedBootstrap(identity)')
  || !websiteWorkspaceSource.includes('loadManagedBootstrap(managedIdentity)')
  || websiteWorkspaceSource.includes('loadManagedBootstrap()')
  || !websiteWorkspaceSource.includes('managedIdentityRef')
  || !websiteWorkspaceSource.includes('identity: managedIdentity')
  || !websiteWorkspaceSource.includes('requireCurrentManagedIdentity(managedIdentity)')
  || !websiteWorkspaceSource.includes('acceptManagedWebsiteCommand')
  || !managedWebsiteNoChangeContract.includes('await requireCurrentManagedIdentity(managedIdentity)')
  || managedWebsiteNoChangeContract.indexOf('await requireCurrentManagedIdentity(managedIdentity)') > managedWebsiteNoChangeContract.indexOf('resolve(transitioned)')
  || !websiteWorkspaceSource.includes("storageModeRef.current = 'managed'")
  || !websiteWorkspaceSource.includes("error.code === 'trial_version_conflict'")
  || !managedWebsiteSource.includes('result.command_id !== expected.commandId')
  || !managedWebsiteSource.includes("result.surface !== 'website'")
  || !managedWebsiteSource.includes('result.event_type !== expected.eventType')
  || !managedWebsiteSource.includes('result.version !== expected.priorVersion + 1')
  || !managedWebsiteSource.includes('!sameWorkspace(confirmed, planned)')) fail('managed_website_command_client_missing')
if (!websiteWorkspaceSource.includes('bindManagedActor') || !websiteWorkspaceSource.includes('verifiedBy: actor') || !websiteWorkspaceSource.includes('reviewer: actor') || !websiteWorkspaceSource.includes('recordedBy: actor')) fail('managed_website_actor_binding_missing')
const websiteHydrationStart = websiteWorkspaceSource.indexOf('void (async () => {')
const websiteHydrationEnd = websiteWorkspaceSource.indexOf('})()', websiteHydrationStart)
const websiteHydration = websiteWorkspaceSource.slice(websiteHydrationStart, websiteHydrationEnd)
if (websiteHydration.indexOf('try {') < 0 || websiteHydration.indexOf('try {') > websiteHydration.indexOf('currentManagedIdentity()') || websiteHydration.indexOf('finally') < websiteHydration.indexOf('currentManagedIdentity()')) fail('managed_website_identity_failure_can_stick_hydration')
const websiteUnifiedCss = websiteCssSource.slice(websiteCssSource.lastIndexOf('/* Unified Website workflow'))
if (!websiteSource.includes("type WebsiteView = 'content' | 'publish'")
  || !websiteSource.includes('className="website-action-bar"')
  || !websiteSource.includes('Review site')
  || websiteSource.includes('The four-page prototype limit is reached')
  || websiteSource.includes('This prototype is capped at four pages.')
  || !websiteSource.includes('className="website-primary-actions"')
  || !websiteSource.includes('className="website-site-settings"')
  || !websiteSource.includes(">Site</summary>")
  || !websiteSource.includes("openWorkspaceView('publish')")
  || !websiteSource.includes('>Back to edit</button>')
  || websiteSource.includes('workspaceViews')
  || websiteSource.includes('mobileWorkspaceViews')
  || websiteSource.includes('role="tablist"')
  || websiteSource.includes('role="tabpanel"')
  || websiteSource.includes('splitPreview')
  || websiteSource.includes('className="website-mobile-seo-settings"')
  || ['.website-workspace-nav', '.website-mobile-mode-nav', '.website-mobile-page-bar', '.website-mobile-site-settings', '.website-surface-controls', '.website-split-control', '[data-split='].some((selector) => websiteCssSource.includes(selector))) fail('website_unified_action_bar_missing')
if (!websiteSource.includes('function previewPage')
  || !websiteSource.includes('onSelectPage={previewPage}')
  || !websiteSource.includes("if (pageId !== selectedPage.id && !selectPage(pageId)) return")
  || !websiteSource.includes('setSelectedPageId(pageId)')
  || !websiteSource.includes("openContentSurface('preview')")
  || !websiteSource.includes('setSiteSettingsOpen(false)')
  || websiteSource.includes("setNotice('Previewing the selected page.')")) fail('website_preview_action_does_not_open_preview')
if (!websiteSource.includes('ref={headingRef} tabIndex={-1}')
  || !websiteSource.includes('requestHeadingFocus()')
  || !websiteSource.includes('recoveryPrimaryActionRef')
  || !websiteSource.includes('Edit one section, preview it, then save or discard.')
  || /\.website-heading\[data-view="(?:content|publish)"\]\s+p\s*\{[^}]*display:\s*none/s.test(websiteUnifiedCss)
  || !websiteUnifiedCss.includes('.website-heading[data-view="content"] p,\n  .website-heading[data-view="publish"] p {\n    display: block;')) fail('website_view_transition_focus_or_mobile_heading_missing')
if (!websiteUnifiedCss.includes('.website-action-bar')
  || !websiteUnifiedCss.includes('grid-template-columns: minmax(280px, 1fr) auto auto')
  || !websiteUnifiedCss.includes('.website-site-settings-content')
  || !websiteUnifiedCss.includes('max-height: min(620px, calc(100svh - 170px))')
  || !websiteUnifiedCss.includes('@media screen and (max-width: 900px)')
  || !websiteUnifiedCss.includes('@media screen and (max-width: 560px)')
  || !websiteUnifiedCss.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')
  || !websiteUnifiedCss.includes('.website-heading[data-view="content"]')
  || !websiteUnifiedCss.includes('display: none')) fail('website_unified_responsive_shell_missing')
if (!websiteSource.includes("const [surface, setSurface] = useState<'work' | 'preview'>('work')")
  || !websiteSource.includes('data-surface={surface}')
  || !websiteSource.includes("setSurface('work')")
  || !websiteSource.includes("surface === 'preview' ? 'Back' : 'Preview'")) fail('website_focus_mode_missing')
if (!websiteSource.includes('createWebsiteEditSession(workspace)')
  || !websiteSource.includes('commitWebsiteEditSession(current, retained.session)')
  || !websiteSource.includes('restoreWebsiteEditSession(raw)')
  || !websiteSource.includes('data-editing={hasUnsavedChanges')
  || !websiteSource.includes('Unsaved preview')
  || !websiteSource.includes('function saveDraft()')
  || !websiteSource.includes('function discardDraft()')
  || !websiteSource.includes('disabled={editConflict || savingDraft}')
  || !websiteModelSource.includes('updateWebsiteEditSession')
  || !websiteModelSource.includes('websiteEditSessionMatches')
  || !websiteModelSource.includes('sameReleaseHistory')
  || !websiteCssSource.includes('.website-save-state[data-state="unsaved"]')
  || !websiteCssSource.includes('.website-action-bar[data-editing="true"]')) fail('website_transactional_edit_session_missing')
if (!websiteCssSource.includes('.website-workspace-grid[data-surface="work"] > .website-preview-surface')
  || !websiteCssSource.includes('.website-workspace-grid[data-surface="preview"] > .website-work-surface')
  || !websiteCssSource.includes('.website-workspace-grid[data-surface="preview"] > .website-preview-surface')
  || !websiteCssSource.includes('display: none')) fail('website_mobile_panels_not_bounded')
if (!contentSource.includes("type EditorSection = 'page' | 'hero' | 'sections' | 'seo'")
  || !contentSource.includes('aria-label="Page section to edit"')
  || !contentSource.includes('data-editor-section={editorSection}')
  || !websiteCssSource.includes('.website-editor-scroll[data-editor-section] > [data-content-section]')) fail('website_content_focus_contract_missing')
if (!publishSource.includes("type PublishStep = 'checks' | 'evidence' | 'approval' | 'snapshot'")
  || !publishSource.includes("{ id: 'checks', label: 'Checks' }")
  || !publishSource.includes("{ id: 'evidence', label: 'Evidence' }")
  || !publishSource.includes("{ id: 'approval', label: 'Approval' }")
  || !publishSource.includes("{ id: 'snapshot', label: 'Site file' }")
  || !publishSource.includes('aria-current={activeStep === step.id')
  || !publishSource.includes("activeStep === 'checks'")
  || !publishSource.includes("activeStep === 'evidence'")
  || !publishSource.includes("activeStep === 'approval'")
  || !publishSource.includes("activeStep === 'snapshot'")
  || !publishCssSource.includes('grid-template-columns: repeat(4, minmax(0, 1fr))')
  || !publishCssSource.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
  || !publishCssSource.includes('font-size: 16px')) fail('website_publish_task_flow_missing')
if (!publishSource.includes('Create site file')
  || publishSource.includes('Optional Shop handoff')
  || publishSource.includes('Send intake')
  || publishSource.includes('Review in Shop')
  || publishSource.includes('onPrepareCommerceHandoff')
  || publishSource.includes('website-handoff')) fail('website_publish_owns_order_intake_or_lost_site_action')
const websiteMobileCss = websiteCssSource.slice(websiteCssSource.indexOf('@media (max-width: 640px)'), websiteCssSource.indexOf('@media (prefers-reduced-motion'))
const websitePreviewControlsHiddenUnconditionally = /(?:^|\n)\s*\.website-preview-controls\s*\{\s*display:\s*none/.test(websiteMobileCss)
if (!websiteMobileCss.includes('.website-preview-controls') || !websiteMobileCss.includes('display: flex') || websitePreviewControlsHiddenUnconditionally) fail('website_mobile_review_controls_hidden')
if (!websiteCssSource.includes('.website-inline-actions > button,\n  .website-navigation-actions > button {\n    min-width: 44px;')) fail('website_mobile_reorder_touch_target_undersized')
if (!commerceIntakeSource.includes('Browser-local evidence only.') || !commerceIntakeSource.includes('No customer message, payment, delivery request, or external write occurs.')) fail('commerce_intake_boundary_missing')
if (!coreSource.includes('Start from a channel message')
  || !coreSource.includes('Human-mapped intake')
  || !coreSource.includes('AI is not connected')
  || !coreSource.includes('The full message is not part of the order record.')
  || !coreSource.includes('const sourceRecordId = sourceDraft?.sourceRecordId ?? ecommerceDraft?.sourceRequestId')
  || !coreSource.includes('const sourceEvidence = sourceDraft?.evidenceReference ?? ecommerceDraft?.evidenceReference')
  || !coreSource.includes('evidenceReferenceSuggestion: sourceEvidence')
  || !coreSource.includes('evidenceReferenceLocked: Boolean(sourceRecordId)')
  || !coreSource.includes('onAcceptedFocus')
  || !coreSource.includes("setOrderEntryMode('manual')")
  || !coreSource.includes("useState<ChannelOrderField>('customer')")
  || !coreSource.includes('aria-label="Message field mapping"')
  || !coreSource.includes('className="channel-intake-disclosure"')
  || !coreSource.includes('channelOrderDraftIsReady')) fail('channel_order_intake_ui_missing')
if (!coreSource.includes('className="core-panel next-task-card"')
  || !coreSource.includes('<details className="home-more">')
  || !coreSource.includes('className="product-launcher product-catalog"')
  || !coreSource.includes("useState<'manual' | 'message' | 'online'>('manual')")
  || !coreSource.includes('aria-label="Order source" className="order-entry-methods"')
  || !coreSource.includes("aria-pressed={orderEntryMode === 'manual'}")
  || !coreSource.includes('<dialog aria-labelledby="action-confirm-title" className="accountable-action-gate"')
  || !coreSource.includes('<details className="core-panel today-more')
  || !coreSource.includes("useState<'workflow' | 'success' | 'system'>('workflow')")
  || !coreSource.includes('aria-label="Setup steps"')
  || !coreSource.includes("location.hash === '#controls'")
  || !coreSource.includes("navigate('/settings/', { replace: true })")
  || !coreSource.includes('role="columnheader"')
  || !coreSource.includes('role="cell"')
  || coreSource.includes('className="operations-profile"')) fail('task_first_core_ui_contract_changed')
if (!coreSource.includes("const requestedSource = searchParams.get('source')")
  || !coreSource.includes("const requestedRequestId = searchParams.get('request')")
  || !coreSource.includes('requestedRequestId={requestedRequestId}')
  || !coreSource.includes("requestedSource !== 'ecommerce-inbox'")
  || !coreSource.includes("setOrderEntryMode('online')")
  || !coreSource.includes('requestedStorefrontRequestIsWaiting')
  || !coreSource.includes('ecommerceInboxTargetRef.current?.focus()')
  || !coreSource.includes("navigate('/shop/?tab=orders', { replace: true })")
  || !ecommerceSource.includes('source=ecommerce-inbox&request=${encodeURIComponent(latestRequest.id)}')) fail('ecommerce_shop_inbox_deeplink_missing')
const actionChangeCssStart = coreCssSource.indexOf('.action-change-flow dd {')
const actionChangeCssEnd = coreCssSource.indexOf('}', actionChangeCssStart)
const actionChangeCssContract = coreCssSource.slice(actionChangeCssStart, actionChangeCssEnd)
if (actionChangeCssStart < 0
  || actionChangeCssEnd < 0
  || !coreSource.includes('<dl className="action-change-flow"><div><dt>Current evidence</dt><dd>{action.before}</dd></div><div><dt>After confirmation</dt><dd>{action.after}</dd></div></dl>')
  || !coreCssSource.includes('.action-change-flow { display: grid; grid-template-columns: repeat(2,minmax(0,1fr));')
  || !coreCssSource.includes('.action-change-flow { grid-template-columns: 1fr; }')
  || !actionChangeCssContract.includes('overflow-wrap: anywhere')
  || !actionChangeCssContract.includes('font-size: 12px')
  || !actionChangeCssContract.includes('line-height: 1.5')) fail('accountable_confirmation_delta_unreadable')
const stockTabletCssStart = coreCssSource.indexOf('@media (max-width: 760px)')
const stockTabletCssEnd = coreCssSource.indexOf('@media (max-width: 560px)', stockTabletCssStart)
const stockTabletCssContract = coreCssSource.slice(stockTabletCssStart, stockTabletCssEnd)
if (stockTabletCssStart < 0
  || stockTabletCssEnd < 0
  || !stockTabletCssContract.includes('.data-table { min-width: 0; }')
  || !stockTabletCssContract.includes('.data-row.table-head { position: absolute;')
  || !stockTabletCssContract.includes('clip-path: inset(50%)')
  || !stockTabletCssContract.includes('.data-row > span:nth-child(5) { grid-column: 3; grid-row: 2; justify-self: end; }')
  || !stockTabletCssContract.includes('.inventory-panel { overflow-x: hidden; }')
  || !stockTabletCssContract.includes('.stock-receipt-editor { grid-template-columns: 1fr; }')) fail('shop_stock_tablet_actions_overflow')
if (!coreSource.includes('id="commerce-manual-order-form"')
  || !coreSource.includes('form="commerce-manual-order-form"')
  || !coreSource.includes('className="order-submit-bar"')
  || !coreSource.includes('className="form-notice order-entry-notice" aria-live="polite"')
  || !coreSource.includes('className="order-essential-fields"')
  || !coreSource.includes('<label>Fulfilment<select')
  || !coreSource.includes('Handoff reference<input')
  || !coreSource.includes('Promised for<input')
  || !coreSource.includes('fulfilmentReference: handoffReference')
  || !coreSource.includes('promisedAt: canonicalPromisedAt')
  || !commerceSource.includes('fulfilmentReference?: string')
  || !commerceSource.includes('promisedAt?: string')
  || !managedCommerceRuntime.includes('"fulfilmentReference"')
  || !managedCommerceRuntime.includes('"promisedAt"')
  || !coreSource.includes('function ClosedOrderHistory')
  || !coreSource.includes('orders={actionOrders}')
  || !coreSource.includes('orders={closedOrders}')
  || !coreSource.includes('onReviewReturn={reviewOrderReturn}')
  || !coreSource.includes('className="production-mode-banner commerce-mode-banner"')
  || !coreSource.includes("managedIdentity ? 'Managed records' : 'Sample data'")
  || !coreSource.includes('const commerceControlsDisabled = !commerceCanWrite || Boolean(pendingAction)')
  || !coreSource.includes('<details className="order-options" id="commerce-order-options" ref={orderOptionsRef}>')
  || !coreSource.includes('const orderPromiseRef = useRef<HTMLInputElement>(null)')
  || !coreSource.includes('const orderOptionsRef = useRef<HTMLDetailsElement>(null)')
  || !coreSource.includes('const orderPaymentRef = useRef<HTMLSelectElement>(null)')
  || !coreSource.includes('function focusNextOrderRequirement()')
  || !coreSource.includes("orderPromiseRef.current?.scrollIntoView({ block: 'center' })")
  || !coreSource.includes('if (orderOptionsRef.current) orderOptionsRef.current.open = true')
  || !coreSource.includes("orderPaymentRef.current?.scrollIntoView({ block: 'center' })")
  || !coreSource.includes('onClick={!preparedEcommerceDraft && (!promisedAt || !payment) ? focusNextOrderRequirement : undefined}')
  || !coreSource.includes("type={!preparedEcommerceDraft && (!promisedAt || !payment) ? 'button' : 'submit'}")
  || !coreSource.includes("<summary><span>Channel and payment</span><small>{channel} · {payment || 'Choose payment'}</small></summary>")
  || !coreSource.includes('<dialog aria-labelledby="order-composer-title" className="order-composer-dialog"')
  || !coreSource.includes('ref={orderComposerTriggerRef}')
  || !coreSource.includes('if (dialog && !dialog.open) dialog.showModal()')
  || !coreSource.includes("if (action.kind === 'order_create' && orderComposerRef.current?.open) orderComposerRef.current.close()")
  || !coreSource.includes('>Enter order</button>')
  || !coreSource.includes('>From message</button>')
  || !coreSource.includes('>Online request</button>')
  || !coreSource.includes('legacyWebsiteWorkWaiting ? <details className="legacy-website-intake"')
  || coreSource.includes("setOrderEntryMode('website')")
  || coreSource.includes("setOrderEntryMode('ecommerce')")
  || !coreCssSource.includes('.order-composer-dialog[open] { display: flex; flex-direction: column; gap: 14px; }')
  || !coreCssSource.includes('.order-entry-methods { flex: 0 0 auto; display: grid; grid-template-columns: repeat(3,minmax(0,1fr));')
  || !coreCssSource.includes('.order-entry-panel { min-width: 0; min-height: 0; flex: 1; overflow: auto; }')
  || coreCssSource.includes('.order-entry-panel[data-mode="manual"][data-notice="false"] { overflow: visible; }')
  || !coreCssSource.includes('.order-essential-fields { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);')
  || !coreCssSource.includes('.order-archive-list { max-height: 360px; overflow: auto;')
  || !coreCssSource.includes('.order-entry-notice { flex: 0 0 auto; margin: 0; }')
  || !coreCssSource.includes('.order-submit-bar .core-button { width: 100%; }')
  || !coreCssSource.includes('.order-list strong, .order-list small { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }')
  || !coreCssSource.includes('.order-options > summary { min-height: 44px;')
  || !coreCssSource.includes('.order-composer-dialog { inset: auto 0 0; width: 100%; max-height: 94svh;')) fail('commerce_order_composer_missing_or_cramped')
if (!channelOrderSource.includes("supermega.channel_order_draft.v1")
  || !channelOrderSource.includes('ready_for_confirmation')
  || !channelOrderSource.includes('operator_supplied')
  || !channelOrderSource.includes('quote_not_found')
  || !channelOrderSource.includes('source_quote_required')
  || !channelOrderSource.includes('channel-message://')
  || ['localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'openai'].some((marker) => channelOrderSource.toLowerCase().includes(marker.toLowerCase()))) fail('channel_order_intake_contract_missing_or_side_effectful')
if (!handoffSource.includes("schema: 'website_ecommerce_handoff.v1'") || !handoffSource.includes("state: 'pending_acceptance'") || !handoffSource.includes('hasExactKeys') || !handoffSource.includes('validateAgainstWorkspace') || !handoffSource.includes('readinessChecks(workspace, fingerprint).every') || !handoffSource.includes('acceptWebsiteEcommerceHandoff')) fail('website_ecommerce_handoff_contract_missing')
const handoffIntakeSource = handoffSource.slice(handoffSource.indexOf('type HandoffIntake'), handoffSource.indexOf('type PendingHandoff'))
if (!handoffIntakeSource.includes('sku: string') || !handoffIntakeSource.includes('quantity: number') || ['customer', 'phone', 'township', 'payment', 'delivery', 'fulfilment'].some((field) => handoffIntakeSource.toLowerCase().includes(field))) fail('website_handoff_contains_pii_shaped_fields')
if (!handoffSource.includes("actorKind: 'human'") || !handoffSource.includes("action: 'accept_website_handoff'") || !handoffSource.includes('audit: [audit]') || !handoffSource.includes("existing.handoff.state === 'accepted'") || !handoffSource.includes('setItem(WEBSITE_ECOMMERCE_HANDOFF_KEY, JSON.stringify(store))')) fail('website_handoff_atomic_audit_missing')
if (!handoffSource.includes("schema: 'ecommerce_order_draft.v1'") || !handoffSource.includes("mode: 'browser-local'") || !handoffSource.includes("schema: 'website_ecommerce_handoff_store.v2'") || !handoffSource.includes('createWebsiteOrderDraft') || !handoffSource.includes('idempotencyKey: current.handoff.id') || !handoffSource.includes("missingFields: ['customer_reference', 'fulfilment_method', 'payment_method']") || !handoffSource.includes('current.draft.idempotencyKey === handoffId') || !handoffSource.includes('if (!current.display) return null')) fail('ecommerce_order_draft_contract_missing')
if (!handoffSource.includes("schema: 'ecommerce_order_record.v1'") || !handoffSource.includes("schema: 'website_ecommerce_handoff_store.v3'") || !handoffSource.includes("state: 'ready_for_confirmation'") || !handoffSource.includes("action: 'complete_website_order'") || !handoffSource.includes('customerReferenceFor(current.handoff.id)') || !handoffSource.includes('websiteEvidenceReference: current.handoff.source.localPublishId') || !handoffSource.includes('completionMatches(current.order, input)') || !handoffSource.includes('globalThis.navigator.locks.request') || !handoffSource.includes('if (!isHandoffStore(store)) return null')) fail('ecommerce_order_completion_contract_missing')
if ([
  'createWebsiteEcommerceHandoff',
  'readWebsiteEcommerceHandoff',
  'writeWebsiteEcommerceHandoff',
  'createCommerceWebsiteIntake',
  'commerce.website_intake.created',
  'saveManagedCommerceCommand',
  "from '../product-handoff'",
  "from '../../core/commerce-workspace'",
  "from '../../core/managed-trial'",
].some((marker) => websiteSource.includes(marker))) fail('website_still_writes_order_intake')
if (!commerceIntakeSource.includes('acceptWebsiteEcommerceHandoff') || !commerceIntakeSource.includes('matches.length === 1') || !commerceIntakeSource.includes('createWebsiteOrderDraft(context.handoff.id') || !commerceIntakeSource.includes('I reviewed this SKU, quantity, and Website evidence.')) fail('commerce_intake_approval_contract_missing')
if (!commerceIntakeSource.includes('await completeWebsiteOrderDraft')
  || !commerceIntakeSource.includes('opaque customer reference generated on completion')
  || !commerceIntakeSource.includes('Create ready order')
  || !commerceIntakeSource.includes('Confirm into orders')
  || !commerceIntakeSource.includes('canonicalFuturePromise')
  || !commerceIntakeSource.includes('Promised for<input')
  || !commerceIntakeSource.includes('disabled?: boolean')
  || !commerceIntakeSource.includes('if (disabled ||')) fail('commerce_order_completion_ui_missing')
if (!coreSource.includes('function queueWebsiteOrder') || !coreSource.includes('sourceRecordId') || !coreSource.includes('item.price !== line.unitPriceMmk') || !coreSource.includes('Website order confirmation failed closed') || !coreSource.includes('Confirm ${record.id} from Website') || !coreSource.includes('promised ${formatTime(canonicalPromisedAt)}')) fail('website_order_not_integrated_with_commerce')
if (!commerceSource.includes("supermega.commerce.workspace.v2")
  || !commerceSource.includes('loadCommerceWorkspace')
  || !commerceSource.includes('mutateCommerceWorkspace')
  || !commerceSource.includes('commerceWorkspaceCanWrite')
  || !commerceSource.includes('commerceOrderNeedsAction')
  || !commerceSource.includes('.write-probe.')
  || !commerceSource.includes('lockManager.request')) fail('commerce_v2_locked_store_missing')
if (!commerceSource.includes("CommercePaymentStatus = 'pending' | 'reconciled'")
  || !commerceSource.includes("CommerceRefundStatus = 'none' | 'due' | 'settled'")
  || !commerceSource.includes('refundSettlementActionId?: string')
  || !commerceSource.includes('refundEvidenceReference?: string')
  || commerceSource.includes("CommerceRefundStatus = 'none' | 'due' | 'settled' | 'unrecorded'")
  || commerceSource.includes("'refund_due'")) fail('commerce_payment_or_refund_contract_invalid')
if (!commerceSource.includes('owner?: string')
  || !commerceSource.includes('order.owner !== proof.actor')
  || !commerceSource.includes('reservation?.actor !== order.owner')
  || !coreSource.includes('owner: confirming operator')
  || !coreSource.includes("'owner not recorded'")
  || !managedCommerceRuntime.includes('"new order.owner"')
  || !managedCommerceRuntime.includes('command evidence actor must be the new order owner')
  || !managedTrialStoreRuntime.includes('authoritative_order["owner"] = principal.actor_id')
  || !managedTrialStoreRuntime.includes('event_type == "commerce.website_intake.converted"')) fail('commerce_order_owner_contract_missing')
if (!commerceSource.includes("CommerceOrderPromiseUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded'")
  || !commerceSource.includes('export function commerceOrderPromiseUrgency')
  || !coreSource.includes('function useMinuteClock()')
  || !coreSource.includes('window.setInterval(() => setNow(Date.now()), 60_000)')
  || !coreSource.includes('window.clearInterval(timer)')
  || !coreSource.includes("promiseUrgency === 'late'")
  || !coreSource.includes('>due soon</span>')
  || !coreSource.includes('>promise missing</span>')) fail('commerce_order_promise_urgency_missing')
if (!commerceSource.includes("CommercePurchaseOrderArrivalUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded' | 'closed'")
  || !commerceSource.includes('export function commercePurchaseOrderArrivalUrgency')
  || !commerceSource.includes('expectedAt - now <= 24 * 60 * 60 * 1000')
  || !coreSource.includes('data-arrival-risk={arrivalUrgency}')
  || !coreSource.includes("' · Late'")
  || !coreSource.includes("' · Due soon'")
  || !coreCssSource.includes('[data-arrival-risk=\"late\"]')
  || !coreCssSource.includes('[data-arrival-risk=\"unrecorded\"]')) fail('commerce_purchase_order_arrival_urgency_missing')
if (!commerceSource.includes('commerceOrderHasReleasableReservation') || !commerceSource.includes("movement.kind === 'reserve'") || !commerceSource.includes("movement.kind === 'release'") || !commerceSource.includes("kind: 'receipt'") || !commerceSource.includes("kind: 'opening'")) fail('commerce_stock_ledger_contract_missing')
if (!commerceSource.includes('export type CommerceOrderLine')
  || !commerceSource.includes('lines?: CommerceOrderLine[]')
  || !commerceSource.includes('one owner-bound reservation action covering every order line')
  || !commerceSource.includes('proofMovements.length === lines.length')
  || !managedCommerceRuntime.includes('one stock reservation per order line')
  || !managedCommerceRuntime.includes("line must freeze the current item name, variant, and MMK price")
  || !commerceSource.includes('encodeURIComponent(proof.actionId)')
  || !managedCommerceRuntime.includes('def _movement_id(')
  || !coreSource.includes('Add item')
  || !coreSource.includes('updateExtraOrderLine')
  || !coreSource.includes('order.lines.length === 1')
  || !coreSource.includes('line.unitPriceMmk.toLocaleString()')) fail('commerce_multi_line_order_contract_missing')
if (!commerceSource.includes('Recovery failed closed') || !commerceSource.includes('currentRaw !== null') || !commerceSource.includes("movements: []")) fail('commerce_migration_fail_closed_contract_missing')
if (!commerceSource.includes('export function settleCommerceRefund')
  || !commerceSource.includes("refundStatus: 'settled' as const")
  || !commerceSource.includes('order.refundSettlementActionId === proof.actionId')
  || !commerceSource.includes('order.paymentReconciliationActionId === actionId || order.refundSettlementActionId === actionId')
  || !commerceSource.includes('...refundSettlementActionIds')) fail('commerce_refund_settlement_contract_missing')
if (!commerceSource.includes('export type CommerceOrderReturn')
  || !commerceSource.includes('completion?: CommerceActionProof')
  || !commerceSource.includes('advancementActionIds?: string[]')
  || !commerceSource.includes('movement.id === `MOV2:${encodeURIComponent(record.actionId)}`')
  || !commerceSource.includes('export function commerceOrderReturnExpectation')
  || !commerceSource.includes('export function recordCommerceOrderReturn')
  || !commerceSource.includes("kind: 'return'")
  || !managedCommerceRuntime.includes('def _validate_return_recorded')
  || !managedCommerceRuntime.includes('"commerce.order.return_recorded"')) fail('commerce_order_return_contract_missing')
if (!managedTrialSource.includes('saveManagedCommerceCommand')
  || !managedTrialSource.includes('expected_version: request.expectedVersion')
  || !managedTrialSource.includes("surface: 'commerce'")
  || !managedTrialSource.includes('payload: { state: request.state, evidence: request.evidence }')
  || !managedTrialSource.includes('assertManagedBootstrapIdentity')
  || !managedTrialSource.includes('sessionForRequest(expectedIdentity)')
  || !managedTrialSource.includes('request.identity')
  || !managedTrialSource.includes("code: 'managed_identity_changed'")) fail('managed_commerce_command_client_missing')
const managedCommerceClientSources = `${coreSource}\n${websiteSource}\n${ecommerceSource}`
for (const eventType of ['commerce.workspace.initialized', 'commerce.item.created', 'commerce.item.updated', 'commerce.order.created', 'commerce.order.advanced', 'commerce.order.cancelled', 'commerce.order.return_recorded', 'commerce.payment.reconciled', 'commerce.refund.settled', 'commerce.stock.counted', 'commerce.purchase_order.created', 'commerce.purchase_order.received', 'commerce.purchase_order.cancelled', 'commerce.close.saved', 'commerce.website_intake.converted', 'commerce.storefront.configuration.saved', 'commerce.storefront_request.received']) {
  if (!managedTrialSource.includes(eventType) || !managedCommerceClientSources.includes(eventType) || !managedCommerceRuntime.includes(eventType)) fail(`managed_commerce_event_missing:${eventType}`)
}
if (!managedTrialSource.includes('commerce.stock.received')
  || !managedCommerceRuntime.includes('commerce.stock.received')
  || managedCommerceClientSources.includes('commerce.stock.received')) fail('legacy_direct_stock_receipt_not_read_only')
if (!managedTrialSource.includes('commerce.website_intake.created')
  || !managedCommerceRuntime.includes('commerce.website_intake.created')
  || managedCommerceClientSources.includes('commerce.website_intake.created')) fail('legacy_website_intake_creation_not_read_only')
if (!coreSource.includes('Record a refund already completed with the external payment provider. This does not send money.')
  || !coreSource.includes("order.refundStatus === 'due' ? <button")
  || !coreSource.includes('onSettleRefund(order.id)')
  || !coreSource.includes('Record settled refund')
  || !coreSource.includes("order.refundStatus === 'settled' && order.refundSettledAt")
  || !coreSource.includes('evidence {order.refundEvidenceReference}')
  || coreSource.includes('this trial does not send or settle refunds.')) fail('commerce_refund_settlement_ui_not_honest')
if (!coreSource.includes("'commerce.refund.settled'")
  || !coreSource.includes('settleCommerceRefund(current, orderId, commerceActionProof(action))')
  || !coreSource.includes("kind: 'refund_settle'")) fail('commerce_refund_settlement_gate_missing')
if (!coreSource.includes("'commerce.order.return_recorded'")
  || !coreSource.includes("kind: 'order_return'")
  || !coreSource.includes('Record return')
  || !coreSource.includes('Sellable · add to stock')
  || !coreSource.includes('payment and order total unchanged')
  || !coreSource.includes('Return unavailable: this older order has no attributable completion proof.')
  || !coreSource.includes('Math.ceil(orders.length / pageSize)')
  || !coreSource.includes('aria-label="Closed order pages"')) fail('commerce_order_return_ui_or_gate_missing')
if (!coreSource.includes("mode: 'managed-unprovisioned'") || !coreSource.includes('No browser demo orders, customers, or stock records are copied') || !coreSource.includes('Create managed catalog') || !coreSource.includes('Opening balance reason') || !coreSource.includes('result.version !== current.version + 1') || !coreSource.includes('validateCommerceState(result.state)') || !coreSource.includes("error.code === 'trial_version_conflict'") || !coreSource.includes('class ShopReviewRequiredError') || !coreSource.includes('error instanceof ShopReviewRequiredError') || !coreSource.includes('const latest = loadCommerceWorkspace()') || !coreSource.includes('latest record is loaded for fresh review') || !coreSource.includes('managedIdentity ? null : <ActionHistory')) fail('managed_commerce_ui_not_fail_closed')
if ((coreSource.match(/const conflict = \{ \.\.\.refreshed, error: '' \}/g) || []).length !== 2) fail('managed_conflict_refresh_remained_write_blocked')
if (!coreSource.includes('confirmation?: AccountableAction') || !coreSource.includes('if (action.confirmation) return action.confirmation') || !coreSource.includes('Retry same confirmation') || !coreSource.includes('result.idempotent_replay') || !coreSource.includes('before the replay could be reconciled')) fail('managed_command_retry_not_frozen_or_reconciled')
if (!managedCommerceRuntime.includes('commerce.workspace.initialized') || managedCommerceRuntime.includes('commerce.snapshot.saved') || !managedCommerceRuntime.includes('_one_changed') || !managedCommerceRuntime.includes('_validate_event_evidence') || !managedCommerceRuntime.includes('daily close totals must match completed, reconciled orders')) fail('managed_commerce_server_transition_contract_missing')
if (!commerceSource.includes('registerCommerceItem') || !coreSource.includes('Add catalog item') || !coreSource.includes('Review catalog item') || !coreSource.includes('The opening balance may be zero.') || !managedCommerceRuntime.includes('one exact attributable opening balance')) fail('commerce_catalog_creation_contract_missing')
if (!commerceSource.includes('export type CommerceCatalogChange')
  || !commerceSource.includes('export type CommerceCatalogBaseline')
  || !commerceSource.includes('commerceCatalogBaselineDigest')
  || !commerceSource.includes('export function updateCommerceItem')
  || !commerceSource.includes('has no anchored baseline')
  || !commerceSource.includes('catalogChanges: [change, ...changes]')
  || !commerceSource.includes('item.price !== change.nextPrice || item.reorderAt !== change.nextReorderAt')
  || !coreSource.includes("kind: 'catalog_item_update'")
  || !coreSource.includes("'commerce.item.updated'")
  || !coreSource.includes('Edit item')
  || !coreSource.includes('Only price and reorder level change')
  || !managedCommerceRuntime.includes('def _validate_item_updated')
  || !managedCommerceRuntime.includes('commerce_catalog_baseline_digest')
  || !managedCommerceRuntime.includes('"commerce.item.updated"')) fail('commerce_catalog_update_contract_missing')
const catalogImportUiContract = sourceBlock(coreSource, '  async function runCatalogImportPreview(', '\n  function openCatalogItemEditor')
if (!catalogImportSource.includes("SHOP_CATALOG_IMPORT_SCHEMA = 'supermega.shop.catalog_import.v1'")
  || !catalogImportSource.includes('SHOP_CATALOG_IMPORT_MAX_BYTES = CLIENT_IMPORT_MAX_BYTES')
  || !catalogImportSource.includes('SHOP_CATALOG_IMPORT_MAX_ROWS = CLIENT_IMPORT_MAX_ROWS')
  || !catalogImportSource.includes("from './client-onboarding.ts'")
  || !catalogImportSource.includes('createClientImportPreview(')
  || !catalogImportSource.includes('sharedPreviewDigest: shared.previewDigest')
  || !catalogImportSource.includes("globalThis.crypto.subtle.digest('SHA-256'")
  || !catalogImportSource.includes("'duplicate_file_sku'")
  || !catalogImportSource.includes("code: 'existing_sku_conflict'")
  || !clientOnboardingSource.includes("code: 'mapping_reused_header'")
  || !catalogImportSource.includes('`${field}_spreadsheet_formula`')
  || !catalogImportSource.includes('sku_not_uppercase')
  || !catalogImportSource.includes("row.status = 'already_exists'")
  || !catalogImportSource.includes('shopCatalogImportErrorsCsv')) fail('shop_catalog_import_contract_missing')
if (['fetch(', 'localStorage', 'sessionStorage', 'supabase', 'openai', 'anthropic'].some((marker) => catalogImportSource.toLowerCase().includes(marker.toLowerCase()))) fail('shop_catalog_import_external_or_persistent_side_effect_added')
if (!catalogImportUiContract.includes("await import('./shop-catalog-import')")
  || !catalogImportUiContract.includes('file.size > SHOP_CATALOG_IMPORT_MAX_BYTES')
  || !catalogImportUiContract.includes('Zero Shop records were written.')
  || !catalogImportUiContract.includes('The selected file was too large and was not read or uploaded.')
  || ['mutateCommerce(', 'registerCommerceItem(', 'saveManagedCommerceCommand(', 'fetch('].some((marker) => catalogImportUiContract.includes(marker))) fail('shop_catalog_import_ui_not_dry_run_only')
if (!coreSource.includes('Import catalog CSV')
  || !coreSource.includes('Dry run · no writes')
  || !coreSource.includes('It is not uploaded, saved to storage, sent to AI, or applied to Shop.')
  || !coreSource.includes('it never silently fixes data.')
  || !coreSource.includes('0 records written')
  || !coreSource.includes('Export errors')
  || !coreCssSource.includes('.catalog-import-table { max-height: 340px;')
  || !coreCssSource.includes('.catalog-import-mapping { display: grid;')
  || !coreCssSource.includes('.catalog-import-row { grid-template-columns: 36px minmax(0,1fr) auto;')) fail('shop_catalog_import_accessible_ui_missing')
if (!clientOnboardingSource.includes("CLIENT_IMPORT_SCHEMA = 'supermega.client_import_preview.v1'")
  || !clientOnboardingSource.includes("CLIENT_STAGING_SCHEMA = 'supermega.client_import_staging.v1'")
  || !clientOnboardingSource.includes('CLIENT_IMPORT_MAX_BYTES = 512 * 1024')
  || !clientOnboardingSource.includes('CLIENT_IMPORT_MAX_ROWS = 500')
  || !clientOnboardingSource.includes("type ClientSolutionId = 'commerce' | 'production' | 'website' | 'ecommerce'")
  || !clientOnboardingSource.includes('workflowTemplateId: string')
  || !clientOnboardingSource.includes('workflowTemplateId: resolvedWorkflowTemplateId')
  || !clientOnboardingSource.includes('workflowTemplateId !== preview.workflowTemplateId')
  || !clientOnboardingSource.includes("'social-commerce':")
  || !clientOnboardingSource.includes("'production-control':")
  || !clientOnboardingSource.includes("'business-presence':")
  || !clientOnboardingSource.includes("'social-storefront':")
  || !clientOnboardingSource.includes('globalThis.crypto.subtle.digest')
  || !clientOnboardingSource.includes("activationStatus: 'staged_not_applied'")
  || !clientOnboardingSource.includes('humanReviewRequired: true')
  || !clientOnboardingSource.includes('externalWritesPerformed: false')) fail('four_product_client_import_contract_missing')
if (['fetch(', 'localStorage', 'sessionStorage', 'supabase', 'openai', 'anthropic'].some((marker) => clientOnboardingSource.toLowerCase().includes(marker.toLowerCase()))) fail('client_import_external_or_persistent_side_effect_added')
if (!coreSource.includes("lazy(() => import('./ClientDataOnboarding')")
  || !coreSource.includes("setup.product === 'website'")
  || !coreSource.includes("setup.product === 'ecommerce'")
  || !coreSource.includes('workflowTemplateId={selectedTemplate.id}')
  || !clientOnboardingUiSource.includes('Map, check, then stage')
  || !clientOnboardingUiSource.includes('ambiguous columns stop for review')
  || !clientOnboardingUiSource.includes('It is not uploaded, sent to AI, or applied to a product.')
  || !clientOnboardingUiSource.includes('Download staged package')
  || !clientOnboardingUiSource.includes('It performs zero product writes.')
  || !clientOnboardingUiSource.includes('productRef.current !== expectedProduct')
  || !clientOnboardingUiSource.includes('workflowTemplateRef.current !== expectedWorkflowTemplateId')
  || !clientOnboardingUiSource.includes('[product, workflowTemplateId]')
  || !clientOnboardingUiSource.includes('clientImportTemplate(product, workflowTemplateId)')
  || ['fetch(', 'localStorage', 'sessionStorage', 'supabase'].some((marker) => clientOnboardingUiSource.includes(marker))) fail('four_product_client_onboarding_ui_missing_or_unsafe')
const cronTokenRotationContract = sourceBlock(schedulerSource, '$cronTokenChanged = ', '\n\nInvoke-Gcloud -CommandArgs @(')
if (!schedulerSource.includes('[ValidateSet("unchanged", "demand-driven-canary", "polling")]')
  || !schedulerSource.includes('supermega.agent_worker_canary.v1')
  || !schedulerSource.includes('$evidence.task_dispatch_source -ne "cloud-tasks"')
  || !schedulerSource.includes('$evidence.polling_job_paused_during_probe -ne $true')
  || !schedulerSource.includes('$latencySeconds -gt 300')
  || !schedulerSource.includes('$evidenceAge.TotalHours -gt 24')
  || !schedulerSource.includes('"scheduler", "jobs", "pause", "supermega-agent-worker"')
  || !schedulerSource.includes('"scheduler", "jobs", "resume", "supermega-agent-worker"')
  || !schedulerSource.includes('nominal_scheduler_calls_per_day = if ($workerSchedulerState -eq "PAUSED") { 109 } else { 397 }')
  || !schedulerSource.includes('worker_poll_calls_per_day = if ($workerSchedulerState -eq "PAUSED") { 0 } else { 288 }')
  || !schedulerSource.includes('polling_rollback = "Run this script with -WorkerDispatchMode polling."')) fail('demand_driven_worker_canary_contract_missing')
if (!cronTokenRotationContract.includes('if ($cronTokenChanged)')
  || !cronTokenRotationContract.includes('Ensure-SecretVersion -Name "supermega-internal-cron-token" -Value $cronToken')
  || (schedulerSource.match(/Ensure-SecretVersion -Name "supermega-internal-cron-token" -Value \$cronToken/g) || []).length !== 1) fail('scheduler_cron_token_rotation_not_bounded')
if (!commerceSource.includes('commerceWebsiteIntakeSnapshotDigest')
  || !commerceSource.includes('snapshotDigest: commerceWebsiteIntakeSnapshotDigest(snapshot)')
  || !commerceSource.includes('if (!intake.snapshotDigest) return null')
  || !managedCommerceRuntime.includes('commerce_website_intake_snapshot_digest')
  || !managedCommerceRuntime.includes('legacy Website intakes without a snapshot digest cannot be converted')) fail('commerce_website_snapshot_binding_missing')
if (!commerceSource.includes("export type CommerceStockMovementKind = 'opening' | 'reserve' | 'release' | 'receipt' | 'count'")
  || !commerceSource.includes('export function countCommerceStock')
  || !commerceSource.includes('expectedQuantity: item.onHand')
  || !commerceSource.includes('countedQuantity')
  || !commerceSource.includes('const oldestCountIndex')
  || !managedCommerceRuntime.includes('def _validate_counted(')
  || !managedCommerceRuntime.includes('expectedQuantity')
  || !managedCommerceRuntime.includes('countedQuantity')) fail('commerce_stock_count_contract_missing')
const commerceTabsContract = coreSource.slice(coreSource.indexOf('const commerceTabs'), coreSource.indexOf('const productionTabs'))
if (commerceTabsContract.includes("{ id: 'today', label: 'Today' }") || !commerceTabsContract.includes("{ id: 'orders', label: 'Orders' }") || !commerceTabsContract.includes("{ id: 'inventory', label: 'Stock' }") || (commerceTabsContract.match(/^\s*\{ id:/gm) || []).length !== 2) fail('commerce_two_tab_contract_changed')
const commercePageContract = coreSource.slice(coreSource.indexOf('function CommercePage'), coreSource.indexOf('function OrderList'))
if (!commercePageContract.includes('purchaseOrderDraft')
  || !commercePageContract.includes('Create an internal order')
  || !commercePageContract.includes('This does not contact a supplier or create a payment.')
  || !commercePageContract.includes('Expected arrival')
  || !commercePageContract.includes('Arrival not recorded · legacy order')
  || !commercePageContract.includes('.sort(compareCommercePurchaseOrderAttention)')
  || !commercePageContract.includes('defaultPurchaseOrderExpectedInput()')
  || !commercePageContract.includes('commercePurchaseOrderProgress(current, currentPurchaseOrder).remaining !== expectedRemaining')
  || !commercePageContract.includes("'commerce.purchase_order.created'")
  || !commercePageContract.includes("'commerce.purchase_order.received'")
  || !commercePageContract.includes("'commerce.purchase_order.cancelled'")
  || !commercePageContract.includes('createCommercePurchaseOrder(')
  || !commercePageContract.includes('receiveCommercePurchaseOrder(')
  || !commercePageContract.includes('cancelCommercePurchaseOrder(')
  || !commercePageContract.includes('Order stock')
  || !commercePageContract.includes('Your draft was preserved.')
  || !commercePageContract.includes('purchaseOrderEditorRef')
  || !commercePageContract.includes('Review receipt')
  || !commercePageContract.includes('Cancel remainder')
  || !commercePageContract.includes('id="purchase-orders"')
  || !commercePageContract.includes("commerceLocation.hash !== '#purchase-orders'")
  || !commercePageContract.includes('if (history) history.open = true')
  || !commercePageContract.includes("history?.scrollIntoView({ block: 'center' })")
  || !commercePageContract.includes("history?.querySelector('summary')?.focus({ preventScroll: true })")
  || !commercePageContract.includes('ref={purchaseOrderHistoryRef}')
  || !commercePageContract.includes('aria-label={`Cancel remainder for ${purchaseOrder.id}`}')
  || commercePageContract.includes('purchaseOrderRows.slice(')
  || commercePageContract.includes("'commerce.stock.received'")
  || commercePageContract.includes('Receive +10')
  || !coreCssSource.includes('.stock-receipt-editor')
  || !coreCssSource.includes('.stock-receipt-preview')
  || !coreCssSource.includes('.purchase-order-list')
  || !coreCssSource.includes('.data-row .text-link, .purchase-order-list .text-link { min-height: 44px; }')
  || !coreCssSource.includes('.core-button:disabled, .text-link:disabled')
  || coreCssSource.includes('.data-row.table-head { display: none; }')
  || !coreCssSource.includes('.purchase-order-editor[data-mode="create"] { grid-template-columns: repeat(2,minmax(0,1fr)); }')) fail('commerce_purchase_order_ui_missing')
const commerceOrdersContract = commercePageContract.slice(commercePageContract.indexOf("if (tab === 'orders')"), commercePageContract.indexOf("if (tab === 'inventory')"))
if (!commerceOrdersContract.includes('order-daily-controls') || !commerceOrdersContract.includes('Save daily close') || !commerceOrdersContract.includes('Close and exceptions')) fail('commerce_daily_controls_not_inside_orders')
const commerceInventoryContract = commercePageContract.slice(commercePageContract.indexOf("if (tab === 'inventory')"))
const commerceStockTableHeadContract = commerceInventoryContract.slice(commerceInventoryContract.indexOf('data-row table-head'), commerceInventoryContract.indexOf('{stockRows.map', commerceInventoryContract.indexOf('data-row table-head')))
const openPurchaseOrderContract = commercePageContract.slice(commercePageContract.indexOf('function openPurchaseOrder'), commercePageContract.indexOf('function cancelPurchaseOrderEditor'))
const openStockCountContract = commercePageContract.slice(commercePageContract.indexOf('function openStockCount'), commercePageContract.indexOf('function cancelStockCount'))
if (!commercePageContract.includes('const stockRows = commerce.items')
  || !commercePageContract.includes('leftNeedsAttention !== rightNeedsAttention')
  || !commercePageContract.includes('return rightShortage - leftShortage || left.index - right.index')
  || !commerceInventoryContract.includes('{stockRows.map(({ item }) => {')
  || !commerceInventoryContract.includes("data-stock-attention={stockNeedsAttention ? 'true' : 'false'}")
  || !commerceInventoryContract.includes("'At reorder level'")
  || !commerceInventoryContract.includes('below reorder')
  || !commerceInventoryContract.includes("stockNeedsAttention ? 'Reorder' : 'Order'")
  || !coreCssSource.includes('.data-row[data-stock-attention="true"]')
  || !coreCssSource.includes('.data-row .stock-attention-label')) fail('commerce_stock_attention_not_prioritized')
if ((commerceInventoryContract.match(/'Count stock'/g) || []).length !== 1
  || !commerceInventoryContract.includes('aria-controls="stock-count-editor"')
  || !commerceInventoryContract.includes('aria-expanded={Boolean(stockCountDraft)}')
  || !commerceInventoryContract.includes('id="stock-count-editor"')
  || !commerceInventoryContract.includes('aria-labelledby="stock-count-title"')
  || !commerceInventoryContract.includes('aria-describedby="stock-count-help stock-count-preview"')
  || !commerceInventoryContract.includes('Counted available units')
  || !commerceInventoryContract.includes('min="0"')
  || !commerceInventoryContract.includes('max={Number.MAX_SAFE_INTEGER}')
  || !commerceInventoryContract.includes('Review count')
  || !commercePageContract.includes("kind: 'inventory_count'")
  || !commercePageContract.includes("'commerce.stock.counted'")
  || !commercePageContract.includes('currentItems[0].onHand !== expectedOnHand')
  || !commercePageContract.includes('Stock changed while you were reviewing. Nothing was applied.')
  || !commercePageContract.includes("setStockCountDraft({ sku: item.sku, quantity: '' })")
  || (commerceStockTableHeadContract.match(/role="columnheader"/g) || []).length !== 5
  || !coreCssSource.includes('content: "Available";')
  || !coreCssSource.includes('.stock-receipt-editor { grid-template-columns: 1fr; }')) fail('commerce_stock_count_ui_missing_or_unsafe')
if (!openPurchaseOrderContract.includes('Your count draft was preserved.')
  || openPurchaseOrderContract.includes('setStockCountDraft(null)')
  || !openStockCountContract.includes('Your stock-order draft was preserved.')
  || openStockCountContract.includes('setPurchaseOrderDraft(null)')) fail('commerce_stock_editor_switch_discards_draft')
if (!productionSource.includes("supermega.production.workspace.v2") || !productionSource.includes('mutateProductionWorkspace') || !productionSource.includes('productionWorkspaceCanWrite') || !productionSource.includes('.write-probe.') || !productionSource.includes('lockManager.request') || !productionSource.includes('next.revision !== current.revision + 1')) fail('production_v2_locked_store_missing')
if (!productionSource.includes("'job_created' | 'job_schedule_updated' | 'job_closed' | 'output_recorded' | 'material_consumed' | 'issue_opened' | 'issue_resolved' | 'quality_hold_placed' | 'quality_hold_released' | 'machine_state_changed'") || !productionSource.includes('events: [event, ...state.events]') || !productionSource.includes('Production revision must equal the append-only event count.')) fail('production_append_only_record_missing')
if (!productionSource.includes('productionShiftOutput')
  || !productionSource.includes('existing.shiftRef === shiftRef')
  || !productionSource.includes('shiftRef?: string')
  || !managedProductionRuntime.includes('new output events require one canonical shift reference.')) fail('production_shift_output_contract_missing')
if (!productionSource.includes('recordProductionScrap')
  || !productionSource.includes("outputKind?: ProductionOutputKind")
  || !productionSource.includes("existing.outputKind === 'scrap'")
  || !productionSource.includes('job.output + nextScrap > job.target')
  || !managedProductionRuntime.includes('event.get("outputKind", "good")')
  || !managedProductionRuntime.includes('good plus scrap cannot exceed its target')
  || !coreSource.includes('Record good or scrap')
  || !coreSource.includes('<option value="scrap">Scrap</option>')
  || !coreSource.includes("recordProductionScrap(current")) fail('production_scrap_contract_missing')
if (!productionSource.includes('recordProductionMaterialConsumption')
  || !productionSource.includes('parseProductionMaterialQuantity')
  || !productionSource.includes("kind: 'material_consumed'")
  || !productionSource.includes('material event fields are invalid')
  || !productionSource.includes('Material use timestamp for ${String(event.subjectId)} predates job creation')
  || !managedProductionRuntime.includes('_validate_material_consumed')
  || !managedProductionRuntime.includes('material use can only be recorded for an active job')
  || !managedProductionRuntime.includes('production.material.consumed')
  || !managedTrialSource.includes("'production.material.consumed'")
  || !coreSource.includes('Review material use')
  || !coreSource.includes('Material reference')
  || !coreSource.includes('Lot or batch (optional)')
  || !coreSource.includes('materialJobIsStale')
  || !coreSource.includes('parseProductionMaterialQuantity(materialDraft.quantity)')
  || !coreSource.includes('plant-material-quantity-error')
  || !coreSource.includes('can be stored exactly (maximum 9,007,199,254,740.99)')
  || !coreSource.includes('{materialDraft.jobId} · no longer active')
  || !coreSource.includes('with up to three decimal places')
  || !productionSource.includes('materialTotals')
  || !coreSource.includes('It does not adjust raw-material inventory, purchasing, costing, accounting, or equipment.')
  || !coreSource.includes('No material use is attributed to this shift reference.')) fail('production_material_use_contract_missing')
if (!productionSource.includes("export type ProductionIssueSeverity = 'critical' | 'high' | 'medium' | 'low'")
  || !productionSource.includes("const actionFields = ['severity', 'owner', 'dueAt', 'containment']")
  || !productionSource.includes('action fields must be complete or absent for legacy records')
  || !productionSource.includes('issueContainment?: string')
  || !productionSource.includes('action fields do not match their immutable opening event')
  || !productionSource.includes('resolution proof does not match its immutable event')
  || !managedProductionRuntime.includes('_ISSUE_ACTION_FIELDS.issubset(issue)')
  || !managedProductionRuntime.includes('new Production issue action fields must match the opening event.')
  || !managedProductionRuntime.includes('a new Production issue requires severity, owner, dueAt, and containment.')
  || !coreSource.includes('Containment / next action')
  || !coreSource.includes('Review close')
  || !coreSource.includes('Legacy problem · owner, due time, and containment were not recorded')) fail('production_actionable_issue_contract_missing')
if (!productionSource.includes('placeProductionQualityHold')
  || !productionSource.includes('releaseProductionQualityHold')
  || !productionSource.includes('hold timestamps for ${jobId} contradict lifecycle order')
  || !productionSource.includes('quality hold event fields are invalid')
  || !managedProductionRuntime.includes('_validate_quality_hold_placed')
  || !managedProductionRuntime.includes('_validate_quality_hold_released')
  || !managedProductionRuntime.includes('quality hold timestamps contradict lifecycle order')
  || !coreSource.includes('Quality holds')
  || !coreSource.includes('Review hold')
  || !coreSource.includes('Review release')
  || !coreSource.includes('Recording a result does not release this hold')
  || !coreSource.includes("job.qualityHold ? ' · QUALITY HOLD' : ''")) fail('production_quality_hold_contract_missing')
if (!productionSource.includes('buildProductionShiftHandoff')
  || !productionSource.includes('formatProductionShiftHandoff')
  || !productionSource.includes('productionStateCanonical')
  || !productionSource.includes('shiftEntries')
  || !productionSource.includes('activeHolds')
  || !productionSource.includes('materialEntries')
  || !productionSource.includes('shortCloses')
  || !productionSource.includes('activeMaintenance')
  || !productionSource.includes('Priority problem ${issue.id} has no immutable opening evidence.')
  || !productionSource.includes('no attributed observation recorded')
  || productionSource.includes("'completed output'")
  || productionSource.includes('left.id.localeCompare(right.id)')
  || !coreSource.includes('Shift handoff')
  || !coreSource.includes('Build handoff')
  || !coreSource.includes('Copy handoff')
  || !coreSource.includes('shiftHandoff.sourceCanonical === currentProductionCanonical')
  || !coreSource.includes('shiftHandoff.shiftRef === handoffShiftRef.trim()')
  || !coreSource.includes('Active quality holds')
  || !coreSource.includes('Active maintenance')
  || !coreSource.includes('material entries')
  || !coreSource.includes('Shift entries')
  || !coreSource.includes('No job was closed short in this shift.')
  || !coreSource.includes('Reason: {machine.observation.reason}')
  || coreSource.includes("'Completed output'")
  || !coreSource.includes('It creates no event, message, or saved copy.')
  || !coreSource.includes('Plant records or the shift reference changed after this handoff was built.')
  || !coreSource.includes('No Plant record changed.')) fail('production_shift_handoff_contract_missing')
if (!productionSource.includes('registerProductionJob') || !coreSource.includes('production.job.created') || !coreSource.includes('<summary>Add job</summary>') || !coreSource.includes('Review job')) fail('production_recurring_job_workflow_missing')
if (!productionSource.includes('updateProductionJobPlan')
  || !productionSource.includes("kind: 'job_schedule_updated'")
  || !productionSource.includes('jobOwner: owner')
  || !productionSource.includes('fromJobOwner')
  || !coreSource.includes('production.job.schedule_updated')
  || !coreSource.includes('Change plan')
  || !coreSource.includes('Review plan')
  || !coreSource.includes('Responsible owner')
  || !coreSource.includes('Change the owner, priority, or due time before review.')
  || !coreSource.includes('It grants no access, assigns no machine, and dispatches no work.')
  || !coreSource.includes("'Legacy unscheduled'")
  || !coreSource.includes('event.fromJobPriority')
  || !coreSource.includes('event.fromJobOwner')
  || !managedTrialSource.includes("'production.job.schedule_updated'")
  || !managedProductionRuntime.includes('_validate_job_schedule_updated')
  || !managedProductionRuntime.includes('job plan may change only the exact owner, priority, and due time.')) fail('production_job_plan_update_contract_missing')
if (!productionSource.includes('closeProductionJob')
  || !productionSource.includes("kind: 'job_closed'")
  || !productionSource.includes('remainingQuantity')
  || !productionSource.includes('has scheduling, output, material use, or a new quality hold after closure')
  || !productionSource.includes('activity appended after closure predates the close timestamp')
  || !managedProductionRuntime.includes('_validate_job_closed')
  || !managedProductionRuntime.includes('production.job.closed')
  || !managedProductionRuntime.includes('only an unfinished open job can close short')
  || !managedTrialSource.includes("'production.job.closed'")
  || !coreSource.includes('Review short close')
  || !coreSource.includes("kind: 'production_job_close'")
  || !coreSource.includes('target and output unchanged')
  || !coreSource.includes('quality hold remains')
  || !coreSource.includes('Short close ends the selected job')) fail('production_short_close_contract_missing')
if (!productionSource.includes('currentRaw !== null') || !productionSource.includes('Migration failed closed') || !productionSource.includes('events: []')) fail('production_migration_fail_closed_contract_missing')
if (!productionSource.includes('recordProductionMachineState')
  || !productionSource.includes('expectedState === toState')
  || !productionSource.includes('contains a state gap')
  || productionSource.includes('productionMachineTransitions')
  || !managedProductionRuntime.includes('observed_state = event["toState"]')
  || managedProductionRuntime.includes('_MACHINE_TRANSITIONS')
  || !coreSource.includes('Review observation')
  || !coreSource.includes('<b>Record status</b>')
  || !coreSource.includes('machineObservationTargets')
  || coreSource.includes('cycleMachine')) fail('production_truthful_machine_observation_missing')
if (!productionSource.includes('startProductionDowntime')
  || !productionSource.includes('endProductionDowntime')
  || !productionSource.includes('productionDowntimeIntervals')
  || !productionSource.includes('downtimeStartActionId')
  || !productionSource.includes('validDowntimeTimestamp')
  || !productionSource.includes('Downtime timestamps for ${machine.id} contradict lifecycle order.')
  || !managedProductionRuntime.includes('_validate_downtime_history')
  || !managedProductionRuntime.includes('_validate_downtime_started')
  || !managedProductionRuntime.includes('_validate_downtime_ended')
  || !managedProductionRuntime.includes('production.downtime.started')
  || !managedProductionRuntime.includes('production.downtime.ended')
  || !coreSource.includes('Machine downtime')
  || !coreSource.includes('Review start')
  || !coreSource.includes('Review end')
  || !coreSource.includes('This human record is separate from machine status. It sends no equipment command and changes no job or output.')) fail('production_bounded_downtime_contract_missing')
if (!productionSource.includes('startProductionMaintenance')
  || !productionSource.includes('completeProductionMaintenance')
  || !productionSource.includes('productionMaintenanceRecords')
  || !productionSource.includes('maintenanceOwner')
  || !productionSource.includes('maintenanceStartActionId')
  || (productionSource.match(/const next = structuredClone\(state\)/g) || []).length < 2
  || !productionSource.includes('Maintenance timestamps for ${machine.id} contradict lifecycle order.')
  || !managedProductionRuntime.includes('_validate_maintenance_history')
  || !managedProductionRuntime.includes('_validate_maintenance_started')
  || !managedProductionRuntime.includes('_validate_maintenance_completed')
  || !managedProductionRuntime.includes('production.maintenance.started')
  || !managedProductionRuntime.includes('production.maintenance.completed')
  || !coreSource.includes('Machine maintenance')
  || !coreSource.includes('Review complete')
  || !coreSource.includes('The accountable review records work scope or completion outcome. It does not control equipment, change machine status, open downtime, buy parts, or change jobs.')) fail('production_bounded_maintenance_contract_missing')
const managedProductionCommandContract = managedTrialSource.slice(managedTrialSource.indexOf('export async function saveManagedProductionCommand'), managedTrialSource.indexOf('export async function saveManagedWebsiteCommand'))
if (!managedProductionCommandContract.includes("surface: 'production'")
  || !managedProductionCommandContract.includes('eventType: ManagedProductionEvent')
  || !managedProductionCommandContract.includes('payload: { state: request.state, evidence: request.evidence }')
  || !managedProductionCommandContract.includes('request.identity')
  || !coreSource.includes('identity: managedIdentity')) fail('managed_production_command_client_missing')
for (const eventType of ['production.workspace.initialized', 'production.job.created', 'production.job.schedule_updated', 'production.job.closed', 'production.output.recorded', 'production.material.consumed', 'production.issue.opened', 'production.issue.resolved', 'production.quality_hold.placed', 'production.quality_hold.released', 'production.machine_state.changed', 'production.downtime.started', 'production.downtime.ended', 'production.maintenance.started', 'production.maintenance.completed']) {
  if (!coreSource.includes(eventType) || !managedProductionRuntime.includes(eventType)) fail(`managed_production_event_missing:${eventType}`)
}
if (managedProductionRuntime.includes('production.snapshot.saved')
  || !managedProductionRuntime.includes('PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS')
  || !managedProductionRuntime.includes('_validate_job_created')
  || !managedProductionRuntime.includes('_validate_job_schedule_updated')
  || !managedProductionRuntime.includes('_validate_job_closed')
  || !managedProductionRuntime.includes('_validate_output_recorded')
  || !managedProductionRuntime.includes('_validate_material_consumed')
  || !managedProductionRuntime.includes('_validate_issue_resolved')
  || !managedProductionRuntime.includes('_validate_quality_hold_placed')
  || !managedProductionRuntime.includes('_validate_quality_hold_released')
  || !managedProductionRuntime.includes('_validate_machine_state_changed')
  || !managedProductionRuntime.includes('_validate_downtime_started')
  || !managedProductionRuntime.includes('_validate_downtime_ended')
  || !managedProductionRuntime.includes('_validate_maintenance_started')
  || !managedProductionRuntime.includes('_validate_maintenance_completed')
  || !managedProductionRuntime.includes('Production event must prepend exactly one record and preserve history.')) fail('managed_production_server_transition_contract_missing')
if (!coreSource.includes("mode: 'managed-unprovisioned'")
  || !coreSource.includes('No browser demo jobs, issues, equipment, or output are copied')
  || !coreSource.includes('Create managed plan')
  || !coreSource.includes("result.surface !== 'production'")
  || !coreSource.includes('validateProductionState(result.state)')
  || !coreSource.includes("error.code === 'trial_version_conflict'")
  || !coreSource.includes('class PlantReviewRequiredError')
  || !coreSource.includes('error instanceof PlantReviewRequiredError')
  || !coreSource.includes('managedIdentity ? `${record.id} confirmed by the managed Plant API.')) fail('managed_production_ui_not_fail_closed')
const productionTabsContract = coreSource.slice(coreSource.indexOf('const productionTabs'), coreSource.indexOf('function uid'))
if (productionTabsContract.includes("{ id: 'today', label: 'Today' }") || !productionTabsContract.includes("{ id: 'production', label: 'Jobs' }") || !productionTabsContract.includes("{ id: 'control', label: 'Problems' }") || (productionTabsContract.match(/^\s*\{ id:/gm) || []).length !== 2) fail('production_two_tab_contract_changed')
const productionPageContract = coreSource.slice(coreSource.indexOf('function ProductionPage'), coreSource.indexOf('function JobList'))
const productionJobsContract = productionPageContract.slice(productionPageContract.indexOf("if (tab === 'production')"), productionPageContract.indexOf("if (tab === 'control')"))
const productionControlContract = productionPageContract.slice(productionPageContract.indexOf("if (tab === 'control')"))
const productionProblemsPosition = productionControlContract.indexOf('<h2>Open problems</h2>')
const productionEquipmentPosition = productionControlContract.indexOf('<h2>Recorded status</h2>')
if (productionProblemsPosition < 0
  || productionEquipmentPosition < 0
  || productionProblemsPosition > productionEquipmentPosition
  || !productionControlContract.includes('>Record problem</button>')
  || productionControlContract.includes('>Open problem form</button>')) fail('production_problems_not_task_first')
if (!productionJobsContract.includes('This shift:')
  || !productionJobsContract.includes('Shift reference')
  || !coreSource.includes("new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' })")
  || !coreSource.includes('placeholder={shiftReferencePlaceholder()}')
  || coreSource.includes('placeholder="2026-07-24 Day"')
  || !coreSource.includes("Unassigned (legacy)")) fail('production_shift_output_ui_missing')
if (!productionJobsContract.includes('Jobs to finish')
  || !productionJobsContract.includes('<JobList disabled={!productionCanWrite || Boolean(pendingAction)} jobs={activeJobs} now={issueClock} onOutput={openJobOutput} onSchedule={openJobSchedule} />')
  || !productionJobsContract.includes('<CompletedJobHistory jobs={completedJobs} now={issueClock} />')
  || !productionJobsContract.includes('Owner, priority, and due time make responsibility and run order visible.')
  || !productionJobsContract.includes('Results are append-only.')
  || !productionJobsContract.includes('{job.id} · {job.product} · {job.line}')
  || !coreSource.includes('No active jobs. Add a job below to start recording output.')) fail('production_jobs_not_task_first')
if (!productionPageContract.includes('const outputJobSelectRef = useRef<HTMLSelectElement>(null)')
  || !productionPageContract.includes('function openJobOutput(job: ProductionJob)')
  || !productionPageContract.includes('outputJobSelectRef.current?.scrollIntoView({ block: \'center\' })')
  || !productionPageContract.includes('outputJobSelectRef.current?.focus({ preventScroll: true })')
  || !productionJobsContract.includes('id="plant-output-form"')
  || !productionJobsContract.includes('ref={outputJobSelectRef}')
  || !coreSource.includes('aria-controls="plant-output-form"')
  || !coreSource.includes('className="text-link job-output-link"')
  || !coreSource.includes('>Record output</button>')
  || !coreCssSource.includes('.job-list .job-row-actions')
  || !coreCssSource.includes('.job-list .job-row-actions .job-output-link')) fail('production_job_output_shortcut_missing')
if (coreCssSource.includes('.production-view > .output-panel { grid-row: 1; }')
  || coreCssSource.includes('.production-view > .job-panel { grid-row: 2; }')) fail('production_mobile_job_context_order_regressed')
if (coreSource.includes('Math.min(quantity')
  || !productionPageContract.includes('Nothing was recorded.')
  || !productionPageContract.includes('const [quantity, setQuantity] = useState(1)')
  || !productionPageContract.includes('Number.isSafeInteger(quantity)')
  || !productionPageContract.includes('max={selectedRemaining}')
  || !productionJobsContract.includes('quantity > selectedRemaining')) fail('production_output_limit_missing_or_silently_clamped')
if (!productionPageContract.includes('persisted with attributed Plant evidence.') || productionPageContract.includes('<ActionHistory actions={actions} domain="production"')) fail('production_confirmation_record_not_domain_specific')
if (!coreSource.includes("addEventListener('storage', refreshFromStorage)") || !coreSource.includes("removeEventListener('storage', refreshFromStorage)")) fail('production_cross_tab_refresh_missing')
if (!coreSource.includes('headingRef.current?.focus()') || !coreSource.includes('returnFocus?.isConnected') || !coreSource.includes('previousFocus.focus()') || !coreSource.includes('aria-live="polite"') || !coreSource.includes('currently ${productionMachineStateLabels[machine.state]}') || !coreSource.includes('requestAnimationFrame(() => machineTriggerRef.current?.focus())')) fail('production_confirmation_accessibility_missing')
if (!productionPageContract.includes('className="production-mode-banner"')
  || !productionPageContract.includes('data-write={productionCanWrite')
  || !productionPageContract.includes('if (!productionCanWrite)')
  || !productionPageContract.includes('Local sample')
  || !productionPageContract.includes('they do not control equipment')
  || !productionPageContract.includes('Records operator observations only.')
  || !productionPageContract.includes('disabled={!productionCanWrite')
  || !productionPageContract.includes('<IssueList disabled={!productionCanWrite')
  || !productionPageContract.includes('<ResolvedIssueHistory issues={resolvedIssues} now={issueClock} />')
  || !productionPageContract.includes('className="production-issue-dialog"')
  || !productionPageContract.includes("dialog.querySelector('textarea')?.focus()")
  || !productionPageContract.includes('}, [issueDialogOpen, tab])')
  || coreSource.includes("attention: 'Stop machine'")
  || coreSource.includes("stopped: 'Return to service'")) fail('production_write_boundary_or_status_language_missing')
if (!coreCssSource.includes('.production-mode-banner[data-write="blocked"]')
  || !coreCssSource.includes('.production-history > .job-list, .production-history > .issue-list { max-height: 230px;')
  || !coreCssSource.includes('-webkit-line-clamp: 2')) fail('production_bounded_history_or_issue_readability_missing')
if (!coreCssSource.includes('.action-history summary { min-height: 44px; }')) fail('production_mobile_history_touch_target_missing')
if (!coreSource.includes("const requestedTabIsCanonical = requestedTab === activeTab") || !coreSource.includes("!requestedTabIsCanonical") || !coreSource.includes(" : 'orders'") || !coreSource.includes(" : 'production'")) fail('legacy_product_tab_not_canonicalized')
if (coreSource.includes('>All apps</Link>')
  || !coreSource.includes('className="text-link all-apps-link" to="/operations/">Products</Link>')
  || !coreCssSource.includes('.operations-screen .heading-actions .text-link { display: none; }')
  || !coreCssSource.includes('.order-row-actions .text-link { min-width: 44px; justify-content: center; }')
  || !coreCssSource.includes('.boundary-list a { min-height: 44px;')) fail('product_mobile_simplification_missing')
let workflowProfiles = 0
const solutionProducts = manifest.customerProducts || []
if (solutionProducts.map((product) => `${product.id}:${product.runtimeId}`).join(',') !== 'shop:commerce,plant:production,website:website,ecommerce:ecommerce') fail('canonical_four_product_order_missing')
for (const product of solutionProducts) {
  if (product.templates?.length !== 3) fail(`wrong_template_count:${product.id}`)
  for (const template of product.templates || []) {
    workflowProfiles += 1
    if (!template.outcome?.trim() || !template.metric?.trim() || template.workflow?.length < 5 || template.entryPoints?.length < 3) fail(`incomplete_workflow_profile:${template.id}`)
    for (const token of [template.name, template.metric, ...template.workflow, ...template.entryPoints]) {
      if (!corpus.includes(token)) fail(`workflow_profile_not_bundled:${template.id}:${token}`)
    }
  }
}
for (const route of ['/shop/', '/plant/', '/website/', '/ecommerce/']) {
  if (!corpus.includes(route)) fail(`missing_canonical_module_route:${route}`)
}
for (const route of ['/operations/commerce/', '/operations/production/']) {
  if (!`${appSource}\n${coreSource}`.includes(route)) fail(`missing_runtime_compatibility_route:${route}`)
}
for (const forbidden of ['pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a', 'Company Systems That Replace Tool Sprawl', 'Workspace draft', 'Service bookings', 'Material receiving']) {
  if (corpus.toLowerCase().includes(forbidden.toLowerCase())) fail(`retired_context:${forbidden}`)
}
for (const marker of ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']) {
  if (corpus.includes(marker)) fail('app_copy_encoding_corrupt')
}

async function verifyChannelOrderRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    channelOrderRuntimeChecks += 1
  }
  try {
    const nonce = Date.now()
    const [intake, commerce] = await Promise.all([
      import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'channel-order-intake.ts')).href}?channel-order-verify=${nonce}`),
      import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href}?channel-order-verify=${nonce}`),
    ])
    const fixtures = [
      {
        id: 'english',
        sourceLabel: 'MSG-EN-001',
        message: 'May wants SM-1001, 2 baskets, pay with KBZPay on Messenger.',
        channel: 'Messenger',
        customer: 'May',
        sku: 'SM-1001',
        quantity: 2,
        payment: 'KBZPay',
        quotes: { customer: 'May', sku: 'SM-1001', quantity: '2 baskets', payment: 'KBZPay' },
      },
      {
        id: 'burmese',
        sourceLabel: 'MSG-MY-001',
        message: 'မမေအတွက် SM-1002 ၂ ထုပ်ယူမယ်၊ WavePay နဲ့ရှင်းမယ်။',
        channel: 'Viber',
        customer: 'မမေ',
        sku: 'SM-1002',
        quantity: 2,
        payment: 'WavePay',
        quotes: { customer: 'မမေ', sku: 'SM-1002', quantity: '၂ ထုပ်', payment: 'WavePay' },
      },
      {
        id: 'mixed',
        sourceLabel: 'CALL-MIX-001',
        message: 'Ko Aung က SM-1003 qty 1 မှာပြီး Cash on delivery ပါ။',
        channel: 'Phone',
        customer: 'Ko Aung',
        sku: 'SM-1003',
        quantity: 1,
        payment: 'Cash on delivery',
        quotes: { customer: 'Ko Aung', sku: 'SM-1003', quantity: 'qty 1', payment: 'Cash on delivery' },
      },
    ]
    const drafts = fixtures.map((fixture) => intake.buildChannelOrderDraft({
      ...fixture,
      catalogSkus: ['SM-1001', 'SM-1002', 'SM-1003'],
      attributions: Object.fromEntries(Object.entries(fixture.quotes).map(([field, quote]) => [field, { kind: 'quote', quote }])),
    }))
    drafts.forEach((draft, index) => {
      assert(intake.channelOrderDraftIsReady(draft), `channel_order_${fixtures[index].id}_not_ready`)
      assert(draft.provenance.every((entry) => entry.kind === 'operator_supplied' || fixtures[index].message.slice(entry.start, entry.end) === entry.quote), `channel_order_${fixtures[index].id}_span_not_exact`)
    })
    assert(drafts.every((draft, index) => !JSON.stringify(draft).includes(fixtures[index].message)), 'channel_order_draft_retained_full_message')
    assert(drafts.every((draft) => /^CHN-[A-F0-9]{16}$/.test(draft.sourceRecordId)
      && /^MSG-[A-F0-9]{16}$/.test(draft.messageFingerprint)
      && draft.evidenceReference.startsWith(`channel-message://${draft.sourceRecordId}#msg-${draft.messageFingerprint.slice(4).toLowerCase()}-map-`)), 'channel_order_source_identity_invalid')
    assert(!intake.channelOrderDraftIsReady({ ...drafts[0], provenance: drafts[0].provenance.slice(1) }), 'channel_order_ready_guard_accepted_missing_provenance')
    assert(!intake.channelOrderDraftIsReady({ ...drafts[0], sourceRecordId: 'CHN-TAMPERED' }), 'channel_order_ready_guard_accepted_tampered_source')
    assert(!intake.channelOrderDraftIsReady({ ...drafts[0], schema: 'supermega.channel_order_draft.v0' }), 'channel_order_ready_guard_accepted_stale_schema')
    assert(!intake.channelOrderDraftIsReady({ ...drafts[0], evidenceReference: `${drafts[0].evidenceReference}tampered` }), 'channel_order_ready_guard_accepted_tampered_evidence')
    assert(!intake.channelOrderDraftIsReady({
      ...drafts[0],
      provenance: drafts[0].provenance.map((entry) => entry.kind === 'quote' ? { ...entry, end: entry.end + 1 } : entry),
    }), 'channel_order_ready_guard_accepted_invalid_quote_span')

    const seed = commerce.createSeedCommerce()
    const seedBefore = JSON.stringify(seed)
    const incomplete = intake.buildChannelOrderDraft({
      ...fixtures[0],
      customer: '',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: {
        customer: { kind: 'quote', quote: 'missing customer' },
        sku: { kind: 'quote', quote: 'SM-1001' },
        quantity: { kind: 'quote', quote: '2 baskets' },
        payment: { kind: 'quote', quote: 'KBZPay' },
      },
    })
    assert(incomplete.status === 'needs_review' && incomplete.blockers.includes('customer_required') && incomplete.blockers.includes('customer_quote_not_found'), 'channel_order_missing_fields_did_not_fail_closed')
    assert(JSON.stringify(seed) === seedBefore, 'channel_order_draft_changed_commerce_state')

    const operatorSupplied = intake.buildChannelOrderDraft({
      ...fixtures[0],
      customer: 'Counter customer 7',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: {
        customer: { kind: 'operator_supplied' },
        sku: { kind: 'quote', quote: 'SM-1001' },
        quantity: { kind: 'quote', quote: '2 baskets' },
        payment: { kind: 'quote', quote: 'KBZPay' },
      },
    })
    assert(intake.channelOrderDraftIsReady(operatorSupplied) && operatorSupplied.provenance.some((entry) => entry.field === 'customer' && entry.kind === 'operator_supplied'), 'channel_order_operator_supplied_provenance_missing')
    const fullMessageQuote = intake.buildChannelOrderDraft({
      ...fixtures[0],
      message: 'May',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: {
        customer: { kind: 'quote', quote: 'May' },
        sku: { kind: 'operator_supplied' },
        quantity: { kind: 'operator_supplied' },
        payment: { kind: 'operator_supplied' },
      },
    })
    assert(fullMessageQuote.status === 'needs_review'
      && fullMessageQuote.blockers.includes('customer_quote_must_be_excerpt')
      && !JSON.stringify(fullMessageQuote).includes('"quote":"May"'), 'channel_order_full_message_quote_was_retained')
    const overlappingQuote = intake.buildChannelOrderDraft({
      ...fixtures[0],
      message: 'aaa / SM-1001 / 2 baskets / KBZPay',
      customer: 'aa',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: {
        customer: { kind: 'quote', quote: 'aa' },
        sku: { kind: 'quote', quote: 'SM-1001' },
        quantity: { kind: 'quote', quote: '2 baskets' },
        payment: { kind: 'quote', quote: 'KBZPay' },
      },
    })
    assert(overlappingQuote.status === 'needs_review' && overlappingQuote.blockers.includes('customer_quote_ambiguous'), 'channel_order_overlapping_quote_was_not_ambiguous')
    const exactRetry = intake.buildChannelOrderDraft({
      ...fixtures[0],
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: Object.fromEntries(Object.entries(fixtures[0].quotes).map(([field, quote]) => [field, { kind: 'quote', quote }])),
    })
    assert(exactRetry.sourceRecordId === drafts[0].sourceRecordId && exactRetry.evidenceReference === drafts[0].evidenceReference, 'channel_order_exact_draft_retry_changed_identity')
    const changedBody = intake.buildChannelOrderDraft({
      ...fixtures[0],
      message: `${fixtures[0].message} Confirmed again.`,
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: Object.fromEntries(Object.entries(fixtures[0].quotes).map(([field, quote]) => [field, { kind: 'quote', quote }])),
    })
    assert(changedBody.sourceRecordId === drafts[0].sourceRecordId
      && changedBody.messageFingerprint !== drafts[0].messageFingerprint
      && changedBody.evidenceReference !== drafts[0].evidenceReference, 'channel_order_reference_identity_changed_with_message_body')
    const normalizedReference = intake.buildChannelOrderDraft({
      ...fixtures[0],
      sourceLabel: '  msg-en-001  ',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: Object.fromEntries(Object.entries(fixtures[0].quotes).map(([field, quote]) => [field, { kind: 'quote', quote }])),
    })
    assert(normalizedReference.sourceRecordId === drafts[0].sourceRecordId, 'channel_order_reference_identity_was_case_or_space_sensitive')
    const conflictingMapping = intake.buildChannelOrderDraft({
      ...fixtures[0],
      customer: 'May revised',
      catalogSkus: seed.items.map((item) => item.sku),
      attributions: {
        customer: { kind: 'operator_supplied' },
        sku: { kind: 'quote', quote: 'SM-1001' },
        quantity: { kind: 'quote', quote: '2 baskets' },
        payment: { kind: 'quote', quote: 'KBZPay' },
      },
    })
    assert(conflictingMapping.sourceRecordId === drafts[0].sourceRecordId && conflictingMapping.evidenceReference !== drafts[0].evidenceReference, 'channel_order_conflicting_mapping_not_detectable')

    const item = seed.items.find((candidate) => candidate.sku === drafts[0].sku)
    const proof = { actionId: 'ACT-CHANNEL-RUNTIME-01', capturedAt: '2026-07-23T12:00:00.000Z', actor: 'Commerce lead', reason: 'Confirmed source-backed channel order.', evidenceReference: drafts[0].evidenceReference }
    const order = {
      id: 'ORD-CHANNEL-RUNTIME-01',
      createdAt: proof.capturedAt,
      customer: drafts[0].customer,
      owner: proof.actor,
      channel: drafts[0].channel,
      item: item.name,
      itemSku: item.sku,
      quantity: drafts[0].quantity,
      payment: drafts[0].payment,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: drafts[0].sourceRecordId,
      promisedAt: '2026-07-23T14:00:00.000Z',
      sourceRecordId: drafts[0].sourceRecordId,
      evidenceReference: drafts[0].evidenceReference,
      total: item.price * drafts[0].quantity,
      status: 'confirmed',
    }
    const accepted = commerce.reserveCommerceOrder(seed, order, proof)
    assert(commerce.reserveCommerceOrder(seed, order, { ...proof, evidenceReference: 'MSG-CONFLICTING-EVIDENCE' }) === null, 'channel_order_mismatched_action_evidence_succeeded')
    assert(accepted?.orders.some((candidate) => candidate.id === order.id && candidate.sourceRecordId === drafts[0].sourceRecordId), 'channel_order_human_confirmation_not_recorded')
    assert(accepted?.items.find((candidate) => candidate.sku === item.sku)?.onHand === item.onHand - order.quantity, 'channel_order_confirmation_did_not_reserve_stock_once')
    assert(commerce.reserveCommerceOrder(accepted, order, proof) === accepted, 'channel_order_exact_confirmation_retry_not_idempotent')
    const conflictingOrder = { ...order, id: 'ORD-CHANNEL-RUNTIME-02', customer: 'Changed customer', evidenceReference: conflictingMapping.evidenceReference }
    const conflictingProof = { ...proof, actionId: 'ACT-CHANNEL-RUNTIME-02', evidenceReference: conflictingMapping.evidenceReference }
    assert(commerce.reserveCommerceOrder(accepted, conflictingOrder, conflictingProof) === null, 'channel_order_conflicting_source_reuse_succeeded')
  } catch (error) {
    fail(`channel_order_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyCatalogImportRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    catalogImportRuntimeChecks += 1
  }
  const rejects = async (action, reason) => {
    let rejected = false
    try { await action() } catch { rejected = true }
    assert(rejected, reason)
  }
  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'shop-catalog-import.ts')).href}?shop-catalog-import-verify=${Date.now()}`)
    const existing = [{ sku: 'OLD-001', name: 'Existing item', onHand: 5, reorderAt: 2, price: 900 }]
    const existingBefore = JSON.stringify(existing)
    const aliasCsv = '\uFEFFStock Code,Product Name,Available Stock,Reorder Level,Selling Price\r\nTEA-001,"Green, tea",24,8,4500\r\nCOFFEE-002,မြန်မာ ကော်ဖီ,12,5,7000\r\n'
    const aliasPreview = await model.createShopCatalogImportPreview(aliasCsv, existing, undefined, 'alias.csv')
    assert(aliasPreview.schema === model.SHOP_CATALOG_IMPORT_SCHEMA, 'catalog_import_schema_missing')
    assert(JSON.stringify(aliasPreview.mapping) === JSON.stringify({ sku: 'Stock Code', name: 'Product Name', onHand: 'Available Stock', reorderAt: 'Reorder Level', price: 'Selling Price' }), 'catalog_import_alias_mapping_wrong')
    assert(aliasPreview.suggestions.every((suggestion) => suggestion.basis === 'alias'), 'catalog_import_alias_suggestions_not_explicit')
    assert(aliasPreview.totals.rows === 2 && aliasPreview.totals.ready === 2 && aliasPreview.totals.issueRows === 0, 'catalog_import_valid_totals_wrong')
    assert(aliasPreview.rows[0].item?.name === 'Green, tea', 'catalog_import_quoted_comma_lost')
    assert(aliasPreview.rows[1].item?.name === 'မြန်မာ ကော်ဖီ', 'catalog_import_unicode_lost')
    assert([aliasPreview.sourceDigest, aliasPreview.catalogDigest, aliasPreview.previewDigest].every((digest) => /^sha256:[a-f0-9]{64}$/.test(digest)), 'catalog_import_digests_not_sha256')
    const aliasRetry = await model.createShopCatalogImportPreview(aliasCsv, existing, aliasPreview.mapping, 'renamed.csv')
    assert(aliasRetry.previewDigest === aliasPreview.previewDigest && aliasRetry.sourceDigest === aliasPreview.sourceDigest, 'catalog_import_exact_retry_not_deterministic')
    assert(JSON.stringify(existing) === existingBefore, 'catalog_import_preview_mutated_catalog')
    assert(model.shopCatalogImportCatalogSignature([...existing, aliasPreview.rows[0].item].filter(Boolean)) === model.shopCatalogImportCatalogSignature([aliasPreview.rows[0].item, ...existing].filter(Boolean)), 'catalog_import_catalog_signature_depends_on_order')

    const templatePreview = await model.createShopCatalogImportPreview(model.SHOP_CATALOG_IMPORT_TEMPLATE, [])
    assert(templatePreview.totals.ready === 2 && templatePreview.headers.join(',') === 'sku,item_name,opening_stock,reorder_at,price_mmk', 'catalog_import_template_not_ready')
    assert(templatePreview.suggestions.every((suggestion) => suggestion.basis === 'exact'), 'catalog_import_template_headers_not_exact')

    const manualCsv = 'Code,Label,Qty,Minimum,MMK\nSKU-100,One,1,0,1000\n'
    const unmapped = await model.createShopCatalogImportPreview(manualCsv, [])
    assert(unmapped.fileIssues.length === 4 && unmapped.mapping.onHand === 'Qty' && unmapped.totals.invalid === 1, 'catalog_import_unmapped_columns_did_not_fail_closed')
    const manualMapping = { sku: 'Code', name: 'Label', onHand: 'Qty', reorderAt: 'Minimum', price: 'MMK' }
    const manuallyMapped = await model.createShopCatalogImportPreview(manualCsv, [], manualMapping)
    assert(manuallyMapped.totals.ready === 1 && JSON.stringify(manuallyMapped.mapping) === JSON.stringify(manualMapping), 'catalog_import_manual_mapping_not_respected')

    const duplicatePreview = await model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nDUP-1,One,1,0,100\nDUP-1,Two,2,1,200\n', [])
    assert(duplicatePreview.totals.duplicates === 2 && duplicatePreview.rows.every((row) => row.issues.some((issue) => issue.code === 'duplicate_file_sku' && issue.field === 'sku')), 'catalog_import_file_duplicates_not_all_flagged')
    const exactExisting = await model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nOLD-001,Existing item,5,2,900\n', existing)
    assert(exactExisting.totals.alreadyExists === 1 && exactExisting.totals.issueRows === 0, 'catalog_import_exact_existing_item_not_idempotent')
    const conflictingExisting = await model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nOLD-001,Changed item,5,2,900\n', existing)
    assert(conflictingExisting.totals.conflicts === 1 && conflictingExisting.rows[0].issues[0].code === 'existing_sku_conflict', 'catalog_import_existing_conflict_not_blocked')

    const invalidCsv = 'sku,item_name,opening_stock,reorder_at,price_mmk\n=CMD(),Valid,1,0,100\nlower,Valid,1,0,100\nUPPER-1, Name,1,0,100\nUPPER-2,=CMD(),1,0,100\nUPPER-3,Valid,1.5,0,100\nUPPER-4,Cafe\u0301,1,0,100\nUPPER-5,Valid,1,0,100,extra\n'
    const invalidPreview = await model.createShopCatalogImportPreview(invalidCsv, [])
    const invalidCodes = new Set(invalidPreview.rows.flatMap((row) => row.issues.map((issue) => issue.code)))
    assert(invalidPreview.totals.invalid === 7 && invalidPreview.totals.ready === 0, 'catalog_import_invalid_rows_count_wrong')
    assert(invalidCodes.has('sku_not_uppercase'), 'catalog_import_lowercase_sku_silently_changed')
    assert(invalidCodes.has('sku_spreadsheet_formula') && invalidCodes.has('name_spreadsheet_formula'), 'catalog_import_formula_cells_not_rejected')
    assert(invalidCodes.has('name_not_canonical') && invalidCodes.has('name_unicode_normalization'), 'catalog_import_text_canonicalization_not_enforced')
    assert(invalidCodes.has('onHand_whole_number'), 'catalog_import_decimal_quantity_accepted')
    assert(invalidCodes.has('column_count'), 'catalog_import_extra_column_accepted')
    const errorCsv = model.shopCatalogImportErrorsCsv(invalidPreview)
    assert(errorCsv.startsWith('row,status,sku,issue_codes,issues\r\n') && errorCsv.endsWith('\r\n'), 'catalog_import_error_export_not_csv')
    assert(errorCsv.includes("invalid,'=CMD()") && !errorCsv.includes('invalid,=CMD()'), 'catalog_import_error_export_formula_not_escaped')
    assert(model.shopCatalogImportErrorsCsv(aliasPreview) === 'row,status,sku,issue_codes,issues\r\n', 'catalog_import_error_export_included_ready_rows')

    const reusedMapping = { sku: 'Code', name: 'Code', onHand: 'Code', reorderAt: 'Code', price: 'Code' }
    const reused = await model.createShopCatalogImportPreview(manualCsv, [], reusedMapping)
    assert(reused.fileIssues.some((issue) => issue.code === 'mapping_reused_header') && reused.totals.invalid === 1, 'catalog_import_reused_mapping_not_blocked')
    const fullCatalog = Array.from({ length: model.SHOP_CATALOG_IMPORT_MAX_ROWS }, (_, index) => ({ sku: `EXIST-${index}`, name: `Existing ${index}`, onHand: 0, reorderAt: 0, price: 1 }))
    const atCapacity = await model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nNEW-1,New,0,0,1\n', fullCatalog)
    assert(atCapacity.totals.invalid === 1 && atCapacity.rows[0].issues[0].code === 'catalog_capacity', 'catalog_import_capacity_not_enforced')
    const blankInside = await model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nOK-1,Okay,0,0,1\n\nOK-2,Okay too,0,0,1\n', [])
    assert(blankInside.totals.rows === 3 && blankInside.totals.invalid === 1 && blankInside.totals.ready === 2, 'catalog_import_inner_blank_row_hidden')

    await rejects(() => model.createShopCatalogImportPreview('sku,item_name\n"broken,value\n', []), 'catalog_import_unclosed_quote_accepted')
    await rejects(() => model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\n"SKU-1"x,Item,0,0,1\n', []), 'catalog_import_text_after_closing_quote_accepted')
    await rejects(() => model.createShopCatalogImportPreview('sku, SKU ,opening_stock,reorder_at,price_mmk\nA,B,1,0,1\n', []), 'catalog_import_equivalent_headers_accepted')
    await rejects(() => model.createShopCatalogImportPreview('sku,item_name,opening_stock,reorder_at,price_mmk\nA\0,B,1,0,1\n', []), 'catalog_import_null_byte_accepted')
    const tooManyRows = `sku,item_name,opening_stock,reorder_at,price_mmk\n${Array.from({ length: model.SHOP_CATALOG_IMPORT_MAX_ROWS + 1 }, (_, index) => `SKU-${index},Item ${index},0,0,1`).join('\n')}\n`
    await rejects(() => model.createShopCatalogImportPreview(tooManyRows, []), 'catalog_import_row_limit_not_enforced')
    await rejects(() => model.createShopCatalogImportPreview('x'.repeat(model.SHOP_CATALOG_IMPORT_MAX_BYTES + 1), []), 'catalog_import_byte_limit_not_enforced')
  } catch (error) {
    fail(`catalog_import_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyClientOnboardingRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    clientOnboardingRuntimeChecks += 1
  }
  const rejects = async (action, reason) => {
    let rejected = false
    try { await action() } catch { rejected = true }
    assert(rejected, reason)
  }
  const rejectsSync = (action, reason) => {
    let rejected = false
    try { action() } catch { rejected = true }
    assert(rejected, reason)
  }
  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?client-onboarding-verify=${Date.now()}`)
    const objectIds = new Set()
    for (const productProfile of solutionProducts) {
      const product = productProfile.runtimeId
      const object = model.clientImportObject(product)
      objectIds.add(object.id)
      assert(object.fields.length === 5 && object.fields.some((field) => !field.required) === (product === 'website' || product === 'ecommerce'), `client_import_${product}_field_contract_wrong`)
      const profileIds = model.clientImportWorkflowTemplateIds(product)
      assert(JSON.stringify(profileIds) === JSON.stringify(productProfile.templates.map((template) => template.id)), `client_import_${product}_workflow_profiles_drifted`)
      const previewDigests = new Set()
      for (const workflowTemplate of productProfile.templates) {
        const template = model.clientImportTemplate(product, workflowTemplate.id)
        const preview = await model.createClientImportPreview(template, product, undefined, `${workflowTemplate.id}.csv`, workflowTemplate.id)
        assert(preview.product === product && preview.object === object.id && preview.workflowTemplateId === workflowTemplate.id, `client_import_${workflowTemplate.id}_identity_wrong`)
        assert(preview.totals.rows === 2 && preview.totals.ready === 2 && preview.readyForStaging, `client_import_${workflowTemplate.id}_template_not_stageable`)
        assert(/^sha256:[a-f0-9]{64}$/.test(preview.sourceDigest) && /^sha256:[a-f0-9]{64}$/.test(preview.previewDigest), `client_import_${workflowTemplate.id}_digest_missing`)
        const retried = await model.createClientImportPreview(template, product, preview.mapping, 'renamed.csv', workflowTemplate.id)
        assert(retried.sourceDigest === preview.sourceDigest && retried.previewDigest === preview.previewDigest, `client_import_${workflowTemplate.id}_preview_not_deterministic`)
        const staged = model.buildClientImportStagingPackage(preview, { workflowTemplateId: workflowTemplate.id, workspace: `${product} client`, owner: 'Owner' })
        assert(staged.contract === model.CLIENT_STAGING_SCHEMA && staged.controls.activationStatus === 'staged_not_applied', `client_import_${workflowTemplate.id}_staging_contract_wrong`)
        assert(staged.controls.rowCount === 2 && staged.controls.humanReviewRequired === true && staged.controls.externalWritesPerformed === false, `client_import_${workflowTemplate.id}_staging_controls_wrong`)
        previewDigests.add(preview.previewDigest)
      }
      assert(previewDigests.size === productProfile.templates.length, `client_import_${product}_workflow_digest_not_bound`)
    }
    assert(objectIds.size === 4, 'client_import_objects_not_unique')

    const socialTemplate = model.clientImportTemplate('commerce', 'social-commerce')
    const socialPreview = await model.createClientImportPreview(socialTemplate, 'commerce', undefined, 'social.csv', 'social-commerce')
    const retailPreview = await model.createClientImportPreview(socialTemplate, 'commerce', undefined, 'social.csv', 'retail-wholesale')
    assert(socialPreview.sourceDigest === retailPreview.sourceDigest && socialPreview.previewDigest !== retailPreview.previewDigest, 'client_import_workflow_not_bound_to_preview_digest')
    rejectsSync(() => model.buildClientImportStagingPackage(socialPreview, { workflowTemplateId: 'retail-wholesale', workspace: 'Client', owner: 'Owner' }), 'client_import_cross_workflow_preview_staged')
    await rejects(() => model.createClientImportPreview(socialTemplate, 'commerce', undefined, 'bad.csv', 'not-a-workflow'), 'client_import_unknown_workflow_accepted')

    const burmeseShop = await model.createClientImportPreview('ပစ္စည်းကုဒ်,ပစ္စည်းအမည်,လက်ကျန်,reorder_at,စျေးနှုန်း\nSKU-MM-1,မြန်မာ ကော်ဖီ,10,2,7000\n', 'commerce', undefined, 'မြန်မာ.csv')
    assert(burmeseShop.readyForStaging && burmeseShop.rows[0].values.name === 'မြန်မာ ကော်ဖီ', 'client_import_burmese_headers_or_values_lost')
    assert(burmeseShop.suggestions.filter((suggestion) => suggestion.basis === 'alias').length >= 4, 'client_import_alias_mapping_not_explained')

    const manualCsv = 'Code,Thing,Count,Needed,Work cell\nJOB-X,Item X,4,2026-08-20,Line X\n'
    const unmapped = await model.createClientImportPreview(manualCsv, 'production')
    assert(!unmapped.readyForStaging && unmapped.fileIssues.length >= 4, 'client_import_unmapped_columns_did_not_fail_closed')
    const manualMapping = { jobCode: 'Code', productName: 'Thing', targetQuantity: 'Count', dueDate: 'Needed', line: 'Work cell' }
    const manuallyMapped = await model.createClientImportPreview(manualCsv, 'production', manualMapping)
    assert(manuallyMapped.readyForStaging && JSON.stringify(manuallyMapped.mapping) === JSON.stringify(manualMapping), 'client_import_manual_mapping_not_respected')

    const duplicate = await model.createClientImportPreview('page_slug,page_title,headline,body,contact_url\nhome,Home,One,Body,https://example.com\nhome,Home two,Two,Body,https://example.com\n', 'website')
    assert(duplicate.totals.duplicates === 2 && duplicate.rows.every((row) => row.issues.some((issue) => issue.code === 'duplicate_object_key')), 'client_import_duplicate_keys_not_blocked')
    const invalid = await model.createClientImportPreview('sku,featured,collection,display_name,merchandising_note\n=CMD(),yes,Group, Name,=BAD()\nlower,true,Group,Name,Note\nSKU-3,true,Group,Name,Note,extra\n', 'ecommerce')
    const invalidCodes = new Set(invalid.rows.flatMap((row) => row.issues.map((issue) => issue.code)))
    assert(invalid.totals.invalid === 3 && !invalid.readyForStaging, 'client_import_invalid_rows_stageable')
    assert(invalidCodes.has('spreadsheet_formula') && invalidCodes.has('identifier_not_canonical') && invalidCodes.has('column_count'), 'client_import_canonical_validation_missing')
    const badDate = await model.createClientImportPreview('job_code,product_name,target_quantity,due_date,production_line\nJOB-1,Item,1,2026-02-30,Line A\n', 'production')
    assert(badDate.rows[0].issues.some((issue) => issue.code === 'date_not_canonical'), 'client_import_impossible_date_accepted')
    const badUrl = await model.createClientImportPreview('page_slug,page_title,headline,body,contact_url\nhome,Home,Hello,Body,javascript:alert(1)\n', 'website')
    assert(badUrl.rows[0].issues.some((issue) => issue.code === 'url_not_allowed'), 'client_import_unsafe_url_accepted')

    rejectsSync(() => model.buildClientImportStagingPackage(unmapped, { workflowTemplateId: 'x', workspace: 'Client', owner: 'Owner' }), 'client_import_invalid_preview_staged')
    rejectsSync(() => model.buildClientImportStagingPackage(manuallyMapped, { workflowTemplateId: manuallyMapped.workflowTemplateId, workspace: '', owner: 'Owner' }), 'client_import_missing_workspace_staged')
    await rejects(() => model.createClientImportPreview('sku,name\n"broken,value\n', 'commerce'), 'client_import_unclosed_quote_accepted')
    await rejects(() => model.createClientImportPreview('sku, SKU ,opening_stock,reorder_at,price_mmk\nA,B,1,0,1\n', 'commerce'), 'client_import_equivalent_headers_accepted')
    await rejects(() => model.createClientImportPreview('x'.repeat(model.CLIENT_IMPORT_MAX_BYTES + 1), 'commerce'), 'client_import_byte_limit_not_enforced')
    const tooManyRows = `sku,item_name,opening_stock,reorder_at,price_mmk\n${Array.from({ length: model.CLIENT_IMPORT_MAX_ROWS + 1 }, (_, index) => `SKU-${index},Item ${index},0,0,1`).join('\n')}\n`
    await rejects(() => model.createClientImportPreview(tooManyRows, 'commerce'), 'client_import_row_limit_not_enforced')
  } catch (error) {
    fail(`client_onboarding_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyWebsiteRuntime() {
  const values = new Map()
  const storageOperations = []
  let lockRequests = 0
  let lockTail = Promise.resolve()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      storageOperations.push({ action: 'set', key })
      values.set(key, String(value))
    },
    removeItem: (key) => {
      storageOperations.push({ action: 'remove', key })
      values.delete(key)
    },
  }
  const locks = {
    request: async (_name, _options, callback) => {
      const previous = lockTail
      let release
      lockTail = new Promise((resolveLock) => { release = resolveLock })
      await previous
      lockRequests += 1
      try { return await callback() } finally { release() }
    },
  }
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    websiteRuntimeChecks += 1
  }
  const at = (offset) => new Date(Date.UTC(2026, 6, 23, 0, 0, 0) + offset).toISOString()

  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'website-model.ts')).href}?website-verify=${Date.now()}`)
    const exporter = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'website-export.ts')).href}?website-export-verify=${Date.now()}`)
    const starter = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'website-starter.ts')).href}?website-starter-verify=${Date.now()}`)
    const seed = model.createInitialWorkspace()
    const fingerprint = model.workspaceFingerprint(seed)
    const starterBrief = {
      businessName: 'Shwe Family Store',
      audience: 'Families in Yangon',
      offer: 'Fresh everyday groceries with same-day local delivery.',
      proof: 'The owner confirms every listed item and delivery area before the site is approved.',
      contactHref: 'https://m.me/shwe-family-store',
    }
    assert(starter.isUntouchedWebsiteStarter(seed), 'website_clean_seed_was_not_recognized_as_starter')
    assert(starter.websiteStarterBriefIssues(starterBrief).length === 0, 'website_valid_starter_brief_was_rejected')
    assert(starter.websiteStarterBriefIssues({ ...starterBrief, contactHref: 'http://unsafe.example' }).length === 1, 'website_unsafe_starter_destination_was_accepted')
    assert(starter.websiteStarterBriefIssues({ ...starterBrief, businessName: '\u0001' }).length === 1, 'website_starter_control_character_was_accepted')
    const briefPreview = starter.applyWebsiteStarterBrief(seed, starterBrief, at(50))
    assert(briefPreview !== seed
      && briefPreview.siteName === starterBrief.businessName
      && briefPreview.pages.length === 1
      && briefPreview.pages[0].slug === '/'
      && briefPreview.pages[0].stage === 'draft'
      && briefPreview.pages[0].hero.headline === starterBrief.offer
      && briefPreview.pages[0].hero.summary === `${starterBrief.businessName} · ${starterBrief.audience}`
      && briefPreview.pages[0].sections[0].body === starterBrief.proof
      && briefPreview.pages[0].hero.ctaHref === starterBrief.contactHref, 'website_starter_brief_did_not_create_exact_home_draft')
    assert(briefPreview.revision === 0
      && briefPreview.contentRevision === 0
      && briefPreview.evidence.length === 0
      && briefPreview.approvals.length === 0
      && briefPreview.localPublishes.length === 0
      && briefPreview.events.length === 0, 'website_starter_brief_forged_authoritative_history')
    assert(!starter.isUntouchedWebsiteStarter(briefPreview), 'website_business_preview_still_matched_starter')
    assert(starter.applyWebsiteStarterBrief(briefPreview, starterBrief, at(51)) === briefPreview, 'website_starter_overwrote_existing_work')
    assert(starter.applyWebsiteStarterBrief(seed, { ...starterBrief, offer: '' }, at(52)) === seed, 'website_invalid_starter_brief_changed_sample')
    assert(starter.applyWebsiteStarterBrief(seed, starterBrief, 'not-a-time') === seed, 'website_starter_accepted_noncanonical_time')
    const committedBrief = model.applyWebsiteWorkspaceUpdate(seed, () => briefPreview)
    assert(committedBrief.ok
      && committedBrief.changed
      && committedBrief.workspace.revision === 1
      && committedBrief.workspace.contentRevision === 1
      && committedBrief.workspace.pages[0].stage === 'draft', 'website_starter_preview_did_not_save_as_one_draft_revision')
    let editSession = model.createWebsiteEditSession(seed)
    for (let index = 0; index < 20; index += 1) {
      const staged = model.updateWebsiteEditSession(editSession, (current) => ({
        ...current,
        pages: current.pages.map((page) => page.id === 'page-home'
          ? {
              ...page,
              updatedAt: at(100 + index),
              hero: { ...page.hero, headline: `Unsaved Website headline ${index + 1}` },
            }
          : page),
      }))
      assert(staged.ok && staged.changed, `website_edit_session_step_${index + 1}_failed`)
      editSession = staged.session
    }
    assert(seed.revision === 0 && seed.contentRevision === 0 && editSession.workspace.revision === 0 && editSession.workspace.contentRevision === 0, 'website_typing_advanced_authoritative_revision')
    const restoredEditSession = model.restoreWebsiteEditSession(JSON.stringify(editSession))
    assert(restoredEditSession && model.websiteEditSessionMatches(restoredEditSession, seed), 'website_edit_session_did_not_resume_against_exact_base')
    const savedEditSession = model.applyWebsiteWorkspaceUpdate(
      seed,
      (current) => model.commitWebsiteEditSession(current, restoredEditSession),
    )
    assert(savedEditSession.ok
      && savedEditSession.changed
      && savedEditSession.workspace.revision === 1
      && savedEditSession.workspace.contentRevision === 1
      && savedEditSession.workspace.pages[0].hero.headline === 'Unsaved Website headline 20', 'website_edit_session_did_not_commit_exactly_once')
    const competingEdit = model.applyWebsiteWorkspaceUpdate(seed, (current) => ({ ...current, siteName: 'Competing Website edit' }))
    assert(competingEdit.ok && !model.websiteEditSessionMatches(editSession, competingEdit.workspace), 'website_edit_session_did_not_detect_newer_base')
    let staleEditRefused = false
    try {
      model.commitWebsiteEditSession(competingEdit.workspace, editSession)
    } catch {
      staleEditRefused = true
    }
    assert(staleEditRefused && competingEdit.workspace.siteName === 'Competing Website edit', 'website_stale_edit_session_overwrote_newer_workspace')
    const stagedEvidence = model.updateWebsiteEditSession(editSession, (current) => ({
      ...current,
      evidence: [{
        id: 'draft-evidence',
        kind: 'content',
        finding: 'Must not stage',
        reference: 'DRAFT',
        verifiedBy: 'OP-OWNER',
        verifiedAt: at(200),
        fingerprint,
        source: { contentRevision: 0, digest: fingerprint },
        migratedFromV1: false,
      }, ...current.evidence],
    }))
    assert(!stagedEvidence.ok, 'website_edit_session_staged_release_evidence')
    const reverseObjectKeys = (value) => Array.isArray(value)
      ? value.map(reverseObjectKeys)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])]))
        : value
    assert(model.workspaceFingerprint(reverseObjectKeys(seed)) === fingerprint, 'website_fingerprint_not_canonical_across_jsonb_key_order')
    const legacyEvidence = ['content', 'responsive', 'links'].map((kind, index) => ({
      id: `legacy-evidence-${kind}`,
      kind,
      finding: `${kind} legacy review`,
      reference: `LEGACY-${kind.toUpperCase()}`,
      verifiedBy: 'OP-LEGACY',
      verifiedAt: at(index),
      fingerprint,
    }))
    const legacy = {
      version: 1,
      siteName: seed.siteName,
      pages: seed.pages,
      selectedPageId: seed.selectedPageId,
      evidence: legacyEvidence,
      approval: {
        id: 'legacy-approval',
        reviewer: 'OP-LEGACY',
        note: 'Legacy approval retained for history',
        approvedAt: at(10),
        fingerprint,
      },
      localPublishes: [{
        id: 'legacy-publish',
        recordedAt: at(20),
        recordedBy: 'OP-LEGACY',
        fingerprint,
        readyPageIds: seed.pages.filter((page) => page.stage === 'ready').map((page) => page.id),
      }],
    }

    values.set(model.LEGACY_WEBSITE_STORAGE_KEY, JSON.stringify(legacy))
    const migratedOnce = model.loadWebsiteWorkspace(storage)
    const migratedTwice = model.loadWebsiteWorkspace(storage)
    assert(migratedOnce.ok && migratedTwice.ok && migratedOnce.source === 'v1' && JSON.stringify(migratedOnce.workspace) === JSON.stringify(migratedTwice.workspace), 'website_v1_migration_not_deterministic')
    assert(migratedOnce.ok && migratedOnce.workspace.siteName === legacy.siteName && JSON.stringify(migratedOnce.workspace.pages) === JSON.stringify(legacy.pages), 'website_v1_content_not_preserved')
    assert(migratedOnce.ok && migratedOnce.workspace.evidence.length === 0 && migratedOnce.workspace.approvals.length === 0 && migratedOnce.workspace.localPublishes.length === 0 && migratedOnce.workspace.events.length === 0, 'website_v1_release_claims_entered_active_ledger')
    assert(values.get(model.LEGACY_WEBSITE_STORAGE_KEY) === JSON.stringify(legacy) && model.getCurrentApproval(migratedOnce.workspace) === null && model.getCurrentPublish(migratedOnce.workspace) === null, 'website_v1_source_backup_or_release_boundary_lost')

    values.set(model.WEBSITE_STORAGE_KEY, JSON.stringify(seed))
    const v2Precedence = model.loadWebsiteWorkspace(storage)
    assert(v2Precedence.ok && v2Precedence.source === 'v2' && v2Precedence.workspace.approvals.length === 0, 'website_v2_did_not_take_precedence')
    const malformed = '{broken'
    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    const malformedLoad = model.loadWebsiteWorkspace(storage)
    assert(!malformedLoad.ok && values.get(model.WEBSITE_STORAGE_KEY) === malformed, 'website_malformed_v2_fell_back_or_was_replaced')
    const repairCandidate = {
      source: 'v2',
      sourceKey: model.WEBSITE_STORAGE_KEY,
      expectedRaw: malformed,
      observedAt: at(25),
    }
    storageOperations.length = 0
    const locksBeforeRepair = lockRequests
    const repaired = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, storage, locks)
    const repairedLoad = model.loadWebsiteWorkspace(storage)
    const repairArchive = repaired.ok ? JSON.parse(values.get(repaired.archiveKey)) : null
    const repairIndex = JSON.parse(values.get(model.WEBSITE_RECOVERY_INDEX_KEY))
    assert(repaired.ok && repairedLoad.ok && repairedLoad.source === 'v2' && lockRequests === locksBeforeRepair + 1, 'website_targeted_repair_not_locked_or_confirmed')
    assert(repaired.ok && repairArchive.rawValue === malformed && repairArchive.sourceKey === model.WEBSITE_STORAGE_KEY && repairIndex.archives.some((entry) => entry.archiveKey === repaired.archiveKey) && model.readWebsiteRecoveryArchive(repaired.archiveKey, storage) === values.get(repaired.archiveKey), 'website_targeted_repair_did_not_archive_exact_raw_value')
    const recoveryArchivesAfterReload = model.listWebsiteRecoveryArchives(storage)
    assert(repaired.ok && recoveryArchivesAfterReload.length === 1 && recoveryArchivesAfterReload[0].archiveKey === repaired.archiveKey, 'website_recovery_archive_not_listed_after_reload')
    const archiveWriteIndex = storageOperations.findIndex((operation) => operation.action === 'set' && operation.key === repaired.archiveKey)
    const recoveryIndexWriteIndex = storageOperations.findIndex((operation) => operation.action === 'set' && operation.key === model.WEBSITE_RECOVERY_INDEX_KEY)
    const replacementWriteIndex = storageOperations.findIndex((operation) => operation.action === 'set' && operation.key === model.WEBSITE_STORAGE_KEY)
    assert(archiveWriteIndex >= 0 && archiveWriteIndex < recoveryIndexWriteIndex && recoveryIndexWriteIndex < replacementWriteIndex, 'website_repair_write_order_not_archive_first')
    const staleRepairSize = values.size
    const staleRepair = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, storage, locks)
    assert(!staleRepair.ok && staleRepair.code === 'stale_candidate' && values.size === staleRepairSize, 'website_stale_repair_candidate_wrote_storage')
    const deletedRecovery = repaired.ok ? await model.deleteWebsiteRecoveryArchive(repaired.archiveKey, storage, locks) : null
    assert(deletedRecovery?.ok && deletedRecovery.archives.length === 0 && !values.has(repaired.archiveKey) && model.listWebsiteRecoveryArchives(storage).length === 0, 'website_recovery_archive_lifecycle_not_persistent_or_removable')

    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    const noLockBefore = JSON.stringify([...values])
    const noLockRepair = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, storage, null)
    assert(!noLockRepair.ok && noLockRepair.code === 'lock_unavailable' && JSON.stringify([...values]) === noLockBefore, 'website_repair_without_lock_wrote_storage')

    const archiveFailStorage = {
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (String(key).startsWith('supermega.website.workspace.recovery.v1.')) throw new Error('archive quota')
        storage.setItem(key, value)
      },
      removeItem: storage.removeItem,
    }
    const archiveFailRepair = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, archiveFailStorage, locks)
    assert(!archiveFailRepair.ok && archiveFailRepair.code === 'archive_write_failed' && values.get(model.WEBSITE_STORAGE_KEY) === malformed, 'website_archive_failure_replaced_invalid_value')

    const replacementFailStorage = {
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (key === model.WEBSITE_STORAGE_KEY) throw new Error('replacement quota')
        storage.setItem(key, value)
      },
      removeItem: storage.removeItem,
    }
    const replacementFailRepair = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, replacementFailStorage, locks)
    assert(!replacementFailRepair.ok && replacementFailRepair.code === 'replacement_write_failed' && replacementFailRepair.archiveConfirmed && values.has(replacementFailRepair.archiveKey) && values.get(model.WEBSITE_STORAGE_KEY) === malformed, 'website_replacement_failure_lost_archive_or_changed_invalid_value')

    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    let archiveConfirmationKey = ''
    const archiveConfirmationReadFailStorage = {
      getItem: (key) => {
        if (key === archiveConfirmationKey) throw new Error('archive confirmation read')
        return storage.getItem(key)
      },
      setItem: (key, value) => {
        storage.setItem(key, value)
        if (key !== model.WEBSITE_RECOVERY_INDEX_KEY && String(key).startsWith('supermega.website.workspace.recovery.v1.')) archiveConfirmationKey = key
      },
      removeItem: storage.removeItem,
    }
    const archiveConfirmationReadFail = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, archiveConfirmationReadFailStorage, locks)
    assert(!archiveConfirmationReadFail.ok && archiveConfirmationReadFail.archiveKey === archiveConfirmationKey && !archiveConfirmationReadFail.archiveConfirmed && values.has(archiveConfirmationKey) && values.get(model.WEBSITE_STORAGE_KEY) === malformed, 'website_archive_post_write_read_failure_lost_transaction_state')

    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    let indexWritten = false
    const indexConfirmationReadFailStorage = {
      getItem: (key) => {
        if (indexWritten && key === model.WEBSITE_RECOVERY_INDEX_KEY) throw new Error('index confirmation read')
        return storage.getItem(key)
      },
      setItem: (key, value) => {
        storage.setItem(key, value)
        if (key === model.WEBSITE_RECOVERY_INDEX_KEY) indexWritten = true
      },
      removeItem: storage.removeItem,
    }
    const indexConfirmationReadFail = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, indexConfirmationReadFailStorage, locks)
    assert(!indexConfirmationReadFail.ok && indexConfirmationReadFail.archiveConfirmed && values.has(indexConfirmationReadFail.archiveKey) && values.get(model.WEBSITE_STORAGE_KEY) === malformed, 'website_index_post_write_read_failure_lost_confirmed_archive_state')

    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    let replacementWritten = false
    const replacementConfirmationReadFailStorage = {
      getItem: (key) => {
        if (replacementWritten && key === model.WEBSITE_STORAGE_KEY) throw new Error('replacement confirmation read')
        return storage.getItem(key)
      },
      setItem: (key, value) => {
        storage.setItem(key, value)
        if (key === model.WEBSITE_STORAGE_KEY) replacementWritten = true
      },
      removeItem: storage.removeItem,
    }
    const replacementConfirmationReadFail = await model.repairInvalidWebsiteWorkspace(repairCandidate, seed, replacementConfirmationReadFailStorage, locks)
    assert(!replacementConfirmationReadFail.ok && replacementConfirmationReadFail.archiveConfirmed && !replacementConfirmationReadFail.replacementConfirmed && values.has(replacementConfirmationReadFail.archiveKey), 'website_replacement_post_write_read_failure_lost_transaction_state')

    values.set(model.WEBSITE_STORAGE_KEY, malformed)
    const repairRaceCandidate = { ...repairCandidate, observedAt: at(26) }
    const [repairRaceA, repairRaceB] = await Promise.all([
      model.repairInvalidWebsiteWorkspace(repairRaceCandidate, seed, storage, locks),
      model.repairInvalidWebsiteWorkspace(repairRaceCandidate, seed, storage, locks),
    ])
    assert(Number(repairRaceA.ok) + Number(repairRaceB.ok) === 1 && [repairRaceA, repairRaceB].some((result) => !result.ok && result.code === 'stale_candidate'), 'website_concurrent_repairs_did_not_fail_closed')

    values.clear()
    values.set(model.LEGACY_WEBSITE_STORAGE_KEY, malformed)
    const competingWorkspace = { ...seed, revision: seed.revision + 10 }
    const competingWorkspaceRaw = JSON.stringify(competingWorkspace)
    let competingV2Reads = 0
    const competingV2Storage = {
      getItem: (key) => {
        if (key === model.WEBSITE_STORAGE_KEY) {
          competingV2Reads += 1
          if (competingV2Reads === 2) values.set(model.WEBSITE_STORAGE_KEY, competingWorkspaceRaw)
        }
        return storage.getItem(key)
      },
      setItem: storage.setItem,
      removeItem: storage.removeItem,
    }
    const competingV2Repair = await model.repairInvalidWebsiteWorkspace({
      source: 'v1',
      sourceKey: model.LEGACY_WEBSITE_STORAGE_KEY,
      expectedRaw: malformed,
      observedAt: at(27),
    }, seed, competingV2Storage, locks)
    assert(!competingV2Repair.ok && competingV2Repair.code === 'stale_candidate' && competingV2Repair.archiveConfirmed && values.get(model.WEBSITE_STORAGE_KEY) === competingWorkspaceRaw && values.get(model.LEGACY_WEBSITE_STORAGE_KEY) === malformed, 'website_legacy_repair_overwrote_competing_v2_workspace')

    values.clear()
    values.set(model.LEGACY_WEBSITE_STORAGE_KEY, malformed)
    const legacyRepair = await model.repairInvalidWebsiteWorkspace({
      source: 'v1',
      sourceKey: model.LEGACY_WEBSITE_STORAGE_KEY,
      expectedRaw: malformed,
      observedAt: at(28),
    }, seed, storage, locks)
    const legacyRepairLoad = model.loadWebsiteWorkspace(storage)
    assert(legacyRepair.ok && legacyRepair.legacyCleanup === 'removed' && values.get(model.LEGACY_WEBSITE_STORAGE_KEY) === undefined && legacyRepairLoad.ok && legacyRepairLoad.source === 'v2', 'website_legacy_repair_cleanup_order_invalid')

    values.clear()
    assert(model.restoreWorkspace({ ...seed, unexpected: true }) === null, 'website_extra_key_was_accepted')
    assert(model.restoreWorkspace({ ...seed, pages: [seed.pages[0], { ...seed.pages[0] }] }) === null, 'website_duplicate_page_id_was_accepted')
    const retainedHistoryEvidence = Array.from({ length: 501 }, (_, index) => ({
      id: `history-${index}`,
      kind: 'content',
      finding: 'Retained Website history',
      reference: `HISTORY-${index}`,
      verifiedBy: 'OP-HISTORY',
      verifiedAt: at(index),
      fingerprint,
      source: { contentRevision: 0, digest: fingerprint },
      migratedFromV1: false,
    }))
    const retainedHistoryEvents = retainedHistoryEvidence.map((entry, index) => ({
      id: `event-history-${index}`,
      createdAt: entry.verifiedAt,
      actorKind: 'human',
      actor: entry.verifiedBy,
      action: 'publish_evidence_recorded',
      subjectId: entry.id,
      reason: entry.finding,
      evidenceReference: entry.reference,
      source: entry.source,
    }))
    const retainedHistory = {
      ...seed,
      revision: 501,
      evidence: retainedHistoryEvidence,
      events: retainedHistoryEvents,
    }
    const restoredRetainedHistory = model.restoreWorkspace(retainedHistory)
    assert(restoredRetainedHistory?.events.length === 501 && restoredRetainedHistory.evidence.length === 501, 'website_history_was_truncated')

    const forgedMigratedEvidence = [{ ...retainedHistoryEvidence[0], migratedFromV1: true }]
    const forgedMigrationRecords = {
      evidence: forgedMigratedEvidence,
      approvals: [],
      localPublishes: [],
    }
    const canonicalMigrationValue = (value) => Array.isArray(value)
      ? value.map(canonicalMigrationValue)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, nested]) => [key, canonicalMigrationValue(nested)]))
        : value
    const forgedMigrationSource = JSON.stringify(canonicalMigrationValue(forgedMigrationRecords))
    let forgedMigrationDigest = 2166136261
    for (let index = 0; index < forgedMigrationSource.length; index += 1) {
      forgedMigrationDigest ^= forgedMigrationSource.charCodeAt(index)
      forgedMigrationDigest = Math.imul(forgedMigrationDigest, 16777619)
    }
    const relabeledCurrentHistory = {
      ...seed,
      revision: 1,
      contentRevision: 1,
      evidence: forgedMigratedEvidence,
      events: [],
      legacyImport: {
        schema: 'supermega.website.legacy-import.v1',
        recordIds: forgedMigratedEvidence.map((entry) => entry.id),
        digest: `legacy-${(forgedMigrationDigest >>> 0).toString(16).padStart(8, '0')}`,
      },
    }
    assert(model.restoreWorkspace(relabeledCurrentHistory) === null, 'website_forged_migration_envelope_reopened_release_claim')

    for (const action of ['publish_evidence_recorded', 'website_revision_approved', 'local_snapshot_recorded']) {
      const orphanEvent = {
        ...retainedHistoryEvents[0],
        id: `event-orphan-${action}`,
        action,
        subjectId: `orphan-${action}`,
      }
      assert(model.restoreWorkspace({ ...seed, revision: 1, events: [orphanEvent] }) === null, `website_orphan_${action}_event_was_accepted`)
    }

    const duplicateSubjectHistory = structuredClone(retainedHistory)
    duplicateSubjectHistory.events[1].subjectId = duplicateSubjectHistory.events[0].subjectId
    assert(model.restoreWorkspace(duplicateSubjectHistory) === null, 'website_duplicate_event_subject_was_accepted')

    const wrongActionHistory = {
      ...seed,
      revision: 1,
      evidence: [retainedHistoryEvidence[0]],
      events: [{ ...retainedHistoryEvents[0], action: 'website_revision_approved' }],
    }
    assert(model.restoreWorkspace(wrongActionHistory) === null, 'website_wrong_action_event_binding_was_accepted')

    assert(migratedOnce.ok && model.restoreWorkspace(migratedOnce.workspace) !== null, 'website_content_only_migration_was_rejected')
    assert(model.restoreWorkspace({
      ...seed,
      revision: 1,
      evidence: [{ ...retainedHistoryEvidence[0], migratedFromV1: true }],
      events: [retainedHistoryEvents[0]],
    }) === null, 'website_client_asserted_migrated_release_record_was_accepted')

    const firstInput = {
      actionId: 'evidence-content-runtime',
      capturedAt: at(1000),
      kind: 'content',
      finding: 'Content owner verified the current copy',
      reference: 'CONTENT-REVIEW-1',
      verifiedBy: 'OP-OWNER',
    }
    const first = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteEvidence(current, firstInput),
      0,
      0,
      storage,
      locks,
    )
    assert(first.ok && first.changed && first.workspace.revision === 1 && first.workspace.contentRevision === 0 && first.workspace.events.length === 1, 'website_evidence_not_confirmed_atomically')
    const firstRaw = values.get(model.WEBSITE_STORAGE_KEY)
    const exactEvidence = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteEvidence(current, firstInput),
      1,
      0,
      storage,
      locks,
    )
    assert(exactEvidence.ok && !exactEvidence.changed && values.get(model.WEBSITE_STORAGE_KEY) === firstRaw, 'website_evidence_exact_retry_changed_state')
    const conflictingEvidence = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteEvidence(current, { ...firstInput, finding: 'Conflicting reuse' }),
      1,
      0,
      storage,
      locks,
    )
    assert(!conflictingEvidence.ok && values.get(model.WEBSITE_STORAGE_KEY) === firstRaw, 'website_evidence_conflict_overwrote_state')

    const [responsiveResult, linksResult] = await Promise.all([
      model.mutateWebsiteWorkspace(
        (current) => model.recordWebsiteEvidence(current, {
          actionId: 'evidence-responsive-runtime',
          capturedAt: at(1010),
          kind: 'responsive',
          finding: 'Desktop, tablet, and mobile previews verified',
          reference: 'RESPONSIVE-REVIEW-1',
          verifiedBy: 'OP-OWNER',
        }),
        1,
        0,
        storage,
        locks,
      ),
      model.mutateWebsiteWorkspace(
        (current) => model.recordWebsiteEvidence(current, {
          actionId: 'evidence-links-runtime',
          capturedAt: at(1020),
          kind: 'links',
          finding: 'Navigation and CTA destinations verified',
          reference: 'LINK-REVIEW-1',
          verifiedBy: 'OP-OWNER',
        }),
        1,
        0,
        storage,
        locks,
      ),
    ])
    const afterConcurrentEvidence = model.loadWebsiteWorkspace(storage)
    assert(responsiveResult.ok && linksResult.ok && afterConcurrentEvidence.ok && afterConcurrentEvidence.workspace.evidence.length === 3 && afterConcurrentEvidence.workspace.events.length === 3, 'website_concurrent_evidence_writes_did_not_both_survive')

    const readyForApproval = afterConcurrentEvidence.workspace
    const approvalInput = {
      actionId: 'approval-runtime-v2',
      capturedAt: at(2000),
      reviewer: 'OP-OWNER',
      note: 'All current evidence reviewed and accepted',
    }
    const approved = await model.mutateWebsiteWorkspace(
      (current) => model.approveWebsiteRevision(current, approvalInput),
      readyForApproval.revision,
      readyForApproval.contentRevision,
      storage,
      locks,
    )
    assert(approved.ok && approved.changed && model.getCurrentApproval(approved.workspace)?.evidenceIds.length === 3 && approved.workspace.events.length === 4, 'website_approval_not_bound_to_evidence')
    const approvalRaw = values.get(model.WEBSITE_STORAGE_KEY)
    const exactApproval = await model.mutateWebsiteWorkspace(
      (current) => model.approveWebsiteRevision(current, approvalInput),
      approved.workspace.revision,
      approved.workspace.contentRevision,
      storage,
      locks,
    )
    assert(exactApproval.ok && !exactApproval.changed && values.get(model.WEBSITE_STORAGE_KEY) === approvalRaw, 'website_approval_exact_retry_changed_state')

    const refreshedEvidence = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteEvidence(current, {
        actionId: 'evidence-links-runtime-2',
        capturedAt: at(2100),
        kind: 'links',
        finding: 'Destinations rechecked after approval',
        reference: 'LINK-REVIEW-2',
        verifiedBy: 'OP-OWNER',
      }),
      approved.workspace.revision,
      approved.workspace.contentRevision,
      storage,
      locks,
    )
    assert(refreshedEvidence.ok && model.getCurrentApproval(refreshedEvidence.workspace) === null, 'website_new_evidence_did_not_stale_approval')
    const reapproved = await model.mutateWebsiteWorkspace(
      (current) => model.approveWebsiteRevision(current, {
        actionId: 'approval-runtime-v2-2',
        capturedAt: at(2200),
        reviewer: 'OP-OWNER',
        note: 'Updated destination evidence reviewed and accepted',
      }),
      refreshedEvidence.workspace.revision,
      refreshedEvidence.workspace.contentRevision,
      storage,
      locks,
    )
    const snapshotInput = { actionId: 'local-snapshot-runtime-v2', capturedAt: at(2300) }
    const snapshotted = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteSnapshot(current, snapshotInput),
      reapproved.workspace.revision,
      reapproved.workspace.contentRevision,
      storage,
      locks,
    )
    assert(snapshotted.ok && snapshotted.changed && model.getCurrentPublish(snapshotted.workspace)?.approvalId === model.getCurrentApproval(snapshotted.workspace)?.id, 'website_snapshot_not_bound_to_current_approval')
    const retainedArtifact = model.getCurrentPublish(snapshotted.workspace)?.artifact
    assert(retainedArtifact?.schema === 'supermega.website.artifact.v1' && /^site-[a-f0-9]{8}$/.test(retainedArtifact.contentDigest) && retainedArtifact.pages.length === seed.pages.filter((page) => page.stage === 'ready').length, 'website_approved_artifact_not_retained')
    assert(retainedArtifact && retainedArtifact.pages.every((page) => !('stage' in page) && !('updatedAt' in page) && !('internalName' in page)), 'website_artifact_contains_draft_metadata')
    const firstDownload = exporter.createWebsiteHtmlDownload(retainedArtifact)
    const secondDownload = exporter.createWebsiteHtmlDownload(retainedArtifact)
    assert(JSON.stringify(firstDownload) === JSON.stringify(secondDownload) && firstDownload.filename.endsWith('.html'), 'website_artifact_export_not_deterministic')
    assert(firstDownload.content.includes('Content-Security-Policy') && firstDownload.content.includes('href="#products"') && firstDownload.content.includes('https://supermega.dev/'), 'website_artifact_links_or_security_boundary_missing')
    assert(![fingerprint, approvalInput.actionId, firstInput.actionId, 'OP-OWNER', 'page-home'].some((value) => firstDownload.content.includes(value)), 'website_artifact_export_leaked_governance_metadata')
    const unsafeArtifact = structuredClone(retainedArtifact)
    unsafeArtifact.pages[0].hero.ctaHref = 'javascript:alert(1)'
    assert(exporter.validateWebsiteArtifactForExport(unsafeArtifact).some((issue) => issue.path.endsWith('ctaHref')), 'website_artifact_unsafe_link_not_rejected')
    const snapshotRaw = values.get(model.WEBSITE_STORAGE_KEY)
    const reloadedSnapshot = model.loadWebsiteWorkspace(storage)
    assert(reloadedSnapshot.ok && reloadedSnapshot.workspace.localPublishes[0].artifact?.contentDigest === retainedArtifact.contentDigest, 'website_artifact_not_persistent_after_reload')
    const metadataOnly = JSON.parse(snapshotRaw)
    delete metadataOnly.localPublishes[0].artifact
    const migratedMetadataOnly = model.restoreWorkspace(metadataOnly)
    assert(migratedMetadataOnly?.localPublishes[0].artifact === null && model.getCurrentPublish(migratedMetadataOnly) === null, 'website_metadata_only_snapshot_not_migrated_unavailable')
    const tamperedArtifact = JSON.parse(snapshotRaw)
    tamperedArtifact.localPublishes[0].artifact.pages[0].hero.headline = 'Tampered headline'
    assert(model.restoreWorkspace(tamperedArtifact) === null, 'website_tampered_artifact_was_accepted')
    const exactSnapshot = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteSnapshot(current, snapshotInput),
      snapshotted.workspace.revision,
      snapshotted.workspace.contentRevision,
      storage,
      locks,
    )
    assert(exactSnapshot.ok && !exactSnapshot.changed && values.get(model.WEBSITE_STORAGE_KEY) === snapshotRaw, 'website_snapshot_exact_retry_changed_state')

    const beforeContentRace = snapshotted.workspace
    const [firstContentEdit, staleContentEdit] = await Promise.all([
      model.mutateWebsiteWorkspace(
        (current) => ({ ...current, siteName: 'First tab edit' }),
        beforeContentRace.revision,
        beforeContentRace.contentRevision,
        storage,
        locks,
      ),
      model.mutateWebsiteWorkspace(
        (current) => ({ ...current, siteName: 'Stale tab edit' }),
        beforeContentRace.revision,
        beforeContentRace.contentRevision,
        storage,
        locks,
      ),
    ])
    const afterContentRace = model.loadWebsiteWorkspace(storage)
    assert(firstContentEdit.ok && !staleContentEdit.ok && afterContentRace.ok && afterContentRace.workspace.siteName === 'First tab edit', 'website_stale_content_edit_overwrote_current_state')
    assert(afterContentRace.ok && model.getCurrentApproval(afterContentRace.workspace) === null && model.getCurrentPublish(afterContentRace.workspace) === null, 'website_content_change_did_not_stale_release')

    const beforeFailure = values.get(model.WEBSITE_STORAGE_KEY)
    const failingStorage = { getItem: storage.getItem, setItem: () => { throw new Error('quota') } }
    const failedWrite = await model.mutateWebsiteWorkspace(
      (current) => ({ ...current, siteName: 'Should not persist' }),
      afterContentRace.workspace.revision,
      afterContentRace.workspace.contentRevision,
      failingStorage,
      locks,
    )
    assert(!failedWrite.ok && values.get(model.WEBSITE_STORAGE_KEY) === beforeFailure, 'website_storage_failure_advanced_state')
    const blankEvidence = await model.mutateWebsiteWorkspace(
      (current) => model.recordWebsiteEvidence(current, {
        actionId: 'evidence-blank-runtime',
        capturedAt: at(3000),
        kind: 'content',
        finding: ' ',
        reference: ' ',
        verifiedBy: ' ',
      }),
      afterContentRace.workspace.revision,
      afterContentRace.workspace.contentRevision,
      storage,
      locks,
    )
    assert(!blankEvidence.ok && values.get(model.WEBSITE_STORAGE_KEY) === beforeFailure, 'website_blank_evidence_was_accepted')
    const unlocked = await model.mutateWebsiteWorkspace(
      (current) => ({ ...current, selectedPageId: 'page-products' }),
      afterContentRace.workspace.revision,
      afterContentRace.workspace.contentRevision,
      storage,
      {},
    )
    assert(!unlocked.ok && values.get(model.WEBSITE_STORAGE_KEY) === beforeFailure, 'website_unlocked_write_succeeded')
    assert(lockRequests >= 14, 'website_mutations_did_not_use_web_lock')
  } catch (error) {
    fail(`website_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
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
    let workspace = websiteModel.createInitialWorkspace()
    const at = (offset) => new Date(Date.now() + offset).toISOString()
    const applyWebsite = (update) => {
      const result = websiteModel.applyWebsiteWorkspaceUpdate(workspace, update)
      if (!result.ok) throw new Error(result.error)
      workspace = result.workspace
    }
    for (const [index, kind] of ['content', 'responsive', 'links'].entries()) {
      applyWebsite((current) => websiteModel.recordWebsiteEvidence(current, {
        actionId: `evidence-${kind}`,
        capturedAt: at(-5_000 + index),
        kind,
        finding: `${kind} verified`,
        reference: `REF-${kind.toUpperCase()}`,
        verifiedBy: 'OP-OWNER',
      }))
    }
    applyWebsite((current) => websiteModel.approveWebsiteRevision(current, {
      actionId: 'approval-runtime',
      capturedAt: at(-4_000),
      reviewer: 'OP-OWNER',
      note: 'Approved for runtime contract verification',
    }))
    applyWebsite((current) => websiteModel.recordWebsiteSnapshot(current, {
      actionId: 'local-publish-runtime',
      capturedAt: at(-3_000),
    }))
    const fingerprint = websiteModel.workspaceFingerprint(workspace)
    const currentApproval = websiteModel.getCurrentApproval(workspace)
    const currentPublish = websiteModel.getCurrentPublish(workspace)
    if (!currentApproval || !currentPublish) throw new Error('runtime_website_release_setup_invalid')
    localStorage.setItem(websiteModel.WEBSITE_STORAGE_KEY, JSON.stringify(workspace))

    const pendingHandoff = handoffContract.createWebsiteEcommerceHandoff({
      fingerprint,
      approvalId: currentApproval.id,
      localPublishId: currentPublish.id,
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
    assert(completed.order.idempotencyKey === drafted.draft.id && completed.order.source.websiteEvidenceReference === currentPublish.id, 'runtime_source_identity_invalid')
    assert(JSON.stringify(completed.order.lines) === JSON.stringify(drafted.draft.lines) && completed.order.totalMmk === drafted.draft.totalMmk, 'runtime_price_snapshot_changed')
    const v3Raw = localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY)
    const exactRetry = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, input)
    assert(exactRetry?.order?.id === completed.order.id && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === v3Raw && exactRetry.audit.length === 2, 'runtime_exact_retry_not_idempotent')
    const conflictingRetry = await handoffContract.completeWebsiteOrderDraft(drafted.draft.id, { ...input, paymentMethod: 'manual_bank_transfer' })
    assert(conflictingRetry === null && localStorage.getItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY) === v3Raw, 'runtime_conflicting_retry_overwrote_record')
    assert(lockRequests === 3, 'runtime_completion_lock_missing')

    localStorage.setItem(handoffContract.WEBSITE_ECOMMERCE_HANDOFF_KEY, v2Raw)
    const changedSource = websiteModel.applyWebsiteWorkspaceUpdate(workspace, (current) => ({ ...current, siteName: 'Changed Website source' }))
    if (!changedSource.ok) throw new Error(changedSource.error)
    localStorage.setItem(websiteModel.WEBSITE_STORAGE_KEY, JSON.stringify(changedSource.workspace))
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
    removeItem: (key) => values.delete(key),
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
    assert(migrated.orders[0].paymentStatus === 'pending'
      && migrated.orders[0].refundStatus === 'none'
      && migrated.orders[0].refundSettlementActionId === undefined
      && migrated.orders[0].refundSettledAt === undefined
      && migrated.movements.length === 0, 'migration_invented_payment_refund_or_movement_history')
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
    const countedLegacyLedger = model.countCommerceStock(ledger501, 'SKU-1', 10, proof('ACT-LEGACY-COUNT'))
    assert(countedLegacyLedger?.movements.length === 502
      && countedLegacyLedger.movements[0].quantityDelta === 0
      && model.validateCommerceState(countedLegacyLedger) === countedLegacyLedger,
    'legacy_no_count_history_could_not_accept_new_count_anchor')
    assertThrows(() => model.validateCommerceState({ ...ledger501, items: [...ledger501.items, ledger501.items[0]] }), 'duplicate_sku_was_accepted')
    assertThrows(() => model.validateCommerceState({ ...ledger501, movements: [...ledger501.movements, ledger501.movements[0]] }), 'duplicate_movement_was_accepted')

    const base = {
      ...model.createEmptyCommerce(),
      items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
    }
    const baseCatalogDigest = await model.commerceCatalogDigest(base)
    const configurationProof = {
      actionId: model.commerceStorefrontConfigurationActionId(1, baseCatalogDigest),
      capturedAt: '2026-07-23T08:59:00.000Z',
      actor: 'OP-OWNER',
      reason: 'Save the current storefront before retaining a request.',
      evidenceReference: `ECOMMERCE-STOREFRONT:${baseCatalogDigest}:R1`,
    }
    const configuredBase = await model.saveCommerceStorefrontConfiguration(base, {
      storeName: 'Mingalar Shop',
      summary: 'Clear prices and a small customer-ready catalog.',
      selectedSkus: ['SKU-1'],
      shopCatalogDigest: baseCatalogDigest,
    }, configurationProof)
    assert(configuredBase?.storefrontConfiguration?.revision === 1, 'storefront_request_configuration_fixture_failed')
    const configuredPreviewDigest = await model.commerceStorefrontPreviewDigest(configuredBase)
    assert(configuredPreviewDigest === 'sha256:5708a10fcffa1df487bd93f88809e1cfb678f92888cdf6f22a7deabbaf24c34d', 'storefront_preview_cross_runtime_digest_drifted')
    const unicodePreviewBase = {
      ...model.createEmptyCommerce(),
      items: [
        { sku: 'SM-😀', name: 'Emoji item', onHand: 4, reorderAt: 1, price: 400 },
        { sku: 'SM-A', name: 'မြန်မာ လက်ဖက်ရည်', variant: 'သေး', onHand: 0, reorderAt: 1, price: 100 },
      ],
    }
    const unicodeCatalogDigest = await model.commerceCatalogDigest(unicodePreviewBase)
    const unicodeConfigurationProof = {
      actionId: model.commerceStorefrontConfigurationActionId(1, unicodeCatalogDigest),
      capturedAt: '2026-07-23T08:59:00.000Z',
      actor: 'OP-OWNER',
      reason: 'Save the Unicode storefront digest vector.',
      evidenceReference: `ECOMMERCE-STOREFRONT:${unicodeCatalogDigest}:R1`,
    }
    const unicodeConfigured = await model.saveCommerceStorefrontConfiguration(unicodePreviewBase, {
      storeName: 'မင်္ဂလာ ဆိုင်',
      summary: 'ရွေးထားသော ပစ္စည်းများ။',
      selectedSkus: ['SM-A', 'SM-😀'],
      shopCatalogDigest: unicodeCatalogDigest,
    }, unicodeConfigurationProof)
    assert(unicodeConfigured
      && await model.commerceStorefrontPreviewDigest(unicodeConfigured) === 'sha256:a755c68b02a8de75279f0bcda5bb8ed21078ee538a68f583eeb223ee8a43973c',
    'storefront_preview_unicode_cross_runtime_digest_drifted')
    const storefrontRequestUuid = '00000000-0000-4000-8000-000000000010'
    const storefrontRequest = {
      schema: 'supermega.ecommerce.order_request.v1',
      mode: 'browser-local-request',
      state: 'pending_shop_review',
      id: `ECR-${storefrontRequestUuid}`,
      idempotencyKey: `ECI-${storefrontRequestUuid}`,
      createdAt: '2026-07-23T09:00:00.000Z',
      sourcePreviewDigest: configuredPreviewDigest,
      sourceStorefrontRevision: configuredBase.storefrontConfiguration.revision,
      sourceStorefrontActionId: configuredBase.storefrontConfiguration.saved.actionId,
      customerReference: 'Customer A',
      fulfilment: 'pickup',
      currency: 'MMK',
      line: { sku: 'SKU-1', name: 'Test item', variant: null, quantity: 2, unitPriceMmk: 100 },
      totalMmk: 200,
    }
    const storefrontProof = proof(`ACT-${storefrontRequestUuid}`, 0, {
      evidenceReference: `ECOMMERCE:${storefrontRequest.id}:${storefrontRequest.sourcePreviewDigest}`,
    })
    const withStorefrontRequest = await model.recordCommerceStorefrontRequest(configuredBase, storefrontRequest, storefrontProof)
    assert(withStorefrontRequest?.storefrontRequests?.length === 1, 'storefront_request_not_retained')
    assert(withStorefrontRequest.items === configuredBase.items
      && withStorefrontRequest.orders === configuredBase.orders
      && withStorefrontRequest.movements === configuredBase.movements
      && withStorefrontRequest.closes === configuredBase.closes
      && JSON.stringify(withStorefrontRequest.storefrontConfiguration) === JSON.stringify(configuredBase.storefrontConfiguration),
    'storefront_request_changed_shop_ledgers')
    assert(await model.recordCommerceStorefrontRequest(withStorefrontRequest, storefrontRequest, storefrontProof) === withStorefrontRequest, 'storefront_request_retry_not_idempotent')
    const reorderedStorefrontRequest = {
      totalMmk: storefrontRequest.totalMmk,
      line: {
        unitPriceMmk: storefrontRequest.line.unitPriceMmk,
        quantity: storefrontRequest.line.quantity,
        variant: storefrontRequest.line.variant,
        name: storefrontRequest.line.name,
        sku: storefrontRequest.line.sku,
      },
      currency: storefrontRequest.currency,
      fulfilment: storefrontRequest.fulfilment,
      customerReference: storefrontRequest.customerReference,
      sourceStorefrontActionId: storefrontRequest.sourceStorefrontActionId,
      sourceStorefrontRevision: storefrontRequest.sourceStorefrontRevision,
      sourcePreviewDigest: storefrontRequest.sourcePreviewDigest,
      createdAt: storefrontRequest.createdAt,
      idempotencyKey: storefrontRequest.idempotencyKey,
      id: storefrontRequest.id,
      state: storefrontRequest.state,
      mode: storefrontRequest.mode,
      schema: storefrontRequest.schema,
    }
    assert(await model.recordCommerceStorefrontRequest(withStorefrontRequest, reorderedStorefrontRequest, storefrontProof) === withStorefrontRequest, 'storefront_request_reordered_retry_not_idempotent')
    assert(await model.recordCommerceStorefrontRequest(withStorefrontRequest, {
      ...storefrontRequest,
      customerReference: 'Changed',
    }, storefrontProof) === null, 'storefront_request_identity_conflict_succeeded')
    assert(await model.recordCommerceStorefrontRequest(base, storefrontRequest, {
      ...storefrontProof,
      evidenceReference: 'ECOMMERCE:wrong',
    }) === null, 'storefront_request_wrong_evidence_succeeded')
    assert(await model.recordCommerceStorefrontRequest(base, storefrontRequest, storefrontProof) === null, 'storefront_request_without_saved_storefront_succeeded')
    const legacyStorefrontRequest = { ...storefrontRequest }
    delete legacyStorefrontRequest.sourceStorefrontRevision
    delete legacyStorefrontRequest.sourceStorefrontActionId
    const legacyStorefrontInbox = model.validateCommerceState({
      ...base,
      storefrontRequests: [legacyStorefrontRequest],
    })
    const legacyStockReceipt = model.receiveCommerceStock(
      legacyStorefrontInbox,
      'SKU-1',
      1,
      proof('ACT-LEGACY-STOREFRONT-STOCK'),
    )
    assert(legacyStockReceipt
      && !('sourceStorefrontRevision' in legacyStockReceipt.storefrontRequests[0])
      && legacyStockReceipt.storefrontRequests[0].id === legacyStorefrontRequest.id,
    'legacy_storefront_request_without_provenance_became_unreadable')
    assertThrows(() => model.validateCommerceState({
      ...base,
      storefrontRequests: [{ ...legacyStorefrontRequest, sourceStorefrontRevision: null }],
    }), 'partial_legacy_storefront_provenance_succeeded')
    assert(await model.recordCommerceStorefrontRequest(configuredBase, {
      ...storefrontRequest,
      sourceStorefrontRevision: null,
      sourceStorefrontActionId: null,
    }, storefrontProof) === null, 'storefront_request_without_revision_provenance_succeeded')
    const preSaveStorefrontRequest = {
      ...storefrontRequest,
      createdAt: '2026-07-23T08:58:59.000Z',
    }
    const preSaveStorefrontProof = {
      ...storefrontProof,
      capturedAt: preSaveStorefrontRequest.createdAt,
    }
    assert(await model.recordCommerceStorefrontRequest(configuredBase, preSaveStorefrontRequest, preSaveStorefrontProof) === null, 'storefront_request_before_configuration_save_succeeded')
    const unboundStorefrontRequest = {
      ...storefrontRequest,
      sourcePreviewDigest: `sha256:${'b'.repeat(64)}`,
    }
    const unboundStorefrontProof = {
      ...storefrontProof,
      evidenceReference: `ECOMMERCE:${unboundStorefrontRequest.id}:${unboundStorefrontRequest.sourcePreviewDigest}`,
    }
    assert(await model.recordCommerceStorefrontRequest(configuredBase, unboundStorefrontRequest, unboundStorefrontProof) === null, 'storefront_request_unbound_preview_digest_succeeded')
    const staleConfiguredBase = model.validateCommerceState({
      ...configuredBase,
      items: [
        ...configuredBase.items,
        { sku: 'SKU-2', name: 'Second item', onHand: 2, reorderAt: 1, price: 50 },
      ],
    })
    assert(await model.recordCommerceStorefrontRequest(staleConfiguredBase, storefrontRequest, storefrontProof) === null, 'storefront_request_stale_catalog_configuration_succeeded')
    const twoItemBase = model.validateCommerceState({
      ...base,
      items: [
        ...base.items,
        { sku: 'SKU-2', name: 'Second item', onHand: 2, reorderAt: 1, price: 50 },
      ],
    })
    const twoItemCatalogDigest = await model.commerceCatalogDigest(twoItemBase)
    const twoItemConfigurationProof = {
      ...configurationProof,
      actionId: model.commerceStorefrontConfigurationActionId(1, twoItemCatalogDigest),
      evidenceReference: `ECOMMERCE-STOREFRONT:${twoItemCatalogDigest}:R1`,
    }
    const configuredTwoItemBase = await model.saveCommerceStorefrontConfiguration(twoItemBase, {
      storeName: 'Mingalar Shop',
      summary: 'Clear prices and a small customer-ready catalog.',
      selectedSkus: ['SKU-1'],
      shopCatalogDigest: twoItemCatalogDigest,
    }, twoItemConfigurationProof)
    assert(configuredTwoItemBase, 'storefront_request_selection_fixture_failed')
    const excludedStorefrontRequest = {
      ...storefrontRequest,
      sourceStorefrontRevision: configuredTwoItemBase.storefrontConfiguration.revision,
      sourceStorefrontActionId: configuredTwoItemBase.storefrontConfiguration.saved.actionId,
      line: { ...storefrontRequest.line, sku: 'SKU-2', name: 'Second item', unitPriceMmk: 50 },
      totalMmk: 100,
    }
    assert(await model.recordCommerceStorefrontRequest(configuredTwoItemBase, excludedStorefrontRequest, storefrontProof) === null, 'storefront_request_excluded_sku_succeeded')
    const soldOutConfiguredBase = model.validateCommerceState({
      ...configuredBase,
      items: configuredBase.items.map((item) => ({ ...item, onHand: 0 })),
    })
    const soldOutPreviewDigest = await model.commerceStorefrontPreviewDigest(soldOutConfiguredBase)
    const soldOutStorefrontRequest = {
      ...storefrontRequest,
      sourcePreviewDigest: soldOutPreviewDigest,
    }
    const soldOutStorefrontProof = {
      ...storefrontProof,
      evidenceReference: `ECOMMERCE:${soldOutStorefrontRequest.id}:${soldOutStorefrontRequest.sourcePreviewDigest}`,
    }
    assert(await model.recordCommerceStorefrontRequest(soldOutConfiguredBase, soldOutStorefrontRequest, soldOutStorefrontProof) === null, 'storefront_request_sold_out_sku_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...withStorefrontRequest,
      storefrontRequests: [storefrontRequest, storefrontRequest],
    }), 'duplicate_storefront_request_succeeded')
    const storefrontActionCollision = model.receiveCommerceStock(base, 'SKU-1', 1, storefrontProof)
    assert(storefrontActionCollision, 'storefront_action_collision_fixture_failed')
    assertThrows(() => model.validateCommerceState({
      ...storefrontActionCollision,
      storefrontRequests: [storefrontRequest],
    }), 'storefront_action_collision_succeeded')
    const fullStorefrontInbox = model.validateCommerceState({
      ...base,
      storefrontRequests: Array.from({ length: 100 }, (_, index) => {
        const requestUuid = `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`
        return { ...storefrontRequest, id: `ECR-${requestUuid}`, idempotencyKey: `ECI-${requestUuid}` }
      }),
    })
    assert(await model.recordCommerceStorefrontRequest(fullStorefrontInbox, storefrontRequest, storefrontProof) === null, 'full_storefront_request_inbox_accepted')
    assertThrows(() => model.validateCommerceState({
      ...fullStorefrontInbox,
      storefrontRequests: [...fullStorefrontInbox.storefrontRequests, storefrontRequest],
    }), 'oversized_storefront_request_inbox_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...base,
      closes: [{ id: 'CLOSE-NO-ZONE', createdAt: '2026-07-23T09:00:00', total: 0, orders: 0 }],
    }), 'timezone_less_commerce_timestamp_succeeded')
    const websiteSource = {
      fingerprint: 'web-1234abcd',
      approvalId: 'approval-1',
      snapshotId: 'snapshot-1',
      pageId: 'page-products',
      siteName: 'Test Website',
      pagePath: '/products',
    }
    const intakeProof = proof('ACT-WEBSITE-INTAKE')
    const intake = model.createCommerceWebsiteIntake(base, {
      id: 'WINT-12345678',
      source: websiteSource,
      sku: 'SKU-1',
      quantity: 2,
    }, intakeProof)
    assert(intake?.websiteIntakes?.length === 1 && intake.websiteIntakes[0].status === 'pending_confirmation', 'managed_website_intake_not_recorded')
    assert(intake.websiteIntakes[0].snapshotDigest === 'sha256:58c85cb3640d6e4510551181009bd0cbae46f5f51a6db6c7b0f6485d76e4933d', 'managed_website_snapshot_digest_drifted')
    assert(intake.items[0].onHand === 10 && intake.orders.length === 0 && intake.movements.length === 0, 'managed_website_intake_moved_stock_or_created_order')
    assert(model.createCommerceWebsiteIntake(intake, {
      id: 'WINT-OTHER123',
      source: websiteSource,
      sku: 'SKU-1',
      quantity: 2,
    }, proof('ACT-WEBSITE-RETRY')) === intake, 'managed_website_source_retry_not_idempotent')
    assert(model.createCommerceWebsiteIntake(intake, {
      id: 'WINT-CONFLICT1',
      source: websiteSource,
      sku: 'SKU-1',
      quantity: 3,
    }, proof('ACT-WEBSITE-CONFLICT')) === null, 'managed_website_source_conflict_succeeded')
    const conversionProof = proof('ACT-WEBSITE-CONVERT', 1_000)
    const conversionPromisedAt = '2026-07-23T11:00:00.000Z'
    const convertedIntake = model.convertCommerceWebsiteIntake(intake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionPromisedAt,
    }, conversionProof)
    assert(convertedIntake?.websiteIntakes?.[0].status === 'converted' && convertedIntake.websiteIntakes[0].conversion.orderId === 'ORD-WEB-12345678', 'managed_website_intake_not_converted')
    assert(convertedIntake.items[0].onHand === 8
      && convertedIntake.orders[0].sourceRecordId === 'WINT-12345678'
      && convertedIntake.orders[0].promisedAt === conversionPromisedAt
      && convertedIntake.movements[0].quantityDelta === -2,
    'managed_website_conversion_not_atomic')
    assertThrows(() => model.validateCommerceState({
      ...convertedIntake,
      movements: [{ ...convertedIntake.movements[0], actor: 'spoofed-actor' }, ...convertedIntake.movements.slice(1)],
    }), 'managed_website_conversion_reservation_proof_mismatch_succeeded')
    assert(model.convertCommerceWebsiteIntake(convertedIntake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionPromisedAt,
    }, conversionProof) === convertedIntake, 'managed_website_conversion_retry_not_idempotent')
    assert(model.convertCommerceWebsiteIntake(intake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionPromisedAt,
    }, { ...conversionProof, actionId: intakeProof.actionId }) === null, 'managed_website_action_id_reuse_succeeded')
    assert(model.convertCommerceWebsiteIntake(intake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionProof.capturedAt,
    }, conversionProof) === null, 'managed_website_stale_promise_succeeded')
    const legacyUnboundIntake = model.validateCommerceState({
      ...intake,
      websiteIntakes: [{ ...intake.websiteIntakes[0], snapshotDigest: undefined }],
    })
    assert(model.convertCommerceWebsiteIntake(legacyUnboundIntake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionPromisedAt,
    }, conversionProof) === null, 'legacy_unbound_website_intake_converted')

    const catalogUpdate = {
      sku: 'SKU-1',
      expectedPrice: 100,
      nextPrice: 125,
      expectedReorderAt: 2,
      nextReorderAt: 3,
    }
    const catalogUpdateProof = proof('ACT-ITEM-UPDATE', 2_000)
    const updatedCatalog = model.updateCommerceItem(intake, catalogUpdate, catalogUpdateProof)
    assert(updatedCatalog?.items[0].price === 125
      && updatedCatalog.items[0].reorderAt === 3
      && updatedCatalog.items[0].onHand === 10
      && updatedCatalog.catalogBaselines?.[0].anchorDigest === 'sha256:fe1d49f917797c9b6f35354c7787c21dffee2746d82a7a16c7ed19b1e0dbb35e'
      && updatedCatalog.catalogChanges?.[0].proof.actionId === catalogUpdateProof.actionId,
    'catalog_item_update_not_recorded_exactly')
    assert(updatedCatalog.orders === intake.orders
      && updatedCatalog.movements === intake.movements
      && updatedCatalog.closes === intake.closes
      && updatedCatalog.websiteIntakes === intake.websiteIntakes
      && updatedCatalog.websiteIntakes[0].unitPrice === 100,
    'catalog_item_update_rewrote_operating_history')
    assert(model.updateCommerceItem(updatedCatalog, catalogUpdate, catalogUpdateProof) === updatedCatalog, 'catalog_item_update_retry_not_idempotent')
    const reorderedCatalogUpdate = model.validateCommerceState({
      ...updatedCatalog,
      catalogChanges: [{
        proof: { ...updatedCatalog.catalogChanges[0].proof },
        nextReorderAt: updatedCatalog.catalogChanges[0].nextReorderAt,
        previousReorderAt: updatedCatalog.catalogChanges[0].previousReorderAt,
        nextPrice: updatedCatalog.catalogChanges[0].nextPrice,
        previousPrice: updatedCatalog.catalogChanges[0].previousPrice,
        sku: updatedCatalog.catalogChanges[0].sku,
      }],
    })
    assert(model.updateCommerceItem(reorderedCatalogUpdate, catalogUpdate, catalogUpdateProof) === reorderedCatalogUpdate, 'catalog_item_update_reordered_retry_not_idempotent')
    assert(model.updateCommerceItem(updatedCatalog, { ...catalogUpdate, nextPrice: 126 }, catalogUpdateProof) === null, 'catalog_item_update_conflicting_retry_succeeded')
    assert(model.updateCommerceItem(updatedCatalog, { ...catalogUpdate, nextPrice: 130 }, proof('ACT-ITEM-UPDATE-STALE', 3_000)) === null, 'catalog_item_update_stale_review_succeeded')
    assert(model.updateCommerceItem(intake, catalogUpdate, intakeProof) === null, 'catalog_item_update_reused_action_succeeded')
    assert(model.convertCommerceWebsiteIntake(updatedCatalog, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
      promisedAt: conversionPromisedAt,
    }, conversionProof) === null, 'stale_website_intake_converted_after_catalog_update')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalog,
      websiteIntakes: [{
        ...updatedCatalog.websiteIntakes[0],
        unitPrice: 125,
        total: 250,
      }],
    }), 'rewritten_stale_website_snapshot_bypassed_digest')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalog,
      catalogChanges: [{
        ...updatedCatalog.catalogChanges[0],
        previousPrice: 99,
      }],
    }), 'catalog_opening_value_not_anchored')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalog,
      catalogBaselines: [{
        ...updatedCatalog.catalogBaselines[0],
        price: 99,
      }],
    }), 'catalog_baseline_digest_not_enforced')
    const secondCatalogUpdateProof = proof('ACT-ITEM-UPDATE-2', 3_000)
    const updatedCatalogAgain = model.updateCommerceItem(updatedCatalog, {
      sku: 'SKU-1',
      expectedPrice: 125,
      nextPrice: 130,
      expectedReorderAt: 3,
      nextReorderAt: 4,
    }, secondCatalogUpdateProof)
    assert(updatedCatalogAgain?.catalogChanges?.length === 2
      && updatedCatalogAgain.catalogChanges[0].previousPrice === updatedCatalog.catalogChanges[0].nextPrice,
    'catalog_item_update_history_not_chained')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalogAgain,
      catalogChanges: [
        updatedCatalogAgain.catalogChanges[0],
        { ...updatedCatalogAgain.catalogChanges[1], nextPrice: 126 },
      ],
    }), 'catalog_item_update_broken_chain_loaded')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalog,
      catalogChanges: [{ ...updatedCatalog.catalogChanges[0], proof: { ...catalogUpdateProof, unexpected: true } }],
    }), 'catalog_item_update_extra_proof_field_loaded')
    assertThrows(() => model.validateCommerceState({
      ...updatedCatalog,
      catalogChanges: Array.from({ length: 501 }, () => updatedCatalog.catalogChanges[0]),
    }), 'catalog_item_update_history_cap_not_enforced')
    const updatedConfiguredCatalog = model.updateCommerceItem(configuredBase, catalogUpdate, catalogUpdateProof)
    assert(updatedConfiguredCatalog
      && await model.commerceCatalogDigest(updatedConfiguredCatalog) !== configuredBase.storefrontConfiguration.shopCatalogDigest
      && await model.recordCommerceStorefrontRequest(updatedConfiguredCatalog, storefrontRequest, storefrontProof) === null,
    'catalog_item_update_did_not_stale_saved_storefront')

    const newItem = { sku: 'SKU-2', name: 'Second item', onHand: 0, reorderAt: 3, price: 250 }
    const openingProof = proof('ACT-ITEM-CREATE')
    const withItem = model.registerCommerceItem(base, newItem, openingProof)
    assert(withItem?.items[0].sku === newItem.sku
      && withItem.movements[0].kind === 'opening'
      && withItem.movements[0].quantityDelta === 0
      && withItem.catalogBaselines[0].sku === newItem.sku,
    'catalog_item_opening_not_recorded')
    assert(model.registerCommerceItem(withItem, newItem, openingProof) === withItem, 'catalog_item_retry_not_idempotent')
    assert(model.registerCommerceItem(withItem, { ...newItem, price: 251 }, openingProof) === null, 'catalog_item_conflicting_retry_succeeded')
    assert(model.registerCommerceItem(withItem, newItem, proof('ACT-ITEM-DUPLICATE')) === null, 'duplicate_catalog_sku_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...base,
      items: [{ ...base.items[0], name: ' Test item ' }],
    }), 'noncanonical_catalog_item_loaded_as_writable')
    assert(model.registerCommerceItem(base, {
      ...newItem,
      sku: 'SKU-LONG-NAME',
      name: 'x'.repeat(181),
    }, proof('ACT-ITEM-LONG-NAME')) === null, 'oversized_catalog_item_was_registered')
    const reserveProof = proof('ACT-RESERVE')
    const order = {
      id: 'ORD-1',
      createdAt: '2026-07-23T09:00:00.000Z',
      customer: 'Customer',
      owner: reserveProof.actor,
      channel: 'Website',
      item: 'Test item',
      itemSku: 'SKU-1',
      quantity: 2,
      payment: 'Manual QR review',
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: 'PICKUP-001',
      promisedAt: '2026-07-23T11:00:00.000Z',
      sourceRecordId: 'WEB-1',
      evidenceReference: reserveProof.evidenceReference,
      total: 200,
      status: 'confirmed',
    }
    const reserved = model.reserveCommerceOrder(base, order, reserveProof)
    assert(reserved?.items[0].onHand === 8 && reserved.orders.length === 1 && reserved.movements.length === 1, 'reservation_did_not_apply_once')
    assert(model.commerceOrderPromiseUrgency(order, Date.parse('2026-07-23T09:59:59.999Z')) === 'scheduled', 'order_promise_more_than_one_hour_away_not_scheduled')
    assert(model.commerceOrderPromiseUrgency(order, Date.parse('2026-07-23T10:00:00.000Z')) === 'due_soon', 'order_promise_one_hour_boundary_not_due_soon')
    assert(model.commerceOrderPromiseUrgency(order, Date.parse(order.promisedAt)) === 'late', 'order_promise_at_deadline_not_late')
    assert(model.commerceOrderPromiseUrgency({ ...order, promisedAt: undefined }, Date.parse(order.createdAt)) === 'unrecorded', 'order_without_promise_not_marked_unrecorded')
    assert(model.commerceOrderPromiseUrgency(order, Number.NaN) === 'unrecorded', 'order_promise_invalid_clock_not_fail_closed')
    const legacyPromiselessOrder = { ...reserved.orders[0] }
    delete legacyPromiselessOrder.promisedAt
    assert(model.validateCommerceState({ ...reserved, orders: [legacyPromiselessOrder] }).orders[0].promisedAt === undefined, 'legacy_order_without_promise_not_readable')
    const legacyUnownedOrder = { ...reserved.orders[0] }
    delete legacyUnownedOrder.owner
    assert(model.validateCommerceState({ ...reserved, orders: [legacyUnownedOrder] }).orders[0].owner === undefined, 'legacy_order_without_owner_not_readable')
    assertThrows(() => model.validateCommerceState({
      ...reserved,
      orders: [{ ...reserved.orders[0], promisedAt: reserved.orders[0].createdAt }],
    }), 'backdated_order_promise_loaded')
    assertThrows(() => model.validateCommerceState({
      ...reserved,
      orders: [{ ...reserved.orders[0], owner: 'Different operator' }],
    }), 'order_owner_history_rewrite_loaded')
    assert(model.reserveCommerceOrder(base, { ...order, owner: undefined }, reserveProof) === null, 'new_order_without_owner_succeeded')
    assert(model.reserveCommerceOrder(base, { ...order, owner: 'Different operator' }, reserveProof) === null, 'new_order_owner_mismatched_confirmation_actor')
    assert(model.reserveCommerceOrder(base, { ...order, fulfilment: undefined }, reserveProof) === null, 'order_without_fulfilment_succeeded')
    assert(model.reserveCommerceOrder(base, { ...order, fulfilmentReference: '' }, reserveProof) === null, 'order_without_fulfilment_reference_succeeded')
    assert(model.reserveCommerceOrder(base, { ...order, promisedAt: undefined }, reserveProof) === null, 'order_without_promised_time_succeeded')
    assert(model.reserveCommerceOrder(base, { ...order, promisedAt: reserveProof.capturedAt }, reserveProof) === null, 'order_with_stale_promised_time_succeeded')
    assert(model.reserveCommerceOrder(reserved, order, reserveProof) === reserved, 'exact_reservation_retry_not_idempotent')
    assert(model.reserveCommerceOrder(reserved, { ...order, quantity: 3, total: 300 }, reserveProof) === null, 'conflicting_reservation_retry_succeeded')
    assert(model.reserveCommerceOrder(reserved, { ...order, id: 'ORD-2' }, proof('ACT-RESERVE-2')) === null, 'duplicate_source_order_succeeded')

    const countDownProof = proof('ACT-COUNT-DOWN', 1_000)
    const countedReserved = model.countCommerceStock(reserved, 'SKU-1', 7, countDownProof)
    assert(countedReserved
      && countedReserved.items[0].onHand === 7
      && countedReserved.movements[0].kind === 'count'
      && countedReserved.movements[0].expectedQuantity === 8
      && countedReserved.movements[0].countedQuantity === 7
      && countedReserved.movements[0].quantityDelta === -1,
    'stock_count_did_not_use_available_unallocated_balance')
    assert(countedReserved.orders === reserved.orders
      && countedReserved.purchaseOrders === reserved.purchaseOrders
      && countedReserved.closes === reserved.closes
      && countedReserved.websiteIntakes === reserved.websiteIntakes,
    'stock_count_changed_unrelated_ledgers')
    assert(model.countCommerceStock(countedReserved, 'SKU-1', 7, countDownProof) === countedReserved, 'stock_count_exact_retry_not_idempotent')
    assert(model.countCommerceStock(countedReserved, 'SKU-1', 8, countDownProof) === null, 'stock_count_changed_quantity_retry_succeeded')
    for (const [label, patch] of [
      ['time', { capturedAt: '2026-07-23T09:00:02.000Z' }],
      ['actor', { actor: 'OTHER' }],
      ['reason', { reason: 'Changed reason.' }],
      ['evidence', { evidenceReference: 'EV-CHANGED' }],
    ]) {
      assert(model.countCommerceStock(countedReserved, 'SKU-1', 7, { ...countDownProof, ...patch }) === null, `stock_count_changed_${label}_proof_succeeded`)
    }
    assert(model.countCommerceStock(reserved, 'UNKNOWN', 7, proof('ACT-COUNT-UNKNOWN')) === null, 'stock_count_unknown_sku_succeeded')
    assert(model.countCommerceStock(reserved, 'SKU-1', -1, proof('ACT-COUNT-NEGATIVE')) === null, 'stock_count_negative_succeeded')
    assert(model.countCommerceStock(reserved, 'SKU-1', 1.5, proof('ACT-COUNT-DECIMAL')) === null, 'stock_count_decimal_succeeded')
    assert(model.countCommerceStock(reserved, 'SKU-1', Number.MAX_SAFE_INTEGER + 1, proof('ACT-COUNT-OVERFLOW')) === null, 'stock_count_overflow_succeeded')
    assert(model.countCommerceStock(reserved, 'SKU-1', 7, reserveProof) === null, 'stock_count_reused_reservation_action_succeeded')
    const countMatched = model.countCommerceStock(countedReserved, 'SKU-1', 7, proof('ACT-COUNT-MATCH', 2_000))
    assert(countMatched
      && countMatched.items[0].onHand === 7
      && countMatched.movements[0].quantityDelta === 0,
    'zero_variance_stock_count_was_not_recorded')
    const countRaised = model.countCommerceStock(countMatched, 'SKU-1', 12, proof('ACT-COUNT-UP', 3_000))
    assert(countRaised
      && countRaised.items[0].onHand === 12
      && countRaised.movements[0].expectedQuantity === 7
      && countRaised.movements[0].quantityDelta === 5,
    'positive_variance_stock_count_was_not_recorded')
    assertThrows(() => model.validateCommerceState({
      ...countedReserved,
      movements: [{ ...countedReserved.movements[0], countedQuantity: 8 }, ...countedReserved.movements.slice(1)],
    }), 'stock_count_history_tamper_succeeded')
    assert(model.countCommerceStock(reserved, 'SKU-1', 7, {
      ...proof('ACT-COUNT-UNICODE'),
      capturedAt: '٢٠٢٦-07-23T09:00:00.000Z',
    }) === null, 'stock_count_unicode_digit_timestamp_succeeded')
    const cancelledAfterCount = model.cancelCommerceOrder(countedReserved, order.id, proof('ACT-CANCEL-AFTER-COUNT', 2_000))
    const receivedAfterCount = model.receiveCommerceStock(cancelledAfterCount, 'SKU-1', 3, proof('ACT-RECEIPT-AFTER-COUNT', 3_000))
    const recountedHistory = model.countCommerceStock(receivedAfterCount, 'SKU-1', 11, proof('ACT-RECOUNT-HISTORY', 4_000))
    assert(recountedHistory
      && recountedHistory.items[0].onHand === 11
      && model.validateCommerceState(recountedHistory) === recountedHistory,
    'count_reserve_release_receipt_history_did_not_reconstruct')

    const multiBase = {
      ...base,
      items: [
        base.items[0],
        { sku: 'SKU-2', name: 'Second item', variant: 'Large', onHand: 5, reorderAt: 1, price: 250 },
      ],
    }
    const multiProof = proof('ACT-MULTI-RESERVE')
    const multiOrder = {
      id: 'ORD-MULTI',
      createdAt: multiProof.capturedAt,
      customer: 'Counter A',
      owner: multiProof.actor,
      channel: 'Walk-in',
      item: '2 items',
      quantity: 3,
      payment: 'Cash',
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: 'COUNTER-A',
      promisedAt: '2026-07-23T11:00:00.000Z',
      lines: [
        { sku: 'SKU-1', name: 'Test item', quantity: 2, unitPriceMmk: 100 },
        { sku: 'SKU-2', name: 'Second item', variant: 'Large', quantity: 1, unitPriceMmk: 250 },
      ],
      total: 450,
      status: 'confirmed',
    }
    const multiReserved = model.reserveCommerceOrder(multiBase, multiOrder, multiProof)
    assert(multiReserved?.items[0].onHand === 8
      && multiReserved.items[1].onHand === 4
      && multiReserved.movements.length === 2
      && multiReserved.movements.every((movement) => movement.actionId === multiProof.actionId)
      && multiReserved.movements.map((movement) => movement.id).join('|') === 'MOV2:ACT-MULTI-RESERVE:L1|MOV2:ACT-MULTI-RESERVE:L2',
    'multi_line_reservation_not_atomic')
    assert(model.reserveCommerceOrder(multiReserved, multiOrder, multiProof) === multiReserved, 'multi_line_reservation_retry_not_idempotent')
    assert(model.reserveCommerceOrder(multiReserved, {
      ...multiOrder,
      total: 451,
      lines: [multiOrder.lines[0], { ...multiOrder.lines[1], unitPriceMmk: 251 }],
    }, multiProof) === null, 'multi_line_conflicting_price_retry_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...multiReserved,
      movements: [
        multiReserved.movements[0],
        { ...multiReserved.movements[1], id: 'MOV2:ACT-SPLIT:L2', actionId: 'ACT-SPLIT' },
      ],
    }), 'multi_line_split_reservation_action_succeeded')
    const collisionProof = proof('ACT-MULTI-RESERVE-L1', 1_000)
    const collisionReserved = model.reserveCommerceOrder(multiReserved, {
      ...multiOrder,
      id: 'ORD-COLLISION',
      createdAt: collisionProof.capturedAt,
      item: 'Second item',
      itemSku: 'SKU-2',
      quantity: 1,
      lines: [{ ...multiOrder.lines[1], quantity: 1 }],
      total: 250,
    }, collisionProof)
    assert(collisionReserved
      && new Set(collisionReserved.movements.map((movement) => movement.id)).size === collisionReserved.movements.length,
    'multi_line_movement_id_collided_with_single_line_action')
    const repricedMulti = model.validateCommerceState({
      ...multiReserved,
      items: multiReserved.items.map((item) => item.sku === 'SKU-1' ? { ...item, price: 125 } : item),
    })
    assert(repricedMulti.orders[0].lines[0].unitPriceMmk === 100, 'multi_line_price_snapshot_followed_catalog_change')
    const multiCancelProof = proof('ACT-MULTI-CANCEL', 2_000)
    const multiCancelled = model.cancelCommerceOrder(multiReserved, multiOrder.id, multiCancelProof)
    assert(multiCancelled?.items[0].onHand === 10
      && multiCancelled.items[1].onHand === 5
      && multiCancelled.orders[0].status === 'cancelled'
      && multiCancelled.movements.filter((movement) => movement.kind === 'release').length === 2,
    'multi_line_cancellation_not_atomic')
    assert(model.cancelCommerceOrder(multiCancelled, multiOrder.id, multiCancelProof) === multiCancelled, 'multi_line_cancellation_retry_not_idempotent')

    const preparingProof = proof('ACT-PREPARING', 500)
    const readyProof = proof('ACT-READY', 750)
    const preparing = model.advanceCommerceOrder(reserved, order.id, 'confirmed', preparingProof)
    const ready = model.advanceCommerceOrder(preparing, order.id, 'preparing', readyProof)
    assert(preparing?.orders[0].status === 'preparing'
      && ready?.orders[0].status === 'ready'
      && JSON.stringify(ready.orders[0].advancementActionIds) === JSON.stringify([preparingProof.actionId, readyProof.actionId]),
    'fulfilment_progression_failed')
    assert(model.advanceCommerceOrder(ready, order.id, 'ready') === null, 'pending_payment_completed_order')
    const paymentProof = proof('ACT-PAYMENT', 1_000)
    const reconciled = model.reconcileCommercePayment(ready, order.id, paymentProof)
    assert(reconciled?.orders[0].paymentStatus === 'reconciled' && reconciled.orders[0].paymentReconciledBy === paymentProof.actor && reconciled.orders[0].paymentEvidenceReference === paymentProof.evidenceReference, 'payment_reconciliation_lost_human_evidence')
    assert(model.reconcileCommercePayment(reconciled, order.id, paymentProof) === reconciled, 'exact_payment_retry_not_idempotent')
    assert(model.reconcileCommercePayment(reconciled, order.id, { ...paymentProof, evidenceReference: 'EV-CONFLICT' }) === null, 'conflicting_payment_retry_succeeded')
    const completionProof = proof('ACT-COMPLETE', 2_000)
    const completed = model.advanceCommerceOrder(reconciled, order.id, 'ready', completionProof)
    assert(completed?.orders[0].status === 'completed'
      && completed.orders[0].completion.actionId === completionProof.actionId
      && model.cancelCommerceOrder(completed, order.id, proof('ACT-CANCEL-COMPLETED')) === null,
    'completed_order_lost_proof_or_was_cancellable')
    assert(model.advanceCommerceOrder(reconciled, order.id, 'ready') === null, 'completion_without_attribution_succeeded')
    assert(model.advanceCommerceOrder(reconciled, order.id, 'ready', proof('ACT-COMPLETE-EARLY', 500)) === null, 'backdated_completion_succeeded')
    assert(model.advanceCommerceOrder(reconciled, order.id, 'ready', readyProof) === null, 'advancement_action_id_reuse_succeeded')
    const futurePaymentAt = proof('ACT-FUTURE-PAYMENT-BASIS', 5_000).capturedAt
    const skewedReconciled = model.validateCommerceState({
      ...reconciled,
      orders: reconciled.orders.map((candidate) => candidate.id === order.id
        ? { ...candidate, paymentReconciledAt: futurePaymentAt }
        : candidate),
    })
    const skewedCompletionProof = proof('ACT-COMPLETE-SKEWED-CLIENT', 2_000)
    assert(model.advanceCommerceOrder(skewedReconciled, order.id, 'ready', skewedCompletionProof) === null,
      'local_clock_skew_bypassed_strict_chronology')
    const managedSkewedCompletion = model.advanceCommerceOrder(
      skewedReconciled,
      order.id,
      'ready',
      skewedCompletionProof,
      'managed-server',
    )
    assert(managedSkewedCompletion?.orders[0].completion.capturedAt === futurePaymentAt,
      'managed_clock_skew_candidate_never_reached_server_authority')

    const returnInput = { orderId: order.id, sku: 'SKU-1', quantity: 1, disposition: 'restock' }
    const returnExpectation = model.commerceOrderReturnExpectation(completed, order.id, 'SKU-1', 'restock')
    const returnProof = proof('ACT-RETURN-1', 3_000)
    const returned = model.recordCommerceOrderReturn(completed, returnInput, returnProof, returnExpectation)
    assert(returnExpectation?.soldQuantity === 2
      && returnExpectation.returnedQuantity === 0
      && returnExpectation.stockOnHand === 8
      && returned?.items[0].onHand === 9
      && returned.orders[0].total === completed.orders[0].total
      && returned.orders[0].paymentStatus === completed.orders[0].paymentStatus
      && returned.orders[0].returns[0].disposition === 'restock'
      && returned.movements[0].kind === 'return'
      && returned.movements[0].orderId === order.id,
    'sellable_return_did_not_preserve_order_and_restock_exactly')
    assert(model.recordCommerceOrderReturn(returned, returnInput, returnProof, returnExpectation) === returned, 'exact_return_retry_not_idempotent')
    assert(model.recordCommerceOrderReturn(returned, { ...returnInput, disposition: 'not_restocked' }, returnProof, returnExpectation) === null, 'changed_return_retry_succeeded')
    assert(model.recordCommerceOrderReturn(returned, returnInput, proof('ACT-RETURN-STALE', 4_000), returnExpectation) === null, 'stale_return_review_succeeded')
    assert(model.recordCommerceOrderReturn(completed, returnInput, proof('ACT-RETURN-EARLY', 1_500), returnExpectation) === null, 'backdated_return_succeeded')

    const secondReturnInput = { ...returnInput, disposition: 'not_restocked' }
    const secondReturnExpectation = model.commerceOrderReturnExpectation(returned, order.id, 'SKU-1', 'not_restocked')
    const secondReturned = model.recordCommerceOrderReturn(returned, secondReturnInput, proof('ACT-RETURN-2', 4_000), secondReturnExpectation)
    assert(secondReturnExpectation?.returnedQuantity === 1
      && secondReturnExpectation.stockOnHand === null
      && secondReturned?.items[0].onHand === 9
      && secondReturned.movements === returned.movements
      && secondReturned.orders[0].returns.length === 2
      && secondReturned.orders[0].returns[0].disposition === 'not_restocked',
    'non_sellable_return_changed_stock_or_lost_history')
    assert(model.commerceOrderReturnExpectation(secondReturned, order.id, 'SKU-1', 'restock') === null, 'fully_returned_line_remained_returnable')
    assert(model.recordCommerceOrderReturn(returned, { ...returnInput, quantity: 2 }, proof('ACT-RETURN-OVER', 4_000), secondReturnExpectation) === null, 'cumulative_over_return_succeeded')
    const legacyCompleted = model.validateCommerceState({
      ...completed,
      orders: completed.orders.map(({ completion: _completion, ...candidate }) => candidate),
    })
    assert(model.commerceOrderReturnExpectation(legacyCompleted, order.id, 'SKU-1', 'restock') === null, 'unproven_legacy_completion_became_returnable')
    assertThrows(() => model.validateCommerceState({
      ...returned,
      movements: [{ ...returned.movements[0], quantityDelta: 2 }, ...returned.movements.slice(1)],
    }), 'forged_return_stock_movement_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...returned,
      movements: [{ ...returned.movements[0], id: 'MOV2:FORGED-RETURN' }, ...returned.movements.slice(1)],
    }), 'forged_return_stock_movement_id_succeeded')

    const cancelReserveProof = proof('ACT-RESERVE-CANCEL')
    const cancelOrder = { ...order, id: 'ORD-CANCEL', sourceRecordId: 'WEB-CANCEL', evidenceReference: cancelReserveProof.evidenceReference }
    const cancelReserved = model.reserveCommerceOrder(base, cancelOrder, cancelReserveProof)
    const cancelProof = proof('ACT-CANCEL', 2_000)
    const cancelled = model.cancelCommerceOrder(cancelReserved, cancelOrder.id, cancelProof)
    assert(cancelled?.items[0].onHand === 10 && cancelled.orders[0].status === 'cancelled' && cancelled.movements.filter((movement) => movement.kind === 'release').length === 1, 'cancellation_did_not_release_once')
    assert(model.cancelCommerceOrder(cancelled, cancelOrder.id, cancelProof) === cancelled, 'exact_cancellation_retry_not_idempotent')
    assert(model.cancelCommerceOrder(cancelled, cancelOrder.id, proof('ACT-CANCEL-OTHER')) === null, 'different_cancellation_retry_succeeded')
    assert(model.cancelCommerceOrder(migrated, 'ORD-LEGACY', proof('ACT-CANCEL-LEGACY')) === null && migrated.items[0].onHand === 10, 'untracked_legacy_order_invented_stock')

    const paidReserveProof = proof('ACT-RESERVE-PAID')
    const paidOrder = { ...order, id: 'ORD-PAID-CANCEL', sourceRecordId: 'WEB-PAID-CANCEL', evidenceReference: paidReserveProof.evidenceReference }
    const paidReserved = model.reserveCommerceOrder(base, paidOrder, paidReserveProof)
    const paid = model.reconcileCommercePayment(paidReserved, paidOrder.id, proof('ACT-PAY-PAID'))
    const paidCancelled = model.cancelCommerceOrder(paid, paidOrder.id, proof('ACT-CANCEL-PAID'))
    assert(paidCancelled?.orders[0].paymentStatus === 'reconciled' && paidCancelled.orders[0].refundStatus === 'due', 'paid_cancellation_erased_reconciliation_or_refund_exception')
    assert(model.commerceOrderNeedsAction(paidCancelled.orders[0]), 'refund_due_order_hidden_from_action_queue')
    assert(model.normalizeCommerce(paidCancelled) === paidCancelled, 'legacy_refund_due_state_not_byte_idempotent')
    assert(!model.commerceOrderNeedsAction(cancelled.orders[0]), 'closed_cancelled_order_left_in_action_queue')
    assert(!model.commerceOrderNeedsAction(completed.orders[0]), 'completed_reconciled_order_left_in_action_queue')
    assert(model.commerceOrderNeedsAction({ ...completed.orders[0], paymentStatus: 'pending' }), 'completed_pending_payment_hidden_from_action_queue')
    assert(model.reconcileCommercePayment(paidCancelled, paidOrder.id, proof('ACT-PAY-AFTER-CANCEL')) === null, 'cancelled_payment_reconciled_again')

    const settlementProof = proof('ACT-REFUND-SETTLED', 4_000)
    const settlementEvidence = {
      refundSettledAt: settlementProof.capturedAt,
      refundSettlementActionId: settlementProof.actionId,
      refundSettledBy: settlementProof.actor,
      refundSettlementReason: settlementProof.reason,
      refundEvidenceReference: settlementProof.evidenceReference,
    }
    assertThrows(() => model.validateCommerceState({
      ...cancelled,
      orders: [{ ...cancelled.orders[0], ...settlementEvidence }],
    }), 'refund_none_with_settlement_evidence_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...paidCancelled,
      orders: [{ ...paidCancelled.orders[0], ...settlementEvidence }],
    }), 'refund_due_with_settlement_evidence_succeeded')
    const { refundEvidenceReference: _missingRefundEvidence, ...incompleteSettlementEvidence } = settlementEvidence
    assertThrows(() => model.validateCommerceState({
      ...paidCancelled,
      orders: [{ ...paidCancelled.orders[0], refundStatus: 'settled', ...incompleteSettlementEvidence }],
    }), 'incomplete_refund_settlement_evidence_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...paidCancelled,
      orders: [{ ...paidCancelled.orders[0], refundStatus: 'none' }],
    }), 'cancelled_reconciled_order_without_refund_state_succeeded')
    assert(model.settleCommerceRefund(reserved, order.id, proof('ACT-SETTLE-NONE')) === null, 'refund_none_was_settled')
    assert(model.settleCommerceRefund(paidCancelled, paidOrder.id, proof('ACT-PAY-PAID')) === null, 'refund_settlement_reused_payment_action_id')

    const unrelatedReserveProof = proof('ACT-RESERVE-UNRELATED', 3_000)
    const unrelatedOrder = {
      ...order,
      id: 'ORD-UNRELATED',
      sourceRecordId: 'WEB-UNRELATED',
      evidenceReference: unrelatedReserveProof.evidenceReference,
    }
    const withUnrelatedOrder = model.reserveCommerceOrder(paidCancelled, unrelatedOrder, unrelatedReserveProof)
    const unrelatedBeforeSettlement = withUnrelatedOrder.orders.find((candidate) => candidate.id === unrelatedOrder.id)
    const dueCloseExpectation = model.commerceCloseExpectation(withUnrelatedOrder, '2026-07-24T09:00:00.000Z')
    assert(dueCloseExpectation?.paymentExceptionOrderIds.includes(paidOrder.id), 'refund_due_missing_from_close_exceptions')
    const settled = model.settleCommerceRefund(withUnrelatedOrder, paidOrder.id, settlementProof)
    const settledOrder = settled?.orders.find((candidate) => candidate.id === paidOrder.id)
    assert(settledOrder?.refundStatus === 'settled'
      && settledOrder.refundSettledAt === settlementProof.capturedAt
      && settledOrder.refundSettlementActionId === settlementProof.actionId
      && settledOrder.refundSettledBy === settlementProof.actor
      && settledOrder.refundSettlementReason === settlementProof.reason
      && settledOrder.refundEvidenceReference === settlementProof.evidenceReference, 'refund_settlement_lost_complete_attribution')
    assert(settled !== withUnrelatedOrder
      && settled.items === withUnrelatedOrder.items
      && settled.movements === withUnrelatedOrder.movements
      && settled.closes === withUnrelatedOrder.closes
      && settled.websiteIntakes === withUnrelatedOrder.websiteIntakes
      && settled.orders.length === withUnrelatedOrder.orders.length
      && settled.orders.find((candidate) => candidate.id === unrelatedOrder.id) === unrelatedBeforeSettlement, 'refund_settlement_changed_unrelated_state')
    assert(model.settleCommerceRefund(settled, paidOrder.id, settlementProof) === settled, 'exact_refund_settlement_retry_not_idempotent')
    assert(model.settleCommerceRefund(settled, paidOrder.id, { ...settlementProof, evidenceReference: 'EV-REFUND-CONFLICT' }) === null, 'changed_refund_settlement_retry_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...settled,
      orders: settled.orders.map((candidate) => candidate.id === paidOrder.id ? { ...candidate, status: 'completed' } : candidate),
    }), 'settled_refund_without_cancelled_order_succeeded')
    assertThrows(() => model.validateCommerceState({
      ...settled,
      orders: settled.orders.map((candidate) => candidate.id === paidOrder.id ? { ...candidate, refundSettlementActionId: unrelatedReserveProof.actionId } : candidate),
    }), 'refund_settlement_action_id_global_reuse_succeeded')
    assert(!model.commerceOrderNeedsAction(settledOrder), 'settled_refund_left_in_action_queue')
    const settledCloseExpectation = model.commerceCloseExpectation(settled, '2026-07-24T09:00:00.000Z')
    assert(settledCloseExpectation
      && !settledCloseExpectation.paymentExceptionOrderIds.includes(paidOrder.id)
      && settledCloseExpectation.paymentExceptionOrderIds.includes(unrelatedOrder.id), 'settled_refund_left_as_due_only_exception')

    const purchaseOrderId = 'PO-00000000-0000-4000-8000-000000000020'
    const purchaseCreationProof = proof('ACT-PURCHASE-CREATE')
    const purchaseExpectedAt = '2026-07-25T09:00:00.000Z'
    const purchaseCreated = model.createCommercePurchaseOrder(base, {
      id: purchaseOrderId,
      expectedAt: purchaseExpectedAt,
      supplier: 'Yangon Supply',
      sku: 'SKU-1',
      quantityOrdered: 10,
    }, purchaseCreationProof)
    assert(purchaseCreated
      && purchaseCreated.items === base.items
      && purchaseCreated.movements === base.movements
      && purchaseCreated.purchaseOrders[0].id === purchaseOrderId
      && purchaseCreated.purchaseOrders[0].expectedAt === purchaseExpectedAt
      && model.commercePurchaseOrderProgress(purchaseCreated, purchaseCreated.purchaseOrders[0]).status === 'open', 'purchase_order_creation_not_exact')
    const purchaseOpenProgress = model.commercePurchaseOrderProgress(purchaseCreated, purchaseCreated.purchaseOrders[0])
    assert(model.commercePurchaseOrderArrivalUrgency(
      purchaseCreated.purchaseOrders[0],
      purchaseOpenProgress,
      Date.parse('2026-07-24T08:59:59.999Z'),
    ) === 'scheduled', 'purchase_arrival_more_than_24_hours_away_not_scheduled')
    assert(model.commercePurchaseOrderArrivalUrgency(
      purchaseCreated.purchaseOrders[0],
      purchaseOpenProgress,
      Date.parse('2026-07-24T09:00:00.000Z'),
    ) === 'due_soon', 'purchase_arrival_24_hour_boundary_not_due_soon')
    assert(model.commercePurchaseOrderArrivalUrgency(
      purchaseCreated.purchaseOrders[0],
      purchaseOpenProgress,
      Date.parse(purchaseExpectedAt),
    ) === 'late', 'purchase_arrival_at_deadline_not_late')
    assert(model.commercePurchaseOrderArrivalUrgency(
      { ...purchaseCreated.purchaseOrders[0], expectedAt: undefined },
      purchaseOpenProgress,
      Date.parse(purchaseCreationProof.capturedAt),
    ) === 'unrecorded', 'legacy_purchase_arrival_not_marked_unrecorded')
    assert(model.commercePurchaseOrderArrivalUrgency(
      purchaseCreated.purchaseOrders[0],
      purchaseOpenProgress,
      Number.NaN,
    ) === 'unrecorded', 'purchase_arrival_invalid_clock_not_fail_closed')
    assert(model.createCommercePurchaseOrder(purchaseCreated, {
      id: purchaseOrderId,
      expectedAt: purchaseExpectedAt,
      supplier: 'Yangon Supply',
      sku: 'SKU-1',
      quantityOrdered: 10,
    }, purchaseCreationProof) === purchaseCreated, 'purchase_order_exact_retry_not_idempotent')
    assert(model.createCommercePurchaseOrder(purchaseCreated, {
      id: 'PO-00000000-0000-4000-8000-000000000021',
      expectedAt: purchaseExpectedAt,
      supplier: 'Second supplier',
      sku: 'SKU-1',
      quantityOrdered: 5,
    }, proof('ACT-PURCHASE-CREATE-2')) === null, 'duplicate_active_purchase_order_succeeded')
    assert(model.createCommercePurchaseOrder(base, {
      id: purchaseOrderId,
      expectedAt: purchaseCreationProof.capturedAt,
      supplier: 'Yangon Supply',
      sku: 'SKU-1',
      quantityOrdered: 10,
    }, purchaseCreationProof) === null, 'nonfuture_purchase_arrival_succeeded')
    assert(model.createCommercePurchaseOrder(base, {
      id: purchaseOrderId,
      supplier: 'Yangon Supply',
      sku: 'SKU-1',
      quantityOrdered: 10,
    }, purchaseCreationProof) === null, 'missing_purchase_arrival_succeeded')
    assert(model.createCommercePurchaseOrder(purchaseCreated, {
      id: purchaseOrderId,
      expectedAt: '2026-07-26T09:00:00.000Z',
      supplier: 'Yangon Supply',
      sku: 'SKU-1',
      quantityOrdered: 10,
    }, purchaseCreationProof) === null, 'changed_purchase_arrival_retry_succeeded')
    const purchasePartialProof = proof('ACT-PURCHASE-RECEIVE-1', 60_000)
    const purchasePartial = model.receiveCommercePurchaseOrder(purchaseCreated, purchaseOrderId, 4, purchasePartialProof)
    const purchasePartialProgress = purchasePartial && model.commercePurchaseOrderProgress(purchasePartial, purchasePartial.purchaseOrders[0])
    assert(purchasePartial
      && purchasePartial.items[0].onHand === 14
      && purchasePartial.movements[0].purchaseOrderId === purchaseOrderId
      && purchasePartialProgress?.received === 4
      && purchasePartialProgress.remaining === 6
      && purchasePartialProgress.status === 'partially_received', 'purchase_order_partial_receipt_not_exact')
    const countedWithOpenPurchase = model.countCommerceStock(purchasePartial, 'SKU-1', 13, proof('ACT-COUNT-WITH-PO', 90_000))
    assert(countedWithOpenPurchase
      && countedWithOpenPurchase.items[0].onHand === 13
      && countedWithOpenPurchase.purchaseOrders === purchasePartial.purchaseOrders
      && model.commercePurchaseOrderProgress(countedWithOpenPurchase, countedWithOpenPurchase.purchaseOrders[0]).received === 4
      && model.commercePurchaseOrderProgress(countedWithOpenPurchase, countedWithOpenPurchase.purchaseOrders[0]).remaining === 6,
    'stock_count_changed_open_purchase_order_progress')
    assert(model.receiveCommercePurchaseOrder(purchasePartial, purchaseOrderId, 4, purchasePartialProof) === purchasePartial, 'purchase_order_receipt_retry_not_idempotent')
    assert(model.receiveCommercePurchaseOrder(purchasePartial, purchaseOrderId, 7, proof('ACT-PURCHASE-OVERRECEIPT', 120_000)) === null, 'purchase_order_overreceipt_succeeded')
    assert(model.cancelCommercePurchaseOrder(
      purchasePartial,
      purchaseOrderId,
      proof('ACT-PURCHASE-CANCEL-NO-ZONE', 0, { capturedAt: '2026-07-23T09:02:00' }),
    ) === null, 'timezone_less_purchase_cancellation_succeeded')
    const purchaseCancellationProof = proof('ACT-PURCHASE-CANCEL', 180_000)
    const purchaseCancelled = model.cancelCommercePurchaseOrder(purchasePartial, purchaseOrderId, purchaseCancellationProof)
    assert(purchaseCancelled
      && model.commercePurchaseOrderProgress(purchaseCancelled, purchaseCancelled.purchaseOrders[0]).status === 'cancelled'
      && model.commercePurchaseOrderArrivalUrgency(
        purchaseCancelled.purchaseOrders[0],
        model.commercePurchaseOrderProgress(purchaseCancelled, purchaseCancelled.purchaseOrders[0]),
        Date.parse('2026-07-26T09:00:00.000Z'),
      ) === 'closed'
      && model.commercePurchaseOrderProgress(purchaseCancelled, purchaseCancelled.purchaseOrders[0]).remaining === 6, 'purchase_order_cancellation_not_exact')
    assert(model.cancelCommercePurchaseOrder(purchaseCancelled, purchaseOrderId, purchaseCancellationProof) === purchaseCancelled, 'purchase_order_cancel_retry_not_idempotent')
    assert(model.receiveCommercePurchaseOrder(purchaseCancelled, purchaseOrderId, 1, proof('ACT-PURCHASE-AFTER-CANCEL', 240_000)) === null, 'purchase_order_receipt_after_cancel_succeeded')
    const purchaseFilled = model.receiveCommercePurchaseOrder(purchasePartial, purchaseOrderId, 6, proof('ACT-PURCHASE-RECEIVE-2', 120_000))
    assert(purchaseFilled
      && model.commercePurchaseOrderProgress(purchaseFilled, purchaseFilled.purchaseOrders[0]).status === 'received'
      && model.cancelCommercePurchaseOrder(purchaseFilled, purchaseOrderId, proof('ACT-PURCHASE-CANCEL-FILLED', 180_000)) === null, 'completed_purchase_order_was_cancellable')
    const precisePurchaseOrderId = 'PO-00000000-0000-4000-8000-000000000022'
    const precisePurchaseCreated = model.createCommercePurchaseOrder(base, {
      id: precisePurchaseOrderId,
      expectedAt: '2026-07-25T09:00:00.000001Z',
      supplier: 'Precision supplier',
      sku: 'SKU-1',
      quantityOrdered: 2,
    }, proof('ACT-PURCHASE-PRECISE-CREATE', 0, { capturedAt: '2026-07-23T09:00:00.000000Z' }))
    const precisePurchaseReceived = model.receiveCommercePurchaseOrder(
      precisePurchaseCreated,
      precisePurchaseOrderId,
      1,
      proof('ACT-PURCHASE-PRECISE-RECEIVE', 0, { capturedAt: '2026-07-23T09:00:00.000900Z' }),
    )
    assert(precisePurchaseReceived
      && model.cancelCommercePurchaseOrder(
        precisePurchaseReceived,
        precisePurchaseOrderId,
        proof('ACT-PURCHASE-PRECISE-CANCEL', 0, { capturedAt: '2026-07-23T09:00:00.000100Z' }),
      ) === null, 'submillisecond_purchase_cancellation_ordering_collapsed')

    const attentionCreation = (id, sku, actionId, expectedAt, cancellation) => ({
      id,
      createdAt: '2026-07-23T09:00:00.000Z',
      ...(expectedAt ? { expectedAt } : {}),
      supplier: 'Attention supplier',
      sku,
      quantityOrdered: 2,
      creation: proof(actionId),
      ...(cancellation ? { cancellation } : {}),
    })
    const attentionState = model.validateCommerceState({
      ...model.createEmptyCommerce(),
      items: ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4'].map((sku) => ({
        sku,
        name: sku,
        onHand: 10,
        reorderAt: 2,
        price: 100,
      })),
      purchaseOrders: [
        attentionCreation(
          'PO-00000000-0000-4000-8000-000000000030',
          'SKU-1',
          'ACT-ATTENTION-CLOSED',
          '2026-07-23T10:00:00.000Z',
          proof('ACT-ATTENTION-CANCELLED', 60_000),
        ),
        attentionCreation(
          'PO-00000000-0000-4000-8000-000000000031',
          'SKU-2',
          'ACT-ATTENTION-LEGACY',
        ),
        attentionCreation(
          'PO-00000000-0000-4000-8000-000000000032',
          'SKU-3',
          'ACT-ATTENTION-LATER',
          '2026-07-23T13:00:00.000Z',
        ),
        attentionCreation(
          'PO-00000000-0000-4000-8000-000000000033',
          'SKU-4',
          'ACT-ATTENTION-SOONER',
          '2026-07-23T11:00:00.000Z',
        ),
      ],
    })
    const attentionOrder = attentionState.purchaseOrders
      .map((purchaseOrder) => ({
        purchaseOrder,
        progress: model.commercePurchaseOrderProgress(attentionState, purchaseOrder),
      }))
      .sort(model.compareCommercePurchaseOrderAttention)
      .map(({ purchaseOrder }) => purchaseOrder.id)
    assert(JSON.stringify(attentionOrder) === JSON.stringify([
      'PO-00000000-0000-4000-8000-000000000033',
      'PO-00000000-0000-4000-8000-000000000032',
      'PO-00000000-0000-4000-8000-000000000031',
      'PO-00000000-0000-4000-8000-000000000030',
    ]), 'purchase_order_attention_order_not_operational')
    const legacyPurchaseState = model.validateCommerceState({
      ...model.createEmptyCommerce(),
      items: attentionState.items,
      purchaseOrders: [attentionState.purchaseOrders[1]],
    })
    assert(legacyPurchaseState.purchaseOrders[0].expectedAt === undefined, 'legacy_purchase_arrival_was_invented')

    const receiptProof = proof('ACT-RECEIPT')
    const received = model.receiveCommerceStock(base, 'SKU-1', 7, receiptProof)
    assert(received?.items[0].onHand === 17 && received.movements[0].kind === 'receipt' && received.movements[0].quantityDelta === 7, 'exact_receipt_not_recorded')
    assert(model.receiveCommerceStock(received, 'SKU-1', 7, receiptProof) === received, 'exact_receipt_retry_not_idempotent')
    assert(model.receiveCommerceStock(received, 'SKU-1', 8, receiptProof) === null, 'conflicting_receipt_retry_succeeded')
    assert(model.receiveCommerceStock(base, 'SKU-1', 0, proof('ACT-RECEIPT-ZERO')) === null, 'zero_receipt_succeeded')
    assert(model.receiveCommerceStock(base, 'SKU-1', -1, proof('ACT-RECEIPT-NEGATIVE')) === null, 'negative_receipt_succeeded')
    assert(model.receiveCommerceStock(base, 'SKU-1', 1.5, proof('ACT-RECEIPT-DECIMAL')) === null, 'decimal_receipt_succeeded')
    assert(model.receiveCommerceStock({ ...base, items: [{ ...base.items[0], onHand: Number.MAX_SAFE_INTEGER }] }, 'SKU-1', 1, proof('ACT-OVERFLOW')) === null, 'stock_overflow_succeeded')

    values.clear()
    const currentState = model.createSeedCommerce()
    values.set(model.COMMERCE_KEY, JSON.stringify(currentState))
    values.set(model.LEGACY_COMMERCE_KEYS[0], '{malformed')
    assert(model.commerceWorkspaceCanWrite(storage, locks), 'commerce_valid_local_workspace_not_write_ready')
    assert(![...values.keys()].some((key) => key.includes('.write-probe.')), 'commerce_write_probe_left_storage_residue')
    assert(!model.commerceWorkspaceCanWrite(storage, null), 'commerce_workspace_without_locks_reported_write_ready')
    const rejectingCommerceStorage = {
      getItem: (key) => key === model.COMMERCE_KEY ? JSON.stringify(currentState) : null,
      setItem: () => { throw new Error('read-only') },
      removeItem: () => {},
    }
    assert(!model.commerceWorkspaceCanWrite(rejectingCommerceStorage, locks), 'commerce_read_only_storage_reported_write_ready')
    const currentSnapshot = model.loadCommerceWorkspace(storage)
    assert(currentSnapshot.source === 'current' && currentSnapshot.state.orders.length === currentState.orders.length, 'valid_v2_did_not_take_precedence')
    const malformed = '{broken'
    values.set(model.COMMERCE_KEY, malformed)
    values.set(model.LEGACY_COMMERCE_KEYS[0], JSON.stringify(legacy))
    assert(!model.commerceWorkspaceCanWrite(storage, locks), 'commerce_malformed_workspace_reported_write_ready')
    const recoverySnapshot = model.loadCommerceWorkspace(storage)
    assert(recoverySnapshot.source === 'recovery' && recoverySnapshot.state.orders.length === 0 && values.get(model.COMMERCE_KEY) === malformed, 'malformed_v2_restored_or_replaced_legacy')
    values.clear()
    values.set(model.LEGACY_COMMERCE_KEYS[0], JSON.stringify(legacy))
    const legacySnapshot = model.loadCommerceWorkspace(storage)
    assert(legacySnapshot.source === 'legacy' && JSON.parse(values.get(model.COMMERCE_KEY)).movements.length === 0, 'absent_v2_migration_failed')

    values.clear()
    const concurrentReserveProof = proof('ACT-CONCURRENT-RESERVE')
    const concurrentOrder = { ...cancelOrder, evidenceReference: concurrentReserveProof.evidenceReference }
    const concurrentReserved = model.reserveCommerceOrder(base, concurrentOrder, concurrentReserveProof)
    values.set(model.COMMERCE_KEY, JSON.stringify(concurrentReserved))
    const concurrentResults = await Promise.all([
      model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, concurrentOrder.id, proof('ACT-CONCURRENT-CANCEL-A')), storage, locks),
      model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, concurrentOrder.id, proof('ACT-CONCURRENT-CANCEL-B')), storage, locks),
    ])
    const concurrentState = JSON.parse(values.get(model.COMMERCE_KEY))
    assert(lockRequests === 2 && concurrentResults.filter((result) => result.ok).length === 1, 'concurrent_cancellation_not_serialized')
    assert(concurrentState.items[0].onHand === 10 && concurrentState.movements.filter((movement) => movement.kind === 'release').length === 1, 'concurrent_cancellation_released_twice')
    const replay = await model.mutateCommerceWorkspace((state) => model.cancelCommerceOrder(state, concurrentOrder.id, proof('ACT-CONCURRENT-CANCEL-A')), storage, locks)
    assert(replay.ok && replay.replayed === true && JSON.parse(values.get(model.COMMERCE_KEY)).movements.length === 2, 'persisted_cancellation_replay_changed_ledger')

    const beforeFailure = values.get(model.COMMERCE_KEY)
    const failingStorage = { getItem: storage.getItem, setItem: () => { throw new Error('quota') } }
    const failedWrite = await model.mutateCommerceWorkspace((state) => model.receiveCommerceStock(state, 'SKU-1', 1, proof('ACT-WRITE-FAIL')), failingStorage, locks)
    assert(!failedWrite.ok && values.get(model.COMMERCE_KEY) === beforeFailure, 'storage_failure_advanced_interface_state')
  } catch (error) {
    fail(`commerce_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyCommerceOrderDraftRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    commerceOrderDraftRuntimeChecks += 1
  }
  try {
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-order-draft.ts')).href}?commerce-order-draft=${Date.now()}`)
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      get length() { return values.size },
      key: (index) => [...values.keys()][index] ?? null,
    }
    const lockCalls = []
    const lockQueues = new Map()
    const locks = {
      request: (name, options, callback) => {
        lockCalls.push({ name, options })
        const lockQueue = lockQueues.get(name) ?? Promise.resolve()
        const run = lockQueue.then(callback, callback)
        lockQueues.set(name, run.then(() => undefined, () => undefined))
        return run
      },
    }
    const localScope = model.commerceOrderDraftScope()
    const managedScope = model.commerceOrderDraftScope('workspace-a')
    const localKey = model.commerceOrderDraftStorageKey(localScope)
    const managedKey = model.commerceOrderDraftStorageKey(managedScope)
    const input = {
      customer: 'Ko Aung',
      channel: 'Messenger',
      payment: 'KBZPay',
      fulfilment: 'pickup',
      fulfilmentReference: 'PICKUP-17',
      promisedAt: '2026-07-25T07:00:00.000Z',
      lines: [
        { sku: 'SM-1001', quantity: 2, unitPriceMmk: 18_500, availableAtSave: 34 },
        { sku: 'SM-1003', quantity: 1, unitPriceMmk: 12_000, availableAtSave: 21 },
      ],
    }
    const catalog = [
      { sku: 'SM-1001', price: 18_500, onHand: 34 },
      { sku: 'SM-1003', price: 12_000, onHand: 21 },
    ]

    assert(model.readCommerceOrderDraft(localScope, storage).status === 'empty', 'commerce_order_draft_empty_read_invalid')
    const first = await model.saveCommerceOrderDraft(input, 0, localScope, {
      storage,
      locks,
      now: () => '2026-07-25T05:00:00.000Z',
    })
    const firstRaw = values.get(localKey)
    assert(first.revision === 1
      && first.scope === 'local'
      && first.lines.length === 2
      && first.promisedAt === input.promisedAt
      && first.savedAt === '2026-07-25T05:00:00.000Z',
    'commerce_order_draft_first_save_invalid')
    assert(Object.keys(JSON.parse(firstRaw)).sort().join(',') === 'channel,customer,fulfilment,fulfilmentReference,lines,payment,promisedAt,revision,savedAt,schema,scope', 'commerce_order_draft_extra_fields_persisted')
    const legacyDraft = { ...first }
    delete legacyDraft.promisedAt
    assert(model.validateCommerceOrderDraft(legacyDraft, localScope).promisedAt === '', 'commerce_order_draft_legacy_promise_not_migrated_additively')
    assert(lockCalls[0]?.name === 'supermega:shop:order-draft:reset'
      && lockCalls[1]?.name === 'supermega:shop:order-draft:local'
      && lockCalls.slice(0, 2).every((call) => call.options?.mode === 'exclusive'),
    'commerce_order_draft_wrong_lock_scope_or_mode')
    assert(model.readCommerceOrderDraft(localScope, storage).status === 'ready'
      && JSON.stringify(model.readCommerceOrderDraft(localScope, storage).draft) === JSON.stringify(first),
    'commerce_order_draft_reload_failed')
    const replay = await model.saveCommerceOrderDraft({ ...input, lines: input.lines.map((line) => ({ ...line })) }, 1, localScope, {
      storage,
      locks,
      now: () => '2026-07-25T05:01:00.000Z',
    })
    assert(replay.revision === 1 && values.get(localKey) === firstRaw, 'commerce_order_draft_exact_replay_advanced')
    const updated = await model.saveCommerceOrderDraft({ ...input, customer: 'May' }, 1, localScope, {
      storage,
      locks,
      now: () => '2026-07-25T05:02:00.000Z',
    })
    assert(updated.revision === 2 && updated.customer === 'May', 'commerce_order_draft_update_not_revisioned')
    const managed = await model.saveCommerceOrderDraft(input, 0, managedScope, {
      storage,
      locks,
      now: () => '2026-07-25T05:03:00.000Z',
    })
    assert(managed.scope === 'managed:workspace-a'
      && values.has(managedKey)
      && model.readCommerceOrderDraft(localScope, storage).draft?.customer === 'May',
    'commerce_order_draft_cross_scope_leak')

    const current = model.commerceOrderDraftCatalogState(first, catalog)
    assert(current.current && current.canRebind, 'commerce_order_draft_current_catalog_rejected')
    const repriced = model.commerceOrderDraftCatalogState(first, catalog.map((item) => item.sku === 'SM-1001' ? { ...item, price: item.price + 1 } : item))
    assert(!repriced.current && repriced.canRebind && repriced.changedSkus.join(',') === 'SM-1001', 'commerce_order_draft_price_drift_not_detected')
    const stockChanged = model.commerceOrderDraftCatalogState(first, catalog.map((item) => item.sku === 'SM-1001' ? { ...item, onHand: item.onHand - 1 } : item))
    assert(!stockChanged.current && stockChanged.canRebind && stockChanged.changedSkus.join(',') === 'SM-1001', 'commerce_order_draft_availability_drift_not_detected')
    const insufficient = model.commerceOrderDraftCatalogState(first, catalog.map((item) => item.sku === 'SM-1001' ? { ...item, onHand: 1 } : item))
    assert(!insufficient.current && !insufficient.canRebind && insufficient.insufficientSkus.join(',') === 'SM-1001', 'commerce_order_draft_insufficient_stock_not_blocked')
    const missing = model.commerceOrderDraftCatalogState(first, catalog.slice(1))
    assert(!missing.current && !missing.canRebind && missing.missingSkus.join(',') === 'SM-1001', 'commerce_order_draft_missing_sku_not_blocked')
    const rebound = model.rebindCommerceOrderDraft(first, catalog.map((item) => item.sku === 'SM-1001' ? { ...item, price: 19_000, onHand: 30 } : item))
    assert(rebound.customer === input.customer
      && rebound.promisedAt === input.promisedAt
      && rebound.lines[0].unitPriceMmk === 19_000
      && rebound.lines[0].availableAtSave === 30,
    'commerce_order_draft_rebind_changed_operator_fields_or_kept_stale_catalog')

    let staleRejected = false
    try {
      await model.saveCommerceOrderDraft({ ...input, customer: 'Stale' }, 1, localScope, {
        storage,
        locks,
        now: () => '2026-07-25T05:04:00.000Z',
      })
    } catch { staleRejected = true }
    assert(staleRejected && model.readCommerceOrderDraft(localScope, storage).draft?.revision === 2, 'commerce_order_draft_stale_save_overwrote_current')
    for (const invalid of [
      { ...input, customer: ' Ko Aung' },
      { ...input, lines: [] },
      { ...input, lines: [input.lines[0], input.lines[0]] },
      { ...input, payment: 'Crypto' },
      { ...input, promisedAt: '2026-07-25T07:00:00' },
      { ...input, lines: [{ ...input.lines[0], quantity: 0 }] },
    ]) {
      let rejected = false
      try {
        await model.saveCommerceOrderDraft(invalid, 2, localScope, {
          storage,
          locks,
          now: () => '2026-07-25T05:05:00.000Z',
        })
      } catch { rejected = true }
      assert(rejected && model.readCommerceOrderDraft(localScope, storage).draft?.revision === 2, 'commerce_order_draft_invalid_input_written')
    }

    values.set(localKey, '{broken')
    const malformed = model.readCommerceOrderDraft(localScope, storage)
    let malformedSaveRejected = false
    try {
      await model.saveCommerceOrderDraft(input, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-25T05:06:00.000Z',
      })
    } catch { malformedSaveRejected = true }
    assert(malformed.status === 'invalid'
      && /^[0-9]+:[0-9a-f]{8}:[0-9a-f]{8}$/.test(malformed.invalidFingerprint)
      && malformedSaveRejected
      && values.get(localKey) === '{broken',
    'commerce_order_draft_malformed_value_replaced')
    const oversizedRaw = 'x'.repeat(16_385)
    values.set(localKey, oversizedRaw)
    const oversized = model.readCommerceOrderDraft(localScope, storage)
    assert(oversized.status === 'invalid' && oversized.invalidFingerprint, 'commerce_order_draft_oversized_value_accepted')
    assert(model.commerceOrderDraftUtf8Bytes('က'.repeat(6_000)) === 18_000, 'commerce_order_draft_multilingual_bytes_mismeasured')
    values.set(localKey, JSON.stringify(updated))
    let replacedInvalidDiscardRejected = false
    try {
      await model.discardCommerceOrderDraft(localScope, undefined, {
        storage,
        locks,
        expectedInvalidFingerprint: oversized.invalidFingerprint,
      })
    } catch { replacedInvalidDiscardRejected = true }
    assert(replacedInvalidDiscardRejected
      && model.readCommerceOrderDraft(localScope, storage).draft?.revision === updated.revision,
    'commerce_order_draft_stale_invalid_discard_removed_replacement')
    values.set(localKey, oversizedRaw)
    await model.discardCommerceOrderDraft(localScope, undefined, {
      storage,
      locks,
      expectedInvalidFingerprint: oversized.invalidFingerprint,
    })
    assert(!values.has(localKey), 'commerce_order_draft_invalid_value_not_explicitly_discarded')

    const restored = await model.saveCommerceOrderDraft(input, 0, localScope, {
      storage,
      locks,
      now: () => '2026-07-25T05:07:00.000Z',
    })
    let wrongDiscardRejected = false
    try {
      await model.discardCommerceOrderDraft(localScope, restored.revision + 1, { storage, locks })
    } catch { wrongDiscardRejected = true }
    assert(wrongDiscardRejected && values.has(localKey), 'commerce_order_draft_wrong_revision_discarded_current')
    await model.discardCommerceOrderDraft(localScope, restored.revision, { storage, locks })
    assert(model.readCommerceOrderDraft(localScope, storage).status === 'empty', 'commerce_order_draft_discard_failed')

    const resetLocal = await model.saveCommerceOrderDraft(input, 0, localScope, {
      storage,
      locks,
      expectedResetEpoch: 0,
      now: () => '2026-07-25T05:07:10.000Z',
    })
    const resetEpoch = await model.resetCommerceOrderDraftRecovery({ storage, locks })
    assert(resetEpoch === 1
      && model.commerceOrderDraftResetEpoch(storage) === 1
      && !values.has(localKey)
      && !values.has(managedKey),
    'commerce_order_draft_reset_did_not_clear_scoped_drafts')
    let preResetSaveRejected = false
    try {
      await model.saveCommerceOrderDraft({ ...input, customer: 'Queued before reset' }, resetLocal.revision, localScope, {
        storage,
        locks,
        expectedResetEpoch: 0,
        now: () => '2026-07-25T05:07:12.000Z',
      })
    } catch { preResetSaveRejected = true }
    assert(preResetSaveRejected && !values.has(localKey), 'commerce_order_draft_pre_reset_save_recreated_draft')
    const postResetSave = await model.saveCommerceOrderDraft(input, 0, localScope, {
      storage,
      locks,
      expectedResetEpoch: 1,
      now: () => '2026-07-25T05:07:13.000Z',
    })
    assert(postResetSave.revision === 1 && model.readCommerceOrderDraft(localScope, storage).status === 'ready', 'commerce_order_draft_post_reset_save_failed')

    values.clear()
    lockCalls.length = 0
    lockQueues.clear()
    const concurrent = await Promise.allSettled([
      model.saveCommerceOrderDraft(input, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-25T05:08:00.000Z',
      }),
      model.saveCommerceOrderDraft({ ...input, customer: 'Concurrent' }, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-25T05:08:01.000Z',
      }),
    ])
    assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1
      && JSON.parse(values.get(localKey)).revision === 1
      && lockCalls.every((call) => ['supermega:shop:order-draft:reset', 'supermega:shop:order-draft:local'].includes(call.name) && call.options?.mode === 'exclusive'),
    'commerce_order_draft_concurrent_save_not_serialized')

    const beforeFailure = values.get(localKey)
    const failingStorage = {
      getItem: storage.getItem,
      setItem: () => { throw new Error('quota') },
      removeItem: storage.removeItem,
    }
    let failedWriteRejected = false
    try {
      await model.saveCommerceOrderDraft({ ...input, customer: 'Write failure' }, 1, localScope, {
        storage: failingStorage,
        locks,
        now: () => '2026-07-25T05:09:00.000Z',
      })
    } catch { failedWriteRejected = true }
    assert(failedWriteRejected && values.get(localKey) === beforeFailure, 'commerce_order_draft_failed_write_changed_state')
  } catch (error) {
    fail(`commerce_order_draft_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyStorefrontDraftRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    storefrontDraftRuntimeChecks += 1
  }
  try {
    const draftModel = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-draft.ts')).href}?storefront-draft=${Date.now()}`)
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    }
    let lockRequests = 0
    const lockCalls = []
    let lockQueue = Promise.resolve()
    const locks = {
      request: (name, options, callback) => {
        lockRequests += 1
        lockCalls.push({ name, options })
        const run = lockQueue.then(callback, callback)
        lockQueue = run.then(() => undefined, () => undefined)
        return run
      },
    }
    const localScope = draftModel.LOCAL_STOREFRONT_DRAFT_SCOPE
    const managedScope = 'managed:workspace-a'
    const legacyScope = 'legacy:workspace-a'
    const localKey = draftModel.storefrontDraftStorageKey(localScope)
    const localLegacyKey = draftModel.legacyStorefrontDraftStorageKey(localScope)
    const managedKey = draftModel.storefrontDraftStorageKey(managedScope)
    const legacyKey = draftModel.legacyStorefrontDraftStorageKey(legacyScope)
    const migratedKey = draftModel.storefrontDraftStorageKey(legacyScope)
    const previewDigestA = `sha256:${'a'.repeat(64)}`
    const previewDigestB = `sha256:${'b'.repeat(64)}`
    const input = {
      storeName: 'Mingalar Shop',
      summary: 'Clear prices and a small customer-ready catalog.',
      selectedSkus: ['SM-1003', 'SM-1001'],
      sourcePreviewDigest: previewDigestA,
    }

    const empty = draftModel.readStorefrontDraft(localScope, storage)
    assert(empty.status === 'empty' && empty.draft === null, 'storefront_draft_empty_read_invalid')
    const first = await draftModel.saveStorefrontDraft(input, 0, localScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:00:00.000Z',
    })
    const firstRaw = values.get(localKey)
    assert(first.revision === 1
      && first.scope === localScope
      && first.savedAt === '2026-07-24T10:00:00.000Z'
      && first.sourcePreviewDigest === previewDigestA
      && first.selectedSkus.join(',') === 'SM-1001,SM-1003',
    'storefront_draft_first_save_not_canonical')
    assert(lockCalls[0]?.name === `supermega:ecommerce:storefront-draft:${encodeURIComponent(localScope)}`
      && lockCalls[0]?.options?.mode === 'exclusive',
    'storefront_draft_wrong_lock_scope_or_mode')
    assert(Object.keys(JSON.parse(firstRaw)).sort().join(',') === 'revision,savedAt,schema,scope,selectedSkus,sourcePreviewDigest,storeName,summary', 'storefront_draft_persisted_extra_fields')
    const restored = draftModel.readStorefrontDraft(localScope, storage)
    assert(restored.status === 'ready' && JSON.stringify(restored.draft) === JSON.stringify(first), 'storefront_draft_reload_failed')
    assert(draftModel.readStorefrontDraft(managedScope, storage).status === 'empty', 'storefront_draft_leaked_across_scopes')

    const managed = await draftModel.saveStorefrontDraft({ ...input, storeName: 'Managed Shop' }, 0, managedScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:00:30.000Z',
    })
    assert(managed.scope === managedScope
      && managed.storeName === 'Managed Shop'
      && values.get(localKey) === firstRaw
      && values.has(managedKey),
    'storefront_draft_managed_scope_overwrote_local_scope')
    const legacyRecord = {
      schema: draftModel.LEGACY_STOREFRONT_DRAFT_SCHEMA,
      scope: legacyScope,
      revision: 7,
      savedAt: '2026-07-24T09:00:00.000Z',
      storeName: input.storeName,
      summary: input.summary,
      selectedSkus: [...input.selectedSkus].sort(),
    }
    const legacyRaw = JSON.stringify(legacyRecord)
    values.set(legacyKey, legacyRaw)
    const legacyRead = draftModel.readStorefrontDraft(legacyScope, storage)
    assert(legacyRead.status === 'legacy'
      && legacyRead.draft?.revision === 7
      && !('sourcePreviewDigest' in legacyRead.draft),
    'storefront_draft_legacy_record_not_exposed_for_upgrade')
    const migrated = await draftModel.saveStorefrontDraft(input, 7, legacyScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:00:45.000Z',
    })
    assert(migrated.revision === 8
      && migrated.sourcePreviewDigest === previewDigestA
      && values.get(legacyKey) === legacyRaw
      && draftModel.readStorefrontDraft(legacyScope, storage).status === 'ready',
    'storefront_draft_legacy_upgrade_not_additive_or_current')
    values.set(legacyKey, JSON.stringify({ ...legacyRecord, summary: 'Older fallback must stay ignored.' }))
    assert(draftModel.readStorefrontDraft(legacyScope, storage).draft?.summary === input.summary
      && values.has(migratedKey),
    'storefront_draft_v2_did_not_take_precedence')
    const reconciled = draftModel.reconcileStorefrontSelection(
      ['MANAGED-ONLY', 'SHARED-SKU'],
      ['LOCAL-ONLY', 'SHARED-SKU'],
    )
    assert(reconciled.selectedSkus.join(',') === 'SHARED-SKU'
      && reconciled.missingSkus.join(',') === 'MANAGED-ONLY',
    'storefront_draft_authoritative_catalog_reconciliation_failed')

    const replay = await draftModel.saveStorefrontDraft({ ...input, selectedSkus: [...input.selectedSkus].reverse() }, 1, localScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:01:00.000Z',
    })
    assert(replay.revision === 1 && replay.savedAt === first.savedAt && values.get(localKey) === firstRaw, 'storefront_draft_exact_replay_advanced_revision')
    const rebound = await draftModel.saveStorefrontDraft({ ...input, sourcePreviewDigest: previewDigestB }, 1, localScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:01:30.000Z',
    })
    const reboundRaw = values.get(localKey)
    assert(rebound.revision === 2
      && rebound.sourcePreviewDigest === previewDigestB
      && rebound.storeName === first.storeName,
    'storefront_draft_preview_proof_change_did_not_advance_revision')
    let staleRejected = false
    try {
      await draftModel.saveStorefrontDraft({ ...input, summary: 'Stale edit.' }, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-24T10:02:00.000Z',
      })
    } catch { staleRejected = true }
    assert(staleRejected && values.get(localKey) === reboundRaw, 'storefront_draft_stale_save_overwrote_current')

    const second = await draftModel.saveStorefrontDraft({ ...input, summary: 'Updated storefront copy.', sourcePreviewDigest: previewDigestB }, 2, localScope, {
      storage,
      locks,
      now: () => '2026-07-24T10:03:00.000Z',
    })
    assert(second.revision === 3 && second.summary === 'Updated storefront copy.', 'storefront_draft_update_did_not_advance_once')
    const secondRaw = values.get(localKey)
    for (const invalid of [
      { ...input, storeName: ' Mingalar Shop' },
      { ...input, selectedSkus: [] },
      { ...input, selectedSkus: ['SM-1001', 'SM-1001'] },
      { ...input, sourcePreviewDigest: 'sha256:not-a-proof' },
    ]) {
      let rejected = false
      try {
        await draftModel.saveStorefrontDraft(invalid, 3, localScope, {
          storage,
          locks,
          now: () => '2026-07-24T10:04:00.000Z',
        })
      } catch { rejected = true }
      assert(rejected && values.get(localKey) === secondRaw, 'storefront_draft_invalid_input_wrote_state')
    }

    let timestampRejected = false
    try {
      await draftModel.saveStorefrontDraft({ ...input, summary: 'Timestamp test.', sourcePreviewDigest: previewDigestB }, 3, localScope, {
        storage,
        locks,
        now: () => '2026-07-24T10:05:00Z',
      })
    } catch { timestampRejected = true }
    assert(timestampRejected && values.get(localKey) === secondRaw, 'storefront_draft_noncanonical_timestamp_written')

    values.set(localLegacyKey, JSON.stringify({ ...legacyRecord, scope: localScope }))
    values.set(localKey, '{broken')
    const malformed = draftModel.readStorefrontDraft(localScope, storage)
    let malformedSaveRejected = false
    try {
      await draftModel.saveStorefrontDraft(input, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-24T10:06:00.000Z',
      })
    } catch { malformedSaveRejected = true }
    assert(malformed.status === 'invalid'
      && malformedSaveRejected
      && values.get(localKey) === '{broken'
      && values.has(localLegacyKey),
    'storefront_draft_malformed_v2_replaced_or_fell_back')

    values.set(localKey, JSON.stringify({ ...first, unexpected: true }))
    assert(draftModel.readStorefrontDraft(localScope, storage).status === 'invalid', 'storefront_draft_extra_field_accepted')
    values.set(localKey, JSON.stringify({ ...first, scope: managedScope }))
    assert(draftModel.readStorefrontDraft(localScope, storage).status === 'invalid', 'storefront_draft_wrong_scope_record_accepted')
    const unavailable = draftModel.readStorefrontDraft(localScope, {
      getItem: () => { throw new Error('blocked') },
      setItem: storage.setItem,
      removeItem: storage.removeItem,
    })
    assert(unavailable.status === 'unavailable' && unavailable.draft === null, 'storefront_draft_unreadable_storage_not_reported')

    values.clear()
    lockRequests = 0
    lockCalls.length = 0
    const concurrent = await Promise.allSettled([
      draftModel.saveStorefrontDraft(input, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-24T10:07:00.000Z',
      }),
      draftModel.saveStorefrontDraft({ ...input, summary: 'Concurrent edit.' }, 0, localScope, {
        storage,
        locks,
        now: () => '2026-07-24T10:07:01.000Z',
      }),
    ])
    assert(lockRequests === 2
      && lockCalls.every((call) => call.name === `supermega:ecommerce:storefront-draft:${encodeURIComponent(localScope)}`
        && call.options?.mode === 'exclusive')
      && concurrent.filter((result) => result.status === 'fulfilled').length === 1
      && JSON.parse(values.get(localKey)).revision === 1,
    'storefront_draft_concurrent_save_not_serialized')

    const beforeFailure = values.get(localKey)
    const failingStorage = {
      getItem: storage.getItem,
      setItem: () => { throw new Error('quota') },
      removeItem: storage.removeItem,
    }
    let writeFailureRejected = false
    try {
      await draftModel.saveStorefrontDraft({ ...input, summary: 'Write failure.' }, 1, localScope, {
        storage: failingStorage,
        locks,
        now: () => '2026-07-24T10:08:00.000Z',
      })
    } catch { writeFailureRejected = true }
    assert(writeFailureRejected && values.get(localKey) === beforeFailure, 'storefront_draft_failed_write_changed_saved_value')

    let firstMismatchWrite = true
    const mismatchStorage = {
      getItem: storage.getItem,
      setItem: (key, value) => {
        values.set(key, firstMismatchWrite ? `${value}x` : String(value))
        firstMismatchWrite = false
      },
      removeItem: storage.removeItem,
    }
    let mismatchRejected = false
    try {
      await draftModel.saveStorefrontDraft({ ...input, summary: 'Confirmation failure.' }, 1, localScope, {
        storage: mismatchStorage,
        locks,
        now: () => '2026-07-24T10:09:00.000Z',
      })
    } catch { mismatchRejected = true }
    assert(mismatchRejected && values.get(localKey) === beforeFailure, 'storefront_draft_unconfirmed_write_not_rolled_back')
  } catch (error) {
    fail(`storefront_draft_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyStorefrontRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    storefrontRuntimeChecks += 1
  }
  try {
    const nonce = Date.now()
    const storefront = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-model.ts')).href}?storefront-verify=${nonce}`)
    const requestModel = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-request.ts')).href}?storefront-request=${nonce}`)
    const confirmModel = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-shop-confirm.ts')).href}?ecommerce-confirm=${nonce}`)
    const handoffModel = await import(pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-shop-handoff.ts')).href)
    const commerce = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href}?storefront-commerce=${nonce}`)
    const catalog = commerce.createSeedCommerce().items
    const input = {
      storeName: 'Mingalar Shop',
      summary: 'Clear prices and a small customer-ready catalog.',
      selectedSkus: ['SM-1003', 'SM-1001', 'SM-CARE-01'],
    }
    const preview = storefront.buildStorefrontPreview(catalog, input)
    const reordered = storefront.buildStorefrontPreview([...catalog].reverse(), input)
    assert(JSON.stringify(preview) === JSON.stringify(reordered), 'storefront_preview_depends_on_catalog_order')
    assert(preview.items.map((item) => item.sku).join(',') === 'SM-1001,SM-1003,SM-CARE-01', 'storefront_preview_items_not_canonical')
    const serialized = JSON.stringify(preview)
    assert(!serialized.includes('onHand') && !serialized.includes('reorderAt'), 'storefront_preview_leaked_shop_stock_fields')
    const firstDigest = await storefront.storefrontPreviewDigest(preview)
    const retryDigest = await storefront.storefrontPreviewDigest(reordered)
    assert(firstDigest === retryDigest && /^sha256:[a-f0-9]{64}$/.test(firstDigest), 'storefront_digest_not_deterministic_sha256')
    const managedPreviewBase = { ...commerce.createEmptyCommerce(), items: catalog }
    const managedPreviewCatalogDigest = await commerce.commerceCatalogDigest(managedPreviewBase)
    const managedPreviewProof = {
      actionId: commerce.commerceStorefrontConfigurationActionId(1, managedPreviewCatalogDigest),
      capturedAt: '2026-07-24T08:59:00.000Z',
      actor: 'OP-OWNER',
      reason: 'Bind the customer preview parity vector.',
      evidenceReference: `ECOMMERCE-STOREFRONT:${managedPreviewCatalogDigest}:R1`,
    }
    const managedPreviewState = await commerce.saveCommerceStorefrontConfiguration(
      managedPreviewBase,
      { ...input, shopCatalogDigest: managedPreviewCatalogDigest },
      managedPreviewProof,
    )
    assert(managedPreviewState
      && await commerce.commerceStorefrontPreviewDigest(managedPreviewState) === firstDigest,
    'storefront_customer_and_managed_preview_digests_diverged')
    const changed = storefront.buildStorefrontPreview(catalog, { ...input, summary: 'Changed storefront copy.' })
    assert(await storefront.storefrontPreviewDigest(changed) !== firstDigest, 'storefront_digest_ignored_copy_change')
    const repriced = storefront.buildStorefrontPreview(
      catalog.map((item) => item.sku === 'SM-1001' ? { ...item, price: item.price + 1 } : item),
      input,
    )
    assert(await storefront.storefrontPreviewDigest(repriced) !== firstDigest, 'storefront_digest_ignored_selected_price_change')
    const soldOut = storefront.buildStorefrontPreview(
      catalog.map((item) => item.sku === 'SM-1001' ? { ...item, onHand: 0 } : item),
      input,
    )
    assert(await storefront.storefrontPreviewDigest(soldOut) !== firstDigest, 'storefront_digest_ignored_selected_availability_change')

    let duplicateCatalogRejected = false
    try { storefront.buildStorefrontPreview([...catalog, catalog[0]], input) } catch { duplicateCatalogRejected = true }
    assert(duplicateCatalogRejected, 'storefront_duplicate_catalog_sku_accepted')
    let duplicateSelectionRejected = false
    try { storefront.buildStorefrontPreview(catalog, { ...input, selectedSkus: ['SM-1001', 'SM-1001'] }) } catch { duplicateSelectionRejected = true }
    assert(duplicateSelectionRejected, 'storefront_duplicate_selection_accepted')
    let unknownSelectionRejected = false
    try { storefront.buildStorefrontPreview(catalog, { ...input, selectedSkus: ['UNKNOWN-SKU'] }) } catch { unknownSelectionRejected = true }
    assert(unknownSelectionRejected, 'storefront_unknown_sku_accepted')

    let writes = 0
    const raw = JSON.stringify(commerce.createSeedCommerce())
    const currentSnapshot = storefront.readStorefrontCatalog({
      getItem: () => raw,
      setItem: () => { writes += 1 },
    })
    assert(currentSnapshot.source === 'shop-local' && currentSnapshot.items.length === catalog.length && writes === 0, 'storefront_shop_catalog_read_wrote_or_changed_state')
    const sampleSnapshot = storefront.readStorefrontCatalog({
      getItem: () => null,
      setItem: () => { writes += 1 },
    })
    assert(sampleSnapshot.source === 'sample' && sampleSnapshot.items.length > 0 && writes === 0, 'storefront_sample_catalog_wrote_state')
    const malformedSnapshot = storefront.readStorefrontCatalog({
      getItem: () => '{broken',
      setItem: () => { writes += 1 },
    })
    assert(malformedSnapshot.source === 'unavailable' && malformedSnapshot.items.length === 0 && writes === 0, 'storefront_malformed_shop_catalog_did_not_fail_closed')

    const requestAssert = (condition, reason) => {
      if (!condition) throw new Error(reason)
      storefrontRequestRuntimeChecks += 1
    }
    const requestInput = {
      idempotencyKey: 'ECI-12345678-1234-4ABC-8ABC-1234567890AB',
      customerReference: 'Customer A',
      sku: 'SM-1001',
      quantity: 2,
      fulfilment: 'pickup',
      createdAt: '2026-07-24T09:00:00.000Z',
    }
    const request = await requestModel.buildStorefrontOrderRequest(preview, firstDigest, requestInput)
    requestAssert(request.id === 'ECR-12345678-1234-4ABC-8ABC-1234567890AB' && request.state === 'pending_shop_review', 'storefront_request_identity_or_state_invalid')
    requestAssert(request.totalMmk === 37_000 && request.line.unitPriceMmk === 18_500 && request.line.quantity === 2, 'storefront_request_price_snapshot_invalid')
    requestAssert(!JSON.stringify(request).includes('onHand') && !JSON.stringify(request).includes('reorderAt'), 'storefront_request_leaked_shop_stock_fields')
    const emptyLedger = requestModel.createEmptyStorefrontRequestLedger()
    const legacyLocalReceipt = { ...request }
    delete legacyLocalReceipt.sourceStorefrontRevision
    delete legacyLocalReceipt.sourceStorefrontActionId
    const legacyLocalLedger = requestModel.recordStorefrontOrderRequest(emptyLedger, legacyLocalReceipt)
    requestAssert(legacyLocalLedger
      && requestModel.storefrontRequestLedgerContains(legacyLocalLedger, legacyLocalReceipt),
    'legacy_local_storefront_receipt_became_unreadable')
    const recorded = requestModel.recordStorefrontOrderRequest(emptyLedger, request)
    requestAssert(recorded?.requests.length === 1 && recorded.requests[0].id === request.id, 'storefront_request_not_recorded')
    requestAssert(requestModel.recordStorefrontOrderRequest(recorded, request) === recorded, 'storefront_request_exact_retry_not_idempotent')
    const reorderedReceipt = { totalMmk: request.totalMmk, ...request }
    requestAssert(JSON.stringify(reorderedReceipt) !== JSON.stringify(request)
      && requestModel.recordStorefrontOrderRequest(recorded, reorderedReceipt) === recorded,
    'storefront_request_reordered_retry_not_idempotent')
    const conflicting = { ...request, totalMmk: request.totalMmk + request.line.unitPriceMmk, line: { ...request.line, quantity: 3 } }
    requestAssert(requestModel.recordStorefrontOrderRequest(recorded, conflicting) === null, 'storefront_request_conflicting_retry_succeeded')
    requestAssert(requestModel.recordStorefrontOrderRequest(recorded, { ...request, currency: 'USD' }) === null, 'storefront_request_tampered_currency_accepted')
    requestAssert(requestModel.recordStorefrontOrderRequest({ ...recorded, unexpected: true }, request) === null, 'storefront_request_malformed_ledger_accepted')

    let staleDigestRejected = false
    try { await requestModel.buildStorefrontOrderRequest(preview, await storefront.storefrontPreviewDigest(changed), requestInput) } catch { staleDigestRejected = true }
    requestAssert(staleDigestRejected, 'storefront_request_stale_digest_accepted')
    let unknownSkuRejected = false
    try { await requestModel.buildStorefrontOrderRequest(preview, firstDigest, { ...requestInput, sku: 'UNKNOWN-SKU' }) } catch { unknownSkuRejected = true }
    requestAssert(unknownSkuRejected, 'storefront_request_unknown_sku_accepted')
    let oversizedRejected = false
    try { await requestModel.buildStorefrontOrderRequest(preview, firstDigest, { ...requestInput, quantity: 100 }) } catch { oversizedRejected = true }
    requestAssert(oversizedRejected, 'storefront_request_oversized_quantity_accepted')
    const soldOutPreview = { ...preview, items: preview.items.map((item, index) => index === 0 ? { ...item, availability: 'sold_out' } : item) }
    let soldOutRejected = false
    try { await requestModel.buildStorefrontOrderRequest(soldOutPreview, await storefront.storefrontPreviewDigest(soldOutPreview), requestInput) } catch { soldOutRejected = true }
    requestAssert(soldOutRejected, 'storefront_request_sold_out_item_accepted')
    let tamperedPreviewRejected = false
    try { await storefront.storefrontPreviewDigest({ ...preview, unexpected: true }) } catch { tamperedPreviewRejected = true }
    requestAssert(tamperedPreviewRejected, 'storefront_preview_extra_field_accepted')

    const handoffAssert = (condition, reason) => {
      if (!condition) throw new Error(reason)
      ecommerceHandoffRuntimeChecks += 1
    }
    const catalogBeforeHandoff = JSON.stringify(catalog)
    const handoffInput = {
      request,
      requestLedger: recorded,
      preview,
      sourcePreviewDigest: firstDigest,
      currentCatalog: catalog,
      confirmedAt: '2026-07-24T09:01:00.000Z',
    }
    const draft = await confirmModel.confirmEcommerceShopDraft(handoffInput)
    handoffAssert(draft.id === 'ESD-12345678-1234-4ABC-8ABC-1234567890AB' && draft.state === 'review_required', 'ecommerce_handoff_identity_or_state_invalid')
    handoffAssert(draft.customerReference === request.customerReference
      && draft.fulfilment === request.fulfilment
      && JSON.stringify(draft.line) === JSON.stringify(request.line)
      && draft.totalMmk === request.totalMmk, 'ecommerce_handoff_dropped_request_fields')
    handoffAssert(draft.evidenceReference === `ECOMMERCE:${request.id}:${firstDigest}`, 'ecommerce_handoff_evidence_not_bound')
    handoffAssert(!JSON.stringify(draft).includes('onHand') && !JSON.stringify(draft).includes('reorderAt'), 'ecommerce_handoff_leaked_stock_fields')
    handoffAssert(JSON.stringify(catalog) === catalogBeforeHandoff, 'ecommerce_handoff_mutated_catalog')
    handoffAssert(handoffModel.readLatestEcommerceShopDraft() === draft, 'ecommerce_handoff_not_retained_in_memory')
    handoffAssert(await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, confirmedAt: '2026-07-24T09:02:00.000Z' }) === draft, 'ecommerce_handoff_exact_retry_not_idempotent')
    handoffAssert(handoffModel.ecommerceShopDraftMatchesCatalog(draft, catalog), 'ecommerce_handoff_shop_guard_rejected_current_catalog')

    let unrecordedRejected = false
    try { await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, requestLedger: emptyLedger }) } catch { unrecordedRejected = true }
    handoffAssert(unrecordedRejected, 'ecommerce_handoff_unrecorded_receipt_accepted')
    const conflictingRequest = { ...request, customerReference: 'Customer B' }
    const conflictingLedger = { schema: recorded.schema, requests: [conflictingRequest] }
    let conflictingRequestRejected = false
    try { await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, request: conflictingRequest, requestLedger: conflictingLedger }) } catch { conflictingRequestRejected = true }
    handoffAssert(conflictingRequestRejected, 'ecommerce_handoff_conflicting_request_replay_accepted')
    const repricedCatalog = catalog.map((item) => item.sku === request.line.sku ? { ...item, price: item.price + 500 } : item)
    let repricedCatalogRejected = false
    try { await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, currentCatalog: repricedCatalog }) } catch { repricedCatalogRejected = true }
    handoffAssert(repricedCatalogRejected, 'ecommerce_handoff_repriced_catalog_accepted')
    const insufficientCatalog = catalog.map((item) => item.sku === request.line.sku ? { ...item, onHand: request.line.quantity - 1 } : item)
    let insufficientStockRejected = false
    try { await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, currentCatalog: insufficientCatalog }) } catch { insufficientStockRejected = true }
    handoffAssert(insufficientStockRejected, 'ecommerce_handoff_insufficient_stock_accepted')
    let stalePreviewRejected = false
    try { await confirmModel.confirmEcommerceShopDraft({ ...handoffInput, preview: changed }) } catch { stalePreviewRejected = true }
    handoffAssert(stalePreviewRejected, 'ecommerce_handoff_stale_preview_accepted')
    const laterRequest = await requestModel.buildStorefrontOrderRequest(preview, firstDigest, {
      ...requestInput,
      idempotencyKey: 'ECI-12345678-1234-4ABC-8ABC-1234567890AC',
    })
    const laterLedger = requestModel.recordStorefrontOrderRequest(emptyLedger, laterRequest)
    let earlyConfirmationRejected = false
    try {
      await confirmModel.confirmEcommerceShopDraft({
        ...handoffInput,
        request: laterRequest,
        requestLedger: laterLedger,
        confirmedAt: '2026-07-24T08:59:59.000Z',
      })
    } catch { earlyConfirmationRejected = true }
    handoffAssert(earlyConfirmationRejected, 'ecommerce_handoff_confirmation_before_receipt_accepted')
    handoffAssert(!handoffModel.ecommerceShopDraftMatchesCatalog({ ...draft, unexpected: true }, catalog), 'ecommerce_handoff_extra_field_accepted')
    handoffAssert(handoffModel.dismissEcommerceShopDraft(draft.id) && handoffModel.readLatestEcommerceShopDraft() === null, 'ecommerce_handoff_memory_draft_not_dismissed')
  } catch (error) {
    fail(`storefront_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyManagedWebsiteRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    managedWebsiteRuntimeChecks += 1
  }
  try {
    const nonce = Date.now()
    const managedWebsite = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'managed-website.ts')).href}?managed-website=${nonce}`)
    const website = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'website', 'website-model.ts')).href}?managed-website-model=${nonce}`)
    const identity = { userId: 'OP-WEBSITE', email: 'operator@example.test', workspaceId: 'workspace-website' }
    assert(managedWebsite.sameManagedWebsiteIdentity(identity, { ...identity }), 'managed_website_matching_identity_rejected')
    assert(!managedWebsite.sameManagedWebsiteIdentity(identity, { ...identity, workspaceId: 'workspace-other' }), 'managed_website_workspace_switch_accepted')
    const seed = website.createInitialWorkspace()
    const commandId = '12345678-1234-4abc-8abc-1234567890ab'
    const result = {
      command_id: commandId,
      surface: 'website',
      event_type: 'website.workspace.initialized',
      version: 1,
      state: seed,
      idempotent_replay: false,
    }
    const accepted = managedWebsite.acceptManagedWebsiteCommand(seed, result, {
      commandId,
      eventType: 'website.workspace.initialized',
      priorVersion: 0,
    })
    assert(accepted.workspace.schema === seed.schema && accepted.version === 1 && !accepted.replayed, 'managed_website_matching_receipt_rejected')
    const reverseObjectKeys = (value) => {
      if (Array.isArray(value)) return value.map(reverseObjectKeys)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => [key, reverseObjectKeys(nested)]))
    }
    const reordered = managedWebsite.acceptManagedWebsiteCommand(seed, {
      ...result,
      state: reverseObjectKeys(seed),
    }, {
      commandId,
      eventType: 'website.workspace.initialized',
      priorVersion: 0,
    })
    assert(reordered.workspace.schema === seed.schema, 'managed_website_jsonb_key_order_rejected')
    for (const [label, changed] of [
      ['command', { ...result, command_id: '12345678-1234-4abc-8abc-1234567890ac' }],
      ['surface', { ...result, surface: 'commerce' }],
      ['event', { ...result, event_type: 'website.content.saved' }],
      ['version', { ...result, version: 2 }],
      ['replay_shape', { ...result, idempotent_replay: 'false' }],
    ]) {
      let rejected = false
      try {
        managedWebsite.acceptManagedWebsiteCommand(seed, changed, {
          commandId,
          eventType: 'website.workspace.initialized',
          priorVersion: 0,
        })
      } catch { rejected = true }
      assert(rejected, `managed_website_${label}_receipt_accepted`)
    }
    const changedState = website.applyWebsiteWorkspaceUpdate(
      seed,
      (current) => ({ ...current, selectedPageId: current.pages[1].id }),
    )
    assert(changedState.ok && changedState.changed, 'managed_website_state_fixture_invalid')
    let swappedStateRejected = false
    try {
      managedWebsite.acceptManagedWebsiteCommand(seed, {
        ...result,
        state: changedState.ok ? changedState.workspace : seed,
      }, {
        commandId,
        eventType: 'website.workspace.initialized',
        priorVersion: 0,
      })
    } catch { swappedStateRejected = true }
    assert(swappedStateRejected, 'managed_website_swapped_state_receipt_accepted')
  } catch (error) {
    fail(`managed_website_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

async function verifyManagedStorefrontRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    managedStorefrontRuntimeChecks += 1
  }
  try {
    const nonce = Date.now()
    const model = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'managed-storefront.ts')).href}?managed-storefront=${nonce}`)
    const commerce = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href}?managed-storefront-commerce=${nonce}`)
    const managedTrial = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'managed-trial.ts')).href}?managed-storefront-trial=${nonce}`)
    const identity = { userId: 'OP-MANAGED', email: 'operator@example.test', workspaceId: 'workspace-managed' }
    const bootstrapIdentity = {
      identity: {
        workspace_id: identity.workspaceId,
        actor_id: identity.userId,
        actor_kind: 'human',
      },
      readiness: {},
      states: {},
      approvals: [],
    }
    assert(managedTrial.assertManagedBootstrapIdentity(bootstrapIdentity, identity) === bootstrapIdentity, 'managed_storefront_matching_bootstrap_identity_rejected')
    let mismatchedBootstrapRejected = false
    try {
      managedTrial.assertManagedBootstrapIdentity({
        ...bootstrapIdentity,
        identity: { ...bootstrapIdentity.identity, workspace_id: 'workspace-other' },
      }, identity)
    } catch { mismatchedBootstrapRejected = true }
    assert(mismatchedBootstrapRejected, 'managed_storefront_mismatched_bootstrap_identity_accepted')
    let malformedBootstrapRejected = false
    try {
      managedTrial.assertManagedBootstrapIdentity({ identity: bootstrapIdentity.identity }, identity)
    } catch { malformedBootstrapRejected = true }
    assert(malformedBootstrapRejected, 'managed_storefront_malformed_bootstrap_accepted')
    const state = commerce.createSeedCommerce()
    const before = JSON.stringify(state)
    const input = {
      storeName: 'Mingalar Shop',
      summary: 'A small managed catalog for customer requests.',
      selectedSkus: ['SM-CARE-01', 'SM-1001'],
    }
    const plan = await model.prepareManagedStorefrontSave(
      state,
      input,
      'OP-MANAGED',
      '2026-07-25T00:00:00.000Z',
    )
    assert(plan.status === 'ready'
      && plan.configuration.revision === 1
      && plan.configuration.shopCatalogSnapshotRevision === 1, 'managed_storefront_first_revision_invalid')
    assert(JSON.stringify(state) === before, 'managed_storefront_plan_mutated_input')
    assert(/^sha256:[a-f0-9]{64}$/.test(plan.configuration.shopCatalogDigest)
      && plan.evidence.actionId === commerce.commerceStorefrontConfigurationActionId(1, plan.configuration.shopCatalogDigest), 'managed_storefront_digest_or_action_identity_invalid')
    const authoritative = structuredClone(plan.next)
    authoritative.storefrontConfiguration.saved.capturedAt = '2026-07-25T00:00:01+00:00'
    const commandResult = {
      command_id: '00000000-0000-4000-8000-000000000101',
      surface: 'commerce',
      event_type: 'commerce.storefront.configuration.saved',
      version: 8,
      state: authoritative,
      idempotent_replay: false,
    }
    const acceptedReceipt = model.acceptManagedStorefrontCommand(plan, commandResult, {
      commandId: commandResult.command_id,
      priorVersion: 7,
      actor: 'OP-MANAGED',
    })
    const accepted = acceptedReceipt.state
    assert(acceptedReceipt.version === 8 && acceptedReceipt.replayed === false, 'managed_storefront_command_receipt_not_retained')
    let swappedReceiptRejected = false
    try {
      model.acceptManagedStorefrontCommand(plan, {
        ...commandResult,
        command_id: '00000000-0000-4000-8000-000000000102',
      }, {
        commandId: commandResult.command_id,
        priorVersion: 7,
        actor: 'OP-MANAGED',
      })
    } catch { swappedReceiptRejected = true }
    assert(swappedReceiptRejected, 'managed_storefront_swapped_command_receipt_accepted')
    assert(model.readManagedStorefront(accepted)?.storeName === input.storeName, 'managed_storefront_accepted_configuration_unreadable')
    const unchanged = await model.prepareManagedStorefrontSave(
      accepted,
      input,
      'OP-MANAGED',
      '2026-07-25T00:01:00.000Z',
    )
    assert(unchanged.status === 'unchanged' && unchanged.configuration.revision === 1, 'managed_storefront_exact_retry_advanced_revision')
    const repricedItem = accepted.items[0]
    const repricedAccepted = commerce.updateCommerceItem(accepted, {
      sku: repricedItem.sku,
      expectedPrice: repricedItem.price,
      nextPrice: repricedItem.price + 500,
      expectedReorderAt: repricedItem.reorderAt,
      nextReorderAt: repricedItem.reorderAt,
    }, {
      actionId: 'ACT-MANAGED-STOREFRONT-REPRICE',
      capturedAt: '2026-07-25T00:01:15.000Z',
      actor: 'OP-MANAGED',
      reason: 'Approved the reviewed catalog price before rebinding the storefront.',
      evidenceReference: 'EV-MANAGED-STOREFRONT-REPRICE',
    })
    assert(repricedAccepted, 'managed_storefront_reprice_fixture_failed')
    const rebound = await model.prepareManagedStorefrontSave(
      repricedAccepted,
      input,
      'OP-MANAGED',
      '2026-07-25T00:01:30.000Z',
    )
    assert(rebound.status === 'ready'
      && rebound.configuration.revision === 2
      && rebound.configuration.shopCatalogSnapshotRevision === 2
      && rebound.configuration.shopCatalogDigest !== plan.configuration.shopCatalogDigest,
    'managed_storefront_stale_catalog_could_not_rebind')
    const changed = await model.prepareManagedStorefrontSave(
      accepted,
      { ...input, summary: 'Updated managed storefront copy.' },
      'OP-MANAGED',
      '2026-07-25T00:02:00.000Z',
    )
    assert(changed.status === 'ready'
      && changed.configuration.revision === 2
      && changed.configuration.shopCatalogSnapshotRevision === 1, 'managed_storefront_copy_change_revision_invalid')

    const stockTampered = structuredClone(plan.next)
    stockTampered.items[0].onHand += 1
    let stockTamperRejected = false
    try { model.acceptManagedStorefrontSave(plan, stockTampered, 'OP-MANAGED') } catch { stockTamperRejected = true }
    assert(stockTamperRejected, 'managed_storefront_stock_side_effect_accepted')
    const actorTampered = structuredClone(plan.next)
    actorTampered.storefrontConfiguration.saved.actor = 'OTHER-ACTOR'
    let actorTamperRejected = false
    try { model.acceptManagedStorefrontSave(plan, actorTampered, 'OP-MANAGED') } catch { actorTamperRejected = true }
    assert(actorTamperRejected, 'managed_storefront_actor_tamper_accepted')
    const unknownSkuRejected = await model.prepareManagedStorefrontSave(
      state,
      { ...input, selectedSkus: ['UNKNOWN-SKU'] },
      'OP-MANAGED',
      '2026-07-25T00:03:00.000Z',
    ).then(() => false, () => true)
    assert(unknownSkuRejected, 'managed_storefront_unknown_sku_accepted')

    const mutable = structuredClone(state)
    const mutationSafePlanPromise = model.prepareManagedStorefrontSave(
      mutable,
      input,
      'OP-MANAGED',
      '2026-07-25T00:04:00.000Z',
    )
    mutable.items[0].onHand += 1_000
    const mutationSafePlan = await mutationSafePlanPromise
    assert(mutationSafePlan.current.items[0].onHand === state.items[0].onHand
      && mutationSafePlan.next.items[0].onHand === state.items[0].onHand, 'managed_storefront_async_plan_observed_late_mutation')
  } catch (error) {
    fail(`managed_storefront_runtime:${error instanceof Error ? error.message : 'unknown'}`)
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
    removeItem: (key) => values.delete(key),
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
    for (const createdAt of ['2026-02-30T10:00:00.000Z', '20260723T100000+0630', '٢٠٢٦-07-23T10:00:00.000Z']) {
      assertThrows(() => model.validateProductionState({
        ...model.createEmptyProduction(),
        issues: [{ ...duplicateIssue, createdAt }],
      }), `production_noncanonical_timestamp_accepted:${createdAt}`)
    }
    assertThrows(() => model.validateProductionState({ ...ledger501, revision: 500 }), 'production_revision_event_mismatch_accepted')

    const base = {
      ...model.createEmptyProduction(),
      jobs: [{ id: 'JOB-1', line: 'Line 01', product: 'Test batch', target: 100, output: 90 }],
      machines: [{ id: 'MC-1', name: 'Test machine', state: 'running' }],
    }
    const newJob = {
      id: 'JOB-2',
      line: 'Line 02',
      product: 'Second batch',
      target: 250,
      output: 0,
      owner: 'Line 02 lead',
      priority: 'urgent',
      dueAt: '2026-07-24T10:00:00.000Z',
    }
    const jobProof = proof('ACT-JOB-CREATE')
    const withJob = model.registerProductionJob(base, newJob, jobProof)
    assert(withJob?.jobs[0].id === newJob.id && withJob.jobs[0].output === 0 && withJob.revision === 1 && withJob.events[0].kind === 'job_created', 'production_job_not_created_once')
    assert(withJob.events[0].jobPriority === newJob.priority
      && withJob.events[0].jobDueAt === newJob.dueAt
      && withJob.events[0].jobOwner === newJob.owner,
    'production_job_plan_not_frozen')
    assert(model.registerProductionJob(withJob, newJob, jobProof) === withJob, 'production_job_retry_not_idempotent')
    assert(model.registerProductionJob(withJob, { ...newJob, target: 251 }, jobProof) === null, 'production_job_conflicting_retry_succeeded')
    assert(model.registerProductionJob(withJob, newJob, proof('ACT-JOB-DUPLICATE')) === null, 'production_duplicate_job_id_succeeded')
    assert(model.registerProductionJob(withJob, { ...newJob, id: 'JOB-3' }, jobProof) === null, 'production_job_reused_action_id_succeeded')
    assert(model.registerProductionJob(base, { ...newJob, priority: undefined, dueAt: undefined }, proof('ACT-JOB-UNSCHEDULED')) === null, 'production_unscheduled_job_succeeded')
    assert(model.registerProductionJob(base, { ...newJob, owner: undefined }, proof('ACT-JOB-UNOWNED')) === null, 'production_unowned_job_succeeded')
    assert(model.registerProductionJob(base, { ...newJob, priority: 'invalid' }, proof('ACT-JOB-PRIORITY')) === null, 'production_invalid_job_priority_succeeded')
    assert(model.registerProductionJob(base, { ...newJob, dueAt: jobProof.capturedAt }, proof('ACT-JOB-OVERDUE')) === null, 'production_nonfuture_job_due_succeeded')
    assertThrows(() => model.validateProductionState({
      ...withJob,
      jobs: [{ ...withJob.jobs[0], priority: 'low' }, ...withJob.jobs.slice(1)],
    }), 'production_job_schedule_rewrite_accepted')
    assertThrows(() => model.validateProductionState({
      ...withJob,
      events: [{ ...withJob.events[0], jobDueAt: '2026-07-25T10:00:00.000Z' }, ...withJob.events.slice(1)],
    }), 'production_job_event_schedule_rewrite_accepted')
    const scheduleProof = proof('ACT-JOB-SCHEDULE', 500)
    const rescheduled = model.updateProductionJobPlan(withJob, newJob.id, 'low', '2026-07-25T10:00:00.000Z', 'Night shift lead', scheduleProof)
    assert(rescheduled?.jobs[0].priority === 'low'
      && rescheduled.jobs[0].dueAt === '2026-07-25T10:00:00.000Z'
      && rescheduled.jobs[0].owner === 'Night shift lead'
      && rescheduled.jobs[0].target === newJob.target
      && rescheduled.jobs[0].output === 0
      && rescheduled.events[0].kind === 'job_schedule_updated'
      && rescheduled.events[0].fromJobPriority === newJob.priority
      && rescheduled.events[0].fromJobDueAt === newJob.dueAt
      && rescheduled.events[0].fromJobOwner === newJob.owner
      && rescheduled.events[0].jobPriority === 'low'
      && rescheduled.events[0].jobOwner === 'Night shift lead',
    'production_job_plan_not_updated_exactly')
    assert(model.updateProductionJobPlan(rescheduled, newJob.id, 'low', '2026-07-25T10:00:00.000Z', 'Night shift lead', scheduleProof) === rescheduled, 'production_job_plan_retry_not_idempotent')
    assert(model.updateProductionJobPlan(rescheduled, newJob.id, 'normal', '2026-07-25T10:00:00.000Z', 'Night shift lead', scheduleProof) === null, 'production_job_plan_conflicting_retry_succeeded')
    assert(model.updateProductionJobPlan(rescheduled, newJob.id, 'low', '2026-07-25T10:00:00.000Z', 'Night shift lead', proof('ACT-JOB-SCHEDULE-NOOP', 600)) === null, 'production_job_plan_noop_succeeded')
    assert(model.updateProductionJobPlan(withJob, newJob.id, 'low', scheduleProof.capturedAt, 'Night shift lead', proof('ACT-JOB-SCHEDULE-NONFUTURE', 500)) === null, 'production_job_plan_nonfuture_due_succeeded')
    assert(['', ' Shift lead', 'Shift lead ', 'X'.repeat(121)].every((owner, index) => model.updateProductionJobPlan(withJob, newJob.id, 'low', '2026-07-25T10:00:00.000Z', owner, proof(`ACT-JOB-PLAN-BAD-OWNER-${index}`, 500)) === null), 'production_invalid_job_owner_succeeded')
    assert(model.updateProductionJobPlan(rescheduled, 'JOB-1', 'urgent', '2026-07-25T10:00:00.000Z', 'Legacy line lead', scheduleProof) === null, 'production_job_plan_action_reuse_succeeded')
    const chainedScheduleProof = proof('ACT-JOB-SCHEDULE-CHAIN', 1_000)
    const chainedSchedule = model.updateProductionJobPlan(rescheduled, newJob.id, 'normal', '2026-07-26T10:00:00.000Z', 'Finishing supervisor', chainedScheduleProof)
    assert(chainedSchedule?.events[0].fromJobPriority === 'low'
      && chainedSchedule.events[0].fromJobDueAt === '2026-07-25T10:00:00.000Z'
      && chainedSchedule.events[0].fromJobOwner === 'Night shift lead'
      && chainedSchedule.events[0].jobOwner === 'Finishing supervisor'
      && chainedSchedule.events[1].fromJobPriority === 'urgent',
    'production_job_plan_history_not_chained')
    assertThrows(() => model.validateProductionState({
      ...rescheduled,
      events: [{ ...rescheduled.events[0], fromJobPriority: 'normal' }, ...rescheduled.events.slice(1)],
    }), 'production_job_schedule_previous_snapshot_tamper_accepted')
    assertThrows(() => model.validateProductionState({
      ...rescheduled,
      jobs: [{ ...rescheduled.jobs[0], dueAt: '2026-07-27T10:00:00.000Z' }, ...rescheduled.jobs.slice(1)],
    }), 'production_job_schedule_current_snapshot_tamper_accepted')
    assertThrows(() => model.validateProductionState({
      ...rescheduled,
      jobs: [{ ...rescheduled.jobs[0], owner: 'Unrecorded reassignment' }, ...rescheduled.jobs.slice(1)],
    }), 'production_job_owner_current_snapshot_tamper_accepted')
    assertThrows(() => model.validateProductionState({
      ...rescheduled,
      events: [{ ...rescheduled.events[0], fromJobOwner: 'Different previous owner' }, ...rescheduled.events.slice(1)],
    }), 'production_job_owner_previous_snapshot_tamper_accepted')
    const legacySchedule = model.updateProductionJobPlan(base, 'JOB-1', 'normal', '2026-07-25T10:00:00.000Z', 'Legacy line lead', proof('ACT-JOB-SCHEDULE-LEGACY', 500))
    assert(legacySchedule?.jobs[0].priority === 'normal'
      && legacySchedule.jobs[0].owner === 'Legacy line lead'
      && legacySchedule.events[0].kind === 'job_schedule_updated'
      && legacySchedule.events[0].fromJobPriority === undefined
      && legacySchedule.events[0].fromJobDueAt === undefined
      && legacySchedule.events[0].fromJobOwner === undefined
      && legacySchedule.events[0].jobOwner === 'Legacy line lead',
    'production_legacy_job_first_plan_rejected')
    const scheduleOnlyProof = proof('ACT-JOB-SCHEDULE-ONLY-OLD', 400)
    const scheduleOnly = model.validateProductionState({
      ...base,
      revision: 1,
      jobs: [{ ...base.jobs[0], priority: 'normal', dueAt: '2026-07-25T10:00:00.000Z' }],
      events: [{
        id: `EVT-${scheduleOnlyProof.actionId}`,
        actionId: scheduleOnlyProof.actionId,
        createdAt: scheduleOnlyProof.capturedAt,
        actor: scheduleOnlyProof.actor,
        reason: scheduleOnlyProof.reason,
        evidenceReference: scheduleOnlyProof.evidenceReference,
        kind: 'job_schedule_updated',
        subjectId: 'JOB-1',
        summary: 'Updated Test batch schedule for Line 01',
        jobPriority: 'normal',
        jobDueAt: '2026-07-25T10:00:00.000Z',
      }],
    })
    const upgradedScheduleOnly = model.updateProductionJobPlan(scheduleOnly, 'JOB-1', 'normal', '2026-07-25T10:00:00.000Z', 'Named shift lead', proof('ACT-JOB-SCHEDULE-ONLY-UPGRADE', 600))
    assert(upgradedScheduleOnly?.jobs[0].owner === 'Named shift lead'
      && upgradedScheduleOnly.events[0].fromJobOwner === undefined
      && upgradedScheduleOnly.events[1].jobOwner === undefined
      && upgradedScheduleOnly.events[1].summary === 'Updated Test batch schedule for Line 01',
    'production_schedule_only_history_upgrade_failed')
    const latestOutput = model.recordProductionOutput(base, 'JOB-1', 1, '2026-07-24 Day', proof('ACT-JOB-SCHEDULE-LATEST-OUTPUT', 2_000))
    assert(model.updateProductionJobPlan(latestOutput, 'JOB-1', 'urgent', '2026-07-25T10:00:00.000Z', 'Legacy line lead', proof('ACT-JOB-SCHEDULE-BACKDATED', 1_500)) === null, 'production_backdated_job_plan_succeeded')
    assert(model.updateProductionJobPlan({ ...base, jobs: [{ ...base.jobs[0], output: 100 }] }, 'JOB-1', 'urgent', '2026-07-25T10:00:00.000Z', 'Legacy line lead', proof('ACT-JOB-SCHEDULE-COMPLETE', 500)) === null, 'production_completed_job_plan_succeeded')
    const completedScheduleProof = proof('ACT-JOB-SCHEDULE-COMPLETE-FORGED', 500)
    assertThrows(() => model.validateProductionState({
      ...base,
      revision: 1,
      jobs: [{ ...base.jobs[0], output: 100, owner: 'Legacy line lead', priority: 'urgent', dueAt: '2026-07-25T10:00:00.000Z' }],
      events: [{
        id: `EVT-${completedScheduleProof.actionId}`,
        actionId: completedScheduleProof.actionId,
        createdAt: completedScheduleProof.capturedAt,
        actor: completedScheduleProof.actor,
        reason: completedScheduleProof.reason,
        evidenceReference: completedScheduleProof.evidenceReference,
        kind: 'job_schedule_updated',
        subjectId: 'JOB-1',
        summary: 'Updated Test batch plan for Line 01',
        jobPriority: 'urgent',
        jobDueAt: '2026-07-25T10:00:00.000Z',
        jobOwner: 'Legacy line lead',
      }],
    }), 'production_completed_job_forged_plan_state_accepted')
    assert([
      { ...newJob, id: '', target: 1 },
      { ...newJob, id: 'JOB-BAD-0', target: 0 },
      { ...newJob, id: 'JOB-BAD-FLOAT', target: 1.5 },
      { ...newJob, id: 'JOB-BAD-OUTPUT', output: 1 },
    ].every((job, index) => model.registerProductionJob(base, job, proof(`ACT-JOB-BAD-${index}`)) === null), 'production_invalid_job_succeeded')
    const closeShiftRef = '2026-07-24 Close'
    const closeProof = proof('ACT-JOB-CLOSE')
    const closedShort = model.closeProductionJob(base, 'JOB-1', closeShiftRef, closeProof)
    assert(closedShort?.jobs[0].closure?.remainingUnits === 10
      && closedShort.jobs[0].closure.shiftRef === closeShiftRef
      && closedShort.events[0].kind === 'job_closed'
      && closedShort.events[0].remainingQuantity === 10,
    'production_job_short_close_missing')
    assert(model.closeProductionJob(closedShort, 'JOB-1', closeShiftRef, closeProof) === closedShort, 'production_job_short_close_retry_not_idempotent')
    assert(model.closeProductionJob(closedShort, 'JOB-1', 'Changed shift', closeProof) === null, 'production_job_short_close_conflicting_retry_succeeded')
    assert(model.closeProductionJob({ ...base, jobs: [{ ...base.jobs[0], output: 100 }] }, 'JOB-1', closeShiftRef, proof('ACT-JOB-CLOSE-COMPLETE')) === null, 'production_completed_job_closed_short')
    assert(model.recordProductionOutput(closedShort, 'JOB-1', 1, closeShiftRef, proof('ACT-JOB-CLOSE-OUTPUT')) === null, 'production_output_after_short_close_succeeded')
    assert(model.recordProductionMaterialConsumption(closedShort, 'JOB-1', 'RM-CLOSE', undefined, 1, 'kg', closeShiftRef, proof('ACT-JOB-CLOSE-MATERIAL')) === null, 'production_material_after_short_close_succeeded')
    assert(model.placeProductionQualityHold(closedShort, 'JOB-1', proof('ACT-JOB-CLOSE-HOLD')) === null, 'production_hold_after_short_close_succeeded')
    assert(model.updateProductionJobPlan(closedShort, 'JOB-1', 'urgent', '2026-07-25T10:00:00.000Z', 'Legacy line lead', proof('ACT-JOB-CLOSE-SCHEDULE')) === null, 'production_plan_after_short_close_succeeded')
    const closedScheduleProof = proof('ACT-JOB-CLOSE-SCHEDULE-FORGED', 1_000)
    assertThrows(() => model.validateProductionState({
      ...closedShort,
      revision: closedShort.revision + 1,
      jobs: [{ ...closedShort.jobs[0], owner: 'Legacy line lead', priority: 'urgent', dueAt: '2026-07-25T10:00:00.000Z' }],
      events: [{
        id: `EVT-${closedScheduleProof.actionId}`,
        actionId: closedScheduleProof.actionId,
        createdAt: closedScheduleProof.capturedAt,
        actor: closedScheduleProof.actor,
        reason: closedScheduleProof.reason,
        evidenceReference: closedScheduleProof.evidenceReference,
        kind: 'job_schedule_updated',
        subjectId: 'JOB-1',
        summary: 'Updated Test batch plan for Line 01',
        jobPriority: 'urgent',
        jobDueAt: '2026-07-25T10:00:00.000Z',
        jobOwner: 'Legacy line lead',
      }, ...closedShort.events],
    }), 'production_closed_job_forged_plan_state_accepted')
    const closedHandoff = model.buildProductionShiftHandoff(closedShort, closeShiftRef)
    assert(closedHandoff?.shortCloses.length === 1
      && closedHandoff.shortCloses[0].remainingUnits === 10
      && closedHandoff.unfinishedJobs.length === 0
      && model.formatProductionShiftHandoff(closedHandoff).includes('Closed short (1)'),
    'production_short_close_handoff_missing')
    assertThrows(() => model.validateProductionState({
      ...closedShort,
      jobs: [{ ...closedShort.jobs[0], closure: { ...closedShort.jobs[0].closure, remainingUnits: 9 } }],
    }), 'production_short_close_tamper_accepted')
    const outputProof = proof('ACT-OUTPUT')
    const shiftRef = '2026-07-24 Day'
    const outputState = model.recordProductionOutput(base, 'JOB-1', 10, shiftRef, outputProof)
    assert(outputState?.jobs[0].output === 100 && outputState.revision === 1 && outputState.events[0].quantity === 10 && outputState.events[0].shiftRef === shiftRef && outputState.events[0].actor === outputProof.actor, 'production_output_not_recorded_once')
    assert(model.productionShiftOutput(outputState, shiftRef).goodUnits === 10
      && model.productionShiftOutput(outputState, shiftRef).scrapUnits === 0
      && model.productionShiftOutput(outputState, shiftRef).entryCount === 1,
    'production_shift_subtotal_not_derived')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 10, shiftRef, outputProof) === outputState, 'production_output_retry_not_idempotent')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 10, '2026-07-24 Night', outputProof) === null, 'production_output_conflicting_shift_succeeded')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 9, shiftRef, outputProof) === null, 'production_output_conflicting_quantity_succeeded')
    assert(model.recordProductionOutput(outputState, 'JOB-1', 10, shiftRef, { ...outputProof, evidenceReference: 'EV-CONFLICT' }) === null, 'production_output_conflicting_evidence_succeeded')
    assert(['', ' Day', 'Day ', 'X'.repeat(81)].every((candidate, index) => model.recordProductionOutput(base, 'JOB-1', 1, candidate, proof(`ACT-BAD-SHIFT-${index}`)) === null), 'production_invalid_shift_reference_succeeded')
    assert([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].every((quantity) => model.recordProductionOutput(base, 'JOB-1', quantity, shiftRef, proof(`ACT-BAD-${String(quantity)}`)) === null), 'production_invalid_output_quantity_succeeded')
    assert(model.recordProductionOutput(base, 'JOB-1', 11, shiftRef, proof('ACT-OVER-TARGET')) === null, 'production_over_target_output_succeeded')
    assert(model.recordProductionOutput(base, 'JOB-MISSING', 1, shiftRef, proof('ACT-MISSING-JOB')) === null, 'production_missing_job_output_succeeded')
    const maxed = { ...model.createEmptyProduction(), jobs: [{ ...legacy.jobs[0], target: Number.MAX_SAFE_INTEGER, output: Number.MAX_SAFE_INTEGER }] }
    assert(model.recordProductionOutput(maxed, 'JOB-1', 1, shiftRef, proof('ACT-OVERFLOW')) === null, 'production_output_overflow_succeeded')
    assert(model.productionShiftOutput(ledger501, shiftRef).goodUnits === 0
      && model.productionShiftOutput(ledger501, shiftRef).scrapUnits === 0
      && model.productionShiftOutput(ledger501, shiftRef).entryCount === 0,
    'production_legacy_output_was_misattributed_to_shift')
    assertThrows(() => model.validateProductionState({ ...withJob, events: [{ ...withJob.events[0], shiftRef }, ...withJob.events.slice(1)] }), 'production_non_output_shift_reference_accepted')
    assertThrows(() => model.validateProductionState({
      ...outputState,
      events: [{ ...outputState.events[0], outputKind: null }, ...outputState.events.slice(1)],
    }), 'production_null_output_kind_accepted_as_legacy_good')

    const scrapProof = proof('ACT-SCRAP', 1_000)
    const scrapState = model.recordProductionScrap(base, 'JOB-1', 4, shiftRef, scrapProof)
    assert(scrapState?.jobs[0].output === 90
      && scrapState.jobs[0].scrap === 4
      && scrapState.events[0].outputKind === 'scrap'
      && scrapState.events[0].quantity === 4
      && scrapState.events[0].shiftRef === shiftRef
      && scrapState.events[0].actor === scrapProof.actor,
    'production_scrap_not_recorded_separately')
    assert(model.productionShiftOutput(scrapState, shiftRef).goodUnits === 0
      && model.productionShiftOutput(scrapState, shiftRef).scrapUnits === 4
      && model.productionShiftOutput(scrapState, shiftRef).entryCount === 1,
    'production_scrap_shift_subtotal_not_derived')
    assert(model.recordProductionScrap(scrapState, 'JOB-1', 4, shiftRef, scrapProof) === scrapState, 'production_scrap_retry_not_idempotent')
    assert(model.recordProductionScrap(scrapState, 'JOB-1', 3, shiftRef, scrapProof) === null, 'production_scrap_conflicting_quantity_succeeded')
    assert(model.recordProductionOutput(scrapState, 'JOB-1', 4, shiftRef, scrapProof) === null, 'production_scrap_action_replayed_as_good_output')
    const goodAfterScrapProof = proof('ACT-GOOD-AFTER-SCRAP', 2_000)
    const accountedJob = model.recordProductionOutput(scrapState, 'JOB-1', 6, shiftRef, goodAfterScrapProof)
    assert(accountedJob?.jobs[0].output === 96
      && accountedJob.jobs[0].scrap === 4
      && model.productionShiftOutput(accountedJob, shiftRef).goodUnits === 6
      && model.productionShiftOutput(accountedJob, shiftRef).scrapUnits === 4,
    'production_good_plus_scrap_not_accounted_to_target')
    assert(model.recordProductionScrap(scrapState, 'JOB-1', 7, shiftRef, proof('ACT-SCRAP-OVER-TARGET')) === null, 'production_scrap_exceeded_target')
    assert(model.recordProductionOutput(scrapState, 'JOB-1', 7, shiftRef, proof('ACT-GOOD-OVER-SCRAP')) === null, 'production_good_output_ignored_scrap_cap')
    assert(['', ' Day', 'Day ', 'X'.repeat(81)].every((candidate, index) => model.recordProductionScrap(base, 'JOB-1', 1, candidate, proof(`ACT-SCRAP-BAD-SHIFT-${index}`)) === null), 'production_invalid_scrap_shift_succeeded')
    assert([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].every((scrapQuantity) => model.recordProductionScrap(base, 'JOB-1', scrapQuantity, shiftRef, proof(`ACT-BAD-SCRAP-${String(scrapQuantity)}`)) === null), 'production_invalid_scrap_quantity_succeeded')
    assertThrows(() => model.validateProductionState({
      ...scrapState,
      jobs: [{ ...scrapState.jobs[0], scrap: 5 }],
    }), 'production_scrap_total_detached_from_event_history')
    assertThrows(() => model.validateProductionState({
      ...base,
      jobs: [{ ...base.jobs[0], scrap: 11 }],
    }), 'production_good_plus_scrap_over_target_state_accepted')

    const materialProof = proof('ACT-MATERIAL', 3_000)
    const materialState = model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-RESIN-01', 'LOT-24', 1.25, 'kg', shiftRef, materialProof)
    assert(materialState?.revision === 1
      && JSON.stringify(materialState.jobs) === JSON.stringify(base.jobs)
      && JSON.stringify(materialState.issues) === JSON.stringify(base.issues)
      && JSON.stringify(materialState.machines) === JSON.stringify(base.machines)
      && materialState.events[0].kind === 'material_consumed'
      && materialState.events[0].subjectId === 'JOB-1'
      && materialState.events[0].materialRef === 'RM-RESIN-01'
      && materialState.events[0].materialLot === 'LOT-24'
      && materialState.events[0].materialUnit === 'kg'
      && materialState.events[0].quantity === 1.25
      && materialState.events[0].shiftRef === shiftRef,
    'production_material_use_not_recorded_as_event_only')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-24', 1.25, 'kg', shiftRef, materialProof) === materialState, 'production_material_retry_not_idempotent')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-02', 'LOT-24', 1.25, 'kg', shiftRef, materialProof) === null, 'production_material_conflicting_reference_succeeded')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-25', 1.25, 'kg', shiftRef, materialProof) === null, 'production_material_conflicting_lot_succeeded')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-24', 1.5, 'kg', shiftRef, materialProof) === null, 'production_material_conflicting_quantity_succeeded')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-24', 1.25, 'bag', shiftRef, materialProof) === null, 'production_material_conflicting_unit_succeeded')
    assert(model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-24', 1.25, 'kg', '2026-07-24 Night', materialProof) === null, 'production_material_conflicting_shift_succeeded')
    assert(['', ' RM-01', 'RM-01 ', 'X'.repeat(121)].every((materialRef, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', materialRef, undefined, 1, 'kg', shiftRef, proof(`ACT-MATERIAL-BAD-REF-${index}`)) === null), 'production_invalid_material_reference_succeeded')
    assert(['', ' LOT-1', 'LOT-1 ', 'X'.repeat(121)].every((materialLot, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-01', materialLot, 1, 'kg', shiftRef, proof(`ACT-MATERIAL-BAD-LOT-${index}`)) === null), 'production_invalid_material_lot_succeeded')
    assert(['', 'tonne', 'KG'].every((materialUnit, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-01', undefined, 1, materialUnit, shiftRef, proof(`ACT-MATERIAL-BAD-UNIT-${index}`)) === null), 'production_invalid_material_unit_succeeded')
    assert([0, -1, 1.2345, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER].every((materialQuantity, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-01', undefined, materialQuantity, 'kg', shiftRef, proof(`ACT-MATERIAL-BAD-QTY-${index}`)) === null), 'production_invalid_material_quantity_succeeded')
    assert([0.001, 0.5, 1.25, 999.999].every((materialQuantity, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-01', undefined, materialQuantity, 'kg', shiftRef, proof(`ACT-MATERIAL-FRACTION-${index}`))?.events[0].quantity === materialQuantity), 'production_valid_fractional_material_quantity_rejected')
    assert(model.parseProductionMaterialQuantity('1.250') === 1.25
      && model.parseProductionMaterialQuantity('9007199254740.990') === 9007199254740.99,
    'production_material_quantity_parser_rejected_exact_round_trip')
    assert(['9007199254740.991', '9007199254740.989', '9007199254740.001'].every((candidate) => model.parseProductionMaterialQuantity(candidate) === null), 'production_material_quantity_parser_rounded_input')
    assert(['', ' Day', 'Day ', 'X'.repeat(81)].every((materialShiftRef, index) => model.recordProductionMaterialConsumption(base, 'JOB-1', 'RM-01', undefined, 1, 'kg', materialShiftRef, proof(`ACT-MATERIAL-BAD-SHIFT-${index}`)) === null), 'production_invalid_material_shift_succeeded')
    assert(model.recordProductionMaterialConsumption(base, 'JOB-MISSING', 'RM-01', undefined, 1, 'kg', shiftRef, proof('ACT-MATERIAL-MISSING-JOB')) === null, 'production_missing_job_material_succeeded')
    assert(model.recordProductionMaterialConsumption(accountedJob, 'JOB-1', 'RM-01', undefined, 1, 'kg', shiftRef, proof('ACT-MATERIAL-CLOSED-JOB')) === null, 'production_completed_job_material_succeeded')
    const materialSecondProof = proof('ACT-MATERIAL-SECOND', 3_100)
    const materialSecondState = model.recordProductionMaterialConsumption(materialState, 'JOB-1', 'RM-RESIN-01', 'LOT-25', 0.75, 'kg', shiftRef, materialSecondProof)
    const materialHandoff = model.buildProductionShiftHandoff(materialSecondState, shiftRef)
    assert(materialHandoff?.materialEntries.length === 2
      && materialHandoff.materialEntries.some((entry) => entry.actionId === materialProof.actionId)
      && materialHandoff.materialEntries.some((entry) => entry.materialRef === 'RM-RESIN-01' && entry.materialLot === 'LOT-24')
      && materialHandoff.materialEntries.some((entry) => entry.materialRef === 'RM-RESIN-01' && entry.materialLot === 'LOT-25')
      && materialHandoff.materialTotals.length === 1
      && materialHandoff.materialTotals[0].quantity === 2
      && materialHandoff.materialTotals[0].entryCount === 2
      && model.formatProductionShiftHandoff(materialHandoff).includes('Material totals (1)'),
    'production_material_use_missing_from_shift_handoff')
    assertThrows(() => model.validateProductionState({
      ...materialState,
      events: [{ ...materialState.events[0], outputKind: 'good' }, ...materialState.events.slice(1)],
    }), 'production_material_event_accepted_unrelated_field')
    const collisionQuantity = 5_000_000_000_000
    const collisionFirst = model.recordProductionMaterialConsumption(base, 'JOB-1', 'B\u0000C', undefined, collisionQuantity, 'kg', 'A', proof('ACT-MATERIAL-COLLISION-FIRST', 3_200))
    const collisionSecond = model.recordProductionMaterialConsumption(collisionFirst, 'JOB-1', 'C', undefined, collisionQuantity, 'kg', 'A\u0000B', proof('ACT-MATERIAL-COLLISION-SECOND', 3_300))
    assert(collisionSecond?.revision === 2, 'production_material_tuple_key_collision_rejected')
    const completedAfterMaterial = model.recordProductionOutput(materialState, 'JOB-1', 10, shiftRef, proof('ACT-OUTPUT-AFTER-MATERIAL', 4_000))
    assert(completedAfterMaterial?.jobs[0].output === 100, 'production_material_then_completion_setup_failed')
    assertThrows(() => model.validateProductionState({
      ...completedAfterMaterial,
      events: [completedAfterMaterial.events[1], completedAfterMaterial.events[0], ...completedAfterMaterial.events.slice(2)],
    }), 'production_full_state_material_after_completion_accepted')
    const preciseJobProof = proof('ACT-PRECISE-JOB', 0, { capturedAt: '2026-07-23T10:00:00.000002Z' })
    const preciseJob = {
      id: 'JOB-PRECISE',
      line: 'Precision line',
      product: 'Precision batch',
      target: 10,
      output: 0,
      owner: 'Precision lead',
      priority: 'normal',
      dueAt: '2026-07-24T10:00:00.000Z',
    }
    const preciseWithJob = model.registerProductionJob(base, preciseJob, preciseJobProof)
    const preciseMaterial = model.recordProductionMaterialConsumption(
      preciseWithJob,
      preciseJob.id,
      'RM-PRECISE',
      undefined,
      1,
      'kg',
      shiftRef,
      proof('ACT-PRECISE-MATERIAL', 0, { capturedAt: '2026-07-23T10:00:00.000003Z' }),
    )
    assert(preciseMaterial?.events[0].kind === 'material_consumed', 'production_precise_material_setup_failed')
    assertThrows(() => model.validateProductionState({
      ...preciseMaterial,
      events: [
        { ...preciseMaterial.events[0], createdAt: '2026-07-23T10:00:00.000001Z' },
        ...preciseMaterial.events.slice(1),
      ],
    }), 'production_submillisecond_material_before_creation_accepted')

    const issue = {
      id: 'ISS-1',
      createdAt: '2026-07-23T10:00:00.000Z',
      area: 'Line 01',
      kind: 'quality',
      summary: 'Temperature drift observed',
      status: 'open',
      severity: 'high',
      owner: 'Shift supervisor',
      dueAt: '2026-07-23T14:00:00.000Z',
      containment: 'Hold the affected batch and verify the next sample.',
    }
    const openProof = proof('ACT-ISSUE-OPEN', 1_000)
    const opened = model.openProductionIssue(outputState, issue, openProof)
    assert(opened?.issues[0].id === issue.id
      && opened.issues[0].severity === 'high'
      && opened.issues[0].owner === 'Shift supervisor'
      && opened.issues[0].dueAt === issue.dueAt
      && opened.issues[0].containment === issue.containment
      && opened.events[0].issueSeverity === issue.severity
      && opened.events[0].issueOwner === issue.owner
      && opened.events[0].issueDueAt === issue.dueAt
      && opened.events[0].issueContainment === issue.containment
      && opened.revision === 2
      && opened.events[0].kind === 'issue_opened',
    'production_issue_not_opened_once')
    assert(model.openProductionIssue(opened, issue, openProof) === opened, 'production_issue_open_retry_not_idempotent')
    assert(model.openProductionIssue(opened, { ...issue, summary: 'Changed' }, openProof) === null, 'production_issue_conflicting_retry_succeeded')
    assert(model.openProductionIssue(opened, issue, proof('ACT-ISSUE-DUPLICATE')) === null, 'production_duplicate_issue_id_succeeded')
    assert(model.openProductionIssue(opened, { ...issue, id: 'ISS-2' }, openProof) === null, 'production_reused_action_id_succeeded')
    assert(['severity', 'owner', 'dueAt', 'containment'].every((field, index) => {
      const incomplete = { ...issue }
      delete incomplete[field]
      return model.openProductionIssue(outputState, incomplete, proof(`ACT-ISSUE-MISSING-${index}`)) === null
    }), 'production_incomplete_actionable_issue_succeeded')
    assert(model.openProductionIssue(outputState, { ...issue, severity: 'urgent' }, proof('ACT-ISSUE-BAD-SEVERITY')) === null, 'production_invalid_issue_severity_succeeded')
    assert(model.openProductionIssue(outputState, { ...issue, owner: ' Shift supervisor' }, proof('ACT-ISSUE-BAD-OWNER')) === null, 'production_noncanonical_issue_owner_succeeded')
    assert(model.openProductionIssue(outputState, { ...issue, dueAt: issue.createdAt }, proof('ACT-ISSUE-BAD-DUE')) === null, 'production_nonfuture_issue_due_succeeded')
    assert(model.openProductionIssue(outputState, { ...issue, containment: '' }, proof('ACT-ISSUE-BAD-CONTAINMENT')) === null, 'production_blank_issue_containment_succeeded')
    const delayedIssueProof = proof('ACT-ISSUE-DELAYED', 60_000)
    assert(model.openProductionIssue(outputState, { ...issue, dueAt: '2026-07-23T10:00:30.000Z' }, delayedIssueProof) === null, 'production_expired_at_confirmation_issue_succeeded')
    assertThrows(() => model.validateProductionState({
      ...opened,
      issues: [{ ...opened.issues[0], owner: 'Changed owner' }],
    }), 'production_issue_owner_detached_from_opening_event')
    assertThrows(() => model.validateProductionState({
      ...opened,
      events: [{ ...opened.events[0], issueContainment: 'Changed containment' }, ...opened.events.slice(1)],
    }), 'production_issue_opening_snapshot_was_mutable')
    assertThrows(() => model.validateProductionState({
      ...opened,
      issues: [{ ...opened.issues[0], severity: undefined, owner: undefined, dueAt: undefined, containment: undefined }],
    }), 'production_new_issue_bypassed_actionable_fields')
    assertThrows(() => model.validateProductionState({
      ...opened,
      issues: [{ ...opened.issues[0], status: 'resolved' }],
    }), 'production_new_issue_resolved_without_proof')
    const resolutionProof = proof('ACT-ISSUE-RESOLVE', 2_000)
    const resolved = model.resolveProductionIssue(opened, issue.id, resolutionProof)
    assert(resolved?.issues[0].status === 'resolved' && resolved.issues[0].resolution?.resolvedBy === resolutionProof.actor && resolved.issues[0].resolution?.evidenceReference === resolutionProof.evidenceReference && resolved.events[0].kind === 'issue_resolved', 'production_issue_resolution_lost_proof')
    assert(model.resolveProductionIssue(resolved, issue.id, resolutionProof) === resolved, 'production_resolution_retry_not_idempotent')
    assert(model.resolveProductionIssue(resolved, issue.id, { ...resolutionProof, reason: 'Changed' }) === null, 'production_resolution_conflicting_retry_succeeded')
    assert(model.resolveProductionIssue(resolved, issue.id, proof('ACT-RESOLVE-AGAIN')) === null, 'production_second_resolution_succeeded')
    assert(model.resolveProductionIssue(resolved, 'ISS-MISSING', proof('ACT-RESOLVE-MISSING')) === null, 'production_missing_issue_resolution_succeeded')
    const changedResolutionProof = {
      ...resolved,
      issues: [{
        ...resolved.issues[0],
        resolution: { ...resolved.issues[0].resolution, reason: 'Changed stored reason' },
      }],
    }
    assertThrows(() => model.validateProductionState(changedResolutionProof), 'production_changed_resolution_proof_validated')
    assert(model.resolveProductionIssue(changedResolutionProof, issue.id, resolutionProof) === null, 'production_changed_resolution_proof_replayed')
    const legacyIssueState = model.validateProductionState({ ...base, issues: [duplicateIssue] })
    const legacyResolutionProof = proof('ACT-LEGACY-ISSUE-RESOLVE', 2_500)
    const resolvedLegacyIssue = model.resolveProductionIssue(legacyIssueState, duplicateIssue.id, legacyResolutionProof)
    assert(resolvedLegacyIssue?.issues[0].status === 'resolved'
      && resolvedLegacyIssue.issues[0].severity === undefined
      && resolvedLegacyIssue.issues[0].resolution?.resolvedBy === legacyResolutionProof.actor,
    'production_legacy_issue_not_readable_or_resolvable')

    const holdProof = proof('ACT-QUALITY-HOLD', 2_600)
    const held = model.placeProductionQualityHold(base, 'JOB-1', holdProof)
    assert(held?.jobs[0].qualityHold?.actionId === holdProof.actionId
      && held.jobs[0].qualityHold.heldAt === holdProof.capturedAt
      && held.jobs[0].qualityHold.heldBy === holdProof.actor
      && held.jobs[0].qualityHold.reason === holdProof.reason
      && held.jobs[0].qualityHold.evidenceReference === holdProof.evidenceReference
      && held.jobs[0].output === base.jobs[0].output
      && held.events[0].kind === 'quality_hold_placed',
    'production_quality_hold_not_recorded_exactly')
    assert(model.placeProductionQualityHold(held, 'JOB-1', holdProof) === held, 'production_quality_hold_retry_not_idempotent')
    assert(model.placeProductionQualityHold(held, 'JOB-1', { ...holdProof, reason: 'Changed reason' }) === null, 'production_quality_hold_conflicting_retry_succeeded')
    assert(model.placeProductionQualityHold(held, 'JOB-1', proof('ACT-QUALITY-HOLD-SECOND', 2_700)) === null, 'production_second_active_quality_hold_succeeded')
    assert(model.releaseProductionQualityHold(base, 'JOB-1', proof('ACT-QUALITY-RELEASE-NONE', 2_700)) === null, 'production_unheld_quality_release_succeeded')
    assert(model.releaseProductionQualityHold(held, 'JOB-1', proof('ACT-QUALITY-RELEASE-EARLY', 2_500)) === null, 'production_quality_release_predated_hold')
    assertThrows(() => model.validateProductionState({
      ...held,
      jobs: [{ ...held.jobs[0], qualityHold: { ...held.jobs[0].qualityHold, reason: 'Detached reason' } }],
    }), 'production_quality_hold_proof_detached_from_event')
    assertThrows(() => model.validateProductionState({
      ...held,
      events: [{ ...held.events[0], unexpected: true }],
    }), 'production_quality_hold_event_extra_field_accepted')

    const releaseProof = proof('ACT-QUALITY-RELEASE', 2_800)
    const releasedHold = model.releaseProductionQualityHold(held, 'JOB-1', releaseProof)
    assert(releasedHold
      && releasedHold.jobs[0].qualityHold === undefined
      && releasedHold.jobs[0].output === base.jobs[0].output
      && releasedHold.events[0].kind === 'quality_hold_released'
      && releasedHold.events[0].actor === releaseProof.actor
      && releasedHold.events[0].reason === releaseProof.reason
      && releasedHold.events[0].evidenceReference === releaseProof.evidenceReference,
    'production_quality_hold_release_not_recorded_exactly')
    assert(model.releaseProductionQualityHold(releasedHold, 'JOB-1', releaseProof) === releasedHold, 'production_quality_release_retry_not_idempotent')
    assert(model.releaseProductionQualityHold(releasedHold, 'JOB-1', { ...releaseProof, evidenceReference: 'EV-CONFLICT' }) === null, 'production_quality_release_conflicting_retry_succeeded')
    assert(model.placeProductionQualityHold(releasedHold, 'JOB-1', holdProof) === releasedHold, 'production_historical_hold_retry_after_release_not_idempotent')
    assertThrows(() => model.validateProductionState({
      ...releasedHold,
      events: [
        { ...releasedHold.events[0], createdAt: new Date(Date.parse(holdProof.capturedAt) - 1).toISOString() },
        ...releasedHold.events.slice(1),
      ],
    }), 'production_quality_release_before_hold_timestamp_accepted')

    const reholdProof = proof('ACT-QUALITY-REHOLD', 2_900)
    const reheld = model.placeProductionQualityHold(releasedHold, 'JOB-1', reholdProof)
    assert(reheld?.jobs[0].qualityHold?.actionId === reholdProof.actionId
      && reheld.jobs[0].output === base.jobs[0].output
      && reheld.events.slice(0, 3).map((event) => event.kind).join(',') === 'quality_hold_placed,quality_hold_released,quality_hold_placed',
    'production_quality_rehold_after_release_failed')
    assert(model.releaseProductionQualityHold(reheld, 'JOB-1', releaseProof) === reheld, 'production_historical_release_retry_after_rehold_not_idempotent')
    assert(model.placeProductionQualityHold(base, 'JOB-MISSING', proof('ACT-QUALITY-HOLD-MISSING', 2_600)) === null, 'production_missing_job_quality_hold_succeeded')
    assert(model.registerProductionJob(base, { ...newJob, id: 'JOB-HOLD-PREDECLARED', qualityHold: {
      actionId: 'ACT-PREDECLARED-HOLD',
      heldAt: holdProof.capturedAt,
      heldBy: holdProof.actor,
      reason: holdProof.reason,
      evidenceReference: holdProof.evidenceReference,
    } }, proof('ACT-JOB-HOLD-PREDECLARED', 2_600)) === null, 'production_job_predeclared_quality_hold_succeeded')

    const completedHeldJob = { id: 'JOB-COMPLETE', line: 'Line 02', product: 'Completed batch', target: 10, output: 10 }
    const handoffBase = model.validateProductionState({
      ...base,
      jobs: [...base.jobs, completedHeldJob],
      machines: [...base.machines, { id: 'MC-2', name: 'Unobserved machine', state: 'running' }],
    })
    const handoffHoldProof = proof('ACT-HANDOFF-HOLD', 3_000)
    const handoffHeld = model.placeProductionQualityHold(handoffBase, 'JOB-1', handoffHoldProof)
    const handoffOutputProof = proof('ACT-HANDOFF-OUTPUT', 3_050)
    const handoffOutput = model.recordProductionOutput(handoffHeld, 'JOB-1', 5, shiftRef, handoffOutputProof)
    const handoffScrapProof = proof('ACT-HANDOFF-SCRAP', 3_075)
    const handoffOutputAndScrap = model.recordProductionScrap(handoffOutput, 'JOB-1', 2, shiftRef, handoffScrapProof)
    const handoffHighZProblem = {
      ...issue,
      id: 'ISS-Z',
      createdAt: '2026-07-23T10:00:03.090Z',
      summary: 'Seal review is required before the next shift.',
    }
    const handoffHighZProof = proof('ACT-HANDOFF-HIGH-Z', 3_100)
    const handoffWithHighZ = model.openProductionIssue(handoffOutputAndScrap, handoffHighZProblem, handoffHighZProof)
    const handoffHighUnicodeProblem = {
      ...handoffHighZProblem,
      id: 'ISS-Á',
      createdAt: '2026-07-23T10:00:03.110Z',
      summary: 'A second high-priority review is open.',
    }
    const handoffHighUnicodeProof = proof('ACT-HANDOFF-HIGH-UNICODE', 3_120)
    const handoffWithHighPair = model.openProductionIssue(handoffWithHighZ, handoffHighUnicodeProblem, handoffHighUnicodeProof)
    const handoffCriticalProblem = {
      ...handoffHighZProblem,
      id: 'ISS-CRITICAL',
      createdAt: '2026-07-23T10:00:03.130Z',
      summary: 'Critical disposition is still open.',
      severity: 'critical',
    }
    const handoffCriticalProof = proof('ACT-HANDOFF-CRITICAL', 3_140)
    const handoffWithCritical = model.openProductionIssue(handoffWithHighPair, handoffCriticalProblem, handoffCriticalProof)
    const handoffMediumProblem = {
      ...handoffHighZProblem,
      id: 'ISS-MEDIUM',
      createdAt: '2026-07-23T10:00:03.150Z',
      summary: 'Review the next routine sample.',
      severity: 'medium',
    }
    const handoffMediumProof = proof('ACT-HANDOFF-MEDIUM', 3_160)
    const handoffWithProblems = model.openProductionIssue(handoffWithCritical, handoffMediumProblem, handoffMediumProof)
    const handoffMachineFirstProof = proof('ACT-HANDOFF-MACHINE-FIRST', 3_180)
    const handoffMachineFirst = model.recordProductionMachineState(handoffWithProblems, 'MC-1', 'running', 'attention', handoffMachineFirstProof)
    const handoffMachineLatestProof = proof('ACT-HANDOFF-MACHINE-LATEST', 3_190)
    const handoffMachineLatest = model.recordProductionMachineState(handoffMachineFirst, 'MC-1', 'attention', 'stopped', handoffMachineLatestProof)
    const handoffMaintenanceProof = proof('ACT-HANDOFF-MAINTENANCE', 3_195)
    const handoffWithMaintenance = model.startProductionMaintenance(handoffMachineLatest, 'MC-1', 'Maintenance lead', handoffMaintenanceProof)
    const completedHoldProof = proof('ACT-HANDOFF-COMPLETED-HOLD', 3_200)
    const handoffState = model.placeProductionQualityHold(handoffWithMaintenance, completedHeldJob.id, completedHoldProof)
    const handoffStateBefore = JSON.stringify(handoffState)
    const handoff = model.buildProductionShiftHandoff(handoffState, shiftRef)
    assert(handoff?.shiftRef === shiftRef
      && handoff.sourceRevision === handoffState.revision
      && handoff.sourceCanonical === model.productionStateCanonical(handoffState)
      && handoff.shiftOutput.goodUnits === 5
      && handoff.shiftOutput.scrapUnits === 2
      && handoff.shiftOutput.entryCount === 2,
    'production_shift_handoff_output_or_revision_wrong')
    assert(handoff.unfinishedJobs.length === 1
      && handoff.unfinishedJobs[0].id === 'JOB-1'
      && handoff.unfinishedJobs[0].remainingUnits === 3
      && handoff.unfinishedJobs[0].qualityHold?.evidenceReference === handoffHoldProof.evidenceReference,
    'production_shift_handoff_unfinished_or_held_job_missing')
    assert(handoff.shiftEntries.length === 2
      && handoff.shiftEntries.some((entry) => entry.actionId === handoffOutputProof.actionId && entry.outputKind === 'good' && entry.quantity === 5)
      && handoff.shiftEntries.some((entry) => entry.actionId === handoffScrapProof.actionId && entry.outputKind === 'scrap' && entry.quantity === 2)
      && handoff.shiftEntries.every((entry) => entry.recordedBy === entry.recordedBy.trim() && entry.evidenceReference.startsWith('EV-')),
    'production_shift_handoff_entries_lost_provenance')
    assert(handoff.activeHolds.length === 2
      && handoff.activeHolds.some((entry) => entry.id === 'JOB-1' && entry.target === 100 && entry.goodUnits === 95 && entry.scrapUnits === 2 && entry.remainingUnits === 3 && entry.qualityHold.heldAt === handoffHoldProof.capturedAt)
      && handoff.activeHolds.some((entry) => entry.id === completedHeldJob.id && entry.target === 10 && entry.goodUnits === 10 && entry.scrapUnits === 0 && entry.remainingUnits === 0 && entry.qualityHold.actionId === completedHoldProof.actionId),
    'production_shift_handoff_completed_or_unfinished_hold_missing')
    assert(handoff.priorityProblems.length === 3
      && handoff.priorityProblems.map((entry) => entry.id).join(',') === 'ISS-CRITICAL,ISS-Z,ISS-Á'
      && handoff.priorityProblems[0].openedAt === handoffCriticalProof.capturedAt
      && handoff.priorityProblems[0].openedBy === handoffCriticalProof.actor
      && handoff.priorityProblems[0].evidenceReference === handoffCriticalProof.evidenceReference,
    'production_shift_handoff_priority_problem_wrong')
    assert(handoff.activeMaintenance.length === 1
      && handoff.activeMaintenance[0].machineId === 'MC-1'
      && handoff.activeMaintenance[0].owner === 'Maintenance lead'
      && handoff.activeMaintenance[0].startedAt === handoffMaintenanceProof.capturedAt
      && handoff.activeMaintenance[0].startEvidenceReference === handoffMaintenanceProof.evidenceReference,
    'production_shift_handoff_active_maintenance_wrong')
    assert(handoff.machineObservations.length === 2
      && handoff.machineObservations[0].state === 'stopped'
      && handoff.machineObservations[0].observation?.actionId === handoffMachineLatestProof.actionId
      && handoff.machineObservations[0].observation?.evidenceReference === handoffMachineLatestProof.evidenceReference
      && handoff.machineObservations[1].id === 'MC-2'
      && handoff.machineObservations[1].observation === null,
    'production_shift_handoff_machine_observation_wrong')
    assert(JSON.stringify(handoff) === JSON.stringify(model.buildProductionShiftHandoff(handoffState, shiftRef)), 'production_shift_handoff_not_deterministic')
    assert(JSON.stringify(handoffState) === handoffStateBefore, 'production_shift_handoff_mutated_state')
    const reorderedHandoffState = {
      events: handoffState.events,
      machines: handoffState.machines,
      issues: handoffState.issues,
      jobs: handoffState.jobs,
      revision: handoffState.revision,
      schema: handoffState.schema,
    }
    assert(model.productionStateCanonical(reorderedHandoffState) === handoff.sourceCanonical, 'production_shift_handoff_source_depended_on_key_order')
    const sameRevisionChangedState = model.validateProductionState({
      ...handoffState,
      jobs: handoffState.jobs.map((job) => job.id === 'JOB-1' ? { ...job, output: job.output + 1 } : job),
    })
    assert(model.productionStateCanonical(sameRevisionChangedState) !== handoff.sourceCanonical, 'production_shift_handoff_source_missed_same_revision_change')
    const handoffText = model.formatProductionShiftHandoff(handoff)
    assert(handoffText.includes(`Plant shift handoff — ${shiftRef}`)
      && handoffText.includes(handoffOutputProof.evidenceReference)
      && handoffText.includes(handoffScrapProof.evidenceReference)
      && handoffText.includes(handoffHoldProof.capturedAt)
      && handoffText.includes(completedHoldProof.evidenceReference)
      && handoffText.includes(handoffCriticalProof.capturedAt)
      && handoffText.includes(handoffCriticalProof.actor)
      && handoffText.includes('Active maintenance (1)')
      && handoffText.includes(handoffMaintenanceProof.evidenceReference)
      && handoffText.includes(handoffMachineLatestProof.evidenceReference)
      && handoffText.includes(handoffMachineLatestProof.reason)
      && handoffText.includes('target 10 · 10 good · 0 scrap · 0 remaining')
      && !handoffText.includes('completed output')
      && !handoffText.includes(handoffMachineFirstProof.evidenceReference)
      && !handoffText.includes(handoffMediumProblem.summary),
    'production_shift_handoff_text_lost_or_invented_evidence')
    const noObservationHandoff = model.buildProductionShiftHandoff(base, shiftRef)
    assert(noObservationHandoff?.machineObservations[0].observation === null
      && model.formatProductionShiftHandoff(noObservationHandoff).includes('no attributed observation recorded'),
    'production_shift_handoff_missing_no_observation_marker')
    assert(['', ' Day', 'Day ', 'X'.repeat(81)].every((candidate) => model.buildProductionShiftHandoff(base, candidate) === null), 'production_shift_handoff_invalid_shift_accepted')

    let machineState = resolved
    const observedStates = ['attention', 'stopped', 'attention', 'running', 'stopped', 'running']
    const machineProofs = []
    for (const [index, observedState] of observedStates.entries()) {
      const beforeState = machineState.machines[0].state
      const machineProof = proof(`ACT-MACHINE-${index + 1}`, 3_000 + index)
      const observed = model.recordProductionMachineState(machineState, 'MC-1', beforeState, observedState, machineProof)
      assert(observed?.machines[0].state === observedState
        && observed.events[0].fromState === beforeState
        && observed.events[0].toState === observedState, `production_machine_observation_${beforeState}_to_${observedState}_failed`)
      machineState = observed
      machineProofs.push(machineProof)
    }
    const lastMachineProof = machineProofs.at(-1)
    assert(model.recordProductionMachineState(machineState, 'MC-1', 'stopped', 'running', lastMachineProof) === machineState, 'production_machine_retry_not_idempotent')
    assert(model.recordProductionMachineState(machineState, 'MC-1', 'running', 'attention', lastMachineProof) === null, 'production_machine_conflicting_retry_succeeded')
    assert(model.recordProductionMachineState(machineState, 'MC-1', 'stopped', 'attention', proof('ACT-MACHINE-STALE')) === null, 'production_stale_machine_observation_succeeded')
    assert(model.recordProductionMachineState(machineState, 'MC-1', 'running', 'running', proof('ACT-MACHINE-SAME')) === null, 'production_same_machine_observation_succeeded')
    assert(model.recordProductionMachineState(machineState, 'MC-1', 'running', 'offline', proof('ACT-MACHINE-UNKNOWN')) === null, 'production_unknown_machine_observation_succeeded')

    const downtimeBaseBefore = JSON.stringify(base)
    assert(model.productionDowntimeIntervals(base).length === 0, 'production_legacy_workspace_invented_downtime')
    const downtimeStartProof = proof('ACT-DOWNTIME-START', 4_000)
    const downtimeStarted = model.startProductionDowntime(base, 'MC-1', downtimeStartProof)
    assert(downtimeStarted
      && downtimeStarted.revision === base.revision + 1
      && downtimeStarted.events[0].kind === 'downtime_started'
      && downtimeStarted.events[0].subjectId === 'MC-1'
      && downtimeStarted.events[0].actor === downtimeStartProof.actor
      && downtimeStarted.events[0].reason === downtimeStartProof.reason
      && downtimeStarted.events[0].evidenceReference === downtimeStartProof.evidenceReference
      && JSON.stringify(downtimeStarted.jobs) === JSON.stringify(base.jobs)
      && JSON.stringify(downtimeStarted.issues) === JSON.stringify(base.issues)
      && JSON.stringify(downtimeStarted.machines) === JSON.stringify(base.machines),
    'production_downtime_start_not_exact_or_changed_collections')
    const openDowntime = model.productionDowntimeIntervals(downtimeStarted)
    assert(openDowntime.length === 1
      && openDowntime[0].machineId === 'MC-1'
      && openDowntime[0].machineName === 'Test machine'
      && openDowntime[0].startActionId === downtimeStartProof.actionId
      && openDowntime[0].startedAt === downtimeStartProof.capturedAt
      && openDowntime[0].startedBy === downtimeStartProof.actor
      && openDowntime[0].startReason === downtimeStartProof.reason
      && openDowntime[0].startEvidenceReference === downtimeStartProof.evidenceReference
      && openDowntime[0].end === undefined
      && openDowntime[0].durationMs === undefined,
    'production_open_downtime_interval_not_derived_exactly')
    assert(model.startProductionDowntime(downtimeStarted, 'MC-1', downtimeStartProof) === downtimeStarted, 'production_downtime_start_retry_not_idempotent')
    assert(model.startProductionDowntime(downtimeStarted, 'MC-1', { ...downtimeStartProof, reason: 'Changed reason' }) === null, 'production_downtime_start_conflicting_retry_succeeded')
    assert(model.startProductionDowntime(downtimeStarted, 'MC-1', proof('ACT-DOWNTIME-SECOND', 4_100)) === null, 'production_second_open_downtime_succeeded')
    assert(model.startProductionDowntime(base, 'MC-MISSING', proof('ACT-DOWNTIME-MISSING', 4_000)) === null, 'production_missing_machine_downtime_succeeded')
    for (const capturedAt of [
      '2026-07-23T10:00:04.000500Z',
      '0000-07-23T10:00:04.000Z',
      '+010000-07-23T10:00:04.000Z',
      '-000001-07-23T10:00:04.000Z',
    ]) {
      assert(model.startProductionDowntime(base, 'MC-1', { ...proof(`ACT-DOWNTIME-TIME-${capturedAt}`), capturedAt }) === null, `production_downtime_invalid_timestamp_accepted:${capturedAt}`)
    }
    assert(model.endProductionDowntime(downtimeStarted, 'MC-1', downtimeStartProof.actionId, proof('ACT-DOWNTIME-EARLY-END', 3_999)) === null, 'production_downtime_end_predated_start')
    assert(model.endProductionDowntime(downtimeStarted, 'MC-1', 'ACT-NOT-OPEN', proof('ACT-DOWNTIME-WRONG-START', 5_000)) === null, 'production_downtime_end_wrong_start_succeeded')
    const downtimeEndProof = proof('ACT-DOWNTIME-END', 5_000)
    const downtimeEnded = model.endProductionDowntime(downtimeStarted, 'MC-1', downtimeStartProof.actionId, downtimeEndProof)
    const closedDowntime = model.productionDowntimeIntervals(downtimeEnded)
    assert(downtimeEnded
      && downtimeEnded.events[0].kind === 'downtime_ended'
      && downtimeEnded.events[0].downtimeStartActionId === downtimeStartProof.actionId
      && downtimeEnded.events[0].actor === downtimeEndProof.actor
      && downtimeEnded.events[0].reason === downtimeEndProof.reason
      && downtimeEnded.events[0].evidenceReference === downtimeEndProof.evidenceReference
      && JSON.stringify(downtimeEnded.jobs) === JSON.stringify(base.jobs)
      && JSON.stringify(downtimeEnded.issues) === JSON.stringify(base.issues)
      && JSON.stringify(downtimeEnded.machines) === JSON.stringify(base.machines),
    'production_downtime_end_not_exact_or_changed_collections')
    assert(closedDowntime.length === 1
      && closedDowntime[0].durationMs === 1_000
      && closedDowntime[0].end?.actionId === downtimeEndProof.actionId
      && closedDowntime[0].end?.endedAt === downtimeEndProof.capturedAt
      && closedDowntime[0].end?.endedBy === downtimeEndProof.actor
      && closedDowntime[0].end?.reason === downtimeEndProof.reason
      && closedDowntime[0].end?.evidenceReference === downtimeEndProof.evidenceReference,
    'production_closed_downtime_interval_not_derived_exactly')
    assert(model.endProductionDowntime(downtimeEnded, 'MC-1', downtimeStartProof.actionId, downtimeEndProof) === downtimeEnded, 'production_downtime_end_retry_not_idempotent')
    assert(model.endProductionDowntime(downtimeEnded, 'MC-1', downtimeStartProof.actionId, { ...downtimeEndProof, evidenceReference: 'EV-CONFLICT' }) === null, 'production_downtime_end_conflicting_retry_succeeded')
    assert(model.startProductionDowntime(downtimeEnded, 'MC-1', downtimeStartProof) === downtimeEnded, 'production_historical_downtime_start_retry_not_idempotent')
    assert(model.endProductionDowntime(downtimeEnded, 'MC-1', downtimeStartProof.actionId, proof('ACT-DOWNTIME-SECOND-END', 5_500)) === null, 'production_second_downtime_end_succeeded')
    assert(model.startProductionDowntime(downtimeEnded, 'MC-1', proof('ACT-DOWNTIME-RESTART-EARLY', 4_999)) === null, 'production_downtime_restart_predated_last_end')
    const downtimeRestartProof = proof('ACT-DOWNTIME-RESTART', 6_000)
    const downtimeRestarted = model.startProductionDowntime(downtimeEnded, 'MC-1', downtimeRestartProof)
    assert(downtimeRestarted
      && model.productionDowntimeIntervals(downtimeRestarted).length === 2
      && model.productionDowntimeIntervals(downtimeRestarted)[0].startActionId === downtimeRestartProof.actionId
      && model.productionDowntimeIntervals(downtimeRestarted)[0].end === undefined,
    'production_downtime_restart_after_end_failed')
    assert(model.endProductionDowntime(downtimeRestarted, 'MC-1', downtimeStartProof.actionId, downtimeEndProof) === downtimeRestarted, 'production_historical_downtime_end_retry_not_idempotent')
    assertThrows(() => model.validateProductionState({
      ...downtimeStarted,
      revision: downtimeStarted.revision + 1,
      events: [{
        ...downtimeStarted.events[0],
        id: 'EVT-ACT-DOWNTIME-DUPLICATE',
        actionId: 'ACT-DOWNTIME-DUPLICATE',
        createdAt: proof('ACT-DOWNTIME-DUPLICATE', 4_500).capturedAt,
      }, ...downtimeStarted.events],
    }), 'production_duplicate_open_downtime_history_accepted')
    assertThrows(() => model.validateProductionState({
      ...downtimeEnded,
      events: [{ ...downtimeEnded.events[0], downtimeStartActionId: 'ACT-NOT-OPEN' }, ...downtimeEnded.events.slice(1)],
    }), 'production_downtime_wrong_linkage_accepted')
    assertThrows(() => model.validateProductionState({
      ...downtimeEnded,
      events: [{ ...downtimeEnded.events[0], createdAt: proof('ACT-DOWNTIME-BACKWARD', 3_999).capturedAt }, ...downtimeEnded.events.slice(1)],
    }), 'production_backward_downtime_history_accepted')
    assertThrows(() => model.validateProductionState({
      ...downtimeStarted,
      events: [{ ...downtimeStarted.events[0], unexpected: true }],
    }), 'production_downtime_extra_field_accepted')
    assert(JSON.stringify(base) === downtimeBaseBefore, 'production_downtime_derivation_mutated_source_state')

    const maintenanceBaseBefore = JSON.stringify(base)
    assert(model.productionMaintenanceRecords(base).length === 0, 'production_legacy_workspace_invented_maintenance')
    const maintenanceStartProof = proof('ACT-MAINTENANCE-START', 7_000)
    const maintenanceStarted = model.startProductionMaintenance(base, 'MC-1', 'Maintenance lead', maintenanceStartProof)
    assert(maintenanceStarted
      && maintenanceStarted.revision === base.revision + 1
      && maintenanceStarted.events[0].kind === 'maintenance_started'
      && maintenanceStarted.events[0].subjectId === 'MC-1'
      && maintenanceStarted.events[0].maintenanceOwner === 'Maintenance lead'
      && maintenanceStarted.events[0].actor === maintenanceStartProof.actor
      && maintenanceStarted.events[0].reason === maintenanceStartProof.reason
      && maintenanceStarted.events[0].evidenceReference === maintenanceStartProof.evidenceReference
      && JSON.stringify(maintenanceStarted.jobs) === JSON.stringify(base.jobs)
      && JSON.stringify(maintenanceStarted.issues) === JSON.stringify(base.issues)
      && JSON.stringify(maintenanceStarted.machines) === JSON.stringify(base.machines)
      && maintenanceStarted.jobs !== base.jobs
      && maintenanceStarted.jobs[0] !== base.jobs[0]
      && maintenanceStarted.issues !== base.issues
      && maintenanceStarted.machines !== base.machines
      && maintenanceStarted.machines[0] !== base.machines[0],
    'production_maintenance_start_not_exact_or_changed_collections')
    const openMaintenance = model.productionMaintenanceRecords(maintenanceStarted)
    assert(openMaintenance.length === 1
      && openMaintenance[0].machineId === 'MC-1'
      && openMaintenance[0].machineName === 'Test machine'
      && openMaintenance[0].startActionId === maintenanceStartProof.actionId
      && openMaintenance[0].owner === 'Maintenance lead'
      && openMaintenance[0].startedAt === maintenanceStartProof.capturedAt
      && openMaintenance[0].startedBy === maintenanceStartProof.actor
      && openMaintenance[0].scope === maintenanceStartProof.reason
      && openMaintenance[0].startEvidenceReference === maintenanceStartProof.evidenceReference
      && openMaintenance[0].completion === undefined,
    'production_open_maintenance_not_derived_exactly')
    assert(model.startProductionMaintenance(maintenanceStarted, 'MC-1', 'Maintenance lead', maintenanceStartProof) === maintenanceStarted, 'production_maintenance_start_retry_not_idempotent')
    assertThrows(() => model.startProductionMaintenance(
      { ...maintenanceStarted, revision: maintenanceStarted.revision + 1 },
      'MC-1',
      'Maintenance lead',
      maintenanceStartProof,
    ), 'production_maintenance_start_replay_bypassed_state_validation')
    assert(model.startProductionMaintenance(maintenanceStarted, 'MC-1', 'Different owner', maintenanceStartProof) === null, 'production_maintenance_start_conflicting_retry_succeeded')
    assert(model.startProductionMaintenance(maintenanceStarted, 'MC-1', 'Maintenance lead', proof('ACT-MAINTENANCE-SECOND', 7_100)) === null, 'production_second_open_maintenance_succeeded')
    assert(model.startProductionMaintenance(base, 'MC-MISSING', 'Maintenance lead', proof('ACT-MAINTENANCE-MISSING', 7_000)) === null, 'production_missing_machine_maintenance_succeeded')
    assert(model.startProductionMaintenance(base, 'MC-1', ' Maintenance lead', proof('ACT-MAINTENANCE-OWNER', 7_000)) === null, 'production_noncanonical_maintenance_owner_succeeded')
    assert(model.startProductionMaintenance(downtimeStarted, 'MC-1', 'Maintenance lead', downtimeStartProof) === null, 'production_maintenance_reused_downtime_action_id')
    const parallelMaintenance = model.startProductionMaintenance(downtimeStarted, 'MC-1', 'Maintenance lead', proof('ACT-MAINTENANCE-PARALLEL', 7_000))
    assert(parallelMaintenance
      && model.productionDowntimeIntervals(parallelMaintenance)[0].end === undefined
      && model.productionMaintenanceRecords(parallelMaintenance)[0].owner === 'Maintenance lead',
    'production_maintenance_changed_or_depended_on_downtime')
    assert(model.completeProductionMaintenance(maintenanceStarted, 'MC-1', maintenanceStartProof.actionId, proof('ACT-MAINTENANCE-EARLY', 6_999)) === null, 'production_maintenance_completion_predated_start')
    assert(model.completeProductionMaintenance(maintenanceStarted, 'MC-1', 'ACT-NOT-OPEN', proof('ACT-MAINTENANCE-WRONG-START', 8_000)) === null, 'production_maintenance_completion_wrong_start_succeeded')
    const maintenanceCompleteProof = proof('ACT-MAINTENANCE-COMPLETE', 8_000)
    const maintenanceCompleted = model.completeProductionMaintenance(maintenanceStarted, 'MC-1', maintenanceStartProof.actionId, maintenanceCompleteProof)
    const completedMaintenance = model.productionMaintenanceRecords(maintenanceCompleted)
    assert(maintenanceCompleted
      && maintenanceCompleted.events[0].kind === 'maintenance_completed'
      && maintenanceCompleted.events[0].maintenanceStartActionId === maintenanceStartProof.actionId
      && JSON.stringify(maintenanceCompleted.jobs) === JSON.stringify(base.jobs)
      && JSON.stringify(maintenanceCompleted.issues) === JSON.stringify(base.issues)
      && JSON.stringify(maintenanceCompleted.machines) === JSON.stringify(base.machines)
      && maintenanceCompleted.jobs !== maintenanceStarted.jobs
      && maintenanceCompleted.events[1] !== maintenanceStarted.events[0]
      && completedMaintenance[0].completion?.actionId === maintenanceCompleteProof.actionId
      && completedMaintenance[0].completion?.completedAt === maintenanceCompleteProof.capturedAt
      && completedMaintenance[0].completion?.completedBy === maintenanceCompleteProof.actor
      && completedMaintenance[0].completion?.outcome === maintenanceCompleteProof.reason
      && completedMaintenance[0].completion?.evidenceReference === maintenanceCompleteProof.evidenceReference,
    'production_maintenance_completion_not_exact')
    const completedMaintenanceHandoff = model.buildProductionShiftHandoff(maintenanceCompleted, shiftRef)
    assert(completedMaintenanceHandoff?.activeMaintenance.length === 0
      && !model.formatProductionShiftHandoff(completedMaintenanceHandoff).includes(maintenanceStartProof.evidenceReference),
    'production_completed_maintenance_remained_in_active_handoff')
    assert(model.completeProductionMaintenance(maintenanceCompleted, 'MC-1', maintenanceStartProof.actionId, maintenanceCompleteProof) === maintenanceCompleted, 'production_maintenance_completion_retry_not_idempotent')
    assertThrows(() => model.completeProductionMaintenance(
      { ...maintenanceCompleted, unexpected: true },
      'MC-1',
      maintenanceStartProof.actionId,
      maintenanceCompleteProof,
    ), 'production_maintenance_completion_replay_bypassed_state_validation')
    assert(model.completeProductionMaintenance(maintenanceCompleted, 'MC-1', maintenanceStartProof.actionId, { ...maintenanceCompleteProof, reason: 'Changed outcome' }) === null, 'production_maintenance_completion_conflicting_retry_succeeded')
    assert(model.startProductionMaintenance(maintenanceCompleted, 'MC-1', 'Maintenance lead', proof('ACT-MAINTENANCE-RESTART-EARLY', 7_999)) === null, 'production_maintenance_restart_predated_completion')
    const maintenanceRestarted = model.startProductionMaintenance(maintenanceCompleted, 'MC-1', 'Second shift lead', proof('ACT-MAINTENANCE-RESTART', 9_000))
    assert(maintenanceRestarted
      && model.productionMaintenanceRecords(maintenanceRestarted).length === 2
      && model.productionMaintenanceRecords(maintenanceRestarted)[0].owner === 'Second shift lead'
      && model.productionMaintenanceRecords(maintenanceRestarted)[0].completion === undefined,
    'production_maintenance_restart_after_completion_failed')
    assertThrows(() => model.validateProductionState({
      ...maintenanceStarted,
      revision: maintenanceStarted.revision + 1,
      events: [{
        ...maintenanceStarted.events[0],
        id: 'EVT-ACT-MAINTENANCE-DUPLICATE',
        actionId: 'ACT-MAINTENANCE-DUPLICATE',
        createdAt: proof('ACT-MAINTENANCE-DUPLICATE', 7_500).capturedAt,
      }, ...maintenanceStarted.events],
    }), 'production_duplicate_open_maintenance_history_accepted')
    assertThrows(() => model.validateProductionState({
      ...maintenanceCompleted,
      events: [{ ...maintenanceCompleted.events[0], maintenanceStartActionId: 'ACT-NOT-OPEN' }, ...maintenanceCompleted.events.slice(1)],
    }), 'production_maintenance_wrong_linkage_accepted')
    assertThrows(() => model.validateProductionState({
      ...maintenanceCompleted,
      events: [{ ...maintenanceCompleted.events[0], createdAt: proof('ACT-MAINTENANCE-BACKWARD', 6_999).capturedAt }, ...maintenanceCompleted.events.slice(1)],
    }), 'production_backward_maintenance_history_accepted')
    assertThrows(() => model.validateProductionState({
      ...maintenanceStarted,
      events: [{ ...maintenanceStarted.events[0], unexpected: true }],
    }), 'production_maintenance_extra_field_accepted')
    assertThrows(() => model.validateProductionState({ ...base, unexpected: true }), 'production_extra_state_field_accepted')
    assertThrows(() => model.validateProductionState({ ...base, jobs: [{ ...base.jobs[0], unexpected: true }] }), 'production_extra_job_field_accepted')
    assertThrows(() => model.validateProductionState({ ...base, issues: [{ id: 'ISS-X', createdAt: proof('ACT-ISSUE-X').capturedAt, area: 'Line 01', kind: 'maintenance', summary: 'Inspect', status: 'open', unexpected: true }] }), 'production_extra_issue_field_accepted')
    assertThrows(() => model.validateProductionState({
      ...resolved,
      issues: resolved.issues.map((issue, index) => index === 0
        ? { ...issue, resolution: { ...issue.resolution, unexpected: true } }
        : issue),
    }), 'production_extra_issue_resolution_field_accepted')
    assertThrows(() => model.validateProductionState({ ...base, machines: [{ ...base.machines[0], unexpected: true }] }), 'production_extra_machine_field_accepted')
    assert(JSON.stringify(base) === maintenanceBaseBefore, 'production_maintenance_derivation_mutated_source_state')

    values.clear()
    const currentState = model.createSeedProduction()
    values.set(model.PRODUCTION_KEY, JSON.stringify(currentState))
    values.set(model.LEGACY_PRODUCTION_KEYS[0], '{malformed')
    assert(model.productionWorkspaceCanWrite(storage, locks), 'production_valid_local_workspace_not_write_ready')
    assert(![...values.keys()].some((key) => key.includes('.write-probe.')), 'production_write_probe_left_storage_residue')
    assert(!model.productionWorkspaceCanWrite(storage, null), 'production_workspace_without_locks_reported_write_ready')
    const rejectingProductionStorage = {
      getItem: (key) => key === model.PRODUCTION_KEY ? JSON.stringify(currentState) : null,
      setItem: () => { throw new Error('read-only') },
      removeItem: () => {},
    }
    assert(!model.productionWorkspaceCanWrite(rejectingProductionStorage, locks), 'production_read_only_storage_reported_write_ready')
    const currentSnapshot = model.loadProductionWorkspace(storage)
    assert(currentSnapshot.source === 'current' && currentSnapshot.state.jobs.length === currentState.jobs.length, 'production_valid_v2_did_not_take_precedence')
    const malformed = '{broken'
    values.set(model.PRODUCTION_KEY, malformed)
    values.set(model.LEGACY_PRODUCTION_KEYS[0], JSON.stringify(legacy))
    assert(!model.productionWorkspaceCanWrite(storage, locks), 'production_malformed_workspace_reported_write_ready')
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
    const concurrentJobs = await Promise.all([
      model.mutateProductionWorkspace((state) => model.registerProductionJob(state, { id: 'JOB-2', line: 'Line 02', product: 'Second batch', target: 250, output: 0, owner: 'Line 02 lead', priority: 'urgent', dueAt: '2026-07-24T10:00:00.000Z' }, proof('ACT-CONCURRENT-JOB-2')), storage, locks),
      model.mutateProductionWorkspace((state) => model.registerProductionJob(state, { id: 'JOB-3', line: 'Line 03', product: 'Third batch', target: 300, output: 0, owner: 'Line 03 lead', priority: 'normal', dueAt: '2026-07-25T10:00:00.000Z' }, proof('ACT-CONCURRENT-JOB-3')), storage, locks),
    ])
    const concurrentJobState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(concurrentJobs.every((result) => result.ok) && concurrentJobState.jobs.length === 3 && concurrentJobState.events.length === 2 && concurrentJobState.revision === 2, 'production_concurrent_jobs_did_not_both_survive')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    lockRequests = 0
    const concurrentOutput = await Promise.all([
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 7, '2026-07-24 Day', proof('ACT-CONCURRENT-7')), storage, locks),
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 5, '2026-07-24 Day', proof('ACT-CONCURRENT-5')), storage, locks),
    ])
    const concurrentOutputState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(lockRequests === 2 && concurrentOutput.filter((result) => result.ok).length === 1, 'production_concurrent_output_not_serialized')
    assert(concurrentOutputState.jobs[0].output <= concurrentOutputState.jobs[0].target && concurrentOutputState.events.length === 1 && concurrentOutputState.revision === 1, 'production_concurrent_output_exceeded_target')
    const replay = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 7, '2026-07-24 Day', proof('ACT-CONCURRENT-7')), storage, locks)
    assert(replay.ok && replay.replayed === true && JSON.parse(values.get(model.PRODUCTION_KEY)).revision === 1, 'production_persisted_retry_changed_state')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    const concurrentIssue = { ...issue, id: 'ISS-CONCURRENT' }
    const mixedResults = await Promise.all([
      model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 5, '2026-07-24 Day', proof('ACT-MIXED-OUTPUT')), storage, locks),
      model.mutateProductionWorkspace((state) => model.openProductionIssue(state, concurrentIssue, proof('ACT-MIXED-ISSUE')), storage, locks),
    ])
    const mixedState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(mixedResults.every((result) => result.ok) && mixedState.jobs[0].output === 95 && mixedState.issues[0].id === concurrentIssue.id && mixedState.events.length === 2 && mixedState.revision === 2, 'production_concurrent_records_did_not_both_survive')

    values.clear()
    values.set(model.PRODUCTION_KEY, JSON.stringify(base))
    const beforeFailure = values.get(model.PRODUCTION_KEY)
    const failingStorage = { getItem: storage.getItem, setItem: () => { throw new Error('quota') } }
    const failedWrite = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 1, '2026-07-24 Day', proof('ACT-WRITE-FAIL')), failingStorage, locks)
    assert(!failedWrite.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_storage_failure_advanced_state')
    const invalidMutation = await model.mutateProductionWorkspace((state) => ({ ...state, revision: state.revision + 1 }), storage, locks)
    assert(!invalidMutation.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_non_append_mutation_succeeded')
    const throwingMutation = await model.mutateProductionWorkspace(() => { throw new Error('transition') }, storage, locks)
    assert(!throwingMutation.ok && throwingMutation.error.includes('transition failed') && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_transition_failure_was_misclassified')
    const unlocked = await model.mutateProductionWorkspace((state) => model.recordProductionOutput(state, 'JOB-1', 1, '2026-07-24 Day', proof('ACT-NO-LOCK')), storage, {})
    assert(!unlocked.ok && values.get(model.PRODUCTION_KEY) === beforeFailure, 'production_unlocked_write_succeeded')
  } catch (error) {
    fail(`production_runtime:${error instanceof Error ? error.message : 'unknown'}`)
  }
}

await verifyChannelOrderRuntime()
await verifyCatalogImportRuntime()
await verifyClientOnboardingRuntime()
await verifyWebsiteRuntime()
await verifyWebsiteOrderCompletionRuntime()
await verifyCommerceOrderDraftRuntime()
await verifyStorefrontDraftRuntime()
await verifyStorefrontRuntime()
await verifyManagedWebsiteRuntime()
await verifyManagedStorefrontRuntime()
await verifyCommerceRuntime()
await verifyProductionRuntime()

const bytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce((total, size) => total + size, 0)
if (bytes > 2_500_000) fail(`artifact_budget:${bytes}`)
const javascriptFiles = files.filter((path) => path.endsWith('.js'))
const largestJavascriptBytes = Math.max(...await Promise.all(javascriptFiles.map(async (path) => (await stat(path)).size)))
if (largestJavascriptBytes > 500_000) fail(`javascript_chunk_budget:${largestJavascriptBytes}`)
if (!javascriptFiles.some((path) => /[\\/]router-[^\\/]+\.js$/.test(path))) fail('router_chunk_artifact_missing')
if (!javascriptFiles.some((path) => /[\\/]shop-catalog-import-[^\\/]+\.js$/.test(path))) fail('shop_catalog_import_chunk_artifact_missing')
if (!javascriptFiles.some((path) => /[\\/]ClientDataOnboarding-[^\\/]+\.js$/.test(path))) fail('client_onboarding_chunk_artifact_missing')
if (largestJavascriptBytes > 480_000) fail(`javascript_headroom_budget:${largestJavascriptBytes}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_build', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_build', customerProducts: 4, sharedCapabilities: 1, primaryRoutes: 5, operatingModules: 2, makerModules: 2, compatibilityRedirects: 5, workflowProfiles, channelOrderRuntimeChecks, catalogImportRuntimeChecks, clientOnboardingRuntimeChecks, websiteRuntimeChecks, orderCompletionRuntimeChecks, commerceOrderDraftRuntimeChecks, storefrontDraftRuntimeChecks, storefrontRuntimeChecks, storefrontRequestRuntimeChecks, managedWebsiteRuntimeChecks, managedStorefrontRuntimeChecks, ecommerceHandoffRuntimeChecks, commerceRuntimeChecks, productionRuntimeChecks, largestJavascriptBytes, bytes }, null, 2))
