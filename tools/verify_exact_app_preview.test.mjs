import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  ROLLBACK_EVIDENCE_CONTRACT,
  RUNTIME_LOG_EVIDENCE_CONTRACT,
  buildPostDeployOperationsReceipt,
  collectPostDeployProbes,
} from './collect_post_deploy_operations_receipt.mjs'
import { sha256Digest } from './rendered_proof_provenance.mjs'
import {
  EXACT_APP_PREVIEW_CASE_MATRIX,
  EXACT_APP_PREVIEW_CONTRACT,
  SHOP_PROFIT_CONTROL_PREVIEW_EXPECTATION,
  buildExactAppPreviewReport,
  collectCurrentVerifierBinding,
  derivePublicHomepageExpectedText,
  loadPublicHomepageExpectedText,
  parseExactAppPreviewArgs,
  probeExactPairedReleaseIdentity,
  validateExactAppPreviewReport,
} from './verify_exact_app_preview.mjs'
import { evaluateFinalRenderedLocation } from './verify_app_entry_rendered.mjs'

const operationsGeneratedAt = '2026-08-28T12:00:00.000Z'
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const reportGeneratedAt = '2026-08-28T12:05:00.000Z'
const expectedCommit = 'a'.repeat(40)
const previousCommit = 'b'.repeat(40)
const verifierCommit = 'c'.repeat(40)
const operationsFileDigest = `sha256:${'f'.repeat(64)}`
const previewOrigins = {
  public: 'https://supermega-public-preview-123.vercel.app',
  app: 'https://megaos-preview-123.vercel.app',
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

const validPublicScriptDirective = `script-src 'self' 'sha256-${'A'.repeat(43)}='`

const publicHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': `base-uri 'self'; frame-ancestors 'none'; object-src 'none'; ${validPublicScriptDirective}`,
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

function clone(value) {
  return structuredClone(value)
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function html(value, headers = appHeaders, status = 200) {
  return new Response(value, { status, headers })
}

function runtimeEvidence(origins = previewOrigins) {
  return {
    contract: RUNTIME_LOG_EVIDENCE_CONTRACT,
    stage: 'preview',
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
  }
}

function rollbackEvidence() {
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
  }
}

function fixtureFetch(origins, { cameraDenied = false } = {}) {
  return async (input) => {
    const url = new URL(input)
    const isPublic = url.origin === origins.public
    const isApp = url.origin === origins.app
    if (!isPublic && !isApp) return new Response('wrong origin', { status: 404 })
    if (url.pathname === '/__release.json') {
      return json(isPublic
        ? { service: 'supermega-public-site', commit: expectedCommit }
        : { service: 'supermega-app', canonicalDomain: 'https://app.supermega.dev', commit: expectedCommit })
    }
    if (url.pathname === '/api/health') {
      if (isPublic) return json({ ok: true, status: 'ready', service: 'supermega-public-site', commit: expectedCommit })
      return json({
        status: 'ready',
        service: 'supermega-service',
        commit: expectedCommit,
        operating_mode: 'isolated_demo',
        enterprise_db_ready: false,
        security_ready: true,
        trial_backend: { write_enabled: false, browser_service_role_exposed: false },
        enterprise_activation: { evidence_ready: false, secret_values_exposed: false },
      })
    }
    if (isPublic && url.pathname === '/') {
      return html('<!doctype html><html><body>SuperMega<script src="/vercel-insights.js"></script></body></html>', publicHeaders)
    }
    if (isApp && ['/shop/', '/plant/', '/website/', '/ecommerce/'].includes(url.pathname)) {
      const headers = cameraDenied
        ? { ...appHeaders, 'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' }
        : appHeaders
      return html('<!doctype html><html><body><div id="root"></div><script src="/vercel-insights.js"></script></body></html>', headers)
    }
    if (url.pathname === '/vercel-insights.js') {
      return new Response(isPublic ? publicLoaderSource : loaderSource, {
        status: 200,
        headers: { 'content-type': 'text/javascript' },
      })
    }
    return new Response('not found', { status: 404 })
  }
}

async function operationsFixture({ origins = previewOrigins, cameraDenied = false, generatedAt = operationsGeneratedAt } = {}) {
  const probes = await collectPostDeployProbes({
    stage: 'preview',
    publicOrigin: origins.public,
    appOrigin: origins.app,
    fetchImpl: fixtureFetch(origins, { cameraDenied }),
  })
  return buildPostDeployOperationsReceipt({
    generatedAt,
    stage: 'preview',
    expectedCommit,
    publicOrigin: origins.public,
    appOrigin: origins.app,
    probes,
    runtimeLogEvidence: runtimeEvidence(origins),
    runtimeLogSourceDigest: sourceDigests.runtime,
    rollbackEvidence: rollbackEvidence(),
    rollbackSourceDigest: sourceDigests.rollback,
  })
}

function rawCase(spec, index) {
  const payload = screenshotPayload(index)
  const profitControl = spec.surface === 'shop_profit_control' ? {
    ok: true,
    fixture: { source: 'fresh_isolated_browser_context', browserStorageHandEdited: false },
    ...SHOP_PROFIT_CONTROL_PREVIEW_EXPECTATION,
    viewportWidth: spec.width,
    viewportHeight: spec.height,
    documentScrollWidth: spec.width,
    accessibility: {
      ok: true,
      requiredMinimumPx: spec.mobile ? 44 : null,
      roundingTolerancePx: spec.mobile ? 0.25 : null,
      checked: 1,
      minimumObservedWidthPx: spec.mobile ? 366 : 640,
      minimumObservedHeightPx: spec.mobile ? 94 : 126,
    },
    network: { externalRequestCount: 0, failedRequestCount: 0 },
  } : null
  return {
    name: spec.id,
    route: spec.route,
    origin: spec.surface === 'public' ? previewOrigins.public : previewOrigins.app,
    hash: '',
    viewport: `${spec.width}x${spec.height}${spec.mobile ? ' mobile' : ''}`,
    path: spec.surface === 'shop' ? '/shop/?tab=counter&template=mini-mart' : spec.route,
    bodyLength: 2048 + index,
    layout: spec.surface === 'shop' ? { ok: true, aboveFold: true, accessibility: { ok: true } } : null,
    profitControl,
    claimBoundary: spec.surface === 'ecommerce' ? { ok: true } : null,
    screenshot: {
      file: spec.screenshot,
      bytes: payload.byteLength,
      digest: sha256Digest(payload),
    },
    browserContextIsolated: true,
    network: { mutatingRequestCount: 0, mutatingRequests: [] },
    runtime: { clean: true, errors: [] },
    ok: true,
    failures: [],
  }
}

function caseIndex(id) {
  const index = EXACT_APP_PREVIEW_CASE_MATRIX.findIndex((entry) => entry.id === id)
  assert.notEqual(index, -1, `missing case ${id}`)
  return index
}

function screenshotPayload(index) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(2048 + index, index + 1),
  ])
}

function screenshotPayloads() {
  return new Map(EXACT_APP_PREVIEW_CASE_MATRIX.map((spec, index) => [spec.screenshot, screenshotPayload(index)]))
}

function provenance() {
  return {
    source: { commit: verifierCommit, tree: 'd'.repeat(40), clean: true },
    verifier: {
      path: 'tools/verify_exact_app_preview.mjs',
      digest: `sha256:${'3'.repeat(64)}`,
      bytes: 48_000,
    },
  }
}

function browserHarness() {
  return {
    path: 'tools/verify_app_entry_rendered.mjs',
    digest: `sha256:${'5'.repeat(64)}`,
    bytes: 42_000,
  }
}

function verifierBinding() {
  return {
    source: provenance().source,
    verifier: provenance().verifier,
    browserHarness: browserHarness(),
  }
}

function releasePair(commit = expectedCommit, origins = previewOrigins) {
  return {
    public: {
      origin: origins.public,
      statusCode: 200,
      service: 'supermega-public-site',
      commit,
      canonicalDomain: null,
    },
    app: {
      origin: origins.app,
      statusCode: 200,
      service: 'supermega-app',
      commit,
      canonicalDomain: 'https://app.supermega.dev',
    },
  }
}

function releaseIdentity() {
  return { before: releasePair(), after: releasePair() }
}

async function reportFixture(options = {}) {
  const operationsPacket = options.operationsPacket || await operationsFixture()
  const report = buildExactAppPreviewReport({
    generatedAt: options.generatedAt || reportGeneratedAt,
    expectedCommit,
    verifierHead: verifierCommit,
    operationsPacket,
    operationsFileDigest,
    provenance: provenance(),
    browserHarness: browserHarness(),
    releaseIdentity: options.releaseIdentity || releaseIdentity(),
    evidence: { directory: '.', report: 'exact-preview.json' },
    browser: 'HeadlessChrome/140.0.0.0',
    cases: options.cases || EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase),
  })
  return { report, operationsPacket }
}

test('requires one exact generation or validation argument set', () => {
  assert.deepEqual(parseExactAppPreviewArgs([
    '--expected-commit', expectedCommit,
    '--verifier-head', verifierCommit,
    '--operations-receipt', 'operations.json',
    '--out', 'evidence/report.json',
    '--screenshot-dir', 'evidence',
  ]), {
    verifyPath: null,
    expectedCommit,
    verifierHead: verifierCommit,
    operationsReceiptPath: 'operations.json',
    outputPath: 'evidence/report.json',
    screenshotDir: 'evidence',
    chromium: null,
  })
  assert.deepEqual(parseExactAppPreviewArgs([
    '--verify', 'report.json',
    '--operations-receipt', 'operations.json',
    '--expected-commit', expectedCommit,
    '--verifier-head', verifierCommit,
  ]).verifyPath, 'report.json')
  assert.throws(
    () => parseExactAppPreviewArgs(['--expected-commit', expectedCommit]),
    /exact_app_preview_arguments_required/,
  )
  assert.throws(
    () => parseExactAppPreviewArgs([
      '--expected-commit', expectedCommit,
      '--expected-commit', expectedCommit,
      '--verifier-head', verifierCommit,
      '--operations-receipt', 'operations.json',
      '--out', 'report.json',
      '--screenshot-dir', 'evidence',
    ]),
    /exact_app_preview_arguments_invalid/,
  )
})

test('builds and validates the exact twelve-case technical preview proof', async () => {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'site-manifest.json'), 'utf8'))
  const generatorSource = await readFile(join(repoRoot, 'tools', 'create_public_vercel_output.mjs'), 'utf8')
  const publicExpectedText = await loadPublicHomepageExpectedText()
  assert.deepEqual(publicExpectedText, [
    'Shop Profit Control: see today’s operating money risk and close one accountable action.',
    'Open Shop Profit Control',
    'Explore all products',
  ])
  assert.deepEqual(
    derivePublicHomepageExpectedText({ manifest, generatorSource }),
    publicExpectedText,
  )
  const changedManifest = clone(manifest)
  changedManifest.company.headline = 'Current source-owned homepage claim.'
  assert.equal(
    derivePublicHomepageExpectedText({ manifest: changedManifest, generatorSource })[0],
    changedManifest.company.headline,
  )
  for (const binding of [
    '${escapeHtml(manifest.company.headline)}',
    '${escapeHtml(SHOP_PROFIT_CONTROL_ACTION.label)}',
    'href="#products">Explore all products</a>',
  ]) {
    assert.throws(
      () => derivePublicHomepageExpectedText({
        manifest,
        generatorSource: generatorSource.replace(binding, 'retired-static-copy'),
      }),
      /exact_app_preview_public_generator_binding_drift/,
    )
  }
  assert.throws(
    () => derivePublicHomepageExpectedText({
      manifest,
      generatorSource: `${generatorSource}\nPick one product and try the working sample.`,
    }),
    /exact_app_preview_public_retired_copy_present/,
  )
  const { report, operationsPacket } = await reportFixture()
  const validation = validateExactAppPreviewReport({
    report,
    operationsPacket,
    operationsFileDigest,
    expectedCommit,
    expectedVerifierHead: verifierCommit,
    verifierBinding: verifierBinding(),
    screenshotPayloads: screenshotPayloads(),
  })
  assert.equal(report.contract, EXACT_APP_PREVIEW_CONTRACT)
  assert.equal(report.cases.length, 12)
  assert.deepEqual(report.cases.map((entry) => entry.id), EXACT_APP_PREVIEW_CASE_MATRIX.map((entry) => entry.id))
  assert.equal(report.cases.every((entry) => entry.mutatingRequestCount === 0), true)
  assert.equal(report.cases.every((entry) => entry.browserContextIsolated === true), true)
  assert.equal(report.gates.cameraPolicyPassed, true)
  assert.equal(report.gates.technicalRenderedPreviewPassed, true)
  assert.equal(report.gates.manualVisualAcceptanceRequired, true)
  assert.equal(report.gates.exactPreviewAccepted, false)
  assert.equal(report.releaseAuthorized, false)
  assert.equal(report.controls.providerMutationRequestsIssued, false)
  assert.equal(report.controls.hostedMutationRequestsObserved, 0)
  assert.equal(Object.hasOwn(report.controls, 'providerWritesPerformed'), false)
  assert.equal(Object.hasOwn(report.controls, 'databaseConnectionsPerformed'), false)
  assert.equal(validation.technicalRenderedPreviewPassed, true)
  assert.equal(validation.screenshots.length, 12)
  assert.equal(validation.exactPreviewAccepted, false)
})

test('rejects swapped, missing, extra, wrong-route, wrong-viewport, and wrong-screenshot cases', async () => {
  const validCases = EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase)
  const swapped = clone(validCases)
  ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
  await assert.rejects(() => reportFixture({ cases: swapped }), /exact_app_preview_case_invalid:public_desktop/)
  await assert.rejects(() => reportFixture({ cases: validCases.slice(1) }), /exact_app_preview_case_matrix_invalid/)
  await assert.rejects(() => reportFixture({ cases: [...validCases, validCases[0]] }), /exact_app_preview_case_matrix_invalid/)
  const wrongViewport = clone(validCases)
  wrongViewport[3].viewport = '391x844 mobile'
  await assert.rejects(() => reportFixture({ cases: wrongViewport }), /exact_app_preview_case_invalid:shop_mobile/)
  const wrongRoute = clone(validCases)
  wrongRoute[2].path = '/shop/?tab=counter&template=mini-mart&unreviewed=true'
  await assert.rejects(() => reportFixture({ cases: wrongRoute }), /exact_app_preview_case_invalid:shop_desktop/)
  const crossOrigin = clone(validCases)
  crossOrigin[0].origin = previewOrigins.app
  await assert.rejects(() => reportFixture({ cases: crossOrigin }), /exact_app_preview_case_invalid:public_desktop/)
  const sharedContext = clone(validCases)
  sharedContext[2].browserContextIsolated = false
  await assert.rejects(() => reportFixture({ cases: sharedContext }), /exact_app_preview_case_invalid:shop_desktop/)
  const wrongScreenshot = clone(validCases)
  wrongScreenshot[caseIndex('website_desktop')].screenshot.file = 'other.png'
  await assert.rejects(() => reportFixture({ cases: wrongScreenshot }), /exact_app_preview_case_screenshot_file_invalid:website_desktop/)
  const duplicateScreenshot = clone(validCases)
  duplicateScreenshot[1].screenshot.bytes = duplicateScreenshot[0].screenshot.bytes
  duplicateScreenshot[1].screenshot.digest = duplicateScreenshot[0].screenshot.digest
  await assert.rejects(() => reportFixture({ cases: duplicateScreenshot }), /exact_app_preview_screenshot_identity_duplicate/)
})

test('rejects the twenty-three Shop Today route, semantic, evidence, and accessibility adversaries', async () => {
  const desktopIndex = caseIndex('shop_profit_control_desktop')
  const mobileIndex = caseIndex('shop_profit_control_mobile')
  const baseCases = EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase)
  const mutate = (change) => {
    const cases = clone(baseCases)
    change(cases, cases[desktopIndex], cases[mobileIndex])
    return cases
  }
  const adversaries = [
    ['missing desktop case', mutate((cases) => cases.splice(desktopIndex, 1)), /exact_app_preview_case_matrix_invalid/],
    ['missing mobile case', mutate((cases) => cases.splice(mobileIndex, 1)), /exact_app_preview_case_matrix_invalid/],
    ['wrong pathname', mutate((cases, desktop) => { desktop.path = '/shop/profit/?tab=today' }), /exact_app_preview_case_invalid:shop_profit_control_desktop/],
    ['missing tab', mutate((cases, desktop) => { desktop.path = '/shop/' }), /exact_app_preview_case_invalid:shop_profit_control_desktop/],
    ['duplicate tab', mutate((cases, desktop) => { desktop.path = '/shop/?tab=today&tab=today' }), /exact_app_preview_case_invalid:shop_profit_control_desktop/],
    ['extra query', mutate((cases, desktop) => { desktop.path = '/shop/?tab=today&template=mini-mart' }), /exact_app_preview_case_invalid:shop_profit_control_desktop/],
    ['non-empty hash', mutate((cases, desktop) => { desktop.hash = '#priority' }), /exact_app_preview_case_invalid:shop_profit_control_desktop/],
    ['controlled state', mutate((cases, desktop) => { desktop.profitControl.state = 'controlled' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing heading', mutate((cases, desktop) => { desktop.profitControl.heading = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing priority title', mutate((cases, desktop) => { desktop.profitControl.priority.title = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['mismatched impact', mutate((cases, desktop) => { desktop.profitControl.priority.impact = 'Unbound claim.' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing accountable owner', mutate((cases, desktop) => { desktop.profitControl.priority.ownerRole = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing due point', mutate((cases, desktop) => { desktop.profitControl.priority.dueLabel = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['mismatched metric', mutate((cases, desktop) => { desktop.profitControl.priority.metric = '1 catalog item' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing action label', mutate((cases, desktop) => { desktop.profitControl.priority.actionLabel = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['wrong action target', mutate((cases, desktop) => { desktop.profitControl.priority.target = '/contact/' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing objective closure', mutate((cases, desktop) => { desktop.profitControl.priority.closureCondition = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['missing read-only boundary', mutate((cases, desktop) => { desktop.profitControl.boundary = '' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['overclaiming boundary', mutate((cases, desktop) => { desktop.profitControl.boundary = 'Profit proven and customer ready.' }), /exact_app_preview_profit_control_semantics_invalid:shop_profit_control_desktop/],
    ['browser storage hand edit', mutate((cases, desktop) => { desktop.profitControl.fixture.browserStorageHandEdited = true }), /exact_app_preview_profit_control_fixture_invalid:shop_profit_control_desktop/],
    ['external request', mutate((cases, desktop) => { desktop.profitControl.network.externalRequestCount = 1 }), /exact_app_preview_profit_control_network_invalid:shop_profit_control_desktop/],
    ['failed request', mutate((cases, desktop) => { desktop.profitControl.network.failedRequestCount = 1 }), /exact_app_preview_profit_control_network_invalid:shop_profit_control_desktop/],
    ['sub-44 mobile target', mutate((cases, desktop, mobile) => { mobile.profitControl.accessibility.minimumObservedHeightPx = 43.5 }), /exact_app_preview_profit_control_accessibility_invalid:shop_profit_control_mobile/],
  ]
  assert.equal(adversaries.length, 23)
  for (const [label, cases, error] of adversaries) {
    await assert.rejects(() => reportFixture({ cases }), error, label)
  }
})

test('rejects browser writes and missing Shop or Ecommerce flow proof', async () => {
  const mutating = EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase)
  mutating[caseIndex('plant_desktop')].network = { mutatingRequestCount: 1, mutatingRequests: [{ method: 'POST', path: '/api/write' }] }
  await assert.rejects(() => reportFixture({ cases: mutating }), /exact_app_preview_browser_write_observed:plant_desktop/)
  const shop = EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase)
  shop[2].layout.aboveFold = false
  await assert.rejects(() => reportFixture({ cases: shop }), /exact_app_preview_shop_flow_invalid:shop_desktop/)
  const ecommerce = EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase)
  ecommerce[caseIndex('ecommerce_desktop')].claimBoundary.ok = false
  await assert.rejects(() => reportFixture({ cases: ecommerce }), /exact_app_preview_ecommerce_claim_invalid:ecommerce_desktop/)
})

test('rejects production aliases, stale evidence, and a blocked camera policy', async () => {
  const productionOrigins = { public: 'https://supermega.dev', app: 'https://app.supermega.dev' }
  await assert.rejects(
    () => operationsFixture({ origins: productionOrigins }).then((operationsPacket) => reportFixture({ operationsPacket })),
    /post_deploy_public_preview_origin_invalid/,
  )
  const stalePacket = await operationsFixture()
  await assert.rejects(
    () => reportFixture({ operationsPacket: stalePacket, generatedAt: '2026-08-28T15:00:00.000Z' }),
    /exact_app_preview_operations_stale/,
  )
  const cameraPacket = await operationsFixture({ cameraDenied: true })
  await assert.rejects(() => reportFixture({ operationsPacket: cameraPacket }), /exact_app_preview_operations_not_passed/)
  const driftedRelease = releaseIdentity()
  driftedRelease.after.app.commit = previousCommit
  await assert.rejects(
    () => reportFixture({ releaseIdentity: driftedRelease }),
    /exact_app_preview_release_evidence_mismatch:app/,
  )
})

test('probes exact nonredirecting paired release identity and rejects redirects or drift', async () => {
  const fetchCalls = []
  const goodFetch = async (input, options) => {
    const url = new URL(input)
    fetchCalls.push({ url: url.toString(), options })
    const isPublic = url.origin === previewOrigins.public
    return new Response(JSON.stringify({
      service: isPublic ? 'supermega-public-site' : 'supermega-app',
      commit: expectedCommit,
      ...(isPublic ? {} : { canonicalDomain: 'https://app.supermega.dev' }),
    }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
  const result = await probeExactPairedReleaseIdentity({
    publicOrigin: previewOrigins.public,
    appOrigin: previewOrigins.app,
    expectedCommit,
    fetchImpl: goodFetch,
  })
  assert.deepEqual(result, releasePair())
  assert.equal(fetchCalls.length, 2)
  for (const call of fetchCalls) {
    assert.equal(new URL(call.url).pathname, '/__release.json')
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.redirect, 'manual')
    assert.equal(call.options.credentials, 'omit')
  }
  await assert.rejects(() => probeExactPairedReleaseIdentity({
    publicOrigin: previewOrigins.public,
    appOrigin: previewOrigins.app,
    expectedCommit,
    fetchImpl: async (input, options) => {
      const url = new URL(input)
      if (url.origin === previewOrigins.public) {
        return new Response('', { status: 307, headers: { location: `${previewOrigins.app}/__release.json` } })
      }
      return goodFetch(input, options)
    },
  }), /exact_app_preview_release_redirect_or_status_invalid:public/)
  await assert.rejects(() => probeExactPairedReleaseIdentity({
    publicOrigin: previewOrigins.public,
    appOrigin: previewOrigins.app,
    expectedCommit,
    fetchImpl: async (input) => {
      const url = new URL(input)
      const isPublic = url.origin === previewOrigins.public
      return new Response(JSON.stringify({
        service: isPublic ? 'supermega-public-site' : 'supermega-app',
        commit: isPublic ? expectedCommit : previousCommit,
        ...(isPublic ? {} : { canonicalDomain: 'https://app.supermega.dev' }),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  }), /exact_app_preview_release_identity_mismatch:app/)
})

test('rejects initial-correct cases that navigate across origins before screenshot capture', () => {
  const expectedPath = '/shop/?tab=counter&template=mini-mart'
  const initialReadyState = { origin: previewOrigins.app, path: expectedPath, hash: '' }
  const initiallyValid = evaluateFinalRenderedLocation({
    beforeCapture: initialReadyState,
    afterCapture: initialReadyState,
    expectedOrigin: previewOrigins.app,
    expectedPath,
  })
  assert.equal(initiallyValid.ok, true)

  const postActionState = {
    origin: 'https://unreviewed-preview.vercel.app',
    path: expectedPath,
    hash: '',
  }
  const postActionNavigation = evaluateFinalRenderedLocation({
    beforeCapture: postActionState,
    afterCapture: postActionState,
    expectedOrigin: previewOrigins.app,
    expectedPath,
  })
  assert.equal(postActionNavigation.ok, false)
  assert.match(postActionNavigation.failures.join(' | '), /expected final origin/)
  assert.equal(postActionNavigation.final.origin, postActionState.origin)

  const duringCaptureNavigation = evaluateFinalRenderedLocation({
    beforeCapture: initialReadyState,
    afterCapture: postActionState,
    expectedOrigin: previewOrigins.app,
    expectedPath,
  })
  assert.equal(duringCaptureNavigation.ok, false)
  assert.match(duringCaptureNavigation.failures.join(' | '), /changed during screenshot capture/)
})

test('fails closed on report, digest, gate, commit, and operations binding tampering', async () => {
  const { report, operationsPacket } = await reportFixture()
  const validate = (
    candidate,
    packet = operationsPacket,
    commit = expectedCommit,
    verifierHead = verifierCommit,
  ) => validateExactAppPreviewReport({
    report: candidate,
    operationsPacket: packet,
    operationsFileDigest,
    expectedCommit: commit,
    expectedVerifierHead: verifierHead,
    verifierBinding: verifierBinding(),
    screenshotPayloads: screenshotPayloads(),
  })
  const widened = clone(report)
  widened.gates.exactPreviewAccepted = true
  assert.throws(() => validate(widened), /exact_app_preview_gates_invalid/)
  const released = clone(report)
  released.releaseAuthorized = true
  assert.throws(() => validate(released), /exact_app_preview_report_contract_invalid/)
  const changedDigest = clone(report)
  changedDigest.digest = `sha256:${'0'.repeat(64)}`
  assert.throws(() => validate(changedDigest), /exact_app_preview_report_digest_mismatch/)
  assert.throws(() => validate(report, operationsPacket, 'd'.repeat(40)), /exact_app_preview_expected_commit_mismatch/)
  assert.throws(
    () => validate(report, operationsPacket, expectedCommit, 'e'.repeat(40)),
    /exact_app_preview_verifier_head_mismatch/,
  )
  const changedOperations = clone(operationsPacket)
  changedOperations.digest = `sha256:${'0'.repeat(64)}`
  assert.throws(() => validate(report, changedOperations), /post_deploy_receipt_digest_mismatch/)
  assert.throws(() => validateExactAppPreviewReport({
    report,
    operationsPacket,
    operationsFileDigest,
    expectedCommit,
    expectedVerifierHead: verifierCommit,
    verifierBinding: verifierBinding(),
    screenshotPayloads: new Map(),
  }), /exact_app_preview_screenshot_payloads_incomplete/)
  const changedScreenshots = screenshotPayloads()
  const firstScreenshot = EXACT_APP_PREVIEW_CASE_MATRIX[0].screenshot
  changedScreenshots.set(firstScreenshot, Buffer.from(changedScreenshots.get(firstScreenshot)).fill(0, 16, 17))
  assert.throws(() => validateExactAppPreviewReport({
    report,
    operationsPacket,
    operationsFileDigest,
    expectedCommit,
    expectedVerifierHead: verifierCommit,
    verifierBinding: verifierBinding(),
    screenshotPayloads: changedScreenshots,
  }), /exact_app_preview_screenshot_payload_mismatch:public_desktop/)
  const dirtyBinding = verifierBinding()
  dirtyBinding.source.clean = false
  assert.throws(
    () => validateExactAppPreviewReport({
      report,
      operationsPacket,
      operationsFileDigest,
      expectedCommit,
      expectedVerifierHead: verifierCommit,
      verifierBinding: dirtyBinding,
      screenshotPayloads: screenshotPayloads(),
    }),
    /exact_app_preview_verifier_source_not_clean/,
  )
  const changedBinding = verifierBinding()
  changedBinding.verifier.digest = `sha256:${'f'.repeat(64)}`
  assert.throws(
    () => validateExactAppPreviewReport({
      report,
      operationsPacket,
      operationsFileDigest,
      expectedCommit,
      expectedVerifierHead: verifierCommit,
      verifierBinding: changedBinding,
      screenshotPayloads: screenshotPayloads(),
    }),
    /exact_app_preview_current_verifier_binding_mismatch/,
  )
})

test('binds no-browser CLI validation to the actual clean verifier checkout and bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-preview-validation-'))
  const dirtyMarker = join(repoRoot, `.exact-app-preview-dirty-test-${process.pid}`)
  try {
    const currentBinding = await collectCurrentVerifierBinding()
    const operationsPacket = await operationsFixture()
    const operationsPayload = `${JSON.stringify(operationsPacket, null, 2)}\n`
    const operationsPath = join(directory, 'operations.json')
    const reportPath = join(directory, 'preview.json')
    const report = buildExactAppPreviewReport({
      generatedAt: reportGeneratedAt,
      expectedCommit,
      verifierHead: currentBinding.source.commit,
      operationsPacket,
      operationsFileDigest: sha256Digest(Buffer.from(operationsPayload)),
      provenance: { source: currentBinding.source, verifier: currentBinding.verifier },
      browserHarness: currentBinding.browserHarness,
      releaseIdentity: releaseIdentity(),
      evidence: { directory: '.', report: 'preview.json' },
      browser: 'HeadlessChrome/140.0.0.0',
      cases: EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase),
    })
    await writeFile(operationsPath, operationsPayload, { flag: 'wx' })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    for (const [file, payload] of screenshotPayloads()) {
      await writeFile(join(directory, file), payload, { flag: 'wx' })
    }
    const result = spawnSync(process.execPath, [
      'tools/verify_exact_app_preview.mjs',
      '--verify', reportPath,
      '--expected-commit', expectedCommit,
      '--verifier-head', currentBinding.source.commit,
      '--operations-receipt', operationsPath,
    ], { cwd: repoRoot, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.ok, true)
    assert.equal(output.technicalRenderedPreviewPassed, true)
    assert.equal(output.exactPreviewAccepted, false)
    assert.equal(output.releaseAuthorized, false)

    const wrongHead = spawnSync(process.execPath, [
      'tools/verify_exact_app_preview.mjs',
      '--verify', reportPath,
      '--expected-commit', expectedCommit,
      '--verifier-head', 'e'.repeat(40),
      '--operations-receipt', operationsPath,
    ], { cwd: repoRoot, encoding: 'utf8' })
    assert.notEqual(wrongHead.status, 0)
    assert.match(wrongHead.stderr, /exact_app_preview_verifier_head_mismatch/)

    const changedReportPath = join(directory, 'preview-changed.json')
    const changedVerifier = clone(currentBinding.verifier)
    changedVerifier.digest = `sha256:${'0'.repeat(64)}`
    const changedReport = buildExactAppPreviewReport({
      generatedAt: reportGeneratedAt,
      expectedCommit,
      verifierHead: currentBinding.source.commit,
      operationsPacket,
      operationsFileDigest: sha256Digest(Buffer.from(operationsPayload)),
      provenance: { source: currentBinding.source, verifier: changedVerifier },
      browserHarness: currentBinding.browserHarness,
      releaseIdentity: releaseIdentity(),
      evidence: { directory: '.', report: 'preview-changed.json' },
      browser: 'HeadlessChrome/140.0.0.0',
      cases: EXACT_APP_PREVIEW_CASE_MATRIX.map(rawCase),
    })
    await writeFile(changedReportPath, `${JSON.stringify(changedReport, null, 2)}\n`, { flag: 'wx' })
    const changedFile = spawnSync(process.execPath, [
      'tools/verify_exact_app_preview.mjs',
      '--verify', changedReportPath,
      '--expected-commit', expectedCommit,
      '--verifier-head', currentBinding.source.commit,
      '--operations-receipt', operationsPath,
    ], { cwd: repoRoot, encoding: 'utf8' })
    assert.notEqual(changedFile.status, 0)
    assert.match(changedFile.stderr, /exact_app_preview_current_verifier_binding_mismatch/)

    await writeFile(dirtyMarker, 'intentional untracked validation marker\n', { flag: 'wx' })
    const dirtyCheckout = spawnSync(process.execPath, [
      'tools/verify_exact_app_preview.mjs',
      '--verify', reportPath,
      '--expected-commit', expectedCommit,
      '--verifier-head', currentBinding.source.commit,
      '--operations-receipt', operationsPath,
    ], { cwd: repoRoot, encoding: 'utf8' })
    assert.notEqual(dirtyCheckout.status, 0)
    assert.match(dirtyCheckout.stderr, /app_entry_rendered_source_tree_dirty/)
  } finally {
    await rm(dirtyMarker, { force: true })
    await rm(directory, { recursive: true, force: true })
  }
})
