#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const CONTRACT = 'supermega.observability-floor.v1'
const root = resolve(import.meta.dirname, '..')
const COMMAND_TIMEOUT_MS = Number(process.env.OBSERVABILITY_FLOOR_COMMAND_TIMEOUT_MS || 4 * 60 * 1000)
const HTTP_TIMEOUT_MS = Number(process.env.OBSERVABILITY_FLOOR_HTTP_TIMEOUT_MS || 15_000)
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const EXPECTED_OPERATING_MODE = String(process.env.EXPECTED_OPERATING_MODE || 'isolated_demo').trim()

const liveEndpointSpecs = [
  { id: 'public_primary_release', kind: 'release', surface: 'public', url: 'https://supermega.dev/__release.json', service: 'supermega-public-site' },
  { id: 'public_www_release', kind: 'release', surface: 'public', url: 'https://www.supermega.dev/__release.json', service: 'supermega-public-site' },
  { id: 'app_primary_release', kind: 'release', surface: 'app', url: 'https://app.supermega.dev/__release.json', service: 'supermega-app' },
  { id: 'app_vercel_release', kind: 'release', surface: 'app', url: 'https://megaos.vercel.app/__release.json', service: 'supermega-app' },
  { id: 'public_primary_health', kind: 'health', surface: 'public', url: 'https://supermega.dev/api/health', service: 'supermega-public-site' },
  { id: 'public_www_health', kind: 'health', surface: 'public', url: 'https://www.supermega.dev/api/health', service: 'supermega-public-site' },
  { id: 'app_primary_health', kind: 'health', surface: 'app', url: 'https://app.supermega.dev/api/health', service: 'supermega-service' },
  { id: 'app_vercel_health', kind: 'health', surface: 'app', url: 'https://megaos.vercel.app/api/health', service: 'supermega-service' },
]

const commandSpecs = [
  {
    id: 'coordinated_release_pair',
    required: true,
    argv: ['tools/verify_coordinated_release_live.mjs'],
    env: { VERIFY_RELEASE_PAIR_ONLY: '1', RELEASE_BARRIER_ATTEMPTS: '1' },
  },
  {
    id: 'public_live_release',
    required: true,
    argv: ['tools/verify_public_release_live.mjs'],
    env: { PUBLIC_VERIFY_ATTEMPTS: '1' },
  },
  {
    id: 'app_current_source_live',
    required: false,
    allowSourceLiveDrift: true,
    argv: ['tools/verify_app_release_live.mjs', '--current-head'],
    env: { EXPECTED_OPERATING_MODE },
  },
  {
    id: 'hq_live_state',
    required: false,
    allowAdvisoryDrift: true,
    allowSourceLiveDrift: true,
    argv: ['tools/verify_hq_live_state.mjs'],
  },
  {
    id: 'app_security_contract',
    required: true,
    argv: ['tools/verify_app_security_contract.mjs'],
  },
  {
    id: 'supabase_compatibility',
    required: true,
    argv: ['tools/verify_supabase_compatibility.mjs'],
  },
]

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/')
}

function safeOutput(value) {
  return String(value || '')
    .replace(/\b((?:DATABASE_URL|POSTGRES_URL|SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY)\s*=\s*)[^\s"'`]+/gi, '$1[redacted]')
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, 'postgres://[redacted]')
    .replace(/([?&](?:access_token|api_key|apikey|jwt|key|password|secret|token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\b(sk-[A-Za-z0-9._-]{12,})\b/g, '[redacted-key]')
    .replace(/\b(?:ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[redacted-github-token]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]')
    .slice(0, 4_000)
}

function parseJsonLoose(value) {
  const text = String(value || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first < 0 || last <= first) return null
    try {
      return JSON.parse(text.slice(first, last + 1))
    } catch {
      return null
    }
  }
}

function extractFailureReason(execution) {
  const stdoutJson = parseJsonLoose(execution.stdout)
  const stderrJson = parseJsonLoose(execution.stderr)
  const json = stdoutJson || stderrJson
  if (json?.reason) return String(json.reason)
  if (json?.error) return String(json.error)
  if (Array.isArray(json?.failures) && json.failures.length) return json.failures.map(String).join(',')

  const stderr = String(execution.stderr || '')
  const stdout = String(execution.stdout || '')
  const errorMatch = /Error:\s+([^\r\n]{1,320})/.exec(stderr) || /Error:\s+([^\r\n]{1,320})/.exec(stdout)
  if (errorMatch) return safeOutput(errorMatch[1])
  if (execution.signal) return `signal_${execution.signal}`
  return `exit_${execution.status ?? 'unknown'}`
}

function isSourceLiveDriftReason(reason) {
  const value = String(reason || '')
  return /^(?:missing_current_release_asset|release_commit_mismatch|release_[a-z0-9_]+_mismatch|canonical_product_route_redirected|wrong_shell|live_app_product_contract_failed|missing_live_[a-z0-9_]+|live_[a-z0-9_]+|[a-z0-9_]+_(?:missing|wrong|invalid|mismatch|rejected))(?::|$)/.test(value)
}

export function classifyCommandResult(id, execution, options = {}) {
  const stdoutJson = parseJsonLoose(execution.stdout)
  const ok = execution.status === 0 && !execution.signal
  if (ok) {
    return {
      id,
      ok: true,
      status: 'pass',
      contract: stdoutJson?.contract || null,
      summary: stdoutJson || null,
    }
  }

  const reason = extractFailureReason(execution)
  if (options.allowSourceLiveDrift && isSourceLiveDriftReason(reason)) {
    return {
      id,
      ok: false,
      status: 'source_live_drift',
      reason,
      required: options.required === true,
    }
  }
  if (options.allowAdvisoryDrift && options.required !== true) {
    return {
      id,
      ok: false,
      status: 'advisory_drift',
      reason,
      required: false,
    }
  }

  return {
    id,
    ok: false,
    status: 'fail',
    reason,
    required: options.required === true,
  }
}

function runNodeTool(spec) {
  const [tool, ...args] = spec.argv
  const absoluteTool = resolve(root, tool)
  const execution = spawnSync(process.execPath, [absoluteTool, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(spec.env || {}) },
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  })
  return classifyCommandResult(spec.id, {
    status: execution.status,
    signal: execution.signal,
    stdout: safeOutput(execution.stdout),
    stderr: safeOutput(execution.stderr),
    error: execution.error,
  }, spec)
}

function releaseIdentity(body) {
  return {
    commit: String(body?.commit || '').trim(),
    brandVersion: String(body?.brandVersion || '').trim(),
    contextVersion: String(body?.contextVersion || '').trim(),
    catalogVersion: String(body?.catalogVersion || '').trim(),
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function assessLiveEndpointEvidence(endpointResults, options = {}) {
  const expectedOperatingMode = String(options.expectedOperatingMode || EXPECTED_OPERATING_MODE)
  const failures = []
  const releases = endpointResults.filter((entry) => entry.kind === 'release')
  const health = endpointResults.filter((entry) => entry.kind === 'health')

  for (const entry of endpointResults) {
    if (entry.error) failures.push(`${entry.id}:request_failed`)
    if (entry.statusCode !== 200) failures.push(`${entry.id}:http_${entry.statusCode || 'missing'}`)
    if (!entry.body || typeof entry.body !== 'object') failures.push(`${entry.id}:json_missing`)
    if (entry.service && entry.body?.service !== entry.service) failures.push(`${entry.id}:service_${entry.body?.service || 'missing'}`)
  }

  const releaseIdentities = releases.map((entry) => ({ id: entry.id, identity: releaseIdentity(entry.body) }))
  const referenceIdentity = releaseIdentities[0]?.identity || null
  if (!referenceIdentity || !/^[0-9a-f]{40}$/.test(referenceIdentity.commit)) failures.push('release_commit_not_immutable')
  for (const { id, identity } of releaseIdentities) {
    for (const [field, value] of Object.entries(identity)) {
      if (!value) failures.push(`${id}:${field}_missing`)
    }
    if (referenceIdentity && !sameJson(identity, referenceIdentity)) failures.push(`${id}:release_identity_mismatch`)
  }
  for (const entry of releases.filter((item) => item.surface === 'app')) {
    if (entry.body?.canonicalDomain !== 'https://app.supermega.dev') failures.push(`${entry.id}:canonical_domain_wrong`)
  }

  for (const entry of health.filter((item) => item.surface === 'public')) {
    if (entry.body?.ok !== true) failures.push(`${entry.id}:ok_not_true`)
    if (entry.body?.status !== 'ready') failures.push(`${entry.id}:status_not_ready`)
    if (referenceIdentity?.commit && entry.body?.commit !== referenceIdentity.commit) failures.push(`${entry.id}:commit_mismatch`)
  }

  for (const entry of health.filter((item) => item.surface === 'app')) {
    const body = entry.body || {}
    if (body.status !== 'ready') failures.push(`${entry.id}:status_not_ready`)
    if (body.operating_mode !== expectedOperatingMode) failures.push(`${entry.id}:operating_mode_${body.operating_mode || 'missing'}`)
    if (expectedOperatingMode === 'isolated_demo' && body.enterprise_db_ready !== false) failures.push(`${entry.id}:enterprise_db_unexpected`)
    if (body.security_ready !== true) failures.push(`${entry.id}:security_not_ready`)
    if (body.trial_backend?.write_enabled !== false) failures.push(`${entry.id}:trial_write_enabled`)
    if (body.trial_backend?.browser_service_role_exposed !== false) failures.push(`${entry.id}:browser_service_role_exposed`)
    if (body.enterprise_activation?.evidence_ready !== false) failures.push(`${entry.id}:activation_evidence_unexpected`)
    if (body.secret_values_exposed === true) failures.push(`${entry.id}:secret_exposure_flag_unexpected`)
    if (JSON.stringify(body).toLowerCase().includes('secret=')) failures.push(`${entry.id}:secret_value_literal_exposed`)
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? 'pass' : 'fail',
    releaseIdentity: referenceIdentity,
    failures,
    endpoints: endpointResults.map((entry) => ({
      id: entry.id,
      url: entry.url,
      kind: entry.kind,
      surface: entry.surface,
      statusCode: entry.statusCode || null,
      ok: !entry.error && entry.statusCode === 200,
      service: entry.body?.service || null,
      commit: entry.body?.commit || null,
      operatingMode: entry.body?.operating_mode || null,
    })),
  }
}

async function fetchJsonEndpoint(spec) {
  try {
    const response = await fetch(spec.url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'SuperMegaObservabilityFloor/1.0',
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    let body = null
    try {
      body = await response.json()
    } catch {}
    return { ...spec, statusCode: response.status, body }
  } catch (error) {
    return { ...spec, error: safeOutput(error?.message || String(error)) }
  }
}

async function readLiveEndpoints() {
  const results = []
  for (const spec of liveEndpointSpecs) results.push(await fetchJsonEndpoint(spec))
  return assessLiveEndpointEvidence(results, { expectedOperatingMode: EXPECTED_OPERATING_MODE })
}

function buildClaims(commandResults, liveEvidence) {
  const command = Object.fromEntries(commandResults.map((entry) => [entry.id, entry]))
  const appCurrentSourceLive = command.app_current_source_live?.status === 'pass'
  const hqCurrentLive = command.hq_live_state?.status === 'pass'
  const productionAvailability = liveEvidence.ok
    && command.coordinated_release_pair?.status === 'pass'
    && command.public_live_release?.status === 'pass'
  const managedActivation = liveEvidence.endpoints
    .filter((entry) => entry.surface === 'app' && entry.kind === 'health')
    .some((entry) => entry.operatingMode === 'managed_trial')

  const blockedClaims = []
  if (!appCurrentSourceLive) blockedClaims.push('current_source_live')
  if (!hqCurrentLive) blockedClaims.push('all_live_product_checks_green')
  if (!managedActivation) blockedClaims.push('managed_activation')
  blockedClaims.push('shop_pilot_proof')

  return {
    productionAvailability,
    currentSourceLive: appCurrentSourceLive,
    hqCurrentLive,
    managedActivation,
    shopPilotProof: false,
    blockedClaims,
  }
}

async function runFloor() {
  const commandResults = commandSpecs.map(runNodeTool)
  const liveEvidence = await readLiveEndpoints()
  const requiredCommandFailures = commandResults.filter((entry) => {
    const spec = commandSpecs.find((candidate) => candidate.id === entry.id)
    return spec?.required && entry.status !== 'pass'
  })
  const unsafeAdvisoryFailures = commandResults.filter((entry) => {
    const spec = commandSpecs.find((candidate) => candidate.id === entry.id)
    return !spec?.required && entry.status === 'fail'
  })
  const claims = buildClaims(commandResults, liveEvidence)
  const ok = liveEvidence.ok && requiredCommandFailures.length === 0 && unsafeAdvisoryFailures.length === 0

  return {
    ok,
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    mode: 'read_only',
    expectedOperatingMode: EXPECTED_OPERATING_MODE,
    controls: {
      providerMutations: 0,
      databaseConnections: 0,
      hostedWrites: 0,
      customerContact: 0,
      payments: 0,
      stockMovement: 0,
      managedActivation: 0,
    },
    liveEvidence,
    commands: commandResults,
    claims,
    requiredFailures: requiredCommandFailures.map((entry) => entry.id),
    advisoryFailures: unsafeAdvisoryFailures.map((entry) => entry.id),
  }
}

function selfTestFixtureResults(overrides = {}) {
  const release = {
    service: null,
    commit: '6'.repeat(40),
    brandVersion: 'jade-v2-2026-07',
    contextVersion: '2026-07-31.3',
    catalogVersion: '2026-07-31.3',
  }
  const appHealth = {
    status: 'ready',
    service: 'supermega-service',
    operating_mode: 'isolated_demo',
    enterprise_db_ready: false,
    security_ready: true,
    trial_backend: { write_enabled: false, browser_service_role_exposed: false },
    enterprise_activation: { evidence_ready: false },
    secret_values_exposed: false,
  }
  const publicHealth = {
    ok: true,
    status: 'ready',
    service: 'supermega-public-site',
    commit: release.commit,
  }
  return liveEndpointSpecs.map((spec) => {
    const body = spec.kind === 'release'
      ? { ...release, service: spec.service, ...(spec.surface === 'app' ? { canonicalDomain: 'https://app.supermega.dev' } : {}) }
      : spec.surface === 'app'
        ? { ...appHealth }
        : { ...publicHealth }
    return { ...spec, statusCode: 200, body: { ...body, ...(overrides[spec.id] || {}) } }
  })
}

function runSelfTest() {
  const pass = classifyCommandResult('sample', { status: 0, stdout: '{"ok":true,"contract":"x"}', stderr: '' })
  const drift = classifyCommandResult('app_current_source_live', {
    status: 1,
    stdout: '',
    stderr: 'Error: missing_current_release_asset:launcher:Working samples. Add data when ready.',
  }, { allowSourceLiveDrift: true })
  const unsafe = classifyCommandResult('security', { status: 1, stdout: '', stderr: 'Error: secret_exposed' }, { required: true })
  const healthyLive = assessLiveEndpointEvidence(selfTestFixtureResults(), { expectedOperatingMode: 'isolated_demo' })
  const unsafeLive = assessLiveEndpointEvidence(selfTestFixtureResults({
    app_primary_health: { trial_backend: { write_enabled: true, browser_service_role_exposed: false } },
  }), { expectedOperatingMode: 'isolated_demo' })
  const checks = {
    pass_command_contract: pass.ok === true && pass.status === 'pass',
    source_live_drift_is_advisory: drift.status === 'source_live_drift',
    unsafe_failure_stays_failed: unsafe.status === 'fail',
    healthy_live_endpoints_pass: healthyLive.ok === true,
    managed_write_surprise_fails: unsafeLive.ok === false && unsafeLive.failures.includes('app_primary_health:trial_write_enabled'),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

async function main() {
  const result = process.argv.includes('--self-test') ? runSelfTest() : await runFloor()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    contract: CONTRACT,
    reason: safeOutput(error?.message || String(error)),
  }, null, 2))
  process.exitCode = 1
})
