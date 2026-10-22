import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { inflateSync } from 'node:zlib'
import { brandFaviconSvg, brandMarkHtml, companyShopFooterHtml, companyShopHeaderHtml, companyShopStyle, shopDemoScript, shopMarkup } from './public_company_shop_design.mjs'
import { PUBLIC_SHOP_GALLERY_ASSETS } from './public_gallery_rights.mjs'
import { superMegaBrandIdentity } from '../showroom/src/core/brand-mark.ts'

const generator = readFileSync(new URL('./create_public_vercel_output.mjs', import.meta.url), 'utf8')
const shopCaptureFixture = readFileSync(new URL('./build_shop_browser_fixture.mjs', import.meta.url), 'utf8')
const shopProductSources = JSON.parse(readFileSync(new URL('./qa-assets/shop-products/sources.json', import.meta.url), 'utf8'))
const publicManifest = JSON.parse(readFileSync(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const outputVerifier = readFileSync(new URL('./verify_public_vercel_output.mjs', import.meta.url), 'utf8')
const captureTool = readFileSync(new URL('./capture_public_gallery.mjs', import.meta.url), 'utf8')
const appBrandStyles = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
const appTabIcon = readFileSync(new URL('../showroom/public-app/favicon.svg', import.meta.url), 'utf8')
const companyTabIcon = readFileSync(new URL('../kernel/public/favicon.svg', import.meta.url), 'utf8')
const appGlobalStyles = readFileSync(new URL('../showroom/src/index.css', import.meta.url), 'utf8')
const websiteProductStyles = readFileSync(new URL('../showroom/src/products/website/website-product.css', import.meta.url), 'utf8')
const publicStorefrontSource = readFileSync(new URL('../showroom/src/products/ecommerce/PublicStorefrontPage.tsx', import.meta.url), 'utf8')
const publicStorefrontStyles = readFileSync(new URL('../showroom/src/products/ecommerce/public-storefront.css', import.meta.url), 'utf8')

function makeNode(id) {
  const listeners = new Map()
  const classes = new Set()
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    dataset: {},
    listeners,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    addEventListener(type, handler) {
      const list = listeners.get(type) || []
      list.push(handler)
      listeners.set(type, list)
    },
    setAttribute(name, value) {
      this.attributes ||= {}
      this.attributes[name] = value
    },
    querySelector() {
      return { disabled: false, focus() {} }
    },
    focus() {},
    get offsetWidth() { return 0 },
  }
}

function createDemoHarness() {
  const nodes = new Map()
  const markupIds = new Set([...shopMarkup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const initiallyHiddenIds = new Set([...shopMarkup.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bhidden(?:\s|>)[^>]*>/g)].map((match) => match[1]))
  const scriptTargets = [...shopDemoScript.matchAll(/\bbyId\("([^"]+)"\)/g)].map((match) => match[1])
  for (const id of scriptTargets) assert.ok(markupIds.has(id), 'Shop demo target exists in HTML: ' + id)
  const get = (id) => {
    if (!markupIds.has(id)) return null
    if (!nodes.has(id)) {
      const node = makeNode(id)
      node.hidden = initiallyHiddenIds.has(id)
      nodes.set(id, node)
    }
    return nodes.get(id)
  }
  const categoryNames = [...shopMarkup.matchAll(/<button\b[^>]*class="category-button"[^>]*data-category="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(categoryNames, ['All', 'Fruit', 'Vegetables'])
  const categories = categoryNames.map((category) => {
    const node = makeNode('category-' + category)
    node.dataset.category = category
    return node
  })
  const document = {
    getElementById: get,
    querySelectorAll(selector) {
      return selector === '.category-button' ? categories : []
    },
  }
  runInNewContext(shopDemoScript, { document, Intl })
  const dispatchClick = (id, selector, dataset) => {
    const node = get(id)
    const handlers = node.listeners.get('click') || []
    const event = { target: { closest: (requested) => requested === selector ? { dataset } : null } }
    handlers.forEach((handler) => handler(event))
  }
  const dispatchInput = (id, value) => {
    const node = get(id)
    node.value = value
    const event = { target: { value } }
    ;(node.listeners.get('input') || []).forEach((handler) => handler(event))
  }
  return { get, categories, dispatchClick, dispatchInput }
}

assert.match(companyShopStyle, /#07111f/i)
assert.match(companyShopStyle, /--blue:\s*#2563eb/i)
assert.match(companyShopStyle, /--brand-ink:\s*#151521;/i)
assert.match(appBrandStyles, /--core-green:\s*#2563eb/i)
assert.match(appBrandStyles, /\.core-brand-name\s*\{[^}]*line-height:\s*1;/)
assert.match(generator, /\.brand-word\s*\{[^}]*line-height:\s*1;/)
assert.match(appGlobalStyles, /--sm-blue:\s*#2563eb/i)
assert.match(appGlobalStyles, /--sm-green:\s*#2563eb/i)
assert.doesNotMatch(appGlobalStyles, /#5b4ee8/i)
assert.match(websiteProductStyles, /--website-green:\s*#2563eb;/i)
assert.match(websiteProductStyles, /--website-green-soft:\s*rgba\(37, 99, 235, \.09\);/i)
assert.doesNotMatch(websiteProductStyles, /#5b4ee8|rgba\(91, 78, 232/i)
assert.doesNotMatch(companyShopStyle, /#5b4ee8|#4538c8|#eee7ff/i)
assert.doesNotMatch(companyShopStyle, /@import|url\(\s*https?:/i)
assert.match(companyShopStyle, /prefers-reduced-motion:\s*reduce/)
for (const breakpoint of ['1050px', '880px', '680px', '390px']) {
  assert.ok(companyShopStyle.includes(breakpoint), `responsive breakpoint ${breakpoint}`)
}
assert.match(companyShopStyle, /:focus-visible/)
assert.match(companyShopStyle, /min-height:\s*48px/)
assert.match(companyShopStyle, /\.pos-topbar\s*\{\s*flex-wrap:\s*wrap;/)
assert.match(companyShopStyle, /--myanmar:[^;]*system-ui[^;]*sans-serif/)
assert.match(companyShopStyle, /\.myanmar\s*\{[^}]*letter-spacing:\s*0;/)
assert.doesNotMatch(companyShopStyle, /\.site-header|\.brand-mark|\.brand-word|\.nav-links|\.footer\s*\{|\.footer-links/)
assert.doesNotMatch(generator, /\.header-inner\s*\{[^}]*width:\s*100%;/)
assert.match(shopMarkup, /class="button button-primary" href="\/contact\/\?product=shop">Request a Shop walkthrough/)
assert.doesNotMatch(shopMarkup, /See Shop screens|Talk about Shop|Ask about Shop/)
assert.match(generator, /\.brand-mark\s*\{[^}]*width:\s*30px;[^}]*height:\s*18px;[^}]*background:\s*transparent;[^}]*color:\s*var\(--brand-accent\);/)
assert.match(generator, /\.brand-mark svg\s*\{\s*display:\s*block;\s*width:\s*100%;\s*height:\s*100%;\s*\}/)
assert.match(companyShopStyle, /--blue:\s*#2563eb;/i)
assert.match(generator, /\.brand-word \{ color: var\(--brand-ink\); font-size: 1rem; font-weight: 650; letter-spacing: -\.02em;/)
assert.doesNotMatch(generator, /body\[data-view="company"\] \.site-header \.brand-word/)
assert.match(companyShopStyle, /\.company-hero \{\s*color: var\(--brand-ink\);/)
assert.match(companyShopStyle, /\.button\s*\{[^}]*min-height:\s*48px;[^}]*width:\s*max-content;[^}]*border-radius:\s*8px;/, 'marketing actions use one natural-width control style')
assert.match(companyShopStyle, /\.button\.primary, \.button-primary\s*\{[^}]*background:\s*#202432;/, 'the primary control uses one restrained dark style')
assert.match(generator, /\.shop-lead-capture\s*\{[^}]*max-width:1100px/, 'Shop has a readable static lead capture')
assert.match(companyShopStyle, /\.company-hero h1 span \{ color: var\(--blue\); \}/)
assert.match(generator, /\.nav-links a\[aria-current="page"\] \{ color: var\(--brand-accent-strong\); background: var\(--brand-accent-wash\); \}/)
assert.match(generator, /\.footer \.brand-word \{ color: var\(--brand-ink\); \}/)
assert.match(appBrandStyles, /\.core-brand-mark\s*\{ width:\s*1\.875rem; height:\s*1\.125rem;[^}]*background:\s*transparent;[^}]*color:\s*var\(--core-accent\);/)
assert.match(appBrandStyles, /\.core-brand-name\s*\{ color:\s*var\(--core-ink\); font-size:\s*1rem; font-weight:\s*650; letter-spacing:\s*-\.02em;/)
assert.doesNotMatch(companyShopStyle, /brand-icon/)
assert.match(generator, /homePage\.redirectTo === '\/shop\/'/)
assert.match(generator, /http-equiv="refresh" content="0; url=\$\{homePage\.redirectTo\}"/)
assert.match(generator, /href="\$\{homePage\.redirectTo\}">Continue to Shop/)
assert.match(generator, /contact-company-intro/)
assert.match(generator, /contact-direct/)
assert.match(generator, /contact_form_requires_script/)
assert.match(generator, /form\.hidden=false;/)
assert.match(generator, /contact_redundant_eyebrow/)
assert.match(generator, /class="shop-hero-app" id="shop-demo" aria-label="/)
assert.doesNotMatch(generator, /Orders and stock\. Clear next steps\./)
assert.doesNotMatch(generator, /const publicHomeMarkup = shopOnlyCompanyMarkup\(companyMarkup\)/)
assert.match(generator, /contact_company_intro_copy/)
assert.match(generator, /Tell us about your business and the workflow you want to improve\. We will reply by email\./)
assert.match(generator, /Tell us what you sell and the devices you use\. We will discuss a Shop pilot for your business\./)
assert.match(generator, /Request a Shop walkthrough/)
assert.doesNotMatch(generator, /English and Burmese are both welcome/i)
assert.match(generator, /body\[data-view="shop"\] \.shop-hero \.wrap \{ display: grid; grid-template-columns: minmax\(0,1fr\); gap: clamp\(24px,3vw,40px\); align-items: start; \}/)
assert.match(generator, /@media \(max-width: 1100px\) \{\s*body\[data-view="shop"\] \.shop-hero \.wrap \{ grid-template-columns: minmax\(0,1fr\); gap: 28px; \}/)
assert.match(shopMarkup, /<div class="shop-hero-copy">[\s\S]*?<h1 id="shop-heading">[\s\S]*?<div class="shop-hero-app"/)
assert.match(companyShopHeaderHtml('/'), /href="\/shop\/"[^>]*>Shop/)
assert.doesNotMatch(companyShopHeaderHtml('/'), />Company<\/a>/, 'the product homepage replaces a separate Company page')
assert.match(companyShopHeaderHtml('/shop/'), /href="\/shop\/" aria-current="page">Shop/)
assert.match(companyShopHeaderHtml('/contact/'), /href="\/contact\/" aria-current="page">Contact/)
for (const route of ['/', '/shop/', '/contact/', '/privacy/', '/website/', '/ecommerce/', '/plant/', '/my/shop/', '/my/contact/', '/my/privacy/']) {
  assert.doesNotMatch(companyShopHeaderHtml(route, route.startsWith('/my/') ? 'my' : 'en'), /href="https:\/\/app\.supermega\.dev\/|>Login<\/a>|>အကောင့်ဝင်ရန်<\/a>/)
}
const brandMark = /<svg viewBox="0 0 72 44" width="30" height="18" focusable="false"><path d="M10 9 26 22 10 35M35 35h27" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"\/><\/svg>/
assert.equal(brandMarkHtml, '<svg viewBox="0 0 72 44" width="30" height="18" focusable="false"><path d="M10 9 26 22 10 35M35 35h27" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>')
assert.equal(
  appTabIcon.replace(/\r\n/g, '\n').replace(/\s+\/>/g, '/>').trim(),
  brandFaviconSvg(superMegaBrandIdentity.accent).replace(/\s+\/>/g, '/>').trim(),
  'App tab icon matches the shared unboxed wordmark accent and geometry',
)
assert.match(companyShopHeaderHtml('/'), new RegExp(`<span class="brand-mark" aria-hidden="true">${brandMark.source}<\/span>\\s*<span class="brand-word">SuperMega<\/span>`))
assert.match(companyShopFooterHtml('/', 2026), new RegExp(`<span class="brand-mark" aria-hidden="true">${brandMark.source}<\/span>\\s*<span class="brand-word">SuperMega<\/span>`))
assert.match(publicStorefrontSource, /import \{ superMegaBrandMark \} from '\.\.\/\.\.\/core\/brand-mark'/)
assert.match(publicStorefrontSource, /className="public-storefront-name">SuperMega<\/span>/)
assert.match(publicStorefrontSource, /viewBox=\{superMegaBrandMark\.viewBox\}/)
assert.doesNotMatch(publicStorefrontSource, /<span>SUPERMEGA<\/span>|>›_<\/span>/)
const storefrontMarkRules = [...publicStorefrontStyles.matchAll(/\.public-storefront-mark\s*\{[^}]*\}/g)].map(([rule]) => rule)
assert.equal(storefrontMarkRules.length, 1, 'Storefront has one canonical mark rule')
assert.match(storefrontMarkRules[0], /background:transparent/)
assert.match(storefrontMarkRules[0], /color:#2563eb/)
assert.doesNotMatch(storefrontMarkRules[0], /border-radius:9px|background:#141d34/)
assert.match(publicStorefrontStyles, /\.public-storefront \{ font-family: Geist, Inter, "Noto Sans Myanmar", "Myanmar Text", "Segoe UI", system-ui, sans-serif; \}/)
assert.doesNotMatch(publicStorefrontStyles, /#5148e8|#554be8|#453cdd|#5047e8|#3f36d0|#b9b5ff|#dadbfb|#f2f1ff|#edeaff|#f5f7ff/i)
assert.match(publicStorefrontStyles, /\.public-storefront-submit\{[^}]*background:#2563eb/)
assert.match(publicStorefrontStyles, /accent-color:#2563eb/)
assert.doesNotMatch(companyShopHeaderHtml('/') + companyShopFooterHtml('/', 2026), /brand-icon|#10121b/)
assert.match(generator, /function headerHtml\(route, locale = 'en'\) \{\s*return companyShopHeaderHtml\(route, locale\)\s*\}/)
assert.match(generator, /\.site-header \{[^}]*min-height: 76px;[^}]*\}/)
assert.match(generator, /\.nav-links a \{[^}]*min-height: 48px;[^}]*border-radius: 8px;[^}]*padding: 0 15px;/)
assert.match(generator, /function footerHtml\(route, locale = 'en'\) \{\s*const year = new Date\(\)\.getUTCFullYear\(\)\s*return companyShopFooterHtml\(route, year, locale\)/)
assert.doesNotMatch(generator, /site-footer|footer-inner/)
assert.match(generator, /style-src 'self' 'sha256-\$\{inlineDigest\(sharedStyle\)\}' 'sha256-\$\{inlineDigest\(publicMarketingStyle\)\}'/)
const loginSource = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
assert.match(loginSource, /https:\/\/supermega\.dev\/shop\/#shop-demo/)
assert.match(loginSource, /View Shop sample screens/)
assert.match(companyShopFooterHtml('/shop/', 2026), /href="\/contact\/">Contact/)
assert.match(companyShopFooterHtml('/shop/', 2026), /href="\/privacy\/">Privacy/)
assert.match(companyShopFooterHtml('/shop/', 2026), /aria-label="SuperMega Shop"/)
assert.match(companyShopFooterHtml('/contact/', 2026), /aria-label="SuperMega Shop"/)
const anchorCount = (source) => (source.match(/<a\b/g) || []).length
assert.match(companyShopHeaderHtml('/'), /href="\/shop\/" aria-label="SuperMega Shop"/)
assert.match(companyShopFooterHtml('/', 2026), /href="\/shop\/"/)
for (const [english, myanmar] of [['/shop/', '/my/shop/'], ['/contact/', '/my/contact/'], ['/privacy/', '/my/privacy/']]) {
  assert.match(companyShopHeaderHtml(english), new RegExp(`href="${myanmar}" data-language-switch hreflang="my"`))
  assert.match(companyShopHeaderHtml(myanmar, 'my'), new RegExp(`href="${english}" data-language-switch hreflang="en"`))
  assert.match(companyShopFooterHtml(myanmar, 2026, 'my'), /href="\/my\/privacy\/">ကိုယ်ရေးအချက်အလက် မူဝါဒ/)
}
assert.equal(anchorCount(companyShopHeaderHtml('/shop/') + shopMarkup + companyShopFooterHtml('/shop/', 2026)) + 2, 11)
assert.match(shopMarkup, /Interactive example · sample data/)
assert.match(shopMarkup, /Complete sample sale/)
assert.match(shopMarkup, /Sample receipt/)
assert.match(shopMarkup, /no account, live payment, backend or actual print action/i)
assert.doesNotMatch(shopMarkup, /subscription-section|no setup fee|printer-sourcing markup|hardware costs are separate|ecommerce availability/i)
assert.equal((shopMarkup.match(/class="benefit-card"/g) || []).length, 3)
assert.doesNotMatch(shopMarkup, /<section\b[^>]*class="[^"]*\bsubscription-section\b/)
assert.doesNotMatch(shopMarkup, /start a free trial|testimonials|readiness score|offline mode|universal printer/i)
assert.doesNotMatch(shopMarkup, /secure file submission/i)
assert.equal((shopDemoScript.match(/"id":"SM-100[1-5]"/g) || []).length, 5)
assert.doesNotMatch(shopMarkup, /icon-tea|icon-coffee|icon-coconut|icon-bun|icon-cookie|icon-cake|data-category="Drinks"|data-category="Bakes"/)
assert.doesNotMatch(shopDemoScript, /lang="my"/, 'English-only example does not mix languages on product cards')
assert.doesNotMatch(shopDemoScript, /#eee7ff|#5b4ee8|#4538c8/i)
assert.doesNotMatch(shopDemoScript, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|window\.print|navigator\.vibrate|window\.open|location\.(?:assign|replace)|setInterval/i)
assert.match(generator, /public_company_shop_design\.mjs/)
assert.match(generator, /function shopLandingHtml\(product, page, locale = 'en'\)/)
assert.doesNotMatch(generator, /writeStatic\('shop-sample-demo\.js', shopDemoScript\)/)
assert.match(generator, /shop_interactive_mock/)
assert.match(generator, /data-gallery-previous aria-label="Previous \$\{label\} screen" disabled/)
assert.match(generator, /data-gallery-next aria-label="Next \$\{label\} screen"/)
assert.match(generator, /data-gallery-status aria-live="polite"/)
assert.match(generator, /class="platform-slides" tabindex="0"/)
assert.match(generator, /class="platform-device-stage"/)
assert.match(generator, /function deviceCaptureSet\(label,image,mobileImage,tabletImage/)
assert.match(generator, /deviceCapture\('Tablet',tabletImage,alt,768,1024,'lazy'\)/)
assert.match(generator, /class="platform-device-set\$\{tabletImage\?' has-tablet':''\}"/)
assert.match(generator, /Shop browser workspace · sample data/)
assert.doesNotMatch(generator, /data-device-choice|data-device-frame|deviceToolbar|setViewport\(mode\)|applyViewport/)
assert.doesNotMatch(generator, /Tap a screen to open it full-size/)
assert.match(generator, /\.platform-device-set \{display:grid;grid-template-columns:minmax\(0,1\.75fr\) minmax\(0,1\.25fr\) minmax\(0,\.95fr\)/)
assert.match(generator, /\.platform-device-capture-desktop,\.platform-device-set\.has-tablet \.platform-device-capture-tablet\{display:none\}/)
assert.match(generator, /@media\(max-width:760px\)\{\.platform-device-set\{grid-template-columns:minmax\(0,1fr\);align-items:start;gap:16px\}\.platform-device-capture-desktop,\.platform-device-set\.has-tablet \.platform-device-capture-tablet\{display:none\}\.platform-device-set \.platform-device-capture-phone\{grid-column:1;width:100%;max-width:none;justify-self:stretch\}/)
assert.match(generator, /function go\(index\)\{var target=slides\[Math\.max\(0,Math\.min\(index,slides\.length-1\)\)\];target\.querySelectorAll\('img\[loading="lazy"\]'\)/)
assert.doesNotMatch(generator, /function shopResponsiveShowcase\(locale = 'en'\)/)
assert.match(generator, /function shopCounterSalePreview\(locale = 'en'\)/)
assert.match(generator, /class="shop-hero-app"/)
assert.doesNotMatch(generator, /class="shop-support-proof"/)
assert.match(generator, /\.shop-lead-capture picture,\.shop-lead-capture img \{display:block;width:100%\}/)
assert.match(generator, /<figure class="shop-lead-capture"><picture>/)
assert.match(generator, /const disclosure = locale === 'my' \? 'Shop ဘရောက်ဇာ လုပ်ငန်းနေရာ · နမူနာမှတ်တမ်းများနှင့် ဈေးနှုန်းများ' : 'Shop browser workspace · Sample records and prices'/)
assert.match(generator, /const image = locale === 'my' \? 'actual-shop-sell-my\.png' : englishImage/)
assert.match(captureTool, /'shop-my'.*?--gallery-myanmar/s)
assert.match(captureTool, /function captureMyanmarDesktop\(/)
assert.match(captureTool, /width: 1000, height: 900, deviceScaleFactor: 1, mobile: false/)
assert.match(generator, /figcaption id="shop-sample-disclosure"><span>\$\{disclosure\}<\/span><span class="shop-photo-credit" id="shop-image-credits">\$\{credit\}<\/span>/)
assert.match(generator, /aria-describedby="shop-sample-disclosure"/)
assert.match(generator, /const photographers = publicGalleryImageSources\.products\.map\(product =>/)
assert.match(generator, /'ဓာတ်ပုံရင်းမြစ်' : 'Photo sources'/)
const shopStaticSource = generator.slice(generator.indexOf('function shopCounterSalePreview('), generator.indexOf('function productStory('))
assert.match(shopStaticSource, /<source media="\(max-width: 760px\)" srcset="\/images\/\$\{mobileImage\}"/)
assert.match(shopStaticSource, /<source media="\(max-width: 1024px\)" srcset="\/images\/\$\{tabletImage\}"/)
assert.doesNotMatch(shopStaticSource, /data-platform-carousel|data-device-choice|<button\b/)
assert.match(generator, /@media\(max-width:1050px\)\{body\[data-view="shop"\] \.shop-hero \.wrap\{grid-template-columns:minmax\(0,1fr\);gap:28px\}/)
assert.match(generator, /Sell at the counter\. Keep stock and orders in view\./)
assert.match(generator, /The Shop browser workspace shows counter sales, recorded orders and stock\./)
assert.match(generator, /return `<figure class="platform-device-capture/)
assert.doesNotMatch(generator, /href="\/images\/\$\{image\}"/)
assert.match(captureTool, /function captureTablet\(/)
assert.match(captureTool, /actual-shop-sell-tablet/)
assert.match(captureTool, /actual-shop-sell-tablet'[\s\S]*?selector: '\.shop-counter-grid', scrollToTop: true/)
assert.match(generator, /body\[data-view="company"\] \.company-hero::before\{opacity:0;background-image:none\}/)
assert.match(generator, /\.platform-device-stage\{[^}]*background:linear-gradient\(145deg,#eff6ff,#f8fafc\)\}/)
assert.match(generator, /body\[data-view="company"\] \.company-hero\{background:linear-gradient\(180deg,#f8fbff,#fff 72%\)\}/)
assert.match(generator, /body\[data-view="company"\] \.company-product-visual \{ gap: 10px; padding: 12px; border-color: #dfded8;/)
assert.doesNotMatch(generator, /#f7f6ff|#f4f1ff|#fbfaff|#dedbf4|rgba\(31,26,82,\.07\)/i)
assert.match(generator, /const homeHtml = `<!doctype html>/)
assert.match(generator, /const publicShopMarkup = shopMarkup/)
assert.doesNotMatch(generator, /function addShopHeroPreview|shop-hero-preview/)
assert.match(shopCaptureFixture, /putProductImage\(productImageScopeForWorkspace\(null\),sku,new Blob\(\[bytes\],\{type:productPhotoMimes\[sku\]\}\)\)/)
assert.match(shopCaptureFixture, /productSources\.products\s*\.filter\(product => product\.file\)/)
assert.match(shopCaptureFixture, /seed\.items=catalog/)
assert.match(shopCaptureFixture, /createCommerceCatalogBaseline\(item,baselineProof\)/)
assert.match(shopCaptureFixture, /const categories=\{Fruit:'သစ်သီး',Vegetables:'ဟင်းသီးဟင်းရွက်'\}/)
assert.match(appBrandStyles, /\.shop-product-tile:last-child \{ scroll-margin-bottom: calc\(9rem \+ env\(safe-area-inset-bottom\)\)/)
assert.match(appBrandStyles, /\.shop-counter-category-filter \{ flex-wrap: wrap; overflow-x: visible; scrollbar-width: none; \}/)
assert.match(captureTool, /myanmar_mobile_catalog_safe_area_missing/)
assert.match(captureTool, /myanmar_tablet_category_scrollbar_visible/)
assert.doesNotMatch(shopCaptureFixture, /SM-1001': 'kaung-90-days-rice\.webp/)
assert.match(shopCaptureFixture, /persisted:async\(\)=>gallery/)
assert.equal(shopProductSources.schemaVersion, 'supermega.shop-image-rights.v1')
assert.equal(shopProductSources.products.length, 5, 'rights ledger covers every photographed grocery item')
for (const product of shopProductSources.products) {
  assert.equal(product.image_use, 'photo_derivative')
  assert.match(product.file, /^[a-z]+\.png$/)
  const image = readFileSync(new URL(`./qa-assets/shop-products/${product.file}`, import.meta.url))
  assert.equal(createHash('sha256').update(image).digest('hex'), product.image_sha256, `${product.file} matches the recorded derivative`)
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(image.readUInt32BE(16), 192)
  assert.equal(image.readUInt32BE(20), 192)
}
assert.doesNotMatch(generator, /const publicHomeMarkup/)
assert.doesNotMatch(generator, /function companyOperatingGraphic\(\)/)
assert.doesNotMatch(generator, /Make the work<br><span>easier to follow\.<\/span>/)
assert.doesNotMatch(generator, /checked on <a href="https:\/\/www\.makropro\.com\.mm\/en">Makro PRO<\/a> on 17 October 2026\./)
assert.match(generator, /\.brand-mark \{ width: 30px; height: 18px;[^}]*background: transparent;[^}]*color: var\(--brand-accent\);/)
assert.match(generator, /\.brand-mark svg \{ display: block; width: 100%; height: 100%; \}/)
assert.match(generator, /\.site-header \.nav-links \{ flex: 0 1 auto; justify-content: flex-end; flex-wrap: nowrap; gap: 0; \}/)
assert.match(generator, /\.site-header \.nav-links a \{ min-width: 44px; min-height: 44px; padding-inline: 7px;[^}]*\}/)
assert.doesNotMatch(generator, /site-header \.nav-links a \{ min-height: 44px;/)
assert.doesNotMatch(generator, /\.brand-icon \{|class="brand-icon"/)
assert.match(generator, /\.brand-word \{ color: var\(--brand-ink\); font-size: 1rem; font-weight: 650; letter-spacing: -\.02em;/)
assert.match(generator, /--ink: #151521;/)
assert.match(generator, /const faviconSvg = brandFaviconSvg\(manifest\.brand\.colors\.accent\)/)
assert.doesNotMatch(brandFaviconSvg('#2563eb'), /<rect\b/)
assert.match(brandFaviconSvg('#2563eb'), /viewBox="0 0 72 44"[^>]*>[\s\S]*<path d="M10 9 26 22 10 35M35 35h27"[^>]*stroke="#2563eb" stroke-width="6"/)
const normalizeSvg = (svg) => svg.replace(/\s+/g, ' ').replace(/\s+\/>/g, '/>').trim()
assert.equal(normalizeSvg(appTabIcon), normalizeSvg(brandFaviconSvg(superMegaBrandIdentity.accent)), 'the app tab icon follows the shared SuperMega mark')
assert.equal(normalizeSvg(companyTabIcon), normalizeSvg(brandFaviconSvg(superMegaBrandIdentity.accent)), 'the company tab icon follows the shared SuperMega mark')
assert.match(generator, /status: 308, headers: \{ Location: homePage\.redirectTo \}/)
assert.doesNotMatch(generator, /companyBrandContrast|body\[data-view="company"\] \.site-header \.brand-word \{ color: var\(--text\); \}/)
assert.doesNotMatch(generator, /body\[data-view="company"\] \{ color:#f4f5fb; background:#0d1120; \}/)
assert.match(generator, /const themeColor = view === 'shop' \? '#f7f9fc' : '#ffffff'/)
const appBrandSource = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
const appBrandStyle = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
const appIndex = readFileSync(new URL('../showroom/index.html', import.meta.url), 'utf8')
const statusPage = readFileSync(new URL('../kernel/public/status.html', import.meta.url), 'utf8')
const operationsPage = readFileSync(new URL('../kernel/public/index.html', import.meta.url), 'utf8')
const appFavicon = readFileSync(new URL('../showroom/public-app/favicon.svg', import.meta.url), 'utf8')
const appIconGenerator = readFileSync(new URL('../tools/write_app_release_metadata.mjs', import.meta.url), 'utf8')
function readPngRgba(path) {
  const png = readFileSync(path)
  const chunks = []
  let width = 0
  let height = 0
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4) }
    if (type === 'IDAT') chunks.push(data)
    offset += length + 12
  }
  const pixels = inflateSync(Buffer.concat(chunks))
  return { width, height, pixels }
}
function pngColorCounts(path) {
  const { width, height, pixels } = readPngRgba(path)
  let accentPixels = 0
  let transparentPixels = 0
  let surfacePixels = 0
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    assert.equal(pixels[row], 0, 'generated PNG must use the expected unfiltered rows')
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4
      const [r, g, b, a] = pixels.subarray(i, i + 4)
      if (r === 37 && g === 99 && b === 235 && a > 0) accentPixels += 1
      if (a === 0) transparentPixels += 1
      if (r === 255 && g === 255 && b === 255 && a === 255) surfacePixels += 1
    }
  }
  return { accentPixels, transparentPixels, surfacePixels }
}
assert.match(appBrandSource, /className="core-brand-mark" aria-hidden="true">\s*<svg viewBox=\{superMegaBrandMark\.viewBox\} width=\{superMegaBrandMark\.width\} height=\{superMegaBrandMark\.height\} focusable=\{false\}>\s*<path d=\{superMegaBrandMark\.path\} fill="none" stroke=\{superMegaBrandIdentity\.accent\} strokeWidth=\{superMegaBrandMark\.strokeWidth\} strokeLinecap="round" strokeLinejoin="round" \/>\s*<\/svg>\s*<\/span>/)
assert.match(appBrandSource, /className="core-brand-name">\{superMegaBrandIdentity\.name\}<\/span>/)
assert.match(appBrandStyle, /\.core-brand-mark \{ width: 1\.875rem; height: 1\.125rem;[^}]*background: transparent;[^}]*color: var\(--core-accent\);/i)
assert.match(appBrandStyle, /--core-green:\s*#2563eb;/i)
assert.match(appBrandStyle, /--core-accent:\s*var\(--core-green\);/i)
assert.match(appBrandStyle, /\.core-brand-name \{[^}]*font-weight: 650;[^}]*letter-spacing: -\.02em;/)
assert.match(appFavicon, /<path d="M10 9 26 22 10 35M35 35h27" fill="none" stroke="#2563eb" stroke-width="6"/i)
assert.match(appFavicon, /viewBox="0 0 72 44"/)
assert.doesNotMatch(appFavicon, /<rect\b/i)
assert.match(appIndex, /href="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10"/)
assert.match(appIndex, /rel="mask-icon" href="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10" color="#2563eb"/)
assert.match(appIndex, /rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=cobalt-unboxed-v14-2026-10"/)
assert.match(appIndex, /rel="manifest" href="\/site\.webmanifest\?v=cobalt-unboxed-v14-2026-10"/)
assert.match(appIconGenerator, /const cacheKey = `\$\{cachePrefix\}\$\{manifest\.brand\.version\}`/)
assert.match(statusPage, /href="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10"/)
assert.match(statusPage, /<img class="mark" src="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10"/)
assert.match(statusPage, /\.mark\{width:30px;height:18px;/)
assert.match(statusPage, /\.brand b\{font-family:var\(--sans\);font-size:16px;font-weight:650;letter-spacing:-\.02em\}/)
assert.match(operationsPage, /\.brand-word\{color:var\(--ink\);font-size:16px;font-weight:650;letter-spacing:-\.02em;/)
assert.match(appIconGenerator, /const appIconBackground = manifest\.brand\.colors\.background/)
assert.match(appIconGenerator, /const appIconMark = manifest\.brand\.colors\.accent/)
assert.match(appIconGenerator, /const appSurface = '#f8f9fc'/)
assert.match(appIconGenerator, /function renderIcon\(size, \{ maskable = false, surface = maskable \} = \{\}\)/)
assert.match(appIconGenerator, /\['apple-touch-icon\.png', 180, \{ surface: true \}\]/)
assert.match(appIconGenerator, /const favicon = `[^`]*viewBox="\$\{superMegaBrandMark\.viewBox\}"[^`]*<path d="\$\{superMegaBrandMark\.path\}"[^`]*stroke-width="\$\{superMegaBrandMark\.strokeWidth\}"/)
assert.match(appIconGenerator, /background_color: appSurface,[\s\S]*theme_color: appSurface/)
for (const file of ['icon-192.png', 'icon-512.png']) {
  const { width, height, pixels } = readPngRgba(new URL(`../showroom/public-app/${file}`, import.meta.url))
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[y * (width * 4 + 1) + 1 + x * 4 + 3] > 0) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
  }
  assert.ok(minX > 0 && minY > 0 && maxX < width - 1 && maxY < height - 1, `${file} mark has clear space on every edge`)
  assert.ok(Math.abs(minX + maxX - (width - 1)) <= 2, `${file} mark is horizontally centered`)
  assert.ok(Math.abs(minY + maxY - (height - 1)) <= 2, `${file} mark is vertically centered`)
}
const standardIcon = pngColorCounts(new URL('../showroom/public-app/icon-192.png', import.meta.url))
const maskableIcon = pngColorCounts(new URL('../showroom/public-app/icon-512-maskable.png', import.meta.url))
const appleTouchIcon = pngColorCounts(new URL('../showroom/public-app/apple-touch-icon.png', import.meta.url))
assert.ok(standardIcon.accentPixels > 100, 'standard install icon contains the cobalt mark')
assert.ok(standardIcon.transparentPixels > 100, 'standard install icon has no filled logo tile')
assert.ok(maskableIcon.accentPixels > 100, 'maskable install icon contains the cobalt mark')
assert.equal(maskableIcon.transparentPixels, 0, 'maskable icon has an opaque safe background')
assert.ok(maskableIcon.surfacePixels > 100, 'maskable icon uses the white brand surface')
assert.ok(appleTouchIcon.accentPixels > 100, 'Apple touch icon contains the cobalt mark')
assert.ok(appleTouchIcon.surfacePixels > 100, 'Apple touch icon uses the white brand surface')
assert.equal(publicManifest.brand.version, 'cobalt-unboxed-v14-2026-10')
assert.equal(publicManifest.brand.colors.accent, '#2563eb')
assert.equal(superMegaBrandIdentity.name, publicManifest.brand.name, 'app and public headers use the manifest wordmark')
assert.equal(superMegaBrandIdentity.accent, publicManifest.brand.colors.accent, 'app, public header, and favicon share the brand accent')
assert.equal(publicManifest.brand.colors.background, '#ffffff')
assert.equal(publicManifest.brand.colors.ink, '#151521')
assert.match(publicStorefrontStyles, /\.public-storefront-brand\{[^}]*font-weight:650;[^}]*letter-spacing:-\.02em;/, 'public storefront uses the shared wordmark weight and tracking')
assert.match(publicStorefrontStyles, /\.public-storefront-mark\{[^}]*width:30px;height:18px;[^}]*background:transparent;[^}]*color:#2563eb;/, 'public storefront uses the unboxed cobalt mark at the shared size')
assert.match(publicStorefrontStyles, /\.public-storefront-name\{[^}]*font-size:16px;font-weight:650;letter-spacing:-\.02em;/, 'public storefront wordmark matches the app and company site')
const appAccent = appBrandStyle.match(/--core-green:\s*(#[0-9a-f]{6});/i)?.[1].toLowerCase()
assert.equal(appAccent, publicManifest.brand.colors.accent, 'app primary accent follows the public brand accent')
const websiteBrandStyles = readFileSync(new URL('../showroom/src/products/website/website-product.css', import.meta.url), 'utf8')
const websiteAccent = websiteBrandStyles.match(/--website-green:\s*(#[0-9a-f]{6});/i)?.[1].toLowerCase()
assert.equal(websiteAccent, publicManifest.brand.colors.accent, 'Website product accent follows the public brand accent')
assert.equal(publicManifest.company.positioning, 'Operating software for Myanmar businesses.')
assert.equal(publicManifest.company.statement, 'SuperMega is a Myanmar software company. Shop is our first customer product for counter sales, stock and order follow-up.')
assert.equal(publicManifest.company.headline, 'Operating software for Myanmar businesses.')
assert.equal(publicManifest.company.supporting, 'SuperMega is a Myanmar software company. Shop is our first customer product for counter sales, stock and order follow-up.')
assert.equal(publicManifest.pages.find((page) => page.route === '/')?.redirectTo, '/shop/')
assert.equal(publicManifest.company.statement, publicManifest.company.supporting, 'company description and summary stay aligned')
assert.equal(publicManifest.pages.find((page) => page.route === '/').description, publicManifest.company.supporting)
const brandGuide = readFileSync(new URL('../BRAND.md', import.meta.url), 'utf8')
assert.ok(brandGuide.includes(`Version: \`${publicManifest.brand.version}\``), 'brand guide and public manifest use the same brand version')
assert.ok(brandGuide.includes('The primary lockup is the cobalt `>_` mark beside the exact title-case **SuperMega** wordmark.'))
assert.match(brandGuide, /Keep both unboxed/i)
assert.match(brandGuide, /Business software for Myanmar\./)
assert.match(generator, /contact-page \.contact-form[^}]*border-radius:8px/)
assert.match(generator, /Shop browser workspace · sample data/)
assert.match(generator, /content:[^\n]*<main id="content">/)
assert.match(generator, /const publicGalleryAssetNames = PUBLIC_SHOP_GALLERY_ASSETS/)
assert.equal(PUBLIC_SHOP_GALLERY_ASSETS.length, 15, 'all 15 bundled Shop captures need gallery review')
assert.match(outputVerifier, /'images\/actual-shop-today\.png'/)
assert.match(outputVerifier, /'actual-shop-today\.png',[\s\S]*?'actual-shop-sell\.png'/)
assert.match(outputVerifier, /redirect_in_sitemap/)
assert.match(outputVerifier, /shop_responsive_capture_missing/)
assert.match(outputVerifier, /shop_interactive_gallery_present/)
assert.match(generator, /baseRoute === '\/contact\/' \? 'contact'/)
assert.match(captureTool, /capture_contains_transient_or_forbidden_text/)
assert.match(captureTool, /'actual-shop-inventory-mobile'.*?forbiddenText: \['Payment and handoff recorded'\]/s)
assert.match(outputVerifier, /gallery_previous_control_accessibility_drift/)
assert.match(outputVerifier, /gallery_next_control_accessibility_drift/)
assert.match(outputVerifier, /gallery_status_or_keyboard_accessibility_drift/)
assert.match(outputVerifier, /platform-device-set/)
assert.match(outputVerifier, /shop_responsive_capture_missing/)
assert.match(outputVerifier, /body\.includes\('data-device-choice'\)/)
assert.match(outputVerifier, /body\.includes\('data-device-frame'\)/)

const demo = createDemoHarness()
const { get, categories, dispatchClick, dispatchInput } = demo
assert.equal(get('missing-shop-target'), null)
assert.match(get('productGrid').innerHTML, /Red apple \(each\)/)
assert.doesNotMatch(get('productGrid').innerHTML, /lang="my"/)
assert.match(get('productGrid').innerHTML, /data:image\/png;base64,/)
dispatchInput('productSearch', 'apple')
assert.match(get('productGrid').innerHTML, /Red apple \(each\)/)
assert.doesNotMatch(get('productGrid').innerHTML, /Red tomato \(each\)/)
dispatchInput('productSearch', '')
categories.find((item) => item.dataset.category === 'Fruit').listeners.get('click')[0]()
assert.match(get('productGrid').innerHTML, /Bananas \(bunch\)/)
assert.doesNotMatch(get('productGrid').innerHTML, /Red onions \(500 g\)/)
categories.find((item) => item.dataset.category === 'All').listeners.get('click')[0]()

get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('completeSale').disabled, true)
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('receipt').hidden, true)
dispatchClick('productGrid', 'button[data-add]', { add: 'SM-1001' })
dispatchClick('basketRows', 'button[data-action]', { action: 'decrease', id: 'SM-1001' })
assert.equal(get('basketCount').textContent, '0')
assert.equal(get('completeSale').disabled, true)
assert.equal(get('basketTotal').textContent, '0 MMK')
get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('receipt').hidden, true)

dispatchClick('productGrid', 'button[data-add]', { add: 'SM-1001' })
dispatchClick('productGrid', 'button[data-add]', { add: 'SM-1001' })
assert.equal(get('basketCount').textContent, '2')
assert.equal(get('basketTotal').textContent, '5,600 MMK')
dispatchClick('basketRows', 'button[data-action]', { action: 'increase', id: 'SM-1001' })
assert.equal(get('basketCount').textContent, '3')
assert.equal(get('basketTotal').textContent, '8,400 MMK')

let prevented = false
get('saleForm').listeners.get('submit')[0]({ preventDefault() { prevented = true } })
assert.equal(prevented, true)
assert.equal(get('todayTotal').textContent, '8,400 MMK')
assert.match(get('receiptLines').innerHTML, /3 × Red apple \(each\)/)
assert.equal(get('receiptId').textContent, 'SAMPLE-001')
assert.match(get('productGrid').innerHTML, /5 in sample stock/)
assert.equal(get('receipt').hidden, false)

dispatchClick('productGrid', 'button[data-add]', { add: 'SM-1001' })
get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('todayTotal').textContent, '11,200 MMK')
assert.equal(get('receiptId').textContent, 'SAMPLE-002')
assert.match(get('receiptLines').innerHTML, /1\s*.\s*Red apple \(each\)/)
assert.match(get('productGrid').innerHTML, /4 in sample stock/)

get('resetExample').listeners.get('click')[0]()
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('basketCount').textContent, '0')
assert.equal(get('receipt').hidden, true)
assert.match(get('productGrid').innerHTML, /8 in sample stock/)
assert.equal(get('saleStatus').textContent, 'Example reset. Sample data has been restored.')

const exhausted = createDemoHarness()
for (let index = 0; index < 8; index += 1) exhausted.dispatchClick('productGrid', 'button[data-add]', { add: 'SM-1001' })
assert.equal(exhausted.get('basketCount').textContent, '8')
assert.match(exhausted.get('productGrid').innerHTML, /data-add="SM-1001"[^>]*disabled/)
exhausted.get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(exhausted.get('todayTotal').textContent, '22,400 MMK')
assert.match(exhausted.get('productGrid').innerHTML, /Out of sample stock/)
assert.match(exhausted.get('productGrid').innerHTML, /data-add="SM-1001"[^>]*disabled/)
assert.equal(exhausted.get('basketCount').textContent, '0')

console.log('public Company/Shop source, responsive rules, safety boundaries, DOM targets, empty checkout, successive sales, stock exhaustion, and reset verified')
