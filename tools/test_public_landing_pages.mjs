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
check(shop.includes('<a class="button button-primary" href="/contact/?product=shop&plan=shop-pilot">Request a Shop pilot</a>'), 'shop_primary_action')
check(myShop.includes('href="/my/contact/?product=shop&plan=shop-pilot">Shop စမ်းသုံးရန် တောင်းဆိုပါ'), 'my_shop_action')
check(myShop.includes('<p class="eyebrow">Shop</p>') && !myShop.includes('<p class="eyebrow">ဆိုင်</p>'), 'my_shop_product_name_stable')
check(shop.includes('Scan or tap a product, record the payment, and keep sales, receipts and stock together—even when the internet is down.'), 'shop_concrete_merchant_flow')
check(myShop.includes('ကုန်ပစ္စည်းကို စကင်ဖတ် သို့မဟုတ် တို့ပြီး ရောင်းပါ။ အင်တာနက်မရှိသည့်အချိန်တွင်လည်း အရောင်း၊ ပြေစာနှင့် ကုန်လက်ကျန်ကို Shop တစ်ခုတည်းတွင် ထိန်းထားပါ။'), 'my_shop_concrete_merchant_flow')
check(shop.includes('App preview with sample data.'), 'synthetic_data_disclosed')
check(myShop.includes('နမူနာအချက်အလက်ဖြင့် ပြထားသော အက်ပ်နမူနာ။'), 'my_synthetic_data_disclosed')
check(shop.includes('class="native-shop-gallery"') && myShop.includes('class="native-shop-gallery"'), 'native_gallery_visible')
check(shop.includes('shop_checkout_1200_en.png') && shop.includes('shop_stock_820_en.png') && shop.includes('shop_today_820_en.png'), 'en_three_workflows')
check(myShop.includes('shop_checkout_1200_my.png') && myShop.includes('shop_stock_820_my.png') && myShop.includes('shop_today_820_my.png'), 'my_three_workflows')
for (const [html, suffix] of [[shop, 'en'], [myShop, 'my']]) {
  check(html.includes('srcset="/images/native-shop/shop_sell_390_' + suffix + '.png"'), 'responsive_sell_capture:' + suffix)
  check(html.includes('srcset="/images/native-shop/shop_checkout_820_' + suffix + '.png"'), 'responsive_tablet_capture:' + suffix)
  check(!html.includes('srcset="/images/native-shop/shop_stock_390_' + suffix + '.png"'), 'hidden_mobile_stock_capture_absent:' + suffix)
  check(!html.includes('srcset="/images/native-shop/shop_today_390_' + suffix + '.png"'), 'hidden_mobile_today_capture_absent:' + suffix)
  check(!/<figcaption>(?:Phone|ဖုန်း)/.test(html), 'phone_frame_label_absent:' + suffix)
  check(!html.includes('native-shop-stock') && !/<figcaption>(?:Desktop|Tablet|Phone)/.test(html), 'no_redundant_device_gallery:' + suffix)
  check(!html.includes('actual-shop-') && !html.includes('capture scaled to fit'), 'retired_browser_capture_absent:' + suffix)
  check(!/<a\b[^>]*>\s*<(?:picture|img)\b/i.test(html), 'gallery_not_navigation:' + suffix)
}
check(contact.includes('name="email"') && contact.includes('<textarea name="goal"'), 'contact_has_simple_message')
check(!contact.includes('<select') && !contact.includes('Brief tips') && !contact.includes('What would you like us to prepare?'), 'contact_has_no_picker_or_brief_tips')
check(contact.includes('data-contact-selection') && contact.includes('"shop-pilot":"Local pilot"'), 'contact_shows_selected_setup')
check(myContact.includes('"shop-pilot":"ဒေသတွင်း စမ်းသပ်သုံးစွဲမှု"') && myContact.includes("document.documentElement.lang==='my'?'my':'en'"), 'my_contact_localizes_selected_setup')
const runtimeTemplates = [
  ['mini-mart', 'Mini-mart & grocery', 'မီနီမတ်နှင့် ကုန်စုံဆိုင်'],
  ['tea-coffee', 'Tea & coffee', 'လက်ဖက်ရည်နှင့် ကော်ဖီဆိုင်'],
  ['fashion', 'Fashion & accessories', 'အဝတ်အထည်နှင့် အသုံးအဆောင်'],
  ['beauty-spa', 'Beauty & spa', 'အလှအပနှင့် Spa'],
]
for (const [id, enLabel, myLabel] of runtimeTemplates) {
  check(contact.includes(`${JSON.stringify(id)}:${JSON.stringify(enLabel)}`), 'contact_template_label:' + id)
  check(myContact.includes(`${JSON.stringify(id)}:${JSON.stringify(myLabel)}`), 'my_contact_template_label:' + id)
  check(shop.includes(`href="/contact/?product=shop&template=${id}&plan=shop-pilot"`), 'shop_template_carries_pilot:' + id)
  check(myShop.includes(`href="/my/contact/?product=shop&template=${id}&plan=shop-pilot"`), 'my_shop_template_carries_pilot:' + id)
}
check((shop.match(/class="shop-plan shop-plan-current"/g) || []).length === 1
  && (shop.match(/class="shop-roadmap-item"/g) || []).length === 2
  && !shop.includes('Choose a business setup and a plan separately'), 'shop_has_one_current_offer')
check(myShop.includes('content="https://supermega.dev/og-card-shop-my.png"'), 'my_shop_uses_localized_share_card')
check(myContact.includes('>စာပို့ရန်</button>') && !myContact.includes('>Send message</button>'), 'my_contact_controls_translated')
check(privacy.includes('Privacy') && myPrivacy.includes('ကိုယ်ရေးအချက်အလက်'), 'both_privacy_pages_present')
for (const asset of gallery.assets.filter(asset => /^shop_(?:checkout_(?:1200|820)|sell_390|stock_820|today_820)_(?:en|my)\.png$/.test(asset.file))) {
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
