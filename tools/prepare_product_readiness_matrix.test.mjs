import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  PRODUCT_READINESS_MATRIX_CONTRACT,
  buildProductReadinessMatrix,
  renderProductReadinessMatrixMarkdown,
  validateProductReadinessMatrix,
} from './prepare_product_readiness_matrix.mjs'
import {
  buildShopPilotDay0ReadinessPacket,
  sampleShopPilotDay0ReadinessInput,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'

const products = ['shop', 'plant', 'website', 'ecommerce']

function digestOf(char) {
  return `sha256:${char.repeat(64)}`
}

function fixture(overrides = {}) {
  const releaseHandoff = {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    candidate: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      commit: 'a'.repeat(40),
      clean: true,
    },
    remote: { mainCommit: 'b'.repeat(40) },
    live: { identity: { commit: 'c'.repeat(40) } },
    relations: { candidateAheadOfMain: 100, candidateAheadOfLive: 102 },
    verification: { passed: true, verifiedCommit: 'a'.repeat(40) },
    githubMainProtection: {
      assessment: {
        ok: false,
        failures: [
          'main_unprotected',
          'pull_request_required_missing',
          'required_status_check_missing:SuperMega App CI',
        ],
      },
    },
    digest: digestOf('1'),
  }
  const technicalEstate = {
    products: products.map((productId) => ({
      productId,
      name: productId[0].toUpperCase() + productId.slice(1),
      classification: 'customer-product',
      lifecycleState: 'release-candidate-local',
      appRoute: `/${productId}/`,
      sourcePaths: ['showroom/src/App.tsx', 'showroom/src/core/CoreApp.tsx', `showroom/src/products/${productId}`],
      workOrderId: `${productId}-work-order`,
      requiredProof: `${productId} owner-reviewed proof remains required.`,
    })),
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    sourceDigest: digestOf('2'),
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: { blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'] },
    products: products.map((productId) => ({
      productId,
      localStatus: 'release-candidate-local',
      managedPilotStatus: 'blocked',
      automationStatus: 'owner-gated',
      workOrderId: productId === 'shop' ? 'shop-spa-owner-pilot' : `${productId}-managed-proof`,
      requiredProof: `${productId} proof must come from owner-reviewed private evidence.`,
    })),
    sourceDigest: digestOf('3'),
  }
  const operatingActionBoard = {
    contract: 'supermega.operating-action-board.v1',
    products,
    weeklyReport: {
      totalActions: 4,
      openActionCount: 2,
      ownerGatedCount: 2,
      criticalOpenCount: 1,
    },
    actions: [
      { id: 'release-main-protection', status: 'owner-gated' },
      { id: 'shop-owner-pilot-baseline', status: 'owner-gated' },
    ],
    digest: digestOf('4'),
  }
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const shopPilotDay0Readiness = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
  }))
  return {
    releaseHandoff,
    technicalEstate,
    readiness,
    operatingActionBoard,
    shopPilotDay0Readiness,
    generatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

test('builds a four-product readiness matrix with Shop first and GitHub gate first', () => {
  const matrix = validateProductReadinessMatrix(buildProductReadinessMatrix(fixture()))
  assert.equal(matrix.contract, PRODUCT_READINESS_MATRIX_CONTRACT)
  assert.deepEqual(matrix.productOrder, products)
  assert.equal(matrix.release.currentGateId, 'github_main_protection')
  assert.equal(matrix.release.releaseOrDeploymentAllowed, false)
  assert.equal(matrix.products[0].productId, 'shop')
  assert.equal(matrix.products[0].evidenceLevel, 'local_verified_release_candidate')
  assert.ok(matrix.products[0].currentBlockers.includes('owner_private_baseline'))
  assert.ok(matrix.products.find((product) => product.productId === 'plant').currentBlockers.includes('shop_pilot_decision_not_complete'))
})

test('removes the Shop private-intake blocker only when Day-0 intake is accepted', () => {
  const matrix = validateProductReadinessMatrix(buildProductReadinessMatrix(fixture()))
  const shop = matrix.products[0]
  assert.ok(shop.currentBlockers.includes('owner_private_baseline'))
  assert.equal(shop.currentBlockers.includes('owner_private_intake'), false)
  assert.ok(shop.currentBlockers.includes('real_shop_pilot_evidence'))
  assert.match(shop.nextAction, /capture the owner-private baseline/)
  assert.doesNotMatch(shop.nextAction, /baseline and intake/)
  assert.equal(matrix.sourceDigests.shopPilotDay0ReadinessDigest, fixture().shopPilotDay0Readiness.digest)

  const withoutDay0 = buildProductReadinessMatrix({
    ...fixture(),
    shopPilotDay0Readiness: null,
  })
  assert.ok(withoutDay0.products[0].currentBlockers.includes('owner_private_intake'))
})

test('preserves forbidden claims and false external-effect controls', () => {
  const matrix = buildProductReadinessMatrix(fixture())
  assert.ok(matrix.forbiddenClaims.includes('managed_activation_ready'))
  assert.ok(matrix.forbiddenClaims.includes('erp_replacement_claim'))
  assert.equal(matrix.products.some((product) => product.claims.productionLive), false)
  assert.equal(matrix.products.some((product) => product.claims.commercialProofReady), false)
  assert.equal(Object.values(matrix.controls).every((value) => value === false), true)
})

test('advances the current gate only after GitHub main protection is satisfied', () => {
  const matrix = buildProductReadinessMatrix(fixture({
    releaseHandoff: {
      ...fixture().releaseHandoff,
      githubMainProtection: { assessment: { ok: true, failures: [] } },
    },
  }))
  assert.equal(matrix.release.currentGateId, 'review_branch_push')
})

test('advances the current gate to pull request creation once the review branch is exact', () => {
  const base = fixture().releaseHandoff
  const matrix = validateProductReadinessMatrix(buildProductReadinessMatrix(fixture({
    releaseHandoff: {
      ...base,
      remote: {
        ...base.remote,
        candidateBranchState: 'exact',
        candidateCommit: base.candidate.commit,
      },
      githubMainProtection: { assessment: { ok: true, failures: [] } },
    },
  })))
  assert.equal(matrix.release.currentGateId, 'pull_request_creation')
})

test('fails closed for fifth-product AI and write-control drift', () => {
  assert.throws(() => buildProductReadinessMatrix(fixture({
    technicalEstate: {
      ...fixture().technicalEstate,
      products: [...fixture().technicalEstate.products, { productId: 'ai' }],
    },
  })), /product_readiness_matrix_product_order_invalid/)
  const matrix = buildProductReadinessMatrix(fixture())
  assert.throws(() => validateProductReadinessMatrix({
    ...matrix,
    controls: { ...matrix.controls, githubWritesPerformed: true },
  }), /product_readiness_matrix_controls_invalid/)
})

test('rejects private identity, phone, credential, and local path shapes', () => {
  for (const leakedValue of [
    'owner@example.com',
    '09 123 456 789',
    String.raw`C:\Users\thesw\OneDrive - BDA\private-shop`,
    'sk-proj-123456789012345678901234567890',
  ]) {
    assert.throws(() => buildProductReadinessMatrix(fixture({
      readiness: {
        ...fixture().readiness,
        products: fixture().readiness.products.map((product) => (
          product.productId === 'shop' ? { ...product, requiredProof: leakedValue } : product
        )),
      },
    })), /private_or_secret_shape/)
  }
})

test('renders markdown without private values and CLI verifies matrix packets', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'supermega-product-matrix-'))
  try {
    const matrix = buildProductReadinessMatrix(fixture())
    const packetPath = join(workspace, 'matrix.json')
    await writeFile(packetPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
    const markdown = renderProductReadinessMatrixMarkdown(matrix)
    assert.match(markdown, /SuperMega product readiness matrix/)
    assert.doesNotMatch(markdown, /owner@example\.com|09 123|C:\\Users|sk-proj-/)
    const tool = resolve('tools/prepare_product_readiness_matrix.mjs')
    const verified = spawnSync(process.execPath, [tool, '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr || verified.stdout)
    assert.match(verified.stdout, /"products":\s*4/)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
