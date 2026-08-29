import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const config = JSON.parse(readFileSync(resolve(root, '.vercel', 'output', 'config.json'), 'utf8'))
const readStatic = (path) => readFileSync(resolve(staticDir, path), 'utf8')

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
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
  check(html.includes(`href="https://app.supermega.dev/settings/?product=${product.id}"`), `landing_primary_cta:${page.route}`)
  check(html.includes(`href="/contact/?product=${product.id}"`), `landing_secondary_cta:${page.route}`)
  check(!html.includes(`href="${product.appRoute}"`), `landing_no_direct_app_route:${page.route}`)
  check(html.includes('href="/contact/">Contact</a>') && html.includes('href="/privacy/">Privacy</a>'), `landing_footer_parity:${page.route}`)
  check(html.includes('aria-label="SuperMega home"'), `landing_home_navigation:${page.route}`)
}
check(new Set(descriptions).size === descriptions.length, 'landing_descriptions_unique')
const titles = manifest.pages.map((page) => page.title)
check(new Set(titles).size === titles.length, 'page_titles_unique')

// Homepage links each product to its landing page without replacing the guided sample CTA.
const home = readStatic('index.html')
for (const page of landingPages) {
  const product = manifest.customerProducts.find((candidate) => candidate.id === page.productId)
  check(home.includes(`href="${page.route}">${product.name} overview</a>`), `home_links_landing:${page.route}`)
  check(home.includes(`href="https://app.supermega.dev/settings/?product=${product.id}"`), `home_keeps_guided_cta:${product.id}`)
  check(home.includes(product.firstOperatingLoop[0]), `home_shows_first_loop:${product.id}`)
}

const shopLanding = readStatic('shop/index.html')
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
