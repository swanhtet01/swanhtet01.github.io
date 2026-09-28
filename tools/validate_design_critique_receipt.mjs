#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertDesignCritiqueReceipt,
  buildRenderedProofBinding,
  DESIGN_CRITIQUE_RECEIPT_CONTRACT,
  normalizeRenderedValidation,
  readRenderedReportGeneratedAt,
} from './generate_design_critique_receipt.mjs'
import { sha256Digest } from './rendered_proof_provenance.mjs'
import { validateRenderedProofReport } from './validate_app_entry_rendered_report.mjs'

export const DESIGN_CRITIQUE_VALIDATION_CONTRACT = 'supermega.design-critique-validation.v1'

const MAX_RECEIPT_BYTES = 256 * 1024
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(code) {
  throw new Error(code)
}

export function parseDesignCritiqueValidationArgs(args = []) {
  const options = {}
  const names = new Map([
    ['--receipt', 'receiptPath'],
    ['--report', 'reportPath'],
    ['--expected-head', 'expectedHead'],
    ['--expected-scope', 'expectedScope'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = names.get(args[index])
    const value = args[index + 1]
    if (!key || options[key] !== undefined || !value || value.startsWith('--')) {
      fail('design_critique_validation_arguments_invalid')
    }
    options[key] = value
    index += 1
  }
  if (Object.keys(options).length !== names.size) fail('design_critique_validation_arguments_required')
  return options
}

async function readBoundedReceipt(path) {
  const exactPath = resolve(path)
  const metadata = await lstat(exactPath).catch(() => null)
  if (!metadata?.isFile() || metadata.isSymbolicLink()
    || metadata.size < 2 || metadata.size > MAX_RECEIPT_BYTES) {
    fail('design_critique_receipt_file_invalid')
  }
  const payload = await readFile(exactPath)
  let value
  try {
    value = JSON.parse(payload.toString('utf8'))
  } catch {
    fail('design_critique_receipt_file_invalid')
  }
  return { exactPath, payload, value }
}

export function validateDesignCritiqueReceiptDocument({
  receiptPayload,
  receipt,
  renderedValidation,
  reportGeneratedAt,
  validatorPayload,
}) {
  const normalizedReceipt = assertDesignCritiqueReceipt(receipt)
  const normalizedValidation = normalizeRenderedValidation(renderedValidation)
  const expectedBinding = buildRenderedProofBinding(normalizedValidation, reportGeneratedAt)
  if (JSON.stringify(normalizedReceipt.source) !== JSON.stringify(normalizedValidation.source)) {
    fail('design_critique_source_binding_mismatch')
  }
  if (JSON.stringify(normalizedReceipt.renderedProof) !== JSON.stringify(expectedBinding)) {
    fail('design_critique_rendered_proof_binding_mismatch')
  }
  const payload = Buffer.isBuffer(receiptPayload)
    ? receiptPayload
    : Buffer.from(String(receiptPayload || ''), 'utf8')
  if (!payload.length) fail('design_critique_receipt_payload_invalid')
  let payloadReceipt
  try {
    payloadReceipt = JSON.parse(payload.toString('utf8'))
  } catch {
    fail('design_critique_receipt_payload_invalid')
  }
  if (JSON.stringify(payloadReceipt) !== JSON.stringify(receipt)) {
    fail('design_critique_receipt_payload_mismatch')
  }
  const validatorBytes = Buffer.isBuffer(validatorPayload)
    ? validatorPayload
    : Buffer.from(String(validatorPayload || ''), 'utf8')
  if (!validatorBytes.length) fail('design_critique_validator_payload_invalid')
  return {
    ok: true,
    contract: DESIGN_CRITIQUE_VALIDATION_CONTRACT,
    receiptFileDigest: sha256Digest(payload),
    receiptBodyDigest: normalizedReceipt.digest,
    source: normalizedReceipt.source,
    product: normalizedReceipt.review.product,
    scope: normalizedReceipt.renderedProof.scope,
    renderedProofValidationDigest: expectedBinding.validationDigest,
    screenshotCount: expectedBinding.screenshots.length,
    minimumObservedScore: normalizedReceipt.gates.minimumObservedScore,
    reviewerRole: normalizedReceipt.review.reviewerRole,
    readyForSourceReview: true,
    exactPreviewAccepted: false,
    releaseAuthorized: false,
    validatorDigest: sha256Digest(validatorBytes),
  }
}

export async function validateDesignCritiqueReceipt({
  receiptPath,
  reportPath,
  expectedHead,
  expectedScope,
  rootDir = root,
}) {
  const [{ exactPath, payload, value }, renderedValidation, validatorPayload] = await Promise.all([
    readBoundedReceipt(receiptPath),
    validateRenderedProofReport({ reportPath, expectedHead, expectedScope, rootDir }),
    readFile(fileURLToPath(import.meta.url)),
  ])
  const reportGeneratedAt = await readRenderedReportGeneratedAt(reportPath, renderedValidation)
  const result = validateDesignCritiqueReceiptDocument({
    receiptPayload: payload,
    receipt: value,
    renderedValidation,
    reportGeneratedAt,
    validatorPayload,
  })
  return { ...result, receipt: basename(exactPath) }
}

async function main() {
  const options = parseDesignCritiqueValidationArgs(process.argv.slice(2))
  const result = await validateDesignCritiqueReceipt(options)
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: DESIGN_CRITIQUE_VALIDATION_CONTRACT,
      receiptContract: DESIGN_CRITIQUE_RECEIPT_CONTRACT,
      failures: [error.message],
    }, null, 2))
    process.exit(1)
  })
}
