import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHOP_ANDROID_SMOKE_PACKET_CONTRACT,
  assessShopAndroidSmokePacket,
  sampleShopAndroidSmokePacketInput,
  validateShopAndroidSmokePacket,
} from './prepare_shop_android_smoke_packet.mjs'

test('builds a founder hardware rehearsal packet without claiming pilot proof', () => {
  const packet = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput())
  assert.equal(packet.contract, SHOP_ANDROID_SMOKE_PACKET_CONTRACT)
  assert.equal(packet.ok, true)
  assert.equal(packet.status, 'ready_for_founder_hardware_run')
  assert.equal(packet.claimBoundary.founderHardwareRunRequired, true)
  assert.equal(packet.claimBoundary.hostedPilotProof, false)
  assert.equal(packet.claimBoundary.paymentCaptureClaim, false)
  assert.equal(packet.smokePlan.firstLoadMustBeOnline, true)
  assert.equal(packet.smokePlan.networkDropRequiredAfterFirstLoad, true)
  assert.ok(packet.smokePlan.privateEvidenceFields.includes('barcode_scan_result'))
  assert.ok(packet.smokePlan.privateEvidenceFields.includes('reload_retry_result'))
  assert.equal(validateShopAndroidSmokePacket(packet), packet)
})

test('fails closed when the Shop playbook omits shipped phone surfaces', () => {
  const input = sampleShopAndroidSmokePacketInput({
    playbook: sampleShopAndroidSmokePacketInput().playbook.replace('Scan a barcode with the camera', ''),
  })
  const packet = assessShopAndroidSmokePacket(input)
  assert.equal(packet.ok, false)
  assert.ok(packet.failures.includes('playbook_marker_missing:Scan a barcode with the camera'))
})

test('fails closed when implementation anchors for QR, photos, or offline cache are absent', () => {
  const input = sampleShopAndroidSmokePacketInput()
  input.sources = { ...input.sources, 'tools/write_app_release_metadata.mjs': 'offline only' }
  const packet = assessShopAndroidSmokePacket(input)
  assert.equal(packet.ok, false)
  assert.ok(packet.failures.some((failure) => failure.startsWith('source_marker_missing:tools/write_app_release_metadata.mjs')))
})

test('requires client readiness to keep F1 hardware-gated', () => {
  const packet = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput({
    clientReadiness: 'A6 done, but no hardware gate.',
  }))
  assert.equal(packet.ok, false)
  assert.ok(packet.failures.includes('client_readiness_f1_missing'))
  assert.ok(packet.failures.includes('client_readiness_hardware_gate_missing'))
})

test('rejects tampered packet digests and claim boundaries', () => {
  const packet = assessShopAndroidSmokePacket(sampleShopAndroidSmokePacketInput())
  assert.throws(
    () => validateShopAndroidSmokePacket({ ...packet, status: 'hosted_pilot_ready' }),
    /shop_android_smoke_packet_digest_invalid/,
  )
  assert.throws(
    () => validateShopAndroidSmokePacket({ ...packet, digest: `sha256:${'f'.repeat(64)}` }),
    /shop_android_smoke_packet_digest_invalid/,
  )
})
