import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateSchedulerExecutionBudget } from './scheduler_authority_contract.mjs'

const authority = JSON.parse(await readFile(new URL('./supermega_scheduler_authority.json', import.meta.url), 'utf8'))
const copy = () => structuredClone(authority)

test('dormant scheduler authority has one claim per activation invocation', () => {
  const result = validateSchedulerExecutionBudget(copy())
  assert.equal(result.contract, 'supermega.scheduler-execution-budget.v1')
  assert.equal(result.activeCronCount, 0)
  assert.equal(result.activationCronCount, 2)
  assert.equal(result.maxClaimsPerInvocation, 1)
  assert.equal(result.maximumActivationInvocationsPerDay, 25)
})

test('scheduler budget rejects active, wider, or higher-frequency authority', () => {
  const cases = [
    (value) => { value.crons = [{ path: '/api/cron/supermega/daily', schedule: '45 0 * * *' }] },
    (value) => { value.activation_plan.crons[0].max_claims_per_invocation = 2 },
    (value) => { value.activation_plan.crons[0].job_types.push('founder_brief') },
    (value) => { value.activation_plan.crons[1].schedule = '*/5 * * * *' },
    (value) => { value.activation_plan.crons.push(structuredClone(value.activation_plan.crons[1])) },
    (value) => { value.activation_plan.maximum_scheduler_invocations_per_day = 26 },
  ]
  for (const mutate of cases) {
    const candidate = copy()
    mutate(candidate)
    assert.throws(() => validateSchedulerExecutionBudget(candidate), /scheduler_execution_budget_/)
  }
})
