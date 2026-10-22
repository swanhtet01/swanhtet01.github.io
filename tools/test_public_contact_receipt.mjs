import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const outputDir = isolatedOutputId
  ? resolve('.tmp', `supermega-public-output-${isolatedOutputId}`, 'static')
  : resolve('.vercel/output/static')
const html = readFileSync(resolve(outputDir, 'contact/index.html'), 'utf8')
const myanmarHtml = readFileSync(resolve(outputDir, 'my/contact/index.html'), 'utf8')
const page = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? ''
const myanmarPage = myanmarHtml.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? ''
const formHtml = page.match(/<form class="contact-form"[\s\S]*?<\/form>/)?.[0] ?? ''
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(value => value.includes('[data-contact-form]'))
assert.ok(script, 'actual generated contact script exists')
assert.equal([...myanmarHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(value => value.includes('[data-contact-form]')), script, 'English and Burmese reuse one receipt contract')

test('contact form stays concise and does not make customers classify the request', () => {
  assert.match(page, /<h1 data-contact-heading>Contact<\/h1>/)
  assert.match(page, /Tell us about your business and the workflow you want to improve\. We will reply by email\./)
  assert.doesNotMatch(page, /English and Burmese are both welcome|lang="my"|[\u1000-\u109f]/u)
  assert.doesNotMatch(formHtml, /Your reference number confirms receipt/)
  assert.match(formHtml, /<label>Email<input name="email"/)
  assert.match(formHtml, /Company \(optional\)/)
  assert.match(formHtml, /<label class="wide">Message<textarea/)
  assert.match(formHtml, /placeholder="Tell us what your business needs\."/)
  assert.match(formHtml, /<input type="hidden" name="product" value="guide"/)
  assert.doesNotMatch(page, /<select\b|trial-proof-summary|Attached request details|What to include|Readiness|Behavior|Decisions|Reply email|What would you like us to prepare\?|Do not paste|Brief tips|Your brief|request summary/)
  assert.match(formHtml, /<input type="hidden" name="template" maxlength="120"/)
  assert.doesNotMatch(page, /Template, if known|>Send workflow<|>Send the workflow</)
  assert.match(formHtml, />Send message<\/button>/)
  assert.match(formHtml, /name="goal" required maxlength="4000"/)
})

function harness(responses, search = '', hash = '', locale = 'en') {
  const fields = new Map()
  const events = new Map()
  const windowEvents = new Map()
  let handler, resets = 0
  const calls = []
  const timers = new Map()
  const headings = new Map()
  const historyCalls = []
  const route = locale === 'my' ? '/my/contact/' : '/contact/'
  const location = { origin: 'https://supermega.dev', search, hash, pathname: route, href: 'https://supermega.dev' + route + search + hash }
  const languageSwitch = { href: locale === 'my' ? '/contact/' : '/my/contact/' }
  let timerId = 0
  const form = {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, { open: true, value: selector === '[name="product"]' ? 'guide' : '', placeholder: selector === '[name="goal"]' ? 'Tell us what your business needs.' : '', selectedOptions: [], validity: { typeMismatch: false }, setCustomValidity(message) { this.validationMessage = message }, addEventListener(name, callback) { events.set(selector + ':' + name, callback) } })
      return fields.get(selector)
    },
    addEventListener(name, callback) { if (name === 'submit') handler = callback; else events.set('form:' + name, callback) },
    reset() { events.get('form:reset')?.(); resets++; for (const field of fields.values()) field.value = '' },
  }
  let keys = 0
  const crypto = { randomUUID: () => 'local-retry-key-' + ++keys }
  runInNewContext(script, {
    document: { documentElement: { lang: locale }, querySelector: selector => {
      if (selector === '[data-contact-form]') return form
      if (selector === '[data-language-switch]') return languageSwitch
      if (['[data-contact-heading]', '[data-contact-lede]'].includes(selector)) {
        if (!headings.has(selector)) headings.set(selector, { textContent: selector === '[data-contact-heading]' ? (locale === 'my' ? 'ဆက်သွယ်ရန်' : 'Contact') : 'Tell us about your business and the workflow you want to improve. We will reply by email.' })
        return headings.get(selector)
      }
      return null
    }, referrer: '' },
    history: { replaceState(state, title, path) {
      historyCalls.push(path)
      const next = new URL(path, location.href)
      Object.assign(location, { href: next.href, hash: next.hash, search: next.search, pathname: next.pathname })
    } },
    location,
    URL, URLSearchParams, window: { crypto, addEventListener(name, callback) { windowEvents.set(name, callback) }, removeEventListener(name, callback) { if (windowEvents.get(name) === callback) windowEvents.delete(name) } }, crypto,
    AbortController,
    setTimeout(callback, delay) { assert.equal(delay, 20000); timers.set(++timerId, callback); return timerId },
    clearTimeout(id) { timers.delete(id) },
    FormData: class { entries() { return [...fields].flatMap(([selector, field]) => {
      const name = selector.match(/^\[name="([^"]+)"\]$/)?.[1]
      return name ? [[name, field.value]] : []
    }) } },
    fetch: async (url, options) => {
      calls.push({ url, ...options })
      const next = await responses.shift()
      if (next instanceof Error) throw next
      return { ok: next.ok !== false, status: next.status ?? 200, json: async () => {
        if (next.invalidJson) throw new Error('invalid JSON')
        return next.body
      } }
    },
  })
  if (!hash) form.querySelector('[name="goal"]').value = 'Please build my business website'
  return { invalid: field => events.get('form:invalid')?.({ target: form.querySelector('[name="' + field + '"]') }), input: field => events.get('form:input')?.({ target: form.querySelector('[name="' + field + '"]') }), reset: () => form.reset(), fields, headings, calls, timers, windowEvents, historyCalls, location, languageSwitch, changeProduct: value => { form.querySelector('[name="product"]').value = value; events.get('[name="product"]:change')() }, expire: () => { for (const callback of [...timers.values()]) callback() }, submit: () => handler({ preventDefault() {} }), resets: () => resets }
}

test('only active public product links set product context; internal routes fall back to the general brief', () => {
  assert.doesNotMatch(html, /<select name="product"/)
  const shop = harness([], '?product=shop&source=shop-brief', '#company=Example&goal=Prepare%20our%20shop')
  assert.equal(shop.fields.get('[name="product"]').value, 'shop')
  assert.equal(shop.headings.get('[data-contact-heading]').textContent, 'Request a Shop walkthrough')
  assert.equal(shop.headings.get('[data-contact-lede]').textContent, 'The Shop browser sample shows counter sales, orders and inventory. Tell us about your catalog, devices and receipt needs to plan a guided pilot.')
  assert.equal(shop.fields.get('[name="goal"]').value, 'Prepare our shop')
  assert.equal(shop.calls.length, 0)
  for (const product of ['website', 'ecommerce']) {
    const state = harness([], `?product=${product}&source=${product}-brief`, '#company=Example&goal=Prepare%20our%20site')
    assert.equal(state.fields.get('[name="product"]').value, 'guide')
    assert.equal(state.fields.get('[name="template"]').value, '')
    assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Contact')
    assert.equal(state.fields.get('[name="goal"]').value, 'Prepare our site')
    assert.equal(state.calls.length, 0)
  }
  assert.doesNotMatch(html, /<details/)
})

test('prefilled message stays editable and does not claim setup is complete', () => {
  const state = harness([], '?product=shop', '#company=Example&goal=Prepare%20our%20shop')
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Request a Shop walkthrough')
  assert.equal(state.fields.get('[name="company"]').value, 'Example')
  assert.equal(state.calls.length, 0)
  assert.doesNotMatch(script, /Your setup is ready\./)
})

test('Shop handoffs preserve valid context and unsupported internal routes cannot set product or template', () => {
  const state = harness([], '?product=shop&template=example-template')
  assert.equal(state.fields.get('[name="product"]').value, 'shop')
  assert.equal(state.fields.get('[name="template"]').value, 'example-template')
  state.fields.get('[name="company"]').value = 'Example business'
  state.changeProduct('guide')
  assert.equal(state.fields.get('[name="template"]').value, '')
  assert.equal(state.fields.get('[name="company"]').value, 'Example business')
  assert.equal(state.fields.get('[name="goal"]').value, 'Please build my business website')
  assert.equal(state.calls.length, 0)
  for (const product of ['website', 'ecommerce']) {
    const internal = harness([], `?product=${product}&template=example-template`)
    assert.equal(internal.fields.get('[name="product"]').value, 'guide')
    assert.equal(internal.fields.get('[name="template"]').value, '')
    assert.equal(internal.headings.get('[data-contact-heading]').textContent, 'Contact')
  }
  for (const search of ['?product=unknown&template=example', '?product=guide&template=example', '?product=website&template=' + 'a'.repeat(121), '?product=website&template=%3Cbad%3E']) {
    assert.equal(harness([], search).fields.get('[name="template"]').value, '')
  }
})

const receipt = { status: 'ready', request_id: 'LEAD-0123456789ABCDEF', proof_bound: false }
test('Burmese contact route keeps the same safe receipt contract with Burmese controls and states', async () => {
  for (const token of ['<label>အမည်<input', '<label>အီးမေးလ်<input', '<label class="wide">စာ<textarea', '>စာပို့ရန်</button>']) assert.match(myanmarPage, new RegExp(token))
  assert.doesNotMatch(myanmarPage, />Send message<\/button>|>Company \(optional\)<input/)
  const state = harness([new Error('connection lost'), { body: receipt }], '?product=shop&utm_source=example&private=discard', '', 'my')
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Shop အသုံးပြုပုံကို မေးမြန်းရန်')
  assert.equal(state.headings.get('[data-contact-lede]').textContent, 'Shop ဘရောက်ဇာနမူနာတွင် ကောင်တာအရောင်း၊ အော်ဒါနှင့် ကုန်လက်ကျန်ကို ကြည့်နိုင်ပါသည်။ စမ်းသပ်အသုံးပြုမည့်အစီအစဉ်ကို ဆွေးနွေးရန် သင့်ကုန်ပစ္စည်းစာရင်း၊ အသုံးပြုမည့်စက်များနှင့် ပြေစာလိုအပ်ချက်ကို ပြောပြပါ။')
  assert.equal(state.languageSwitch.href, '/contact/?product=shop&utm_source=example')
  state.invalid('name')
  assert.equal(state.fields.get('[name="name"]').validationMessage, 'ဤအချက်အလက်ကို ဖြည့်ပါ။')
  state.input('name')
  assert.equal(state.fields.get('[name="name"]').validationMessage, '')
  state.input('email')
  state.fields.get('[name="email"]').validity.typeMismatch = true
  state.invalid('email')
  assert.equal(state.fields.get('[name="email"]').validationMessage, 'မှန်ကန်သော အီးမေးလ်လိပ်စာကို ဖြည့်ပါ။')
  state.input('email')
  await state.submit()
  assert.match(state.fields.get('[data-form-status]').textContent, /သင့်စာကို လက်ခံရရှိခဲ့ကြောင်း အတည်မပြုနိုင်သေးပါ/)
  await state.submit()
  assert.equal(state.calls[0].body, state.calls[1].body)
  assert.equal(JSON.parse(state.calls[0].body).source_url, 'https://supermega.dev/my/contact/?product=shop&utm_source=example&private=discard')
  assert.match(state.fields.get('[data-form-status]').textContent, /စာလက်ခံရရှိပါပြီ: LEAD-0123456789ABCDEF/)
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'စာပို့ပြီးပါပြီ။')
  assert.equal(state.fields.get('button[type="submit"]').textContent, 'နောက်ထပ်စာပို့ရန်')
})
test('one clear message prompt stays consistent across product links', () => {
  for (const product of ['website', 'ecommerce', 'shop', 'guide']) {
    const state = harness([], '?product=' + product)
    const goal = state.fields.get('[name="goal"]')
    assert.equal(goal.placeholder, 'Tell us what your business needs.')
    assert.doesNotMatch(goal.placeholder, /Do not paste/)
    goal.value = 'Keep my own brief exactly as written'
    state.changeProduct('website')
    assert.equal(goal.value, 'Keep my own brief exactly as written')
    assert.equal(goal.placeholder, 'Tell us what your business needs.')
    state.changeProduct('unknown')
    assert.equal(goal.placeholder, 'Tell us what your business needs.')
    assert.equal(state.calls.length, 0)
  }
})
test('navigation warning exists only during pending or unconfirmed delivery', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const state = harness([pending, { body: receipt }])
  assert.equal(state.windowEvents.size, 0)
  const attempt = state.submit()
  const warning = state.windowEvents.get('beforeunload')
  assert.equal(typeof warning, 'function')
  let prevented = false
  const event = { preventDefault() { prevented = true }, returnValue: undefined }
  warning(event)
  assert.equal(prevented, true)
  assert.equal(event.returnValue, true)
  finish(new Error('response lost'))
  await attempt
  assert.equal(state.windowEvents.get('beforeunload'), warning)
  assert.match(state.fields.get('[data-form-status]').textContent, /Retry checks the original message first\. New edits remain unsent\./)
  await state.submit()
  assert.equal(state.windowEvents.size, 0)
  assert.equal(state.calls[0].body, state.calls[1].body)
  prevented = false
  warning(event)
  assert.equal(prevented, false, 'stale callback cannot warn after confirmation')
  const rejected = harness([{ ok: false, status: 400, body: { status: 'error', reason: 'required_fields_missing' } }])
  await rejected.submit()
  assert.equal(rejected.windowEvents.size, 0)
})
test('Shop handoff retains identity through uncertain delivery and confirmation', async () => {
  for (const product of ['shop']) {
    const state = harness([new Error('connection lost'), { body: receipt }], '?product=' + product + '&source=' + product + '-preview')
    assert.equal(state.calls.length, 0, 'opening a door does not send a brief')
    state.fields.get('[name="company"]').value = 'Synthetic service business'
    state.fields.get('[name="goal"]').value = 'Prepare our ' + product + ' for owner review'
    await state.submit()
    const original = JSON.parse(state.calls[0].body)
    assert.equal(state.calls[0].url, '/api/contact-submissions')
    assert.equal(state.calls[0].method, 'POST')
    assert.equal(original.product, product)
    assert.equal(original.template, '', 'no fabricated template or builder prerequisite')
    assert.equal(original.goal, 'Prepare our ' + product + ' for owner review')
    assert.equal(original.idempotency_key, state.calls[0].headers['x-idempotency-key'])
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Message received/)
    await state.submit()
    assert.equal(state.calls[1].body, state.calls[0].body)
    assert.equal(state.calls[1].headers['x-idempotency-key'], state.calls[0].headers['x-idempotency-key'])
    assert.match(state.fields.get('[data-form-status]').textContent, /Message received: LEAD-0123456789ABCDEF/)
    assert.match(state.fields.get('[data-form-status]').textContent, /Keep this reference if you need to follow up/ )
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Next: review of scope/)
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /account created|payment received|website published/i)
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /No action is needed now|will .*reply|email/i)
    assert.equal(state.resets(), 1)
  }
})
test('only explicit pre-delivery validation failures unlock a corrected brief', async () => {
  for (const reason of ['invalid_request', 'required_fields_missing', 'product_not_supported', 'trial_proof_invalid', 'idempotency_key_required']) {
    const state = harness([{ ok: false, status: 400, body: { status: 'error', reason } }, { body: receipt }])
    await state.submit()
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[name="idempotency_key"]').value, '')
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Message received|Retry sends/)
    state.fields.get('[name="goal"]').value = 'Corrected brief'
    await state.submit()
    assert.equal(JSON.parse(state.calls[1].body).goal, 'Corrected brief')
    assert.notEqual(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
  }
  for (const status of [409, 429, 503]) {
    const state = harness([{ ok: false, status, body: { status: 'error', reason: 'invalid_request' } }, { body: receipt }])
    await state.submit()
    state.fields.get('[name="goal"]').value = 'Later edit'
    await state.submit()
    assert.equal(state.calls[0].body, state.calls[1].body)
    assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    assert.equal(state.resets(), 0)
  }
})
test('late edits survive confirmation and uncertain retries resend the original brief', async () => {
  for (const failFirst of [false, true]) {
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const state = harness([pending, { body: receipt }, { body: receipt }])
    const first = state.submit()
    state.fields.get('[name="goal"]').value = 'Revised brief not yet sent'
    finish(failFirst ? new Error('network') : { body: receipt })
    await first
    if (failFirst) {
      assert.match(state.fields.get('[data-form-status]').textContent, /Retry checks the original message first/)
      await state.submit()
      assert.equal(state.calls[0].body, state.calls[1].body)
      assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    }
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[name="goal"]').value, 'Revised brief not yet sent')
    assert.match(state.fields.get('[data-form-status]').textContent, /Later edits remain unsent/)
    await state.submit()
    assert.equal(JSON.parse(state.calls.at(-1).body).goal, 'Revised brief not yet sent')
    assert.notEqual(state.calls.at(-1).headers['x-idempotency-key'], state.calls[0].headers['x-idempotency-key'])
    assert.equal(state.resets(), 1)
  }
})
test('product and company changes survive an original receipt without changing its retry payload', async () => {
  const state = harness([new Error('offline'), { body: receipt }, { body: receipt }], '?product=shop&template=retail')
  state.fields.get('[name="company"]').value = 'Original business'
  await state.submit()
  state.changeProduct('website')
  state.fields.get('[name="company"]').value = 'Revised business'
  await state.submit()
  assert.equal(state.calls[0].body, state.calls[1].body)
  assert.equal(state.resets(), 0)
  assert.equal(state.fields.get('[name="product"]').value, 'website')
  assert.equal(state.fields.get('[name="company"]').value, 'Revised business')
  await state.submit()
  const next = JSON.parse(state.calls[2].body)
  assert.equal(next.product, 'website')
  assert.equal(next.company, 'Revised business')
  assert.equal(next.template, '')
  assert.equal(next.idempotency_key, state.calls[2].headers['x-idempotency-key'])
  assert.notEqual(next.idempotency_key, JSON.parse(state.calls[0].body).idempotency_key)
})
test('valid generated receipt confirms and clears the brief', async () => {
  const state = harness([{ body: receipt }])
  await state.submit()
  assert.equal(state.resets(), 1)
  assert.equal(state.timers.size, 0)
  assert.equal(state.fields.get('[name="idempotency_key"]').value, '')
  assert.match(state.fields.get('[data-form-status]').textContent, /Message received: LEAD-0123456789ABCDEF/)
})

test('confirmed reset refreshes guidance and clears attached-summary fields for the next brief', async () => {
  const state = harness([{ body: receipt }], '?product=ecommerce')
  assert.equal(state.fields.get('[name="goal"]').placeholder, 'Tell us what your business needs.')
  state.fields.set('[name="proof_digest"]', { value: 'synthetic-old-summary' })
  await state.submit()
  assert.equal(state.resets(), 1)
  assert.equal(state.fields.get('[name="goal"]').placeholder, 'Tell us what your business needs.')
  assert.equal(state.fields.get('[name="proof_digest"]').value, '')
  assert.equal(state.calls.length, 1)
})

test('request and response-body stalls expire without accepting late receipts', async () => {
  for (const stalledBody of [false, true]) {
    let finish
    const delayed = new Promise(resolve => { finish = resolve })
    const state = harness([stalledBody ? { body: delayed } : delayed, { body: receipt }])
    const attempt = state.submit()
    await Promise.resolve()
    state.expire()
    await attempt
    assert.equal(state.calls[0].signal.aborted, true)
    assert.equal(state.resets(), 0)
    assert.equal(state.timers.size, 0)
    assert.equal(state.fields.get('button[type="submit"]').disabled, false)
    assert.equal(state.fields.get('[name="goal"]').value, 'Please build my business website')
    const failureMessage = state.fields.get('[data-form-status]').textContent
    finish(stalledBody ? receipt : { body: receipt })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[data-form-status]').textContent, failureMessage)
    await state.submit()
    assert.equal(state.resets(), 1)
    assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    assert.equal(state.calls[0].body, state.calls[1].body)
    assert.equal(state.timers.size, 0)
  }
})

test('a second submit while awaiting receipt cannot send another request', async () => {
  let resolveResponse
  const pending = new Promise(resolve => { resolveResponse = resolve })
  const state = harness([pending])
  const first = state.submit()
  await state.submit()
  assert.equal(state.calls.length, 1)
  assert.equal(state.resets(), 0)
  resolveResponse({ body: receipt })
  await first
  assert.equal(state.resets(), 1)
  assert.equal(state.fields.get('button[type="submit"]').disabled, false)
})

test('ambiguous and rejected responses retain brief and reuse the exact retry key', async () => {
  const failures = [
    { body: {} }, { body: null }, { invalidJson: true },
    { body: { ...receipt, status: 'pending' } },
    { body: { ...receipt, request_id: 'confirmed' } },
    { body: { ...receipt, proof_bound: undefined } },
    { ok: false, body: receipt }, new Error('offline'),
  ]
  for (const failure of failures) {
    const state = harness([failure, { body: receipt }])
    await state.submit()
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[name="goal"]').value, 'Please build my business website')
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Message received/)
    assert.equal(state.fields.get('button[type="submit"]').disabled, false)
    await state.submit()
    assert.equal(state.resets(), 1)
    assert.equal(state.calls.length, 2)
    assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    assert.equal(state.calls[0].body, state.calls[1].body)
    assert.ok(state.calls.every(call => call.url === '/api/contact-submissions'))
  }
})


test('legacy internal product brief handoff preserves Myanmar text while contact stays on the general route', async () => {
  const source = readFileSync('showroom/src/products/AssistedDeliveryScope.tsx', 'utf8')
  const submit = source.match(/<form onSubmit=\{event => \{([\s\S]*?)\n    \}\}>/)?.[1]
  assert.ok(submit, 'actual business brief submit handler found')
  for (const product of ['website', 'ecommerce']) {
    const company = '  မြန်မာ ဆိုင် & Co  '
    const description = '  ' + 'မြန်မာ & + # ? '.repeat(180) + '  '
    const reference = ' https://example.invalid/catalog?q=tea&lang=my#items '
    let destination
    runInNewContext(`(() => {${submit}})()`, { company, description, reference, product, onPreparePreview: undefined, URLSearchParams, setHandoffFailed() {},
      event: { preventDefault() {} }, window: { location: { assign: value => { destination = value } } } })
    const url = new URL(destination)
    assert.equal(url.origin + url.pathname, 'https://supermega.dev/contact/')
    assert.equal(url.searchParams.get('company'), null, 'business details stay out of query parameters')
    const goal = description.trim() + '\nExisting page or catalog: ' + reference.trim()
    assert.ok(goal.length < 4000)
    const state = harness([new Error('synthetic lost response'), { body: receipt }], url.search, url.hash)
    assert.equal(state.calls.length, 0)
    assert.equal(state.fields.get('[name="company"]').value, company.trim())
    assert.equal(state.fields.get('[name="goal"]').value, goal)
    assert.equal(state.fields.get('[name="product"]').value, 'guide')
    await state.submit()
    const payload = JSON.parse(state.calls[0].body)
    assert.equal(payload.company, company.trim())
    assert.equal(payload.goal, goal)
    assert.equal(payload.product, 'guide')
    await state.submit()
    assert.equal(state.calls[1].body, state.calls[0].body)
    assert.equal(state.resets(), 1)
  }
})


test('confirmed handoff resets entry guidance only when no later edits remain', async () => {
  for (const edited of [false, true]) {
    const state = harness([new Error('lost response'), { body: receipt }], '?product=website', '#company=Example&goal=Prepare%20our%20website')
    const originalHeading = state.headings.get('[data-contact-heading]').textContent
    await state.submit()
    assert.equal(state.headings.get('[data-contact-heading]').textContent, originalHeading)
    if (edited) state.fields.get('[name="goal"]').value = 'Later unsent brief'
    await state.submit()
    assert.equal(state.calls[0].body, state.calls[1].body)
    assert.equal(state.resets(), edited ? 0 : 1)
    assert.equal(state.headings.get('[data-contact-heading]').textContent, edited ? originalHeading : 'Message sent.')
    if (edited) assert.equal(state.fields.get('[name="goal"]').value, 'Later unsent brief')
    else {
      assert.equal(state.fields.get('button[type="submit"]').textContent, 'Send another message.')
      assert.equal(state.headings.get('[data-contact-lede]').textContent, 'Reference: '+receipt.request_id+'. Keep it for follow-up.')
    }
    assert.match(state.fields.get('[data-form-status]').textContent, /Message received: LEAD-/)
  }
})


test('Myanmar brief handoff preserves text and clears the fragment before submission', async () => {
  const company = 'ရွှေမေတ္တာ & Sons + မန္တလေး'
  const description = 'အဝတ်အထည်နှင့် လက်ဆောင်များ\nဈေးနှုန်း ၁၀,၀၀၀ ကျပ် — A&B + #1'
  const reference = 'https://example.invalid/catalog?q=A+B&lang=my#ပစ္စည်း'
  const goal = `${description}\nExisting page or catalog: ${reference}`
  for (const product of ['website', 'ecommerce']) {
    const search = `?product=${product}&source=${product}-brief`
    const hash = '#' + new URLSearchParams({ company, goal }).toString()
    const state = harness([{ body: receipt }], search, hash)
    assert.equal(state.fields.get('[name="company"]').value, company)
    assert.equal(state.fields.get('[name="goal"]').value, goal)
    assert.deepEqual(state.historyCalls, ['/contact/' + search])
    assert.equal(state.location.hash, '')
    assert.equal(state.calls.length, 0)
    await state.submit()
    const payload = JSON.parse(state.calls[0].body)
    assert.equal(payload.company, company)
    assert.equal(payload.goal, goal)
    assert.equal(payload.source_url, 'https://supermega.dev/contact/' + search)
    assert.equal(payload.source_url.includes(company), false)
  }
})


test('a failed second request cannot retain the earlier success heading', async () => {
  const state = harness([{ body: receipt }, new Error('offline'), { body: { ...receipt, request_id: 'LEAD-FEDCBA9876543210' } }])
  await state.submit()
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Message sent.')
  state.fields.get('[name="goal"]').value = 'A separate new brief'
  await state.submit()
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Send another message.')
  assert.match(state.headings.get('[data-contact-lede]').textContent, /^Previous message — Reference: LEAD-0123456789ABCDEF/)
  assert.match(state.fields.get('[data-form-status]').textContent, /couldn’t confirm that your message was received/)
  assert.notEqual(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
  await state.submit()
  assert.equal(state.calls[1].body, state.calls[2].body)
  assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Message sent.')
  assert.match(state.headings.get('[data-contact-lede]').textContent, /^Reference: LEAD-FEDCBA9876543210/)
})

test('product links preserve prefilled business details as editable fields', () => {
  assert.match(formHtml, /<label class="wide">Company \(optional\)<input/)
  for (const product of ['shop', 'website', 'ecommerce']) {
    const state = harness([], `?product=${product}`, '#company=Example&goal=Prepare%20our%20business')
    assert.equal(state.fields.get('[name="company"]').value, 'Example')
    assert.equal(state.fields.get('[name="goal"]').value, 'Prepare our business')
    state.reset()
    assert.equal(state.calls.length, 0)
  }
  const incomplete = harness([], '?product=website', '#company=Example')
  assert.equal(incomplete.fields.get('[name="company"]').value, 'Example')
})

test('synthetic business briefs survive service corrections without repeat entry', async () => {
  const briefs = [
    { product: 'shop', company: 'Synthetic Mandalay Grocery', goal: 'One counter, Android tablet, cash sales and a daily close. About 80 products.' },
    { product: 'website', company: 'Synthetic Yangon Salon', goal: 'Show services, opening hours and location. Visitors should call to book. Burmese and English.' },
    { product: 'ecommerce', company: 'Synthetic Gift Store', goal: 'Thirty gifts with sizes and prices. Customers request items for collection; staff confirm availability.' },
  ]
  for (const brief of briefs) {
    const state = harness([{ body: receipt }], `?product=${brief.product}&template=original`, '#' + new URLSearchParams({ company: brief.company, goal: brief.goal }))
    assert.equal(state.fields.get('[name="company"]').value, brief.company)
    const corrected = brief.product === 'shop' ? 'ecommerce' : 'shop'
    state.changeProduct(corrected)
    assert.equal(state.fields.get('[name="product"]').value, corrected)
    assert.equal(state.fields.get('[name="company"]').value, brief.company)
    assert.equal(state.fields.get('[name="goal"]').value, brief.goal)
    assert.equal(state.fields.get('[name="template"]').value, '')
    assert.equal(state.calls.length, 0)
    await state.submit()
    const payload = JSON.parse(state.calls[0].body)
    assert.equal(payload.product, corrected)
    assert.equal(payload.company, brief.company)
    assert.equal(payload.goal, brief.goal)
    assert.equal(payload.template, '')
  }
})

test('legacy intelligence links retain normal contact presentation and source attribution', async () => {
  const receipt = { status: 'ready', request_id: 'LEAD-0123456789ABCDEF', proof_bound: false }
  const baseline = harness([])
  const legacy = harness([{ body: receipt }], '?source=managed-intelligence')
  assert.deepEqual([...legacy.headings], [...baseline.headings])
  assert.equal(legacy.fields.get('button[type="submit"]')?.textContent, baseline.fields.get('button[type="submit"]')?.textContent)
  assert.doesNotMatch(script, /Request managed pilot|Request managed company intelligence/)
  await legacy.submit()
  assert.equal(JSON.parse(legacy.calls[0].body).source_url, 'https://supermega.dev/contact/?source=managed-intelligence')
  assert.match(legacy.fields.get('[data-form-status]').textContent, /Message received/)
})
