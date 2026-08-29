import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  POST_DEPLOY_OPERATIONS_CONTRACT,
  PUBLIC_OBSERVABILITY_VISIBILITY_CONTRACT,
  PUBLIC_OBSERVABILITY_VISIBILITY_ATTESTATION_CONTRACT,
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
  publicObservability: `sha256:${'3'.repeat(64)}`,
  publicObservabilityAttestation: `sha256:${'4'.repeat(64)}`,
}

const compactDigest = (value) => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`

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
  'content-security-policy': `base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'sha256-${'A'.repeat(43)}='`,
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}
const validPublicScriptDirective = `script-src 'self' 'sha256-${'A'.repeat(43)}='`

const loaderSource = `if (/(^|\\.)supermega\\.dev$/.test(location.hostname)) {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments) }
  for (const src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {
    const script = document.createElement('script')
    script.src = src
    document.head.append(script)
  }
}`

const publicLoaderSource = `(function () {
  var hosts = ["supermega.dev","www.supermega.dev"]
  var paths = new Set(["/","/shop/","/plant/","/website/","/ecommerce/","/contact/","/privacy/"])
  if (location.protocol !== 'https:' || !hosts.includes(location.hostname)) return
  function safeEvent(event, expectedType) {
    if (!event || event.type !== expectedType || typeof event.url !== 'string') return null
    var url = new URL(event.url, location.origin)
    if (url.origin !== location.origin || !paths.has(url.pathname)) return null
    var safe = { type: expectedType, url: url.origin + url.pathname }
    if (expectedType === 'vital') safe.route = url.pathname
    return safe
  }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments) }
  window.va('beforeSend', function (event) { return safeEvent(event, 'pageview') })
  window.si('beforeSend', function (event) { return safeEvent(event, 'vital') })
  for (var src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {}
})()`

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

function publicObservabilityEvidence(overrides = {}) {
  return {
    contract: PUBLIC_OBSERVABILITY_VISIBILITY_CONTRACT,
    expectedCommit,
    projectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
    environment: 'production',
    capturedAt: '2026-08-28T11:58:00.000Z',
    window: {
      startedAt: '2026-08-28T11:35:00.000Z',
      endedAt: '2026-08-28T11:55:00.000Z',
    },
    queryMode: 'read_only',
    query: {
      source: 'vercel_observability_dashboard',
      pathAllowlist: ['/', '/shop/', '/plant/', '/website/', '/ecommerce/', '/contact/', '/privacy/'],
      webAnalyticsMetric: 'pageviews',
      speedInsightsMetric: 'core_web_vitals',
    },
    webAnalytics: { status: 'observed', dataPointCount: 1 },
    speedInsights: { status: 'observed', dataPointCount: 1 },
    providerEvidenceDigest: `sha256:${'5'.repeat(64)}`,
    rawEventsRetained: false,
    personalDataRetained: false,
    credentialValuesExposed: false,
    sourcePresenceUsedAsTelemetryEvidence: false,
    providerMutations: 0,
    ...overrides,
  }
}

function publicObservabilityAttestation(visibility, overrides = {}) {
  return {
    contract: PUBLIC_OBSERVABILITY_VISIBILITY_ATTESTATION_CONTRACT,
    expectedCommit,
    projectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
    environment: 'production',
    reviewedAt: '2026-08-28T11:59:00.000Z',
    reviewerRole: 'owner',
    reviewMethod: 'manual_vercel_dashboard',
    reviewOutcome: 'accept',
    visibilitySourceDigest: sourceDigests.publicObservability,
    visibilityReceiptDigest: compactDigest(JSON.stringify(visibility)),
    providerEvidenceDigest: visibility.providerEvidenceDigest,
    providerDashboardReviewed: true,
    queryAndCountsReviewed: true,
    manualAttestationNotCryptographic: true,
    sourcePresenceUsedAsTelemetryEvidence: false,
    rawProviderEvidenceRetained: false,
    credentialValuesExposed: false,
    providerMutations: 0,
    ...overrides,
  }
}

function fixtureFetch(origins, options = {}) {
  const calls = []
  const state = { oversizedBodyCancelled: false }
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
      if (isPublic) return json({ ok: true, status: 'ready', service: 'supermega-public-site', commit: expectedCommit })
      const appHealth = {
            status: 'ready',
            service: 'supermega-service',
            ...(!options.omitAppHealthCommit ? { commit: options.appHealthCommit || expectedCommit } : {}),
            operating_mode: 'isolated_demo',
            enterprise_db_ready: false,
            security_ready: true,
            trial_backend: { write_enabled: false, browser_service_role_exposed: false },
            enterprise_activation: { evidence_ready: false, secret_values_exposed: false },
          }
      return json(appHealth)
    }
    if (isPublic && url.pathname === '/') {
      return html('<!doctype html><html><body>SuperMega<script src="/vercel-insights.js"></script></body></html>', options.publicHeadersMissing
        ? { 'content-type': 'text/html' }
        : options.publicScriptDirective
          ? { ...publicHeaders, 'content-security-policy': `base-uri 'self'; frame-ancestors 'none'; object-src 'none'; ${options.publicScriptDirective}` }
          : publicHeaders)
    }
    if (isApp && ['/shop/', '/plant/', '/website/', '/ecommerce/'].includes(url.pathname)) {
      const headers = options.cameraDenied
        ? { ...appHeaders, 'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' }
        : appHeaders
      return html(options.routeBody || '<!doctype html><html><body><div id="root"></div><script src="/vercel-insights.js"></script></body></html>', headers)
    }
    if (isApp && url.pathname === '/vercel-insights.js') {
      if (options.oversizedLoader) {
        let chunksSent = 0
        const body = new ReadableStream({
          pull(controller) {
            if (chunksSent >= 3) return controller.close()
            chunksSent += 1
            controller.enqueue(new Uint8Array(600 * 1024).fill(65))
          },
          cancel() {
            state.oversizedBodyCancelled = true
          },
        })
        return new Response(body, { status: 200, headers: { 'content-type': 'text/javascript' } })
      }
      const source = options.loaderWithoutSpeed
        ? loaderSource.replace("'/_vercel/speed-insights/script.js'", "'/disabled-speed-insights.js'")
        : loaderSource
      return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript' } })
    }
    if (isPublic && url.pathname === '/vercel-insights.js') {
      const source = options.publicLoaderInvalid
        ? publicLoaderSource.replace("safeEvent(event, 'vital')", "safeEvent(event, 'custom')")
        : publicLoaderSource
      return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript' } })
    }
    if (url.pathname === '/_vercel/insights/script.js') {
      if (options.providerHtmlFallback || (isPublic && options.publicProviderHtmlFallback)) {
        return html('<!doctype html><html><body><div id="root"></div></body></html>')
      }
      return new Response("window.va=function(){};window.vaq=[];fetch('/_vercel/insights/view')", {
        status: 200,
        headers: { 'content-type': 'text/javascript' },
      })
    }
    if (url.pathname === '/_vercel/speed-insights/script.js') {
      if (options.providerHtmlFallback || (isPublic && options.publicProviderHtmlFallback)) {
        return html('<!doctype html><html><body><div id="root"></div></body></html>')
      }
      const missing = options.speedRuntimeMissing || (isPublic && options.publicSpeedRuntimeMissing)
      return new Response(missing ? '' : "window.si=function(){};window.siq=[];const source='web-vitals'", {
        status: missing ? 404 : 200,
        headers: { 'content-type': 'text/javascript' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, calls, state }
}

async function buildFixture({
  stage = 'preview',
  origins = previewOrigins,
  fetchOptions = {},
  runtime = runtimeEvidence(origins),
  rollback = rollbackEvidence(),
  publicObservability = stage === 'production' ? publicObservabilityEvidence() : null,
  publicObservabilityReview = publicObservability ? publicObservabilityAttestation(publicObservability) : null,
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
    publicObservabilityVisibilityEvidence: publicObservability,
    publicObservabilityVisibilitySourceDigest: publicObservability ? sourceDigests.publicObservability : null,
    publicObservabilityVisibilityAttestation: publicObservabilityReview,
    publicObservabilityVisibilityAttestationSourceDigest: publicObservabilityReview
      ? sourceDigests.publicObservabilityAttestation
      : null,
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
  assert.equal(calls.length, 11)
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
  assert.equal(packet.operations.gates.filter((gate) => !['runtime_error_scan', 'paired_rollback_readiness'].includes(gate.id))
    .every((gate) => gate.status === 'pass'), true)
  validatePostDeployOperationsReceipt(packet)
})

test('blocks release drift, missing public headers, denied camera access, and a missing Speed Insights bootstrap', async () => {
  const { packet } = await buildFixture({
    fetchOptions: { appCommit: 'c'.repeat(40), publicHeadersMissing: true, cameraDenied: true, loaderWithoutSpeed: true },
  })
  assert.ok(packet.operations.blockers.includes('app_release_commit_mismatch'))
  assert.ok(packet.operations.blockers.includes('public_home_security_headers_invalid'))
  assert.ok(packet.operations.blockers.includes('shop_security_headers_invalid'))
  assert.ok(packet.operations.blockers.includes('app_speed_insights_bootstrap_invalid'))
  assert.equal(packet.operations.status, 'blocked')

  for (const publicScriptDirective of [
    "script-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'; ${validPublicScriptDirective}`,
    `script-src https://scripts.example.test; ${validPublicScriptDirective}`,
  ]) {
    const unsafeScript = await buildFixture({ fetchOptions: { publicScriptDirective } })
    assert.ok(unsafeScript.packet.operations.blockers.includes('public_home_security_headers_invalid'))
    assert.equal(unsafeScript.packet.probes.publicHome.headers.scriptSourcesRestricted, false)
  }
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

test('requires app health to carry the exact candidate commit', async () => {
  const missing = await buildFixture({ fetchOptions: { omitAppHealthCommit: true } })
  assert.ok(missing.packet.operations.blockers.includes('app_health_commit_missing'))
  const stale = await buildFixture({ fetchOptions: { appHealthCommit: 'd'.repeat(40) } })
  assert.ok(stale.packet.operations.blockers.includes('app_health_commit_mismatch'))
})

test('rejects rollback targets that point to the candidate instead of a prior release', async () => {
  const rollback = rollbackEvidence()
  rollback.targets = rollback.targets.map((target) => ({ ...target, commit: expectedCommit }))
  const { packet } = await buildFixture({ rollback })
  assert.ok(packet.operations.blockers.includes('public_rollback_points_to_candidate'))
  assert.ok(packet.operations.blockers.includes('app_rollback_points_to_candidate'))
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'paired_rollback_readiness').status, 'blocked')

  const mismatchedPair = rollbackEvidence()
  mismatchedPair.targets[1] = { ...mismatchedPair.targets[1], commit: 'c'.repeat(40) }
  const mismatch = await buildFixture({ rollback: mismatchedPair })
  assert.ok(mismatch.packet.operations.blockers.includes('paired_rollback_commit_mismatch'))
})

test('production receipt additionally probes both live Vercel observability scripts', async () => {
  const { packet, calls } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
  })
  assert.equal(packet.operations.status, 'pass')
  assert.equal(calls.length, 15)
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.app}/_vercel/insights/script.js`))
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.app}/_vercel/speed-insights/script.js`))
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.public}/_vercel/insights/script.js`))
  assert.ok(calls.some(({ url }) => url === `${productionOrigins.public}/_vercel/speed-insights/script.js`))
})

test('production source delivery cannot self-assert provider-visible public telemetry', async () => {
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability: null,
  })
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_web_analytics_delivery_ready').status, 'pass')
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_speed_insights_delivery_ready').status, 'pass')
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_web_analytics_provider_visibility_owner_attested').status, 'blocked')
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_speed_insights_provider_visibility_owner_attested').status, 'blocked')
  assert.deepEqual(packet.operations.blockers.filter((blocker) => blocker === 'public_observability_visibility_receipt_missing'), [
    'public_observability_visibility_receipt_missing',
  ])
})

test('a shape-valid count receipt cannot pass without a separate owner dashboard attestation', async () => {
  const publicObservability = publicObservabilityEvidence()
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability,
    publicObservabilityReview: null,
  })
  assert.equal(packet.evidence.publicObservability.receipt.webAnalytics.status, 'observed')
  assert.equal(packet.evidence.publicObservabilityAttestation, null)
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_web_analytics_provider_visibility_owner_attested').status, 'blocked')
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_speed_insights_provider_visibility_owner_attested').status, 'blocked')
  assert.deepEqual(packet.operations.blockers.filter((blocker) => blocker === 'public_observability_owner_attestation_missing'), [
    'public_observability_owner_attestation_missing',
  ])
})

test('production provider visibility stays blocked until each read-only signal is observed', async () => {
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability: publicObservabilityEvidence({
      webAnalytics: { status: 'observed', dataPointCount: 2 },
      speedInsights: { status: 'not_observed', dataPointCount: 0 },
    }),
  })
  assert.equal(packet.operations.gates.find((gate) => gate.id === 'public_web_analytics_provider_visibility_owner_attested').status, 'pass')
  assert.deepEqual(packet.operations.gates.find((gate) => gate.id === 'public_speed_insights_provider_visibility_owner_attested').blockers, [
    'public_speed_insights_not_observed',
  ])
  assert.equal(packet.evidence.publicObservability.receipt.sourcePresenceUsedAsTelemetryEvidence, false)
})

test('rejects visibility evidence that treats source presence as observed telemetry or is commit-mismatched', async () => {
  await assert.rejects(() => buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability: publicObservabilityEvidence({ sourcePresenceUsedAsTelemetryEvidence: true }),
  }), /post_deploy_public_observability_controls_invalid/)
  await assert.rejects(() => buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability: publicObservabilityEvidence({ expectedCommit: 'c'.repeat(40) }),
  }), /post_deploy_public_observability_commit_mismatch/)
})

test('rejects an owner attestation that does not bind the exact visibility receipt and provider evidence', async () => {
  const publicObservability = publicObservabilityEvidence()
  await assert.rejects(() => buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability,
    publicObservabilityReview: publicObservabilityAttestation(publicObservability, {
      visibilityReceiptDigest: `sha256:${'6'.repeat(64)}`,
    }),
  }), /post_deploy_public_observability_attestation_binding_mismatch/)
  await assert.rejects(() => buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability,
    publicObservabilityReview: publicObservabilityAttestation(publicObservability, {
      providerEvidenceDigest: `sha256:${'7'.repeat(64)}`,
    }),
  }), /post_deploy_public_observability_attestation_binding_mismatch/)
})

test('an owner-rejected dashboard attestation keeps both visibility gates blocked', async () => {
  const publicObservability = publicObservabilityEvidence()
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability,
    publicObservabilityReview: publicObservabilityAttestation(publicObservability, { reviewOutcome: 'reject' }),
  })
  assert.ok(packet.operations.blockers.includes('public_observability_owner_attestation_rejected'))
  assert.equal(packet.operations.status, 'blocked')
})

test('blocks a stale provider-visibility receipt and an invalid public bootstrap independently', async () => {
  const stale = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    publicObservability: publicObservabilityEvidence({
      window: { startedAt: '2026-08-28T07:30:00.000Z', endedAt: '2026-08-28T07:55:00.000Z' },
    }),
  })
  assert.ok(stale.packet.operations.blockers.includes('public_observability_visibility_receipt_stale'))

  const invalidSource = await buildFixture({ fetchOptions: { publicLoaderInvalid: true } })
  assert.ok(invalidSource.packet.operations.blockers.includes('public_speed_insights_source_contract_invalid'))
  assert.equal(invalidSource.packet.operations.gates.find((gate) => gate.id === 'public_web_analytics_delivery_ready').status, 'pass')
})

test('production receipt blocks when the Speed Insights runtime endpoint is absent', async () => {
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    fetchOptions: { speedRuntimeMissing: true },
  })
  assert.ok(packet.operations.blockers.includes('app_speed_insights_provider_script_unavailable'))
  assert.ok(packet.operations.blockers.includes('public_speed_insights_provider_script_unavailable'))
})

test('a 200 HTML app-shell fallback cannot satisfy either provider-script gate', async () => {
  const { packet } = await buildFixture({
    stage: 'production',
    origins: productionOrigins,
    runtime: runtimeEvidence(productionOrigins),
    fetchOptions: { providerHtmlFallback: true },
  })
  assert.ok(packet.operations.blockers.includes('app_web_analytics_provider_script_unavailable'))
  assert.ok(packet.operations.blockers.includes('app_speed_insights_provider_script_unavailable'))
  assert.ok(packet.operations.blockers.includes('public_web_analytics_provider_script_unavailable'))
  assert.ok(packet.operations.blockers.includes('public_speed_insights_provider_script_unavailable'))
  assert.equal(packet.probes.observability.providerRuntime.webAnalytics.javascript, false)
  assert.equal(packet.probes.observability.providerRuntime.speedInsights.javascript, false)
})

test('cancels an oversized chunked response as soon as the hard byte cap is exceeded', async () => {
  const { packet, state } = await buildFixture({ fetchOptions: { oversizedLoader: true } })
  assert.equal(state.oversizedBodyCancelled, true)
  assert.ok(packet.operations.blockers.includes('app_web_analytics_bootstrap_invalid'))
  assert.ok(packet.operations.blockers.includes('app_speed_insights_bootstrap_invalid'))
  assert.equal(packet.probes.observability.loader.javascript, false)
})

test('route probes reject credential-bearing URLs without source-stored password fixtures', async () => {
  const credentialUrl = [
    'https',
    String.fromCharCode(58, 47, 47),
    'fixture-user',
    String.fromCharCode(58),
    'fixture-value',
    String.fromCharCode(64),
    'example.test/private',
  ].join('')
  const routeBodies = [
    credentialUrl,
    `[${credentialUrl}]`,
    `(${credentialUrl}).`,
    `${credentialUrl}${']'.repeat(9)}`,
    `https://safe.example/?next=${credentialUrl}`,
  ]
  for (const routeBody of routeBodies) {
    const { packet } = await buildFixture({ fetchOptions: { routeBody } })
    assert.equal(packet.probes.routes.every((route) => route.responseSafe === false), true)
    assert.deepEqual(packet.operations.blockers.filter((blocker) => blocker.endsWith('_route_shell_invalid')), [
      'shop_route_shell_invalid',
      'plant_route_shell_invalid',
      'website_route_shell_invalid',
      'ecommerce_route_shell_invalid',
    ])
  }
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
  const credentialBearingOrigin = [
    'https',
    String.fromCharCode(58, 47, 47),
    'fixture-user',
    String.fromCharCode(58),
    'fixture-value',
    String.fromCharCode(64),
    'preview.example.test',
  ].join('')
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
    publicOrigin: credentialBearingOrigin,
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
