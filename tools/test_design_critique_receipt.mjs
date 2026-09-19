import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertDesignCritiqueReceipt,
  buildDesignCritiqueReceipt,
  DESIGN_CRITIQUE_RECEIPT_CONTRACT,
  DESIGN_CRITIQUE_REVIEW_INPUT_CONTRACT,
  generateDesignCritiqueReceipt,
  parseDesignCritiqueGenerationArgs,
  writeDesignCritiqueReceipt,
} from './generate_design_critique_receipt.mjs'
import {
  APP_ENTRY_RENDERED_CONTRACT,
  buildScreenshotEvidence,
  collectRenderedProofProvenance,
  sha256Digest,
  signedRenderedProof,
} from './rendered_proof_provenance.mjs'
import { APP_ENTRY_RENDERED_VALIDATION_CONTRACT } from './validate_app_entry_rendered_report.mjs'
import {
  DESIGN_CRITIQUE_VALIDATION_CONTRACT,
  parseDesignCritiqueValidationArgs,
  validateDesignCritiqueReceipt,
  validateDesignCritiqueReceiptDocument,
} from './validate_design_critique_receipt.mjs'

const DIMENSIONS = [
  'job_clarity',
  'truth_and_safety',
  'completion_hierarchy',
  'mobile_and_access',
  'system_coherence',
]
const TEST_NOW = Date.now()
const REPORT_GENERATED_AT = new Date(TEST_NOW - 3 * 60 * 1000).toISOString()
const REVIEWED_AT = new Date(TEST_NOW - 2 * 60 * 1000).toISOString()
const GENERATED_AT = new Date(TEST_NOW - 60 * 1000).toISOString()
const ACCESSED_ON = REVIEWED_AT.slice(0, 10)

function digest(character) {
  return 'sha256:' + character.repeat(64)
}

function renderedValidation(overrides = {}) {
  const value = {
    ok: true,
    contract: APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
    report: 'report.json',
    reportFileDigest: digest('1'),
    reportBodyDigest: digest('2'),
    source: {
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      clean: true,
    },
    scope: 'shop-counter',
    verifier: {
      digest: digest('3'),
      bytes: 12_345,
    },
    artifact: {
      digest: digest('4'),
      fileCount: 77,
      totalBytes: 3_170_962,
    },
    screenshots: [
      {
        file: 'shop-counter-mini-mart-desktop-1280x900.png',
        bytes: 100_001,
        digest: digest('5'),
      },
      {
        file: 'shop-counter-mini-mart-mobile-390x844.png',
        bytes: 80_001,
        digest: digest('6'),
      },
    ],
    validatorDigest: digest('7'),
  }
  return { ...value, ...overrides }
}

function reviewInput(validation = renderedValidation()) {
  return {
    contract: DESIGN_CRITIQUE_REVIEW_INPUT_CONTRACT,
    reviewedAt: REVIEWED_AT,
    product: 'shop',
    userRole: 'cashier',
    firstJob: 'sell_from_trade_specific_counter',
    visualDirection: 'task_first_truthful_local_operation',
    reference: {
      url: 'https://github.com/nexu-io/open-design',
      accessedOn: ACCESSED_ON,
      principle: 'repository_owned_contract_and_evidence_backed_critique',
    },
    implementerRole: 'senior_engineer',
    reviewerRole: 'risk_reviewer',
    independenceAttested: true,
    manualVisualInspection: true,
    inspectedScreenshots: validation.screenshots.map(({ file, digest: screenshotDigest }) => ({
      file,
      digest: screenshotDigest,
    })),
    dimensions: DIMENSIONS.map((id, index) => ({
      id,
      score: 4,
      evidence: {
        screenshot: validation.screenshots[index % validation.screenshots.length].file,
        element: id + '_element',
        finding: id + '_verified',
      },
    })),
    keep: ['trade_specific_identity', 'complete_sale_path'],
    fix: [],
    verdict: 'accept',
  }
}

function fullPortfolioReview() {
  const files = [
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
  ]
  const digestCharacters = ['8', '9', 'a', 'b', 'c', 'd', 'e', 'f', '0', '1']
  const validation = renderedValidation({
    scope: 'full',
    screenshots: files.map((file, index) => ({
      file,
      bytes: 80_000 + index,
      digest: digest(digestCharacters[index]),
    })),
  })
  const review = reviewInput(validation)
  review.product = 'portfolio'
  review.userRole = 'portfolio_reviewer'
  review.firstJob = 'review_four_product_entry'
  return { validation, review }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function validReceipt(validation = renderedValidation()) {
  return buildDesignCritiqueReceipt({
    renderedValidation: validation,
    reportGeneratedAt: REPORT_GENERATED_AT,
    reviewInput: reviewInput(validation),
    generatedAt: GENERATED_AT,
  })
}

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

async function createRenderedProofFixture(context) {
  const temporary = await mkdtemp(join(tmpdir(), 'supermega-design-critique-integration-'))
  context.after(() => rm(temporary, { recursive: true, force: true }))
  const rootDir = join(temporary, 'repo')
  const evidenceDir = join(temporary, 'evidence')
  const reviewDir = join(temporary, 'review')
  const outputDir = join(temporary, 'output')
  const distDir = join(rootDir, 'showroom', 'dist')
  const verifierPath = join(rootDir, 'tools', 'verify_app_entry_rendered.mjs')
  const reportPath = join(evidenceDir, 'report.json')
  const reviewPath = join(reviewDir, 'review.json')
  const receiptPath = join(outputDir, 'receipt.json')
  await mkdir(join(rootDir, 'tools'), { recursive: true })
  await mkdir(evidenceDir)
  await mkdir(reviewDir)
  await mkdir(outputDir)
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
    generatedAt: REPORT_GENERATED_AT,
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
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  const review = reviewInput({ ...renderedValidation(), screenshots: report.cases.map(({ screenshot }) => screenshot) })
  review.product = 'ecommerce'
  review.userRole = 'buyer'
  review.firstJob = 'build_and_review_customer_request'
  review.inspectedScreenshots = cases.map(({ screenshot }) => ({
    file: screenshot.file,
    digest: screenshot.digest,
  }))
  await writeFile(reviewPath, JSON.stringify(review, null, 2) + '\n')
  return { rootDir, reportPath, reviewPath, receiptPath, commit }
}

test('generation and validation CLIs require each exact argument once', () => {
  assert.deepEqual(parseDesignCritiqueGenerationArgs([
    '--review', 'review.json',
    '--report', 'report.json',
    '--expected-head', 'a'.repeat(40),
    '--expected-scope', 'shop-counter',
    '--out', 'receipt.json',
  ]), {
    reviewPath: 'review.json',
    reportPath: 'report.json',
    expectedHead: 'a'.repeat(40),
    expectedScope: 'shop-counter',
    outputPath: 'receipt.json',
  })
  assert.throws(
    () => parseDesignCritiqueGenerationArgs(['--review', 'review.json']),
    /design_critique_generation_arguments_required/,
  )
  assert.throws(
    () => parseDesignCritiqueGenerationArgs([
      '--review', 'one.json', '--review', 'two.json',
      '--report', 'report.json', '--expected-head', 'a'.repeat(40),
      '--expected-scope', 'shop-counter', '--out', 'receipt.json',
    ]),
    /design_critique_generation_arguments_invalid/,
  )

  assert.deepEqual(parseDesignCritiqueValidationArgs([
    '--receipt', 'receipt.json',
    '--report', 'report.json',
    '--expected-head', 'a'.repeat(40),
    '--expected-scope', 'shop-counter',
  ]), {
    receiptPath: 'receipt.json',
    reportPath: 'report.json',
    expectedHead: 'a'.repeat(40),
    expectedScope: 'shop-counter',
  })
  assert.throws(
    () => parseDesignCritiqueValidationArgs(['--receipt', 'receipt.json']),
    /design_critique_validation_arguments_required/,
  )
})

test('builds an accepted privacy-minimal receipt with derived gates', () => {
  const receipt = validReceipt()
  assert.equal(receipt.contract, DESIGN_CRITIQUE_RECEIPT_CONTRACT)
  assert.equal(receipt.source.commit, 'a'.repeat(40))
  assert.equal(receipt.review.product, 'shop')
  assert.equal(receipt.review.dimensions.length, 5)
  assert.equal(receipt.gates.minimumObservedScore, 4)
  assert.equal(receipt.gates.allDimensionsPassing, true)
  assert.equal(receipt.gates.roleLabelsDistinct, true)
  assert.equal(receipt.gates.independentReviewAttested, true)
  assert.equal(receipt.gates.exactPreviewAccepted, false)
  assert.equal(receipt.gates.releaseAuthorized, false)
  assert.equal(Object.hasOwn(receipt.controls, 'implementerSignedOwnReview'), false)
  assert.equal(receipt.controls.providerWritesPerformed, false)
  assert.equal(assertDesignCritiqueReceipt(receipt).digest, receipt.digest)
})

test('binds the receipt to the exact rendered validation and payload', () => {
  const validation = renderedValidation()
  const receipt = validReceipt(validation)
  const payload = Buffer.from(JSON.stringify(receipt, null, 2) + '\n')
  const validatorPayload = Buffer.from('validator fixture')
  const result = validateDesignCritiqueReceiptDocument({
    receiptPayload: payload,
    receipt,
    renderedValidation: validation,
    reportGeneratedAt: REPORT_GENERATED_AT,
    validatorPayload,
  })
  assert.equal(result.ok, true)
  assert.equal(result.contract, DESIGN_CRITIQUE_VALIDATION_CONTRACT)
  assert.equal(result.receiptFileDigest, sha256Digest(payload))
  assert.equal(result.receiptBodyDigest, receipt.digest)
  assert.equal(result.screenshotCount, 2)
  assert.equal(result.minimumObservedScore, 4)
  assert.equal(result.readyForSourceReview, true)
  assert.equal(result.exactPreviewAccepted, false)
  assert.equal(result.releaseAuthorized, false)

  const staleValidation = clone(validation)
  staleValidation.reportFileDigest = digest('8')
  assert.throws(
    () => validateDesignCritiqueReceiptDocument({
      receiptPayload: payload,
      receipt,
      renderedValidation: staleValidation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      validatorPayload,
    }),
    /design_critique_rendered_proof_binding_mismatch/,
  )
  assert.throws(
    () => validateDesignCritiqueReceiptDocument({
      receiptPayload: Buffer.from('{}'),
      receipt,
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      validatorPayload,
    }),
    /design_critique_receipt_payload_mismatch/,
  )
})

test('requires inspection of the exact ten-image full portfolio matrix', () => {
  const { validation, review } = fullPortfolioReview()
  const receipt = buildDesignCritiqueReceipt({
    renderedValidation: validation,
    reportGeneratedAt: REPORT_GENERATED_AT,
    reviewInput: review,
    generatedAt: GENERATED_AT,
  })
  assert.equal(receipt.review.product, 'portfolio')
  assert.equal(receipt.renderedProof.scope, 'full')
  assert.deepEqual(
    receipt.review.inspectedScreenshots,
    validation.screenshots.map(({ file, digest: screenshotDigest }) => ({ file, digest: screenshotDigest })),
  )
  assert.equal(receipt.review.inspectedScreenshots.length, 10)

  const missing = clone(review)
  missing.inspectedScreenshots.pop()
  assert.throws(() => buildDesignCritiqueReceipt({
    renderedValidation: validation,
    reportGeneratedAt: REPORT_GENERATED_AT,
    reviewInput: missing,
    generatedAt: GENERATED_AT,
  }), /design_critique_inspected_screenshots_incomplete/)

  const swapped = clone(review)
  ;[swapped.inspectedScreenshots[0], swapped.inspectedScreenshots[1]]
    = [swapped.inspectedScreenshots[1], swapped.inspectedScreenshots[0]]
  assert.throws(() => buildDesignCritiqueReceipt({
    renderedValidation: validation,
    reportGeneratedAt: REPORT_GENERATED_AT,
    reviewInput: swapped,
    generatedAt: GENERATED_AT,
  }), /design_critique_inspected_screenshots_mismatch/)
})

test('fails closed on low scores, self-review, and incomplete screenshot inspection', () => {
  const validation = renderedValidation()

  const unknownUserRole = reviewInput(validation)
  unknownUserRole.userRole = 'named_person'
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: unknownUserRole,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_user_role_invalid/,
  )

  const unknownFirstJob = reviewInput(validation)
  unknownFirstJob.firstJob = 'generic_dashboard_review'
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: unknownFirstJob,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_first_job_invalid/,
  )

  const lowScore = reviewInput(validation)
  lowScore.dimensions[2].score = 2
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: lowScore,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_dimension_failed/,
  )

  const selfReview = reviewInput(validation)
  selfReview.reviewerRole = selfReview.implementerRole
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: selfReview,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_reviewer_not_independent/,
  )

  const unattested = reviewInput(validation)
  unattested.independenceAttested = false
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: unattested,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_review_not_accepted/,
  )

  const incomplete = reviewInput(validation)
  incomplete.inspectedScreenshots.pop()
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: incomplete,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_inspected_screenshots_incomplete/,
  )
})

test('rejects private, contact, credential, and unreviewed reference shapes', () => {
  const validation = renderedValidation()
  for (const unsafeEvidence of [
    'Contact the reviewer at owner@example.com before accepting this result.',
    'The private file is under C:\\Users\\Example\\review and should be retained.',
    'ghp_' + '1'.repeat(30),
    'Call +95 9 123 456 789 before the visual acceptance can be recorded.',
  ]) {
    const unsafe = reviewInput(validation)
    unsafe.dimensions[0].evidence.finding = unsafeEvidence
    assert.throws(
      () => buildDesignCritiqueReceipt({
        renderedValidation: validation,
        reportGeneratedAt: REPORT_GENERATED_AT,
        reviewInput: unsafe,
        generatedAt: GENERATED_AT,
      }),
      /design_critique_dimension_evidence_invalid/,
    )
  }

  const trackingUrl = reviewInput(validation)
  trackingUrl.reference.url = 'https://github.com/nexu-io/open-design?source=private'
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: validation,
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: trackingUrl,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_reference_url_invalid/,
  )

  for (const privatePathUrl of [
    'https://github.com/nexu-io/open-design/owner%40example.com',
    'https://github.com/nexu-io/open-design/%2B95%209%20123%20456%20789',
    'https://github.com/nexu-io/open-design/ghp_%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31%31',
    'https://github.com/nexu-io/open-design/private-customer-12345',
    'https://github.com/nexu-io/open-design/' + 'a'.repeat(2048),
  ]) {
    const privatePath = reviewInput(validation)
    privatePath.reference.url = privatePathUrl
    assert.throws(
      () => buildDesignCritiqueReceipt({
        renderedValidation: validation,
        reportGeneratedAt: REPORT_GENERATED_AT,
        reviewInput: privatePath,
        generatedAt: GENERATED_AT,
      }),
      /design_critique_reference_url_invalid/,
    )
  }
})

test('rejects extra fields, gate tampering, and generation outside the review window', () => {
  const receipt = validReceipt()
  const extra = clone(receipt)
  extra.approvedBy = 'somebody'
  assert.throws(() => assertDesignCritiqueReceipt(extra), /design_critique_receipt_shape_invalid/)

  const widenedGate = clone(receipt)
  widenedGate.gates.releaseAuthorized = true
  assert.throws(() => assertDesignCritiqueReceipt(widenedGate), /design_critique_gates_mismatch/)

  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: renderedValidation(),
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: reviewInput(),
      generatedAt: new Date(TEST_NOW + 48 * 60 * 60 * 1000).toISOString(),
    }),
    /design_critique_generation_window_invalid/,
  )

  const prematureReview = reviewInput()
  prematureReview.reviewedAt = new Date(Date.parse(REPORT_GENERATED_AT) - 2 * 60 * 1000).toISOString()
  prematureReview.reference.accessedOn = prematureReview.reviewedAt.slice(0, 10)
  assert.throws(
    () => buildDesignCritiqueReceipt({
      renderedValidation: renderedValidation(),
      reportGeneratedAt: REPORT_GENERATED_AT,
      reviewInput: prematureReview,
      generatedAt: GENERATED_AT,
    }),
    /design_critique_review_evidence_window_invalid/,
  )
})

test('writes once only into an explicitly empty output directory', async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), 'supermega-design-critique-'))
  context.after(() => rm(temporary, { recursive: true, force: true }))
  const outputDirectory = join(temporary, 'output')
  await mkdir(outputDirectory)
  const outputPath = join(outputDirectory, 'receipt.json')
  const receipt = validReceipt()
  await writeDesignCritiqueReceipt(outputPath, receipt)
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), receipt)
  await assert.rejects(
    () => writeDesignCritiqueReceipt(outputPath, receipt),
    /design_critique_output_directory_not_empty/,
  )

  const occupiedDirectory = join(temporary, 'occupied')
  await mkdir(occupiedDirectory)
  await writeFile(join(occupiedDirectory, 'unrelated.txt'), 'occupied')
  await assert.rejects(
    () => writeDesignCritiqueReceipt(join(occupiedDirectory, 'receipt.json'), receipt),
    /design_critique_output_directory_not_empty/,
  )
})

test('runs the real rendered-proof validator through generation and disk validation', async (context) => {
  const fixture = await createRenderedProofFixture(context)
  const receipt = await generateDesignCritiqueReceipt({
    reviewPath: fixture.reviewPath,
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    outputPath: fixture.receiptPath,
    rootDir: fixture.rootDir,
    generatedAt: GENERATED_AT,
  })
  assert.equal(receipt.source.commit, fixture.commit)
  assert.equal(receipt.review.product, 'ecommerce')
  assert.equal(receipt.renderedProof.scope, 'ecommerce-claim')
  const validation = await validateDesignCritiqueReceipt({
    receiptPath: fixture.receiptPath,
    reportPath: fixture.reportPath,
    expectedHead: fixture.commit,
    expectedScope: 'ecommerce-claim',
    rootDir: fixture.rootDir,
  })
  assert.equal(validation.ok, true)
  assert.equal(validation.contract, DESIGN_CRITIQUE_VALIDATION_CONTRACT)
  assert.equal(validation.source.commit, fixture.commit)
  assert.equal(validation.product, 'ecommerce')
  assert.equal(validation.screenshotCount, 2)
  assert.equal(validation.readyForSourceReview, true)
  assert.equal(validation.exactPreviewAccepted, false)
  assert.equal(validation.releaseAuthorized, false)
})
