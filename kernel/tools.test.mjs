// AI Operator tool-belt — the safety boundary: only allow-listed read-only tools run. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOOLS, availableTools, runTool } from './tools.mjs'

test('the tool-belt exposes NO money/send/write capability', () => {
  const names = Object.keys(TOOLS)
  assert.ok(names.includes('platform_status'))
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

test('runTool executes an allow-listed local tool', async () => {
  const r = await runTool('platform_status', {})
  assert.equal(r.ok, true)
  assert.ok(r.data.total > 0 && 'configured' in r.data && r.data.byCategory)
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
