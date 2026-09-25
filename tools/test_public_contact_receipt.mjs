import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const html = readFileSync('.vercel/output/static/contact/index.html', 'utf8')
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(value => value.includes('[data-contact-form]'))
assert.ok(script, 'actual generated contact script exists')

test('service brief asks for a business result without requiring template knowledge', () => {
  assert.match(html, /Tell us what your business needs\./)
  assert.match(html, /What to include/)
  assert.match(html, /scope, price and timing/)
  assert.match(html, /We use your email to reply about this request\./)
  assert.match(html, /<input type="hidden" name="template" maxlength="120"/)
  assert.doesNotMatch(html, /Template, if known|>Send workflow<|>Send the workflow</)
  assert.match(html, />Request setup<\/button>/)
  assert.match(html, /name="goal" required maxlength="4000"/)
})

function harness(responses, search = '', hash = '') {
  const fields = new Map()
  const events = new Map()
  const windowEvents = new Map()
  let handler, resets = 0
  const calls = []
  const timers = new Map()
  const headings = new Map()
  const historyCalls = []
  const location = { search, hash, pathname: '/contact/', href: 'https://supermega.dev/contact/' + search + hash }
  let timerId = 0
  const form = {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, { open: true, value: selector === '[name="product"]' ? 'guide' : '', selectedOptions: [], addEventListener(name, callback) { events.set(selector + ':' + name, callback) } })
      return fields.get(selector)
    },
    addEventListener(name, callback) { if (name === 'submit') handler = callback },
    reset() { resets++; for (const field of fields.values()) field.value = '' },
  }
  let keys = 0
  const crypto = { randomUUID: () => 'local-retry-key-' + ++keys }
  runInNewContext(script, {
    document: { querySelector: selector => {
      if (selector === '[data-contact-form]') return form
      if (['[data-contact-heading]', '[data-contact-lede]', '[data-contact-copy-heading]', '[data-contact-copy]'].includes(selector)) {
        if (!headings.has(selector)) headings.set(selector, { textContent: '' })
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
    URLSearchParams, window: { crypto, addEventListener(name, callback) { windowEvents.set(name, callback) }, removeEventListener(name, callback) { if (windowEvents.get(name) === callback) windowEvents.delete(name) } }, crypto,
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
  return { fields, headings, calls, timers, windowEvents, historyCalls, location, changeProduct: value => { form.querySelector('[name="product"]').value = value; events.get('[name="product"]:change')() }, expire: () => { for (const callback of [...timers.values()]) callback() }, submit: () => handler({ preventDefault() {} }), resets: () => resets }
}

test('complete assisted briefs collapse the editable service choice only', () => {
  assert.match(html, /data-contact-service open/)
  for (const product of ['website', 'ecommerce']) {
    const state = harness([], `?product=${product}&source=${product}-brief`, '#company=Example&goal=Prepare%20our%20site')
    assert.equal(state.fields.get('[data-contact-service]').open, false)
    assert.equal(state.fields.get('[data-contact-service-summary]').textContent.toLowerCase(), product)
    state.changeProduct('shop')
    assert.equal(state.fields.get('[data-contact-service-summary]').textContent, 'Shop')
    assert.equal(state.headings.get('[data-contact-heading]').textContent, 'Finish your Shop request.')
    assert.equal(state.fields.get('[name="goal"]').value, 'Prepare our site')
    assert.equal(state.calls.length, 0)
  }
  for (const [search, hash] of [['', ''], ['?product=website', '#company=Example&goal=Prepare'], ['?product=website&source=website-brief', '#company=Example']]) {
    assert.equal(harness([], search, hash).fields.get('[data-contact-service]').open, true)
  }
})

test('prefilled brief does not claim that customer setup is complete', () => {
  const state = harness([], '?product=website', '#company=Example&goal=Prepare%20our%20website')
  assert.equal(state.headings.get('[data-contact-copy-heading]').textContent, 'Your brief is ready to review.')
  assert.equal(state.fields.get('[name="company"]').value, 'Example')
  assert.equal(state.calls.length, 0)
  assert.doesNotMatch(script, /Your setup is ready\./)
})

test('product handoffs prefill hidden context and product changes discard stale templates only', () => {
  for (const product of ['shop', 'ecommerce', 'website']) {
    const state = harness([], '?product=' + product + '&template=example-template')
    assert.equal(state.fields.get('[name="product"]').value, product)
    assert.equal(state.fields.get('[name="template"]').value, 'example-template')
    state.fields.get('[name="company"]').value = 'Example business'
    state.changeProduct(product === 'shop' ? 'website' : 'shop')
    assert.equal(state.fields.get('[name="template"]').value, '')
    assert.equal(state.fields.get('[name="company"]').value, 'Example business')
    assert.equal(state.fields.get('[name="goal"]').value, 'Please build my business website')
    assert.equal(state.calls.length, 0)
  }
  for (const search of ['?product=unknown&template=example', '?product=guide&template=example', '?product=website&template=' + 'a'.repeat(121), '?product=website&template=%3Cbad%3E']) {
    assert.equal(harness([], search).fields.get('[name="template"]').value, '')
  }
})

const receipt = { status: 'ready', request_id: 'LEAD-0123456789ABCDEF', proof_bound: false }
test('product-specific brief guidance preserves drafts and never sends on selection', () => {
  const expectations = { website: 'what should visitors do?', ecommerce: 'how should you receive customer requests?', shop: 'which devices do staff use', guide: 'help choose the right service' }
  for (const [product, hint] of Object.entries(expectations)) {
    const state = harness([], '?product=' + product)
    const goal = state.fields.get('[name="goal"]')
    assert.ok(goal.placeholder.includes(hint))
    assert.match(goal.placeholder, /Do not paste/)
    goal.value = 'Keep my own brief exactly as written'
    state.changeProduct('website')
    assert.equal(goal.value, 'Keep my own brief exactly as written')
    assert.ok(goal.placeholder.includes(expectations.website))
    state.changeProduct('unknown')
    assert.ok(goal.placeholder.includes(expectations.guide))
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
  assert.match(state.fields.get('[data-form-status]').textContent, /reloading or closing it loses this retry state/)
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
test('three service-first doors retain product identity through uncertain delivery and confirmation', async () => {
  for (const product of ['website', 'ecommerce', 'shop']) {
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
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Request received/)
    await state.submit()
    assert.equal(state.calls[1].body, state.calls[0].body)
    assert.equal(state.calls[1].headers['x-idempotency-key'], state.calls[0].headers['x-idempotency-key'])
    assert.match(state.fields.get('[data-form-status]').textContent, /Request received: LEAD-0123456789ABCDEF/)
    assert.match(state.fields.get('[data-form-status]').textContent, /Keep this ID for follow-up/)
    assert.match(state.fields.get('[data-form-status]').textContent, /Next step: SuperMega reviews your brief to confirm scope, price and timing/)
    assert.match(state.fields.get('[data-form-status]').textContent, /This receipt does not confirm an email reply, create an account, take payment or make anything live/)
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /No action is needed now|will .*reply|email (sent|delivered)/i)
    assert.equal(state.resets(), 1)
  }
})
test('only explicit pre-delivery validation failures unlock a corrected brief', async () => {
  for (const reason of ['invalid_request', 'required_fields_missing', 'product_not_supported', 'trial_proof_invalid', 'idempotency_key_required']) {
    const state = harness([{ ok: false, status: 400, body: { status: 'error', reason } }, { body: receipt }])
    await state.submit()
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[name="idempotency_key"]').value, '')
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Request received|Retry sends/)
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
      assert.match(state.fields.get('[data-form-status]').textContent, /Retry sends the original brief/)
      await state.submit()
      assert.equal(state.calls[0].body, state.calls[1].body)
      assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    }
    assert.equal(state.resets(), 0)
    assert.equal(state.fields.get('[name="goal"]').value, 'Revised brief not yet sent')
    assert.match(state.fields.get('[data-form-status]').textContent, /later edits.*have not been sent/)
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
  assert.match(state.fields.get('[data-form-status]').textContent, /Request received: LEAD-0123456789ABCDEF/)
})

test('confirmed reset refreshes guidance and clears attached-summary fields for the next brief', async () => {
  const state = harness([{ body: receipt }], '?product=ecommerce')
  assert.match(state.fields.get('[name="goal"]').placeholder, /receive customer requests/)
  state.fields.set('[name="proof_digest"]', { value: 'synthetic-old-summary' })
  await state.submit()
  assert.equal(state.resets(), 1)
  assert.equal(state.fields.get('[data-contact-service]').open, true)
  assert.equal(state.fields.get('[data-contact-service-summary]').textContent, 'Choose a service')
  assert.match(state.fields.get('[name="goal"]').placeholder, /help choose the right service/)
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
    assert.doesNotMatch(state.fields.get('[data-form-status]').textContent, /Request received/)
    assert.equal(state.fields.get('button[type="submit"]').disabled, false)
    await state.submit()
    assert.equal(state.resets(), 1)
    assert.equal(state.calls.length, 2)
    assert.equal(state.calls[0].headers['x-idempotency-key'], state.calls[1].headers['x-idempotency-key'])
    assert.equal(state.calls[0].body, state.calls[1].body)
    assert.ok(state.calls.every(call => call.url === '/api/contact-submissions'))
  }
})


test('actual business brief handoff preserves Myanmar text and reference through contact retry', async () => {
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
    assert.equal(state.fields.get('[name="product"]').value, product)
    await state.submit()
    const payload = JSON.parse(state.calls[0].body)
    assert.equal(payload.company, company.trim())
    assert.equal(payload.goal, goal)
    assert.equal(payload.product, product)
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
    assert.equal(state.headings.get('[data-contact-heading]').textContent, edited ? originalHeading : 'Tell us what your business needs.')
    assert.equal(state.headings.get('[data-contact-copy-heading]').textContent, edited ? 'Your brief is ready to review.' : 'What to include')
    if (edited) assert.equal(state.fields.get('[name="goal"]').value, 'Later unsent brief')
    else assert.equal(state.fields.get('button[type="submit"]').textContent, 'Request setup')
    assert.match(state.fields.get('[data-form-status]').textContent, /Request received: LEAD-/)
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
