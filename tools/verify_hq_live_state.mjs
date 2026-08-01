import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CONTRACT = 'supermega.hq-live-state.v1'
const CEO_ADVISORY_FAILURES = new Set(['app_product_contract_drift', 'hq_release_commit_stale'])
const APP_ORIGIN = 'https://app.supermega.dev'
const PUBLIC_ORIGIN = 'https://supermega.dev'
const MAX_RESPONSE_BYTES = 65_536
const LIVE_PROBE_TIMEOUT_MS = 15_000
const LIVE_PROBE_MAX_ATTEMPTS = 2
const MAX_HQ_NOW_BYTES = 128 * 1_024
const MAX_SNAPSHOT_AGE_MS = 72 * 60 * 60 * 1_000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000
const RELEASE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const APP_LIVE_CONTRACT = 'supermega_app_live'
const SAFE_LIVE_FAILURE_CATEGORY = /^(?:missing_live_[a-z0-9_]+|live_[a-z0-9_]+|[a-z0-9_]+_(?:missing|wrong|invalid|mismatch|rejected))$/
const LIVE_PRODUCT_DRIFT_REASON = /^(?:missing_live_[a-z0-9_]+|live_[a-z0-9_]+|[a-z0-9_]+_(?:missing|wrong|invalid|mismatch|rejected))(?::[A-Za-z0-9_.=/-]+){0,3}$/

function safeLiveVerifierFailure(stderr, status) {
  const detail = /Error:\s+([^\r\n]{1,240})/.exec(String(stderr))?.[1]?.trim() ?? ''
  const category = /^([a-z][a-z0-9_]{2,100})(?::|$)/.exec(detail)?.[1] ?? ''
  if (!SAFE_LIVE_FAILURE_CATEGORY.test(category)) return `exit_${status}`
  return /^[A-Za-z0-9_.:/=-]+$/.test(detail) ? detail : category
}

export function assessLiveAppVerifier({ status, signal = null, stdout = '', stderr = '', error = null }) {
  if (error) return { ok: false, reason: 'verifier_process_error' }
  if (signal) return { ok: false, reason: 'verifier_process_interrupted' }
  if (status !== 0) {
    return { ok: false, reason: safeLiveVerifierFailure(stderr, status) }
  }

  let receipt
  try {
    receipt = JSON.parse(String(stdout).trim())
  } catch {
    return { ok: false, reason: 'verifier_receipt_invalid' }
  }
  if (receipt?.ok !== true || receipt?.contract !== APP_LIVE_CONTRACT || receipt?.baseUrl !== APP_ORIGIN) {
    return { ok: false, reason: 'verifier_receipt_contract_invalid' }
  }
  return {
    ok: true,
    contract: receipt.contract,
    status: 'current',
    reason: null,
    operatingMode: receipt.operatingMode,
    agentScheduler: receipt.agentScheduler,
  }
}

export function classifyLiveAppProductContract(result) {
  if (result?.ok === true && result.contract === APP_LIVE_CONTRACT && result.status === 'current' && result.reason === null) {
    return result
  }
  const reason = String(result?.reason || '')
  if (result?.ok === false && LIVE_PRODUCT_DRIFT_REASON.test(reason)) {
    return { ok: false, contract: APP_LIVE_CONTRACT, status: 'drifted', reason }
  }
  throw new Error(`live_app_product_contract_failed:${reason || 'verifier_receipt_invalid'}`)
}

function verifyLiveAppProductContract(root) {
  const execution = spawnSync(process.execPath, [resolve(root, 'tools', 'verify_app_release_live.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 4 * 60 * 1_000,
    windowsHide: true,
  })
  const result = assessLiveAppVerifier(execution)
  return classifyLiveAppProductContract(result)
}

function requireLine(text, label, pattern) {
  const matches = [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))]
  if (matches.length === 0) throw new Error(`hq_now_${label}_missing`)
  if (matches.length !== 1) throw new Error(`hq_now_${label}_duplicate`)
  return matches[0][1]
}

function parseBoolean(value, label) {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`hq_now_${label}_invalid`)
}

export function parseHqLiveState(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_HQ_NOW_BYTES) {
    throw new Error('hq_now_document_invalid')
  }
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
  if (!UTC_TIMESTAMP_PATTERN.test(observedAt) || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error('hq_now_observed_at_invalid')
  }

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

function validReleaseIdentity(value) {
  return typeof value?.commit === 'string'
    && /^[0-9a-f]{40}$/.test(value.commit)
    && ['brandVersion', 'contextVersion', 'catalogVersion']
      .every((field) => typeof value[field] === 'string' && RELEASE_VALUE_PATTERN.test(value[field]))
}

function sameReleaseIdentity(left, right) {
  return ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']
    .every((field) => typeof left?.[field] === 'string' && left[field] === right?.[field])
}

export function assessHqLiveState({ hq, appProductContract, appRelease, publicRelease, health, cloud, now = new Date() }) {
  const failures = []
  const requireCheck = (name, condition) => { if (!condition) failures.push(name) }
  const observedAtMs = Date.parse(hq.observedAt)
  const ageMs = now.getTime() - observedAtMs
  const scheduler = cloud?.scheduler
  const capacity = cloud?.capacity

  requireCheck('app_product_contract_drift', appProductContract?.ok === true
    && appProductContract.contract === APP_LIVE_CONTRACT
    && appProductContract.status === 'current'
    && appProductContract.reason === null)
  requireCheck('app_release_contract_invalid', appRelease?.service === 'supermega-app' && validReleaseIdentity(appRelease))
  requireCheck('public_release_contract_invalid', publicRelease?.service === 'supermega-public-site' && validReleaseIdentity(publicRelease))
  requireCheck('paired_release_identity_mismatch', sameReleaseIdentity(appRelease, publicRelease))
  requireCheck('hq_release_commit_stale', appRelease?.commit === hq.releaseCommit)
  requireCheck('app_canonical_domain_invalid', appRelease?.canonicalDomain === APP_ORIGIN)
  requireCheck('hq_operating_mode_invalid', hq.operatingMode === 'isolated_demo')
  requireCheck('hq_scheduler_status_invalid', hq.schedulerStatus === 'degraded')
  requireCheck('hq_scheduler_configuration_invalid', hq.schedulerConfigured === false)
  requireCheck('hq_managed_persistence_readiness_invalid', hq.managedPersistenceReady === false)
  requireCheck('hq_security_readiness_invalid', hq.securityReady === false)
  requireCheck('health_not_ready', health?.status === 'ready')
  requireCheck('operating_mode_drift', health?.operating_mode === hq.operatingMode)
  requireCheck('managed_persistence_readiness_drift', health?.enterprise_db_ready === hq.managedPersistenceReady)
  requireCheck('security_readiness_drift', health?.security_ready === hq.securityReady)
  requireCheck('scheduler_status_drift', cloud?.status === hq.schedulerStatus)
  requireCheck('scheduler_configuration_drift', scheduler?.configured === hq.schedulerConfigured)
  requireCheck('scheduler_pc_dependency_forbidden', cloud?.pc_dependency === false)
  requireCheck('scheduler_budget_grant_required', scheduler?.budget_grants_required === true)
  requireCheck('scheduler_batch_limit_exceeded', scheduler?.max_jobs_per_run === 1)
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
    signal: AbortSignal.timeout(LIVE_PROBE_TIMEOUT_MS),
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

function liveProbeFailureReason(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout'
  const message = error instanceof Error ? error.message : ''
  if (/^http_[45]\d\d$/.test(message)
    || /^(?:response_content_type_invalid|response_too_large|response_body_missing|response_json_invalid)$/.test(message)) {
    return message
  }
  return 'network_error'
}

export async function fetchLiveJson(label, url, options = {}) {
  if (!/^[a-z][a-z_]{0,31}$/.test(label)) throw new Error('live_probe_label_invalid')
  const fetchJsonImpl = options.fetchJsonImpl || fetchJson
  const maxAttempts = options.maxAttempts ?? LIVE_PROBE_MAX_ATTEMPTS
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > LIVE_PROBE_MAX_ATTEMPTS) {
    throw new Error('live_probe_attempt_limit_invalid')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { value: await fetchJsonImpl(url), attempts: attempt }
    } catch (error) {
      const reason = liveProbeFailureReason(error)
      const retryable = reason === 'timeout' || reason === 'network_error' || /^http_5\d\d$/.test(reason)
      if (!retryable || attempt === maxAttempts) {
        throw new Error(`live_${label}_fetch_failed:${reason}:attempts=${attempt}`)
      }
    }
  }
  throw new Error(`live_${label}_fetch_failed:network_error:attempts=${maxAttempts}`)
}

async function runSelfTest() {
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
    scheduler: { configured: false, budget_grants_required: true, max_jobs_per_run: 1 },
    capacity: { scale_to_zero_when_idle: true, idle_active_execution_target: 0, registered_specialists_consume_compute: false },
    execution_policy: 'review_gated_no_external_send_or_money_actions',
  }
  const appProductContract = { ok: true, contract: APP_LIVE_CONTRACT, status: 'current', reason: null }
  const baseline = { hq, appProductContract, appRelease, publicRelease, health, cloud, now }
  if (!assessHqLiveState(baseline).ok) throw new Error('self_test_baseline_failed')

  const liveReceipt = JSON.stringify({
    ok: true,
    contract: APP_LIVE_CONTRACT,
    baseUrl: APP_ORIGIN,
    operatingMode: 'isolated_demo',
    agentScheduler: 'degraded',
  })
  const appVerifierCases = [
    ['accept_live_app_receipt', assessLiveAppVerifier({ status: 0, stdout: liveReceipt }).status === 'current'],
    ['reject_live_app_failure', assessLiveAppVerifier({ status: 1, stderr: 'Error: live_settings_evidence_version_mismatch:local=13:live=23' }).reason === 'live_settings_evidence_version_mismatch:local=13:live=23'],
    ['retain_safe_live_failure_category', assessLiveAppVerifier({ status: 1, stderr: 'Error: missing_live_launch_readiness_context:AI command queue' }).reason === 'missing_live_launch_readiness_context'],
    ['reject_live_app_signal', assessLiveAppVerifier({ status: null, signal: 'SIGTERM' }).reason === 'verifier_process_interrupted'],
    ['reject_live_app_malformed_receipt', assessLiveAppVerifier({ status: 0, stdout: 'not-json' }).reason === 'verifier_receipt_invalid'],
    ['reject_live_app_wrong_contract', assessLiveAppVerifier({ status: 0, stdout: JSON.stringify({ ...JSON.parse(liveReceipt), contract: 'wrong' }) }).reason === 'verifier_receipt_contract_invalid'],
    ['redact_unsafe_failure_detail', assessLiveAppVerifier({ status: 1, stderr: 'Error: token secret=value' }).reason === 'exit_1'],
  ]
  for (const [name, passed] of appVerifierCases) {
    if (!passed) throw new Error(`self_test_${name}_failed`)
  }
  const currentProductContract = classifyLiveAppProductContract(assessLiveAppVerifier({ status: 0, stdout: liveReceipt }))
  const driftedProductContract = classifyLiveAppProductContract({ ok: false, reason: 'missing_live_launch_readiness_context' })
  const missingChunkProductContract = classifyLiveAppProductContract({ ok: false, reason: 'product_home_readiness_chunk_missing' })
  if (currentProductContract.status !== 'current'
    || driftedProductContract.status !== 'drifted'
    || driftedProductContract.reason !== 'missing_live_launch_readiness_context'
    || missingChunkProductContract.status !== 'drifted') {
    throw new Error('self_test_product_contract_classification_failed')
  }
  try {
    classifyLiveAppProductContract({ ok: false, reason: 'verifier_process_error' })
    throw new Error('self_test_unsafe_product_contract_failure_accepted')
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'live_app_product_contract_failed:verifier_process_error') throw error
  }

  let transientAttempts = 0
  const transient = await fetchLiveJson('app_release', `${APP_ORIGIN}/__release.json`, {
    fetchJsonImpl: async () => {
      transientAttempts += 1
      if (transientAttempts === 1) {
        const error = new Error('must-not-escape')
        error.name = 'TimeoutError'
        throw error
      }
      return appRelease
    },
  })
  let invalidAttempts = 0
  let invalidFailure = ''
  try {
    await fetchLiveJson('public_release', `${PUBLIC_ORIGIN}/__release.json`, {
      fetchJsonImpl: async () => {
        invalidAttempts += 1
        throw new Error('response_content_type_invalid')
      },
    })
  } catch (error) {
    invalidFailure = error instanceof Error ? error.message : ''
  }
  let exhaustedFailure = ''
  try {
    await fetchLiveJson('health', `${APP_ORIGIN}/api/health`, {
      fetchJsonImpl: async () => {
        const error = new Error('must-not-escape')
        error.name = 'TimeoutError'
        throw error
      },
    })
  } catch (error) {
    exhaustedFailure = error instanceof Error ? error.message : ''
  }
  const probeCases = [
    ['retry_one_transient_failure', transient.attempts === 2 && transient.value === appRelease],
    ['do_not_retry_invalid_content', invalidAttempts === 1 && invalidFailure === 'live_public_release_fetch_failed:response_content_type_invalid:attempts=1'],
    ['redact_exhausted_transient_failure', exhaustedFailure === 'live_health_fetch_failed:timeout:attempts=2'],
  ]
  for (const [name, passed] of probeCases) {
    if (!passed) throw new Error(`self_test_${name}_failed`)
  }

  const failureCases = [
    ['app_product_contract_drift', { ...baseline, appProductContract: { ok: false, contract: APP_LIVE_CONTRACT, status: 'drifted', reason: 'release_context_version_mismatch:ctx' } }],
    ['app_release_contract_invalid', { ...baseline, appRelease: { ...appRelease, brandVersion: '' } }],
    ['public_release_contract_invalid', { ...baseline, publicRelease: { ...publicRelease, service: 'wrong' } }],
    ['paired_release_identity_mismatch', { ...baseline, publicRelease: { ...publicRelease, commit: 'b'.repeat(40) } }],
    ['hq_release_commit_stale', { ...baseline, hq: { ...hq, releaseCommit: 'b'.repeat(40) } }],
    ['app_canonical_domain_invalid', { ...baseline, appRelease: { ...appRelease, canonicalDomain: PUBLIC_ORIGIN } }],
    ['hq_operating_mode_invalid', { ...baseline, hq: { ...hq, operatingMode: 'managed' } }],
    ['hq_scheduler_status_invalid', { ...baseline, hq: { ...hq, schedulerStatus: 'ready' } }],
    ['hq_scheduler_configuration_invalid', { ...baseline, hq: { ...hq, schedulerConfigured: true } }],
    ['hq_managed_persistence_readiness_invalid', { ...baseline, hq: { ...hq, managedPersistenceReady: true } }],
    ['hq_security_readiness_invalid', { ...baseline, hq: { ...hq, securityReady: true } }],
    ['health_not_ready', { ...baseline, health: { ...health, status: 'degraded' } }],
    ['operating_mode_drift', { ...baseline, health: { ...health, operating_mode: 'managed' } }],
    ['managed_persistence_readiness_drift', { ...baseline, health: { ...health, enterprise_db_ready: true } }],
    ['security_readiness_drift', { ...baseline, health: { ...health, security_ready: true } }],
    ['scheduler_status_drift', { ...baseline, cloud: { ...cloud, status: 'ready' } }],
    ['scheduler_configuration_drift', { ...baseline, cloud: { ...cloud, scheduler: { ...cloud.scheduler, configured: true } } }],
    ['scheduler_pc_dependency_forbidden', { ...baseline, cloud: { ...cloud, pc_dependency: true } }],
    ['scheduler_budget_grant_required', { ...baseline, cloud: { ...cloud, scheduler: { ...cloud.scheduler, budget_grants_required: false } } }],
    ['scheduler_batch_limit_exceeded', { ...baseline, cloud: { ...cloud, scheduler: { ...cloud.scheduler, max_jobs_per_run: 2 } } }],
    ['capacity_not_scale_to_zero', { ...baseline, cloud: { ...cloud, capacity: { ...cloud.capacity, scale_to_zero_when_idle: false } } }],
    ['idle_execution_target_nonzero', { ...baseline, cloud: { ...cloud, capacity: { ...cloud.capacity, idle_active_execution_target: 1 } } }],
    ['registered_specialists_consume_compute', { ...baseline, cloud: { ...cloud, capacity: { ...cloud.capacity, registered_specialists_consume_compute: true } } }],
    ['external_action_policy_drift', { ...baseline, cloud: { ...cloud, execution_policy: 'automatic' } }],
    ['snapshot_from_future', { ...baseline, now: new Date('2026-07-27T10:54:00Z') }],
    ['snapshot_stale', { ...baseline, now: new Date('2026-08-01T12:00:00Z') }],
  ]
  for (const [name, input] of failureCases) {
    if (!assessHqLiveState(input).failures.includes(name)) throw new Error(`self_test_${name}_failed`)
  }

  const duplicate = `Live state contract: \`${CONTRACT}\`\n${`Live state contract: \`${CONTRACT}\``}`
  try {
    parseHqLiveState(duplicate)
    throw new Error('self_test_duplicate_line_failed')
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'hq_now_contract_duplicate') throw error
  }

  return { ok: true, contract: CONTRACT, checks: failureCases.length + appVerifierCases.length + probeCases.length + 5, networkRequests: 0 }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => !['--self-test', '--ceo-advisory'].includes(arg))
    || (args.includes('--self-test') && args.includes('--ceo-advisory'))
    || new Set(args).size !== args.length) throw new Error('argument_invalid')
  if (args.includes('--self-test')) return runSelfTest()

  const root = resolve(import.meta.dirname, '..')
  const appProductContract = verifyLiveAppProductContract(root)
  const hq = parseHqLiveState(await readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'))
  const [appReleaseProbe, publicReleaseProbe, healthProbe, cloudProbe] = await Promise.all([
    fetchLiveJson('app_release', `${APP_ORIGIN}/__release.json`),
    fetchLiveJson('public_release', `${PUBLIC_ORIGIN}/__release.json`),
    fetchLiveJson('health', `${APP_ORIGIN}/api/health`),
    fetchLiveJson('cloud_autonomy', `${APP_ORIGIN}/api/cloud-autonomy/status`),
  ])
  const appRelease = appReleaseProbe.value
  const publicRelease = publicReleaseProbe.value
  const health = healthProbe.value
  const cloud = cloudProbe.value
  const result = assessHqLiveState({ hq, appProductContract, appRelease, publicRelease, health, cloud })
  const advisories = args.includes('--ceo-advisory')
    ? result.failures.filter((failure) => CEO_ADVISORY_FAILURES.has(failure))
    : []
  const failures = result.failures.filter((failure) => !advisories.includes(failure))
  return {
    ...result,
    ok: failures.length === 0,
    failures,
    advisories,
    observedAt: new Date().toISOString(),
    hqObservedAt: hq.observedAt,
    appProductContract,
    probes: {
      timeoutMs: LIVE_PROBE_TIMEOUT_MS,
      maxAttempts: LIVE_PROBE_MAX_ATTEMPTS,
      appReleaseAttempts: appReleaseProbe.attempts,
      publicReleaseAttempts: publicReleaseProbe.attempts,
      healthAttempts: healthProbe.attempts,
      cloudAutonomyAttempts: cloudProbe.attempts,
    },
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
