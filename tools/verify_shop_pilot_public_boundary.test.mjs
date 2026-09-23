import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT,
  verifyShopPilotPublicBoundary,
  verifyShopPilotPublicBoundaryFiles,
} from './verify_shop_pilot_public_boundary.mjs'

function validSummary(overrides = {}) {
  return {
    contract: SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    stage: 'owner-decision-required',
    decision: 'revise',
    controls: {
      automaticSendAllowed: false,
      paymentAllowed: false,
      deploymentAllowed: false,
      productionActivationAllowed: false,
      hostedWritesAllowed: false,
      externalWritesPerformed: false,
      customerContactPerformed: false,
      managedActivation: false,
      shopPilotProof: false,
    },
    counts: {
      privateArtifactsCreated: 3,
    },
    digests: {
      contactEventSha256: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    acceptedRuns: 0,
    consecutiveAcceptedRuns: 0,
    participantIdentityPresent: false,
    secretValuesExposed: false,
    ...overrides,
  }
}

test('accepts a public W5 summary with only safe stage, counts, digests, and false controls', () => {
  const result = verifyShopPilotPublicBoundary(validSummary())
  assert.equal(result.ok, true)
  assert.equal(result.contract, SHOP_PILOT_PUBLIC_BOUNDARY_CONTRACT)
  assert.equal(result.externalWritesPerformed, false)
  assert.equal(result.customerContactPerformed, false)
  assert.ok(result.checks >= 12)
})

test('rejects private identity fields and values', () => {
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ contactEmail: 'operator@example.invalid' })),
    /public_boundary_sensitive_key/,
  )
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ publicStatus: 'Contact operator@example.invalid after review.' })),
    /private_email_present/,
  )
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ publicStatus: 'Private workspace at C:\\private\\client' })),
    /private_path_present/,
  )
})

test('rejects external-action and proof claims', () => {
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ controls: { ...validSummary().controls, hostedWritesAllowed: true } })),
    /public_boundary_control_not_false:hostedWritesAllowed/,
  )
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ controls: { ...validSummary().controls, managedActivation: true } })),
    /public_boundary_unproven_claim_true:managedActivation/,
  )
  assert.throws(
    () => verifyShopPilotPublicBoundary(validSummary({ acceptedRuns: 1 })),
    /public_boundary_accepted_runs_must_be_zero/,
  )
})

test('rejects invalid decisions and non-Shop public summaries', () => {
  assert.throws(() => verifyShopPilotPublicBoundary(validSummary({ decision: 'send-now' })), /public_boundary_decision_invalid/)
  assert.throws(() => verifyShopPilotPublicBoundary(validSummary({ product: 'plant' })), /public_boundary_product_invalid/)
})

test('verifies JSON files and fails closed for public text leaks', () => {
  const root = mkdtempSync(join(tmpdir(), 'supermega-w5-public-boundary-'))
  const good = join(root, 'good.json')
  const bad = join(root, 'bad.md')
  writeFileSync(good, JSON.stringify(validSummary(), null, 2))
  writeFileSync(bad, 'Public summary\n\nprivate-handoff.md must not appear here.\n')

  const verified = verifyShopPilotPublicBoundaryFiles([good])
  assert.equal(verified.ok, true)
  assert.equal(verified.files, 1)
  assert.equal(verified.fileDigests.length, 1)

  assert.throws(() => verifyShopPilotPublicBoundaryFiles([bad]), /private_artifact_reference_present/)
})

test('rejects symlinked public artifact files when the platform supports creating them', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'supermega-w5-public-boundary-link-'))
  const target = join(root, 'target.json')
  const link = join(root, 'link.json')
  writeFileSync(target, JSON.stringify(validSummary(), null, 2))
  try {
    symlinkSync(target, link, 'file')
  } catch {
    t.skip('file symlink creation is not available in this environment')
    return
  }

  assert.throws(() => verifyShopPilotPublicBoundaryFiles([link]), /public_boundary_file_invalid/)
})

test('CLI returns only safe status fields', () => {
  const root = mkdtempSync(join(tmpdir(), 'supermega-w5-public-boundary-cli-'))
  const good = join(root, 'good.json')
  const bad = join(root, 'bad.json')
  writeFileSync(good, JSON.stringify(validSummary(), null, 2))
  writeFileSync(bad, JSON.stringify(validSummary({ controls: { ...validSummary().controls, paymentAllowed: true } }), null, 2))

  const pass = spawnSync(process.execPath, ['tools/verify_shop_pilot_public_boundary.mjs', '--file', good], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(pass.status, 0, pass.stderr)
  const receipt = JSON.parse(pass.stdout)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.externalWritesPerformed, false)
  assert.equal(receipt.customerContactPerformed, false)

  const fail = spawnSync(process.execPath, ['tools/verify_shop_pilot_public_boundary.mjs', '--file', bad], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.notEqual(fail.status, 0)
  assert.match(fail.stderr, /public_boundary_control_not_false:paymentAllowed/)
})
