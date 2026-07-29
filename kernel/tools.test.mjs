// AI Operator tool-belt — the safety boundary: only allow-listed read-only tools run. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOOLS, availableTools, companyOperationsStatusView, platformStatusView, runTool } from './tools.mjs'

test('the tool-belt exposes NO money/send/write capability', () => {
  const names = Object.keys(TOOLS)
  assert.ok(names.includes('platform_status'))
  assert.ok(names.includes('company_operations_status'))
  // None of the tools may be a payment/send/write action — the draft→approve gate stays on those.
  for (const n of names) assert.equal(/pay|charge|send|email|sms|post|delete|write|create|refund/i.test(n), false, `tool ${n} must be read-only`)
})

test('availableTools returns a catalog with input schemas', () => {
  const t = availableTools()
  assert.ok(Array.isArray(t) && t.length >= 1)
  for (const tool of t) { assert.ok(tool.name && tool.description && tool.input_schema) }
})

test('external operator connectors are exposed only as bounded read tools', () => {
  for (const name of ['settled_transactions_read', 'crm_deals_read', 'work_tasks_read', 'owner_updates_read']) {
    assert.ok(TOOLS[name], `${name} must be in the crew tool-belt`)
    assert.match(TOOLS[name].description, /Read|read/)
    assert.match(TOOLS[name].description, /Read-only/)
    assert.equal(TOOLS[name].input_schema.additionalProperties, false)
  }
})

test('optional connector availability stays credential-bound without loading provider code', () => {
  const names = [
    'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN',
    'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET',
    'PIPEDRIVE_ACCESS_TOKEN', 'PIPEDRIVE_API_TOKEN',
    'CLICKUP_ACCESS_TOKEN', 'CLICKUP_API_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID',
    'WORKCELL_OWNER_EVIDENCE_ENABLED', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  ]
  const original = new Map(names.map((name) => [name, process.env[name]]))
  try {
    for (const name of names) delete process.env[name]
    for (const tool of ['gmail_count', 'sheets_read', 'settled_transactions_read', 'crm_deals_read', 'work_tasks_read', 'owner_updates_read']) {
      assert.equal(TOOLS[tool].available(), false, `${tool} must stay hidden without credentials`)
    }
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'refresh'
    process.env.PAYPAL_CLIENT_ID = 'client'
    process.env.PAYPAL_CLIENT_SECRET = 'secret'
    process.env.PIPEDRIVE_ACCESS_TOKEN = 'token'
    process.env.CLICKUP_ACCESS_TOKEN = 'token'
    process.env.TELEGRAM_BOT_TOKEN = 'token'
    process.env.TELEGRAM_ALERT_CHAT_ID = '123456'
    for (const tool of ['gmail_count', 'sheets_read', 'settled_transactions_read', 'crm_deals_read', 'work_tasks_read', 'owner_updates_read']) {
      assert.equal(TOOLS[tool].available(), true, `${tool} must appear with its exact credential shape`)
    }
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('runTool executes an allow-listed local tool', async () => {
  const r = await runTool('platform_status', {})
  assert.equal(r.ok, true)
  assert.equal(r.data.contract, 'supermega.platform-status.v1')
  assert.ok(['ready', 'attention'].includes(r.data.status))
  assert.ok(r.data.connectors.total > 0 && r.data.connectors.configured >= 0 && r.data.connectors.byCategory)
  assert.ok(['memory', 'postgres', 'supabase', 'unavailable'].includes(r.data.persistence.mode))
  assert.equal(r.data.persistence.durable, r.data.persistence.ready && r.data.persistence.mode !== 'memory' && r.data.persistence.mode !== 'unavailable')
  assert.equal(r.data.agentCompany.dynamicDelegation, false)
  assert.equal(r.data.agentCompany.recursiveDelegation, false)
  assert.equal(r.data.agentCompany.modelRequest, false)
  assert.ok(r.data.agentCompany.maxAgents <= 2)
  assert.ok(r.data.agentCompany.maxRoleBudget > 0)
  assert.ok(r.data.ai.configuredProviders >= 0)
  assert.ok(r.data.paymentAdapters.configured <= r.data.paymentAdapters.total)
  assert.ok(['local', 'development', 'preview', 'production', 'unknown'].includes(r.data.release.environment))
  assert.equal(r.data.release.immutableCommit, r.data.release.commit !== null)
  assert.doesNotMatch(JSON.stringify(r.data), /tenant|prompt|output|providerError|reservationId|secret|token/i)
})

test('platform status is exact, metadata-only, and fails malformed readiness closed', () => {
  const ready = platformStatusView({
    ok: true,
    db: { ok: true, mode: 'supabase', detail: 'postgres://must-not-escape' },
    connectors: { total: 69, configured: 4, registrationErrors: 0, byCategory: { data: 10, ai: 4 } },
    ai: { providers: ['provider-one', 'provider-two'], failover: true },
    agentCompany: { plannerReady: true, maxAgents: 2, maxRoleBudget: 8 },
    money: { first: true, second: false },
    tenant: 'must-not-escape',
    prompt: 'must-not-escape',
  })
  assert.equal(ready.status, 'ready')
  assert.deepEqual(ready.persistence, { ready: true, mode: 'supabase', durable: true })
  assert.deepEqual(ready.ai, { configuredProviders: 2, failoverReady: true })
  assert.deepEqual(ready.paymentAdapters, { configured: 1, total: 2 })
  assert.equal(ready.agentCompany.externalWrites, false)
  assert.doesNotMatch(JSON.stringify(ready), /must-not-escape|provider-one|provider-two/i)

  const malformed = platformStatusView({
    ok: true,
    db: { ok: true, mode: 'other' },
    connectors: { total: -1, configured: 'many', registrationErrors: -1, byCategory: null },
    ai: { providers: 'configured', failover: true },
    agentCompany: { plannerReady: false, maxAgents: 175, maxRoleBudget: 'large' },
    money: null,
  })
  assert.equal(malformed.status, 'attention')
  assert.deepEqual(malformed.persistence, { ready: true, mode: 'unavailable', durable: false })
  assert.deepEqual(malformed.connectors, { total: 0, configured: 0, registrationErrors: 0, byCategory: {} })
  assert.deepEqual(malformed.ai, { configuredProviders: 0, failoverReady: false })
  assert.equal(malformed.agentCompany.maxAgents, 0)
  assert.equal(malformed.agentCompany.maxRoleBudget, 0)
  assert.equal(malformed.agentCompany.externalWrites, null)
})

test('company operations status exposes measured control metadata and strips work identities and output', () => {
  const report = {
    ok: true,
    mode: 'operations_report',
    clientId: 'must-not-escape-client',
    generatedAt: '2026-07-28T12:00:00.000Z',
    windowDays: 30,
    readiness: 'meeting_targets',
    counts: { total: 5, planned: 0, running: 0, cancelled: 0, terminal: 5, completed: 5, partial: 0, blocked: 0, failed: 0, evaluated: 5, accepted: 5, revisionRequired: 0, missingEvaluation: 0 },
    attention: { overduePlanned: 0, overdueRunning: 0, failedOrBlocked: 0, revisionRequired: 0, missingEvaluation: 0, deliveryFailed: 0, deliveryUncertain: 0, deliveryMissing: 0 },
    targets: Array.from({ length: 8 }, (_, index) => ({ id: `private-target-${index}`, state: 'met' })),
    workforce: { availableAgents: 12, utilizedAgents: 2, dormantAgents: 12, totalAssignments: 5, activeAssignments: 0, queuedAssignments: 0, runningAssignments: 0, usedRoleCalls: 15, modelCalls: 3, cacheHits: 2, weightedTotalUnits: 1200, agents: [{ agentId: 'must-not-escape-agent' }] },
    outcomes: {
      available: true,
      durable: true,
      state: 'measured',
      counts: { completed: 5, evaluated: 5, accepted: 5, revisionRequired: 0 },
      efficiency: { available: true, acceptedOutcomesPer1000WorkUnits: 4.166667 },
      delivery: {
        available: true,
        durable: true,
        state: 'ready',
        counts: { completed: 5, recorded: 5, sent: 5, failed: 0, uncertain: 0, missing: 0 },
        records: [{ deliveryId: 'must-not-escape-delivery', briefText: 'must-not-escape-delivery-output' }],
      },
      actions: {
        available: true,
        durable: true,
        state: 'ready',
        counts: { accepted: 5, proposed: 5, missing: 0 },
        items: [{ actionId: 'must-not-escape-action', title: 'must-not-escape-action-content' }],
      },
      records: [{ briefText: 'must-not-escape-output' }],
    },
    coverage: { directCyclesExcluded: true },
    exposure: { rawEvidenceReturned: false, modelOutputReturned: false, specialistOutputReturned: false, providerRowsReturned: false, ceoDeliveryContentReturned: false },
    provider: 'must-not-escape-provider',
  }
  const ready = companyOperationsStatusView(report, 30)
  assert.equal(ready.contract, 'supermega.company-operations-status.v1')
  assert.equal(ready.status, 'ready')
  assert.deepEqual(ready.targets, { met: 8, atRisk: 0, collecting: 0 })
  assert.equal(ready.workforce.availableAgents, 12)
  assert.equal(ready.workforce.utilizedAgents, 2)
  assert.equal(ready.outcomes.efficiencyAvailable, true)
  assert.equal(ready.delivery.state, 'ready')
  assert.equal(ready.delivery.sent, 5)
  assert.deepEqual(ready.actions, { available: true, durable: true, state: 'ready', accepted: 5, proposed: 5, missing: 0 })
  assert.equal(ready.attention.deliveryFailed, 0)
  assert.deepEqual(ready.attentionQueue, { state: 'clear', requiredActions: 0, signals: 0 })
  assert.equal(ready.workforce.dormantAgents, 12)
  assert.equal(ready.controls.metadataOnly, true)
  assert.equal(ready.controls.ceoActionContentReturned, false)
  assert.doesNotMatch(JSON.stringify(ready), /must-not-escape|"clientId"|"agentId"|"briefText"|"deliveryId"|"actionId"/i)

  for (const [state, counts] of [
    ['attention', { completed: 5, recorded: 5, sent: 4, failed: 1, uncertain: 0, missing: 0 }],
    ['attention', { completed: 5, recorded: 5, sent: 4, failed: 0, uncertain: 1, missing: 0 }],
    ['missing', { completed: 5, recorded: 4, sent: 4, failed: 0, uncertain: 0, missing: 1 }],
  ]) {
    const deliveryAttention = companyOperationsStatusView({
      ...report,
      attention: {
        ...report.attention,
        deliveryFailed: counts.failed,
        deliveryUncertain: counts.uncertain,
        deliveryMissing: counts.missing,
      },
      outcomes: { ...report.outcomes, delivery: { ...report.outcomes.delivery, state, counts } },
    }, 30)
    assert.equal(deliveryAttention.status, 'attention')
    assert.equal(deliveryAttention.delivery.state, state)
  }

  const nonDurableDelivery = companyOperationsStatusView({
    ...report,
    outcomes: { ...report.outcomes, delivery: { ...report.outcomes.delivery, durable: false, state: 'non_durable' } },
  }, 30)
  assert.equal(nonDurableDelivery.status, 'attention')
  assert.equal(nonDurableDelivery.delivery.durable, false)

  const missingAction = companyOperationsStatusView({
    ...report,
    outcomes: { ...report.outcomes, actions: { ...report.outcomes.actions, state: 'missing', counts: { accepted: 5, proposed: 4, missing: 1 } } },
  }, 30)
  assert.equal(missingAction.status, 'attention')
  assert.equal(missingAction.actions.missing, 1)

  const malformed = companyOperationsStatusView({
    ...report,
    generatedAt: 'not-a-date',
    workforce: { ...report.workforce, availableAgents: 175, utilizedAgents: 175 },
    exposure: { ...report.exposure, rawEvidenceReturned: true },
  }, 30)
  assert.equal(malformed.status, 'attention')
  assert.equal(malformed.generatedAt, null)
  assert.equal(malformed.workforce.availableAgents, 0)
  assert.equal(malformed.workforce.utilizedAgents, 0)
  assert.equal(malformed.controls.metadataOnly, false)

  const inconsistent = companyOperationsStatusView({
    ...report,
    counts: { ...report.counts, accepted: 6 },
    attention: { ...report.attention, failedOrBlocked: -1 },
  }, 30)
  assert.equal(inconsistent.status, 'attention')
  assert.equal(inconsistent.attention.failedOrBlocked, 0)

  const unavailable = companyOperationsStatusView({ ok: false, clientId: 'must-not-escape' }, 90)
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.windowDays, 90)
  assert.equal(unavailable.workforce.availableAgents, 12)
  assert.doesNotMatch(JSON.stringify(unavailable), /must-not-escape|"clientId"|"agentId"|"briefText"/i)
})

test('runTool rejects an unknown tool (no arbitrary execution)', async () => {
  const r = await runTool('rm_rf_everything', { x: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'unknown_tool')
})

test('runTool never throws — a failing tool returns a structured error', async () => {
  // web_get is available but a blocked/garbage URL must come back as ok:false, not throw.
  const r = await runTool('web_get', { url: 'https://127.0.0.1/secret' })
  assert.equal(r.ok, true) // run() returns the tool's structured result...
  assert.equal(r.data.ok, false) // ...and the SSRF guard blocked it
})

test('store-backed read tools run (leads + pipeline overview)', async () => {
  const a = await runTool('leads_overview', { limit: 3 })
  assert.equal(a.ok, true)
  assert.ok('total' in a.data && a.data.byStage)
  const b = await runTool('pipeline_overview', {})
  assert.equal(b.ok, true)
  assert.ok('projects' in b.data && 'deals' in b.data)
})
