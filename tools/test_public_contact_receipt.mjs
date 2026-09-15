import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const html = readFileSync('.vercel/output/static/contact/index.html', 'utf8')
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(value => value.includes('[data-contact-form]'))
assert.ok(script, 'actual generated contact script exists')

function harness(responses) {
  const fields = new Map()
  let handler, resets = 0
  const calls = []
  const timers = new Map()
  let timerId = 0
  const form = {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, { value: '', addEventListener() {} })
      return fields.get(selector)
    },
    addEventListener(name, callback) { if (name === 'submit') handler = callback },
    reset() { resets++; for (const field of fields.values()) field.value = '' },
  }
  const crypto = { randomUUID: () => 'fixed-local-retry-key' }
  runInNewContext(script, {
    document: { querySelector: selector => selector === '[data-contact-form]' ? form : null, referrer: '' },
    location: { search: '', hash: '', href: 'https://supermega.dev/contact/' },
    URLSearchParams, window: { crypto }, crypto,
    AbortController,
    setTimeout(callback, delay) { assert.equal(delay, 20000); timers.set(++timerId, callback); return timerId },
    clearTimeout(id) { timers.delete(id) },
    FormData: class { entries() { return [['goal', form.querySelector('[name="goal"]').value]] } },
    fetch: async (url, options) => {
      calls.push({ url, ...options })
      const next = await responses.shift()
      if (next instanceof Error) throw next
      return { ok: next.ok !== false, json: async () => {
        if (next.invalidJson) throw new Error('invalid JSON')
        return next.body
      } }
    },
  })
  form.querySelector('[name="goal"]').value = 'Please build my business website'
  return { fields, calls, timers, expire: () => { for (const callback of [...timers.values()]) callback() }, submit: () => handler({ preventDefault() {} }), resets: () => resets }
}

const receipt = { status: 'ready', request_id: 'LEAD-0123456789ABCDEF', proof_bound: false }
test('valid generated receipt confirms and clears the brief', async () => {
  const state = harness([{ body: receipt }])
  await state.submit()
  assert.equal(state.resets(), 1)
  assert.equal(state.timers.size, 0)
  assert.equal(state.fields.get('[name="idempotency_key"]').value, '')
  assert.match(state.fields.get('[data-form-status]').textContent, /Request received: LEAD-0123456789ABCDEF/)
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
