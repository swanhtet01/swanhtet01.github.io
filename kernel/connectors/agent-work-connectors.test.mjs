import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  listTransactions,
  resetPayPalTokenCacheForTests,
} from './payment-paypal.mjs'
import { listDeals } from './crm-pipedrive.mjs'
import { listTasks } from './data-clickup.mjs'
import { TOOLS, runTool } from '../tools.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PIPEDRIVE_ACCESS_TOKEN',
  'PIPEDRIVE_API_TOKEN',
  'CLICKUP_ACCESS_TOKEN',
  'CLICKUP_API_TOKEN',
]
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  resetPayPalTokenCacheForTests()
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('PayPal validates the date window before network access', async () => {
  process.env.PAYPAL_CLIENT_ID = 'client'
  process.env.PAYPAL_CLIENT_SECRET = 'secret'
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return response(500, {}) }

  const invalid = await listTransactions({
    startDate: '2026-07-10T00:00:00Z',
    endDate: '2026-06-10T00:00:00Z',
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.reason, 'payment-paypal_invalid_date_order')
  assert.equal(calls, 0)
})

test('PayPal uses one cached OAuth token and bounded read-only reporting calls', async () => {
  process.env.PAYPAL_CLIENT_ID = 'client'
  process.env.PAYPAL_CLIENT_SECRET = 'secret'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/v1/oauth2/token')) {
      return response(200, { access_token: 'access-token', expires_in: 3_600 })
    }
    return response(200, {
      transaction_details: [{ transaction_info: { transaction_id: 'TX-1' } }],
      total_items: 1,
      total_pages: 1,
    })
  }

  const input = {
    startDate: '2026-07-01T00:00:00Z',
    endDate: '2026-07-02T00:00:00Z',
    pageSize: 9_999,
  }
  assert.equal((await listTransactions(input)).transactions.length, 1)
  assert.equal((await listTransactions(input)).ok, true)
  assert.equal(calls.filter((call) => call.url.endsWith('/v1/oauth2/token')).length, 1)
  assert.equal(calls.filter((call) => call.url.includes('/v1/reporting/transactions')).length, 2)

  const tokenCall = calls[0]
  assert.equal(tokenCall.options.method, 'POST')
  assert.equal(tokenCall.options.body, 'grant_type=client_credentials')
  assert.equal(tokenCall.options.headers.authorization, `Basic ${Buffer.from('client:secret').toString('base64')}`)
  const reportUrl = new URL(calls[1].url)
  assert.equal(reportUrl.hostname, 'api-m.paypal.com')
  assert.equal(reportUrl.searchParams.get('page_size'), '500')
  assert.equal(calls[1].options.headers.authorization, 'Bearer access-token')
})

test('PayPal error envelopes do not echo provider messages', async () => {
  process.env.PAYPAL_CLIENT_ID = 'client'
  process.env.PAYPAL_CLIENT_SECRET = 'secret'
  globalThis.fetch = async (url) => String(url).endsWith('/v1/oauth2/token')
    ? response(200, { access_token: 'access-token', expires_in: 3_600 })
    : response(401, { message: 'customer or credential detail', name: 'AUTHORIZATION_ERROR' })

  const result = await listTransactions({
    startDate: '2026-07-01T00:00:00Z',
    endDate: '2026-07-02T00:00:00Z',
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /^payment-paypal_http_401_AUTHORIZATION_ERROR$/)
  assert.doesNotMatch(result.reason, /customer|credential/i)
})

test('Pipedrive uses the current cursor-based v2 deals endpoint', async () => {
  process.env.PIPEDRIVE_API_TOKEN = 'private-api-token'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, {
      success: true,
      data: [{ id: 7, title: 'Regional rollout' }],
      additional_data: { next_cursor: 'next-page' },
    })
  }

  const result = await listDeals({ limit: 900, cursor: 'opaque cursor', status: 'open' })
  assert.equal(result.ok, true)
  assert.equal(result.deals.length, 1)
  assert.equal(result.nextCursor, 'next-page')
  const url = new URL(calls[0].url)
  assert.equal(url.origin + url.pathname, 'https://api.pipedrive.com/api/v2/deals')
  assert.equal(url.searchParams.get('limit'), '500')
  assert.equal(url.searchParams.get('cursor'), 'opaque cursor')
  assert.equal(url.searchParams.get('status'), 'open')
  assert.equal(url.searchParams.get('api_token'), 'private-api-token')
})

test('Pipedrive prefers OAuth and rejects invalid status without a request', async () => {
  process.env.PIPEDRIVE_ACCESS_TOKEN = 'oauth-token'
  process.env.PIPEDRIVE_API_TOKEN = 'fallback-token'
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls += 1
    const parsed = new URL(String(url))
    assert.equal(parsed.searchParams.has('api_token'), false)
    assert.equal(options.headers.authorization, 'Bearer oauth-token')
    return response(200, { success: true, data: [] })
  }
  assert.equal((await listDeals({ status: 'won' })).ok, true)
  assert.equal((await listDeals({ status: 'invented' })).reason, 'crm-pipedrive_invalid_status')
  assert.equal(calls, 1)
})

test('ClickUp rejects path-like list ids before network access', async () => {
  process.env.CLICKUP_API_TOKEN = 'pk_token'
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return response(500, {}) }
  const result = await listTasks({ listId: '../../etc/passwd' })
  assert.equal(result.reason, 'data-clickup_invalid_listId')
  assert.equal(calls, 0)
})

test('ClickUp reads one bounded page with the raw Authorization token', async () => {
  process.env.CLICKUP_ACCESS_TOKEN = 'oauth-or-personal-token'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { tasks: [{ id: 'task-1', name: 'Close books' }] })
  }
  const result = await listTasks({ listId: 12345, page: 2, includeClosed: true, subtasks: true })
  assert.equal(result.ok, true)
  assert.equal(result.tasks.length, 1)
  const url = new URL(calls[0].url)
  assert.equal(url.origin + url.pathname, 'https://api.clickup.com/api/v2/list/12345/task')
  assert.equal(url.searchParams.get('page'), '2')
  assert.equal(url.searchParams.get('include_closed'), 'true')
  assert.equal(url.searchParams.get('subtasks'), 'true')
  assert.equal(calls[0].options.headers.authorization, 'oauth-or-personal-token')
})

test('the durable registry exposes all three connectors without registration faults', async () => {
  const { list, registrationErrors } = await import('./index.mjs')
  const keys = new Set(list().map((connector) => connector.key))
  for (const key of ['payment-paypal', 'crm-pipedrive', 'data-clickup']) {
    assert.equal(keys.has(key), true, `${key} must be registered`)
  }
  assert.ok(list().length >= 69, 'the 66-connector fleet should grow by three')
  assert.equal(registrationErrors.length, 0)
})

test('crews receive bounded read tools rather than raw provider capabilities', async () => {
  for (const name of ['settled_transactions_read', 'crm_deals_read', 'work_tasks_read']) {
    assert.ok(TOOLS[name])
  }

  process.env.PIPEDRIVE_ACCESS_TOKEN = 'oauth-token'
  globalThis.fetch = async () => response(200, {
    success: true,
    data: [{
      id: 12,
      title: 'Buyer rollout',
      status: 'open',
      value: 9000,
      currency: 'USD',
      internal_secret: 'must not pass through',
    }],
    additional_data: { next_cursor: null },
  })
  const result = await runTool('crm_deals_read', { limit: 1, status: 'open' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data.deals, [{
    id: 12,
    title: 'Buyer rollout',
    status: 'open',
    value: 9000,
    currency: 'USD',
    expectedCloseDate: null,
    updatedAt: null,
  }])
  assert.doesNotMatch(JSON.stringify(result), /internal_secret|must not pass through/)
})

test('operator transaction and task tools strip unnecessary provider payload fields', async () => {
  process.env.PAYPAL_CLIENT_ID = 'client'
  process.env.PAYPAL_CLIENT_SECRET = 'secret'
  let paypalCalls = 0
  globalThis.fetch = async () => {
    paypalCalls += 1
    return paypalCalls === 1
      ? response(200, { access_token: 'access-token', expires_in: 3_600 })
      : response(200, {
          transaction_details: [{
            transaction_info: {
              transaction_id: 'TX-9',
              transaction_status: 'S',
              transaction_amount: { currency_code: 'USD', value: '20.00' },
              fee_amount: { currency_code: 'USD', value: '1.00' },
            },
            payer_info: { email_address: 'private@example.com' },
          }],
        })
  }
  const transactions = await runTool('settled_transactions_read', {
    start_date: '2026-07-01T00:00:00Z',
    end_date: '2026-07-02T00:00:00Z',
  })
  assert.equal(transactions.ok, true)
  assert.equal(transactions.data.transactions[0].net.value, 19)
  assert.doesNotMatch(JSON.stringify(transactions), /payer_info|private@example\.com/)

  delete process.env.PAYPAL_CLIENT_ID
  delete process.env.PAYPAL_CLIENT_SECRET
  process.env.CLICKUP_ACCESS_TOKEN = 'clickup-token'
  globalThis.fetch = async () => response(200, {
    tasks: [{
      id: 'task-9',
      name: 'Close books',
      status: { status: 'in progress', private: 'drop' },
      priority: { priority: 'high', private: 'drop' },
      custom_fields: [{ value: 'private customer data' }],
    }],
  })
  const tasks = await runTool('work_tasks_read', { list_id: '12345' })
  assert.equal(tasks.ok, true)
  assert.equal(tasks.data.tasks[0].status, 'in progress')
  assert.equal(tasks.data.tasks[0].priority, 'high')
  assert.doesNotMatch(JSON.stringify(tasks), /custom_fields|private customer data|"private"/)
})

test('provider read failures remain failed operator tool calls', async () => {
  process.env.CLICKUP_ACCESS_TOKEN = 'clickup-token'
  globalThis.fetch = async () => response(429, { ECODE: 'RATE_LIMITED' })

  const result = await runTool('work_tasks_read', { list_id: '12345' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'data-clickup_http_429_RATE_LIMITED')
})
