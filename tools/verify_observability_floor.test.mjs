import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assessLiveEndpointEvidence,
  classifyCommandResult,
} from './verify_observability_floor.mjs'

const releaseCommit = '6'.repeat(40)

function endpointFixture(overrides = {}) {
  const specs = [
    { id: 'public_primary_release', kind: 'release', surface: 'public', url: 'https://supermega.dev/__release.json', service: 'supermega-public-site' },
    { id: 'public_www_release', kind: 'release', surface: 'public', url: 'https://www.supermega.dev/__release.json', service: 'supermega-public-site' },
    { id: 'app_primary_release', kind: 'release', surface: 'app', url: 'https://app.supermega.dev/__release.json', service: 'supermega-app' },
    { id: 'app_vercel_release', kind: 'release', surface: 'app', url: 'https://megaos.vercel.app/__release.json', service: 'supermega-app' },
    { id: 'public_primary_health', kind: 'health', surface: 'public', url: 'https://supermega.dev/api/health', service: 'supermega-public-site' },
    { id: 'public_www_health', kind: 'health', surface: 'public', url: 'https://www.supermega.dev/api/health', service: 'supermega-public-site' },
    { id: 'app_primary_health', kind: 'health', surface: 'app', url: 'https://app.supermega.dev/api/health', service: 'supermega-service' },
    { id: 'app_vercel_health', kind: 'health', surface: 'app', url: 'https://megaos.vercel.app/api/health', service: 'supermega-service' },
  ]
  const release = {
    commit: releaseCommit,
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
    commit: releaseCommit,
  }
  return specs.map((spec) => {
    const body = spec.kind === 'release'
      ? { ...release, service: spec.service, ...(spec.surface === 'app' ? { canonicalDomain: 'https://app.supermega.dev' } : {}) }
      : spec.surface === 'app'
        ? { ...appHealth }
        : { ...publicHealth }
    return { ...spec, statusCode: 200, body: { ...body, ...(overrides[spec.id] || {}) } }
  })
}

test('classifies successful command receipts', () => {
  const result = classifyCommandResult('security', {
    status: 0,
    stdout: '{"ok":true,"contract":"supermega_app_security","checks":101}',
    stderr: '',
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'pass')
  assert.equal(result.contract, 'supermega_app_security')
})

test('classifies current-source live drift separately from outage', () => {
  const result = classifyCommandResult('app_current_source_live', {
    status: 1,
    stdout: '',
    stderr: 'Error: missing_current_release_asset:launcher:Working samples. Add data when ready.',
  }, { allowSourceLiveDrift: true })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'source_live_drift')
})

test('keeps unsafe command failures as hard failures', () => {
  const result = classifyCommandResult('app_security_contract', {
    status: 1,
    stdout: '',
    stderr: 'Error: browser_service_role_exposed',
  }, { required: true })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'fail')
})

test('redacts credential-shaped command failure snippets', () => {
  const databaseUrl = [
    'postgresql',
    String.fromCharCode(58, 47, 47),
    'fixture-user',
    String.fromCharCode(58),
    'fixture-value',
    String.fromCharCode(64),
    'example.test/db',
  ].join('')
  const githubToken = ['g', 'hp', '_', 'a'.repeat(36)].join('')
  const bearerToken = ['Bearer ', 'abc', '.', 'def', '.', 'ghi'].join('')
  const jwt = [
    ['eyJ', 'hbGciOiJub25lIiwidHlwIjoiSldUIn0'].join(''),
    ['eyJ', 'zdWIiOiJmaXh0dXJlIn0'].join(''),
    ['c2ln', 'bmF0dXJl'].join(''),
  ].join('.')
  const providerToken = ['s', 'k', '-proj-', 'a'.repeat(24)].join('')
  const result = classifyCommandResult('app_security_contract', {
    status: 1,
    stdout: '',
    stderr: `Error: leaked DATABASE_URL=${databaseUrl} ${githubToken} ${bearerToken} ${jwt} ${providerToken}`,
  }, { required: true })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'fail')
  assert.doesNotMatch(result.reason, /postgresql:\/\/user|ghp_|Bearer abc|eyJhbGci|sk-proj-1234|user:pass/)
  assert.match(result.reason, /\[redacted/)
})

test('classifies HQ live drift as advisory when explicitly allowed', () => {
  const result = classifyCommandResult('hq_live_state', {
    status: 1,
    stdout: '{"ok":false,"error":"hq_release_commit_stale,security_readiness_drift,snapshot_stale"}',
    stderr: '',
  }, { allowAdvisoryDrift: true })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'advisory_drift')
})

test('accepts healthy read-only live endpoint evidence', () => {
  const result = assessLiveEndpointEvidence(endpointFixture(), { expectedOperatingMode: 'isolated_demo' })
  assert.equal(result.ok, true)
  assert.equal(result.releaseIdentity.commit, releaseCommit)
})

test('rejects accidental managed write enablement', () => {
  const result = assessLiveEndpointEvidence(endpointFixture({
    app_primary_health: {
      trial_backend: { write_enabled: true, browser_service_role_exposed: false },
    },
  }), { expectedOperatingMode: 'isolated_demo' })
  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('app_primary_health:trial_write_enabled'))
})

test('rejects cross-domain release drift', () => {
  const result = assessLiveEndpointEvidence(endpointFixture({
    app_vercel_release: { commit: '7'.repeat(40) },
  }), { expectedOperatingMode: 'isolated_demo' })
  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('app_vercel_release:release_identity_mismatch'))
})
