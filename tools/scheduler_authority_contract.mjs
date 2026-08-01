export const SCHEDULER_EXECUTION_BUDGET_CONTRACT = 'supermega.scheduler-execution-budget.v1'

const EXPECTED_ACTIVATION_CRONS = Object.freeze([
  Object.freeze({
    id: 'agent-queue',
    path: '/api/cron/supermega/agent-queue',
    schedule: '5 * * * *',
    job_types: Object.freeze(['task_triage', 'ops_watch']),
    max_claims_per_invocation: 1,
    maximum_invocations_per_day: 24,
  }),
  Object.freeze({
    id: 'daily',
    path: '/api/cron/supermega/daily',
    schedule: '45 0 * * *',
    job_types: Object.freeze(['founder_brief', 'github_release_watch']),
    max_claims_per_invocation: 1,
    maximum_invocations_per_day: 1,
  }),
])

function fail(reason) {
  throw new Error(reason)
}

export function validateSchedulerExecutionBudget(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) fail('scheduler_execution_budget_invalid')
  if (authority.contract !== 'supermega.scheduler-authority.v2'
    || authority.activation?.state !== 'dormant'
    || JSON.stringify(authority.crons) !== '[]'
    || authority.maximum_scheduler_invocations_per_day !== 0) {
    fail('scheduler_execution_budget_dormant_state_invalid')
  }
  if (JSON.stringify(authority.activation_plan?.crons) !== JSON.stringify(EXPECTED_ACTIVATION_CRONS)) {
    fail('scheduler_execution_budget_activation_plan_invalid')
  }
  const activationInvocations = EXPECTED_ACTIVATION_CRONS.reduce((total, cron) => total + cron.maximum_invocations_per_day, 0)
  if (authority.activation_plan?.maximum_scheduler_invocations_per_day !== activationInvocations) {
    fail('scheduler_execution_budget_daily_limit_invalid')
  }
  return {
    contract: SCHEDULER_EXECUTION_BUDGET_CONTRACT,
    activeCronCount: 0,
    activationCronCount: EXPECTED_ACTIVATION_CRONS.length,
    maxClaimsPerInvocation: 1,
    maximumActivationInvocationsPerDay: activationInvocations,
    activationCrons: EXPECTED_ACTIVATION_CRONS.map(({ path, schedule }) => ({ path, schedule })),
  }
}
