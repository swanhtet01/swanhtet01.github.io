import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHOP_PILOT_LAUNCH_GATE_CONTRACT,
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
  validateShopPilotLaunchGate,
} from './verify_shop_pilot_launch_gate.mjs'

test('passes only as owner-private-intake readiness, not contact or activation readiness', () => {
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  assert.equal(report.contract, SHOP_PILOT_LAUNCH_GATE_CONTRACT)
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_private_intake_required')
  assert.equal(report.launchReadiness.authority, 'owner_private_intake_only')
  assert.equal(report.launchReadiness.privateWorkspaceMayBePreparedAfterOwnerInput, true)
  assert.equal(report.launchReadiness.readyForCustomerContact, false)
  assert.equal(report.launchReadiness.readyForPayment, false)
  assert.equal(report.launchReadiness.readyForDeployment, false)
  assert.equal(report.launchReadiness.readyForManagedActivation, false)
  assert.equal(report.launchReadiness.readyForPromotionEvidence, false)
  assert.equal(report.launchReadiness.promotionEvidenceRequiredAcceptedRuns, 20)
  assert.equal(report.launchReadiness.promotionEvidenceAcceptedRuns, 0)
  assert.deepEqual(report.products.customerProducts, ['shop', 'plant', 'website', 'ecommerce'])
  assert.equal(report.publicBoundary.participantIdentityPresent, false)
  assert.equal(validateShopPilotLaunchGate(report), report)
})

test('fails closed for dirty worktree and missing launch scripts', () => {
  const dirty = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  assert.equal(dirty.ok, false)
  assert.ok(dirty.failures.includes('shop_pilot_launch_gate_worktree_dirty'))

  const missingScriptInput = sampleShopPilotLaunchGateInput()
  delete missingScriptInput.packageManifest.scripts['shop:pilot:launch-gate:verify']
  const missingScript = assessShopPilotLaunchGate(missingScriptInput)
  assert.equal(missingScript.ok, false)
  assert.ok(missingScript.failures.includes('shop_pilot_launch_gate_script_missing:shop:pilot:launch-gate:verify'))
})

test('rejects synthetic, public-identity, and accepted-run promotion claims', () => {
  const synthetic = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, syntheticEvidenceAccepted: true },
    },
  }))
  assert.equal(synthetic.ok, false)
  assert.ok(synthetic.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const publicIdentity = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, publicIdentityAllowed: true },
    },
  }))
  assert.equal(publicIdentity.ok, false)
  assert.ok(publicIdentity.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const acceptedRun = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, acceptedConsecutiveRuns: 1 },
    },
  }))
  assert.equal(acceptedRun.ok, false)
  assert.ok(acceptedRun.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))
})

test('rejects unsafe public boundary controls and customer contact states', () => {
  const boundaryInput = sampleShopPilotLaunchGateInput()
  const unsafeBoundary = assessShopPilotLaunchGate({
    ...boundaryInput,
    publicBoundary: {
      ...boundaryInput.publicBoundary,
      controls: { ...boundaryInput.publicBoundary.controls, automaticSendAllowed: true },
    },
  })
  assert.equal(unsafeBoundary.ok, false)
  assert.ok(unsafeBoundary.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_public_boundary_invalid')))

  const unsafeVerification = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    publicBoundaryVerification: {
      ...sampleShopPilotLaunchGateInput().publicBoundaryVerification,
      customerContactPerformed: true,
    },
  }))
  assert.equal(unsafeVerification.ok, false)
  assert.ok(unsafeVerification.failures.includes('shop_pilot_launch_gate_public_boundary_file_invalid'))
})

test('rejects tampered reports', () => {
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  assert.throws(
    () => validateShopPilotLaunchGate({ ...report, status: 'ready_to_contact' }),
    /shop_pilot_launch_gate_digest_invalid/,
  )
  assert.throws(
    () => validateShopPilotLaunchGate({ ...report, digest: `sha256:${'f'.repeat(64)}` }),
    /shop_pilot_launch_gate_digest_invalid/,
  )
})
