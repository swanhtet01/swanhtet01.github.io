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
check(shop.includes('<a class="button button-primary" href="/contact/?product=shop">Contact us about Shop</a>'), 'shop_single_action')
check((shop.match(/class="button button-primary"/g) || []).length === 1, 'shop_exactly_one_primary_action')
check(shop.includes('<a class="shop-access-link" href="/contact/?product=shop">Contact us about Shop</a>'), 'shop_access_secondary_action')
check(myShop.includes('href="/my/contact/?product=shop">Shop အကြောင်း ဆက်သွယ်ရန်</a>'), 'my_shop_action')
check((myShop.match(/class="button button-primary"/g) || []).length === 1, 'my_shop_exactly_one_primary_action')
check(myShop.includes('<a class="shop-access-link" href="/my/contact/?product=shop">Shop အကြောင်း ဆက်သွယ်ရန်</a>'), 'my_shop_access_secondary_action')
check(shop.includes('Shop for Myanmar retailers') && shop.includes('Sell clearly. Keep stock accurate.') && shop.includes('Find an item, take payment and see what needs attention—even when the connection is unreliable.'), 'shop_approved_copy')
check(myShop.includes('မြန်မာ လက်လီဆိုင်များအတွက် Shop')
  && myShop.includes('ရောင်းချမှု ရှင်းလင်းပါစေ။ ကုန်လက်ကျန် မှန်ကန်ပါစေ။')
  && myShop.includes('ကုန်ပစ္စည်းရှာပါ၊ ငွေပေးချေမှုကို မှတ်တမ်းတင်ပါ၊ အင်တာနက်မတည်ငြိမ်သည့်အချိန်တွင်ပင် အာရုံစိုက်ရန်လိုသည်များကို ကြည့်ပါ။'), 'my_shop_localized_copy')
check(shop.includes('class="native-shop-gallery"') && myShop.includes('class="native-shop-gallery"'), 'native_gallery_visible')
check(shop.includes('Illustrative Shop preview with synthetic sample data.'), 'native_gallery_disclosure_en')
check(myShop.includes('နမူနာဒေတာဖြင့် ဖော်ပြထားသော Shop အက်ပ်မြင်ကွင်း။'), 'native_gallery_disclosure_my')
for (const token of ['How it works at the counter', 'Search or scan', 'Review the total and take payment', 'Check stock and Today', 'Editable starting points', 'Mini-mart', 'Tea and coffee', 'Fashion', 'Beauty and spa', 'How to get Shop', 'assisted Local Pilot', 'Public downloads and self-service signup are not open yet', 'Android tablet', 'iPad', 'Windows PC', 'Signed distribution is still pending', 'A signed installer is still pending']) {
  check(shop.includes(token), 'shop_access_and_workflow:' + token)
}
for (const token of ['Pilot sign in', 'Before you start', 'Where do I sign in?', 'Can I download Shop now?', 'Does selling require internet?', 'Sending the contact form does not create an account.']) check(shop.includes(token), 'shop_access_faq:' + token)
for (const token of ['စမ်းသပ်အသုံးပြုသူ ဝင်ရန်', 'မစတင်မီ', 'ဘယ်နေရာမှ ဝင်ရမည်နည်း။', 'Shop ကို ယခု ဒေါင်းလုဒ်ရနိုင်ပါသလား။', 'ဆက်သွယ်ရေးဖောင်ပို့ခြင်းတစ်ခုတည်းဖြင့် အကောင့် မဖန်တီးပါ။']) check(myShop.includes(token), 'my_shop_access_faq:' + token)
check((shop.match(/<details>/g) || []).length === 5 && (myShop.match(/<details>/g) || []).length === 5, 'five_access_faqs_en_my')
for (const token of ['ကောင်တာတွင် အလုပ်လုပ်ပုံ', 'ရှာပါ သို့မဟုတ် စကင်ဖတ်ပါ', 'ပြင်ဆင်နိုင်သော အစပျိုးပုံစံများ', 'မီနီမတ်', 'လက်ဖက်ရည်နှင့် ကော်ဖီ', 'ဖက်ရှင်', 'အလှအပနှင့် စပါ', 'Shop ရယူရန်', 'Android တက်ဘလက်', 'iPad', 'Windows ကွန်ပျူတာ']) {
  check(myShop.includes(token), 'my_shop_access_and_workflow:' + token)
}
check(!/Local Pilot|Pilot target|Signed distribution|installer|Web app|customer Shop|manager correction|online authorization/.test(myShop), 'my_shop_has_no_untranslated_operational_copy')
check(shop.includes('The web app, macOS and iPhone are not current customer Shop products.'), 'unsupported_platforms_stated_honestly')
check((shop.match(/class="shop-template-card"/g) || []).length === 4 && (myShop.match(/class="shop-template-card"/g) || []).length === 4, 'four_editable_templates_en_my')
check((shop.match(/class="shop-platform-card"/g) || []).length === 3 && (myShop.match(/class="shop-platform-card"/g) || []).length === 3, 'three_pilot_platform_targets_en_my')
check((shop.match(/class="shop-proof-card"/g) || []).length === 3 && (myShop.match(/class="shop-proof-card"/g) || []).length === 3, 'three_compact_proof_cards_en_my')
check(shop.includes('shop_checkout_1200_en.png') && shop.includes('shop_stock_820_en.png') && shop.includes('shop_today_820_en.png'), 'en_three_workflows')
check(myShop.includes('shop_checkout_1200_my.png') && myShop.includes('shop_stock_820_my.png') && myShop.includes('shop_today_820_my.png'), 'my_three_workflows')
for (const [html, suffix] of [[shop, 'en'], [myShop, 'my']]) {
  check(html.includes('class="native-shop-tableau"'), 'single_composed_tableau:' + suffix)
  check(html.includes('srcset="/images/native-shop/shop_sell_390_' + suffix + '.png"'), 'responsive_sell_capture:' + suffix)
  check(html.includes('srcset="/images/native-shop/shop_checkout_820_' + suffix + '.png"'), 'responsive_checkout_capture:' + suffix)
  check(html.includes('srcset="/images/native-shop/shop_stock_390_' + suffix + '.png"'), 'responsive_stock_capture:' + suffix)
  check(html.includes('srcset="/images/native-shop/shop_today_390_' + suffix + '.png"'), 'responsive_today_capture:' + suffix)
  check(!html.includes('native-shop-shots-pair') && !/<figcaption>(?:Desktop|Tablet|Phone)/.test(html), 'no_redundant_device_gallery:' + suffix)
  check(!html.includes('actual-shop-') && !html.includes('capture scaled to fit'), 'retired_browser_capture_absent:' + suffix)
  check(!/<a\b[^>]*>\s*<(?:picture|img)\b/i.test(html), 'gallery_not_navigation:' + suffix)
  check(!/SuperMega Shop|Request a Shop pilot|Request a Shop walkthrough|receipt printing|cloud backup|AI-powered/i.test(html), 'unsupported_public_copy_absent:' + suffix)
}
check(contact.includes('name="email"') && contact.includes('<textarea name="goal"'), 'contact_has_simple_message')
check(!contact.includes('<select') && !contact.includes('Brief tips') && !contact.includes('What would you like us to prepare?'), 'contact_has_no_picker_or_brief_tips')
check(myContact.includes('>စာပို့ရန်</button>') && !myContact.includes('>Send message</button>'), 'my_contact_controls_translated')
check(privacy.includes('Privacy') && myPrivacy.includes('ကိုယ်ရေးအချက်အလက်'), 'both_privacy_pages_present')
for (const asset of gallery.assets) {
  const bytes = readFileSync(resolve(staticDir, 'images/native-shop', asset.file))
  check(createHash('sha256').update(bytes).digest('hex') === asset.sha256, 'native_asset_digest:' + asset.file)
}
for (const productId of manifest.productVisibility.retainedOnlyProductIds) {
  const html = readPage(productId + '/index.html')
  check(html.includes('name="robots" content="noindex,follow"'), 'retained_noindex:' + productId)
  check(!html.includes('Request assisted setup') && !html.includes('Open retained workspace'), 'retained_not_marketed:' + productId)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_shop_public_landing', checks, gallerySource: gallery.sourceHead }))
