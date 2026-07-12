import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handleApprovals } from './approvals.mjs'

const KEY = 'ops-secret'
const headers = { 'x-ops-key': KEY, 'x-operator-id': 'Swan' }

test('approval API is fail-closed and exposes only explicit commands', async () => {
  assert.equal((await handleApprovals({ method: 'GET', headers }, { env: {} })).status, 503)
  assert.equal((await handleApprovals({ method: 'GET', headers: {} }, { opsKey: KEY })).status, 401)
  assert.equal((await handleApprovals({ method: 'DELETE', headers }, { opsKey: KEY })).status, 405)
  const unknown = await handleApprovals({ method: 'POST', headers, body: { command: 'pay' } }, { opsKey: KEY })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.json.reason, 'approval_unknown_command')
})

test('approval API maps list, approve, execute uncertainty, and actor identity', async () => {
  const listed = await handleApprovals({ method: 'GET', headers, query: { status: 'draft' } }, {
    opsKey: KEY,
    listActionApprovals: async (input) => ({ ok: true, approvals: [{ id: 'a1', status: input.status }] }),
  })
  assert.equal(listed.status, 200)
  assert.equal(listed.json.approvals[0].status, 'draft')

  let approvedInput
  const approved = await handleApprovals({ method: 'POST', headers, body: { command: 'approve', id: 'a1', payloadHash: 'hash' } }, {
    opsKey: KEY,
    approveAction: async (input) => { approvedInput = input; return { ok: true, approval: { id: input.id, status: 'approved' } } },
  })
  assert.equal(approved.status, 200)
  assert.equal(approvedInput.actor, 'Swan')

  const uncertain = await handleApprovals({ method: 'POST', headers, body: { command: 'execute', id: 'a1', payloadHash: 'hash' } }, {
    opsKey: KEY,
    executeAction: async () => ({ ok: false, reason: 'approval_execution_uncertain' }),
  })
  assert.equal(uncertain.status, 202)

  const recovery = await handleApprovals({ method: 'POST', headers, body: { command: 'recover', id: 'a1' } }, {
    opsKey: KEY,
    recoverAction: async () => ({ ok: false, reason: 'approval_recovery_inconclusive' }),
  })
  assert.equal(recovery.status, 202)
})
