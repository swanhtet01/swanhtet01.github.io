import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { verifyNativeShopGallery } from './public_native_shop_gallery.mjs'

const root = resolve(import.meta.dirname, '..')
const outputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (outputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(outputId)) throw new Error('public_output_id_invalid')
const outputDir = outputId ? resolve(root, '.tmp', 'supermega-public-output-' + outputId) : resolve(root, '.vercel/output')
const staticDir = resolve(outputDir, 'static')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const gallery = verifyNativeShopGallery(root)
const readPage = file => readFileSync(resolve(staticDir, file), 'utf8')
const shop = readPage('shop/index.html')
const myShop = readPage('my/shop/index.html')
const contact = readPage('contact/index.html')
const myContact = readPage('my/contact/index.html')
const privacy = readPage('privacy/index.html')
const myPrivacy = readPage('my/privacy/index.html')
const config = JSON.parse(readFileSync(resolve(outputDir, 'config.json'), 'utf8'))
let checks = 0
function check(condition, label) { checks += 1; assert.ok(condition, label) }

check(activeProductContracts(manifest).map(product => product.id).join(',') === 'shop', 'public_scope_shop_only')
check(config.routes.some(route => route.status === 308 && route.headers?.Location === '/shop/' && new RegExp(route.src).test('/')), 'root_redirects_to_shop')
for (const [route, html, locale] of [
  ['/shop/', shop, 'en'], ['/my/shop/', myShop, 'my'],
  ['/contact/', contact, 'en'], ['/my/contact/', myContact, 'my'],
  ['/privacy/', privacy, 'en'], ['/my/privacy/', myPrivacy, 'my'],
]) {
  check(html.includes('<html lang="' + locale + '">'), 'locale:' + route)
  check(html.includes('<link rel="canonical" href="https://supermega.dev' + route + '" />'), 'canonical:' + route)
  check(html.includes('href="/privacy/"') || html.includes('href="/my/privacy/"'), 'privacy_link:' + route)
  check((html.match(/<a class="nav-sign-in" href="https:\/\/app\.supermega\.dev\/login">/g) ?? []).length === 1
    && (html.match(/href="https:\/\/app\.supermega\.dev\/login/g) ?? []).length === 1, 'single_shop_sign_in:' + route)
  check(!/href="\/(?:website|ecommerce|plant)\//.test(html), 'internal_nav_absent:' + route)
}
check(shop.includes('<a class="button button-primary" href="/contact/?product=shop">Start with Shop</a>'), 'shop_single_action')
check(myShop.includes('href="/my/contact/?product=shop">Shop စတင်သုံးရန်'), 'my_shop_action')
check(myShop.includes('<p class="eyebrow">Shop</p>') && !myShop.includes('<p class="eyebrow">ဆိုင်</p>'), 'my_shop_product_name_stable')
check(shop.includes('Add products once. Search or tap to sell. Receipts, sales and stock stay together.'), 'shop_concrete_merchant_flow')
check(myShop.includes('ကုန်ပစ္စည်းကို တစ်ကြိမ်ထည့်ပါ။ ရှာဖွေ သို့မဟုတ် ရွေး၍ ရောင်းပါ။ ပြေစာ၊ အရောင်းနှင့် ကုန်လက်ကျန်ကို တစ်နေရာတည်းတွင် ကြည့်ပါ။'), 'my_shop_concrete_merchant_flow')
check(shop.includes('App preview with sample data.'), 'synthetic_data_disclosed')
check(myShop.includes('နမူနာအချက်အလက်ဖြင့် ပြထားသော အက်ပ်နမူနာ။'), 'my_synthetic_data_disclosed')
check(shop.includes('class="native-shop-gallery"') && myShop.includes('class="native-shop-gallery"'), 'native_gallery_visible')
check(shop.includes('shop_checkout_1200_en.png') && shop.includes('shop_stock_820_en.png') && shop.includes('shop_today_820_en.png'), 'en_three_workflows')
check(myShop.includes('shop_checkout_1200_my.png') && myShop.includes('shop_stock_820_my.png') && myShop.includes('shop_today_820_my.png'), 'my_three_workflows')
for (const [html, suffix] of [[shop, 'en'], [myShop, 'my']]) {
  check(html.includes('srcset="/images/native-shop/shop_checkout_820_' + suffix + '.png"'), 'responsive_checkout_capture:' + suffix)
  check(!html.includes('_390_' + suffix + '.png'), 'phone_capture_absent:' + suffix)
  check(!html.includes('native-shop-stock') && !/<figcaption>(?:Desktop|Tablet|Phone)/.test(html), 'no_redundant_device_gallery:' + suffix)
  check(!html.includes('actual-shop-') && !html.includes('capture scaled to fit'), 'retired_browser_capture_absent:' + suffix)
  check(!/<a\b[^>]*>\s*<(?:picture|img)\b/i.test(html), 'gallery_not_navigation:' + suffix)
}
check(contact.includes('name="email"') && contact.includes('<textarea name="goal"'), 'contact_has_simple_message')
check(!contact.includes('<select') && !contact.includes('Brief tips') && !contact.includes('What would you like us to prepare?'), 'contact_has_no_picker_or_brief_tips')
check(contact.includes('data-contact-selection') && contact.includes('"mini-mart-grocery":"Mini-mart & grocery"'), 'contact_shows_selected_setup')
check(myContact.includes('"mini-mart-grocery":"မီနီမတ်နှင့် ကုန်စုံဆိုင်"'), 'my_contact_localizes_selected_setup')
check(myContact.includes('>စာပို့ရန်</button>') && !myContact.includes('>Send message</button>'), 'my_contact_controls_translated')
check(privacy.includes('Privacy') && myPrivacy.includes('ကိုယ်ရေးအချက်အလက်'), 'both_privacy_pages_present')
for (const asset of gallery.assets.filter(asset => /^(?:shop_checkout_1200|shop_checkout_820|shop_stock_820|shop_today_820)_(?:en|my)\.png$/.test(asset.file))) {
  const bytes = readFileSync(resolve(staticDir, 'images/native-shop', asset.file))
  check(createHash('sha256').update(bytes).digest('hex') === asset.sha256, 'native_asset_digest:' + asset.file)
}
for (const productId of manifest.productVisibility.retainedOnlyProductIds) {
  const html = readPage(productId + '/index.html')
  check(html.includes('name="robots" content="noindex,follow"'), 'retained_noindex:' + productId)
  check(!html.includes('Request assisted setup') && !html.includes('Open retained workspace'), 'retained_not_marketed:' + productId)
  check(!html.includes('data-language-switch'), 'retained_has_no_false_language_switch:' + productId)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_shop_public_landing', checks, gallerySource: gallery.sourceHead }))
