import test from 'node:test'
import assert from 'node:assert/strict'

import {
  POST_DEPLOY_OPERATIONS_CONTRACT,
  ROLLBACK_EVIDENCE_CONTRACT,
  RUNTIME_LOG_EVIDENCE_CONTRACT,
  buildPostDeployOperationsReceipt,
  collectPostDeployProbes,
  validatePostDeployOperationsReceipt,
} from './collect_post_deploy_operations_receipt.mjs'

const generatedAt = '2026-08-28T12:00:00.000Z'
const expectedCommit = 'a'.repeat(40)
const previousCommit = 'b'.repeat(40)
const previewOrigins = {
  public: 'https://supermega-public-preview-123.vercel.app',
  app: 'https://megaos-preview-123.vercel.app',
}
const productionOrigins = {
  public: 'https://supermega.dev',
  app: 'https://app.supermega.dev',
}
const sourceDigests = {
  runtime: `sha256:${'1'.repeat(64)}`,
  rollback: `sha256:${'2'.repeat(64)}`,
}

const appHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'permissions-policy': 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

const publicHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

const loaderSource = `if (/(^|\\.)supermega\\.dev$/.test(location.hostname)) {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments) }
  for (const src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {
    const script = document.createElement('script')
    script.src = src
    document.head.append(script)
  }
}`

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function html(value, headers = appHeaders, status = 200) {
  return new Response(value, { status, headers })
}

function runtimeEvidence(origins = previewOrigins, overrides = {}) {
  return {
    contract: RUNTIME_LOG_EVIDENCE_CONTRACT,
    stage: origins === productionOrigins ? 'production' : 'preview',
    expectedCommit,
    deploymentOrigins: { public: origins.public, app: origins.app },
    window: {
      startedAt: '2026-08-28T11:35:00.000Z',
      endedAt: '2026-08-28T11:55:00.000Z',
    },
    errorCount: 0,
    materialWarningCount: 0,
    queryMode: 'read_only',
    rawLogsRetained: false,
    secretValuesExposed: false,
    providerMutations: 0,
    ...overrides,
  }
}

function rollbackEvidence(overrides = {}) {
  return {
    contract: ROLLBACK_EVIDENCE_CONTRACT,
    expectedCommit,
    capturedAt: '2026-08-28T11:57:00.000Z',
    queryMode: 'read_only',
    providerMutations: 0,
    secretValuesExposed: false,
    targets: [
      {
        surface: 'public',
        projectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
        deploymentId: 'dpl_public123',
        url: 'https://rollback-public-123.vercel.app',
        readyState: 'READY',
        target: 'production',
        commit: previousCommit,
      },
      {
        surface: 'app',
        projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
        deploymentId: 'dpl_app123',
        url: 'https://rollback-app-123.vercel.app',
        readyState: 'READY',
        target: 'production',
        commit: previousCommit,
      },
    ],
    ...overrides,
  }
}

function fixtureFetch(origins, options = {}) {
  const calls = []
  const fetchImpl = async (input, request = {}) => {
    const url = new URL(input)
    calls.push({ url: url.href, request })
    const isPublic = url.origin === origins.public
    const isApp = url.origin === origins.app
    if (!isPublic && !isApp) return new Response('wrong origin', { status: 404 })
    if (url.pathname === '/__release.json') {
      return json(isPublic
        ? { service: 'supermega-public-site', commit: options.publicCommit || expectedCommit }
        : { service: 'supermega-app', canonicalDomain: 'https://app.supermega.dev', commit: options.appCommit || expectedCommit })
    }
    if (url.pathname === '/api/health') {
      return json(isPublic
        ? { ok: true, status: 'ready', service: 'supermega-public-site', commit: expectedCommit }
        : {
            status: 'ready',
            service: 'supermega-service',
            operating_mode: 'isolated_demo',
            enterprise_db_ready: false,
            security_ready: true,
            trial_backend: { write_enabled: false, browser_service_role_exposed: false },
            enterprise_activation: { evidence_ready: false },
            secret_values_exposed: false,
          })
    }
    if (isPublic && url.pathname === '/') {
      return html('<!doctype html><html><body>SuperMega</body></html>', options.publicHeadersMissing
        ? { 'content-type': 'text/html' }
        : publicHeaders)
    }
    if (isApp && ['/shop/', '/plant/', '/website/', '/ecommerce/'].includes(url.pathname)) {
      const headers = options.cameraDenied
        ? { ...appHeaders, 'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' }
        : appHeaders
      return html('<!doctype html><html><body><div id="root"></div><script src="/vercel-insights.js"></script></body></html>', headers)
    }
    if (isApp && url.pathname === '/vercel-insights.js') {
      const source = options.loaderWithoutSpeed
        ? loaderSource.replace("'/_vercel/speed-insights/script.js'", "'/disabled-speed-insights.js'")
        : loaderSource
      return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript' } })
    }
    if (isApp && url.pathname === '/_vercel/insights/script.js') {
      return new Response('self.webAnalytics=true', { status: 200, headers: { 'content-type': 'text/javascript' } })
    }
    if (isApp && url.pathname === '/_vercel/speed-insights/script.js') {
      return new Response(options.speedRuntimeMissing ? '' : 'self.speedInsights=true', {
        status: options.speedRuntimeMissing ? 404 : 200,
        headers: { 'content-type': 'text/javascript' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, calls }
}

async function buildFixture({
  stage = 'preview',
  origins = previewOrigins,
  fetchOptions = {},
  runtime = runtimeEvidence(origins),
  rollback = rollbackEvidence(),
} = {}) {
  const fixture = fixtureFetch(origins, fetchOptions)
  const probes = await collectPostDeployProbes({
    stage,
    publicOrigin: origins.public,
    appOrigin: origins.app,
    fetchImpl: fixture.fetchImpl,
  })
  const packet = buildPostDeployOperationsReceipt({
    generatedAt,
    stage,
    expectedCommit,
    publicOrigin: origins.public,
    appOrigin: origins.app,
    probes,
    runtimeLogEvidence: runtime,
    runtimeLogSourceDigest: runtime ? sourceDigests.runtime : null,
    rollbackEvidence: rollback,
    rollbackSourceDigest: rollback ? sourceDigests.rollback : null,
  })
  return { packet, ...fixture }
}

test('builds a passing preview operations receipt using GET only while release authority stays closed', async () => {
  const { packet, calls } = await buildFixture()
  assert.equal(packet.contract, POST_DEPLOY_OPERATIONS_CONTRACT)
  assert.equal(packet.operations.status, 'pass')
  assert.equal(packet.operations.blockingCount, 0)
  assert.equal(packet.externalReleaseGates.status, 'blocked')
  assert.equal(packet.releaseAuthorized, false)
  assert.equal(calls.length, 10)
  assert.equal(calls.every(({ request }) => request.method === 'GET'
    && request.redirect === 'manual'
    && request.credentials === 'omit'
    && !('authorization' in request.headers)), true)
  assert.equal(calls.some(({ url }) => url.includes('/_vercel/speed-insights/')), false)
  assert.equal(validatePostDeployOperationsReceipt(packet), packet)
})

test('derives missing runtime and rollback evidence as blockers without weakening other gates', async () => {
  const { packet } = await buildFixture({ runtime: null, rollback: null })
  assert.equal(packet.operations.status, 'blocked')
  assert.deepEqual(packet.operations.blockers, ['runtime_log_receipt_missing', 'rollback_receipt_missing'])
  assert.equal(packet.operations.gates.slice(0, 5).every((gate) => gate.status === 'pass'), true)
  validatePostDeployOperationsReceipt(packet)
})

test('blocks release drift, missing public headers, denied camera access, and a missing Speed Insights bootstrap', async () => {
  const { packet } = await buildFixture({
    fetchOptions: { appCommit: 'c'.repeat(40), publicHeadersMissing: true, cameraDenied: true, loaderWithoutSpeed: true },
  })
  assert.ok(packet.operations.blockers.includes('app_release_commit_mismatch'))
  assert.ok(packet.operations.blockers.includes('public_home_security_headers_invalid'))
  assert.ok(packet.operations.blockers.includes('shop_security_headers_invalid'))
  assert.ok(packet.operations.blockers.includes('speed_insights_bootstrap_invalid'))
  assert.equal(packet.operations.status, 'blocked')
})

test('keeps nonzero runtime findings and stale evidence visible as derived blockers', async () => {
  const runtime = runtimeEvidence(previewOrigins, {
    window: { startedAt: '2026-08-28T08:00:00.000Z', endedAt: '2026-08-28T08:45:00.000Z' },
    errorCount: 2,
    materialWarningCount: 1,
  })
  const { packet } = await buildFixture({ runtime })
  assert.ok(packet.operations.blockers.includes('runtime_log_receipt_stale'))
  assert.ok(packet.operations.blockers.includes('runtime_log_window_unbounded'))
  assert.ok(packet.operations.blockers.includes('runtime_errors_observed'))
  assert.ok(packet.operations.blockers.includes('material_runtime_warnings_observed'))
})

test('production receipt additionally probes both live Vercel observability scripts', async () => {
  const { packet, calls } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
  })
  assert.equal(packet.operations.status, 'pass')
  assert.equal(calls.length, 12)
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.app}/_vercel/insights/script.js`))
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.app}/_vercel/speed-insights/script.js`))
})

test('production receipt blocks when the Speed Insights runtime endpoint is absent', async () => {
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    fetchOptions: { speedRuntimeMissing: true },
  })
  assert.ok(packet.operations.blockers.includes('speed_insights_runtime_not_observed'))
})

test('rejects unreviewed origin shapes and commit-mismatched evidence', async () => {
  const { probes } = await (async () => {
    const fixture = fixtureFetch(previewOrigins)
    return {
      probes: await collectPostDeployProbes({
        stage: 'preview',
        publicOrigin: previewOrigins.public,
        appOrigin: previewOrigins.app,
        fetchImpl: fixture.fetchImpl,
      }),
    }
  })()
  assert.throws(() => buildPostDeployOperationsReceipt({
    generatedAt,
    stage: 'preview',
    expectedCommit,
    publicOrigin: 'https://supermega.dev',
    appOrigin: previewOrigins.app,
    probes,
  }), /post_deploy_public_preview_origin_invalid/)
  assert.throws(() => buildPostDeployOperationsReceipt({
    generatedAt,
    stage: 'preview',
    expectedCommit,
    publicOrigin: 'https://user:secret@preview.vercel.app',
    appOrigin: previewOrigins.app,
    probes,
  }), /post_deploy_public_origin_invalid/)
  assert.throws(() => buildPostDeployOperationsReceipt({
    generatedAt,
    stage: 'preview',
    expectedCommit,
    publicOrigin: previewOrigins.public,
    appOrigin: previewOrigins.app,
    probes,
    runtimeLogEvidence: runtimeEvidence(previewOrigins, { expectedCommit: 'd'.repeat(40) }),
    runtimeLogSourceDigest: sourceDigests.runtime,
  }), /post_deploy_runtime_log_commit_mismatch/)
})

test('rejects a swapped route matrix and any derived-state or digest tampering', async () => {
  const { packet } = await buildFixture()
  const swapped = structuredClone(packet)
  ;[swapped.probes.routes[0], swapped.probes.routes[1]] = [swapped.probes.routes[1], swapped.probes.routes[0]]
  assert.throws(() => validatePostDeployOperationsReceipt(swapped), /post_deploy_shop_route_probe_invalid_identity/)

  const derivedTamper = structuredClone(packet)
  derivedTamper.operations.status = 'blocked'
  assert.throws(() => validatePostDeployOperationsReceipt(derivedTamper), /post_deploy_operations_derived_state_mismatch/)

  const digestTamper = structuredClone(packet)
  digestTamper.digest = `sha256:${'f'.repeat(64)}`
  assert.throws(() => validatePostDeployOperationsReceipt(digestTamper), /post_deploy_receipt_digest_mismatch/)
})
