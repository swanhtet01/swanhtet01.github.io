import { managedAccountPath, managedPortalEntryPath } from '../showroom/src/core/account-routes.ts'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { validatePlantBusinessTemplates } from '../showroom/src/products/plant/business-templates.ts'
import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { APP_DESCRIPTION } from './app_metadata.mjs'

const root = process.cwd()
const manifestSource = readFileSync(resolve(root, 'site-manifest.json'), 'utf8')
const coreShellSource = readFileSync(resolve(root, 'showroom', 'src', 'core', 'CoreShell.tsx'), 'utf8')
const appShellHtml = readFileSync(resolve(root, 'showroom', 'index.html'), 'utf8')
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const outputDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`)
  : resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const publicGalleryProvenance = JSON.parse(readFileSync(resolve(root, 'tools', 'public-assets', 'public-gallery-provenance.json'), 'utf8'))
const activeIds = activeProductContracts(manifest).map(product => product.id)
const discoverablePages = manifest.pages.filter(page => !page.productId || activeIds.includes(page.productId))
const config = JSON.parse(readFileSync(resolve(outputDir, 'config.json'), 'utf8'))
const readStatic = (path) => readFileSync(resolve(staticDir, path), 'utf8')
const publicObservabilitySource = readStatic('vercel-insights.js')
const publicCarouselSource = readStatic('platform-carousel.js')
const publicGeneratorSource = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')
const publicGalleryCaptureSource = readFileSync(resolve(root, 'tools/capture_public_gallery.mjs'), 'utf8')
const skipLinkTouchTargetCss = '.skip-link { position: fixed; z-index: 60; top: 12px; left: 12px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; border-radius: 10px; background: var(--ink); color: #ffffff; font-size: 13px; font-weight: 720; text-decoration: none; transform: translateY(-160%); }'

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function countOccurrences(source, token) {
  return source.split(token).length - 1
}

function hasClassToken(source, token) {
  return [...source.matchAll(/\bclass="([^"]+)"/g)].some((match) => match[1].split(/\s+/).includes(token))
}

check(coreShellSource.includes("return managedAccountPath('/login', product)"), 'product_login_uses_shared_safe_route')
check(appShellHtml.includes('<title>SuperMega Shop</title>')
  && countOccurrences(appShellHtml, `content="${APP_DESCRIPTION}"`) === 3
  && !appShellHtml.includes('Sites and Commerce'), 'app_shell_metadata_matches_shop_only_launch')
for (const [intent, slug] of [
  ['commerce', 'shop'],
  ['shop', 'shop'],
  ['production', 'plant'],
  ['plant', 'plant'],
  ['website', 'website'],
  ['ecommerce', 'ecommerce'],
]) {
  check(managedAccountPath('/login', intent) === `/login?product=${slug}`, `product_login_route:${intent}`)
  check(managedPortalEntryPath(slug) === `/${slug}/`, `product_login_completion_route:${slug}`)
}

const landingPages = manifest.pages.filter((page) => page.productId)
check(landingPages.map((page) => page.route).join(',') === '/shop/,/plant/,/website/,/ecommerce/', 'landing_route_set')
for (const route of ['/website/', '/ecommerce/']) {
  const start = manifestSource.indexOf(`"route": "${route}"`)
  const end = manifestSource.indexOf('\n    }', start)
  const entry = start < 0 || end < 0 ? '' : manifestSource.slice(start, end)
  const description = manifest.pages.find((page) => page.route === route)?.description || ''
  check(countOccurrences(entry, '"description":') === 1, `manifest_description_unique:${route}`)
  check(!/\b(preview|trial|demo)\b/i.test(description), `manifest_description_no_preview_funnel:${route}`)
}
check(publicCarouselSource.includes('data-gallery-previous') && publicCarouselSource.includes('data-gallery-next') && publicCarouselSource.includes('prefers-reduced-motion'), 'public_carousel_runtime_controls_and_motion')
check(!publicCarouselSource.includes('data-device-choice') && !publicCarouselSource.includes('function setViewport(mode)'), 'public_device_view_selector_removed')
const captureSourceGuard = publicGalleryCaptureSource.indexOf('const captureInputPaths = [')
const captureFixtureBuild = publicGalleryCaptureSource.indexOf("buildFixture('build_shop_browser_fixture.mjs'")
const captureGuard = publicGalleryCaptureSource.slice(captureSourceGuard, captureFixtureBuild)
check(captureSourceGuard >= 0 && /\.status !== 0/.test(captureGuard) && /\.stdout\.trim\(\)/.test(captureGuard)
  && captureGuard.includes("throw new Error('clean_capture_source_commit_required')")
  && captureGuard.includes("'tools/build_product_clarity_fixture.mjs'")
  && captureGuard.includes("process.env.SUPERMEGA_GALLERY_REVIEW_DIRTY_SOURCE === '1'")
  && captureGuard.includes('!reviewDirtyCapture && (sourceChanges.stdout.trim() || captureScriptChanges.stdout.trim() || captureChanges.stdout.trim())')
  && captureSourceGuard < captureFixtureBuild, 'gallery_capture_requires_bound_inputs_and_keeps_dirty_review_unpublishable')
check(publicGalleryCaptureSource.includes("git', ['ls-files', '-z', '--', ...captureInputPaths]")
  && publicGalleryCaptureSource.includes("git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...captureInputPaths]")
  && publicGalleryCaptureSource.includes('captureInputsAfter !== captureInputsBefore')
  && publicGalleryCaptureSource.includes('captureInputsSha256: captureInputsAfter')
  && publicGalleryCaptureSource.includes('publicationReady: false'), 'gallery_review_capture_must_hash_inputs_and_remain_unpublishable')
check(countOccurrences(publicGeneratorSource, skipLinkTouchTargetCss) === 1, 'landing_skip_link_touch_target_source_contract')
check(publicGeneratorSource.includes('--blue: #2563eb;')
  && publicGeneratorSource.includes('--bg-raised: #f3f6fc;')
  && publicGeneratorSource.includes('--line: rgba(11,15,23, .12);'), 'landing_void_blue_visual_system_source_contract')
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

// Every public route shares the same navigation and brand mark. Route-specific
// active state and Shop login intent are the only header differences.
const sharedShellRoutes = new Set(['/', '/shop/', '/contact/', '/privacy/'])
const sharedShellPages = manifest.pages.filter((page) => sharedShellRoutes.has(page.route))
let referenceBrandMarkup = null
for (const page of sharedShellPages) {
  const html = readStatic(page.file)
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] || ''
  const brandMarkup = header.match(/<a class="brand"[\s\S]*?<\/a>/)?.[0] || ''
  check(header.includes('<nav class="nav-links" aria-label="Main navigation">'), `shared_public_navigation:${page.route}`)
  for (const label of ['Shop', 'Contact', 'Login']) {
    check(header.includes(`>${label}</a>`), `shared_navigation_label:${page.route}:${label}`)
  }
  check(!header.includes('>Company</a>'), `company_navigation_removed:${page.route}`)
  const activeLabel = page.route === '/shop/' ? 'Shop' : page.route === '/contact/' ? 'Contact' : null
  const activeLinks = [...header.matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((match) => match[1])
  check(activeLinks.join(',') === (activeLabel || ''), `shared_navigation_active_state:${page.route}`)
  if (page.route === '/shop/') check(header.includes('https://app.supermega.dev/login?product=shop'), 'shop_navigation_preserves_login_intent')
  if (referenceBrandMarkup === null) referenceBrandMarkup = brandMarkup
  else check(brandMarkup === referenceBrandMarkup, `shared_brand_mark:${page.route}`)
}
check(sharedShellPages.length === sharedShellRoutes.size, 'shared_public_shell_routes_present')

// Page content markers, SEO metadata, and CTA wiring.
const descriptions = []
const expectedReviewDescriptions = {
  '/website/': 'The SuperMega team manages business pages, readiness checks and customer inquiries in Sites.',
  '/ecommerce/': 'The SuperMega team manages the Shop-backed catalog and reviews customer requests before any order or payment is confirmed.',
}
const productScreens = {
  shop: ['actual-shop-today.png', 'actual-shop-sell.png', 'actual-shop-orders.png', 'actual-shop-inventory.png'],
  website: ['actual-sites-editor.png', 'actual-sites-inquiries.png'],
  ecommerce: ['actual-commerce-catalog.png', 'actual-commerce-order-request.png'],
}
const interfaceDisclosure = (image) => {
  const asset = publicGalleryProvenance.assets.find(entry => entry.file === image)
  return asset?.capture ? 'Actual app interface · sample data' : null
}
check(!publicGeneratorSource.includes('compatibilityScreens') && !publicGeneratorSource.includes('data-legacy-interface-assets'), 'landing_legacy_interface_compatibility_removed')
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
  if (expectedReviewDescriptions[page.route]) {
    check(description === expectedReviewDescriptions[page.route], `landing_claim_scope:${page.route}`)
  }
  descriptions.push(description)
  check(html.includes(`<title>${page.title}</title>`), `landing_title:${page.route}`)
  check(html.includes(`<link rel="canonical" href="${canonical}" />`), `landing_canonical:${page.route}`)
  check(html.includes(`<meta name="description" content="${description}" />`), `landing_meta_description:${page.route}`)
  check(html.includes(`<meta property="og:description" content="${description}" />`), `landing_og_description:${page.route}`)
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
  check((html.match(/<h1\b/g) || []).length === 1, `landing_single_headline:${page.route}`)
  if (page.productId === 'shop') {
    const captureDisclosure = 'Shop interface. Sample records.'
    check(html.includes('class="shop-actual-showcase"') && html.includes(captureDisclosure), 'landing_shop_actual_showcase_disclosed')
    check(!html.includes('class="pos-window"') && !html.includes('class="sample-label"') && !html.includes('Complete sample sale') && !html.includes('shop-sample-demo.js'), 'landing_shop_no_simulated_pos')
    check(html.includes('class="platform-gallery shop-gallery-all"') && html.includes('class="platform-image"'), 'landing_shop_actual_screens_visible')
    check(countOccurrences(html, '<figure class="platform-image') === productScreens.shop.length, 'landing_shop_four_verified_product_screens')
    check(html.includes('Sales, stock and orders.') && html.includes(captureDisclosure), 'landing_shop_capture_disclosure')
    check(html.includes('platform-device-capture-desktop') && html.includes('platform-device-capture-tablet') && html.includes('platform-device-capture-phone') && !html.includes('data-device-choice'), 'landing_shop_all_device_captures_together')
    check(!html.includes('data-gallery-previous') && !html.includes('data-gallery-next') && !html.includes('data-platform-carousel'), 'landing_shop_all_views_without_carousel')
    check(!html.includes('<script src="/platform-carousel.js" defer></script>'), 'landing_shop_needs_no_gallery_script')
    check(!/<a\b[^>]*>\s*<img\b[^>]*src="\/images\/actual-shop-/i.test(html), 'landing_shop_screens_are_not_raw_image_links')
    check(!html.includes('Makro PRO') && !html.includes('17 October 2026'), 'landing_shop_no_dated_retail_price_claim')
    for (const screen of productScreens.shop) {
      const mobile = screen.replace(/\.png$/, '-mobile.png')
      const tablet = screen.replace(/\.png$/, '-tablet.png')
      check(html.includes(`/images/${screen}`), `landing_shop_product_view:${screen}`)
      check(html.includes(`/images/${tablet}`), `landing_shop_tablet_product_view:${tablet}`)
      check(html.includes(`/images/${mobile}`), `landing_shop_mobile_product_view:${mobile}`)
    }
  } else {
    check(html.includes('class="platform-gallery"') && html.includes('class="platform-image"') && html.includes('class="product-proof"') && html.includes('class="feature-line"'), `landing_interface_and_features:${page.route}`)
    check(countOccurrences(html, '<figure class="platform-image') === productScreens[page.productId]?.length, `landing_product_views:${page.route}`)
    const carousel = (productScreens[page.productId]?.length || 0) > 1
    check(
      html.includes('aria-roledescription="carousel"') &&
        html.includes('align-items:stretch') &&
        html.includes('display:flex;flex:0 0 100%;flex-direction:column') &&
        html.includes('width:100%;height:auto;max-width:1440px') &&
        html.includes('margin-top:auto;padding:16px 0 0') &&
        !html.includes('aspect-ratio:16/10') &&
        !html.includes('object-fit:contain'),
      `landing_gallery_native_ratio_equal_width_slides:${page.route}`,
    )
    check(countOccurrences(html, 'data-gallery-previous') === Number(carousel) && countOccurrences(html, 'data-gallery-next') === Number(carousel), `landing_gallery_navigation:${page.route}`)
    check(html.includes('role="group" aria-roledescription="slide"'), `landing_gallery_accessible_slides:${page.route}`)
    check(countOccurrences(html, 'class="platform-image-open"') === productScreens[page.productId].length
      && countOccurrences(html, 'aria-label="Open the selected full-size') === productScreens[page.productId].length
      && countOccurrences(html, 'data-mobile-image="/images/') === productScreens[page.productId].length * 2
      && !html.includes('target="_blank"'),
    `landing_full_size_gallery_views:${page.route}`)
    check(html.includes('class="product-story product-story-standalone"') && html.includes('.product-story-standalone {padding:0 0 58px;border-top:0}'), `landing_gallery_above_fold_spacing:${page.route}`)
    check(carousel === html.includes('<script src="/platform-carousel.js" defer></script>'), `landing_gallery_script:${page.route}`)
    check(!html.includes('data-legacy-interface-assets'), `landing_legacy_interface_assets_absent:${page.route}`)
    for (const screen of productScreens[page.productId] || []) check(html.includes(`/images/${screen}`), `landing_product_view:${page.route}:${screen}`)
    for (const screen of productScreens[page.productId] || []) {
      const mobile = screen.replace(/\.png$/, '-mobile.png')
      check(html.includes(`data-mobile-image="/images/${mobile}"`), `landing_mobile_product_view:${page.route}:${mobile}`)
    }
    check(html.includes('height:clamp(300px,112vw,500px);object-fit:cover'), `landing_compact_mobile_gallery:${page.route}`)
  }
  if (page.productId === 'ecommerce') {
    check(html.includes('Our team reviews each catalog request before Shop records an order or payment.'), 'landing_commerce_team_managed_scope')
    check(html.includes('alt="Commerce catalog showing available products, local pricing and customer ordering"'), 'landing_commerce_catalog_capture_description')
    check(html.includes(`Commerce &middot; Store catalog and availability &middot; ${interfaceDisclosure('actual-commerce-catalog.png')}`), 'landing_commerce_catalog_capture_scope_truthful')
    check(html.includes('alt="Commerce Store showing a locally saved customer request awaiting Shop confirmation"'), 'landing_commerce_capture_matches_store_flow')
    check(html.includes(`Commerce &middot; Request saved locally &middot; ${interfaceDisclosure('actual-commerce-order-request.png')}`), 'landing_commerce_request_capture_scope_truthful')
  }
  if (page.productId === 'website') {
    check(html.includes('Our team manages pages, readiness checks and customer inquiries in one workspace.'), 'landing_sites_team_managed_scope')
    check(html.includes('alt="Sites editor showing page navigation, focused content editing and readiness checks"'), 'landing_sites_editor_capture_description')
    check(html.includes('alt="Sites inquiry workspace showing a synthetic customer request, ownership and decision controls"'), 'landing_sites_inquiry_capture_description')
    check(html.includes(`Sites &middot; Page workspace and readiness &middot; ${interfaceDisclosure('actual-sites-editor.png')}`), 'landing_sites_editor_capture_scope_truthful')
    check(html.includes(`Sites &middot; Inquiry review and ownership &middot; ${interfaceDisclosure('actual-sites-inquiries.png')}`), 'landing_sites_inquiry_capture_scope_truthful')
  }
  const expectedLoginHref = page.route === '/shop/'
    ? 'href="https://app.supermega.dev/login?product=shop"'
    : 'href="https://app.supermega.dev/login"'
  check(countOccurrences(html, expectedLoginHref) === 1, `landing_login_actions:${page.route}`)
  if (page.route === '/shop/') check(html.includes('class="button button-primary" href="/contact/?product=shop">Request Shop setup'), 'shop_primary_action_requests_setup')
  if (page.route === '/') check(html.includes('.company-hero .hero-actions .button-primary') && html.includes('white-space:nowrap'), 'company_primary_action_stays_compact')
  check(!html.includes('Request assisted setup') && !html.includes('id="first-loop"'), `landing_no_setup_funnel:${page.route}`)
  for (const unsupportedClaim of ['AI may help prepare drafts', 'AI assisted', 'Ranked next actions', 'approved AI context']) {
    check(!html.includes(unsupportedClaim), `landing_unverified_ai_offer_absent:${page.route}:${unsupportedClaim}`)
  }
  const expectedContactTarget = activeIds.includes(product.id) && product.status === 'available-in-app'
    ? `/contact/?product=${product.id}`
    : null
  if (expectedContactTarget) {
    check(html.includes('class="home-contact product-action"'), `landing_available_product_action:${page.route}`)
    check(html.includes(`href="${expectedContactTarget}">Contact SuperMega</a>`), `landing_available_product_destination:${page.route}`)
  }
  check(!/href="https:\/\/app\.supermega\.dev\/(?!login(?:\?product=shop)?")/.test(html), `landing_product_has_no_direct_app_action:${page.route}`)
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
for (const token of ['Message received:', 'Keep this reference if you need to follow up.', 'We build practical operating software for Myanmar businesses, starting with Shop.']) {
  check(contact.includes(token), `contact_confirmed_receipt_guidance:${token}`)
}
for (const token of ['No action is needed now.', 'SuperMega will review your brief and reply with one scoped next step.', 'We’ll reply by email', 'We’ll follow up by email']) {
  check(!contact.includes(token), `contact_no_unproven_delivery_promise:${token}`)
}

// Company and Shop expose one customer product with source-bound sample captures.
const home = readStatic('index.html')
const notFound = readStatic('404.html')
const homePage = manifest.pages.find((page) => page.route === '/')
const expectedHomeDescription = manifest.company.supporting
const shopManifest = manifest.customerProducts.find((product) => product.id === 'shop')
check(homePage?.file === 'index.html', 'home_manifest_entry_exact')
check(homePage?.title === 'SuperMega | Business software for Myanmar', 'home_manifest_title_exact')
check(homePage?.description === expectedHomeDescription, 'home_manifest_description_derived_from_supported_copy')
check(hasClassToken(home, 'company-hero') && !home.includes('id="products"'), 'home_is_a_short_brand_entry_not_a_second_product_page')
check(home.includes('href="/shop/">Explore Shop') && home.includes('href="/contact/">Contact us')
  && !home.includes('>View every screen size') && !home.includes('>See Shop on desktop and mobile'), 'home_actions_prioritize_product_and_human_contact')
check(home.includes('<p class="hero-kicker">For Myanmar retailers</p>')
  && home.includes('See what sold.<br><span>Know what needs action.</span>')
  && home.includes('Record counter sales, check stock and follow open orders in SuperMega Shop.')
  && home.includes('class="company-operating-overview"') && home.includes('class="company-product-visual"')
  && !home.includes('class="company-product-evidence"')
  && !home.includes('class="company-portfolio"')
  && !/href="\/(?:website|ecommerce)\//.test(home)
  && !/\bSites\b|\bCommerce\b/.test(home), 'home_shop_only_customer_scope_visible')
check(!home.includes('class="platform-gallery home-platform-gallery shop-gallery-all"')
  && !home.includes('data-platform-carousel') && !home.includes('<nav class="shop-showcase-nav"')
  && !home.includes('Choose a Shop screen'), 'home_does_not_repeat_the_shop_gallery')
check(notFound.includes('Find Shop on the home page.')
  && !/\bSites\b|\bCommerce\b|\bPlant\b/.test(notFound), 'not_found_matches_shop_only_customer_scope')
for (const token of [
  `<title>${homePage.title}</title>`,
  `<meta name="description" content="${homePage.description}" />`,
  `<meta property="og:title" content="${homePage.title}" />`,
  `<meta property="og:description" content="${homePage.description}" />`,
]) check(home.includes(token), `home_metadata_manifest_bound:${token}`)
check(home.includes('<figure class="company-product-visual"') && home.includes('src="/images/actual-shop-today.png"')
  && home.includes('Shop · Today') && home.includes('Sample data'), 'home_provenance_checked_shop_capture_visible')
const shopLanding = readStatic('shop/index.html')
const shopProduct = manifest.customerProducts.find(product => product.id === 'shop')
for (const token of [
  'See the daily workflow.',
  'Shop interface. Sample records.',
  'Shop Today showing sales, open orders and low-stock indicators',
  'Shop counter with searchable products, visible stock levels, and Add controls for a new sale',
  'Shop order queue showing order status and the next follow-up',
  'Shop inventory workspace showing stock levels and the count, receive, and reorder workflow',
]) check(shopLanding.includes(token), `shop_gallery_describes_verified_view:${token}`)
check(!shopLanding.includes('Makro PRO') && !shopLanding.includes('17 October 2026')
  && !/<a\b[^>]*>\s*<img\b[^>]*src="\/images\/actual-shop-/i.test(shopLanding), 'shop_prices_not_dated_and_screens_not_raw_links')
check(!shopLanding.includes('Shop setup / concept') && !shopLanding.includes('Concept only'), 'shop_no_unconnected_setup_concept')
check(shopLanding.includes('id="shop-demo"') && shopLanding.includes('class="shop-actual-showcase"'), 'shop_actual_gallery_is_primary_showcase')
check(shopLanding.includes('class="platform-gallery shop-gallery-all"')
  && !shopLanding.includes('data-platform-carousel') && !shopLanding.includes('<div class="platform-gallery-controls"')
  && !shopLanding.includes('data-gallery-next'),
  'shop_landing_shows_all_screens_without_carousel_controls')
check(!shopLanding.includes('class="pos-window"') && !shopLanding.includes('class="sample-label"')
  && !shopLanding.includes('Complete sample sale') && !shopLanding.includes('Sample receipt')
  && !shopLanding.includes('shop-sample-demo.js'), 'shop_public_page_has_no_simulated_pos')
check(shopLanding.includes('class="platform-gallery shop-gallery-all"') && shopLanding.includes('class="platform-image"')
  && countOccurrences(shopLanding, '<figure class="platform-image') === 4, 'shop_four_real_views_in_gallery')
check(shopManifest?.status === 'release-candidate-local', 'shop_public_status_matches_unhosted_candidate')
check(shopManifest?.primaryCta?.url === '/shop/#shop-demo', 'shop_primary_action_opens_real_screen_gallery')
check(shopLanding.includes('Sales, stock and orders.') && shopLanding.includes('One clear view.'), 'shop_hero_matches_the_operating_job')
check(shopLanding.includes('.shop-hero .button-primary') && shopLanding.includes('white-space:nowrap'), 'shop_primary_action_stays_compact')
check(shopLanding.includes('Search products, build the basket and complete a sale. Keep open orders and stock levels close at hand.'), 'shop_hero_copy_matches_visible_features')
check(!/<section\b[^>]*class="[^"]*\bsubscription-section\b/.test(shopLanding)
  && !shopLanding.includes('no setup fee') && !shopLanding.includes('printer-sourcing markup'), 'shop_page_omits_unverified_pricing_and_hardware_promises')
check(!/KBZPay|WavePay|Appointment book|General ledger|3-way invoice match|Tax engine|Supplier scoring|Customer credit/.test(JSON.stringify(shopManifest?.modules || [])), 'shop_public_manifest_excludes_unverified_enterprise_claims')
check(!/KBZPay|WavePay|Profit Control|read-only first job|sample receipt|Open the sample sale/.test(shopLanding), 'shop_public_page_avoids_old_or_ungated_claims')
check(activeIds.join(',') === 'shop' && shopManifest?.status === 'release-candidate-local', 'shop_customer_access_scope_matches_candidate')
for (const forbidden of ['start a free trial', 'testimonials', 'customer testimonials', 'readiness score']) check(!shopLanding.toLowerCase().includes(forbidden), `shop_no_unsubstantiated_offer:${forbidden}`)
for (const [route, html] of [['/', home], ['/shop/', shopLanding], ...activeIds.filter(id => id !== 'shop').map(id => [`/${id}/`, readStatic(`${id}/index.html`)])]) {
  const body = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '')
  const routeProduct = route === '/' ? null : route.slice(1, -1)
  const routeManifestProduct = routeProduct ? manifest.customerProducts.find(product => product.id === routeProduct) : null
  const expectedLoginHref = route === '/shop/'
    ? 'href="https://app.supermega.dev/login?product=shop"'
    : 'href="https://app.supermega.dev/login"'
  check(countOccurrences(body, expectedLoginHref) === 1, `login_action_count:${route}`)
  const carouselCount = Number(route !== '/' && route !== '/shop/' && (productScreens[routeProduct]?.length || 0) > 1)
  const expectedLinks = route === '/' ? 10 : route === '/shop/' ? 9 : 5 + Number(routeManifestProduct?.status === 'available-in-app')
  check((body.match(/<a\b/g) || []).length === expectedLinks, `marketing_link_surface:${route}`)
  const viewportGalleryCount = countOccurrences(body, 'data-viewport-gallery')
  const expectedButtons = viewportGalleryCount * 3 + carouselCount * 2
  check((body.match(/<button\b/g) || []).length === expectedButtons, `marketing_buttons:${route}`)
  const figures = (body.match(/<figure class="platform-image/g) || []).length
  check(figures === (route === '/' ? 0 : productScreens[routeProduct]?.length || 0), `marketing_interface_figures:${route}`)
  const expectedCaptureScreens = route === '/' ? [] : productScreens[routeProduct] || []
  for (const screen of expectedCaptureScreens) check(body.includes(interfaceDisclosure(screen)), `interface_disclosure_per_image:${route}:${screen}`)
  check(!body.includes('Current Shop') && !body.includes('Current Sites') && !body.includes('Current Commerce'), `capture_not_claimed_current:${route}`)
  const bodyWithoutCaptureDisclosure = body.replace(/Product UI capture . synthetic local records/g, '')
  for (const forbidden of ['Choose shop type', 'Request assisted setup', 'theme-toggle', 'dark mode']) {
    check(!bodyWithoutCaptureDisclosure.toLowerCase().includes(forbidden.toLowerCase()), 'no_clutter:' + route + ':' + forbidden)
  }
  const misleadingFunnelCopy = [
    ['free-trial offer', /\b(?:start|try|claim|request)\s+(?:a\s+|your\s+)?free trial\b|\bfree trial (?:available|offer|now)\b/i],
    ['unfinished page', /\b(?:coming soon|under construction)\b/i],
    ['unavailable preview offer', /\b(?:request|join|access)\s+(?:a\s+|the\s+)?(?:customer )?preview\b|\bpreview only\b/i],
  ]
  for (const [label, pattern] of misleadingFunnelCopy) {
    check(!pattern.test(bodyWithoutCaptureDisclosure), 'no_misleading_funnel_copy:' + route + ':' + label)
  }
  const expectedContactTarget = routeManifestProduct?.status === 'available-in-app' ? `/contact/?product=${routeManifestProduct.id}` : null
  const directAppLinks = [...body.matchAll(/href="(https:\/\/app\.supermega\.dev\/[^\"]+)"/g)].map(match => match[1]).filter(target => target !== 'https://app.supermega.dev/login')
  check(directAppLinks.length === 0 || (route === '/shop/' && directAppLinks.length === 1 && directAppLinks[0] === 'https://app.supermega.dev/login?product=shop'), `app_actions_match_release_state:${route}`)
  if (expectedContactTarget) check(body.includes(`href="${expectedContactTarget}">Contact SuperMega</a>`), `product_contact_action_matches_release_state:${route}`)
}
check(countOccurrences(home, 'href="/shop/">Explore Shop') === 1, 'home_one_focused_shop_link')
check(!home.includes('class="family-link"'), 'home_removes_the_duplicate_company_product_section')
check(home.includes('href="/contact/">Contact</a>'), 'home_contact_path_visible')
const screenshotHashes = new Set()
const publishedProductScreens = activeIds.flatMap((id) => productScreens[id] || [])
const internalProductScreens = Object.keys(productScreens)
  .filter((id) => !activeIds.includes(id))
  .flatMap((id) => productScreens[id] || [])
for (const filename of publishedProductScreens) {
  const image = readFileSync(resolve(staticDir, 'images', filename))
  const [expectedWidth, expectedHeight] = [1440, 900]
  check(image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `screenshot_png:${filename}`)
  check(image.readUInt32BE(16) === expectedWidth && image.readUInt32BE(20) === expectedHeight, `screenshot_full_render:${filename}`)
  check(image.length > 10000, `screenshot_not_empty:${filename}`)
  const hash = image.toString('base64')
  check(!screenshotHashes.has(hash), `screenshot_unique:${filename}`)
  screenshotHashes.add(hash)
}
for (const filename of internalProductScreens) {
  check(!existsSync(resolve(staticDir, 'images', filename)), `internal_product_capture_not_published:${filename}`)
}
const shopTemplates = validateShopBusinessTemplates()
const shopTemplateIds = shopTemplates.map((template) => template.id)
const publicShopTemplateIds = [...shopLanding.matchAll(/<a class="trade-card" href="https:\/\/app\.supermega\.dev\/shop\/\?template=([a-z0-9-]+)">/g)]
  .map((match) => match[1])
check(shopTemplateIds.length === 10, 'shop_trade_registry_count')
const shopTemplateCopy = shopProduct?.modules?.filter((module) => /^\d+ Myanmar trade templates — /.test(module)) || []
check(shopTemplateCopy.length === 0, 'shop_manifest_does_not_market_unavailable_template_feature')
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
check(!activeIds.includes('ecommerce')
  && ecommerceLanding.includes('name="robots" content="noindex,follow"')
  && ecommerceLanding.includes('Existing workspace records are preserved')
  && !ecommerceLanding.includes('class="platform-image'), 'ecommerce_internal_compatibility_boundary')
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
  "if (pendingRequestedWorkflowTemplate || pendingRequestedPlantIndustryPack || pendingRequestedShopBusinessChoiceId) {",
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


check(countOccurrences(home, 'class="family-link"') === 0, 'home_has_no_duplicate_company_product_section')
check(home.includes('SuperMega Noto Sans'), 'home_noto_font')
for (const html of [home, shopLanding]) {
  check(html.includes('<html lang="en">'), 'marketing_page_english')
  check(!html.includes('data-language-toggle') && !html.includes('src="/site-language.js"'), 'marketing_page_has_no_language_control')
  check(!html.includes('data-i18n=') && !/[\u1000-\u109f]/u.test(html), 'marketing_page_has_no_myanmar_copy')
}
for (const id of activeIds) {
  const html = readStatic(`${id}/index.html`)
  check(!html.includes('<details class="frame product-details">'), `workflows_not_hidden:${id}`)
  check(!html.includes('id="trades"') && !html.includes('id="free-sample"'), `no_sample_catalog:${id}`)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_public_landing_pages', checks, routes: landingPages.map((page) => page.route) }))
