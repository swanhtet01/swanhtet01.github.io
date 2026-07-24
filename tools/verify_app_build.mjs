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
let storefrontRequestRuntimeChecks = 0
let commerceRuntimeChecks = 0
let productionRuntimeChecks = 0
const fail = (reason) => failures.push(reason)
const [manifestText, appPackageText, appSource, coreSource, commerceSource, channelOrderSource, managedTrialSource, managedCommerceRuntime, managedProductionRuntime, productionSource, teamSource, agentTeamsSource, teamModel, websiteSource, contentSource, publishSource, publishCssSource, sitePreviewSource, websiteModelSource, websiteExportSource, websiteWorkspaceSource, websiteCssSource, commerceIntakeSource, handoffSource, ecommerceSource, storefrontSource, storefrontRequestSource, coreCssSource] = await Promise.all([
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'package.json'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'App.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'channel-order-intake.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'managed-trial.ts'), 'utf8'),
  readFile(resolve(root, 'supermega_runtime', 'commerce_runtime.py'), 'utf8'),
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
  readFile(resolve(root, 'showroom', 'src', 'products', 'website', 'website-product.css'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'WebsiteCommerceIntake.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'product-handoff.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-model.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-request.ts'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'core-app.css'), 'utf8'),
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

for (const route of ['', 'work', 'operations', 'shop', 'plant', 'operations/commerce', 'operations/production', 'products/website', 'products/ecommerce', 'agents', 'settings']) {
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
for (const required of ['SUPERMEGA', 'Teams', 'Product', 'Acceptance outcome', 'Prepare brief', 'Evidence register', 'Record evidence', 'Verified evidence', 'verifiedAt', 'Operations', 'Confirm change', 'Action history', 'actorKind', 'evidenceReference', 'accountableActions', 'decision_packet.v1', 'Claims and provenance', 'claimType', 'claim_type', 'source_reference', 'artifact_reference', 'managedApprovalRequests', 'packetFingerprint', 'uncertainty', 'visibility', 'artifactReference', 'Human reviewer', 'Decision note', 'Approve and record', 'Local trial', 'Agents prepare work', 'Pilot definition', 'Workflow', 'workflowProfile', 'Current record', 'Baseline', 'Target outcome', 'Human authority boundary', 'Acceptance evidence', 'Operating mode', 'Write path', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!corpus.includes(required)) fail(`missing_context:${required}`)
}
if (!coreSource.includes("import siteManifest from '../../../site-manifest.json'")) fail('workflow_contract_not_shared')
if (coreSource.includes('const setupTemplates =') || coreSource.includes('const setupEntryPoints =')) fail('workflow_contract_duplicated')
if (!coreSource.includes("{ to: '/', label: 'Home', end: true }")
  || !coreSource.includes("{ to: '/work/', label: 'Work', end: false }")
  || !coreSource.includes("{ to: '/operations/', label: 'Products', end: false }")) fail('first_run_navigation_not_simple')
const overviewPageContract = coreSource.slice(coreSource.indexOf('export function OverviewPage'), coreSource.indexOf('export function OperationsPage'))
if (!overviewPageContract.includes('useCommerceWorkspace(managedIdentity)')
  || !overviewPageContract.includes('useProductionWorkspace(managedIdentity)')) fail('home_managed_product_sources_not_consistent')
if (!coreSource.includes('className="product-launcher home-products"')
  || !coreSource.includes('to="/shop/?tab=orders"')
  || !coreSource.includes('to="/plant/?tab=production"')
  || !coreSource.includes('to="/products/website/"')
  || !coreSource.includes('to="/products/ecommerce/"')
  || !coreSource.includes('const homeWork = visibleWork.slice(0, 3)')) fail('first_run_product_launcher_missing')
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
const coreLayoutRouteStart = appSource.indexOf('<Route element={<CoreLayout />}>')
const coreLayoutRouteEnd = appSource.indexOf('</Route>', coreLayoutRouteStart)
const websiteRoute = appSource.indexOf('path="products/website/*"')
const embeddedWebsiteCss = websiteCssSource.slice(websiteCssSource.indexOf('/* Website runs inside the shared SuperMega shell. */'))
if (coreLayoutRouteStart < 0
  || coreLayoutRouteEnd < 0
  || websiteRoute < coreLayoutRouteStart
  || websiteRoute > coreLayoutRouteEnd
  || !coreSource.includes("location.pathname.startsWith('/products/website/')")
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
  || !appSource.includes('path="products/ecommerce/*"')
  || !appSource.includes('<OperationsPage product="commerce" />')
  || !appSource.includes('path="shop/*"')
  || !appSource.includes('<OperationsPage product="production" />')
  || !appSource.includes('path="plant/*"')) fail('canonical_product_routes_missing')
if (!storefrontSource.includes("supermega.ecommerce.storefront_preview.v1")
  || !storefrontSource.includes('readStorefrontCatalog')
  || !storefrontSource.includes('buildStorefrontPreview')
  || !storefrontSource.includes("globalThis.crypto.subtle.digest('SHA-256'")
  || !storefrontSource.includes('validateCommerceState(JSON.parse(raw)).items')
  || ['setItem(', 'removeItem(', 'fetch(', 'XMLHttpRequest', 'navigator.locks'].some((marker) => storefrontSource.includes(marker))) fail('ecommerce_storefront_contract_missing_or_mutating')
if (!ecommerceSource.includes('Prices and availability are read-only.')
  || !ecommerceSource.includes('Ordering is not connected in this preview.')
  || !ecommerceSource.includes('Nothing is published or ordered here.')
  || !ecommerceSource.includes('Same approved copy and Shop snapshot produce the same digest.')
  || !ecommerceSource.includes('Test a customer request')
  || !ecommerceSource.includes('This local receipt is not a Shop order.')
  || !ecommerceSource.includes('No Shop record or stock changed.')
  || !coreSource.includes('<strong>Ecommerce</strong><small>Build a storefront from Shop</small>')
  || !coreSource.includes('<h2>AI Agent Solutions</h2>')) fail('ecommerce_storefront_ui_boundary_missing')
if (!storefrontRequestSource.includes("supermega.ecommerce.order_request.v1")
  || !storefrontRequestSource.includes("state: 'pending_shop_review'")
  || !storefrontRequestSource.includes('buildStorefrontOrderRequest')
  || !storefrontRequestSource.includes('recordStorefrontOrderRequest')
  || !storefrontRequestSource.includes('await storefrontPreviewDigest(preview) !== sourcePreviewDigest')
  || ['setItem(', 'removeItem(', 'fetch(', 'XMLHttpRequest', 'navigator.locks'].some((marker) => storefrontRequestSource.includes(marker))) fail('ecommerce_request_contract_missing_or_mutating')
if (!appPackage.scripts?.lint?.includes('src/products')) fail('prototype_sources_not_linted')
if (!websiteSource.includes('No website has been deployed.')
  || !websiteSource.includes('No deployment occurred.')
  || !publishSource.includes('No deployment, domain write, payment, stock, customer message, or order change happens here.')
  || !publishSource.includes('It does not deploy or change a domain.')) fail('website_deployment_boundary_missing')
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
  || !websiteModelSource.includes('Draft edits are session-only until you export or reset local data in Settings.')
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
  || !websiteSource.includes('Repair local data')
  || !websiteSource.includes('Archive and repair')
  || !websiteSource.includes('Download archive')
  || !websiteSource.includes('Recovery archives')
  || !websiteSource.includes('Confirm remove')
  || !websiteSource.includes('Shop, Plant, managed data, domains, and deployments are not touched.')
  || !websiteSource.includes('aria-busy={repairing}')) fail('website_targeted_repair_contract_missing')
if (!managedTrialSource.includes('saveManagedWebsiteCommand') || !managedTrialSource.includes("surface: 'website'") || !websiteWorkspaceSource.includes('loadManagedBootstrap()') || !websiteWorkspaceSource.includes("storageModeRef.current = 'managed'") || !websiteWorkspaceSource.includes('actor: managedActorRef.current') || !websiteWorkspaceSource.includes("error.code === 'trial_version_conflict'")) fail('managed_website_command_client_missing')
if (!websiteWorkspaceSource.includes('bindManagedActor') || !websiteWorkspaceSource.includes('verifiedBy: actor') || !websiteWorkspaceSource.includes('reviewer: actor') || !websiteWorkspaceSource.includes('recordedBy: actor')) fail('managed_website_actor_binding_missing')
const websiteHydrationStart = websiteWorkspaceSource.indexOf('void (async () => {')
const websiteHydrationEnd = websiteWorkspaceSource.indexOf('})()', websiteHydrationStart)
const websiteHydration = websiteWorkspaceSource.slice(websiteHydrationStart, websiteHydrationEnd)
if (websiteHydration.indexOf('try {') < 0 || websiteHydration.indexOf('try {') > websiteHydration.indexOf('currentManagedIdentity()') || websiteHydration.indexOf('finally') < websiteHydration.indexOf('currentManagedIdentity()')) fail('managed_website_identity_failure_can_stick_hydration')
const websiteUnifiedCss = websiteCssSource.slice(websiteCssSource.lastIndexOf('/* Unified Website workflow'))
if (!websiteSource.includes("type WebsiteView = 'content' | 'publish'")
  || !websiteSource.includes('className="website-action-bar"')
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
if (!websiteSource.includes('async function previewPage')
  || !websiteSource.includes('onSelectPage={(pageId) => void previewPage(pageId)}')
  || !websiteSource.includes("if (pageId !== selectedPage.id && !await selectPage(pageId)) return")
  || !websiteSource.includes('result.workspace.selectedPageId !== pageId')
  || !websiteSource.includes("openContentSurface('preview')")
  || !websiteSource.includes('setSiteSettingsOpen(false)')
  || websiteSource.includes("setNotice('Previewing the selected page.')")) fail('website_preview_action_does_not_open_preview')
if (!websiteSource.includes('ref={headingRef} tabIndex={-1}')
  || !websiteSource.includes('requestHeadingFocus()')
  || !websiteSource.includes('recoveryPrimaryActionRef')
  || /\.website-heading\[data-view="content"\]\s*\{[^}]*display:\s*none/s.test(websiteUnifiedCss)) fail('website_view_transition_focus_or_mobile_heading_missing')
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
if (!publishSource.includes('<details className="website-disclosure website-commerce-handoff">')
  || !publishSource.includes('Optional Shop handoff')
  || !publishSource.includes('Create site file')) fail('website_publish_secondary_actions_not_progressively_disclosed')
const websiteMobileCss = websiteCssSource.slice(websiteCssSource.indexOf('@media (max-width: 640px)'), websiteCssSource.indexOf('@media (prefers-reduced-motion'))
const websitePreviewControlsHiddenUnconditionally = /(?:^|\n)\s*\.website-preview-controls\s*\{\s*display:\s*none/.test(websiteMobileCss)
if (!websiteMobileCss.includes('.website-preview-controls') || !websiteMobileCss.includes('display: flex') || websitePreviewControlsHiddenUnconditionally) fail('website_mobile_review_controls_hidden')
if (!websiteMobileCss.includes('.website-handoff-controls input') || !websiteMobileCss.includes('min-height: 44px') || !websiteMobileCss.includes('font-size: 12px')) fail('website_mobile_handoff_controls_undersized')
if (!websiteCssSource.includes('.website-inline-actions > button,\n  .website-navigation-actions > button {\n    min-width: 44px;')) fail('website_mobile_reorder_touch_target_undersized')
if (!commerceIntakeSource.includes('Browser-local evidence only.') || !commerceIntakeSource.includes('No customer message, payment, delivery request, or external write occurs.')) fail('commerce_intake_boundary_missing')
if (!coreSource.includes('Start from a channel message')
  || !coreSource.includes('Human-mapped intake')
  || !coreSource.includes('AI is not connected')
  || !coreSource.includes('The full message is not part of the order record.')
  || !coreSource.includes('sourceRecordId: sourceDraft?.sourceRecordId')
  || !coreSource.includes('evidenceReferenceSuggestion: sourceDraft?.evidenceReference')
  || !coreSource.includes('evidenceReferenceLocked: Boolean(sourceDraft)')
  || !coreSource.includes('onAcceptedFocus')
  || !coreSource.includes("setOrderEntryMode('manual')")
  || !coreSource.includes("useState<ChannelOrderField>('customer')")
  || !coreSource.includes('aria-label="Message field mapping"')
  || !coreSource.includes('className="channel-intake-disclosure"')
  || !coreSource.includes('channelOrderDraftIsReady')) fail('channel_order_intake_ui_missing')
if (!coreSource.includes('className="core-panel next-task-card"')
  || !coreSource.includes('<details className="home-more">')
  || !coreSource.includes('className="product-launcher product-catalog"')
  || !coreSource.includes("useState<'manual' | 'message' | 'website'>('manual')")
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
if (!coreSource.includes('id="commerce-manual-order-form"')
  || !coreSource.includes('form="commerce-manual-order-form"')
  || !coreSource.includes('className="order-submit-bar"')
  || !coreSource.includes('className="order-essential-fields"')
  || !coreSource.includes('function ClosedOrderHistory')
  || !coreSource.includes('orders={actionOrders}')
  || !coreSource.includes('<ClosedOrderHistory orders={closedOrders} />')
  || !coreSource.includes('className="production-mode-banner commerce-mode-banner"')
  || !coreSource.includes("managedIdentity ? 'Managed records' : 'Sample data'")
  || !coreSource.includes('const commerceControlsDisabled = !commerceCanWrite || Boolean(pendingAction)')
  || !coreSource.includes('<details className="order-options">')
  || !coreSource.includes('<summary><span>Channel and payment</span><small>{channel} · {payment}</small></summary>')
  || !coreCssSource.includes('.order-form-panel { display: flex; flex-direction: column; overflow: hidden; }')
  || !coreCssSource.includes('.order-entry-panel { min-width: 0; min-height: 0; flex: 1; overflow: auto; }')
  || !coreCssSource.includes('.order-entry-panel[data-mode="manual"][data-notice="false"] { overflow: visible; }')
  || !coreCssSource.includes('.order-essential-fields { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);')
  || !coreCssSource.includes('.order-archive-list { max-height: 240px; overflow: auto;')
  || !coreCssSource.includes('.order-submit-bar .core-button { width: 100%; }')
  || !coreCssSource.includes('.order-options > summary { min-height: 44px;')
  || !coreCssSource.includes('.order-form-panel { display: block; }')
  || !coreCssSource.includes('.order-entry-panel { overflow: visible; }')) fail('commerce_order_submit_footer_missing')
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
if (!websiteSource.includes('approvalIsCurrent || !publishIsCurrent')
  || !websiteSource.includes('checks.every((check) => check.passed)')
  || !websiteSource.includes('writeWebsiteEcommerceHandoff(handoff, workspace)')
  || !websiteSource.includes('createCommerceWebsiteIntake(current')
  || !websiteSource.includes("storageMode === 'managed' ? 'managed' : 'local'")
  || !publishSource.includes('No deployment, domain write, payment, stock, customer message, or order change happens here.')) fail('website_handoff_gate_missing')
if (!commerceIntakeSource.includes('acceptWebsiteEcommerceHandoff') || !commerceIntakeSource.includes('matches.length === 1') || !commerceIntakeSource.includes('createWebsiteOrderDraft(context.handoff.id') || !commerceIntakeSource.includes('I reviewed this SKU, quantity, and Website evidence.')) fail('commerce_intake_approval_contract_missing')
if (!commerceIntakeSource.includes('await completeWebsiteOrderDraft')
  || !commerceIntakeSource.includes('opaque customer reference generated on completion')
  || !commerceIntakeSource.includes('Create ready order')
  || !commerceIntakeSource.includes('Confirm into orders')
  || !commerceIntakeSource.includes('disabled?: boolean')
  || !commerceIntakeSource.includes('if (disabled ||')) fail('commerce_order_completion_ui_missing')
if (!coreSource.includes('function queueWebsiteOrder') || !coreSource.includes('sourceRecordId') || !coreSource.includes('item.price !== line.unitPriceMmk') || !coreSource.includes('Website order confirmation failed closed') || !coreSource.includes('Confirm ${record.id} from Website')) fail('website_order_not_integrated_with_commerce')
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
  || commerceSource.includes("'unrecorded'")
  || commerceSource.includes("'refund_due'")) fail('commerce_payment_or_refund_contract_invalid')
if (!commerceSource.includes('commerceOrderHasReleasableReservation') || !commerceSource.includes("movement.kind === 'reserve'") || !commerceSource.includes("movement.kind === 'release'") || !commerceSource.includes("kind: 'receipt'") || !commerceSource.includes("kind: 'opening'")) fail('commerce_stock_ledger_contract_missing')
if (!commerceSource.includes('Recovery failed closed') || !commerceSource.includes('currentRaw !== null') || !commerceSource.includes("movements: []")) fail('commerce_migration_fail_closed_contract_missing')
if (!commerceSource.includes('export function settleCommerceRefund')
  || !commerceSource.includes("refundStatus: 'settled' as const")
  || !commerceSource.includes('order.refundSettlementActionId === proof.actionId')
  || !commerceSource.includes('order.paymentReconciliationActionId === actionId || order.refundSettlementActionId === actionId')
  || !commerceSource.includes('...refundSettlementActionIds')) fail('commerce_refund_settlement_contract_missing')
if (!managedTrialSource.includes('saveManagedCommerceCommand') || !managedTrialSource.includes('expected_version: request.expectedVersion') || !managedTrialSource.includes("surface: 'commerce'") || !managedTrialSource.includes('payload: { state: request.state, evidence: request.evidence }')) fail('managed_commerce_command_client_missing')
const managedCommerceClientSources = `${coreSource}\n${websiteSource}`
for (const eventType of ['commerce.workspace.initialized', 'commerce.item.created', 'commerce.order.created', 'commerce.order.advanced', 'commerce.order.cancelled', 'commerce.payment.reconciled', 'commerce.refund.settled', 'commerce.stock.received', 'commerce.close.saved', 'commerce.website_intake.created', 'commerce.website_intake.converted']) {
  if (!managedTrialSource.includes(eventType) || !managedCommerceClientSources.includes(eventType) || !managedCommerceRuntime.includes(eventType)) fail(`managed_commerce_event_missing:${eventType}`)
}
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
if (!coreSource.includes("mode: 'managed-unprovisioned'") || !coreSource.includes('No browser demo orders, customers, or stock records are copied') || !coreSource.includes('Create managed catalog') || !coreSource.includes('Opening balance reason') || !coreSource.includes('result.version !== current.version + 1') || !coreSource.includes('validateCommerceState(result.state)') || !coreSource.includes("error.code === 'trial_version_conflict'") || !coreSource.includes('managedIdentity ? null : <ActionHistory')) fail('managed_commerce_ui_not_fail_closed')
if (!coreSource.includes('confirmation?: AccountableAction') || !coreSource.includes('if (action.confirmation) return action.confirmation') || !coreSource.includes('Retry same confirmation') || !coreSource.includes('result.idempotent_replay') || !coreSource.includes('before the replay could be reconciled')) fail('managed_command_retry_not_frozen_or_reconciled')
if (!managedCommerceRuntime.includes('commerce.workspace.initialized') || managedCommerceRuntime.includes('commerce.snapshot.saved') || !managedCommerceRuntime.includes('_one_changed') || !managedCommerceRuntime.includes('_validate_event_evidence') || !managedCommerceRuntime.includes('daily close totals must match completed, reconciled orders')) fail('managed_commerce_server_transition_contract_missing')
if (!commerceSource.includes('registerCommerceItem') || !coreSource.includes('Add catalog item') || !coreSource.includes('Review catalog item') || !coreSource.includes('The opening balance may be zero.') || !managedCommerceRuntime.includes('one exact attributable opening balance')) fail('commerce_catalog_creation_contract_missing')
const commerceTabsContract = coreSource.slice(coreSource.indexOf('const commerceTabs'), coreSource.indexOf('const productionTabs'))
if (commerceTabsContract.includes("{ id: 'today', label: 'Today' }") || !commerceTabsContract.includes("{ id: 'orders', label: 'Orders' }") || !commerceTabsContract.includes("{ id: 'inventory', label: 'Stock' }") || (commerceTabsContract.match(/^\s*\{ id:/gm) || []).length !== 2) fail('commerce_two_tab_contract_changed')
const commercePageContract = coreSource.slice(coreSource.indexOf('function CommercePage'), coreSource.indexOf('function OrderList'))
const commerceOrdersContract = commercePageContract.slice(commercePageContract.indexOf("if (tab === 'orders')"), commercePageContract.indexOf("if (tab === 'inventory')"))
if (!commerceOrdersContract.includes('order-daily-controls') || !commerceOrdersContract.includes('Save daily close') || !commerceOrdersContract.includes('Close and exceptions')) fail('commerce_daily_controls_not_inside_orders')
if (!productionSource.includes("supermega.production.workspace.v2") || !productionSource.includes('mutateProductionWorkspace') || !productionSource.includes('productionWorkspaceCanWrite') || !productionSource.includes('.write-probe.') || !productionSource.includes('lockManager.request') || !productionSource.includes('next.revision !== current.revision + 1')) fail('production_v2_locked_store_missing')
if (!productionSource.includes("'job_created' | 'output_recorded' | 'issue_opened' | 'issue_resolved' | 'machine_state_changed'") || !productionSource.includes('events: [event, ...state.events]') || !productionSource.includes('Production revision must equal the append-only event count.')) fail('production_append_only_record_missing')
if (!productionSource.includes('registerProductionJob') || !coreSource.includes('production.job.created') || !coreSource.includes('<summary>Add job</summary>') || !coreSource.includes('Review job')) fail('production_recurring_job_workflow_missing')
if (!productionSource.includes('currentRaw !== null') || !productionSource.includes('Migration failed closed') || !productionSource.includes('events: []')) fail('production_migration_fail_closed_contract_missing')
if (!managedTrialSource.includes('saveManagedProductionCommand') || !managedTrialSource.includes("surface: 'production'") || !managedTrialSource.includes('eventType: ManagedProductionEvent') || !managedTrialSource.includes('payload: { state: request.state, evidence: request.evidence }')) fail('managed_production_command_client_missing')
for (const eventType of ['production.workspace.initialized', 'production.job.created', 'production.output.recorded', 'production.issue.opened', 'production.issue.resolved', 'production.machine_state.changed']) {
  if (!coreSource.includes(eventType) || !managedProductionRuntime.includes(eventType)) fail(`managed_production_event_missing:${eventType}`)
}
if (managedProductionRuntime.includes('production.snapshot.saved')
  || !managedProductionRuntime.includes('PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS')
  || !managedProductionRuntime.includes('_validate_job_created')
  || !managedProductionRuntime.includes('_validate_output_recorded')
  || !managedProductionRuntime.includes('_validate_issue_resolved')
  || !managedProductionRuntime.includes('_validate_machine_state_changed')
  || !managedProductionRuntime.includes('Production event must prepend exactly one record and preserve history.')) fail('managed_production_server_transition_contract_missing')
if (!coreSource.includes("mode: 'managed-unprovisioned'")
  || !coreSource.includes('No browser demo jobs, issues, equipment, or output are copied')
  || !coreSource.includes('Create managed plan')
  || !coreSource.includes("result.surface !== 'production'")
  || !coreSource.includes('validateProductionState(result.state)')
  || !coreSource.includes("error.code === 'trial_version_conflict'")
  || !coreSource.includes('managedIdentity ? `${record.id} confirmed by the managed Plant API.')) fail('managed_production_ui_not_fail_closed')
const productionTabsContract = coreSource.slice(coreSource.indexOf('const productionTabs'), coreSource.indexOf('function uid'))
if (productionTabsContract.includes("{ id: 'today', label: 'Today' }") || !productionTabsContract.includes("{ id: 'production', label: 'Jobs' }") || !productionTabsContract.includes("{ id: 'control', label: 'Problems' }") || (productionTabsContract.match(/^\s*\{ id:/gm) || []).length !== 2) fail('production_two_tab_contract_changed')
const productionPageContract = coreSource.slice(coreSource.indexOf('function ProductionPage'), coreSource.indexOf('function JobList'))
const productionJobsContract = productionPageContract.slice(productionPageContract.indexOf("if (tab === 'production')"), productionPageContract.indexOf("if (tab === 'control')"))
if (!productionJobsContract.includes('Jobs to finish')
  || !productionJobsContract.includes('<JobList jobs={activeJobs} />')
  || !productionJobsContract.includes('<CompletedJobHistory jobs={completedJobs} />')
  || !productionJobsContract.includes('Output is append-only in this trial')
  || !productionJobsContract.includes('{job.id} · {job.product} · {job.line}')
  || !coreSource.includes('No active jobs. Add a job below to start recording output.')) fail('production_jobs_not_task_first')
if (coreCssSource.includes('.production-view > .output-panel { grid-row: 1; }')
  || coreCssSource.includes('.production-view > .job-panel { grid-row: 2; }')) fail('production_mobile_job_context_order_regressed')
if (coreSource.includes('Math.min(quantity') || !productionPageContract.includes('No output was recorded.') || !productionPageContract.includes('Number.isSafeInteger(quantity)') || productionPageContract.includes('max={selectedRemaining')) fail('production_output_silently_clamped')
if (!productionPageContract.includes('persisted with attributed Plant evidence.') || productionPageContract.includes('<ActionHistory actions={actions} domain="production"')) fail('production_confirmation_record_not_domain_specific')
if (!coreSource.includes("addEventListener('storage', refreshFromStorage)") || !coreSource.includes("removeEventListener('storage', refreshFromStorage)")) fail('production_cross_tab_refresh_missing')
if (!coreSource.includes('headingRef.current?.focus()') || !coreSource.includes('returnFocus?.isConnected') || !coreSource.includes('previousFocus.focus()') || !coreSource.includes('aria-live="polite"') || !coreSource.includes('current recorded state ${machine.state}')) fail('production_confirmation_accessibility_missing')
if (!productionPageContract.includes('className="production-mode-banner"')
  || !productionPageContract.includes('data-write={productionCanWrite')
  || !productionPageContract.includes('if (!productionCanWrite)')
  || !productionPageContract.includes('Local sample')
  || !productionPageContract.includes('they do not control equipment')
  || !productionPageContract.includes('Records operator observations only.')
  || !productionPageContract.includes('disabled={!productionCanWrite')
  || !productionPageContract.includes('<IssueList disabled={!productionCanWrite')
  || !productionPageContract.includes('<ResolvedIssueHistory issues={resolvedIssues} />')
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
for (const route of ['/shop/', '/plant/', '/products/website/']) {
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
      channel: drafts[0].channel,
      item: item.name,
      itemSku: item.sku,
      quantity: drafts[0].quantity,
      payment: drafts[0].payment,
      paymentStatus: 'pending',
      refundStatus: 'none',
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
    const seed = model.createInitialWorkspace()
    const fingerprint = model.workspaceFingerprint(seed)
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
    assert(migratedOnce.ok && migratedOnce.workspace.evidence.length === 3 && migratedOnce.workspace.approvals.length === 1 && migratedOnce.workspace.localPublishes.length === 1 && migratedOnce.workspace.events.length === 0, 'website_v1_records_not_preserved')
    assert(migratedOnce.ok && migratedOnce.workspace.approvals[0].migratedFromV1 && migratedOnce.workspace.localPublishes[0].artifact === null && model.getCurrentApproval(migratedOnce.workspace) === null && model.getCurrentPublish(migratedOnce.workspace) === null, 'website_v1_release_claim_not_reopened')

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
    const retainedHistory = {
      ...seed,
      revision: 501,
      events: Array.from({ length: 501 }, (_, index) => ({
        id: `event-retained-${index}`,
        createdAt: at(index),
        actorKind: 'human',
        actor: 'OP-HISTORY',
        action: 'publish_evidence_recorded',
        subjectId: `history-${index}`,
        reason: 'Retained Website history',
        evidenceReference: `HISTORY-${index}`,
        source: { contentRevision: 0, digest: fingerprint },
      })),
    }
    assert(model.restoreWorkspace(retainedHistory)?.events.length === 501, 'website_history_was_truncated')

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
    assertThrows(() => model.validateCommerceState({ ...ledger501, items: [...ledger501.items, ledger501.items[0]] }), 'duplicate_sku_was_accepted')
    assertThrows(() => model.validateCommerceState({ ...ledger501, movements: [...ledger501.movements, ledger501.movements[0]] }), 'duplicate_movement_was_accepted')

    const base = {
      ...model.createEmptyCommerce(),
      items: [{ sku: 'SKU-1', name: 'Test item', onHand: 10, reorderAt: 2, price: 100 }],
    }
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
    const convertedIntake = model.convertCommerceWebsiteIntake(intake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
    }, conversionProof)
    assert(convertedIntake?.websiteIntakes?.[0].status === 'converted' && convertedIntake.websiteIntakes[0].conversion.orderId === 'ORD-WEB-12345678', 'managed_website_intake_not_converted')
    assert(convertedIntake.items[0].onHand === 8 && convertedIntake.orders[0].sourceRecordId === 'WINT-12345678' && convertedIntake.movements[0].quantityDelta === -2, 'managed_website_conversion_not_atomic')
    assertThrows(() => model.validateCommerceState({
      ...convertedIntake,
      movements: [{ ...convertedIntake.movements[0], actor: 'spoofed-actor' }, ...convertedIntake.movements.slice(1)],
    }), 'managed_website_conversion_reservation_proof_mismatch_succeeded')
    assert(model.convertCommerceWebsiteIntake(convertedIntake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
    }, conversionProof) === convertedIntake, 'managed_website_conversion_retry_not_idempotent')
    assert(model.convertCommerceWebsiteIntake(intake, 'WINT-12345678', {
      customer: 'Customer reference',
      fulfilmentMethod: 'local_delivery',
      paymentMethod: 'manual_qr',
    }, { ...conversionProof, actionId: intakeProof.actionId }) === null, 'managed_website_action_id_reuse_succeeded')

    const newItem = { sku: 'SKU-2', name: 'Second item', onHand: 0, reorderAt: 3, price: 250 }
    const openingProof = proof('ACT-ITEM-CREATE')
    const withItem = model.registerCommerceItem(base, newItem, openingProof)
    assert(withItem?.items[0].sku === newItem.sku && withItem.movements[0].kind === 'opening' && withItem.movements[0].quantityDelta === 0, 'catalog_item_opening_not_recorded')
    assert(model.registerCommerceItem(withItem, newItem, openingProof) === withItem, 'catalog_item_retry_not_idempotent')
    assert(model.registerCommerceItem(withItem, { ...newItem, price: 251 }, openingProof) === null, 'catalog_item_conflicting_retry_succeeded')
    assert(model.registerCommerceItem(withItem, newItem, proof('ACT-ITEM-DUPLICATE')) === null, 'duplicate_catalog_sku_succeeded')
    const reserveProof = proof('ACT-RESERVE')
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
      evidenceReference: reserveProof.evidenceReference,
      total: 200,
      status: 'confirmed',
    }
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

async function verifyStorefrontRuntime() {
  const assert = (condition, reason) => {
    if (!condition) throw new Error(reason)
    storefrontRuntimeChecks += 1
  }
  try {
    const nonce = Date.now()
    const storefront = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-model.ts')).href}?storefront-verify=${nonce}`)
    const requestModel = await import(`${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'storefront-request.ts')).href}?storefront-request=${nonce}`)
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
    const changed = storefront.buildStorefrontPreview(catalog, { ...input, summary: 'Changed storefront copy.' })
    assert(await storefront.storefrontPreviewDigest(changed) !== firstDigest, 'storefront_digest_ignored_copy_change')

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
    const recorded = requestModel.recordStorefrontOrderRequest(emptyLedger, request)
    requestAssert(recorded?.requests.length === 1 && recorded.requests[0].id === request.id, 'storefront_request_not_recorded')
    requestAssert(requestModel.recordStorefrontOrderRequest(recorded, request) === recorded, 'storefront_request_exact_retry_not_idempotent')
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
  } catch (error) {
    fail(`storefront_runtime:${error instanceof Error ? error.message : 'unknown'}`)
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
    assertThrows(() => model.validateProductionState({ ...ledger501, revision: 500 }), 'production_revision_event_mismatch_accepted')

    const base = {
      ...model.createEmptyProduction(),
      jobs: [{ id: 'JOB-1', line: 'Line 01', product: 'Test batch', target: 100, output: 90 }],
      machines: [{ id: 'MC-1', name: 'Test machine', state: 'running' }],
    }
    const newJob = { id: 'JOB-2', line: 'Line 02', product: 'Second batch', target: 250, output: 0 }
    const jobProof = proof('ACT-JOB-CREATE')
    const withJob = model.registerProductionJob(base, newJob, jobProof)
    assert(withJob?.jobs[0].id === newJob.id && withJob.jobs[0].output === 0 && withJob.revision === 1 && withJob.events[0].kind === 'job_created', 'production_job_not_created_once')
    assert(model.registerProductionJob(withJob, newJob, jobProof) === withJob, 'production_job_retry_not_idempotent')
    assert(model.registerProductionJob(withJob, { ...newJob, target: 251 }, jobProof) === null, 'production_job_conflicting_retry_succeeded')
    assert(model.registerProductionJob(withJob, newJob, proof('ACT-JOB-DUPLICATE')) === null, 'production_duplicate_job_id_succeeded')
    assert(model.registerProductionJob(withJob, { ...newJob, id: 'JOB-3' }, jobProof) === null, 'production_job_reused_action_id_succeeded')
    assert([
      { ...newJob, id: '', target: 1 },
      { ...newJob, id: 'JOB-BAD-0', target: 0 },
      { ...newJob, id: 'JOB-BAD-FLOAT', target: 1.5 },
      { ...newJob, id: 'JOB-BAD-OUTPUT', output: 1 },
    ].every((job, index) => model.registerProductionJob(base, job, proof(`ACT-JOB-BAD-${index}`)) === null), 'production_invalid_job_succeeded')
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
      model.mutateProductionWorkspace((state) => model.registerProductionJob(state, { id: 'JOB-2', line: 'Line 02', product: 'Second batch', target: 250, output: 0 }, proof('ACT-CONCURRENT-JOB-2')), storage, locks),
      model.mutateProductionWorkspace((state) => model.registerProductionJob(state, { id: 'JOB-3', line: 'Line 03', product: 'Third batch', target: 300, output: 0 }, proof('ACT-CONCURRENT-JOB-3')), storage, locks),
    ])
    const concurrentJobState = JSON.parse(values.get(model.PRODUCTION_KEY))
    assert(concurrentJobs.every((result) => result.ok) && concurrentJobState.jobs.length === 3 && concurrentJobState.events.length === 2 && concurrentJobState.revision === 2, 'production_concurrent_jobs_did_not_both_survive')

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

await verifyChannelOrderRuntime()
await verifyWebsiteRuntime()
await verifyWebsiteOrderCompletionRuntime()
await verifyStorefrontRuntime()
await verifyCommerceRuntime()
await verifyProductionRuntime()

const bytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce((total, size) => total + size, 0)
if (bytes > 2_500_000) fail(`artifact_budget:${bytes}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_build', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_build', primaryRoutes: 5, operatingModules: 2, prototypeRoutes: 2, compatibilityRedirects: 1, workflowProfiles, channelOrderRuntimeChecks, websiteRuntimeChecks, orderCompletionRuntimeChecks, storefrontRuntimeChecks, storefrontRequestRuntimeChecks, commerceRuntimeChecks, productionRuntimeChecks, bytes }, null, 2))
