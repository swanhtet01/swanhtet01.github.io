import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT,
  assessRemoteAndroidQaPreflight,
  sampleRemoteAndroidQaPreflightInput,
  validateRemoteAndroidQaPreflight,
} from './prepare_remote_android_qa_preflight.mjs'
import {
  assessShopAndroidQaHandoff,
  sampleShopAndroidQaHandoffInput,
} from './prepare_shop_android_qa_handoff.mjs'

function artifactPacket() {
  return assessShopAndroidQaHandoff(sampleShopAndroidQaHandoffInput())
}

function resign(packet) {
  const body = { ...packet }
  delete body.digest
  return {
    ...body,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`,
  }
}

test('validates every non-artifact remote preflight boundary and stays blocked on retained artifact gaps', () => {
  const handoff = artifactPacket()
  const result = assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff),
    handoff,
  )
  assert.equal(result.contract, REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, [
    'artifact_encrypted_restore_unavailable',
    'artifact_scoped_evidence_export_unavailable',
    'external_remote_observation_required',
  ])
  assert.equal(result.host.reportedKvmEligible, true)
  assert.equal(result.network.reportedPrivateLoopbackOnly, true)
  assert.equal(result.provider.reportedPrerequisitesComplete, true)
  assert.equal(result.provider.authenticatedByThisPacket, false)
  assert.equal(result.claimBoundary.cloudCommandsExecuted, false)
  assert.equal(result.claimBoundary.emulatorExecuted, false)
  assert.equal(result.claimBoundary.sdkDownloaded, false)
  assert.equal(validateRemoteAndroidQaPreflight(result), result)
})

test('capability-aware successor removes only source capability blockers', () => {
  const handoff = assessShopAndroidQaHandoff(
    sampleShopAndroidQaHandoffInput({ capabilityAware: true }),
  )
  const result = assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff),
    handoff,
  )
  assert.deepEqual(result.failures, ['external_remote_observation_required'])
  assert.equal(result.ok, false)
  assert.equal(result.status, 'BLOCKED_OFFLINE_PLAN')
  assert.equal(result.claimBoundary.emulatorExecuted, false)
})

test('binds exact source run artifact archive APK and native tree identities', () => {
  const handoff = artifactPacket()
  const keys = [
    ['headSha', '1'.repeat(40)],
    ['sourceSha', '2'.repeat(40)],
    ['mergeSha', '3'.repeat(40)],
    ['nativeTree', '4'.repeat(40)],
    ['runId', '999'],
    ['artifactId', '998'],
    ['archiveSha256', '5'.repeat(64)],
    ['apkSha256', '6'.repeat(64)],
  ]
  for (const [key, value] of keys) {
    const input = sampleRemoteAndroidQaPreflightInput(handoff, {
      expectedArtifact: { [key]: value },
    })
    assert.ok(assessRemoteAndroidQaPreflight(input, handoff).failures
      .includes('artifact_expectation_mismatch'), key)
  }
})

test('rejects an invalid or post-hoc modified handoff packet', () => {
  const handoff = artifactPacket()
  const tampered = { ...handoff, artifact: { ...handoff.artifact, artifactId: '999' } }
  const result = assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff),
    tampered,
  )
  assert.ok(result.failures.includes('artifact_handoff_invalid'))
})

test('rejects missing KVM and insufficient CPU memory or disk independently', () => {
  const handoff = artifactPacket()
  for (const [host, code] of [
    [{ devKvmUsable: false }, 'host_kvm_unavailable'],
    [{ vmxCount: 0 }, 'host_kvm_unavailable'],
    [{ cpuCount: 3 }, 'host_cpu_insufficient'],
    [{ totalMemoryMiB: 8191 }, 'host_memory_insufficient'],
    [{ freeDiskMiB: 20479 }, 'host_disk_insufficient'],
    [{ observationSource: 'caller_claim' }, 'host_observation_source_invalid'],
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { host }), handoff,
    )
    assert.ok(result.failures.includes(code), JSON.stringify(host))
  }
})

test('rejects public ADB emulator console gRPC or IAP drift', () => {
  const handoff = artifactPacket()
  for (const network of [
    { adbHost: '0.0.0.0' },
    { emulatorConsoleHost: '10.0.0.2' },
    { grpcHost: '0.0.0.0' },
    { iapSshOnly: false },
    { publicInboundPorts: [5555] },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { network }), handoff,
    )
    assert.ok(result.failures.includes('network_not_private_loopback'), JSON.stringify(network))
  }
  for (const network of [{ adbTcpipEnabled: true }, { adbListenAll: true }]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { network }), handoff,
    )
    assert.ok(result.failures.includes('adb_remote_mode_forbidden'), JSON.stringify(network))
  }
})

test('rejects service accounts scopes credentials secrets or app provider access', () => {
  const handoff = artifactPacket()
  for (const network of [
    { serviceAccountAttached: true },
    { cloudApiScopes: ['cloud-platform'] },
    { productionSecretsPresent: true },
    { credentialFilesPresent: true },
    { providerAccessFromApp: true },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { network }), handoff,
    )
    assert.ok(result.failures.includes('credential_or_provider_boundary_invalid'), JSON.stringify(network))
  }
})

test('rejects non-synthetic or identifying test data', () => {
  const handoff = artifactPacket()
  for (const testData of [
    { classification: 'production' },
    { fictionalStoreOnly: false },
    { containsPersonalData: true },
    { containsProductionIdentifiers: true },
    { containsWalletOrProviderIdentifiers: true },
    { networkProviderCallsEnabled: true },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { testData }), handoff,
    )
    assert.ok(result.failures.includes('synthetic_data_boundary_invalid'), JSON.stringify(testData))
  }
})

test('requires six-hour STOP with no deletion or automatic restart', () => {
  const handoff = artifactPacket()
  for (const session of [
    { maxRunSeconds: 21601 },
    { maxRunSeconds: 0 },
    { terminationAction: 'DELETE' },
    { automaticRestart: true },
    { automaticDelete: true },
    { deletionAuthorized: true },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { session }), handoff,
    )
    assert.ok(result.failures.includes('session_runtime_boundary_invalid'), JSON.stringify(session))
  }
})

test('rejects budget and retention drift without pretending STOP is a hard cap', () => {
  const handoff = artifactPacket()
  for (const session of [
    { budgetUsd: 15.01 },
    { budgetUsd: 0 },
    { estimatedComputeUsd: -1 },
    { estimatedRetainedDailyUsd: -1 },
    { estimatedComputeUsd: 14.9, estimatedRetainedDailyUsd: 0.2 },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { session }), handoff,
    )
    assert.ok(result.failures.includes('session_budget_invalid'), JSON.stringify(session))
  }
  for (const retentionReviewHours of [0, 25]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, {
        session: { retentionReviewHours },
      }), handoff,
    )
    assert.ok(result.failures.includes('retention_review_invalid'))
  }
})

test('requires redacted private evidence export before stop', () => {
  const handoff = artifactPacket()
  for (const evidence of [
    { exportBeforeStop: false },
    { redacted: false },
    { containsCredentialValues: true },
    { containsCustomerData: true },
    { privateDestinationConfirmed: false },
    { hashManifestRequired: false },
    { retainOriginalArtifactUnchanged: false },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { evidence }), handoff,
    )
    assert.ok(result.failures.includes('evidence_export_boundary_invalid'), JSON.stringify(evidence))
  }
  const missing = sampleRemoteAndroidQaPreflightInput(handoff)
  missing.evidence.required = missing.evidence.required.slice(1)
  assert.ok(assessRemoteAndroidQaPreflight(missing, handoff).failures
    .includes('evidence_inventory_invalid'))
})

test('keeps scanner receipt sale restart restore export and stop steps separate and immutable', () => {
  const handoff = artifactPacket()
  const input = sampleRemoteAndroidQaPreflightInput(handoff)
  assert.deepEqual(input.steps.map((step) => step.id), [
    'artifact_identity',
    'host_preflight',
    'scanner_key_input',
    'sale_commit',
    'receipt_capture',
    'restart_reopen',
    'encrypted_restore',
    'evidence_export',
    'stop_runtime',
  ])
  for (const steps of [
    input.steps.slice(1),
    input.steps.map((step, index) => index === 2 ? { ...step, status: 'PASS' } : step),
    input.steps.map((step, index) => index === 4 ? { ...step, instruction: 'print' } : step),
  ]) {
    const result = assessRemoteAndroidQaPreflight({ ...input, steps }, handoff)
    assert.ok(result.failures.includes('acceptance_steps_invalid'))
  }
})

test('requires explicit dry-run mode and a valid observation timestamp', () => {
  const handoff = artifactPacket()
  assert.ok(assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff, { mode: 'execute' }), handoff,
  ).failures.includes('dry_run_mode_required'))
  assert.ok(assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff, { observedAt: 'not-a-date' }), handoff,
  ).failures.includes('observed_at_invalid'))
})

test('records but never authenticates reported provider prerequisites', () => {
  const handoff = artifactPacket()
  for (const provider of [
    { accountAccessVerified: false },
    { projectVerified: false },
    { billingVerified: false },
    { quotaVerified: false },
    { orgPolicyVerified: false },
    { provisioningAuthorized: false },
  ]) {
    const result = assessRemoteAndroidQaPreflight(
      sampleRemoteAndroidQaPreflightInput(handoff, { provider }), handoff,
    )
    assert.ok(result.failures.includes('provider_prerequisites_unverified'))
    assert.equal(result.provider.reportedPrerequisitesComplete, false)
    assert.equal(result.provider.authenticatedByThisPacket, false)
  }
})

test('artifact expiry uses the process clock rather than caller observedAt', () => {
  const handoff = artifactPacket()
  const input = sampleRemoteAndroidQaPreflightInput(handoff, {
    observedAt: '2000-01-01T00:00:00.000Z',
  })
  const result = assessRemoteAndroidQaPreflight(input, handoff, {
    nowMillis: Date.parse('2100-01-01T00:00:00.000Z'),
  })
  assert.ok(result.failures.includes('artifact_handoff_invalid'))
})

test('packet validation rejects post-hoc side-effect or readiness claims', () => {
  const handoff = artifactPacket()
  const packet = assessRemoteAndroidQaPreflight(
    sampleRemoteAndroidQaPreflightInput(handoff), handoff,
  )
  const sideEffect = resign({
    ...packet,
    claimBoundary: { ...packet.claimBoundary, cloudCommandsExecuted: true },
  })
  assert.throws(
    () => validateRemoteAndroidQaPreflight(sideEffect),
    /remote_android_qa_preflight_contract_invalid/,
  )
  const fakeReady = resign({ ...packet, ok: true, status: 'READY_FOR_SEPARATELY_AUTHORIZED_REMOTE_RUN' })
  assert.throws(
    () => validateRemoteAndroidQaPreflight(fakeReady),
    /remote_android_qa_preflight_blocked_state_invalid/,
  )
})

test('source imports no command execution networking or provider SDK', async () => {
  const source = await readFile(new URL('./prepare_remote_android_qa_preflight.mjs', import.meta.url), 'utf8')
  for (const forbidden of [
    'node:child_process',
    "from 'node:http'",
    "from 'node:https'",
    "from 'node:net'",
    'fetch(',
    'spawn(',
    'exec(',
    'googleapis',
    '@google-cloud',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})
