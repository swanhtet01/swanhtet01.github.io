#!/usr/bin/env node
import { lstat, readFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  APP_ENTRY_RENDERED_CONTRACT,
  collectDirectoryManifest,
  collectGitSourceState,
  sha256Digest,
} from './rendered_proof_provenance.mjs'

export const APP_ENTRY_RENDERED_VALIDATION_CONTRACT = 'supermega.app-entry-rendered-validation.v1'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const ALLOWED_SCOPES = new Set(['full', 'shop-counter', 'ecommerce-claim'])
const MAX_REPORT_BYTES = 10 * 1024 * 1024
const MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024
const MAX_CASES = 100
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FULL_CASE_MATRIX = Object.freeze([
  { name: 'desktop root shows launcher despite remembered product', route: '/', viewport: '1280x900', path: '/', screenshot: null },
  { name: 'desktop choose query shows launcher', route: '/?choose=1', viewport: '1280x900', path: '/?choose=1', screenshot: null },
  { name: 'mobile root shows launcher', route: '/', viewport: '360x800 mobile', path: '/', screenshot: null },
  { name: 'demo shop opens explicit shop route', route: '/?demo=shop', viewport: '1280x900', pathPrefix: '/shop/', screenshot: null },
  {
    name: 'desktop trade link opens a complete mini-mart counter',
    route: '/shop/?template=mini-mart',
    viewport: '1280x900',
    path: '/shop/?tab=counter&template=mini-mart',
    screenshot: 'shop-counter-mini-mart-desktop-1280x900.png',
    semantics: 'shop-counter',
  },
  {
    name: 'mobile trade link keeps the complete mini-mart checkout in view',
    route: '/shop/?template=mini-mart',
    viewport: '390x844 mobile',
    path: '/shop/?tab=counter&template=mini-mart',
    screenshot: 'shop-counter-mini-mart-mobile-390x844.png',
    semantics: 'shop-counter',
  },
  { name: 'demo plant opens explicit plant route', route: '/?demo=plant', viewport: '1280x900', pathPrefix: '/plant/', screenshot: null },
  { name: 'demo website opens explicit website route', route: '/?demo=website', viewport: '1280x900', pathPrefix: '/website/', screenshot: null },
  { name: 'demo ecommerce opens explicit ecommerce route', route: '/?demo=ecommerce', viewport: '1280x900', pathPrefix: '/ecommerce/', screenshot: null },
  {
    name: 'desktop isolated Ecommerce keeps a submitted sample request browser-local',
    route: '/ecommerce/',
    viewport: '1280x900',
    pathPrefix: '/ecommerce/',
    screenshot: 'ecommerce-local-request-desktop-1280x900.png',
    semantics: 'ecommerce-claim',
  },
  {
    name: 'mobile isolated Ecommerce keeps a submitted sample request browser-local',
    route: '/ecommerce/',
    viewport: '390x844 mobile',
    pathPrefix: '/ecommerce/',
    screenshot: 'ecommerce-local-request-mobile-390x844.png',
    semantics: 'ecommerce-claim',
  },
])

const CASE_MATRIX_BY_SCOPE = Object.freeze({
  full: FULL_CASE_MATRIX,
  'shop-counter': FULL_CASE_MATRIX.filter((entry) => entry.semantics === 'shop-counter'),
  'ecommerce-claim': FULL_CASE_MATRIX.filter((entry) => entry.semantics === 'ecommerce-claim'),
})

function fail(code) {
  throw new Error(code)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactArray(value, code) {
  if (!Array.isArray(value)) fail(code)
  return value
}

function exactString(value, code) {
  if (typeof value !== 'string' || !value) fail(code)
  return value
}

function exactDigest(value, code) {
  const digest = exactString(value, code)
  if (!DIGEST_PATTERN.test(digest)) fail(code)
  return digest
}

function safeRelativePath(parent, value, code) {
  const candidate = exactString(value, code)
  const parts = candidate.split('/')
  if (candidate.includes('\\') || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)
    || parts.some((part) => !part || part === '.' || part === '..')) fail(code)
  const absoluteParent = resolve(parent)
  const absolute = resolve(absoluteParent, ...parts)
  const bounded = relative(absoluteParent, absolute)
  if (!bounded || bounded === '..' || bounded.startsWith('..\\') || bounded.startsWith('../')
    || bounded.replaceAll('\\', '/') !== candidate) fail(code)
  return { absolute, parts, relative: candidate }
}

async function assertPathChain(parent, parts, finalKind, code) {
  const parentMetadata = await lstat(resolve(parent)).catch(() => null)
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) fail(code)
  let current = resolve(parent)
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index])
    const metadata = await lstat(current).catch(() => null)
    if (!metadata || metadata.isSymbolicLink()) fail(code)
    const final = index === parts.length - 1
    if (!final && !metadata.isDirectory()) fail(code)
    if (final && finalKind === 'file' && !metadata.isFile()) fail(code)
    if (final && finalKind === 'directory' && !metadata.isDirectory()) fail(code)
  }
  return current
}

async function readBoundedJson(path, maximumBytes, code) {
  const metadata = await lstat(path).catch(() => null)
  if (!metadata?.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximumBytes) fail(code)
  const payload = await readFile(path)
  let value
  try {
    value = JSON.parse(payload.toString('utf8'))
  } catch {
    fail(code)
  }
  if (!isObject(value)) fail(code)
  return { payload, value }
}

function assertAllChecksTrue(checks, required, code) {
  if (!isObject(checks)) fail(code)
  for (const name of required) if (checks[name] !== true) fail(code)
}

export function assertRenderedProofCaseMatrix(cases, scope) {
  const expectedCases = CASE_MATRIX_BY_SCOPE[scope]
  if (!expectedCases || !Array.isArray(cases) || cases.length !== expectedCases.length) {
    fail('app_entry_rendered_case_matrix_mismatch')
  }
  const identities = new Set()
  for (let index = 0; index < expectedCases.length; index += 1) {
    const expected = expectedCases[index]
    const testCase = cases[index]
    if (!isObject(testCase) || testCase.name !== expected.name || testCase.route !== expected.route
      || testCase.viewport !== expected.viewport
      || (expected.path !== undefined && testCase.path !== expected.path)
      || (expected.pathPrefix !== undefined && !String(testCase.path || '').startsWith(expected.pathPrefix))) {
      fail('app_entry_rendered_case_matrix_mismatch')
    }
    const identity = `${testCase.name}\n${testCase.route}\n${testCase.viewport}`
    if (identities.has(identity)) fail('app_entry_rendered_case_matrix_mismatch')
    identities.add(identity)
    if (expected.screenshot === null) {
      if (testCase.screenshot !== null) fail('app_entry_rendered_case_matrix_mismatch')
    } else if (!isObject(testCase.screenshot) || testCase.screenshot.file !== expected.screenshot) {
      fail('app_entry_rendered_case_matrix_mismatch')
    }
  }
  return expectedCases
}

function assertCaseSemantics(testCase, scope) {
  if (!isObject(testCase) || testCase.ok !== true) fail('app_entry_rendered_case_failed')
  if (exactArray(testCase.failures, 'app_entry_rendered_case_failures_invalid').length) fail('app_entry_rendered_case_failed')
  if (!isObject(testCase.runtime) || testCase.runtime.clean !== true) fail('app_entry_rendered_case_runtime_failed')
  if (exactArray(testCase.runtime.errors, 'app_entry_rendered_case_runtime_invalid').length) fail('app_entry_rendered_case_runtime_failed')
  if (!Number.isInteger(testCase.bodyLength) || testCase.bodyLength < 1) fail('app_entry_rendered_case_body_invalid')
  if (!exactString(testCase.path, 'app_entry_rendered_case_path_invalid').startsWith('/')) fail('app_entry_rendered_case_path_invalid')
  exactString(testCase.viewport, 'app_entry_rendered_case_viewport_invalid')

  if (testCase.network !== null && testCase.network !== undefined) {
    if (!isObject(testCase.network)
      || testCase.network.mutatingRequestCount !== 0
      || exactArray(testCase.network.mutatingRequests, 'app_entry_rendered_case_network_invalid').length) {
      fail('app_entry_rendered_mutating_network_observed')
    }
  }

  if (scope === 'shop-counter') {
    const layout = testCase.layout
    if (!isObject(layout) || layout.ok !== true || layout.aboveFold !== true) fail('app_entry_rendered_shop_layout_failed')
    if (layout.documentScrollWidth > layout.viewportWidth) fail('app_entry_rendered_horizontal_overflow')
    for (const control of ['payment', 'openOrderChoice', 'total', 'reviewButton']) {
      if (!isObject(layout[control]) || !Number.isFinite(layout[control].bottom)
        || layout[control].bottom > layout.viewportHeight + 0.25) fail('app_entry_rendered_shop_layout_failed')
    }
    if (!isObject(layout.accessibility) || layout.accessibility.ok !== true) fail('app_entry_rendered_shop_accessibility_failed')
    assertAllChecksTrue(layout.accessibility.semantics, [
      'productTileLabelled',
      'paymentButtonsNamed',
      'paymentPressedStatePresent',
      'openOrderCheckboxLabelled',
      'reviewButtonNamed',
      'criticalControlsFocusable',
    ], 'app_entry_rendered_shop_accessibility_failed')
    if (!Number.isInteger(layout.accessibility.semantics.paymentButtonCount)
      || layout.accessibility.semantics.paymentButtonCount < 1) fail('app_entry_rendered_shop_accessibility_failed')
    const targets = layout.accessibility.touchTargets
    if (!isObject(targets)) fail('app_entry_rendered_shop_touch_targets_invalid')
    if (targets.required === true
      && (!Number.isFinite(targets.minimumHeightPx)
        || !Number.isFinite(targets.roundingTolerancePx)
        || !Number.isFinite(targets.minimumObservedHeightPx)
        || !Number.isInteger(targets.checked)
        || targets.checked < 1
        || targets.minimumObservedHeightPx + targets.roundingTolerancePx < targets.minimumHeightPx)) {
      fail('app_entry_rendered_shop_touch_targets_failed')
    }
  }

  if (scope === 'ecommerce-claim') {
    const boundary = testCase.claimBoundary
    if (!isObject(boundary) || boundary.ok !== true || boundary.boundaryVisible !== true
      || boundary.oldManagedHeadlineVisible !== false || boundary.companyReceiptClaimVisible !== false
      || boundary.localBuyingStatePresent !== true || boundary.documentScrollWidth > boundary.viewportWidth) {
      fail('app_entry_rendered_ecommerce_claim_boundary_failed')
    }
    assertAllChecksTrue(boundary.checks, [
      'localHeadline',
      'localSummary',
      'localNotice',
      'localReceipt',
      'boundaryVisible',
      'managedHeadlineAbsent',
      'companyReceiptClaimAbsent',
      'browserPersistencePresent',
      'noHorizontalOverflow',
    ], 'app_entry_rendered_ecommerce_claim_boundary_failed')
    if (!isObject(testCase.network) || testCase.network.mutatingRequestCount !== 0) {
      fail('app_entry_rendered_ecommerce_network_proof_missing')
    }
  }
}

async function assertScreenshot(evidenceDir, descriptor, seenFiles) {
  if (!isObject(descriptor)) fail('app_entry_rendered_screenshot_descriptor_invalid')
  const screenshot = safeRelativePath(evidenceDir, descriptor.file, 'app_entry_rendered_screenshot_path_invalid')
  if (extname(screenshot.relative).toLowerCase() !== '.png' || seenFiles.has(screenshot.relative)) {
    fail('app_entry_rendered_screenshot_path_invalid')
  }
  seenFiles.add(screenshot.relative)
  await assertPathChain(evidenceDir, screenshot.parts, 'file', 'app_entry_rendered_screenshot_invalid')
  const payload = await readFile(screenshot.absolute)
  if (payload.byteLength < 1 || payload.byteLength > MAX_SCREENSHOT_BYTES
    || descriptor.bytes !== payload.byteLength
    || exactDigest(descriptor.digest, 'app_entry_rendered_screenshot_digest_invalid') !== sha256Digest(payload)) {
    fail('app_entry_rendered_screenshot_mismatch')
  }
  return { file: screenshot.relative, bytes: payload.byteLength, digest: descriptor.digest }
}

export function parseRenderedProofValidationArgs(args = []) {
  const options = {}
  const names = new Map([
    ['--report', 'reportPath'],
    ['--expected-head', 'expectedHead'],
    ['--expected-scope', 'expectedScope'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    const key = names.get(name)
    const value = args[index + 1]
    if (!key || options[key] !== undefined || !value || value.startsWith('--')) fail('app_entry_rendered_validation_arguments_invalid')
    options[key] = value
    index += 1
  }
  if (Object.keys(options).length !== names.size) fail('app_entry_rendered_validation_arguments_required')
  return options
}

export async function validateRenderedProofReport({ reportPath, expectedHead, expectedScope, rootDir = root }) {
  const exactHead = String(expectedHead || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(exactHead)) fail('app_entry_rendered_expected_head_required')
  if (!ALLOWED_SCOPES.has(expectedScope)) fail('app_entry_rendered_expected_scope_required')
  const exactRoot = resolve(rootDir)
  const exactReportPath = resolve(exactString(reportPath, 'app_entry_rendered_report_required'))
  const evidenceDir = dirname(exactReportPath)
  const reportName = relative(evidenceDir, exactReportPath).replaceAll('\\', '/')
  const reportMetadata = await lstat(exactReportPath).catch(() => null)
  const evidenceMetadata = await lstat(evidenceDir).catch(() => null)
  if (!evidenceMetadata?.isDirectory() || evidenceMetadata.isSymbolicLink()
    || !reportMetadata?.isFile() || reportMetadata.isSymbolicLink()
    || reportMetadata.size < 1 || reportMetadata.size > MAX_REPORT_BYTES) {
    fail('app_entry_rendered_report_invalid')
  }

  const { payload: reportPayload, value: report } = await readBoundedJson(
    exactReportPath,
    MAX_REPORT_BYTES,
    'app_entry_rendered_report_invalid',
  )
  const claimedDigest = exactDigest(report.digest, 'app_entry_rendered_report_digest_invalid')
  const body = {}
  for (const [key, value] of Object.entries(report)) if (key !== 'digest') body[key] = value
  if (sha256Digest(JSON.stringify(body)) !== claimedDigest) fail('app_entry_rendered_report_digest_mismatch')
  if (report.contract !== APP_ENTRY_RENDERED_CONTRACT || report.ok !== true || report.scope !== expectedScope) {
    fail('app_entry_rendered_report_contract_invalid')
  }
  if (report.evidence?.directory !== '.' || report.evidence?.report !== reportName) {
    fail('app_entry_rendered_evidence_descriptor_mismatch')
  }
  if (typeof report.generatedAt !== 'string' || Number.isNaN(Date.parse(report.generatedAt))
    || new Date(report.generatedAt).toISOString() !== report.generatedAt) {
    fail('app_entry_rendered_generated_at_invalid')
  }
  if (exactArray(report.failures, 'app_entry_rendered_report_failures_invalid').length) fail('app_entry_rendered_report_failed')
  exactString(report.browser, 'app_entry_rendered_browser_invalid')

  const currentSource = collectGitSourceState(exactRoot)
  if (!isObject(report.source) || report.source.commit !== exactHead || report.source.tree !== currentSource.tree
    || report.source.clean !== true || JSON.stringify(report.source) !== JSON.stringify(currentSource)
    || report.sourceSha !== exactHead || report.sourceTreeSha !== currentSource.tree || report.sourceTreeClean !== true) {
    fail('app_entry_rendered_source_mismatch')
  }

  if (!isObject(report.verifier) || report.verifier.path !== 'tools/verify_app_entry_rendered.mjs') {
    fail('app_entry_rendered_verifier_descriptor_invalid')
  }
  const verifier = safeRelativePath(exactRoot, report.verifier.path, 'app_entry_rendered_verifier_path_invalid')
  await assertPathChain(exactRoot, verifier.parts, 'file', 'app_entry_rendered_verifier_invalid')
  const verifierPayload = await readFile(verifier.absolute)
  if (report.verifier.bytes !== verifierPayload.byteLength
    || exactDigest(report.verifier.digest, 'app_entry_rendered_verifier_digest_invalid') !== sha256Digest(verifierPayload)
    || report.verifierSha256 !== report.verifier.digest) {
    fail('app_entry_rendered_verifier_mismatch')
  }

  if (!isObject(report.artifact) || report.artifact.path !== 'showroom/dist') {
    fail('app_entry_rendered_artifact_descriptor_invalid')
  }
  const artifact = safeRelativePath(exactRoot, report.artifact.path, 'app_entry_rendered_artifact_path_invalid')
  await assertPathChain(exactRoot, artifact.parts, 'directory', 'app_entry_rendered_artifact_invalid')
  const manifest = await collectDirectoryManifest(artifact.absolute)
  if (report.artifact.digest !== manifest.digest || report.artifact.fileCount !== manifest.fileCount
    || report.artifact.totalBytes !== manifest.totalBytes || report.distManifestSha256 !== manifest.digest) {
    fail('app_entry_rendered_artifact_mismatch')
  }

  const releasePath = resolve(artifact.absolute, '__release.json')
  const { value: release } = await readBoundedJson(releasePath, 1024 * 1024, 'app_entry_rendered_release_metadata_invalid')
  if (release.service !== 'supermega-app' || release.commit !== exactHead) fail('app_entry_rendered_release_commit_mismatch')

  const cases = exactArray(report.cases, 'app_entry_rendered_cases_invalid')
  if (!cases.length || cases.length > MAX_CASES || report.checks !== cases.length) fail('app_entry_rendered_cases_invalid')
  const expectedCases = assertRenderedProofCaseMatrix(cases, expectedScope)
  const seenScreenshots = new Set()
  const screenshots = []
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index]
    const expected = expectedCases[index]
    assertCaseSemantics(testCase, expected.semantics || 'generic')
    if (expected.screenshot !== null) {
      screenshots.push(await assertScreenshot(evidenceDir, testCase.screenshot, seenScreenshots))
    }
  }
  const runtimeErrorCount = cases.reduce((total, testCase) => total + testCase.runtime.errors.length, 0)
  if (!isObject(report.runtime) || report.runtime.clean !== true || report.runtime.errorCount !== runtimeErrorCount
    || runtimeErrorCount !== 0) {
    fail('app_entry_rendered_runtime_failed')
  }

  const validatorPayload = await readFile(fileURLToPath(import.meta.url))
  return {
    ok: true,
    contract: APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
    report: reportName,
    reportFileDigest: sha256Digest(reportPayload),
    reportBodyDigest: claimedDigest,
    source: currentSource,
    scope: expectedScope,
    verifier: { digest: report.verifier.digest, bytes: report.verifier.bytes },
    artifact: { digest: manifest.digest, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes },
    screenshots,
    validatorDigest: sha256Digest(validatorPayload),
  }
}

async function main() {
  const options = parseRenderedProofValidationArgs(process.argv.slice(2))
  const result = await validateRenderedProofReport(options)
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
      failures: [error.message],
    }, null, 2))
    process.exit(1)
  })
}
