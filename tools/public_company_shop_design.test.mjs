import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { companyMarkup, companyShopFooterHtml, companyShopHeaderHtml, companyShopStyle, shopDemoScript, shopMarkup } from './public_company_shop_design.mjs'

const generator = readFileSync(new URL('./create_public_vercel_output.mjs', import.meta.url), 'utf8')
const outputVerifier = readFileSync(new URL('./verify_public_vercel_output.mjs', import.meta.url), 'utf8')

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
  assert.deepEqual(categoryNames, ['All', 'Drinks', 'Bakes'])
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
assert.match(companyShopStyle, /#3b82f6/i)
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
assert.match(companyMarkup, /href="\/shop\/#shop-demo">See Shop on desktop and mobile/)
for (const screen of ['today', 'sell', 'orders']) {
  assert.match(companyMarkup, new RegExp(`id="shop-showcase-${screen}"`))
  assert.match(companyMarkup, new RegExp(`/images/actual-shop-${screen === 'sell' ? 'sell' : screen}\\.png`))
}
assert.match(companyMarkup, /Actual app capture · synthetic local records/)
assert.match(companyShopStyle, /scroll-snap-type:\s*x\s*mandatory/)
assert.match(companyShopStyle, /shop-showcase-nav a:focus-visible/)
assert.match(companyShopStyle, /\.shop-showcase-nav a\s*\{[^}]*min-height:\s*44px;/)
assert.match(companyMarkup, /id="products"/)
assert.match(companyMarkup, /id="shop"/)
assert.match(companyMarkup, /id="website"/)
assert.match(companyMarkup, /id="ecommerce"/)
assert.match(companyShopHeaderHtml('/'), /href="\/shop\/"[^>]*>Shop/)
assert.match(companyShopHeaderHtml('/shop/'), /href="\/shop\/" aria-current="page">Shop/)
assert.match(companyShopFooterHtml('/shop/', 2026), /href="\/contact\/">Contact/)
assert.match(companyShopFooterHtml('/shop/', 2026), /href="\/privacy\/">Privacy/)
const anchorCount = (source) => (source.match(/<a\b/g) || []).length
assert.equal(anchorCount(companyShopHeaderHtml('/') + companyMarkup + companyShopFooterHtml('/', 2026)) + 1, 17)
assert.equal(anchorCount(companyShopHeaderHtml('/shop/') + shopMarkup + companyShopFooterHtml('/shop/', 2026)) + 2, 12)
assert.match(shopMarkup, /Interactive example · sample data/)
assert.match(shopMarkup, /Complete sample sale/)
assert.match(shopMarkup, /Sample receipt/)
assert.match(shopMarkup, /no account, live payment, backend or actual print action/i)
assert.doesNotMatch(shopMarkup, /subscription-section|no setup fee|printer-sourcing markup|hardware costs are separate|ecommerce availability/i)
assert.equal((shopMarkup.match(/class="benefit-card"/g) || []).length, 3)
assert.doesNotMatch(shopMarkup, /<section\b[^>]*class="[^"]*\bsubscription-section\b/)
assert.doesNotMatch(shopMarkup, /start a free trial|testimonials|readiness score|offline mode|universal printer/i)
assert.doesNotMatch(shopMarkup, /secure file submission/i)
assert.equal((shopDemoScript.match(/id: "(?:milk-tea|coffee-tonic|coconut-cloud|butter-bun|sesame-cookie|palm-sugar-cake)"/g) || []).length, 6)
assert.match(shopDemoScript, /lang="my"/)
assert.doesNotMatch(shopDemoScript, /#eee7ff|#5b4ee8|#4538c8/i)
assert.doesNotMatch(shopDemoScript, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|window\.print|navigator\.vibrate|window\.open|location\.(?:assign|replace)|setInterval/i)
assert.match(generator, /public_company_shop_design\.mjs/)
assert.match(generator, /function shopLandingHtml\(product, page\)/)
assert.doesNotMatch(generator, /writeStatic\('shop-sample-demo\.js', shopDemoScript\)/)
assert.match(generator, /shop_interactive_mock/)
assert.match(generator, /data-gallery-previous aria-label="Previous \$\{label\} screenshot" disabled/)
assert.match(generator, /data-gallery-next aria-label="Next \$\{label\} screenshot"/)
assert.match(generator, /data-gallery-status aria-live="polite"/)
assert.match(generator, /class="platform-slides" tabindex="0"/)
assert.match(generator, /class="platform-device-stage"/)
assert.match(generator, /class="platform-device platform-device-desktop"/)
assert.match(generator, /class="platform-device platform-device-phone"/)
assert.match(generator, /\.home-platform-image \.platform-device-phone\s*\{position:absolute/)
assert.match(generator, /\.home-platform-image \.platform-device-stage\s*\{display:grid;min-height:0/)
assert.match(generator, /function go\(index\)\{var target=slides\[Math\.max\(0,Math\.min\(index,slides\.length-1\)\)\];target\.querySelectorAll\('img\[loading="lazy"\]'\)/)
assert.match(generator, /See Shop on desktop and mobile\./)
assert.match(generator, /Actual application UI capture · synthetic local records/)
assert.match(generator, /function replaceHomeShopShowcase\(source, galleryHtml\)/)
assert.match(generator, /function homeShopGallery\(\)/)
assert.match(generator, /const publicHomeMarkup = replaceHomeShopShowcase\(shopOnlyCompanyMarkup\(companyMarkup\), homeShopGallery\(\)\)/)
assert.match(generator, /content:`<main id="content">\$\{publicHomeMarkup\}<\/main>\$\{stories\.shop\.screens\.length > 1 \? '<script src="\/platform-carousel\.js" defer><\/script>' : ''\}`/)
assert.match(generator, /screens:\[\['actual-shop-sell\.png'.*?'actual-shop-today\.png'.*?'actual-shop-orders\.png'/)
assert.match(generator, /Counter sale and live basket/)
assert.match(outputVerifier, /gallery_previous_control_accessibility_drift/)
assert.match(outputVerifier, /gallery_next_control_accessibility_drift/)
assert.match(outputVerifier, /gallery_status_or_keyboard_accessibility_drift/)
assert.match(outputVerifier, /platform-device-desktop/)
assert.match(outputVerifier, /platform-device-phone/)

const demo = createDemoHarness()
const { get, categories, dispatchClick, dispatchInput } = demo
assert.equal(get('missing-shop-target'), null)
assert.match(get('productGrid').innerHTML, /Milk tea/)
assert.match(get('productGrid').innerHTML, /lang="my"/)
dispatchInput('productSearch', 'milk')
assert.match(get('productGrid').innerHTML, /Milk tea/)
assert.doesNotMatch(get('productGrid').innerHTML, /Coffee tonic/)
dispatchInput('productSearch', '')
categories.find((item) => item.dataset.category === 'Drinks').listeners.get('click')[0]()
assert.match(get('productGrid').innerHTML, /Coffee tonic/)
assert.doesNotMatch(get('productGrid').innerHTML, /Butter bun/)
categories.find((item) => item.dataset.category === 'All').listeners.get('click')[0]()

get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('completeSale').disabled, true)
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('receipt').hidden, true)
dispatchClick('productGrid', 'button[data-add]', { add: 'milk-tea' })
dispatchClick('basketRows', 'button[data-action]', { action: 'decrease', id: 'milk-tea' })
assert.equal(get('basketCount').textContent, '0')
assert.equal(get('completeSale').disabled, true)
assert.equal(get('basketTotal').textContent, '0 MMK')
get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('receipt').hidden, true)

dispatchClick('productGrid', 'button[data-add]', { add: 'milk-tea' })
dispatchClick('productGrid', 'button[data-add]', { add: 'milk-tea' })
assert.equal(get('basketCount').textContent, '2')
assert.equal(get('basketTotal').textContent, '9,000 MMK')
dispatchClick('basketRows', 'button[data-action]', { action: 'increase', id: 'milk-tea' })
assert.equal(get('basketCount').textContent, '3')
assert.equal(get('basketTotal').textContent, '13,500 MMK')

let prevented = false
get('saleForm').listeners.get('submit')[0]({ preventDefault() { prevented = true } })
assert.equal(prevented, true)
assert.equal(get('todayTotal').textContent, '13,500 MMK')
assert.match(get('receiptLines').innerHTML, /3 × Milk tea/)
assert.equal(get('receiptId').textContent, 'SAMPLE-001')
assert.match(get('productGrid').innerHTML, /9 in sample stock/)
assert.equal(get('receipt').hidden, false)

dispatchClick('productGrid', 'button[data-add]', { add: 'milk-tea' })
get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(get('todayTotal').textContent, '18,000 MMK')
assert.equal(get('receiptId').textContent, 'SAMPLE-002')
assert.match(get('receiptLines').innerHTML, /1\s*.\s*Milk tea/)
assert.match(get('productGrid').innerHTML, /8 in sample stock/)

get('resetExample').listeners.get('click')[0]()
assert.equal(get('todayTotal').textContent, '0 MMK')
assert.equal(get('basketCount').textContent, '0')
assert.equal(get('receipt').hidden, true)
assert.match(get('productGrid').innerHTML, /12 in sample stock/)
assert.equal(get('saleStatus').textContent, 'Example reset. Sample data has been restored.')

const exhausted = createDemoHarness()
for (let index = 0; index < 12; index += 1) exhausted.dispatchClick('productGrid', 'button[data-add]', { add: 'milk-tea' })
assert.equal(exhausted.get('basketCount').textContent, '12')
assert.match(exhausted.get('productGrid').innerHTML, /data-add="milk-tea"[^>]*disabled/)
exhausted.get('saleForm').listeners.get('submit')[0]({ preventDefault() {} })
assert.equal(exhausted.get('todayTotal').textContent, '54,000 MMK')
assert.match(exhausted.get('productGrid').innerHTML, /Out of sample stock/)
assert.match(exhausted.get('productGrid').innerHTML, /data-add="milk-tea"[^>]*disabled/)
assert.equal(exhausted.get('basketCount').textContent, '0')

console.log('public Company/Shop source, responsive rules, safety boundaries, DOM targets, empty checkout, successive sales, stock exhaustion, and reset verified')
