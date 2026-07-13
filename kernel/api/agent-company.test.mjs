import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleAgentCompany } from './agent-company.mjs'

const KEY = 'ops-secret'
const validBody = {
  action: 'plan',
  clientId: 'client-acme',
  cycleId: 'morning-1',
  agents: ['operations-analyst'],
  evidence: { 'operations-analyst': { revenue_mmk: 300000 } },
  roleBudget: 3,
}
const request = (patch = {}) => ({
  method: 'POST',
  headers: { 'x-ops-key': KEY },
  body: validBody,
  ...patch,
})

test('Agent Company API is ops-gated and method-restricted', async () => {
  assert.equal((await handleAgentCompany(request(), { env: {} })).status, 503)
  assert.equal((await handleAgentCompany(request({ headers: {} }), { opsKey: KEY })).status, 401)
  assert.equal((await handleAgentCompany(request({ method: 'PUT' }), { opsKey: KEY })).status, 405)
})

test('GET returns the protected fixed roster and hard limits', async () => {
  const result = await handleAgentCompany(request({ method: 'GET', body: undefined }), { opsKey: KEY })
  assert.equal(result.status, 200)
  assert.equal(result.json.actionMode, 'draft_only')
  assert.equal(result.json.agents.length, 5)
  assert.equal(result.json.limits.maxAgents, 2)
  assert.equal(result.json.limits.maxRoleBudget, 8)
})

test('POST plans without claiming a run or accepting an implicit action', async () => {
  let runs = 0
  const result = await handleAgentCompany(request(), {
    opsKey: KEY,
    runCompanyCycle: async () => { runs += 1; return { ok: true } },
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.mode, 'plan')
  assert.equal(result.json.budget.plannedRoles, 3)
  assert.equal(runs, 0)
  assert.equal((await handleAgentCompany(request({ body: { ...validBody, action: '' } }), { opsKey: KEY })).status, 400)
})

test('isolated deployments reject a different client id', async () => {
  const result = await handleAgentCompany(request(), { opsKey: KEY, clientId: 'client-other' })
  assert.equal(result.status, 403)
  assert.equal(result.json.reason, 'company_client_mismatch')
})

test('POST run maps duplicate and unavailable durable claims cleanly', async () => {
  const duplicate = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_cycle_already_claimed', status: 'duplicate' }),
  })
  assert.equal(duplicate.status, 409)
  const blocked = await handleAgentCompany(request({ body: { ...validBody, action: 'run' } }), {
    opsKey: KEY,
    runCompanyCycle: async () => ({ ok: false, reason: 'company_durable_claim_required', status: 'blocked' }),
  })
  assert.equal(blocked.status, 503)
})

test('API runtime has no connector, approval execution, or process-launch path', async () => {
  const source = await readFile(new URL('./agent-company.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /approval-actions|connectors|child_process|execFile|spawn/)
})
