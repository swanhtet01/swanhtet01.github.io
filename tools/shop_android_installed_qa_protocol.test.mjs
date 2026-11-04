import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
  SHOP_ANDROID_INSTALLED_QA_SELECTORS,
  runShopAndroidInstalledQaProtocol,
} from './shop_android_installed_qa_protocol.mjs'
import {
  assessShopAndroidQaHandoff,
  sampleShopAndroidQaHandoffInput,
} from './prepare_shop_android_qa_handoff.mjs'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const SHA_D = 'd'.repeat(64)
const LOCK = 'e'.repeat(64)
const RECEIPT = '1'.repeat(64)
const RENDER = '2'.repeat(64)
const ENVELOPE = '3'.repeat(64)
const TARGET = '4'.repeat(64)
const CONTAINMENT = '5'.repeat(64)
const SESSION = '0123456789abcdef0123456789abcdef'
const SHA64_PATTERN = /^[0-9a-f]{64}$/
const TEST_START = Date.now() - 1_000

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')
}

function resignHandoff(packet) {
  const body = { ...packet }
  delete body.digest
  return {
    ...body,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`,
  }
}

function samplePlan(overrides = {}) {
  const handoff = assessShopAndroidQaHandoff(
    sampleShopAndroidQaHandoffInput({ canonicalAware: true }),
  )
  const plan = {
    contract: SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
    sessionNonce: SESSION,
    targetId: TARGET,
    handoff,
    isolation: {
      containmentId: CONTAINMENT,
      adbHost: '127.0.0.1',
      adbTcpipEnabled: false,
      adbListenAll: false,
      providerAccessFromApp: false,
      noEgress: true,
      loopbackOnly: true,
    },
    timing: {
      sessionStartedAt: new Date(TEST_START).toISOString(),
      sessionDeadlineAt: new Date(TEST_START + 60 * 60 * 1000).toISOString(),
      maxStepDurationMs: 30_000,
    },
    expected: {
      saleDelta: 1,
      stockMovementDelta: 1,
      receiptDelta: 1,
      outboxDelta: 1,
      onHandDelta: -1,
      productSelector: 'shop.catalog.product.synthetic-product',
      receiptBindingSha256: RECEIPT,
      receiptRenderSha256: RENDER,
      envelopeSha256: ENVELOPE,
      priorSessionState: 'none',
      priorSessionNonce: null,
      recoveryReceiptSha256: null,
    },
    paths: {
      privateEnvelope: 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-20261103-000000-abcdef123456.smqa',
      privateReceiptSidecar: 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-RECEIPTS-v1.json',
      stagingRoot: `supermega-shop-installed-qa/${SESSION}/`,
      stagedEnvelope: `supermega-shop-installed-qa/${SESSION}/evidence.smqa`,
    },
    selectors: { ...SHOP_ANDROID_INSTALLED_QA_SELECTORS },
  }
  return { ...plan, ...overrides }
}

const PRE = Object.freeze({ sales: 0, stockMovements: 0, receipts: 0, outbox: 0, onHand: 3, shifts: 1 })
const POST = Object.freeze({ sales: 1, stockMovements: 1, receipts: 1, outbox: 1, onHand: 2, shifts: 1 })

function stepData(step, plan) {
  const p = plan.paths
  const e = plan.expected
  const s = plan.selectors
  switch (step) {
    case 'observe_target':
    case 'reobserve_runtime_isolation': return { ...plan.isolation }
    case 'recover_prior_session': return {
      priorSessionState: e.priorSessionState,
      priorSessionNonce: e.priorSessionNonce,
      targetId: plan.targetId,
      containmentId: plan.isolation.containmentId,
      recoveryReceiptSha256: e.recoveryReceiptSha256,
      staleLockReleased: e.priorSessionState === 'abandoned',
      externalStageDeleted: e.priorSessionState === 'abandoned',
      privateEvidenceDeleted: e.priorSessionState === 'abandoned',
      recoveredAt: e.priorSessionState === 'abandoned' ? plan.timing.sessionStartedAt : null,
    }
    case 'acquire_target_lock': return { acquired: true, concurrentOwner: false, lockToken: LOCK }
    case 'verify_installed_artifact': return {
      packageId: plan.handoff.artifact.applicationId, profileId: 'synthetic_qa_v1',
      apkSha256: plan.handoff.artifact.apkSha256,
      signerSha256: plan.handoff.artifact.signerCertificateSha256,
      manifestDigest: plan.handoff.canonicalArtifactManifest.digest,
      handoffDigest: plan.handoff.digest,
      debuggable: true, productionSigned: false,
    }
    case 'observe_pre_sale': return { ...PRE }
    case 'ui_start_new': return { acted: true, selectorsUsed: [s.startNew, s.startNewConfirm] }
    case 'ui_create_product': return { acted: true, selectorsUsed: [s.emptyAdd, s.productName, s.productCategory, s.productPrice, s.productStock, s.barcodeReveal, s.barcode, s.productSave] }
    case 'ui_commit_sale': return { acted: true, productSelector: e.productSelector, selectorsUsed: [s.cartReview, s.checkoutCash, s.cashGiven, s.cashConfirm, s.saleCompletion] }
    case 'observe_post_sale': return { ...POST }
    case 'ui_reprint_before_restart':
    case 'ui_reprint_after_restart':
    case 'ui_reprint_restored_receipt':
      return { acted: true, selectorsUsed: [s.openRecentSales, s.savedReceipt, s.savedReceiptReprint] }
    case 'observe_receipt_before_restart': return receipt(1, p, e)
    case 'observe_receipt_after_restart': return receipt(2, p, e)
    case 'ui_export_backup': return { acted: true, selectorsUsed: [s.backupPassword, s.backupPasswordConfirm, s.backupExport] }
    case 'observe_restored_receipt': return receipt(1, p, e)
    case 'force_stop':
    case 'reopen': return { completed: true, packageId: plan.handoff.artifact.applicationId }
    case 'export_private_evidence': return {
      envelopePath: p.privateEnvelope, envelopeSha256: e.envelopeSha256,
      inventoryCount: 1, regularFile: true, symlink: false,
    }
    case 'stage_envelope_external':
    case 'verify_external_stage': return {
      sourcePath: p.privateEnvelope, destinationPath: p.stagedEnvelope,
      sourceSha256: e.envelopeSha256, destinationSha256: e.envelopeSha256,
      inventoryCount: 1, regularFile: true, symlink: false,
    }
    case 'clear_package_data': return { packageId: plan.handoff.artifact.applicationId, cleared: true }
    case 'observe_after_clear': return {
      privateSourceExists: false, receiptSidecarExists: false,
      stagedExists: true, stagedSha256: e.envelopeSha256, stagedInventoryCount: 1,
      stagedRegularFile: true, stagedSymlink: false,
    }
    case 'restore_envelope_to_fresh_profile': return {
      sourcePath: p.stagedEnvelope, destinationPath: p.privateEnvelope,
      sourceSha256: e.envelopeSha256, destinationSha256: e.envelopeSha256,
      regularFile: true, symlink: false,
    }
    case 'ui_restore_fresh_profile': return { acted: true, selectorsUsed: [s.restoreChoose, s.restorePassword, s.restoreConfirm] }
    case 'observe_restored_state': return { ...POST }
    default: throw new Error(`unexpected fixture step ${step}`)
  }
}

function receipt(count, paths, expected) {
  return {
    captureCount: count,
    receiptBindingSha256: expected.receiptBindingSha256,
    receiptRenderSha256: expected.receiptRenderSha256,
    sidecarPath: paths.privateReceiptSidecar,
  }
}

class FixtureAdapter {
  constructor(plan, { mutate, throwAt, cleanupMutate } = {}) {
    this.plan = plan
    this.mutate = mutate
    this.throwAt = throwAt
    this.cleanupMutate = cleanupMutate
    this.calls = []
    this.lockToken = null
    this.operationOutcome = 'NOT_APPLICABLE'
  }

  async observe(request) {
    this.calls.push(request)
    if (request.step === this.throwAt) {
      const error = new Error('fixture_failure')
      error.code = 'fixture_failure'
      throw error
    }
    const observedAt = Date.parse(this.plan.timing.sessionStartedAt) + this.calls.length * 10
    const common = {
      contract: SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
      sessionNonce: this.plan.sessionNonce,
      targetId: this.plan.targetId,
      sequence: request.sequence,
      step: request.step,
      requestDigest: request.requestDigest,
      previousAck: request.previousAck,
      startedAt: new Date(observedAt).toISOString(),
      completedAt: new Date(observedAt + 1).toISOString(),
      status: 'PASS',
      lockToken: request.sequence >= 3 ? this.lockToken : null,
      data: null,
    }
    if (request.step === 'cleanup_and_release') {
      common.lockToken = this.lockToken
      common.data = {
        cleanupReceiptSha256: '8'.repeat(64), externalStageDeleted: true,
        privateEvidenceDeleted: true, lockReleased: true,
        operationOutcome: this.operationOutcome, reasonCode: request.reasonCode,
      }
      return this.cleanupMutate ? this.cleanupMutate(common, request) || common : common
    }
    if (request.step === 'abort_and_join_timed_out_operation') {
      common.lockToken = this.lockToken
      common.data = {
        aborted: true, joined: true, outcome: 'ABORTED',
        timedOutRequestDigest: request.previousAck === request.requestDigest
          ? null : this.calls.at(-2).requestDigest,
        timedOutSequence: this.calls.at(-2).sequence,
      }
      this.operationOutcome = 'ABORTED'
      return this.mutate ? this.mutate(common, request) || common : common
    }
    common.data = stepData(request.step, this.plan)
    const value = this.mutate ? this.mutate(common, request) || common : common
    if (request.step === 'acquire_target_lock' && value.data.acquired === true) {
      this.lockToken = value.data.lockToken
    }
    return value
  }
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code)
}

test('canonical protocol proves one sale restart restore and cleanup with sanitized receipts', async () => {
  const plan = samplePlan()
  const adapter = new FixtureAdapter(plan)
  const result = await runShopAndroidInstalledQaProtocol(plan, adapter)
  assert.equal(result.status, 'PASS')
  assert.deepEqual(result.counts, POST)
  assert.equal(result.artifact.runId, plan.handoff.artifact.runId)
  assert.equal(result.artifact.nativeTree, plan.handoff.artifact.nativeTree)
  assert.equal(result.artifact.handoffDigest, plan.handoff.digest)
  assert.equal(result.receipts.length, 28)
  assert.equal(result.receipts.every((entry) => Object.keys(entry).sort().join(',') === 'acknowledgementSha256,durationMs,status,step'), true)
  assert.match(result.digest, SHA64_PATTERN)
  assert.equal(adapter.calls.at(-1).step, 'cleanup_and_release')
  assert.equal(adapter.calls.at(-1).reasonCode, 'completed')
})

test('artifact handoff profile signer manifest and package substitutions fail closed with cleanup', async (t) => {
  const mutations = [
    ['packageId', 'dev.other'], ['profileId', 'other'], ['apkSha256', SHA_A],
    ['signerSha256', SHA_A], ['manifestDigest', SHA_A], ['handoffDigest', SHA_A],
    ['debuggable', false], ['productionSigned', true],
  ]
  for (const [field, value] of mutations) {
    await t.test(field, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'verify_installed_artifact') observation.data[field] = value
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_artifact_substitution')
      assert.equal(adapter.calls.at(-1).step, 'cleanup_and_release')
    })
  }
})

test('expired handoff and tampered plan identities are rejected before adapter use', async () => {
  const expired = samplePlan()
  expired.handoff.artifact.expiresAt = '2026-11-02T00:00:00.000Z'
  const expiredAdapter = new FixtureAdapter(expired)
  await expectCode(runShopAndroidInstalledQaProtocol(expired, expiredAdapter), 'shop_android_installed_qa_handoff_invalid')
  assert.equal(expiredAdapter.calls.length, 0)

  const tampered = samplePlan()
  tampered.handoff.digest = 'sha256:not-a-digest'
  const tamperedAdapter = new FixtureAdapter(tampered)
  await expectCode(runShopAndroidInstalledQaProtocol(tampered, tamperedAdapter), 'shop_android_installed_qa_handoff_invalid')
  assert.equal(tamperedAdapter.calls.length, 0)

  for (const [field, value] of [
    ['sourceSha', 'a'.repeat(40)],
    ['apkSha256', SHA_A],
    ['signerCertificateSha256', SHA_A],
  ]) {
    const substituted = samplePlan()
    substituted.handoff = resignHandoff({
      ...substituted.handoff,
      artifact: { ...substituted.handoff.artifact, [field]: value },
      releaseExpectation: field === 'sourceSha'
        ? { ...substituted.handoff.releaseExpectation, sourceSha: value, mergeSha: value }
        : substituted.handoff.releaseExpectation,
    })
    await expectCode(
      runShopAndroidInstalledQaProtocol(substituted, new FixtureAdapter(substituted)),
      'shop_android_installed_qa_handoff_invalid',
    )
  }
})

test('validated handoff paths hashes and selectors are immutable across awaited observations', async () => {
  const plan = samplePlan()
  const adapter = new FixtureAdapter(plan, {
    mutate(observation, request) {
      if (request.step === 'observe_pre_sale') {
        plan.expected.envelopeSha256 = SHA_A
        plan.paths.stagedEnvelope = `${plan.paths.stagingRoot}substituted.smqa`
        plan.selectors.backupExport = 'shop.backup.substituted'
      }
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_ui_observation_invalid')
})

test('host deadlines bound never-resolving normal and cleanup operations', async () => {
  const plan = samplePlan()
  plan.timing.sessionStartedAt = new Date(Date.now()).toISOString()
  plan.timing.sessionDeadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  plan.timing.maxStepDurationMs = 50
  const adapter = new FixtureAdapter(plan)
  const original = adapter.observe.bind(adapter)
  let timedOutSignal
  adapter.observe = (request, options) => {
    if (request.step !== 'verify_installed_artifact') return original(request, options)
    adapter.calls.push(request)
    timedOutSignal = options.signal
    return new Promise(() => {})
  }
  const started = Date.now()
  await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_operation_timeout')
  assert.deepEqual(adapter.calls.slice(-2).map((request) => request.step),
    ['abort_and_join_timed_out_operation', 'cleanup_and_release'])
  assert.notEqual(adapter.calls.at(-1).previousAck, adapter.calls.at(-2).previousAck)
  assert.equal(adapter.operationOutcome, 'ABORTED')
  assert.equal(timedOutSignal.aborted, true)
  assert.equal(adapter.calls.at(-1).step, 'cleanup_and_release')
  assert.equal(Date.now() - started < 1_000, true)

  const cleanupPlan = samplePlan()
  cleanupPlan.timing.sessionStartedAt = new Date(Date.now()).toISOString()
  cleanupPlan.timing.sessionDeadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  cleanupPlan.timing.maxStepDurationMs = 50
  const cleanupAdapter = new FixtureAdapter(cleanupPlan, {
    mutate(observation, request) {
      if (request.step === 'verify_installed_artifact') observation.data.apkSha256 = SHA_A
    },
  })
  const cleanupOriginal = cleanupAdapter.observe.bind(cleanupAdapter)
  let cleanupSignal
  cleanupAdapter.observe = (request, options) => {
    if (request.step !== 'cleanup_and_release') return cleanupOriginal(request, options)
    cleanupAdapter.calls.push(request)
    cleanupSignal = options.signal
    return new Promise(() => {})
  }
  await assert.rejects(runShopAndroidInstalledQaProtocol(cleanupPlan, cleanupAdapter), (error) =>
    error.code === 'shop_android_installed_qa_cleanup_failed'
      && error.cleanupOutcome === 'UNKNOWN' && error.lockReleaseProven === false)
  assert.equal(cleanupSignal.aborted, true)

  const unsettledPlan = samplePlan()
  unsettledPlan.timing.sessionStartedAt = new Date(Date.now()).toISOString()
  unsettledPlan.timing.sessionDeadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  unsettledPlan.timing.maxStepDurationMs = 50
  const unsettled = new FixtureAdapter(unsettledPlan)
  const unsettledOriginal = unsettled.observe.bind(unsettled)
  unsettled.observe = (request, options) => {
    if (!['verify_installed_artifact', 'abort_and_join_timed_out_operation'].includes(request.step)) {
      return unsettledOriginal(request, options)
    }
    unsettled.calls.push(request)
    return new Promise(() => {})
  }
  await assert.rejects(runShopAndroidInstalledQaProtocol(unsettledPlan, unsettled), (error) =>
    error.code === 'shop_android_installed_qa_cleanup_failed'
      && error.cleanupOutcome === 'UNKNOWN' && error.lockReleaseProven === false)
  assert.equal(unsettled.calls.at(-1).step, 'cleanup_and_release')

  const stale = samplePlan()
  stale.timing.sessionStartedAt = '2026-10-01T00:00:00.000Z'
  stale.timing.sessionDeadlineAt = '2026-10-01T01:00:00.000Z'
  await expectCode(runShopAndroidInstalledQaProtocol(stale, new FixtureAdapter(stale)), 'shop_android_installed_qa_session_expired')
})

test('runtime isolation drift is rejected for every observed boundary', async (t) => {
  const changes = [
    ['containmentId', SHA_A], ['adbHost', '0.0.0.0'], ['adbTcpipEnabled', true],
    ['adbListenAll', true], ['providerAccessFromApp', true], ['noEgress', false],
    ['loopbackOnly', false],
  ]
  for (const [field, value] of changes) {
    await t.test(field, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'observe_target') observation.data[field] = value
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_target_isolation_drift')
    })
  }
  const plan = samplePlan()
  const finalDrift = new FixtureAdapter(plan, {
    mutate(observation, request) {
      if (request.step === 'reobserve_runtime_isolation') observation.data.noEgress = false
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(plan, finalDrift), 'shop_android_installed_qa_target_isolation_drift')
})

test('sequence request session target lock and timeout substitutions fail closed', async (t) => {
  const cases = [
    ['sequence', (o) => { o.sequence += 1 }, 'shop_android_installed_qa_observation_binding_invalid'],
    ['session', (o) => { o.sessionNonce = 'f'.repeat(32) }, 'shop_android_installed_qa_observation_binding_invalid'],
    ['target', (o) => { o.targetId = SHA_A }, 'shop_android_installed_qa_observation_binding_invalid'],
    ['request', (o) => { o.requestDigest = SHA_A }, 'shop_android_installed_qa_observation_binding_invalid'],
    ['previous ack', (o) => { o.previousAck = SHA_A }, 'shop_android_installed_qa_observation_binding_invalid'],
    ['lock', (o, r) => { if (r.sequence >= 3) o.lockToken = SHA_A }, 'shop_android_installed_qa_lock_binding_invalid'],
    ['timeout', (o) => { o.completedAt = '2026-11-03T00:10:00.000Z' }, 'shop_android_installed_qa_observation_time_invalid'],
  ]
  for (const [name, mutate, code] of cases) {
    await t.test(name, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'verify_installed_artifact') mutate(observation, request)
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), code)
    })
  }
  const lockPlan = samplePlan()
  const lockAdapter = new FixtureAdapter(lockPlan, {
    mutate(observation, request) {
      if (request.step === 'acquire_target_lock') observation.lockToken = LOCK
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(lockPlan, lockAdapter), 'shop_android_installed_qa_lock_binding_invalid')
})

test('every request carries a bounded per-operation deadline', async () => {
  const plan = samplePlan()
  const adapter = new FixtureAdapter(plan)
  await runShopAndroidInstalledQaProtocol(plan, adapter)
  for (const request of adapter.calls) {
    const deadline = Date.parse(request.deadlineAt)
    assert.equal(deadline <= Date.parse(plan.timing.sessionDeadlineAt), true)
    assert.equal(deadline <= Date.parse(plan.timing.sessionStartedAt)
      + (request.sequence + 1) * plan.timing.maxStepDurationMs, true)
  }
})

test('pre and post sale deltas reject missing duplicate and wrong stock effects', async (t) => {
  const cases = [
    ['missing sale', 'sales', 0], ['duplicate sale', 'sales', 2],
    ['missing stock movement', 'stockMovements', 0], ['wrong on hand', 'onHand', 3],
    ['duplicate outbox', 'outbox', 2], ['shift drift', 'shifts', 2],
  ]
  for (const [name, field, value] of cases) {
    await t.test(name, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'observe_post_sale') observation.data[field] = value
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_sale_delta_invalid')
    })
  }
})

test('sale and backup UI observations bind the exact reviewed selectors', async () => {
  const plan = samplePlan()
  const wrongProduct = new FixtureAdapter(plan, {
    mutate(observation, request) {
      if (request.step === 'ui_commit_sale') observation.data.productSelector = 'shop.catalog.product.other'
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(plan, wrongProduct), 'shop_android_installed_qa_ui_observation_invalid')

  const wrongBackup = new FixtureAdapter(plan, {
    mutate(observation, request) {
      if (request.step === 'ui_export_backup') observation.data.selectorsUsed.reverse()
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(plan, wrongBackup), 'shop_android_installed_qa_ui_observation_invalid')
})

test('external staging rejects digest substitution inventory symlink traversal and deletion failure', async (t) => {
  const observations = [
    ['digest', (data) => { data.destinationSha256 = SHA_A }],
    ['multiple', (data) => { data.inventoryCount = 2 }],
    ['symlink', (data) => { data.symlink = true }],
    ['not regular', (data) => { data.regularFile = false }],
    ['destination substitution', (data) => { data.destinationPath = '../escape.smqa' }],
  ]
  for (const [name, mutate] of observations) {
    await t.test(name, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'stage_envelope_external') mutate(observation.data)
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_stage_invalid')
    })
  }
  const unsafe = samplePlan()
  unsafe.paths.stagedEnvelope = `${unsafe.paths.stagingRoot}../escape.smqa`
  await expectCode(runShopAndroidInstalledQaProtocol(unsafe, new FixtureAdapter(unsafe)), 'shop_android_installed_qa_staged_envelope_path_invalid')

  const cleanupPlan = samplePlan()
  const cleanupAdapter = new FixtureAdapter(cleanupPlan, {
    cleanupMutate(observation) { observation.data.externalStageDeleted = false },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(cleanupPlan, cleanupAdapter), 'shop_android_installed_qa_cleanup_failed')
})

test('clear removes private evidence while preserving exactly one staged envelope', async (t) => {
  const changes = [
    ['private remains', (data) => { data.privateSourceExists = true }],
    ['sidecar remains', (data) => { data.receiptSidecarExists = true }],
    ['stage missing', (data) => { data.stagedExists = false }],
    ['stage changed', (data) => { data.stagedSha256 = SHA_A }],
    ['stage extra', (data) => { data.stagedInventoryCount = 2 }],
  ]
  for (const [name, mutate] of changes) {
    await t.test(name, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'observe_after_clear') mutate(observation.data)
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_clear_observation_invalid')
    })
  }
})

test('restored receipt resets sidecar count to one and retains immutable digests', async (t) => {
  const cases = [
    ['count restored', (data) => { data.captureCount = 2 }],
    ['receipt changed', (data) => { data.receiptBindingSha256 = SHA_A }],
    ['render changed', (data) => { data.receiptRenderSha256 = SHA_A }],
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, {
        mutate(observation, request) {
          if (request.step === 'observe_restored_receipt') mutate(observation.data)
        },
      })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_receipt_binding_invalid')
    })
  }
})

test('failures at every phase demand cleanup and cleanup preserves original reason', async (t) => {
  const steps = [
    'observe_target', 'acquire_target_lock', 'verify_installed_artifact',
    'ui_commit_sale', 'ui_export_backup', 'stage_envelope_external', 'clear_package_data',
    'ui_restore_fresh_profile', 'observe_restored_receipt',
  ]
  for (const step of steps) {
    await t.test(step, async () => {
      const plan = samplePlan()
      const adapter = new FixtureAdapter(plan, { throwAt: step })
      await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'fixture_failure')
      assert.equal(adapter.calls.at(-1).step, 'cleanup_and_release')
      assert.equal(adapter.calls.at(-1).reasonCode, 'fixture_failure')
      try {
        await runShopAndroidInstalledQaProtocol(plan, new FixtureAdapter(plan, { throwAt: step }))
      } catch (error) {
        assert.equal(error.cleanupReceipt.step, 'cleanup_and_release')
      }
    })
  }
})

test('abandoned prior session requires a recovery receipt and concurrent target lock is rejected', async () => {
  const recovered = samplePlan()
  recovered.expected.priorSessionState = 'abandoned'
  recovered.expected.priorSessionNonce = 'b'.repeat(32)
  recovered.expected.recoveryReceiptSha256 = '7'.repeat(64)
  const result = await runShopAndroidInstalledQaProtocol(recovered, new FixtureAdapter(recovered))
  assert.equal(result.status, 'PASS')

  for (const field of ['priorSessionNonce', 'targetId', 'containmentId', 'recoveryReceiptSha256', 'staleLockReleased', 'externalStageDeleted', 'privateEvidenceDeleted', 'recoveredAt']) {
    const plan = samplePlan()
    plan.expected.priorSessionState = 'abandoned'
    plan.expected.priorSessionNonce = 'b'.repeat(32)
    plan.expected.recoveryReceiptSha256 = '7'.repeat(64)
    const adapter = new FixtureAdapter(plan, {
      mutate(observation, request) {
        if (request.step !== 'recover_prior_session') return
        observation.data[field] = typeof observation.data[field] === 'boolean'
          ? false : (field === 'priorSessionNonce' ? 'c'.repeat(32)
            : (field === 'recoveredAt' ? '2026-11-02T00:00:00.000Z' : SHA_A))
      },
    })
    await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_recovery_receipt_invalid')
  }

  const plan = samplePlan()
  const adapter = new FixtureAdapter(plan, {
    mutate(observation, request) {
      if (request.step === 'acquire_target_lock') {
        observation.data.acquired = false
        observation.data.concurrentOwner = true
      }
    },
  })
  await expectCode(runShopAndroidInstalledQaProtocol(plan, adapter), 'shop_android_installed_qa_target_locked')
})

test('nested and case-varied raw payload keys fail before or during execution', async (t) => {
  const keys = ['Raw_Payload', 'PAY-load', 'Receipt_Rows', 'CustomerData', 'backup-bytes']
  for (const key of keys) {
    await t.test(key, async () => {
      const plan = samplePlan()
      plan.expected.extra = { nested: { [key]: 'forbidden' } }
      await expectCode(runShopAndroidInstalledQaProtocol(plan, new FixtureAdapter(plan)), 'shop_android_installed_qa_raw_payload_forbidden')
    })
  }
})

test('every installed UI action is bound to source-declared stable selectors', async () => {
  const source = await Promise.all([
    readFile(new URL('../mobile/shop_pos/lib/main.dart', import.meta.url), 'utf8'),
    readFile(new URL('../mobile/shop_pos/lib/shop_startup.dart', import.meta.url), 'utf8'),
    readFile(new URL('../mobile/shop_pos/lib/shop_backup_export_screen.dart', import.meta.url), 'utf8'),
    readFile(new URL('../mobile/shop_pos/lib/recent_sales_screen.dart', import.meta.url), 'utf8'),
  ])
  for (const selector of Object.values(SHOP_ANDROID_INSTALLED_QA_SELECTORS)) {
    assert.equal(source.some((text) => text.includes(`'${selector}'`)), true, selector)
  }
})

test('protocol source imports no process filesystem network or provider execution', async () => {
  const source = await readFile(new URL('./shop_android_installed_qa_protocol.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:(?:child_process|fs|net|http|https|tls|dgram|worker_threads)/)
  assert.doesNotMatch(source, /\b(?:fetch|spawn|execFile|execSync|Bun|Deno)\s*\(/)
  assert.doesNotMatch(source, /(?:googleapis|@google-cloud|firebase-admin|aws-sdk)/)
})
