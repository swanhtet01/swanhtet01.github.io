import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const handler = require('../api/shop/menu-import.js')
const jpegFixture = Buffer.alloc(64, 7)
jpegFixture.set([0xff, 0xd8, 0xff])
const imageDataUrl = `data:image/jpeg;base64,${jpegFixture.toString('base64')}`
const baseEnv = {
  SHOP_MENU_AI_ENABLED: 'true',
  SHOP_MENU_AI_ALLOWED_USER_IDS: 'user-1',
  SUPERMEGA_SUPABASE_URL: 'https://example.supabase.co',
  SUPERMEGA_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  OPENAI_API_KEY: 'test-only-not-a-real-key',
}

function responseCapture() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    end(body) { this.body = JSON.parse(body) },
  }
}

function req(body = {}, headers = {}, method = 'POST') {
  return { method, body, headers }
}

function userFetch(user = { id: 'user-1' }) {
  return async (url, options) => {
    assert.equal(String(url), 'https://example.supabase.co/auth/v1/user')
    assert.equal(options.headers.authorization, 'Bearer test-token')
    return { ok: true, status: 200, json: async () => user }
  }
}

test('rejects non-POST methods at the Node route before auth or provider access', async () => {
  let calls = 0
  const res = responseCapture()
  await handler(req({}, {}, 'GET'), res, { env: baseEnv, fetch: async () => { calls++ } })
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')
  assert.equal(res.body.error, 'method_not_allowed')
  assert.equal(calls, 0)
})

test('menu import is disabled unless an operator explicitly enables the feature', async () => {
  assert.equal(typeof handler, 'function', 'Vercel needs the CommonJS module itself to be the request handler')
  let calls = 0
  const res = responseCapture()
  await handler(req({ cloudConsent: true, imageDataUrl }, { authorization: 'Bearer test-token' }), res, {
    env: { ...baseEnv, SHOP_MENU_AI_ENABLED: 'false' }, fetch: async () => { calls++ },
  })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.error, 'menu_import_not_enabled')
  assert.equal(calls, 0)
})

test('requires explicit cloud consent and a bounded supported image', async () => {
  const noConsent = responseCapture()
  await handler(req({ imageDataUrl }, { authorization: 'Bearer test-token' }), noConsent, { env: baseEnv, fetch: userFetch() })
  assert.equal(noConsent.statusCode, 400)
  const oversized = responseCapture()
  const huge = `data:image/jpeg;base64,${Buffer.alloc(2_400_001).toString('base64')}`
  await handler(req({ cloudConsent: true, imageDataUrl: huge }, { authorization: 'Bearer test-token' }), oversized, { env: baseEnv, fetch: userFetch() })
  assert.equal(oversized.statusCode, 413)
})

test('rejects a declared image type that does not match the file signature', () => {
  const pngFixture = Buffer.alloc(64, 7)
  pngFixture.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = `data:image/png;base64,${pngFixture.toString('base64')}`
  assert.equal(handler.getImage(png)?.mimeType, 'image/png')
  assert.equal(handler.getImage(png.replace('image/png', 'image/jpeg')), null)
  assert.equal(handler.getImage(`data:image/webp;base64,${jpegFixture.toString('base64')}`), null)
})

test('requires a verified Supabase user on the explicit pilot allowlist', async () => {
  const unauthenticated = responseCapture()
  await handler(req({ cloudConsent: true, imageDataUrl }), unauthenticated, { env: baseEnv, fetch: userFetch() })
  assert.equal(unauthenticated.statusCode, 401)
  const notAllowed = responseCapture()
  await handler(req({ cloudConsent: true, imageDataUrl }, { authorization: 'Bearer test-token' }), notAllowed, {
    env: { ...baseEnv, SHOP_MENU_AI_ALLOWED_USER_IDS: 'other-user' }, fetch: userFetch(),
  })
  assert.equal(notAllowed.statusCode, 403)
})

test('sends only a consented image to OpenAI and returns a reviewed four-field draft', async () => {
  let openAiRequest
  const fetch = async (url, options) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: 'user-1' }) }
    assert.equal(url, 'https://api.openai.com/v1/responses')
    openAiRequest = JSON.parse(options.body)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ items: [
          { category: 'Drinks', name: 'ရေသန့်', price: 800, description: '' },
          { category: 'Food', name: 'Tea', price: null, description: 'Milk tea' },
        ] }) }] }],
      }),
    }
  }
  const res = responseCapture()
  await handler(req({ cloudConsent: true, imageDataUrl }, { authorization: 'Bearer test-token' }), res, { env: baseEnv, fetch })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.schemaVersion, 1)
  assert.equal(res.body.reviewRequired, true)
  assert.equal(res.body.items.length, 2)
  assert.equal(res.body.items[0].name, 'ရေသန့်')
  assert.equal(res.body.items[1].price, null)
  assert.equal(openAiRequest.model, 'gpt-4o')
  assert.equal(openAiRequest.store, false)
  assert.equal(openAiRequest.text.format.strict, true)
  assert.equal(openAiRequest.input[0].content[1].image_url, imageDataUrl)
  assert.equal(openAiRequest.input[0].content[0].type, 'input_text')
})

test('keeps the model and response shape in the shared native-client contract', async () => {
  const contract = JSON.parse(await readFile(new URL('../shared/contracts/shop-menu-import.v1.json', import.meta.url), 'utf8'))
  const endpointSource = await readFile(new URL('../api/shop/menu-import.js', import.meta.url), 'utf8')
  assert.equal(contract.schemaVersion, 1)
  assert.deepEqual(contract.modelOutputSchema.required, ['items'])
  assert.equal(contract.modelOutputSchema.additionalProperties, false)
  assert.deepEqual(contract.modelOutputSchema.properties.items.items.required, ['category', 'description', 'name', 'price'])
  assert.deepEqual(contract.modelOutputSchema.properties.items.items.properties.price.type, ['integer', 'null'])
  assert.equal(contract.responseSchema.properties.reviewRequired.const, true)
  assert.match(endpointSource, /menuImportContract\.modelOutputSchema/)
  assert.match(endpointSource, /schemaVersion: menuImportContract\.schemaVersion/)
})

test('rejects malformed model output and never returns provider text', async () => {
  const fetch = async (url) => String(url).includes('/auth/v1/user')
    ? { ok: true, status: 200, json: async () => ({ id: 'user-1' }) }
    : { ok: true, status: 200, json: async () => ({ status: 'completed', output_text: '{bad json' }) }
  const res = responseCapture()
  await handler(req({ cloudConsent: true, imageDataUrl }, { authorization: 'Bearer test-token' }), res, { env: baseEnv, fetch })
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'menu_import_invalid_response')
})

test('keeps the exact Node function route ahead of the Python API catch-all', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const exact = vercel.routes.findIndex((row) => row.src === '/api/shop/menu-import')
  const catchAll = vercel.routes.findIndex((row) => row.src === '/api/(.*)')
  assert.ok(exact >= 0 && exact < catchAll)
  assert.equal(vercel.routes[exact].dest, '/api/shop/menu-import.js')
  assert.equal(vercel.routes[exact].methods, undefined, 'all methods must reach the Node handler so it can return 405 safely')
  assert.equal(vercel.functions['api/shop/menu-import.js'].maxDuration, 60)
})
