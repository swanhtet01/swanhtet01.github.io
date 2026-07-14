import { test } from 'node:test'
import assert from 'node:assert/strict'

import { listCompanyAgents, MAX_CYCLE_ROLE_BUDGET } from './agent-company.mjs'
import { COMPANY_PLAYBOOKS, listCompanyPlaybooks, planCompanyPlaybook } from './agent-company-playbooks.mjs'

test('company playbooks are fixed sellable outcomes backed by the registered roster', () => {
  const roster = new Set(listCompanyAgents().map((agent) => agent.id))
  const catalog = listCompanyPlaybooks()
  assert.equal(catalog.length, 8)
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length)
  assert.equal(COMPANY_PLAYBOOKS.every((item) => item.stages.length >= 3 && item.stages.length <= 4), true)
  for (const item of catalog) {
    assert.equal(item.buyerOutcome.length > 30, true)
    assert.equal(item.deliverable.length > 30, true)
    assert.equal(item.agents.every((agentId) => roster.has(agentId)), true, `${item.id} uses only fixed agents`)
  }
})

test('playbook planner produces deterministic staged handoffs without execution authority', async () => {
  const input = { clientId: 'client-acme', missionId: 'lead-proof-1', playbookId: 'lead-to-first-proof' }
  const first = await planCompanyPlaybook(input)
  const second = await planCompanyPlaybook(input)
  assert.equal(first.ok, true)
  assert.equal(first.mode, 'playbook_plan')
  assert.equal(first.actionMode, 'plan_only')
  assert.equal(first.durableMissionCreated, false)
  assert.equal(first.approvalRequired, true)
  assert.equal(first.planHash, second.planHash)
  assert.equal(first.planHash.length, 64)
  assert.deepEqual(first.stages.map((item) => item.agentId), [
    'sales-qualifier',
    'delivery-planner',
    'proof-builder',
    'quality-reviewer',
  ])
  assert.deepEqual(first.stages.map((item) => item.cycleId), [
    'lead-proof-1:s1',
    'lead-proof-1:s2',
    'lead-proof-1:s3',
    'lead-proof-1:s4',
  ])
  assert.equal(first.stages[0].handoffFrom, null)
  assert.equal(first.stages[1].handoffFrom.requiredEvaluation, 'accepted')
  assert.equal(first.stages[1].handoffFrom.transfer, 'owner_reviewed_redacted_output_only')
  assert.equal(first.stages.every((item) => item.roleBudget <= MAX_CYCLE_ROLE_BUDGET), true)
  assert.equal(first.controls.execution, 'operator_staged')
  assert.equal(first.controls.automaticQueue, false)
  assert.equal(first.controls.automaticDispatch, false)
  assert.equal(first.controls.dynamicDelegation, false)
  assert.equal(first.controls.recursiveDelegation, false)
  assert.equal(first.controls.crossStageContext, false)
  assert.equal(first.controls.externalWrites, false)
})

test('new general-use workers are packaged into bounded delegation playbooks', async () => {
  const cases = [
    ['documents-to-system', 'document-processor'],
    ['meeting-to-delivery', 'meeting-actions-coordinator'],
    ['quote-to-decision', 'procurement-analyst'],
  ]
  for (const [playbookId, firstAgent] of cases) {
    const plan = await planCompanyPlaybook({ clientId: 'client-acme', missionId: playbookId, playbookId })
    assert.equal(plan.ok, true)
    assert.equal(plan.stages[0].agentId, firstAgent)
    assert.equal(plan.stages.every((item) => item.roleBudget === 3), true)
  }
})

test('playbook planner rejects invented work, unsafe fields, and invalid identities before crew loading', async () => {
  let crewReads = 0
  const options = { loadCrew: async () => { crewReads += 1; throw new Error('not expected') } }
  assert.equal((await planCompanyPlaybook(null, options)).reason, 'company_playbook_invalid_request')
  assert.equal((await planCompanyPlaybook({ clientId: 'bad id', missionId: 'm1', playbookId: 'cash-control' }, options)).reason, 'company_invalid_client_id')
  assert.equal((await planCompanyPlaybook({ clientId: 'client', missionId: 'x'.repeat(61), playbookId: 'cash-control' }, options)).reason, 'company_playbook_invalid_mission_id')
  assert.equal((await planCompanyPlaybook({ clientId: 'client', missionId: 'm1', playbookId: 'invented' }, options)).reason, 'company_playbook_unknown')
  assert.equal((await planCompanyPlaybook({ clientId: 'client', missionId: 'm1', playbookId: 'cash-control', dispatch: true }, options)).reason, 'company_playbook_unknown_field')
  assert.equal(crewReads, 0)
})
