import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  APP_ENTRY_RENDERED_CONTRACT,
  buildScreenshotEvidence,
  collectDirectoryManifest,
  collectRenderedProofProvenance,
  signedRenderedProof,
} from './rendered_proof_provenance.mjs'
import {
  APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
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

function ecommerceCase({ file, screenshot, viewport, width, height }) {
  return {
    name: width === 1280
      ? 'desktop isolated Ecommerce keeps a submitted sample request browser-local'
      : 'mobile isolated Ecommerce keeps a submitted sample request browser-local',
    route: '/ecommerce/',
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
      name: 'desktop root shows launcher despite remembered product',
      route: '/',
      viewport: '1280x900',
      path: '/',
      screenshot: { file: 'app-launcher-desktop-1280x900.png' },
    },
    {
      name: 'desktop choose query shows launcher',
      route: '/?choose=1',
      viewport: '1280x900',
      path: '/?choose=1',
      screenshot: null,
    },
    {
      name: 'mobile root shows launcher',
      route: '/',
      viewport: '390x844 mobile',
      path: '/',
      screenshot: { file: 'app-launcher-mobile-390x844.png' },
    },
    {
      name: 'demo shop opens explicit shop route',
      route: '/?demo=shop',
      viewport: '1280x900',
      path: '/shop/',
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
    {
      name: 'demo plant opens explicit plant route',
      route: '/?demo=plant',
      viewport: '1280x900',
      path: '/plant/',
      screenshot: null,
    },
    {
      name: 'desktop Plant shows the browser-local working sample',
      route: '/plant/',
      viewport: '1280x900',
      path: '/plant/?tab=production',
      screenshot: { file: 'plant-working-sample-desktop-1280x900.png' },
    },
    {
      name: 'mobile Plant shows the browser-local working sample',
      route: '/plant/',
      viewport: '390x844 mobile',
      path: '/plant/?tab=production',
      screenshot: { file: 'plant-working-sample-mobile-390x844.png' },
    },
    {
      name: 'demo website opens explicit website route',
      route: '/?demo=website',
      viewport: '1280x900',
      path: '/website/',
      screenshot: null,
    },
    {
      name: 'desktop Website shows the local preview boundary',
      route: '/website/',
      viewport: '1280x900',
      path: '/website/',
      screenshot: { file: 'website-working-sample-desktop-1280x900.png' },
    },
    {
      name: 'mobile Website shows the local preview boundary',
      route: '/website/',
      viewport: '390x844 mobile',
      path: '/website/',
      screenshot: { file: 'website-working-sample-mobile-390x844.png' },
    },
    {
      name: 'demo ecommerce opens explicit ecommerce route',
      route: '/?demo=ecommerce',
      viewport: '1280x900',
      path: '/ecommerce/',
      screenshot: null,
    },
    {
      name: 'desktop isolated Ecommerce keeps a submitted sample request browser-local',
      route: '/ecommerce/',
      viewport: '1280x900',
      path: '/ecommerce/',
      screenshot: { file: 'ecommerce-local-request-desktop-1280x900.png' },
    },
    {
      name: 'mobile isolated Ecommerce keeps a submitted sample request browser-local',
      route: '/ecommerce/',
      viewport: '390x844 mobile',
      path: '/ecommerce/',
      screenshot: { file: 'ecommerce-local-request-mobile-390x844.png' },
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
  assert.equal(assertRenderedProofCaseMatrix(full, 'full').length, 15)
  assert.equal(assertRenderedProofCaseMatrix(full.slice(4, 6), 'shop-counter').length, 2)
  assert.equal(assertRenderedProofCaseMatrix(full.slice(13), 'ecommerce-claim').length, 2)
  assert.deepEqual(full.filter((entry) => entry.screenshot).map((entry) => entry.screenshot.file), [
    'app-launcher-desktop-1280x900.png',
    'app-launcher-mobile-390x844.png',
    'shop-counter-mini-mart-desktop-1280x900.png',
    'shop-counter-mini-mart-mobile-390x844.png',
    'plant-working-sample-desktop-1280x900.png',
    'plant-working-sample-mobile-390x844.png',
    'website-working-sample-desktop-1280x900.png',
    'website-working-sample-mobile-390x844.png',
    'ecommerce-local-request-desktop-1280x900.png',
    'ecommerce-local-request-mobile-390x844.png',
  ])
  assert.equal(full.filter((entry) => entry.screenshot === null).length, 5)

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

  const ecommerce = full.slice(13)
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

test('full visual cases pin current product truth copy and Plant canonicalization', async () => {
  const rootDir = process.cwd()
  const [renderer, coreApp, websiteProduct, ecommerceProduct, ecommerceWorkspace] = await Promise.all([
    readFile(join(rootDir, 'tools', 'verify_app_entry_rendered.mjs'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'website', 'WebsiteProduct.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceProduct.tsx'), 'utf8'),
    readFile(join(rootDir, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceBuyingWorkspace.tsx'), 'utf8'),
  ])
  const sourceBoundText = [
    [coreApp, 'Record first shift output'],
    [coreApp, "These dates belong to this browser-local sample, not today's production."],
    [websiteProduct, 'Customize this demo'],
    [websiteProduct, 'Saved on this device'],
    [websiteProduct, 'The working sample stays unchanged until you choose Customize demo.'],
    [ecommerceProduct, 'Sample request saved locally'],
    [ecommerceWorkspace, 'This sample order request is saved on this device for Shop review.'],
    [ecommerceWorkspace, 'This browser demo retained the request.'],
  ]
  for (const [source, text] of sourceBoundText) {
    assert.ok(source.includes(text), `missing current product authority: ${text}`)
    assert.ok(renderer.includes(text), `renderer does not require current product truth: ${text}`)
  }
  assert.equal((renderer.match(/expectedPath: '\/plant\/\?tab=production'/g) || []).length, 2)
  const expectedTextBodies = [...renderer.matchAll(/expectedText:\s*\[([^\]]*)\]/g)].map((match) => match[1])
  for (const retired of ['Make this website yours', 'Nothing has been deployed.', 'Try one customer order', 'Start sample order']) {
    assert.equal(expectedTextBodies.some((body) => body.includes(retired)), false, `retired rendered expectation remains: ${retired}`)
  }
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
