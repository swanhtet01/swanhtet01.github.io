import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CONTRACT = 'supermega.hq-live-state.v1'
const APP_ORIGIN = 'https://app.supermega.dev'
const PUBLIC_ORIGIN = 'https://supermega.dev'
const MAX_RESPONSE_BYTES = 65_536
const MAX_SNAPSHOT_AGE_MS = 72 * 60 * 60 * 1_000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000

function requireLine(text, label, pattern) {
  const match = text.match(pattern)
  if (!match) throw new Error(`hq_now_${label}_missing`)
  return match[1]
}

function parseBoolean(value, label) {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`hq_now_${label}_invalid`)
}

export function parseHqLiveState(text) {
  const contract = requireLine(text, 'contract', /^Live state contract: `([^`]+)`$/m)
  const releaseCommit = requireLine(text, 'release_commit', /^Live release commit: `([0-9a-f]{40})`$/m)
  const observedAt = requireLine(text, 'observed_at', /^Live state observed: `([^`]+)`$/m)
  const operatingMode = requireLine(text, 'operating_mode', /^Live operating mode: `([^`]+)`$/m)
  const schedulerStatus = requireLine(text, 'scheduler_status', /^Live scheduler status: `([^`]+)`$/m)
  const schedulerConfigured = parseBoolean(
    requireLine(text, 'scheduler_configured', /^Live scheduler configured: `(true|false)`$/m),
    'scheduler_configured',
  )
  const managedPersistenceReady = parseBoolean(
    requireLine(text, 'managed_persistence_ready', /^Live managed persistence ready: `(true|false)`$/m),
    'managed_persistence_ready',
  )
  const securityReady = parseBoolean(
    requireLine(text, 'security_ready', /^Live security ready: `(true|false)`$/m),
    'security_ready',
  )

  if (contract !== CONTRACT) throw new Error('hq_now_contract_invalid')
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('hq_now_observed_at_invalid')

  return {
    contract,
    releaseCommit,
    observedAt,
    operatingMode,
    schedulerStatus,
    schedulerConfigured,
    managedPersistenceReady,
    securityReady,
  }
}

function sameReleaseIdentity(left, right) {
  return ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']
    .every((field) => typeof left?.[field] === 'string' && left[field] === right?.[field])
}

export function assessHqLiveState({ hq, appRelease, publicRelease, health, cloud, now = new Date() }) {
  const failures = []
  const requireCheck = (name, condition) => { if (!condition) failures.push(name) }
  const observedAtMs = Date.parse(hq.observedAt)
  const ageMs = now.getTime() - observedAtMs
  const scheduler = cloud?.scheduler
  const capacity = cloud?.capacity

  requireCheck('app_release_contract_invalid', appRelease?.service === 'supermega-app')
  requireCheck('public_release_contract_invalid', publicRelease?.service === 'supermega-public-site')
  requireCheck('paired_release_identity_mismatch', sameReleaseIdentity(appRelease, publicRelease))
  requireCheck('hq_release_commit_stale', appRelease?.commit === hq.releaseCommit)
  requireCheck('app_canonical_domain_invalid', appRelease?.canonicalDomain === APP_ORIGIN)
  requireCheck('health_not_ready', health?.status === 'ready')
  requireCheck('operating_mode_drift', health?.operating_mode === hq.operatingMode)
  requireCheck('managed_persistence_readiness_drift', health?.enterprise_db_ready === hq.managedPersistenceReady)
  requireCheck('security_readiness_drift', health?.security_ready === hq.securityReady)
  requireCheck('scheduler_status_drift', cloud?.status === hq.schedulerStatus)
  requireCheck('scheduler_configuration_drift', scheduler?.configured === hq.schedulerConfigured)
  requireCheck('scheduler_pc_dependency_forbidden', cloud?.pc_dependency === false)
  requireCheck('scheduler_budget_grant_required', scheduler?.budget_grants_required === true)
  requireCheck('scheduler_batch_limit_exceeded', Number.isInteger(scheduler?.max_jobs_per_run) && scheduler.max_jobs_per_run <= 2)
  requireCheck('capacity_not_scale_to_zero', capacity?.scale_to_zero_when_idle === true)
  requireCheck('idle_execution_target_nonzero', capacity?.idle_active_execution_target === 0)
  requireCheck('registered_specialists_consume_compute', capacity?.registered_specialists_consume_compute === false)
  requireCheck('external_action_policy_drift', cloud?.execution_policy === 'review_gated_no_external_send_or_money_actions')
  requireCheck('snapshot_from_future', Number.isFinite(ageMs) && ageMs >= -MAX_FUTURE_SKEW_MS)
  requireCheck('snapshot_stale', Number.isFinite(ageMs) && ageMs <= MAX_SNAPSHOT_AGE_MS)

  return {
    ok: failures.length === 0,
    contract: CONTRACT,
    failures,
    snapshotAgeHours: Number.isFinite(ageMs) ? Math.max(0, Math.round((ageMs / 3_600_000) * 10) / 10) : null,
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`http_${response.status}`)
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('response_content_type_invalid')
  const announcedBytes = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(announcedBytes) && announcedBytes > MAX_RESPONSE_BYTES) throw new Error('response_too_large')
  if (!response.body) throw new Error('response_body_missing')

  const reader = response.body.getReader()
  const chunks = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('response_too_large')
    }
    chunks.push(Buffer.from(value))
  }
  const body = Buffer.concat(chunks, receivedBytes).toString('utf8')
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('response_json_invalid')
  }
}

function runSelfTest() {
  const commit = 'a'.repeat(40)
  const now = new Date('2026-07-27T12:00:00Z')
  const hq = parseHqLiveState(`Live state contract: \`${CONTRACT}\`
Live release commit: \`${commit}\`
Live state observed: \`2026-07-27T11:00:00Z\`
Live operating mode: \`isolated_demo\`
Live scheduler status: \`degraded\`
Live scheduler configured: \`false\`
Live managed persistence ready: \`false\`
Live security ready: \`false\``)
  const appRelease = { service: 'supermega-app', commit, brandVersion: 'jade-v2', contextVersion: 'ctx', catalogVersion: 'cat', canonicalDomain: APP_ORIGIN }
  const publicRelease = { service: 'supermega-public-site', commit, brandVersion: 'jade-v2', contextVersion: 'ctx', catalogVersion: 'cat' }
  const health = { status: 'ready', operating_mode: 'isolated_demo', enterprise_db_ready: false, security_ready: false }
  const cloud = {
    status: 'degraded',
    pc_dependency: false,
    scheduler: { configured: false, budget_grants_required: true, max_jobs_per_run: 2 },
    capacity: { scale_to_zero_when_idle: true, idle_active_execution_target: 0, registered_specialists_consume_compute: false },
    execution_policy: 'review_gated_no_external_send_or_money_actions',
  }
  const baseline = { hq, appRelease, publicRelease, health, cloud, now }
  if (!assessHqLiveState(baseline).ok) throw new Error('self_test_baseline_failed')

  const expectFailure = (name, input) => {
    if (!assessHqLiveState(input).failures.includes(name)) throw new Error(`self_test_${name}_failed`)
  }
  expectFailure('paired_release_identity_mismatch', { ...baseline, publicRelease: { ...publicRelease, commit: 'b'.repeat(40) } })
  expectFailure('hq_release_commit_stale', { ...baseline, hq: { ...hq, releaseCommit: 'b'.repeat(40) } })
  expectFailure('scheduler_pc_dependency_forbidden', { ...baseline, cloud: { ...cloud, pc_dependency: true } })
  expectFailure('capacity_not_scale_to_zero', { ...baseline, cloud: { ...cloud, capacity: { ...cloud.capacity, scale_to_zero_when_idle: false } } })
  expectFailure('snapshot_stale', { ...baseline, now: new Date('2026-08-01T12:00:00Z') })

  return { ok: true, contract: CONTRACT, checks: 6, networkRequests: 0 }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--self-test')) throw new Error('argument_invalid')
  if (args.includes('--self-test')) return runSelfTest()

  const root = resolve(import.meta.dirname, '..')
  const hq = parseHqLiveState(await readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'))
  const [appRelease, publicRelease, health, cloud] = await Promise.all([
    fetchJson(`${APP_ORIGIN}/__release.json`),
    fetchJson(`${PUBLIC_ORIGIN}/__release.json`),
    fetchJson(`${APP_ORIGIN}/api/health`),
    fetchJson(`${APP_ORIGIN}/api/cloud-autonomy/status`),
  ])
  const result = assessHqLiveState({ hq, appRelease, publicRelease, health, cloud })
  return {
    ...result,
    observedAt: new Date().toISOString(),
    hqObservedAt: hq.observedAt,
    release: {
      commit: appRelease.commit,
      brandVersion: appRelease.brandVersion,
      contextVersion: appRelease.contextVersion,
      catalogVersion: appRelease.catalogVersion,
    },
    runtime: {
      operatingMode: health.operating_mode,
      managedPersistenceReady: health.enterprise_db_ready,
      securityReady: health.security_ready,
    },
    scheduler: {
      status: cloud.status,
      configured: cloud.scheduler?.configured,
      pcDependency: cloud.pc_dependency,
      maxJobsPerRun: cloud.scheduler?.max_jobs_per_run,
      budgetGrantsRequired: cloud.scheduler?.budget_grants_required,
    },
    capacity: {
      scaleToZero: cloud.capacity?.scale_to_zero_when_idle,
      idleActiveExecutionTarget: cloud.capacity?.idle_active_execution_target,
      registeredSpecialistsConsumeCompute: cloud.capacity?.registered_specialists_consume_compute,
    },
  }
}

try {
  const result = await main()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, contract: CONTRACT, error: error instanceof Error ? error.message : 'unknown_error' }, null, 2)}\n`)
  process.exitCode = 1
}
