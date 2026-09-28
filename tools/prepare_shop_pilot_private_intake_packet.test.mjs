import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT,
  buildShopPilotPrivateIntakePacket,
  renderShopPilotPrivateIntakeMarkdown,
  sampleShopPilotPrivateIntakeInput,
  validateShopPilotPrivateIntakePacket,
} from './prepare_shop_pilot_private_intake_packet.mjs'

test('builds a public-safe owner private intake packet only', () => {
  const packet = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  assert.equal(packet.contract, SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT)
  assert.equal(packet.ok, true)
  assert.equal(packet.status, 'owner_private_intake_ready')
  assert.equal(packet.product, 'shop')
  assert.equal(packet.pilotMode, 'owner_named')
  assert.deepEqual(packet.portfolioBoundary.customerProducts, ['shop', 'plant', 'website', 'ecommerce'])
  assert.equal(packet.portfolioBoundary.aiIsSharedCapability, true)
  assert.equal(packet.publicSafeRules.privateWorkspaceRequired, true)
  assert.equal(packet.publicSafeRules.publicIdentityAllowed, false)
  assert.equal(packet.publicSafeRules.syntheticEvidenceAccepted, false)
  assert.equal(packet.readiness.hostedActivationReady, false)
  assert.equal(packet.readiness.managedWritesEnabled, false)
  assert.equal(packet.readiness.pilotProofComplete, false)
  assert.equal(packet.readiness.acceptedConsecutiveRuns, 0)
  assert.deepEqual(packet.readiness.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(packet.readiness.acceptedConsecutivePilotDayIndexes, [])
  assert.equal(packet.readiness.pilotSequenceCoverageMet, false)
  assert.equal(packet.readiness.requiredPilotCalendarDates, 5)
  assert.equal(packet.readiness.acceptedConsecutiveObservedDateCount, 0)
  assert.deepEqual(packet.readiness.acceptedConsecutiveObservedDates, [])
  assert.equal(packet.readiness.pilotCalendarCoverageMet, false)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceRequiredAcceptedRuns, 20)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceRequiresFiveDaySequenceCoverage, true)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceRequiredPilotCalendarDates, 5)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceRequiresCalendarCoverage, true)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceAcceptedObservedDateCount, 0)
  assert.equal(packet.ownerPrivateIntake.promotionEvidenceAcceptedRuns, 0)
  assert.equal(packet.controls.customerContactAllowed, false)
  assert.equal(packet.controls.paymentAllowed, false)
  assert.equal(packet.controls.hostedWritesAllowed, false)
  assert.equal(packet.controls.productionReleaseAllowed, false)
  assert.equal(packet.controls.managedActivationAllowed, false)
  assert.equal(validateShopPilotPrivateIntakePacket(packet), packet)
})

test('fails closed when public boundary or pilot proof claims become unsafe', () => {
  const contacted = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput({
    publicBoundaryVerification: {
      ok: true,
      fileDigests: [`sha256:${'d'.repeat(64)}`],
      externalWritesPerformed: false,
      customerContactPerformed: true,
    },
  }))
  assert.equal(contacted.ok, false)
  assert.ok(contacted.failures.includes('shop_pilot_private_intake_public_boundary_verification_invalid'))

  const readyToRecord = sampleShopPilotPrivateIntakeInput()
  readyToRecord.publicBoundary.controls.readyToRecord = true
  const unsafeBoundary = buildShopPilotPrivateIntakePacket(readyToRecord)
  assert.equal(unsafeBoundary.ok, false)
  assert.ok(unsafeBoundary.failures.includes('shop_pilot_private_intake_public_boundary_invalid'))

  const claimedRun = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput({
    readiness: {
      ...sampleShopPilotPrivateIntakeInput().readiness,
      pilotEvidence: {
        ...sampleShopPilotPrivateIntakeInput().readiness.pilotEvidence,
        acceptedConsecutiveRuns: 1,
      },
    },
  }))
  assert.equal(claimedRun.ok, false)
  assert.ok(claimedRun.failures.includes('shop_pilot_private_intake_pilot_evidence_invalid'))

  const missingPilotSequence = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput({
    readiness: {
      ...sampleShopPilotPrivateIntakeInput().readiness,
      pilotEvidence: {
        ...sampleShopPilotPrivateIntakeInput().readiness.pilotEvidence,
        requiredPilotDayIndexes: [],
      },
    },
  }))
  assert.equal(missingPilotSequence.ok, false)
  assert.ok(missingPilotSequence.failures.includes('shop_pilot_private_intake_pilot_evidence_invalid'))

  const claimedCalendarCoverage = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput({
    readiness: {
      ...sampleShopPilotPrivateIntakeInput().readiness,
      pilotEvidence: {
        ...sampleShopPilotPrivateIntakeInput().readiness.pilotEvidence,
        acceptedConsecutiveObservedDateCount: 5,
        acceptedConsecutiveObservedDates: ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'],
        pilotCalendarCoverageMet: true,
      },
    },
  }))
  assert.equal(claimedCalendarCoverage.ok, false)
  assert.ok(claimedCalendarCoverage.failures.includes('shop_pilot_private_intake_pilot_evidence_invalid'))
})

test('rejects missing scripts and tampered packets', () => {
  const missingScriptInput = sampleShopPilotPrivateIntakeInput()
  delete missingScriptInput.packageManifest.scripts['shop:pilot:intake-packet:self-test']
  const missingScript = buildShopPilotPrivateIntakePacket(missingScriptInput)
  assert.equal(missingScript.ok, false)
  assert.ok(missingScript.failures.includes('shop_pilot_private_intake_script_missing:shop:pilot:intake-packet:self-test'))

  const packet = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  assert.throws(
    () => validateShopPilotPrivateIntakePacket({ ...packet, status: 'ready_for_customer_contact' }),
    /shop_pilot_private_intake_packet_digest_invalid/,
  )
  assert.throws(
    () => validateShopPilotPrivateIntakePacket({ ...packet, digest: `sha256:${'f'.repeat(64)}` }),
    /shop_pilot_private_intake_packet_digest_invalid/,
  )
})

test('renders markdown without private identity or credential-shaped text', () => {
  const packet = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const markdown = renderShopPilotPrivateIntakeMarkdown(packet)
  assert.match(markdown, /Owner-private intake preparation only/)
  assert.match(markdown, /Promotion evidence still requires 20 consecutive accepted real runs whose accepted streak covers pilot days 1 through 5 and at least 5 distinct observed calendar dates/)
  assert.match(markdown, /current accepted observed date count is 0/)
  assert.doesNotMatch(markdown, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)
  assert.doesNotMatch(markdown, /(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}/u)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /github_pat_[A-Za-z0-9_]{20,}/)
})
