#!/usr/bin/env node

import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sha256Digest } from './rendered_proof_provenance.mjs'
import {
  APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
  validateRenderedProofReport,
} from './validate_app_entry_rendered_report.mjs'

export const DESIGN_CRITIQUE_REVIEW_INPUT_CONTRACT = 'supermega.design-critique-review-input.v1'
export const DESIGN_CRITIQUE_RECEIPT_CONTRACT = 'supermega.design-critique-receipt.v1'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SLUG_PATTERN = /^[a-z][a-z0-9_]{2,63}$/
const SAFE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const MAX_REVIEW_BYTES = 128 * 1024
const MAX_RENDERED_REPORT_BYTES = 10 * 1024 * 1024
const MINIMUM_SCORE = 3
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED_SCOPES = new Set(['full', 'shop-counter', 'ecommerce-claim'])
const ALLOWED_REFERENCE_URLS = new Set([
  'https://github.com/nexu-io/open-design',
])
const PRODUCT_BY_SCOPE = Object.freeze({
  full: 'portfolio',
  'shop-counter': 'shop',
  'ecommerce-claim': 'ecommerce',
})
const USER_ROLES_BY_PRODUCT = Object.freeze({
  portfolio: new Set(['portfolio_reviewer']),
  shop: new Set(['cashier', 'owner_operator']),
  ecommerce: new Set(['buyer']),
})
const FIRST_JOB_BY_PRODUCT = Object.freeze({
  portfolio: 'review_four_product_entry',
  shop: 'sell_from_trade_specific_counter',
  ecommerce: 'build_and_review_customer_request',
})
const REVIEW_ROLES = new Set([
  'technical_steward',
  'senior_engineer',
  'security_reviewer',
  'infra_engineer',
  'growth_lead',
  'risk_reviewer',
  'design_reviewer',
  'owner_reviewer',
])
const DIMENSIONS = Object.freeze([
  'job_clarity',
  'truth_and_safety',
  'completion_hierarchy',
  'mobile_and_access',
  'system_coherence',
])
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value, keys, code) {
  if (!isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code)
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || Number.isNaN(Date.parse(normalized))
    || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
}

function exactDate(value, code) {
  const normalized = String(value || '').trim()
  if (!DATE_PATTERN.test(normalized)
    || new Date(normalized + 'T00:00:00.000Z').toISOString().slice(0, 10) !== normalized) fail(code)
  return normalized
}

function exactSlug(value, code) {
  const normalized = String(value || '').trim()
  if (!SLUG_PATTERN.test(normalized) || SECRET_PATTERN.test(normalized)) fail(code)
  return normalized
}

function safeFile(value, code) {
  const normalized = String(value || '').trim()
  if (!SAFE_FILE_PATTERN.test(normalized) || normalized === '.' || normalized === '..') fail(code)
  return normalized
}

function comparablePath(value) {
  const absolute = resolve(value)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

function safeReferenceUrl(value) {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch {
    fail('design_critique_reference_url_invalid')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.search || parsed.hash
    || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname)
    || parsed.hostname.toLowerCase() === 'localhost') fail('design_critique_reference_url_invalid')
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
  const canonical = parsed.origin.toLowerCase() + path
  if (!ALLOWED_REFERENCE_URLS.has(canonical)) fail('design_critique_reference_url_invalid')
  return canonical
}

function exactSlugList(value, code, { minimum = 0, maximum = 5 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(code)
  const normalized = value.map((entry) => exactSlug(entry, code))
  if (new Set(normalized).size !== normalized.length) fail(code)
  return normalized
}

function normalizeSource(value) {
  exactKeys(value, ['commit', 'tree', 'clean'], 'design_critique_source_shape_invalid')
  const source = {
    commit: exactSha(value.commit, 'design_critique_source_commit_invalid'),
    tree: exactSha(value.tree, 'design_critique_source_tree_invalid'),
    clean: value.clean,
  }
  if (source.clean !== true) fail('design_critique_source_not_clean')
  return source
}

function normalizeScreenshots(value, code) {
  if (!Array.isArray(value) || !value.length || value.length > 12) fail(code)
  const seen = new Set()
  return value.map((entry) => {
    exactKeys(entry, ['file', 'bytes', 'digest'], code)
    const file = safeFile(entry.file, code)
    if (seen.has(file)) fail(code)
    seen.add(file)
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 32 * 1024 * 1024) fail(code)
    return {
      file,
      bytes: entry.bytes,
      digest: exactDigest(entry.digest, code),
    }
  })
}

export function normalizeRenderedValidation(value) {
  exactKeys(value, [
    'ok', 'contract', 'report', 'reportFileDigest', 'reportBodyDigest', 'source', 'scope',
    'verifier', 'artifact', 'screenshots', 'validatorDigest',
  ], 'design_critique_rendered_validation_shape_invalid')
  if (value.ok !== true || value.contract !== APP_ENTRY_RENDERED_VALIDATION_CONTRACT
    || !ALLOWED_SCOPES.has(value.scope)) fail('design_critique_rendered_validation_contract_invalid')
  exactKeys(value.verifier, ['digest', 'bytes'], 'design_critique_rendered_verifier_shape_invalid')
  exactKeys(value.artifact, ['digest', 'fileCount', 'totalBytes'], 'design_critique_rendered_artifact_shape_invalid')
  if (!Number.isSafeInteger(value.verifier.bytes) || value.verifier.bytes < 1
    || !Number.isSafeInteger(value.artifact.fileCount) || value.artifact.fileCount < 1
    || !Number.isSafeInteger(value.artifact.totalBytes) || value.artifact.totalBytes < 1) {
    fail('design_critique_rendered_counts_invalid')
  }
  const normalized = {
    ok: true,
    contract: APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
    report: safeFile(value.report, 'design_critique_rendered_report_invalid'),
    reportFileDigest: exactDigest(value.reportFileDigest, 'design_critique_rendered_report_digest_invalid'),
    reportBodyDigest: exactDigest(value.reportBodyDigest, 'design_critique_rendered_report_digest_invalid'),
    source: normalizeSource(value.source),
    scope: value.scope,
    verifier: {
      digest: exactDigest(value.verifier.digest, 'design_critique_rendered_verifier_digest_invalid'),
      bytes: value.verifier.bytes,
    },
    artifact: {
      digest: exactDigest(value.artifact.digest, 'design_critique_rendered_artifact_digest_invalid'),
      fileCount: value.artifact.fileCount,
      totalBytes: value.artifact.totalBytes,
    },
    screenshots: normalizeScreenshots(value.screenshots, 'design_critique_rendered_screenshots_invalid'),
    validatorDigest: exactDigest(value.validatorDigest, 'design_critique_rendered_validator_digest_invalid'),
  }
  return normalized
}

export function buildRenderedProofBinding(renderedValidation, reportGeneratedAt) {
  const normalized = normalizeRenderedValidation(renderedValidation)
  return {
    validationContract: normalized.contract,
    validationDigest: sha256Digest(JSON.stringify(normalized)),
    report: normalized.report,
    reportFileDigest: normalized.reportFileDigest,
    reportBodyDigest: normalized.reportBodyDigest,
    reportGeneratedAt: exactTimestamp(reportGeneratedAt, 'design_critique_rendered_report_time_invalid'),
    scope: normalized.scope,
    verifierDigest: normalized.verifier.digest,
    artifactDigest: normalized.artifact.digest,
    validatorDigest: normalized.validatorDigest,
    screenshots: normalized.screenshots,
  }
}

function normalizeReference(value, reviewedAt) {
  exactKeys(value, ['url', 'accessedOn', 'principle'], 'design_critique_reference_shape_invalid')
  const accessedOn = exactDate(value.accessedOn, 'design_critique_reference_date_invalid')
  if (accessedOn > reviewedAt.slice(0, 10)) fail('design_critique_reference_date_invalid')
  return {
    url: safeReferenceUrl(value.url),
    accessedOn,
    principle: exactSlug(value.principle, 'design_critique_reference_principle_invalid'),
  }
}

function normalizeInspectedScreenshots(value, renderedScreenshots) {
  if (!Array.isArray(value) || value.length !== renderedScreenshots.length) {
    fail('design_critique_inspected_screenshots_incomplete')
  }
  const normalized = value.map((entry) => {
    exactKeys(entry, ['file', 'digest'], 'design_critique_inspected_screenshot_shape_invalid')
    return {
      file: safeFile(entry.file, 'design_critique_inspected_screenshot_invalid'),
      digest: exactDigest(entry.digest, 'design_critique_inspected_screenshot_invalid'),
    }
  })
  const expected = renderedScreenshots.map(({ file, digest }) => ({ file, digest }))
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    fail('design_critique_inspected_screenshots_mismatch')
  }
  return normalized
}

function normalizeDimensions(value, inspectedScreenshots) {
  if (!Array.isArray(value) || value.length !== DIMENSIONS.length) fail('design_critique_dimensions_invalid')
  const inspected = new Set(inspectedScreenshots.map(({ file }) => file))
  return value.map((entry, index) => {
    exactKeys(entry, ['id', 'score', 'evidence'], 'design_critique_dimension_shape_invalid')
    if (entry.id !== DIMENSIONS[index]
      || !Number.isInteger(entry.score) || entry.score < MINIMUM_SCORE || entry.score > 4) {
      fail('design_critique_dimension_failed')
    }
    exactKeys(entry.evidence, ['screenshot', 'element', 'finding'], 'design_critique_dimension_evidence_invalid')
    const screenshot = safeFile(entry.evidence.screenshot, 'design_critique_dimension_evidence_invalid')
    if (!inspected.has(screenshot)) fail('design_critique_dimension_evidence_invalid')
    return {
      id: entry.id,
      score: entry.score,
      evidence: {
        screenshot,
        element: exactSlug(entry.evidence.element, 'design_critique_dimension_evidence_invalid'),
        finding: exactSlug(entry.evidence.finding, 'design_critique_dimension_evidence_invalid'),
      },
    }
  })
}

export function normalizeReviewInput(value, renderedProof) {
  exactKeys(value, [
    'contract', 'reviewedAt', 'product', 'userRole', 'firstJob', 'visualDirection',
    'reference', 'implementerRole', 'reviewerRole', 'independenceAttested', 'manualVisualInspection',
    'inspectedScreenshots', 'dimensions', 'keep', 'fix', 'verdict',
  ], 'design_critique_review_shape_invalid')
  if (value.contract !== DESIGN_CRITIQUE_REVIEW_INPUT_CONTRACT) fail('design_critique_review_contract_invalid')
  const reviewedAt = exactTimestamp(value.reviewedAt, 'design_critique_reviewed_at_invalid')
  const product = exactSlug(value.product, 'design_critique_product_invalid')
  const expectedProduct = PRODUCT_BY_SCOPE[renderedProof.scope]
  if (product !== expectedProduct) fail('design_critique_product_scope_mismatch')
  const userRole = exactSlug(value.userRole, 'design_critique_user_role_invalid')
  if (!USER_ROLES_BY_PRODUCT[product]?.has(userRole)) fail('design_critique_user_role_invalid')
  const firstJob = exactSlug(value.firstJob, 'design_critique_first_job_invalid')
  if (firstJob !== FIRST_JOB_BY_PRODUCT[product]) fail('design_critique_first_job_invalid')
  const implementerRole = exactSlug(value.implementerRole, 'design_critique_implementer_role_invalid')
  const reviewerRole = exactSlug(value.reviewerRole, 'design_critique_reviewer_role_invalid')
  if (!REVIEW_ROLES.has(implementerRole) || !REVIEW_ROLES.has(reviewerRole)
    || implementerRole === reviewerRole) fail('design_critique_reviewer_not_independent')
  if (value.independenceAttested !== true
    || value.manualVisualInspection !== true || value.verdict !== 'accept') {
    fail('design_critique_review_not_accepted')
  }
  const inspectedScreenshots = normalizeInspectedScreenshots(
    value.inspectedScreenshots,
    renderedProof.screenshots,
  )
  return {
    contract: DESIGN_CRITIQUE_REVIEW_INPUT_CONTRACT,
    reviewedAt,
    product,
    userRole,
    firstJob,
    visualDirection: exactSlug(value.visualDirection, 'design_critique_visual_direction_invalid'),
    reference: normalizeReference(value.reference, reviewedAt),
    implementerRole,
    reviewerRole,
    independenceAttested: true,
    manualVisualInspection: true,
    inspectedScreenshots,
    dimensions: normalizeDimensions(value.dimensions, inspectedScreenshots),
    keep: exactSlugList(value.keep, 'design_critique_keep_invalid', { minimum: 1 }),
    fix: exactSlugList(value.fix, 'design_critique_fix_invalid'),
    verdict: 'accept',
  }
}

function buildGates(review) {
  const scores = review.dimensions.map(({ score }) => score)
  return {
    minimumScore: MINIMUM_SCORE,
    minimumObservedScore: Math.min(...scores),
    allDimensionsPassing: scores.every((score) => score >= MINIMUM_SCORE),
    allScreenshotsInspected: true,
    roleLabelsDistinct: review.implementerRole !== review.reviewerRole,
    independentReviewAttested: review.independenceAttested,
    readyForSourceReview: true,
    exactPreviewAccepted: false,
    releaseAuthorized: false,
  }
}

function buildControls() {
  return {
    manualVisualInspection: true,
    externalActionsPerformed: false,
    providerWritesPerformed: false,
    customerEvidence: false,
    revenueEvidence: false,
  }
}

function assertGenerationWindow(generatedAt, reviewedAt) {
  const generated = Date.parse(generatedAt)
  const reviewed = Date.parse(reviewedAt)
  if (reviewed > generated + 60_000 || generated - reviewed > 24 * 60 * 60 * 1000
    || generated > Date.now() + 5 * 60 * 1000) {
    fail('design_critique_generation_window_invalid')
  }
}

function assertReviewEvidenceWindow(reportGeneratedAt, reviewedAt, generatedAt) {
  const rendered = Date.parse(reportGeneratedAt)
  const reviewed = Date.parse(reviewedAt)
  if (reviewed < rendered - 60_000 || reviewed - rendered > 24 * 60 * 60 * 1000) {
    fail('design_critique_review_evidence_window_invalid')
  }
  assertGenerationWindow(generatedAt, reviewedAt)
}

function normalizeRenderedProofReceipt(value) {
  exactKeys(value, [
    'validationContract', 'validationDigest', 'report', 'reportFileDigest', 'reportBodyDigest',
    'reportGeneratedAt',
    'scope', 'verifierDigest', 'artifactDigest', 'validatorDigest', 'screenshots',
  ], 'design_critique_rendered_proof_shape_invalid')
  if (value.validationContract !== APP_ENTRY_RENDERED_VALIDATION_CONTRACT
    || !ALLOWED_SCOPES.has(value.scope)) fail('design_critique_rendered_proof_contract_invalid')
  return {
    validationContract: APP_ENTRY_RENDERED_VALIDATION_CONTRACT,
    validationDigest: exactDigest(value.validationDigest, 'design_critique_rendered_proof_digest_invalid'),
    report: safeFile(value.report, 'design_critique_rendered_proof_report_invalid'),
    reportFileDigest: exactDigest(value.reportFileDigest, 'design_critique_rendered_proof_report_digest_invalid'),
    reportBodyDigest: exactDigest(value.reportBodyDigest, 'design_critique_rendered_proof_report_digest_invalid'),
    reportGeneratedAt: exactTimestamp(value.reportGeneratedAt, 'design_critique_rendered_report_time_invalid'),
    scope: value.scope,
    verifierDigest: exactDigest(value.verifierDigest, 'design_critique_rendered_proof_verifier_digest_invalid'),
    artifactDigest: exactDigest(value.artifactDigest, 'design_critique_rendered_proof_artifact_digest_invalid'),
    validatorDigest: exactDigest(value.validatorDigest, 'design_critique_rendered_proof_validator_digest_invalid'),
    screenshots: normalizeScreenshots(value.screenshots, 'design_critique_rendered_proof_screenshots_invalid'),
  }
}

export function buildDesignCritiqueReceipt({
  renderedValidation,
  reportGeneratedAt,
  reviewInput,
  generatedAt = new Date().toISOString(),
}) {
  const validation = normalizeRenderedValidation(renderedValidation)
  const renderedProof = buildRenderedProofBinding(validation, reportGeneratedAt)
  const review = normalizeReviewInput(reviewInput, renderedProof)
  const exactGeneratedAt = exactTimestamp(generatedAt, 'design_critique_generated_at_invalid')
  assertReviewEvidenceWindow(renderedProof.reportGeneratedAt, review.reviewedAt, exactGeneratedAt)
  const body = {
    contract: DESIGN_CRITIQUE_RECEIPT_CONTRACT,
    generatedAt: exactGeneratedAt,
    source: validation.source,
    renderedProof,
    review,
    gates: buildGates(review),
    controls: buildControls(),
  }
  return { ...body, digest: sha256Digest(JSON.stringify(body)) }
}

export function assertDesignCritiqueReceipt(value) {
  exactKeys(value, [
    'contract', 'generatedAt', 'source', 'renderedProof', 'review', 'gates', 'controls', 'digest',
  ], 'design_critique_receipt_shape_invalid')
  if (value.contract !== DESIGN_CRITIQUE_RECEIPT_CONTRACT) fail('design_critique_receipt_contract_invalid')
  const generatedAt = exactTimestamp(value.generatedAt, 'design_critique_generated_at_invalid')
  const source = normalizeSource(value.source)
  const renderedProof = normalizeRenderedProofReceipt(value.renderedProof)
  const review = normalizeReviewInput(value.review, renderedProof)
  assertReviewEvidenceWindow(renderedProof.reportGeneratedAt, review.reviewedAt, generatedAt)
  const expectedGates = buildGates(review)
  const expectedControls = buildControls()
  if (JSON.stringify(value.gates) !== JSON.stringify(expectedGates)) fail('design_critique_gates_mismatch')
  if (JSON.stringify(value.controls) !== JSON.stringify(expectedControls)) fail('design_critique_controls_mismatch')
  const body = {
    contract: DESIGN_CRITIQUE_RECEIPT_CONTRACT,
    generatedAt,
    source,
    renderedProof,
    review,
    gates: expectedGates,
    controls: expectedControls,
  }
  const digest = exactDigest(value.digest, 'design_critique_receipt_digest_invalid')
  if (digest !== sha256Digest(JSON.stringify(body))) fail('design_critique_receipt_digest_mismatch')
  return { ...body, digest }
}

export function parseDesignCritiqueGenerationArgs(args = []) {
  const options = {}
  const names = new Map([
    ['--review', 'reviewPath'],
    ['--report', 'reportPath'],
    ['--expected-head', 'expectedHead'],
    ['--expected-scope', 'expectedScope'],
    ['--out', 'outputPath'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = names.get(args[index])
    const value = args[index + 1]
    if (!key || options[key] !== undefined || !value || value.startsWith('--')) {
      fail('design_critique_generation_arguments_invalid')
    }
    options[key] = value
    index += 1
  }
  if (Object.keys(options).length !== names.size) fail('design_critique_generation_arguments_required')
  return options
}

async function readBoundedReview(path) {
  const exactPath = resolve(path)
  const metadata = await lstat(exactPath).catch(() => null)
  if (!metadata?.isFile() || metadata.isSymbolicLink()
    || metadata.size < 2 || metadata.size > MAX_REVIEW_BYTES) fail('design_critique_review_file_invalid')
  try {
    return JSON.parse(await readFile(exactPath, 'utf8'))
  } catch {
    fail('design_critique_review_file_invalid')
  }
}

export async function readRenderedReportGeneratedAt(path, renderedValidation) {
  const validation = normalizeRenderedValidation(renderedValidation)
  const exactPath = resolve(path)
  const metadata = await lstat(exactPath).catch(() => null)
  if (!metadata?.isFile() || metadata.isSymbolicLink()
    || metadata.size < 2 || metadata.size > MAX_RENDERED_REPORT_BYTES
    || basename(exactPath) !== validation.report) {
    fail('design_critique_rendered_report_file_invalid')
  }
  const payload = await readFile(exactPath)
  if (sha256Digest(payload) !== validation.reportFileDigest) {
    fail('design_critique_rendered_report_file_mismatch')
  }
  let report
  try {
    report = JSON.parse(payload.toString('utf8'))
  } catch {
    fail('design_critique_rendered_report_file_invalid')
  }
  return exactTimestamp(report.generatedAt, 'design_critique_rendered_report_time_invalid')
}

async function assertOutputReady(path) {
  const exactPath = resolve(path)
  if (extname(exactPath).toLowerCase() !== '.json'
    || !SAFE_FILE_PATTERN.test(basename(exactPath))) fail('design_critique_output_path_invalid')
  const outputDirectory = dirname(exactPath)
  const directoryMetadata = await lstat(outputDirectory).catch(() => null)
  const outputMetadata = await lstat(exactPath).catch(() => null)
  const canonicalDirectory = await realpath(outputDirectory).catch(() => null)
  if (!directoryMetadata?.isDirectory() || directoryMetadata.isSymbolicLink()
    || !canonicalDirectory
    || comparablePath(canonicalDirectory) !== comparablePath(outputDirectory)
    || outputMetadata || (await readdir(outputDirectory)).length !== 0) {
    fail('design_critique_output_directory_not_empty')
  }
  return exactPath
}

export async function writeDesignCritiqueReceipt(path, receipt) {
  const normalized = assertDesignCritiqueReceipt(receipt)
  const outputPath = await assertOutputReady(path)
  await writeFile(outputPath, JSON.stringify(normalized, null, 2) + '\n', { flag: 'wx' })
  return normalized
}

export async function generateDesignCritiqueReceipt({
  reviewPath,
  reportPath,
  expectedHead,
  expectedScope,
  outputPath,
  rootDir = root,
  generatedAt = new Date().toISOString(),
}) {
  const [reviewInput, renderedValidation] = await Promise.all([
    readBoundedReview(reviewPath),
    validateRenderedProofReport({ reportPath, expectedHead, expectedScope, rootDir }),
  ])
  const reportGeneratedAt = await readRenderedReportGeneratedAt(reportPath, renderedValidation)
  const receipt = buildDesignCritiqueReceipt({
    renderedValidation,
    reportGeneratedAt,
    reviewInput,
    generatedAt,
  })
  return writeDesignCritiqueReceipt(outputPath, receipt)
}

async function main() {
  const options = parseDesignCritiqueGenerationArgs(process.argv.slice(2))
  const receipt = await generateDesignCritiqueReceipt(options)
  console.log(JSON.stringify(receipt, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: DESIGN_CRITIQUE_RECEIPT_CONTRACT,
      failures: [error.message],
    }, null, 2))
    process.exit(1)
  })
}
