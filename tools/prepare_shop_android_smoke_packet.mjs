#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_ANDROID_SMOKE_PACKET_CONTRACT = 'supermega.shop.android-smoke-packet.v1'

const root = resolve(import.meta.dirname, '..')
const PLAYBOOK_PATH = 'docs/demo-playbooks/shop.md'
const CLIENT_READINESS_PATH = 'hq/strategy/CLIENT-READINESS-BRIEF.md'

const REQUIRED_PLAYBOOK_MARKERS = [
  'bottom task bar',
  'Scan a barcode with the camera',
  'keyboard-wedge/search path',
  'product photos are device-local',
  'points chip',
  'Scan to pay',
  'display-only',
  'Paid & handed over',
  'Android phone smoke pass',
  'first load the sample while online',
  'turn off connectivity',
  'rehearsal evidence only',
  'not hosted pilot proof',
]

const REQUIRED_SOURCE_MARKERS = [
  {
    path: 'showroom/src/core/BarcodeScanButton.tsx',
    markers: ['window.BarcodeDetector', 'Nothing is recorded or uploaded', 'type the code instead'],
  },
  {
    path: 'showroom/src/core/commerce-tabs.ts',
    markers: ["{ id: 'today', label: 'Today' }", "{ id: 'counter', label: 'Sell' }", "{ id: 'orders', label: 'Orders' }", "{ id: 'inventory', label: 'Stock' }"],
  },
  {
    path: 'showroom/src/core/CoreShell.tsx',
    markers: ['mobile-task-nav', 'aria-label="Shop task shortcuts"', 'commerceTabs.map'],
  },
  {
    path: 'showroom/src/core/PaymentQr.tsx',
    markers: ["bi('Scan to pay')", 'payment review in Orders stays manual', 'merchant payment QR'],
  },
  {
    path: 'showroom/src/core/payment-qr-store.ts',
    markers: ['Device-local merchant payment QR store', 'No network call of any kind happens here', 'deleteAllPaymentQrData'],
  },
  {
    path: 'showroom/src/core/ProductPhoto.tsx',
    markers: ['ShopProductPhotoControl', 'product-image-store.ts', 'putProductImage'],
  },
  {
    path: 'showroom/src/core/product-image-store.ts',
    markers: ['supermega.product-images.v1', 'downscaleProductPhoto', 'one phone camera picture would evict real business records'],
  },
  {
    path: 'showroom/src/core/shop-loyalty.ts',
    markers: ['supermega.shop.loyalty.v1', 'ACT-DEMO-', 'shopLoyaltyRedeemedPointsForOrder'],
  },
  {
    path: 'showroom/src/core/CoreApp.tsx',
    markers: ['Paid &amp; handed over', 'Browser-local sample only', 'Search or scan SKU'],
  },
  {
    path: 'tools/write_app_release_metadata.mjs',
    markers: ['showroom/scripts/seal-offline-precache.mjs', '/shop/ and /plant/', 'offline'],
  },
]

const PRIVATE_EVIDENCE_FIELDS = [
  'device_model',
  'android_version',
  'browser_name_version',
  'first_load_online_result',
  'offline_network_drop_method',
  'bottom_nav_result',
  'camera_button_state',
  'barcode_scan_result',
  'keyboard_search_fallback_result',
  'product_photo_result',
  'payment_qr_result',
  'loyalty_chip_result',
  'review_gate_result',
  'paid_handed_over_result',
  'reload_retry_result',
  'daily_close_result',
  'unexpected_errors',
  'founder_review_result',
  'recorded_at',
]

const SMOKE_STEPS = [
  ['first_load_online', 'Open https://app.supermega.dev/settings/?product=shop online and create or load the Shop sample.'],
  ['bottom_nav', 'On the phone, use Today, Sell, Orders, and Stock from the bottom task bar with one thumb.'],
  ['camera_or_fallback', 'Try camera barcode scan if Android Chrome exposes it; otherwise prove the keyboard-wedge/search fallback.'],
  ['product_photo', 'Attach only a non-private test image to a catalog row, then confirm the Sell tile renders the photo or the documented fallback.'],
  ['counter_sale', 'Create a sample sale from the Sell tab through the reviewed counter gate.'],
  ['payment_qr', 'Open the amount-due QR affordance when a non-sensitive test QR exists, or record the no-saved-QR fallback.'],
  ['loyalty_chip', 'Use a named sample customer if demonstrating loyalty; record only whether the points chip appears and remains review-only.'],
  ['orders_handoff', 'Move the order through Start preparing, Mark ready, and Paid & handed over; never claim money was captured.'],
  ['offline_reload_retry', 'Drop connectivity after the first load, reload, and repeat the sale/order path enough to prove the offline cache.'],
  ['daily_close', 'Open the close controls and record whether Review and save close or Save daily close remains usable after review.'],
]

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function signed(body) {
  const packet = { ...body }
  packet.digest = digest(JSON.stringify(packet))
  return packet
}

function markerResult(text, marker) {
  return { marker, present: text.includes(marker) }
}

function sourceCoverage(sources) {
  return REQUIRED_SOURCE_MARKERS.map((source) => {
    const text = sources[source.path] || ''
    return {
      path: source.path,
      present: Boolean(text),
      markers: source.markers.map((marker) => markerResult(text, marker)),
    }
  })
}

function missingCoverageMarkers(coverage) {
  return coverage.flatMap((source) => {
    const failures = []
    if (!source.present) failures.push(`source_missing:${source.path}`)
    for (const marker of source.markers) {
      if (!marker.present) failures.push(`source_marker_missing:${source.path}:${marker.marker}`)
    }
    return failures
  })
}

export function assessShopAndroidSmokePacket(input = {}) {
  const failures = []
  const playbook = String(input.playbook || '')
  const clientReadiness = String(input.clientReadiness || '')
  const sources = input.sources || {}
  const playbookMarkers = REQUIRED_PLAYBOOK_MARKERS.map((marker) => markerResult(playbook, marker))
  const coverage = sourceCoverage(sources)

  for (const marker of playbookMarkers) {
    if (!marker.present) addFailure(failures, `playbook_marker_missing:${marker.marker}`)
  }
  for (const missing of missingCoverageMarkers(coverage)) addFailure(failures, missing)

  if (!clientReadiness.includes('F1 — One Android phone smoke test')) addFailure(failures, 'client_readiness_f1_missing')
  if (!clientReadiness.includes('Needs real hardware')) addFailure(failures, 'client_readiness_hardware_gate_missing')
  if (!clientReadiness.includes('A6')) addFailure(failures, 'client_readiness_a6_trace_missing')

  return signed({
    contract: SHOP_ANDROID_SMOKE_PACKET_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    product: 'shop',
    mode: 'founder_android_phone_rehearsal_packet',
    status: failures.length ? 'failed' : 'ready_for_founder_hardware_run',
    ok: failures.length === 0,
    failures,
    sources: {
      playbook: { path: PLAYBOOK_PATH, digest: digest(playbook) },
      clientReadiness: { path: CLIENT_READINESS_PATH, digest: digest(clientReadiness) },
      implementation: coverage.map((source) => ({
        path: source.path,
        present: source.present,
        missingMarkers: source.markers.filter((marker) => !marker.present).map((marker) => marker.marker),
      })),
    },
    playbookCoverage: playbookMarkers,
    smokePlan: {
      device: 'Android phone with a real camera and Chrome or Chromium-based browser',
      firstLoadMustBeOnline: true,
      networkDropRequiredAfterFirstLoad: true,
      privateEvidenceFields: PRIVATE_EVIDENCE_FIELDS,
      steps: SMOKE_STEPS.map(([id, instruction]) => ({ id, instruction, required: true })),
    },
    claimBoundary: {
      founderHardwareRunRequired: true,
      hostedPilotProof: false,
      productionActivationProof: false,
      promotionEvidence: false,
      customerThermalPrinterClaim: false,
      paymentCaptureClaim: false,
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
    },
  })
}

export function validateShopAndroidSmokePacket(packet) {
  const copy = { ...packet }
  const actualDigest = copy.digest
  delete copy.digest
  if (actualDigest !== digest(JSON.stringify(copy))) throw new Error('shop_android_smoke_packet_digest_invalid')
  if (packet.contract !== SHOP_ANDROID_SMOKE_PACKET_CONTRACT) throw new Error('shop_android_smoke_packet_contract_invalid')
  if (packet.ok !== true || packet.status !== 'ready_for_founder_hardware_run') throw new Error('shop_android_smoke_packet_not_ready')
  if (packet.claimBoundary?.founderHardwareRunRequired !== true
    || packet.claimBoundary?.hostedPilotProof !== false
    || packet.claimBoundary?.externalWritesPerformed !== false
    || packet.claimBoundary?.customerContactPerformed !== false
    || packet.claimBoundary?.paymentOrStockActionPerformed !== false
    || packet.claimBoundary?.managedActivationPerformed !== false) {
    throw new Error('shop_android_smoke_packet_claim_boundary_invalid')
  }
  if (!Array.isArray(packet.smokePlan?.privateEvidenceFields)
    || PRIVATE_EVIDENCE_FIELDS.some((field) => !packet.smokePlan.privateEvidenceFields.includes(field))) {
    throw new Error('shop_android_smoke_packet_evidence_fields_invalid')
  }
  return packet
}

export function sampleShopAndroidSmokePacketInput(overrides = {}) {
  const playbook = REQUIRED_PLAYBOOK_MARKERS.join('\n')
  const clientReadiness = 'A6 demo script updated. F1 — One Android phone smoke test. Needs real hardware.'
  const sources = Object.fromEntries(REQUIRED_SOURCE_MARKERS.map((source) => [source.path, source.markers.join('\n')]))
  return { playbook, clientReadiness, sources, generatedAt: '2026-08-25T00:00:00.000Z', ...overrides }
}

async function currentInput() {
  const playbook = await readFile(resolve(root, PLAYBOOK_PATH), 'utf8')
  const clientReadiness = await readFile(resolve(root, CLIENT_READINESS_PATH), 'utf8')
  const sources = {}
  for (const source of REQUIRED_SOURCE_MARKERS) {
    sources[source.path] = await readFile(resolve(root, source.path), 'utf8')
  }
  return { playbook, clientReadiness, sources }
}

function renderMarkdown(packet) {
  const lines = [
    '# SuperMega Shop Android smoke packet',
    '',
    `Generated: ${packet.generatedAt}`,
    `Status: ${packet.status}`,
    `Digest: ${packet.digest}`,
    '',
    'Use this before a real owner demo. It records a founder hardware rehearsal only; it is not hosted pilot proof, promotion evidence, or managed activation proof.',
    '',
    '## Required run conditions',
    '',
    `- Device: ${packet.smokePlan.device}`,
    '- First load must be online: yes',
    '- Drop network after first load: yes',
    '- Evidence location: private workspace only',
    '',
    '## Steps',
    '',
    ...packet.smokePlan.steps.map((step) => `- [ ] ${step.id}: ${step.instruction}`),
    '',
    '## Private evidence fields',
    '',
    ...packet.smokePlan.privateEvidenceFields.map((field) => `- ${field}`),
    '',
    '## Claim boundary',
    '',
    '- Do not claim hosted pilot proof.',
    '- Do not claim payment capture.',
    '- Do not claim thermal-printer or cash-drawer support.',
    '- Do not contact a customer, move stock, deploy, or write to Supabase from this packet.',
  ]
  return `${lines.join('\n')}\n`
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const args = { output: null, markdownOutput: null, verify: null, selfTest: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') args.output = argv[++index]
    else if (arg === '--markdown-output') args.markdownOutput = argv[++index]
    else if (arg === '--verify') args.verify = argv[++index]
    else if (arg === '--self-test') args.selfTest = true
    else throw new Error(`shop_android_smoke_packet_unknown_arg:${arg}`)
  }
  return args
}

function runSelfTest() {
  const packet = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput())
  validateShopAndroidSmokePacket(packet)
  const missingCamera = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput({
    playbook: REQUIRED_PLAYBOOK_MARKERS.filter((marker) => marker !== 'Scan a barcode with the camera').join('\n'),
  }))
  if (missingCamera.ok || !missingCamera.failures.includes('playbook_marker_missing:Scan a barcode with the camera')) {
    throw new Error('shop_android_smoke_packet_self_test_missing_camera_failed')
  }
  const missingSource = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput({
    sources: { ...sampleShopAndroidSmokePacketInput().sources, 'showroom/src/core/PaymentQr.tsx': '' },
  }))
  if (missingSource.ok || !missingSource.failures.some((failure) => failure.startsWith('source_missing:showroom/src/core/PaymentQr.tsx'))) {
    throw new Error('shop_android_smoke_packet_self_test_missing_source_failed')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    runSelfTest()
    console.log(JSON.stringify({ ok: true, contract: `${SHOP_ANDROID_SMOKE_PACKET_CONTRACT}.self-test`, externalWritesPerformed: false }))
    return
  }
  if (args.verify) {
    const packet = validateShopAndroidSmokePacket(JSON.parse(await readFile(resolve(args.verify), 'utf8')))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      path: resolve(args.verify),
      digest: packet.digest,
      status: packet.status,
      claimBoundary: packet.claimBoundary,
    }, null, 2))
    return
  }
  const packet = assessShopAndroidSmokePacket(await currentInput())
  if (!packet.ok) {
    console.log(JSON.stringify(packet, null, 2))
    process.exitCode = 1
    return
  }
  if (args.output) await writeExclusive(args.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (args.markdownOutput) await writeExclusive(args.markdownOutput, renderMarkdown(packet))
  if (args.output || args.markdownOutput) {
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      output: args.output ? resolve(args.output) : null,
      markdownOutput: args.markdownOutput ? resolve(args.markdownOutput) : null,
      digest: packet.digest,
      status: packet.status,
      externalWritesPerformed: false,
    }, null, 2))
    return
  }
  console.log(JSON.stringify(packet, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
