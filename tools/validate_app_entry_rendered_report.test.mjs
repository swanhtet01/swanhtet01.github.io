import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { counterCaptureReady, isAccountableConfirmLabel, receiptBoundaryVisible, stableRenderedPathMismatch, summarizeRenderedCase, summarizeRenderedFailures, unauthenticatedEntryContract } from './verify_app_entry_rendered.mjs'
import { RETIRED_PRODUCT_CASES, RETIRED_PRODUCT_PREVIEW_POLICY } from './retired_product_preview_policy.mjs'
import { isStoreToShopReviewPath, storeToShopReviewPath } from './store_to_shop_route.mjs'

const renderedVerifierSource = await readFile(new URL('./verify_app_entry_rendered.mjs', import.meta.url), 'utf8')

test('receipt boundary must be visibly sized and inside the viewport', () => {
  const box = { top: 10, left: 10, bottom: 40, right: 300, width: 290, height: 30 }
  const style = { display: 'block', visibility: 'visible', opacity: '1' }
  assert.equal(receiptBoundaryVisible(box, 390, 844, style), true)
  for (const altered of [{ width: 0 }, { height: 0 }, { left: -5 }, { right: 400 }, { bottom: 900 }]) {
    assert.equal(receiptBoundaryVisible({ ...box, ...altered }, 390, 844, style), false)
  }
  for (const altered of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }]) {
    assert.equal(receiptBoundaryVisible(box, 390, 844, { ...style, ...altered }), false)
  }
  assert.equal(receiptBoundaryVisible(null, 390, 844, style), false)
})

test('rendered CI diagnostics expose only fixed failure kinds, never page or runtime text', () => {
  const summary = summarizeRenderedFailures([
    { name: 'desktop synthetic route', failures: ['missing text: Swan Htet private account', 'console: secret-token-value'] },
    { name: 'passing route', failures: [] },
    { name: 'mobile layout', failures: ['horizontal overflow: 412px document in 390px viewport'] },
  ])
  assert.deepEqual(summary, [
    { name: 'desktop synthetic route', failedCheckCount: 2, failureKinds: ['content', 'runtime'] },
    { name: 'mobile layout', failedCheckCount: 1, failureKinds: ['layout'] },
  ])
  assert.doesNotMatch(JSON.stringify(summary), /Swan Htet|secret-token-value|412px/u)
})

test('rendered route diagnostics classify safe route groups without exposing paths or query values', () => {
  const summary = summarizeRenderedCase({ expectedPath: '/shop/?tab=counter', expectedText: ['Products'] }, {
    path: '/login?token=secret-value', bodyLength: 24, failures: ['path mismatch', 'missing text: Products'],
  })
  assert.equal(summary.expectedPathMatched, false)
  assert.equal(summary.actualRouteClass, 'login')
  assert.doesNotMatch(JSON.stringify(summary), /secret-value|token=/u)
})

test('renderer stops waiting only after a non-empty wrong route stays stable', () => {
  assert.equal(stableRenderedPathMismatch({ expectedPath: '/', path: '/login', previousPath: '/login', bodyLength: 20, consecutiveMismatchCount: 5 }), true)
  assert.equal(stableRenderedPathMismatch({ expectedPath: '/', path: '/login', previousPath: '/shop/', bodyLength: 20, consecutiveMismatchCount: 5 }), false)
  assert.equal(stableRenderedPathMismatch({ expectedPath: '/', path: '/login', previousPath: '/login', bodyLength: 0, consecutiveMismatchCount: 5 }), false)
  assert.equal(stableRenderedPathMismatch({ expectedPath: '/', path: '/', previousPath: '/', bodyLength: 20, consecutiveMismatchCount: 5 }), false)
})

test('unauthenticated product routes expect sign-in and reject protected fixture copy', () => {
  const shop = unauthenticatedEntryContract({ route: '/shop/?template=mini-mart', width: 1280, height: 900,
    expectedText: ['Products', 'Premium rice 25kg'], absentText: ['PRIVATE DEVICE'], exerciseShopCounter: true,
    screenshotName: 'shop-counter' }, 5)
  assert.equal(shop.expectedPath, '/login?product=shop')
  assert.deepEqual(shop.expectedText, ['Login', 'Login is currently unavailable.'])
  assert.deepEqual(shop.absentText, ['PRIVATE DEVICE', 'Premium rice 25kg'])
  assert.equal('exerciseShopCounter' in shop, false)
  assert.equal('screenshotName' in shop, false)
  const home = unauthenticatedEntryContract({ route: '/?choose=1', width: 390, height: 844 })
  assert.equal(home.expectedPath, '/login')
  const settings = unauthenticatedEntryContract({ route: '/settings/?product=production', width: 1280, height: 900,
    expectedText: ['Pages', 'Home', 'Catalog', 'Contact', 'Page checks', 'View website'], absentText: ['Open demo', 'Start trial'] })
  assert.equal(settings.expectedPath, '/login?product=plant')
  assert.deepEqual(settings.absentText, ['Open demo', 'Start trial'])
})

test('rendered CI route diagnostics expose only match booleans and text-miss counts', () => {
  const summary = summarizeRenderedCase({ expectedPath: '/login', expectedText: ['Sign in'] }, {
    name: 'synthetic login',
    path: '/unexpected/?token=secret',
    bodyLength: 18,
    failures: ['expected final path /login, got /unexpected/?token=secret', 'missing text: private email@example.com'],
  })
  assert.deepEqual(summary, {
    name: 'synthetic login',
    failedCheckCount: 2,
    failureKinds: ['content', 'route'],
    bodyPresent: true,
    expectedPathMatched: false,
    actualRouteClass: 'other',
    missingExpectedTextCount: 1,
    unexpectedTextCount: 0,
  })
  assert.doesNotMatch(JSON.stringify(summary), /token=secret|private|email@example/u)
})

test('rendered harness follows current direct Sites and Ecommerce entry actions', () => {
  assert.match(renderedVerifierSource, /submit\?\.textContent\.trim\(\) !== 'Save request locally'/)
  assert.match(renderedVerifierSource, /'Start your website'/)
  assert.match(renderedVerifierSource, /'Create my website'/)
  assert.doesNotMatch(renderedVerifierSource, /'Prepare private draft'/)
  assert.doesNotMatch(renderedVerifierSource, /'Start sample order'/)
  assert.doesNotMatch(renderedVerifierSource, /'The working sample stays unchanged until you choose Customize demo\.'/)
})

test('counter capture waits for persisted basket readiness without accepting disabled controls', () => {
  const ready = { text: 'PAYMENT Keep as open order Total Review & complete sale', payment: {}, openOrderChoice: {},
    total: {}, reviewButton: {}, drawerTransitionSettled: true, accessibility: { ok: true } }
  assert.equal(counterCaptureReady(ready), true)
  for (const pending of [null, { ...ready, accessibility: { ok: false } }, { ...ready, reviewButton: null },
    { ...ready, drawerTransitionSettled: false }, { ...ready, text: '' }]) {
    assert.equal(counterCaptureReady(pending), false)
  }
})

test('Store-to-Shop accepts only the exact source-bound review route and semantic confirm label', () => {
  const requestId = 'ECR-REQUEST / 001'
  const path = storeToShopReviewPath(requestId)
  assert.equal(isStoreToShopReviewPath(path, requestId), true)
  assert.equal(isStoreToShopReviewPath('/shop/?handoff=order&handoff_id=ECR-REQUEST+%2F+001&source=ecommerce-handoff&tab=orders', requestId), true)
  for (const invalid of [
    '/shop/?tab=orders',
    '/shop/?tab=orders&source=ecommerce-handoff&handoff=order&handoff_id=OTHER',
    `${path}&extra=1`,
    `${path}&tab=orders`,
    `/other/${path.slice('/shop/'.length)}`,
  ]) assert.equal(isStoreToShopReviewPath(invalid, requestId), false)

  assert.equal(isAccountableConfirmLabel('Confirm change'), true)
  assert.equal(isAccountableConfirmLabel('Confirm change · အတည်ပြုမည်'), true)
  assert.equal(isAccountableConfirmLabel('Confirm'), false)
  assert.equal(isAccountableConfirmLabel('Confirm change later'), false)
})

test('accounting export evidence requires a real isolated CSV download contract', () => {
  const checks = Object.fromEntries([
    'controlVisible', 'controlNamed', 'mappingReviewed', 'filenameBounded', 'bomPresent',
    'schemaPresent', 'closeIdPresent', 'reviewBoundaryPresent', 'businessDatePresent', 'noHorizontalOverflow',
  ].map((name) => [name, true]))
  const accountingExport = {
    ok: true,
    checks,
    file: 'downloads/supermega-shop-accounting-2026-07-23-deadbeef.csv',
    filename: 'supermega-shop-accounting-2026-07-23-deadbeef.csv',
    bytes: 512,
    digest: `sha256:${'a'.repeat(64)}`,
    schema: 'supermega.commerce.accounting-handoff.v3',
    businessDate: '2026-07-23',
    viewportWidth: 1280,
    viewportHeight: 900,
    documentScrollWidth: 1280,
  }
  const expected = { name: 'Shop Today downloads a completed accounting handoff', width: 1280, height: 900, semantics: 'shop-accounting-export' }
  const entry = {
    ok: true,
    failures: [],
    runtime: { clean: true, errors: [] },
    bodyLength: 100,
    path: '/shop/?tab=today',
    viewport: '1280x900',
    rendered: { viewportWidth: 1280, viewportHeight: 900, documentScrollWidth: 1280, noHorizontalOverflow: true },
    network: { mutatingRequestCount: 0, mutatingRequests: [] },
    browserContextIsolated: true,
    accountingExport,
  }
  assert.doesNotThrow(() => assertCaseSemantics(entry, expected))
  assert.throws(() => assertCaseSemantics({ ...entry, accountingExport: { ...accountingExport, checks: { ...checks, mappingReviewed: false } } }, expected), /shop_accounting_export_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, accountingExport: { ...accountingExport, file: '../outside.csv' } }, expected), /shop_accounting_export_failed/)
})

test('offline restore evidence requires a controlled cached reload with preserved business records', () => {
  const checks = Object.fromEntries([
    'serviceWorkerSupported', 'serviceWorkerReady', 'controllerActive', 'sealedCachePresent',
    'offlineModeActive', 'routeRestored', 'businessRecordRestored', 'storageRecordPreserved',
    'expectedFallbackTransportFailure', 'noHorizontalOverflow',
  ].map((name) => [name, true]))
  const offlineRestore = {
    ok: true,
    checks,
    controllerScript: '/sw.js',
    cacheCount: 1,
    cacheEntryCount: 37,
    transportFailureCount: 1,
    viewportWidth: 1280,
    viewportHeight: 900,
    documentScrollWidth: 1280,
  }
  const expected = { name: 'Shop Today reloads the current business offline', width: 1280, height: 900, semantics: 'shop-offline-restore' }
  const entry = {
    ok: true,
    failures: [],
    runtime: { clean: true, errors: [] },
    bodyLength: 100,
    path: '/shop/?tab=today',
    viewport: '1280x900',
    rendered: { viewportWidth: 1280, viewportHeight: 900, documentScrollWidth: 1280, noHorizontalOverflow: true },
    network: { mutatingRequestCount: 0, mutatingRequests: [] },
    browserContextIsolated: true,
    offlineRestore,
  }
  assert.doesNotThrow(() => assertCaseSemantics(entry, expected))
  assert.throws(() => assertCaseSemantics({ ...entry, offlineRestore: { ...offlineRestore, checks: { ...checks, storageRecordPreserved: false } } }, expected), /shop_offline_restore_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, offlineRestore: { ...offlineRestore, controllerScript: '/other-sw.js' } }, expected), /shop_offline_restore_failed/)
})

test('Store-to-Shop evidence requires one source-bound pending-payment order after reload', () => {
  const checks = Object.fromEntries([
    'localRequestCaptured', 'sameDeviceHandoff', 'exactSourcePrepared', 'accountableSourceBound',
    'confirmedOnce', 'paymentStillPending', 'stockReservedOnce', 'sourceRetained', 'replayBlocked',
    'accountableOwner', 'accountableActionRecorded', 'persistedAfterReload', 'operatorViewRestored', 'noHorizontalOverflow',
  ].map((name) => [name, true]))
  const source = {
    requestId: 'WEB-REQUEST-001', requestCount: 1, recoveryKeyCount: 1, sharedRequestCountBefore: 0,
    customer: 'May Thiri', customerReference: 'May Thiri · 09123456789', fulfilment: 'pickup',
    handoffReference: 'WEB-REQUEST-001', payment: 'Cash', totalMmk: 1_000,
    lines: [{ sku: 'SKU-001', name: 'Tea', variant: null, quantity: 1, unitPriceMmk: 1_000, lineTotalMmk: 1_000 }],
    sku: 'SKU-001', quantity: 1, stockBefore: 12, orderCountBefore: 0, actionCountBefore: 0,
  }
  const action = { orderId: 'ORD-001', accountableActionCount: 1, orderCreateActionIds: ['ACT-001'], actionId: 'ACT-001', commandId: 'CMD-001', actionActor: 'Shop reviewer', actionReason: 'Reviewed current Shop catalog.', actionEvidenceReference: `ECOMMERCE:${source.requestId}:reviewed`, actionSubjectId: 'ORD-001' }
  const reviewPath = storeToShopReviewPath(source.requestId)
  const committed = { route: '/shop/?tab=orders', matchingOrderCount: 1, orderStatus: 'confirmed', paymentStatus: 'pending', owner: 'Shop reviewer', stockAfter: 11, sourceRequestCopies: 1, sharedInboxRequestCount: 0, ...action }
  const restored = { route: '/shop/?tab=orders', matchingOrderCount: 1, orderStatus: 'confirmed', paymentStatus: 'pending', owner: 'Shop reviewer', stockAfter: 11, sourceRequestCopies: 1, sharedInboxRequestCount: 0, ...action }
  const storeToShop = {
    ok: true,
    checks,
    claimBoundary: { ok: true },
    source,
    handoff: { ready: true, sourceVisible: true },
    prepared: {
      ready: true, route: reviewPath, sourceBound: true, customer: source.customer,
      fulfilment: source.fulfilment, handoffReference: source.handoffReference,
      lines: source.lines.map((line) => ({ ...line })), totalMmk: source.totalMmk,
      paymentLocked: true, payment: source.payment,
    },
    gate: { ready: true, summaryBound: true, actor: 'Shop reviewer', reasonPresent: true, sourceEvidenceBound: true, evidenceReference: action.actionEvidenceReference },
    network: { externalRequestCount: 0, failedRequestCount: 0, httpErrorResponseCount: 0 },
    committed,
    restored,
    replay: { attempted: true, route: reviewPath, duplicateBlocked: true, gateOpened: false, matchingOrderCount: 1, accountableActionCount: 1, orderCreateActionIds: ['ACT-001'], orderId: 'ORD-001', stockAfter: 11, sourceRequestCopies: 1, sharedInboxRequestCount: 0 },
    viewportWidth: 1280,
    viewportHeight: 900,
    documentScrollWidth: 1280,
  }
  const expected = { name: 'Commerce request becomes one accountable Shop order', path: '/shop/?tab=orders', width: 1280, height: 900, semantics: 'store-to-shop' }
  const entry = {
    ok: true,
    failures: [],
    runtime: { clean: true, errors: [] },
    bodyLength: 100,
    path: '/shop/?tab=orders',
    viewport: '1280x900',
    rendered: { viewportWidth: 1280, viewportHeight: 900, documentScrollWidth: 1280, noHorizontalOverflow: true },
    network: { mutatingRequestCount: 0, mutatingRequests: [] },
    browserContextIsolated: true,
    storeToShop,
  }
  assert.doesNotThrow(() => assertCaseSemantics(entry, expected))
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, restored: { ...restored, paymentStatus: 'reconciled' } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, committed: { ...committed, matchingOrderCount: 2 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, handoff: { ...storeToShop.handoff, sourceVisible: false } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, sourceBound: false } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, customer: 'Other customer' } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, fulfilment: 'delivery' } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, handoffReference: 'OTHER-REFERENCE' } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, lines: [{ ...source.lines[0], unitPriceMmk: 900, lineTotalMmk: 900 }] } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, totalMmk: 900 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, prepared: { ...storeToShop.prepared, payment: 'KBZPay' } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, gate: { ...storeToShop.gate, sourceEvidenceBound: false } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, network: { ...storeToShop.network, externalRequestCount: 1 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, network: { ...storeToShop.network, httpErrorResponseCount: 1 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, replay: { ...storeToShop.replay, matchingOrderCount: 2 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, replay: { ...storeToShop.replay, accountableActionCount: 2 } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, replay: { ...storeToShop.replay, orderCreateActionIds: ['ACT-001', 'ACT-REPLAY'] } } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, replay: { ...storeToShop.replay, stockAfter: 10 } } }, expected), /store_to_shop_failed/)
  const tamperedEvidence = `${storeToShop.gate.evidenceReference}:tampered`
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: {
    ...storeToShop,
    committed: { ...committed, actionEvidenceReference: tamperedEvidence },
    restored: { ...restored, actionEvidenceReference: tamperedEvidence },
  } }, expected), /store_to_shop_failed/)
  assert.throws(() => assertCaseSemantics({ ...entry, storeToShop: { ...storeToShop, restored: { ...restored, commandId: 'CMD-OTHER' } } }, expected), /store_to_shop_failed/)
})

import {
  APP_ENTRY_RENDERED_CONTRACT,
  buildScreenshotEvidence,
  collectDirectoryManifest,
  collectRenderedProofProvenance,
  signedRenderedProof,
} from './rendered_proof_provenance.mjs'
import {
  APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
  assertCaseSemantics,
  assertLauncherProductLinks,
  assertRenderedProofCaseMatrix,
  parseRenderedProofValidationArgs,
  validateRenderedProofReport,
} from './validate_app_entry_rendered_report.mjs'

function runGit(directory, args) {
  const result = spawnSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  return String(result.stdout || '').trim()
}

test('login entry evidence rejects every visible workspace-product card in the disk consumer', () => {
  const links = [{ name: 'Shop', href: '/shop/' }, { name: 'Ecommerce', href: '/ecommerce/' }, { name: 'Website', href: '/website/' }]
  assert.doesNotThrow(() => assertLauncherProductLinks(links))
  const invalid = [undefined, [], links.slice(0, 2), [...links, { name: 'Plant', href: '/plant/' }],
    [links[1], links[0], links[2]], [links[0], links[0], links[2]],
    [links[0], { name: 'Ecommerce', href: '/login' }, links[2]]]
  for (const name of ['desktop root presents login despite remembered product', 'desktop choose query presents login', 'mobile root presents login']) {
    const visibleLinks = []
    const width = name.startsWith('mobile') ? 390 : 1280
    const height = width === 390 ? 844 : 900
    const expected = { name, width, height }
    const entry = { ok: true, failures: [], runtime: { clean: true, errors: [] }, bodyLength: 100,
      path: '/', viewport: `${width}x${height}`, network: { mutatingRequestCount: 0, mutatingRequests: [] },
      rendered: { viewportWidth: width, viewportHeight: height, documentScrollWidth: width, noHorizontalOverflow: true, launcherLinks: visibleLinks } }
    assert.doesNotThrow(() => assertCaseSemantics(entry, expected))
    for (const wrong of [undefined, links, ...invalid.filter(value => value?.length),
      [[links[0]], [{ name: 'Shop', href: '/login' }]]]) {
      assert.throws(() => assertCaseSemantics({ ...entry, rendered: { ...entry.rendered, launcherLinks: wrong } }, expected), /launcher_products_mismatch/)
    }
  }
})

function ecommerceCase({ file, screenshot, viewport, width, height }) {
  return {
    name: width === 1280
      ? 'desktop Ecommerce keeps a reviewed order request locally'
      : 'mobile Ecommerce keeps a reviewed order request locally',
    route: '/ecommerce/?workspace=1',
    viewport,
    path: '/ecommerce/',
    bodyLength: 500,
    rendered: {
      viewportWidth: width,
      viewportHeight: height,
      documentScrollWidth: width,
      noHorizontalOverflow: true,
    },
    layout: null,
    claimBoundary: {
      ok: true,
      error: '',
      checks: {
        localHeadline: true,
        localSummary: true,
        localNotice: true,
        localReceipt: true,
        boundaryVisible: true,
        compactMobileReceipt: true,
        managedHeadlineAbsent: true,
        companyReceiptClaimAbsent: true,
        browserPersistencePresent: true,
        noHorizontalOverflow: true,
      },
      boundaryVisible: true,
      oldManagedHeadlineVisible: false,
      companyReceiptClaimVisible: false,
      localBuyingStatePresent: true,
      viewportWidth: width,
      viewportHeight: height,
      documentScrollWidth: width,
    },
    screenshot: { ...screenshot, file },
    network: { mutatingRequestCount: 0, mutatingRequests: [] },
    runtime: { clean: true, errors: [] },
    ok: true,
    failures: [],
  }
}

async function writeSignedReport(reportPath, report) {
  const { digest: _digest, ...body } = report
  const signed = signedRenderedProof(body)
  await writeFile(reportPath, `${JSON.stringify(signed, null, 2)}\n`)
  return signed
}

async function createFixture(context) {
  const temporary = await mkdtemp(join(tmpdir(), 'supermega-rendered-report-validator-'))
  context.after(() => rm(temporary, { recursive: true, force: true }))
  const rootDir = join(temporary, 'repo')
  const evidenceDir = join(temporary, 'evidence')
  const distDir = join(rootDir, 'showroom', 'dist')
  const verifierPath = join(rootDir, 'tools', 'verify_app_entry_rendered.mjs')
  const reportPath = join(evidenceDir, 'report.json')
  await mkdir(join(rootDir, 'tools'), { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(join(rootDir, '.gitignore'), 'showroom/dist/\n')
  await writeFile(verifierPath, 'export const fixtureVerifier = true\n')
  runGit(rootDir, ['init', '--quiet'])
  runGit(rootDir, ['config', 'user.email', 'fixture@supermega.invalid'])
  runGit(rootDir, ['config', 'user.name', 'SuperMega fixture'])
  runGit(rootDir, ['add', '.gitignore', 'tools/verify_app_entry_rendered.mjs'])
  runGit(rootDir, ['commit', '--quiet', '-m', 'fixture'])
  const commit = runGit(rootDir, ['rev-parse', 'HEAD'])
  await mkdir(distDir, { recursive: true })
  await writeFile(join(distDir, 'index.html'), '<main>Local Ecommerce receipt</main>')
  await writeFile(join(distDir, '__release.json'), JSON.stringify({ service: 'supermega-app', commit }))

  const desktopPath = join(evidenceDir, 'ecommerce-local-request-desktop-1280x900.png')
  const mobilePath = join(evidenceDir, 'ecommerce-local-request-mobile-390x844.png')
  const desktopPayload = Buffer.from('89504e470d0a1a0a-desktop', 'utf8')
  const mobilePayload = Buffer.from('89504e470d0a1a0a-mobile', 'utf8')
  await writeFile(desktopPath, desktopPayload)
  await writeFile(mobilePath, mobilePayload)
  const provenance = await collectRenderedProofProvenance({ root: rootDir, distDir, verifierPath })
  const cases = [
    ecommerceCase({
      file: 'ecommerce-local-request-desktop-1280x900.png',
      screenshot: buildScreenshotEvidence({ payload: desktopPayload, path: desktopPath, evidenceDir }),
      viewport: '1280x900',
      width: 1280,
      height: 900,
    }),
    ecommerceCase({
      file: 'ecommerce-local-request-mobile-390x844.png',
      screenshot: buildScreenshotEvidence({ payload: mobilePayload, path: mobilePath, evidenceDir }),
      viewport: '390x844 mobile',
      width: 390,
      height: 844,
    }),
  ]
  const report = signedRenderedProof({
    ok: true,
    contract: APP_ENTRY_RENDERED_CONTRACT,
    generatedAt: '2026-08-28T00:00:00.000Z',
    scope: 'ecommerce-claim',
    evidence: { directory: '.', report: 'report.json' },
    ...provenance,
    sourceSha: provenance.source.commit,
    sourceTreeSha: provenance.source.tree,
    sourceTreeClean: provenance.source.clean,
    distManifestSha256: provenance.artifact.digest,
    verifierSha256: provenance.verifier.digest,
    browser: 'Fixture Chromium/1',
    cases,
    checks: cases.length,
    runtime: { clean: true, errorCount: 0 },
    failures: [],
  })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return {
    rootDir,
    evidenceDir,
    distDir,
    reportPath,
    commit,
    report,
    mobilePath,
  }
}

function fullCaseMatrixFixture() {
  return [
    {
      name: 'desktop root presents login despite remembered product',
      route: '/',
      viewport: '1280x900',
      path: '/',
      screenshot: { file: 'app-launcher-desktop-1280x900.png' },
    },
    {
      name: 'desktop choose query presents login',
      route: '/?choose=1',
      viewport: '1280x900',
      path: '/?choose=1',
      screenshot: null,
    },
    {
      name: 'mobile root presents login',
      route: '/',
      viewport: '390x844 mobile',
      path: '/',
      screenshot: { file: 'app-launcher-mobile-390x844.png' },
    },
    {
      name: 'retired Shop demo query returns to account home',
      route: '/?demo=shop',
      viewport: '1280x900',
      path: '/',
      screenshot: null,
    },
    {
      name: 'desktop trade link opens a complete mini-mart counter',
      route: '/shop/?template=mini-mart',
      viewport: '1280x900',
      path: '/shop/?tab=counter&template=mini-mart',
      screenshot: { file: 'shop-counter-mini-mart-desktop-1280x900.png' },
    },
    {
      name: 'mobile trade link keeps the complete mini-mart checkout in view',
      route: '/shop/?template=mini-mart',
      viewport: '390x844 mobile',
      path: '/shop/?tab=counter&template=mini-mart',
      screenshot: { file: 'shop-counter-mini-mart-mobile-390x844.png' },
    },
    ...[{ width: 1280, height: 900 }, { width: 390, height: 844, mobile: true }].map(size => ({
      name: `Shop Today keeps one accountable decision at ${size.width}px`,
      route: '/shop/?tab=today',
      viewport: `${size.width}x${size.height}${size.mobile ? ' mobile' : ''}`,
      path: '/shop/?tab=today',
      screenshot: { file: `shop-today-decision-desk-${size.width}.png` },
    })),
    {
      name: 'Shop Today downloads a completed accounting handoff',
      route: '/shop/?tab=today',
      viewport: '1280x900',
      path: '/shop/?tab=today',
      screenshot: { file: 'shop-today-accountant-handoff-1280x900.png' },
    },
    {
      name: 'Shop Today reloads the current business offline',
      route: '/shop/?tab=today',
      viewport: '1280x900',
      path: '/shop/?tab=today',
      screenshot: { file: 'shop-today-offline-restore-1280x900.png' },
    },
    ...RETIRED_PRODUCT_CASES.map(spec => ({ name: spec.id, route: spec.route,
      viewport: `${spec.width}x${spec.height}${spec.mobile ? ' mobile' : ''}`,
      path: spec.expectedPath, screenshot: { file: `${spec.id}.png` } })),
    {
      name: 'retired Website demo query returns to account home',
      route: '/?demo=website',
      viewport: '1280x900',
      path: '/',
      screenshot: null,
    },
    {
      name: 'desktop Website opens real business setup',
      route: '/website/?workspace=1',
      viewport: '1280x900',
      path: '/website/?workspace=1',
      screenshot: { file: 'website-business-setup-desktop-1280x900.png' },
    },
    {
      name: 'mobile Website opens real business setup',
      route: '/website/?workspace=1',
      viewport: '390x844 mobile',
      path: '/website/?workspace=1',
      screenshot: { file: 'website-business-setup-mobile-390x844.png' },
    },
    {
      name: 'desktop Sites opens the real saved page editor',
      route: '/website/?workspace=1',
      viewport: '1440x900',
      path: '/website/?workspace=1',
      screenshot: { file: 'sites-pages-current-desktop-1440x900.png' },
    },
    {
      name: 'desktop Sites opens the real inquiry workspace',
      route: '/website/?workspace=1&view=inquiries',
      viewport: '1440x900',
      path: '/website/?workspace=1&view=inquiries',
      screenshot: { file: 'sites-inquiries-current-desktop-1440x900.png' },
    },
    {
      name: 'retired Commerce demo query returns to account home',
      route: '/?demo=ecommerce',
      viewport: '1280x900',
      path: '/',
      screenshot: null,
    },
    ...[{ width: 1280, height: 900 }, { width: 390, height: 844, mobile: true }].map(size => ({
      name: `empty Ecommerce offers catalog help at ${size.width}px`,
      route: '/ecommerce/?workspace=1',
      viewport: `${size.width}x${size.height}${size.mobile ? ' mobile' : ''}`,
      path: '/ecommerce/?workspace=1',
      screenshot: { file: `ecommerce-empty-catalog-${size.width}.png` },
    })),
    {
      name: 'desktop Ecommerce keeps a reviewed order request locally',
      route: '/ecommerce/?workspace=1',
      viewport: '1280x900',
      path: '/ecommerce/',
      screenshot: { file: 'ecommerce-local-request-desktop-1280x900.png' },
    },
    {
      name: 'mobile Ecommerce keeps a reviewed order request locally',
      route: '/ecommerce/?workspace=1',
      viewport: '390x844 mobile',
      path: '/ecommerce/',
      screenshot: { file: 'ecommerce-local-request-mobile-390x844.png' },
    },
    {
      name: 'Commerce request becomes one accountable Shop order',
      route: '/ecommerce/?workspace=1',
      viewport: '1280x900',
      path: '/shop/?tab=orders',
      screenshot: { file: 'commerce-request-shop-order-desktop-1280x900.png' },
    },
  ]
}

test('CLI requires an exact report, commit, and scope', () => {
  const options = parseRenderedProofValidationArgs([
    '--report', 'C:/evidence/report.json',
    '--expected-head', 'a'.repeat(40),
    '--expected-scope', 'ecommerce-claim',
  ])
  assert.deepEqual(options, {
    reportPath: 'C:/evidence/report.json',
    expectedHead: 'a'.repeat(40),
    expectedScope: 'ecommerce-claim',
  })
  assert.throws(() => parseRenderedProofValidationArgs(['--report', 'report.json']), /arguments_required/)
  assert.throws(() => parseRenderedProofValidationArgs([
    '--report', 'one.json', '--report', 'two.json', '--expected-head', 'a'.repeat(40), '--expected-scope', 'full',
  ]), /arguments_invalid/)
})

test('binds full and bounded scopes to the exact renderer case matrix', () => {
  const full = fullCaseMatrixFixture()
  assert.equal(assertRenderedProofCaseMatrix(full, 'full').length, 35)
  assert.equal(assertRenderedProofCaseMatrix(full.slice(4, 6), 'shop-counter').length, 2)
  assert.equal(assertRenderedProofCaseMatrix(full.filter((entry) => entry.name === 'Shop Today downloads a completed accounting handoff'), 'shop-accounting-export').length, 1)
  assert.equal(assertRenderedProofCaseMatrix(full.filter((entry) => entry.name === 'Shop Today reloads the current business offline'), 'shop-offline-restore').length, 1)
  assert.equal(assertRenderedProofCaseMatrix(full.slice(-3, -1), 'ecommerce-claim').length, 2)
  assert.equal(assertRenderedProofCaseMatrix(full.slice(-1), 'store-to-shop').length, 1)
  const sites = full.filter((entry) => entry.name.startsWith('desktop Sites opens'))
  assert.equal(assertRenderedProofCaseMatrix(sites, 'sites-workspace').length, 2)
  const obsoleteEntry = structuredClone(full.slice(-3, -1))
  obsoleteEntry[0].route = '/ecommerce/'
  assert.throws(() => assertRenderedProofCaseMatrix(obsoleteEntry, 'ecommerce-claim'), /case_matrix_mismatch/)
  assert.deepEqual(full.filter((entry) => entry.screenshot).map((entry) => entry.screenshot.file), [
    'app-launcher-desktop-1280x900.png',
    'app-launcher-mobile-390x844.png',
    'shop-counter-mini-mart-desktop-1280x900.png',
    'shop-counter-mini-mart-mobile-390x844.png',
    'shop-today-decision-desk-1280.png',
    'shop-today-decision-desk-390.png',
    'shop-today-accountant-handoff-1280x900.png',
    'shop-today-offline-restore-1280x900.png',
    ...RETIRED_PRODUCT_CASES.map(spec => `${spec.id}.png`),
    'website-business-setup-desktop-1280x900.png',
    'website-business-setup-mobile-390x844.png',
    'sites-pages-current-desktop-1440x900.png',
    'sites-inquiries-current-desktop-1440x900.png',
    'ecommerce-empty-catalog-1280.png',
    'ecommerce-empty-catalog-390.png',
    'ecommerce-local-request-desktop-1280x900.png',
    'ecommerce-local-request-mobile-390x844.png',
    'commerce-request-shop-order-desktop-1280x900.png',
  ])
  assert.equal(full.filter((entry) => entry.screenshot === null).length, 4)

  assert.throws(() => assertRenderedProofCaseMatrix(full.slice(0, -1), 'full'), /case_matrix_mismatch/)
  assert.throws(() => assertRenderedProofCaseMatrix([...full, structuredClone(full[0])], 'full'), /case_matrix_mismatch/)
  assert.throws(() => assertRenderedProofCaseMatrix([structuredClone(full[0])], 'full'), /case_matrix_mismatch/)

  const swappedScreenshots = structuredClone(full)
  ;[swappedScreenshots[7].screenshot, swappedScreenshots[8].screenshot]
    = [swappedScreenshots[8].screenshot, swappedScreenshots[7].screenshot]
  assert.throws(() => assertRenderedProofCaseMatrix(swappedScreenshots, 'full'), /case_matrix_mismatch/)
  const missingScreenshot = structuredClone(full)
  missingScreenshot[10].screenshot = null
  assert.throws(() => assertRenderedProofCaseMatrix(missingScreenshot, 'full'), /case_matrix_mismatch/)
  const extraScreenshot = structuredClone(full)
  extraScreenshot[1].screenshot = { file: 'unexpected.png' }
  assert.throws(() => assertRenderedProofCaseMatrix(extraScreenshot, 'full'), /case_matrix_mismatch/)

  const ecommerce = full.slice(-3, -1)
  const duplicateDesktop = [
    structuredClone(ecommerce[0]),
    {
      ...structuredClone(ecommerce[0]),
      screenshot: { file: 'ecommerce-local-request-mobile-390x844.png' },
    },
  ]
  assert.throws(() => assertRenderedProofCaseMatrix(duplicateDesktop, 'ecommerce-claim'), /case_matrix_mismatch/)
  const wrongMobileViewport = structuredClone(ecommerce)
  wrongMobileViewport[1].viewport = '1280x900'
  assert.throws(() => assertRenderedProofCaseMatrix(wrongMobileViewport, 'ecommerce-claim'), /case_matrix_mismatch/)
})

test('full visual cases pin visible product truth copy and Plant canonicalization', async () => {
  const rootDir = process.cwd()
  const [renderer, coreApp, websiteStarterSetup, ecommerceProduct, ecommerceWorkspace] = await Promise.all([
    readFile(join(rootDir, 'tools', 'verify_app_entry_rendered.mjs'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'website', 'WebsiteStarterSetup.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceProduct.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceBuyingWorkspace.tsx'), 'utf8'),
  ])
  const sourceBoundText = [
    [websiteStarterSetup, 'Start your website'],
    [websiteStarterSetup, 'Create my website'],
    [ecommerceWorkspace, 'Request saved locally for Shop review.'],
    [ecommerceWorkspace, 'Shop still confirms stock, promise, payment, and delivery.'],
  ]
  for (const [source, text] of sourceBoundText) {
    assert.ok(source.includes(text), `missing current product authority: ${text}`)
    assert.ok(renderer.includes(text), `renderer does not require current product truth: ${text}`)
  }
  assert.ok(ecommerceProduct.includes('Order request saved'), 'Ecommerce Orders no longer exposes its saved-request headline')
  assert.equal((renderer.match(/expectedPath: '\/plant\/\?tab=production'/g) || []).length, 0)
  assert.match(renderer, /validateRetiredProductObservation/)
  const unfinishedRedirect = fullCaseMatrixFixture()
  unfinishedRedirect[6].path = '/plant/'
  assert.throws(() => assertRenderedProofCaseMatrix(unfinishedRedirect, 'full'), /case_matrix_mismatch/)
  const expectedTextBodies = [...renderer.matchAll(/expectedText:\s*\[([^\]]*)\]/g)].map((match) => match[1])
  for (const retired of ['Edit the ready example', 'Nothing has been deployed.', 'Try one customer order', 'Start sample order', 'The working sample stays unchanged until you choose Customize demo.']) {
    assert.equal(expectedTextBodies.some((body) => body.includes(retired)), false, `retired rendered expectation remains: ${retired}`)
  }
})

test('disk consumer rejects absent, old and false retirement evidence', () => {
  const spec = RETIRED_PRODUCT_CASES[0]
  const expected = { name: spec.id, width: spec.width, height: spec.height, semantics: 'retired-product' }
  const retirement = { policy: RETIRED_PRODUCT_PREVIEW_POLICY, caseId: spec.id,
    redirectVerified: true, target: spec.target, targetVerified: true, retiredUiAbsent: true, retainedDataUnchanged: true }
  const entry = { ok: true, failures: [], runtime: { clean: true, errors: [] }, bodyLength: 100,
    path: '/?choose=1', viewport: '1280x900', network: { mutatingRequestCount: 0, mutatingRequests: [] },
    rendered: { viewportWidth: 1280, viewportHeight: 900, documentScrollWidth: 1280, noHorizontalOverflow: true,
      launcherLinks: [], retirement } }
  assert.doesNotThrow(() => assertCaseSemantics(entry, expected))
  for (const wrong of [undefined, { ...retirement, policy: 'old' }, { ...retirement, caseId: 'plant_desktop' },
    { ...retirement, target: 'account-home' },
    ...['redirectVerified', 'targetVerified', 'retiredUiAbsent', 'retainedDataUnchanged'].map(key => ({ ...retirement, [key]: false }))]) {
    assert.throws(() => assertCaseSemantics({ ...entry, rendered: { ...entry.rendered, retirement: wrong } }, expected), /retirement_invalid/)
  }
  const oldMatrix = fullCaseMatrixFixture().filter(row => !row.name.startsWith('retired_plant_'))
  assert.throws(() => assertRenderedProofCaseMatrix(oldMatrix, 'full'), /case_matrix_mismatch/)
})

test('validates a clean exact on-disk Ecommerce rendered proof', async (context) => {
  const fixture = await createFixture(context)
  const result = await validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  })
  assert.equal(result.ok, true)
  assert.equal(result.contract, APP_ENTRY_RENDERED_VALIDATION_CONTRACT)
  assert.equal(result.source.commit, fixture.commit)
  assert.equal(result.scope, 'ecommerce-claim')
  assert.equal(result.screenshots.length, 2)
})

test('rejects changed screenshot bytes and a re-signed managed receipt claim', async (context) => {
  const fixture = await createFixture(context)
  await writeFile(fixture.mobilePath, 'changed screenshot')
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /screenshot_mismatch/)

  const originalMobile = fixture.report.cases[1].screenshot.file === 'ecommerce-local-request-mobile-390x844.png'
  assert.equal(originalMobile, true)
  await writeFile(fixture.mobilePath, Buffer.from('89504e470d0a1a0a-mobile', 'utf8'))
  fixture.report.cases[1].claimBoundary.companyReceiptClaimVisible = true
  await writeSignedReport(fixture.reportPath, fixture.report)
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /ecommerce_claim_boundary_failed/)

  fixture.report.cases[1].claimBoundary.companyReceiptClaimVisible = false
  fixture.report.cases[1].claimBoundary.checks.compactMobileReceipt = false
  await writeSignedReport(fixture.reportPath, fixture.report)
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /ecommerce_claim_boundary_failed/)
})

test('rejects re-signed stale release metadata and dirty source', async (context) => {
  const fixture = await createFixture(context)
  await writeFile(join(fixture.distDir, '__release.json'), JSON.stringify({
    service: 'supermega-app',
    commit: 'f'.repeat(40),
  }))
  const changedManifest = await collectDirectoryManifest(fixture.distDir)
  fixture.report.artifact.digest = changedManifest.digest
  fixture.report.artifact.fileCount = changedManifest.fileCount
  fixture.report.artifact.totalBytes = changedManifest.totalBytes
  fixture.report.distManifestSha256 = changedManifest.digest
  await writeSignedReport(fixture.reportPath, fixture.report)
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /release_commit_mismatch/)

  await writeFile(join(fixture.rootDir, 'dirty.txt'), 'dirty')
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /source_tree_dirty/)
})

test('rejects report-body tampering and wrong expected scope', async (context) => {
  const fixture = await createFixture(context)
  const parsed = JSON.parse(await readFile(fixture.reportPath, 'utf8'))
  parsed.browser = 'Tampered browser'
  await writeFile(fixture.reportPath, `${JSON.stringify(parsed, null, 2)}\n`)
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  }), /report_digest_mismatch/)

  await writeFile(fixture.reportPath, `${JSON.stringify(fixture.report, null, 2)}\n`)
  await assert.rejects(() => validateRenderedProofReport({
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'shop-counter',
    rootDir: fixture.rootDir,
  }), /report_contract_invalid/)
})


test('demo query routing is retired from the application entry', async () => {
  const source = await readFile(new URL('../showroom/src/App.tsx', import.meta.url), 'utf8')
  assert.equal(source.includes('function productDemoPath('), false)
  assert.equal(source.includes("params.get('demo')"), false)
  for (const [name, path] of [
    ['retired Shop demo query returns to account home', '/'],
    ['retired Website demo query returns to account home', '/'],
    ['retired Commerce demo query returns to account home', '/'],
  ]) {
    const entryCase = renderedVerifierSource.split(`name: '${name}'`)[1].split('seed:')[0]
    assert.ok(entryCase.includes(`expectedPath: '${path}'`))
  }
})
