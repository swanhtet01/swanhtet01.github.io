// Proves the retired public API contract on the BUILT artifact: every request to a
// retired ops endpoint (for example /api/pipeline-control/status) answers
// 404 {"status":"not_found"} — anonymous or credentialed. The legacy ops-key 401
// contract was deliberately retired with the public-site consolidation (f8c5299e);
// this test pins the replacement behavior so the old expectation cannot resurface.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const handler = require(resolve('.vercel', 'output', 'functions', 'api', 'not-found.js.func', 'index.js'))

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    payload: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value)
    },
    end(value = '') {
      this.payload = String(value)
    },
  }
}

function invoke({ method = 'GET', url = '/api/pipeline-control/status', headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { host: 'supermega.dev', accept: 'application/json', ...headers },
  }
  const res = responseRecorder()
  handler(req, res)
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.payload || '{}') }
}

let checks = 0
function expectRetired(result) {
  assert.equal(result.status, 404)
  assert.deepEqual(result.body, { status: 'not_found' })
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(result.headers['cache-control'], 'no-store')
  checks += 4
}

// Anonymous request: 404 not_found — NOT the retired 401 ops-key contract.
expectRetired(invoke())

// Credentialed attempts get the identical retirement response. The endpoint has no
// auth surface any more, so no credential may change the status, body, or headers.
expectRetired(invoke({ headers: { authorization: 'Bearer some-ops-key' } }))
expectRetired(invoke({ headers: { 'x-ops-key': 'some-ops-key' } }))
expectRetired(invoke({ method: 'POST', headers: { authorization: 'Bearer some-ops-key' } }))

// Every other retired legacy endpoint shares the same single contract.
for (const url of [
  '/api/pipeline-control',
  '/api/commercial-control/status',
  '/api/checkout-start',
  '/api/product-activation',
  '/api/sales-daily',
  '/api/behavior-events',
  '/api/campaign-clicks',
  '/api/public-app-handoff',
]) expectRetired(invoke({ url }))

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_retired_api_behavior', checks }, null, 2))
