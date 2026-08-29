import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { validatePlantBusinessTemplates } from '../showroom/src/products/plant/business-templates.ts'
import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const config = JSON.parse(readFileSync(resolve(root, '.vercel', 'output', 'config.json'), 'utf8'))
const readStatic = (path) => readFileSync(resolve(staticDir, path), 'utf8')
const publicObservabilitySource = readStatic('vercel-insights.js')

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
  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  check(schemaBlocks.length === 1, `landing_structured_data_count:${page.route}`)
  const schema = JSON.parse(schemaBlocks[0]?.[1] || '{}')
  check(schema['@context'] === 'https://schema.org' && schema['@type'] === 'Product' && schema.name === product.name && schema.url === canonical && schema.description === description, `landing_structured_data:${page.route}`)
  check(html.includes('<meta name="robots" content="index,follow" />'), `landing_indexable:${page.route}`)
  check(html.includes(`<h1>${product.headline}</h1>`), `landing_headline:${page.route}`)
  check(html.includes('id="first-loop"'), `landing_first_loop_section:${page.route}`)
  check(html.includes('First operating loop'), `landing_first_loop_label:${page.route}`)
  check(html.includes(`<ol class="first-loop-list" aria-label="${product.name} first operating loop">`), `landing_first_loop_accessible:${page.route}`)
  for (const item of product.firstOperatingLoop) {
    check(html.includes(item), `landing_first_loop_item:${page.route}:${item}`)
  }
  const guidedSampleHref = `https://app.supermega.dev/settings/?product=${product.id}`
  const guidedSampleLabel = product.id === 'shop' ? 'Choose Shop type or continue saved' : 'Start free sample'
  check(html.includes(`href="${guidedSampleHref}">${guidedSampleLabel}</a>`), `landing_primary_cta:${page.route}`)
  check(html.includes(`href="/contact/?product=${product.id}"`), `landing_secondary_cta:${page.route}`)
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

// Homepage links each product to its landing page without replacing the guided sample CTA.
const home = readStatic('index.html')
for (const page of landingPages) {
  const product = manifest.customerProducts.find((candidate) => candidate.id === page.productId)
  const guidedSampleLabel = product.id === 'shop' ? 'Choose Shop type or continue saved' : 'Start free sample'
  check(home.includes(`href="${page.route}">${product.name} overview</a>`), `home_links_landing:${page.route}`)
  check(home.includes(`href="https://app.supermega.dev/settings/?product=${product.id}">${guidedSampleLabel}</a>`), `home_keeps_guided_cta:${product.id}`)
  check(home.includes(product.firstOperatingLoop[0]), `home_shows_first_loop:${product.id}`)
}

const shopLanding = readStatic('shop/index.html')
const shopGenericSetupHref = 'https://app.supermega.dev/settings/?product=shop'
const shopGenericSetupLabel = 'Choose Shop type or continue saved'
const shopGenericSetupAnchor = `href="${shopGenericSetupHref}">${shopGenericSetupLabel}</a>`
check(countOccurrences(home, shopGenericSetupAnchor) === 1, 'home_shop_generic_cta_truthful_once')
check(countOccurrences(shopLanding, shopGenericSetupAnchor) === 2, 'shop_landing_generic_cta_truthful_twice')
check(!`${home}\n${shopLanding}`.includes(`href="${shopGenericSetupHref}">Start free sample</a>`), 'shop_generic_cta_does_not_promise_new_sample')
check(!shopGenericSetupHref.includes('template='), 'shop_generic_cta_does_not_silently_choose_trade')
const shopTemplateIds = validateShopBusinessTemplates().map((template) => template.id)
const publicShopTemplateIds = [...shopLanding.matchAll(/<a class="trade-card" href="https:\/\/app\.supermega\.dev\/shop\/\?template=([a-z0-9-]+)">/g)]
  .map((match) => match[1])
check(shopTemplateIds.length === 10, 'shop_trade_registry_count')
check(new Set(publicShopTemplateIds).size === publicShopTemplateIds.length, 'shop_trade_links_unique')
check(publicShopTemplateIds.join(',') === shopTemplateIds.join(','), 'shop_trade_links_match_registry_exactly')
for (const templateId of shopTemplateIds) {
  check(shopLanding.includes(`href="https://app.supermega.dev/shop/?template=${templateId}"`), `shop_trade_opens_sell:${templateId}`)
  check(!shopLanding.includes(`href="https://app.supermega.dev/settings/?product=shop&amp;template=${templateId}"`), `shop_trade_skips_setup_detour:${templateId}`)
}
check(!shopLanding.includes('id="first-job-templates"'), 'shop_keeps_trade_first_door_without_generic_template_section')

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
const plantExpectedDoors = plantTemplates.map((template) => ({
  id: template.id,
  href: escapedHtml(`https://app.supermega.dev/settings/?product=plant&template=${plantPrimaryWorkflow.id}&pack=${template.industryPackId}`),
}))
check(plantTemplates.length === 2, 'plant_shipped_template_registry_count')
check(JSON.stringify(plantDoors) === JSON.stringify(plantExpectedDoors), 'plant_first_job_doors_match_validated_registry_exactly')
for (const template of plantTemplates) {
  check(plantLanding.includes(`<strong>${escapedHtml(template.name.en)}</strong><span>${escapedHtml(template.description)}</span>`), `plant_first_job_copy_matches_registry:${template.id}`)
}

for (const productId of ['website', 'ecommerce']) {
  const product = productContract(productId)
  const html = readStatic(`${productId}/index.html`)
  const doors = publicFirstJobDoors(html)
  const expectedDoors = product.templates.map((template) => ({
    id: template.id,
    href: escapedHtml(`https://app.supermega.dev/settings/?product=${productId}&template=${template.id}`),
  }))
  check(product.templates.length === 3, `${productId}_template_registry_count`)
  check(JSON.stringify(doors) === JSON.stringify(expectedDoors), `${productId}_first_job_doors_match_registry_exactly`)
  for (const template of product.templates) {
    check(html.includes(`<strong>${escapedHtml(template.name)}</strong><span>${escapedHtml(template.outcome)}</span>`), `${productId}_first_job_copy_matches_registry:${template.id}`)
  }
}

for (const productId of ['plant', 'website', 'ecommerce']) {
  const html = readStatic(`${productId}/index.html`)
  const doors = publicFirstJobDoors(html)
  check(doors.length > 0 && new Set(doors.map((door) => door.id)).size === doors.length, `${productId}_first_job_template_ids_unique`)
  check(new Set(doors.map((door) => door.href)).size === doors.length, `${productId}_first_job_routes_unique`)
  check(html.includes('Browser-local setup only'), `${productId}_first_job_local_boundary`)
  check(html.includes('does not overwrite an existing workspace, create a managed record, contact a customer, publish or send anything, accept payment, move stock, or record revenue'), `${productId}_first_job_external_effect_boundary`)
  check(html.includes('@media (max-width: 560px) { .trade-grid { grid-template-columns: 1fr; }'), `${productId}_first_job_mobile_single_column`)
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
  "if (pendingRequestedWorkflowTemplate) {",
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
  && homeSchema.description === manifest.company.statement, 'home_structured_data')

// Sitemap covers every public route exactly once with a well-formed lastmod.
const sitemap = readStatic('sitemap.xml')
check((sitemap.match(/<url>/g) || []).length === manifest.pages.length, 'sitemap_url_count')
for (const page of manifest.pages) {
  const canonical = new URL(page.route, `${manifest.release.productionDomain}/`).href
  check(sitemap.includes(`<loc>${canonical}</loc>`), `sitemap_route:${page.route}`)
}
check(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap), 'sitemap_lastmod_format')
check(readStatic('robots.txt').includes('Sitemap: https://supermega.dev/sitemap.xml'), 'robots_references_sitemap')

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_landing_pages', checks, routes: landingPages.map((page) => page.route) }))
