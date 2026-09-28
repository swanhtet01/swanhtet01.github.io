#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT,
  SHOP_PILOT_BASELINE_PACKET_CONTRACT,
  buildShopPilotBaselinePacket,
  preflightShopPilotBaselineInput,
  renderShopPilotBaselinePacketMarkdown,
  validateShopPilotBaselineInputPreflight,
  validateShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'

export const SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT = 'supermega.shop.pilot_baseline_completion_receipt.v1'
export const SHOP_PILOT_BASELINE_COMPLETION_FILES = Object.freeze({
  preflight: 'owner-safe-baseline-preflight.json',
  packet: 'owner-safe-baseline-packet.json',
  markdown: 'owner-safe-baseline-packet.md',
  receipt: 'owner-safe-baseline-completion-receipt.json',
})

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const REQUIRED_FALSE_CONTROLS = [
  'externalWritesPerformed',
  'customerContactPerformed',
  'paymentAccepted',
  'stockMovementPerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'deploymentPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
]
const PRIVATE_OR_SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Za-z]:\\+[^"\n]+/,
  /(?:^|["\s])\/(?:Users|home)\/[^\s"]+/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

class ShopPilotBaselineCompletionError extends Error {
  constructor(code, failures = []) {
    super(code)
    this.code = code
    this.failures = [...new Set(failures.map(safeCode).filter(Boolean))].sort()
  }
}

function fail(code, failures = []) {
  throw new ShopPilotBaselineCompletionError(code, failures)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  fail('shop_pilot_baseline_completion_value_invalid')
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function canonicalDigest(value) {
  return digest(canonicalJson(value))
}

function safeCode(value) {
  const normalized = String(value || '').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 160)
  return normalized || 'shop_pilot_baseline_completion_failed'
}

function assertOwnerSafe(value, code = 'shop_pilot_baseline_completion_private_or_secret_shape') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  if (PRIVATE_OR_SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function artifact(fileName, contract, semanticDigest, content) {
  return {
    fileName,
    contract,
    semanticDigest,
    contentDigest: digest(content),
  }
}

export function validateShopPilotBaselineCompletionReceipt(receipt, evidence = {}) {
  assertOwnerSafe(receipt)
  if (!isRecord(receipt) || receipt.contract !== SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT) {
    fail('shop_pilot_baseline_completion_receipt_contract_invalid')
  }
  const { digest: actualDigest, ...body } = receipt
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== canonicalDigest(body)) {
    fail('shop_pilot_baseline_completion_receipt_digest_invalid')
  }
  if (receipt.digestScope !== 'utf8_compact_json_without_digest'
    || !ISO_PATTERN.test(receipt.generatedAt || '')
    || new Date(Date.parse(receipt.generatedAt)).toISOString() !== receipt.generatedAt
    || receipt.product !== 'shop'
    || receipt.pilotMode !== 'owner_named'
    || receipt.verticalPack !== 'spa-services'
    || receipt.status !== 'baseline_completion_ready'
    || receipt.ok !== true
    || receipt.evidenceKind !== 'owner_observed_manual_operations_only'
    || receipt.syntheticEvidenceAccepted !== false
    || receipt.outputPathsIncluded !== false
    || receipt.rawIdentityIncluded !== false
    || !DIGEST_PATTERN.test(receipt.privateInputDigest || '')) {
    fail('shop_pilot_baseline_completion_receipt_scope_invalid')
  }
  if (!isRecord(receipt.artifacts)) fail('shop_pilot_baseline_completion_receipt_artifacts_invalid')
  const expectedContracts = {
    preflight: SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT,
    packet: SHOP_PILOT_BASELINE_PACKET_CONTRACT,
    markdown: SHOP_PILOT_BASELINE_PACKET_CONTRACT,
    receipt: SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
  }
  for (const [key, fileName] of Object.entries(SHOP_PILOT_BASELINE_COMPLETION_FILES)) {
    const item = receipt.artifacts[key]
    if (!isRecord(item)
      || item.fileName !== fileName
      || item.contract !== expectedContracts[key]
      || (key !== 'receipt' && (!DIGEST_PATTERN.test(item.contentDigest || '') || !DIGEST_PATTERN.test(item.semanticDigest || '')))
      || (key === 'receipt' && (item.semanticDigest !== null || item.contentDigest !== null))) {
      fail('shop_pilot_baseline_completion_receipt_artifacts_invalid')
    }
  }
  if (!isRecord(receipt.checks)
    || receipt.checks.preflightReady !== true
    || receipt.checks.packetReady !== true
    || receipt.checks.packetVerified !== true
    || receipt.checks.directoryVerifiedBeforeCommitRequired !== true
    || receipt.checks.atomicDirectoryCommitRequired !== true
    || receipt.checks.writesNothingOnValidationFailure !== true) {
    fail('shop_pilot_baseline_completion_receipt_checks_invalid')
  }
  if (!isRecord(receipt.controls) || REQUIRED_FALSE_CONTROLS.some((key) => receipt.controls[key] !== false)) {
    fail('shop_pilot_baseline_completion_receipt_controls_invalid')
  }
  if (evidence.preflight) {
    const preflight = validateShopPilotBaselineInputPreflight(evidence.preflight)
    if (preflight.ok !== true
      || receipt.privateInputDigest !== preflight.privateInputDigest
      || receipt.artifacts.preflight.semanticDigest !== preflight.digest) {
      fail('shop_pilot_baseline_completion_receipt_preflight_mismatch')
    }
  }
  if (evidence.packet) {
    const packet = validateShopPilotBaselinePacket(evidence.packet)
    if (packet.ok !== true
      || receipt.privateInputDigest !== packet.privateInputDigest
      || receipt.artifacts.packet.semanticDigest !== packet.digest) {
      fail('shop_pilot_baseline_completion_receipt_packet_mismatch')
    }
  }
  return receipt
}

export function buildShopPilotBaselineCompletionBundle(input, { generatedAt = new Date().toISOString() } = {}) {
  const preflight = validateShopPilotBaselineInputPreflight(preflightShopPilotBaselineInput(input, { generatedAt }))
  if (preflight.ok !== true || preflight.status !== 'baseline_input_ready') {
    fail('shop_pilot_baseline_completion_blocked', preflight.failures)
  }
  const packet = validateShopPilotBaselinePacket(buildShopPilotBaselinePacket(input, { generatedAt }))
  if (packet.ok !== true || packet.status !== 'baseline_ready_for_private_pilot_handoff') {
    fail('shop_pilot_baseline_completion_packet_blocked', packet.failures)
  }
  if (packet.privateInputDigest !== preflight.privateInputDigest) {
    fail('shop_pilot_baseline_completion_input_digest_mismatch')
  }

  const preflightContent = `${JSON.stringify(preflight, null, 2)}\n`
  const packetContent = `${JSON.stringify(packet, null, 2)}\n`
  const markdownContent = `${renderShopPilotBaselinePacketMarkdown(packet)}\n`
  const body = {
    contract: SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: packet.generatedAt,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    status: 'baseline_completion_ready',
    ok: true,
    evidenceKind: 'owner_observed_manual_operations_only',
    syntheticEvidenceAccepted: false,
    privateInputDigest: packet.privateInputDigest,
    outputPathsIncluded: false,
    rawIdentityIncluded: false,
    artifacts: {
      preflight: artifact(SHOP_PILOT_BASELINE_COMPLETION_FILES.preflight, preflight.contract, preflight.digest, preflightContent),
      packet: artifact(SHOP_PILOT_BASELINE_COMPLETION_FILES.packet, packet.contract, packet.digest, packetContent),
      markdown: artifact(SHOP_PILOT_BASELINE_COMPLETION_FILES.markdown, packet.contract, packet.digest, markdownContent),
      receipt: {
        fileName: SHOP_PILOT_BASELINE_COMPLETION_FILES.receipt,
        contract: SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
        semanticDigest: null,
        contentDigest: null,
      },
    },
    checks: {
      preflightReady: true,
      packetReady: true,
      packetVerified: true,
      directoryVerifiedBeforeCommitRequired: true,
      atomicDirectoryCommitRequired: true,
      writesNothingOnValidationFailure: true,
    },
    controls: Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false])),
  }
  const receipt = { ...body, digest: canonicalDigest(body) }
  const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`

  assertOwnerSafe({ preflight, packet, markdownContent, receipt })
  validateShopPilotBaselineCompletionReceipt(receipt, { preflight, packet })
  return {
    preflight,
    packet,
    markdown: markdownContent,
    receipt,
    contents: {
      [SHOP_PILOT_BASELINE_COMPLETION_FILES.preflight]: preflightContent,
      [SHOP_PILOT_BASELINE_COMPLETION_FILES.packet]: packetContent,
      [SHOP_PILOT_BASELINE_COMPLETION_FILES.markdown]: markdownContent,
      [SHOP_PILOT_BASELINE_COMPLETION_FILES.receipt]: receiptContent,
    },
  }
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    fail('shop_pilot_baseline_completion_output_check_failed')
  }
}

async function readJson(path, code) {
  let content
  try {
    content = await readFile(path, 'utf8')
  } catch {
    fail(code)
  }
  try {
    return { value: JSON.parse(content), content }
  } catch {
    fail(`${code}_json_invalid`)
  }
}

export async function verifyShopPilotBaselineCompletionDirectory(outputDir) {
  const directory = resolve(outputDir || '')
  let names
  try {
    names = (await readdir(directory)).sort()
  } catch {
    fail('shop_pilot_baseline_completion_directory_unreadable')
  }
  const expected = Object.values(SHOP_PILOT_BASELINE_COMPLETION_FILES).sort()
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    fail('shop_pilot_baseline_completion_directory_contents_invalid')
  }
  const preflightFile = await readJson(join(directory, SHOP_PILOT_BASELINE_COMPLETION_FILES.preflight), 'shop_pilot_baseline_completion_preflight_unreadable')
  const packetFile = await readJson(join(directory, SHOP_PILOT_BASELINE_COMPLETION_FILES.packet), 'shop_pilot_baseline_completion_packet_unreadable')
  const receiptFile = await readJson(join(directory, SHOP_PILOT_BASELINE_COMPLETION_FILES.receipt), 'shop_pilot_baseline_completion_receipt_unreadable')
  let markdown
  try {
    markdown = await readFile(join(directory, SHOP_PILOT_BASELINE_COMPLETION_FILES.markdown), 'utf8')
  } catch {
    fail('shop_pilot_baseline_completion_markdown_unreadable')
  }
  const preflight = validateShopPilotBaselineInputPreflight(preflightFile.value)
  const packet = validateShopPilotBaselinePacket(packetFile.value)
  const receipt = validateShopPilotBaselineCompletionReceipt(receiptFile.value, { preflight, packet })
  if (preflight.ok !== true || packet.ok !== true) fail('shop_pilot_baseline_completion_not_ready')
  if (receipt.artifacts.preflight.contentDigest !== digest(preflightFile.content)
    || receipt.artifacts.packet.contentDigest !== digest(packetFile.content)
    || receipt.artifacts.markdown.contentDigest !== digest(markdown)) {
    fail('shop_pilot_baseline_completion_content_digest_mismatch')
  }
  assertOwnerSafe({ preflight, packet, markdown, receipt })
  return {
    ok: true,
    contract: SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
    status: receipt.status,
    receiptDigest: receipt.digest,
    privateInputDigest: receipt.privateInputDigest,
    directoryVerified: true,
    files: [...expected],
    externalWritesPerformed: false,
  }
}

export async function writeShopPilotBaselineCompletion({ inputPath, outputDir, generatedAt = new Date().toISOString() } = {}) {
  if (!inputPath) fail('shop_pilot_baseline_completion_input_required')
  if (!outputDir) fail('shop_pilot_baseline_completion_output_dir_required')
  const target = resolve(outputDir)
  if (await pathExists(target)) fail('shop_pilot_baseline_completion_output_exists')
  const privateInput = (await readJson(resolve(inputPath), 'shop_pilot_baseline_completion_input_unreadable')).value
  const bundle = buildShopPilotBaselineCompletionBundle(privateInput, { generatedAt })
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  const stage = await mkdtemp(join(parent, '.supermega-shop-baseline-'))
  let verified
  try {
    for (const [name, content] of Object.entries(bundle.contents)) {
      await writeFile(join(stage, name), content, { encoding: 'utf8', flag: 'wx' })
    }
    verified = await verifyShopPilotBaselineCompletionDirectory(stage)
    try {
      await rename(stage, target)
    } catch {
      fail('shop_pilot_baseline_completion_commit_failed')
    }
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
  return verified
}

function parseArgs(argv) {
  const options = { inputPath: null, outputDir: null, verifyDir: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') options.inputPath = argv[++index] || null
    else if (arg === '--output-dir') options.outputDir = argv[++index] || null
    else if (arg === '--verify-dir') options.verifyDir = argv[++index] || null
    else fail('shop_pilot_baseline_completion_usage_invalid')
  }
  if (options.verifyDir && (options.inputPath || options.outputDir)) fail('shop_pilot_baseline_completion_mode_conflict')
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = options.verifyDir
    ? await verifyShopPilotBaselineCompletionDirectory(options.verifyDir)
    : await writeShopPilotBaselineCompletion(options)
  console.log(JSON.stringify(result))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = safeCode(error?.code || error?.message || 'shop_pilot_baseline_completion_failed')
    const failures = Array.isArray(error?.failures) ? error.failures.map(safeCode).sort() : []
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
      error: code,
      failures,
      outputWritten: false,
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
