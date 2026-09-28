#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT = 'supermega.operational-report-action-packet-prep.v1'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_PRODUCTS = ['commerce', 'production', 'website', 'ecommerce']
const DEFAULT_VIEW = { product: 'all', urgency: 'attention' }
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_PACKET_BYTES = 1_000_000
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const FORBIDDEN_SAMPLE_PRIVATE_TEXT = ['May', 'Ko Aung', 'Daw Mya']

let modulePromise = null

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function stableJson(value) {
  return JSON.stringify(value, null, 2)
}

function compactJson(value) {
  return JSON.stringify(value)
}

function assertNoSecretShape(value, code = 'operational_report_action_packet_secret_shape') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function assertNoPrivateSampleText(value, code = 'operational_report_action_packet_private_text') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  if (FORBIDDEN_SAMPLE_PRIVATE_TEXT.some((needle) => text.includes(needle))) fail(code)
}

function exactIso(value, code) {
  const normalized = String(value || '').trim()
  if (!ISO_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized)) || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
}

function exactDate(value, code) {
  const normalized = String(value || '').trim()
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) fail(code)
  return normalized
}

function safeLine(value, maximum, code) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maximum || normalized.normalize('NFC') !== normalized) fail(code)
  if (Array.from(normalized).some((char) => {
    const charCode = char.codePointAt(0) || 0
    return charCode < 32 || charCode === 127
  })) fail(code)
  assertNoSecretShape(normalized, code)
  return normalized
}

function parseView({ product = 'all', urgency = 'attention' } = {}) {
  const normalizedProduct = String(product || 'all').trim()
  const normalizedUrgency = String(urgency || 'attention').trim()
  if (!['all', ...DEFAULT_PRODUCTS].includes(normalizedProduct)) fail('operational_report_action_packet_product_invalid')
  if (!['all', 'attention', 'critical'].includes(normalizedUrgency)) fail('operational_report_action_packet_urgency_invalid')
  return { product: normalizedProduct, urgency: normalizedUrgency }
}

function tomorrowDate(openedAt) {
  const opened = new Date(exactIso(openedAt, 'operational_report_action_packet_opened_at_invalid'))
  opened.setUTCDate(opened.getUTCDate() + 1)
  return opened.toISOString().slice(0, 10)
}

async function loadOperationalReportModule() {
  if (modulePromise) return modulePromise
  modulePromise = (async () => {
    const requireFromShowroom = createRequire(pathToFileURL(resolve(root, 'showroom', 'package.json')).href)
    const esbuildPath = requireFromShowroom.resolve('esbuild')
    const { build } = await import(pathToFileURL(esbuildPath).href)
    const bundle = await build({
      stdin: {
        contents: [
          "export { buildOperationalReport, exportOperationalReportActionPacket, validateOperationalReportActionPacket, OPERATIONAL_REPORT_ACTION_PACKET_CONTRACT } from './operational-report.ts'",
          "export { createSeedCommerce, validateCommerceState } from './commerce-workspace.ts'",
          "export { createSeedProduction, validateProductionState } from './production-workspace.ts'",
          "export { createInitialWorkspace } from '../products/website/website-model.ts'",
        ].join('\n'),
        resolveDir: resolve(root, 'showroom', 'src', 'core'),
        sourcefile: 'showroom/src/core/operational-report-action-packet-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      logLevel: 'error',
    })
    const source = Buffer.from(bundle.outputFiles[0].contents).toString('base64')
    return import(`data:text/javascript;base64,${source}`)
  })()
  return modulePromise
}

export async function buildSampleOperationalReport({ observedAt = '2026-08-25T00:00:00.000Z' } = {}) {
  const module = await loadOperationalReportModule()
  const safeObservedAt = exactIso(observedAt, 'operational_report_action_packet_observed_at_invalid')
  const now = Date.parse(safeObservedAt)
  const report = module.buildOperationalReport({
    mode: 'local',
    allowedProducts: DEFAULT_PRODUCTS,
    sources: [
      { surface: 'commerce', mode: 'sample', revision: 0, updatedAt: safeObservedAt },
      { surface: 'production', mode: 'sample', revision: 0, updatedAt: safeObservedAt },
      { surface: 'website', mode: 'sample', revision: 0, updatedAt: safeObservedAt },
    ],
    commerce: module.validateCommerceState(module.createSeedCommerce(now)),
    production: module.validateProductionState(module.createSeedProduction(now)),
    website: module.createInitialWorkspace(),
    now,
  })
  assertNoSecretShape(report)
  return report
}

export async function buildOperationalReportActionPacket({
  observedAt = '2026-08-25T00:00:00.000Z',
  openedAt = observedAt,
  dueDate = tomorrowDate(openedAt),
  ownerRole = 'Founder plus Product',
  view = DEFAULT_VIEW,
} = {}) {
  const module = await loadOperationalReportModule()
  const report = await buildSampleOperationalReport({ observedAt })
  const packet = await module.exportOperationalReportActionPacket(report, parseView(view), {
    ownerRole: safeLine(ownerRole, 80, 'operational_report_action_packet_owner_invalid'),
    openedAt: exactIso(openedAt, 'operational_report_action_packet_opened_at_invalid'),
    dueDate: exactDate(dueDate, 'operational_report_action_packet_due_date_invalid'),
  })
  const validated = await module.validateOperationalReportActionPacket(packet)
  assertNoSecretShape(validated)
  assertNoPrivateSampleText(validated)
  if (validated.controls.externalWritesPerformed !== false || validated.controls.managedWritesPerformed !== false) {
    fail('operational_report_action_packet_controls_invalid')
  }
  if (!validated.actions.every((action) => (
    action.status === 'owner-gated'
    && action.owner?.namedPrivate === false
    && action.authority?.ownerApprovalRequired === true
    && action.authority?.externalWriteAllowed === false
    && action.closure?.closedAt === null
    && !action.productIds.includes('commerce')
    && !action.id.startsWith('operational-commerce-')
  ))) fail('operational_report_action_packet_authority_invalid')
  return validated
}

export async function validateOperationalReportActionPacketFile(path) {
  const absolute = resolve(path || '')
  const text = await readFile(absolute, 'utf8')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes < 1 || bytes > MAX_PACKET_BYTES) fail('operational_report_action_packet_file_invalid')
  assertNoSecretShape(text)
  assertNoPrivateSampleText(text)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('operational_report_action_packet_json_invalid')
  }
  const module = await loadOperationalReportModule()
  const packet = await module.validateOperationalReportActionPacket(parsed)
  assertNoSecretShape(packet)
  assertNoPrivateSampleText(packet)
  return { path: absolute, bytes, digest: digest(text), packet }
}

export function renderOperationalReportActionPacketMarkdown(packet) {
  if (!isRecord(packet) || packet.contract !== 'supermega.operational_report_action_packet.v1') fail('operational_report_action_packet_markdown_invalid')
  assertNoSecretShape(packet)
  assertNoPrivateSampleText(packet)
  const actions = Array.isArray(packet.actions) ? packet.actions : []
  const counts = actions.reduce((memo, action) => {
    for (const productId of action.productIds || []) memo[productId] = (memo[productId] || 0) + 1
    return memo
  }, {})
  const lines = [
    '# SuperMega Operational Report Action Packet',
    '',
    `- Contract: ${packet.contract}`,
    `- Observed at: ${packet.observedAt}`,
    `- Opened at: ${packet.openedAt}`,
    `- Due date: ${packet.dueDate}`,
    `- Owner role: ${packet.ownerRole}`,
    `- View: ${packet.view?.product ?? 'all'} / ${packet.view?.urgency ?? 'attention'}`,
    `- Actions: ${actions.length}`,
    `- Digest: ${packet.digest}`,
    '',
    '## Product counts',
    '',
    ...['shop', 'plant', 'website', 'ecommerce'].map((productId) => `- ${productId}: ${counts[productId] || 0}`),
    '',
    '## Authority boundary',
    '',
    '- Owner approval required before closure.',
    '- Evidence and due date required before closure.',
    '- No external writes are authorized by this packet.',
    '- No managed writes are authorized by this packet.',
    '- Private identity is not exposed.',
    '',
    '## Actions',
    '',
    ...actions.map((action) => [
      `- ${action.id} (${action.productIds.join(', ')}, ${action.severity})`,
      `  - Finding: ${action.sourceFinding.label}`,
      `  - Recommendation: ${action.recommendation}`,
      `  - Evidence digest: ${action.sourceFinding.evidenceDigest}`,
    ].join('\n')),
    '',
  ]
  const markdown = lines.join('\n')
  assertNoSecretShape(markdown)
  assertNoPrivateSampleText(markdown)
  return markdown
}

async function writeExclusive(path, content) {
  const absolute = resolve(path || '')
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    mode: 'prepare',
    outputPath: null,
    markdownOutputPath: null,
    verifyPath: null,
    observedAt: null,
    openedAt: null,
    dueDate: null,
    ownerRole: 'Founder plus Product',
    view: { ...DEFAULT_VIEW },
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.mode = 'self-test'
    else if (arg === '--verify') { options.mode = 'verify'; options.verifyPath = argv[++index] || null }
    else if (arg === '--output') options.outputPath = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutputPath = argv[++index] || null
    else if (arg === '--observed-at') options.observedAt = argv[++index] || null
    else if (arg === '--opened-at') options.openedAt = argv[++index] || null
    else if (arg === '--due-date') options.dueDate = argv[++index] || null
    else if (arg === '--owner-role') options.ownerRole = argv[++index] || null
    else if (arg === '--product') options.view.product = argv[++index] || null
    else if (arg === '--urgency') options.view.urgency = argv[++index] || null
    else fail(`operational_report_action_packet_usage_invalid:${arg}`)
  }
  if (options.mode === 'prepare' && !options.outputPath) fail('operational_report_action_packet_output_required')
  if (options.mode === 'verify' && !options.verifyPath) fail('operational_report_action_packet_verify_path_required')
  return options
}

async function runSelfTest() {
  const packet = await buildOperationalReportActionPacket({
    observedAt: '2026-08-25T00:00:00.000Z',
    openedAt: '2026-08-25T01:00:00.000Z',
    dueDate: '2026-08-26',
    ownerRole: 'Founder plus Product',
    view: { product: 'all', urgency: 'attention' },
  })
  const markdown = renderOperationalReportActionPacketMarkdown(packet)
  const tempRoot = await mkdtemp(join(tmpdir(), 'supermega-action-packet-'))
  try {
    const packetPath = join(tempRoot, 'packet.json')
    await writeFile(packetPath, `${stableJson(packet)}\n`, 'utf8')
    const receipt = await validateOperationalReportActionPacketFile(packetPath)
    const tampered = structuredClone(packet)
    tampered.actions[0].authority.externalWriteAllowed = true
    let tamperRejected = false
    try {
      const module = await loadOperationalReportModule()
      await module.validateOperationalReportActionPacket(tampered)
    } catch {
      tamperRejected = true
    }
    const checks = {
      packet_validates: receipt.packet.digest === packet.digest,
      digest_bound: DIGEST_PATTERN.test(packet.digest),
      actions_owner_gated: packet.actions.length > 0 && packet.actions.every((action) => action.status === 'owner-gated' && action.authority.externalWriteAllowed === false),
      customer_products_only: packet.actions.every((action) => action.productIds.every((productId) => ['shop', 'plant', 'website', 'ecommerce'].includes(productId))),
      markdown_public_safe: markdown.includes('No external writes are authorized') && !markdown.includes('operational-commerce-') && !markdown.includes(':commerce:'),
      tampered_external_authority_rejected: tamperRejected,
    }
    const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
    return {
      ok: failedChecks.length === 0,
      contract: `${OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT}.self-test`,
      actionPacketContract: packet.contract,
      actionCount: packet.actions.length,
      productIds: [...new Set(packet.actions.flatMap((action) => action.productIds))].sort(),
      checks,
      failedChecks,
      externalWritesPerformed: false,
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === 'self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.mode === 'verify') {
    const receipt = await validateOperationalReportActionPacketFile(options.verifyPath)
    console.log(JSON.stringify({
      ok: true,
      contract: OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT,
      mode: 'verified',
      path: receipt.path,
      bytes: receipt.bytes,
      digest: receipt.digest,
      packetDigest: receipt.packet.digest,
      actionCount: receipt.packet.actions.length,
      controls: receipt.packet.controls,
      externalWritesPerformed: false,
    }, null, 2))
    return
  }
  const openedAt = options.openedAt || options.observedAt || new Date().toISOString()
  const packet = await buildOperationalReportActionPacket({
    observedAt: options.observedAt || openedAt,
    openedAt,
    dueDate: options.dueDate || tomorrowDate(openedAt),
    ownerRole: options.ownerRole,
    view: options.view,
  })
  const outputPath = await writeExclusive(options.outputPath, `${stableJson(packet)}\n`)
  let markdownOutput = null
  if (options.markdownOutputPath) {
    markdownOutput = await writeExclusive(options.markdownOutputPath, renderOperationalReportActionPacketMarkdown(packet))
  }
  console.log(JSON.stringify({
    ok: true,
    contract: OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT,
    mode: 'local_sample_no_external_effects',
    output: outputPath,
    markdownOutput,
    packetDigest: packet.digest,
    outputDigest: digest(await readFile(outputPath, 'utf8')),
    actionCount: packet.actions.length,
    productIds: [...new Set(packet.actions.flatMap((action) => action.productIds))].sort(),
    controls: packet.controls,
    externalWritesPerformed: false,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT,
      error: String(error?.message || error),
      externalWritesPerformed: false,
    }, null, 2))
    process.exit(1)
  })
}
