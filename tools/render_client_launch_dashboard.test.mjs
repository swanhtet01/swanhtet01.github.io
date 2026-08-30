import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  renderClientLaunchDashboard,
  verifyClientLaunchBoardForDashboard,
  verifyClientLaunchDashboard,
} from './render_client_launch_dashboard.mjs'

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

function signedBoard(overrides = {}) {
  const board = {
    contract: 'supermega.client_launch_board.v1',
    version: 1,
    status: 'blocked_for_real_client_evidence',
    client: { workspace: 'PRIVATE CLIENT NAME', owner: 'PRIVATE OWNER NAME' },
    source: { preparationDigest: `sha256:${'1'.repeat(64)}`, portalProvisioningDigest: `sha256:${'2'.repeat(64)}`, activationReadinessDigest: `sha256:${'3'.repeat(64)}`, managedTrialRequestDigests: [] },
    products: [{ productId: 'shop', label: 'Shop', templateId: 'beauty-spa', startPath: '/settings/?product=shop&pack=spa', dataStatus: 'sample_fixture_only', acceptedOutcomeStatus: 'missing', approvedAiContextStatus: 'missing', managedTrialRequestStatus: 'missing', nextAction: 'replace_sample_with_reviewed_client_data' }],
    connections: [],
    launchStages: [
      { id: 'reviewed-client-intake', status: 'blocked', proof: 'Named business, named owner, and reviewed rows.' },
      { id: 'tenant-portal-design', status: 'ready', proof: 'Verified product entitlements and isolation plan.' },
      { id: 'accepted-product-outcomes', status: 'blocked', proof: 'One accepted outcome per product.' },
      { id: 'activation-target-binding', status: 'blocked', proof: 'Exact owner, release, and protected target.' },
      { id: 'hosted-rehearsal', status: 'pending', proof: 'Hosted identity, backup, restore, and smoke evidence.' },
      { id: 'production-activation', status: 'owner_gated', proof: 'Short-lived owner authorization.' },
    ],
    customSolutions: { status: 'available_after_base_product_review', availableForProducts: ['shop'], tenantBound: true, purchasedBaseProductRequired: true, lifecycle: ['request', 'security_review'], automaticActivation: false },
    blockingGates: ['reviewed_client_data_required:shop', 'managed_trial_request_required:shop'],
    nextActions: ['replace_sample_with_reviewed_client_data:shop', 'prepare_managed_trial_request:shop'],
    controls: { containsRawClientRows: false, containsSecrets: false, tenantWritesPerformed: false, providerCallsPerformed: false, externalMessagesSent: false, deploymentPerformed: false, productionActivationPerformed: false, syntheticEvidenceCannotAuthorizeProduction: true },
    ...overrides,
  }
  board.boardDigest = `sha256:${createHash('sha256').update(canonicalJson(board)).digest('hex')}`
  return board
}

test('renders a compact private dashboard without client identity or active behavior', () => {
  const board = signedBoard()
  const html = renderClientLaunchDashboard(board)
  assert.match(html, /SUPERMEGA \/ PRIVATE CLIENT PORTAL/)
  assert.match(html, /Not live yet/)
  assert.match(html, /No company internals, agent controls, or setup clutter/)
  assert.match(html, /@media\(max-width:760px\)/)
  assert.match(html, /Content-Security-Policy[^>]+connect-src 'none'/)
  assert.doesNotMatch(html, /PRIVATE CLIENT NAME|PRIVATE OWNER NAME/)
  assert.doesNotMatch(html, /<script|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/i)
  assert.ok(Buffer.byteLength(html, 'utf8') < 24_000)
  assert.equal(verifyClientLaunchDashboard(html, board).bytes, Buffer.byteLength(html))
})

test('escapes rendered board text and rejects a changed digest or unsafe controls', () => {
  const escaped = signedBoard({ products: [{ ...signedBoard().products[0], label: '<img src=x onerror=alert(1)>' }] })
  const html = renderClientLaunchDashboard(escaped)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.throws(() => verifyClientLaunchBoardForDashboard({ ...signedBoard(), status: 'changed' }), /digest_mismatch/)
  assert.throws(() => verifyClientLaunchBoardForDashboard(signedBoard({ controls: { ...signedBoard().controls, tenantWritesPerformed: true } })), /controls_invalid/)
})

test('CLI writes one exclusive metadata-only dashboard', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-client-launch-dashboard-'))
  const boardPath = join(parent, 'board.json')
  const outputPath = join(parent, 'dashboard.html')
  const tool = resolve('tools/render_client_launch_dashboard.mjs')
  try {
    await writeFile(boardPath, `${JSON.stringify(signedBoard(), null, 2)}\n`)
    const created = spawnSync(process.execPath, [tool, '--board', boardPath, '--output', outputPath], { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    const receipt = JSON.parse(created.stdout)
    assert.equal(receipt.contract, 'supermega.client_launch_dashboard.v1')
    assert.equal(receipt.productCount, 1)
    assert.equal(receipt.externalWritesPerformed, false)
    assert.doesNotMatch(created.stdout, /PRIVATE CLIENT NAME|PRIVATE OWNER NAME|dashboard\.html/)
    assert.match(await readFile(outputPath, 'utf8'), /One clear path to launch/)
    const duplicate = spawnSync(process.execPath, [tool, '--board', boardPath, '--output', outputPath], { encoding: 'utf8' })
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.stderr, /output_exists/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
