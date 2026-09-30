import { managedPortalEntryPath, managedAccountRequestUrl } from '../showroom/src/core/account-routes.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { validatePlantBusinessTemplates } from '../showroom/src/products/plant/business-templates.ts'
import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const activeIds = activeProductContracts(manifest).map(product => product.id)
const discoverablePages = manifest.pages.filter(page => !page.productId || activeIds.includes(page.productId))
const config = JSON.parse(readFileSync(resolve(root, '.vercel', 'output', 'config.json'), 'utf8'))
const readStatic = (path) => readFileSync(resolve(staticDir, path), 'utf8')
const publicObservabilitySource = readStatic('vercel-insights.js')
const publicGeneratorSource = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')
const skipLinkTouchTargetCss = '.skip-link { position: fixed; z-index: 60; top: 12px; left: 12px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; border-radius: 10px; background: var(--ink); color: #ffffff; font-size: 13px; font-weight: 720; text-decoration: none; transform: translateY(-160%); }'

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function countOccurrences(source, token) {
  return source.split(token).length - 1
}

const landingPages = manifest.pages.filter((page) => page.productId)
check(landingPages.map((page) => page.route).join(',') === '/shop/,/plant/,/website/,/ecommerce/', 'landing_route_set')
check(countOccurrences(publicGeneratorSource, skipLinkTouchTargetCss) === 1, 'landing_skip_link_touch_target_source_contract')
check(publicGeneratorSource.includes('--blue: #5b4ee8;') && publicGeneratorSource.includes('background:#f1f0fb;border:1px solid #dedbf4;'), 'landing_indigo_visual_system_source_contract')
check(!publicGeneratorSource.includes('#edf4f0') && !publicGeneratorSource.includes('#dce8e1'), 'landing_legacy_green_frames_removed')

// Route resolution: landing routes must reach the filesystem handler untouched, while the
// slash-less and deep variants must 308 onto the canonical landing route.
const redirectRoutes = config.routes.filter((route) => route.status === 308 && route.src)
for (const page of landingPages) {
  const productId = page.productId
  for (const path of [page.route]) {
    const intercepted = redirectRoutes.find((route) => new RegExp(route.src).test(path))
    check(!intercepted, `landing_route_not_redirected:${path}:${intercepted?.src || ''}`)
  }
  for (const path of [`/${productId}`, `/${productId}/legacy-deep-link`]) {
    const redirect = redirectRoutes.find((route) => new RegExp(route.src).test(path))
    check(redirect?.headers?.Location === page.route, `landing_variant_redirects:${path}`)
  }
  check(page.liveGate === 'post-release', `landing_live_gate_declared:${page.route}`)
}
check(config.routes.at(-1)?.dest === '/404.html' && config.routes.at(-1)?.status === 404, 'not_found_fallback_last')

// Page content markers, SEO metadata, and CTA wiring.
const descriptions = []
for (const page of landingPages) {
  const product = manifest.customerProducts.find((candidate) => candidate.id === page.productId)
  check(Boolean(product), `landing_product_exists:${page.productId}`)
  const html = readStatic(page.file)
  if (!activeIds.includes(page.productId)) {
    check(html.includes('name="robots" content="noindex,follow"'), `retained_noindex:${page.route}`)
    check(!html.includes(`href="${product.appRoute}"`) && !html.includes('Open retained workspace'), `retired_tool_link_absent:${page.route}`)
    check(html.includes('href="/#products"') && html.includes('Existing workspace records are preserved'), `retained_records_and_active_return:${page.route}`)
    check(html.includes('not offered for new setup'), `retained_boundary:${page.route}`)
    check(!html.includes('class="trade-card') && !html.includes('Request assisted setup'), `retained_no_acquisition:${page.route}`)
    continue
  }
  const canonical = new URL(page.route, `${manifest.release.productionDomain}/`).href
  const description = page.description || product.description
  check(Array.isArray(product.firstOperatingLoop) && product.firstOperatingLoop.length === 4, `landing_first_loop_manifest:${page.route}`)
  check(typeof description === 'string' && description.length >= 40, `landing_description_present:${page.route}`)
  descriptions.push(description)
  check(html.includes(`<title>${page.title}</title>`), `landing_title:${page.route}`)
  check(html.includes(`<link rel="canonical" href="${canonical}" />`), `landing_canonical:${page.route}`)
  check(html.includes(`<meta name="description" content="${description}" />`), `landing_meta_description:${page.route}`)
  check(html.includes(`<meta property="og:title" content="${page.title}" />`), `landing_og_title:${page.route}`)
  check(html.includes(`<meta property="og:url" content="${canonical}" />`), `landing_og_url:${page.route}`)
  const shareImage = new URL(`/og-card-${page.productId}.png`, `${manifest.release.productionDomain}/`).href
  check(html.includes(`<meta property="og:image" content="${shareImage}" />`), `landing_og_image:${page.route}`)
  check(!html.includes(`content="${new URL('/og-card.png', `${manifest.release.productionDomain}/`).href}"`), `landing_generic_share_card_absent:${page.route}`)
  check(html.includes('<meta property="og:image:width" content="1200" />') && html.includes('<meta property="og:image:height" content="630" />'), `landing_og_image_dimensions:${page.route}`)
  check(html.includes('<meta name="twitter:card" content="summary_large_image" />') && html.includes(`<meta name="twitter:image" content="${shareImage}" />`), `landing_twitter_card:${page.route}`)
  check(html.includes('<a class="skip-link" href="#content">Skip to content</a>') && html.includes('id="content"'), `landing_skip_link:${page.route}`)
  check(countOccurrences(html, skipLinkTouchTargetCss) === 1, `landing_skip_link_touch_target_output_contract:${page.route}`)
  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  check(schemaBlocks.length === 1, `landing_structured_data_count:${page.route}`)
  const schema = JSON.parse(schemaBlocks[0]?.[1] || '{}')
  check(schema['@context'] === 'https://schema.org' && schema['@type'] === 'Product' && schema.name === product.name && schema.url === canonical && schema.description === description, `landing_structured_data:${page.route}`)
  check(html.includes('<meta name="robots" content="index,follow" />'), `landing_indexable:${page.route}`)
  check((html.match(/<h1>/g) || []).length === 1, `landing_single_headline:${page.route}`)
  check(html.includes('class="platform-image"') && html.includes('class="feature-line"'), `landing_interface_and_features:${page.route}`)
  check(countOccurrences(html, 'href="https://app.supermega.dev/login"') === 1, `landing_single_login:${page.route}`)
  check(!html.includes('Request assisted setup') && !html.includes('id="first-loop"'), `landing_no_setup_funnel:${page.route}`)
  for (const unsupportedClaim of ['AI may help prepare drafts', 'AI assisted', 'Ranked next actions', 'approved AI context']) {
    check(!html.includes(unsupportedClaim), `landing_unverified_ai_offer_absent:${page.route}:${unsupportedClaim}`)
  }
  check(!html.includes(`href="${product.appRoute}"`), `landing_no_direct_app_route:${page.route}`)
  check(html.includes('href="/contact/">Contact</a>') && html.includes('href="/privacy/">Privacy</a>'), `landing_footer_parity:${page.route}`)
  check(html.includes('aria-label="SuperMega home"'), `landing_home_navigation:${page.route}`)
}
check(new Set(descriptions).size === descriptions.length, 'landing_descriptions_unique')
const titles = manifest.pages.map((page) => page.title)
check(new Set(titles).size === titles.length, 'page_titles_unique')

// The generated public bootstrap is inert everywhere except the two exact
// production hosts. Both provider queues receive their privacy boundary before
// either same-origin provider script is appended.
function executePublicObservability(hostname, protocol = 'https:') {
  const appended = []
  const window = {}
  const location = { protocol, hostname, origin: `${protocol}//${hostname}` }
  const document = {
    createElement: (type) => ({ type, defer: false, src: '' }),
    head: { append: (script) => appended.push(script) },
  }
  runInNewContext(publicObservabilitySource, { URL, Set, window, location, document })
  return { appended, window }
}

for (const page of manifest.pages) {
  const html = readStatic(page.file)
  check((html.match(/<script src="\/vercel-insights\.js"><\/script>/g) || []).length === 1, `public_observability_bootstrap_once:${page.route}`)
}
const securityRoute = config.routes.find((route) => route.src === '^/(.*)$' && route.continue === true)
check(securityRoute?.headers?.['content-security-policy']?.includes("script-src 'self'"), 'public_observability_csp_allows_same_origin_script_only')
const observabilityCacheRoute = config.routes.find((route) => route.src === '^/vercel-insights\\.js$')
check(observabilityCacheRoute?.continue === true && observabilityCacheRoute.headers?.['cache-control'] === 'no-store, max-age=0', 'public_observability_bootstrap_not_stale_cached')
check(!/https?:\/\//i.test(publicObservabilitySource), 'public_observability_provider_scripts_same_origin')
for (const forbidden of ['conversion', 'contact-form', 'customer', 'email', 'payment', 'proof_', "window.va('event'"]) {
  check(!publicObservabilitySource.includes(forbidden), `public_observability_private_or_custom_field_absent:${forbidden}`)
}

for (const hostname of ['supermega.dev', 'www.supermega.dev']) {
  const execution = executePublicObservability(hostname)
  check(execution.appended.map((script) => script.src).join(',') === '/_vercel/insights/script.js,/_vercel/speed-insights/script.js', `public_observability_provider_order:${hostname}`)
  check(execution.appended.every((script) => script.defer === true), `public_observability_provider_scripts_deferred:${hostname}`)
  check(execution.window.vaq?.[0]?.[0] === 'beforeSend' && typeof execution.window.vaq[0][1] === 'function', `public_analytics_before_send_registered:${hostname}`)
  check(execution.window.siq?.[0]?.[0] === 'beforeSend' && typeof execution.window.siq[0][1] === 'function', `public_speed_before_send_registered:${hostname}`)
  const analyticsBeforeSend = execution.window.vaq[0][1]
  const speedBeforeSend = execution.window.siq[0][1]
  check(JSON.stringify(analyticsBeforeSend({ type: 'pageview', url: `https://${hostname}/shop/?campaign=private#fragment` })) === JSON.stringify({ type: 'pageview', url: `https://${hostname}/shop/` }), `public_analytics_strips_query_and_hash:${hostname}`)
  check(analyticsBeforeSend({ type: 'event', url: `https://${hostname}/shop/` }) === null, `public_analytics_custom_event_rejected:${hostname}`)
  check(analyticsBeforeSend({ type: 'pageview', url: `https://${hostname}/private/` }) === null, `public_analytics_unknown_path_rejected:${hostname}`)
  check(analyticsBeforeSend({ type: 'pageview', url: 'https://example.test/shop/' }) === null, `public_analytics_cross_origin_rejected:${hostname}`)
  check(JSON.stringify(speedBeforeSend({ type: 'vital', url: `https://${hostname}/contact/?email=private#fragment`, route: '/unsafe' })) === JSON.stringify({ type: 'vital', url: `https://${hostname}/contact/`, route: '/contact/' }), `public_speed_strips_query_hash_and_route:${hostname}`)
  check(speedBeforeSend({ type: 'custom', url: `https://${hostname}/` }) === null, `public_speed_non_vital_rejected:${hostname}`)
}
for (const [hostname, protocol] of [['preview.vercel.app', 'https:'], ['supermega.dev', 'http:']]) {
  const execution = executePublicObservability(hostname, protocol)
  check(execution.appended.length === 0 && execution.window.vaq === undefined && execution.window.siq === undefined, `public_observability_non_production_inert:${protocol}//${hostname}`)
}
const privacy = readStatic('privacy/index.html')
for (const token of ['Site measurement', 'seven public page paths', 'removes query strings and fragments', 'SuperMega supplies no custom or conversion event', 'Vercel may add a timestamp, referrer', 'Source code or a reachable script does not prove that provider telemetry was observed.']) {
  check(privacy.includes(token), `public_observability_privacy_disclosure:${token}`)
}

const contact = readStatic('contact/index.html')
for (const token of ['Request received:', 'Keep this reference.', 'Next: review of scope, price and timing.']) {
  check(contact.includes(token), `contact_confirmed_receipt_guidance:${token}`)
}
for (const token of ['No action is needed now.', 'SuperMega will review your brief and reply with one scoped next step.']) {
  check(!contact.includes(token), `contact_no_unproven_delivery_promise:${token}`)
}

// Homepage links each product to its landing page without replacing the guided sample CTA.
const home = readStatic('index.html')
const homePage = manifest.pages.find((page) => page.route === '/')
const expectedHomeDescription = 'Sales and stock, business websites, and customer requests. Shop, Sites and Commerce for your business.'
check(homePage?.file === 'index.html', 'home_manifest_entry_exact')
check(homePage?.title === 'SuperMega | Business tools for Myanmar', 'home_manifest_business_title_exact')
check(homePage?.description === expectedHomeDescription, 'home_manifest_description_derived_from_supported_copy')
for (const token of [
  `<title>${homePage.title}</title>`,
  `<meta name="description" content="${homePage.description}" />`,
  `<meta property="og:title" content="${homePage.title}" />`,
  `<meta property="og:description" content="${homePage.description}" />`,
]) {
  check(home.includes(token), `home_metadata_manifest_bound:${token}`)
}
for (const staleToken of [
  '<title>SuperMega | Four products</title>',
  '<meta property="og:title" content="SuperMega | Four products" />',
  `<meta name="description" content="${manifest.company.statement}" />`,
  `<meta property="og:description" content="${manifest.company.statement}" />`,
]) {
  check(!home.includes(staleToken), `home_stale_metadata_absent:${staleToken}`)
}
const shopLanding = readStatic('shop/index.html')
const shopProduct = manifest.customerProducts.find(product => product.id === 'shop')
for (const [route, html] of [['/', home], ...activeIds.map(id => [`/${id}/`, readStatic(`${id}/index.html`)])]) {
  const body = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '')
  check(countOccurrences(body, 'href="https://app.supermega.dev/login"') === 1, `one_login:${route}`)
  check(!/<button\b/.test(body), `no_extra_buttons:${route}`)
  for (const forbidden of ['Open Shop', 'Open Ecommerce', 'Open Website', 'Profit Control', 'Choose shop type', 'Request assisted setup', 'trial', 'preview', 'demo', 'theme-toggle', 'dark mode']) {
    check(!body.toLowerCase().includes(forbidden.toLowerCase()), `no_clutter:${route}:${forbidden}`)
  }
  check(!/href="https:\/\/app\.supermega\.dev\/(?!login")/.test(body), `no_app_detours:${route}`)
}
for (const id of activeIds) check(home.includes(`id="${id}"`), `home_product_story:${id}`)
for (const filename of ['platform-shop-dashboard-v2.jpg', 'platform-sites-workspace-v2.jpg', 'platform-commerce-workflow-v2.jpg', 'platform-stock.jpg', 'platform-pages.jpg', 'platform-catalog.jpg']) {
  const image = readFileSync(resolve(staticDir, 'images', filename))
  check(image.subarray(0, 3).equals(Buffer.from([255,216,255])), `screenshot_jpeg:${filename}`)
  check(image.length > 10000, `screenshot_not_empty:${filename}`)
}
const shopTemplates = validateShopBusinessTemplates()
const shopTemplateIds = shopTemplates.map((template) => template.id)
const publicShopTemplateIds = [...shopLanding.matchAll(/<a class="trade-card" href="https:\/\/app\.supermega\.dev\/shop\/\?template=([a-z0-9-]+)">/g)]
  .map((match) => match[1])
check(shopTemplateIds.length === 10, 'shop_trade_registry_count')
const shopTemplateCopy = shopProduct?.modules?.filter((module) => /^\d+ Myanmar trade templates — /.test(module)) || []
const expectedShopTemplateCopy = `${shopTemplates.length} Myanmar trade templates — ${shopTemplates.map((template) => template.name.en).join(', ')}`
check(shopTemplateCopy.length === 1, 'shop_trade_manifest_copy_once')
check(shopTemplateCopy[0] === expectedShopTemplateCopy, 'shop_trade_manifest_copy_matches_registry_exactly')
check(publicShopTemplateIds.length === 0, 'shop_sample_trade_links_removed')
check(!shopLanding.includes('id="first-job-templates"'), 'shop_sample_template_section_removed')

const allLandingHtml = landingPages.map((page) => readStatic(page.file)).join('\n')
for (const product of manifest.customerProducts) {
  check(!allLandingHtml.includes(`Set up ${product.name} data`), `assisted_setup_old_label_absent:${product.id}`)
}
for (const id of activeIds) {
  check(countOccurrences(readStatic(`${id}/index.html`), `href="/contact/?product=${id}">Request assisted setup</a>`) === 0, `assisted_setup_product_specific_count:${id}`)
}

const ecommerceLanding = readStatic('ecommerce/index.html')
for (const token of [
  'Your team confirms each order and payment.',
  'Arrange delivery with your customer.',
]) {
  check(ecommerceLanding.includes(token), `ecommerce_delivery_boundary:${token}`)
}
for (const forbidden of ['Storefront from real stock', 'Send the reviewed request into Shop.', 'Create a Shop-connected ordering page.']) {
  check(!`${JSON.stringify(manifest)}\n${ecommerceLanding}`.includes(forbidden), `ecommerce_old_claim_absent:${forbidden}`)
}

function productContract(id) {
  const product = manifest.customerProducts.find((candidate) => candidate.id === id)
  assert.ok(product, `missing product contract ${id}`)
  return product
}

function escapedHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function publicFirstJobDoors(html) {
  return [...html.matchAll(/<a class="trade-card first-job-card" data-template="([a-z0-9-]+)" href="([^"]+)">/g)]
    .map((match) => ({ id: match[1], href: match[2] }))
}

const plantProduct = productContract('plant')
const plantPrimaryWorkflow = plantProduct.templates.find((template) => template.id === 'production-control')
check(Boolean(plantPrimaryWorkflow), 'plant_primary_workflow_template_present')
const plantTemplates = validatePlantBusinessTemplates()
const plantLanding = readStatic('plant/index.html')
const plantDoors = publicFirstJobDoors(plantLanding)
check(plantTemplates.length === 2, 'plant_shipped_template_registry_count')
check(plantDoors.length === 0, 'plant_acquisition_doors_retired')
check(!plantLanding.includes('Open retained workspace') && plantLanding.includes('Existing workspace records are preserved'), 'plant_retained_records_without_tool_action')

for (const productId of ['website', 'ecommerce']) {
  const html = readStatic(`${productId}/index.html`)
  check(publicFirstJobDoors(html).length === 0, `${productId}_sample_doors_removed`)
  check(!html.includes('https://app.supermega.dev/settings/?'), `${productId}_no_local_setup_detour`)
  check(html.includes('https://app.supermega.dev/login'), `${productId}_connected_login`)
}

const productOnboardingSource = readFileSync(resolve(root, 'showroom', 'src', 'core', 'ProductOnboardingPage.tsx'), 'utf8')
for (const token of [
  "const [businessTypeOpen, setBusinessTypeOpen] = useState(() => product === 'commerce')",
  '<optgroup label="Service businesses">',
  'Continue your saved ${onboardingProduct.name} workspace.',
  'resolveSetupTemplateDoor(product, setup, requestedTemplateId)',
  'Saved setup protected',
  'Continue saved {onboardingTemplate.name}',
  'Use {pendingRequestedWorkflowTemplate.name} for reviewed setup',
  'Existing ${onboardingProduct.name} records were not overwritten',
  "if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack) {",
]) {
  check(productOnboardingSource.includes(token), `public_template_door_saved_setup_guard:${token}`)
}

const coreCssSource = readFileSync(resolve(root, 'showroom', 'src', 'core', 'core-app.css'), 'utf8')
const mobileStepperColumns = '.shop-quantity-stepper { grid-template-columns: 44px 30px 44px; }'
const mobileStepperButtons = '.shop-quantity-stepper button { width: 44px; min-height: 44px; }'
check(countOccurrences(coreCssSource, mobileStepperColumns) === 2, 'shop_mobile_quantity_stepper_columns_44px_both_ranges')
check(countOccurrences(coreCssSource, mobileStepperButtons) === 2, 'shop_mobile_quantity_stepper_buttons_44_by_44_both_ranges')
check(!coreCssSource.includes('grid-template-columns: 40px 30px 40px'), 'shop_mobile_quantity_stepper_legacy_columns_absent')
check(!coreCssSource.includes('.shop-quantity-stepper button { width: 40px;'), 'shop_mobile_quantity_stepper_legacy_button_width_absent')

// Homepage carries exactly one Organization JSON-LD block sourced from the manifest.
const homeSchemaBlocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
check(homeSchemaBlocks.length === 1, 'home_structured_data_count')
const homeSchema = JSON.parse(homeSchemaBlocks[0]?.[1] || '{}')
check(homeSchema['@context'] === 'https://schema.org'
  && homeSchema['@type'] === 'Organization'
  && homeSchema.name === 'SuperMega'
  && homeSchema.url === new URL('/', `${manifest.release.productionDomain}/`).href
  && homeSchema.description === homePage.description, 'home_structured_data')

// Sitemap covers every public route exactly once with a well-formed lastmod.
const sitemap = readStatic('sitemap.xml')
check((sitemap.match(/<url>/g) || []).length === discoverablePages.length, 'sitemap_url_count')
check(!sitemap.includes('<loc>https://supermega.dev/plant/</loc>'), 'retained_plant_not_discoverable')
for (const page of discoverablePages) {
  const canonical = new URL(page.route, `${manifest.release.productionDomain}/`).href
  check(sitemap.includes(`<loc>${canonical}</loc>`), `sitemap_route:${page.route}`)
}
check(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap), 'sitemap_lastmod_format')
check(readStatic('robots.txt').includes('Sitemap: https://supermega.dev/sitemap.xml'), 'robots_references_sitemap')


check((home.match(/class="product-story"/g) || []).length === activeIds.length, 'home_one_card_per_active_product')
check(home.includes('Myanmar Text'), 'home_myanmar_language_and_font_fallback')
for (const id of activeIds) {
  const html = readStatic(`${id}/index.html`)
  check(!html.includes('<details class="frame product-details">'), `workflows_not_hidden:${id}`)
  check(!html.includes('id="trades"') && !html.includes('id="free-sample"'), `no_sample_catalog:${id}`)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_public_landing_pages', checks, routes: landingPages.map((page) => page.route) }))
