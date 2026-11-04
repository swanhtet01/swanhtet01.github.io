import { createHash } from 'node:crypto'

import {
  SHOP_ANDROID_QA_CANONICAL_HANDOFF_CONTRACT,
  validateShopAndroidQaHandoff,
} from './shop_android_qa_handoff_validator.mjs'

export const SHOP_ANDROID_INSTALLED_QA_PROTOCOL =
  'supermega.shop.android-installed-qa-protocol.v2'

const PACKAGE_ID = 'dev.supermega.supermega_shop.qa'
const PROFILE_ID = 'synthetic_qa_v1'
const SHA64 = /^[0-9a-f]{64}$/
const NONCE = /^[0-9a-f]{32,64}$/
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/
const FORBIDDEN_KEYS = new Set([
  'raw', 'rawdata', 'rawpayload', 'payload', 'row', 'rows', 'rowdata',
  'customer', 'customerdata', 'payment', 'paymentdata', 'productdata',
  'receiptdata', 'receiptrows', 'backupbytes', 'secret', 'secrets',
  'credential', 'credentials', 'token', 'passwordvalue',
])

export const SHOP_ANDROID_INSTALLED_QA_SELECTORS = Object.freeze({
  startNew: 'shop.setup.start-new',
  startNewConfirm: 'shop.setup.start-new.confirm',
  emptyAdd: 'shop.product.empty.add',
  productName: 'shop.product.name',
  productCategory: 'shop.product.category',
  productPrice: 'shop.product.price',
  productStock: 'shop.product.stock',
  barcodeReveal: 'shop.product.barcode.reveal',
  barcode: 'shop.product.barcode',
  productSave: 'shop.product.save',
  cartReview: 'shop.cart.review',
  checkoutCash: 'shop.checkout.cash',
  cashGiven: 'shop.checkout.cash.given',
  cashConfirm: 'shop.checkout.cash.confirm',
  saleCompletion: 'shop.sale-completion',
  openRecentSales: 'shop.open-recent-sales',
  savedReceipt: 'shop.saved-receipt',
  savedReceiptReprint: 'shop.saved-receipt.reprint',
  backupPassword: 'shop.backup.password',
  backupPasswordConfirm: 'shop.backup.password-confirm',
  backupExport: 'shop.backup.export',
  restoreChoose: 'shop.setup.restore.choose',
  restorePassword: 'shop.setup.restore.password',
  restoreConfirm: 'shop.setup.restore.confirm',
})

const STEP_DEFINITIONS = Object.freeze([
  ['observe_target', 'target'],
  ['recover_prior_session', 'recovery'],
  ['acquire_target_lock', 'lock'],
  ['verify_installed_artifact', 'artifact'],
  ['observe_pre_sale', 'metrics_pre'],
  ['ui_start_new', 'ui_start'],
  ['ui_create_product', 'ui_product'],
  ['ui_commit_sale', 'ui_sale'],
  ['observe_post_sale', 'metrics_post'],
  ['ui_reprint_before_restart', 'ui_reprint'],
  ['observe_receipt_before_restart', 'receipt_one'],
  ['force_stop', 'lifecycle'],
  ['reopen', 'lifecycle'],
  ['ui_reprint_after_restart', 'ui_reprint'],
  ['observe_receipt_after_restart', 'receipt_two'],
  ['ui_export_backup', 'ui_backup'],
  ['export_private_evidence', 'private_export'],
  ['stage_envelope_external', 'stage'],
  ['verify_external_stage', 'stage'],
  ['clear_package_data', 'clear'],
  ['observe_after_clear', 'cleared'],
  ['restore_envelope_to_fresh_profile', 'restore_copy'],
  ['ui_restore_fresh_profile', 'ui_restore'],
  ['observe_restored_state', 'metrics_restored'],
  ['ui_reprint_restored_receipt', 'ui_reprint'],
  ['observe_restored_receipt', 'receipt_restored'],
  ['reobserve_runtime_isolation', 'target'],
])

const EXACT_KEYS = Object.freeze({
  plan: ['contract', 'sessionNonce', 'targetId', 'handoff', 'isolation', 'timing', 'expected', 'paths', 'selectors'],
  isolation: ['containmentId', 'adbHost', 'adbTcpipEnabled', 'adbListenAll', 'providerAccessFromApp', 'noEgress', 'loopbackOnly'],
  timing: ['sessionStartedAt', 'sessionDeadlineAt', 'maxStepDurationMs'],
  expected: ['saleDelta', 'stockMovementDelta', 'receiptDelta', 'outboxDelta', 'onHandDelta', 'productSelector', 'receiptBindingSha256', 'receiptRenderSha256', 'envelopeSha256', 'priorSessionState', 'priorSessionNonce', 'recoveryReceiptSha256'],
  paths: ['privateEnvelope', 'privateReceiptSidecar', 'stagingRoot', 'stagedEnvelope'],
  common: ['contract', 'sessionNonce', 'targetId', 'sequence', 'step', 'requestDigest', 'previousAck', 'startedAt', 'completedAt', 'status', 'lockToken', 'data'],
  metrics: ['sales', 'stockMovements', 'receipts', 'outbox', 'onHand', 'shifts'],
})

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

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

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\n') !== [...keys].sort().join('\n')) fail(code)
}

function rejectForbiddenKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenKeys(item)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (FORBIDDEN_KEYS.has(normalized)) fail('shop_android_installed_qa_raw_payload_forbidden')
    rejectForbiddenKeys(item)
  }
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function assertSha(value, code, regex = SHA64) {
  if (typeof value !== 'string' || !regex.test(value)) fail(code)
}

function assertSafePath(value, prefix, code) {
  if (typeof value !== 'string' || !SAFE_RELATIVE.test(value)
      || !value.startsWith(prefix) || value.includes('//')) fail(code)
}

function immutableSnapshot(value) {
  const snapshot = structuredClone(value)
  const freeze = (item) => {
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child)
      Object.freeze(item)
    }
    return item
  }
  return freeze(snapshot)
}

function validatePlan(plan, nowMillis) {
  rejectForbiddenKeys(plan)
  exactKeys(plan, EXACT_KEYS.plan, 'shop_android_installed_qa_plan_shape_invalid')
  if (plan.contract !== SHOP_ANDROID_INSTALLED_QA_PROTOCOL || !NONCE.test(plan.sessionNonce)) {
    fail('shop_android_installed_qa_contract_or_nonce_invalid')
  }
  assertSha(plan.targetId, 'shop_android_installed_qa_target_invalid')
  let handoff
  try {
    handoff = validateShopAndroidQaHandoff(plan.handoff, { nowMillis })
  } catch {
    fail('shop_android_installed_qa_handoff_invalid')
  }
  if (handoff.contract !== SHOP_ANDROID_QA_CANONICAL_HANDOFF_CONTRACT
      || handoff.artifact.applicationId !== PACKAGE_ID
      || handoff.artifact.productionSigned !== false
      || handoff.artifact.promotionEligible !== false
      || Date.parse(handoff.artifact.expiresAt) < Date.parse(plan.timing?.sessionDeadlineAt || '')) {
    fail('shop_android_installed_qa_handoff_invalid')
  }
  exactKeys(plan.isolation, EXACT_KEYS.isolation, 'shop_android_installed_qa_isolation_shape_invalid')
  const isolation = plan.isolation
  assertSha(isolation.containmentId, 'shop_android_installed_qa_containment_invalid')
  if (!['127.0.0.1', '::1', 'localhost'].includes(isolation.adbHost)
      || isolation.adbTcpipEnabled !== false || isolation.adbListenAll !== false
      || isolation.providerAccessFromApp !== false || isolation.noEgress !== true
      || isolation.loopbackOnly !== true) fail('shop_android_installed_qa_isolation_invalid')
  exactKeys(plan.timing, EXACT_KEYS.timing, 'shop_android_installed_qa_timing_shape_invalid')
  const start = Date.parse(plan.timing.sessionStartedAt)
  const deadline = Date.parse(plan.timing.sessionDeadlineAt)
  if (!validIso(plan.timing.sessionStartedAt) || !validIso(plan.timing.sessionDeadlineAt)
      || deadline <= start || deadline - start > 6 * 60 * 60 * 1000
      || !Number.isInteger(plan.timing.maxStepDurationMs)
      || plan.timing.maxStepDurationMs < 1 || plan.timing.maxStepDurationMs > 5 * 60 * 1000) {
    fail('shop_android_installed_qa_timing_invalid')
  }
  exactKeys(plan.expected, EXACT_KEYS.expected, 'shop_android_installed_qa_expected_shape_invalid')
  for (const field of ['saleDelta', 'stockMovementDelta', 'receiptDelta', 'outboxDelta']) {
    if (plan.expected[field] !== 1) fail('shop_android_installed_qa_expected_delta_invalid')
  }
  if (plan.expected.onHandDelta !== -1 || !['none', 'abandoned'].includes(plan.expected.priorSessionState)) {
    fail('shop_android_installed_qa_expected_state_invalid')
  }
  if (plan.expected.priorSessionState === 'none') {
    if (plan.expected.priorSessionNonce !== null || plan.expected.recoveryReceiptSha256 !== null) {
      fail('shop_android_installed_qa_expected_recovery_invalid')
    }
  } else if (!NONCE.test(plan.expected.priorSessionNonce)
      || plan.expected.priorSessionNonce === plan.sessionNonce
      || !SHA64.test(plan.expected.recoveryReceiptSha256 || '')) {
    fail('shop_android_installed_qa_expected_recovery_invalid')
  }
  if (!/^shop\.catalog\.product\.[A-Za-z0-9_-]+$/.test(plan.expected.productSelector)) {
    fail('shop_android_installed_qa_product_selector_invalid')
  }
  for (const field of ['receiptBindingSha256', 'receiptRenderSha256', 'envelopeSha256']) {
    assertSha(plan.expected[field], `shop_android_installed_qa_${field}_invalid`)
  }
  exactKeys(plan.paths, EXACT_KEYS.paths, 'shop_android_installed_qa_paths_shape_invalid')
  assertSafePath(plan.paths.privateEnvelope, 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-', 'shop_android_installed_qa_private_envelope_path_invalid')
  if (!plan.paths.privateEnvelope.endsWith('.smqa')) fail('shop_android_installed_qa_private_envelope_path_invalid')
  if (plan.paths.privateReceiptSidecar !== 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-RECEIPTS-v1.json') {
    fail('shop_android_installed_qa_receipt_sidecar_path_invalid')
  }
  assertSafePath(plan.paths.stagingRoot, `supermega-shop-installed-qa/${plan.sessionNonce}/`, 'shop_android_installed_qa_staging_root_invalid')
  assertSafePath(plan.paths.stagedEnvelope, `${plan.paths.stagingRoot}`, 'shop_android_installed_qa_staged_envelope_path_invalid')
  if (!plan.paths.stagedEnvelope.endsWith('.smqa')) fail('shop_android_installed_qa_staged_envelope_path_invalid')
  exactKeys(plan.selectors, Object.keys(SHOP_ANDROID_INSTALLED_QA_SELECTORS), 'shop_android_installed_qa_selectors_shape_invalid')
  for (const [key, value] of Object.entries(SHOP_ANDROID_INSTALLED_QA_SELECTORS)) {
    if (plan.selectors[key] !== value) fail('shop_android_installed_qa_selector_binding_invalid')
  }
  return handoff
}

function identityFromHandoff(handoff) {
  const artifact = handoff.artifact
  return Object.freeze({
    packageId: artifact.applicationId,
    profileId: PROFILE_ID,
    headSha: artifact.headSha,
    sourceSha: artifact.sourceSha,
    mergeSha: artifact.mergeSha,
    nativeTree: artifact.nativeTree,
    runId: artifact.runId,
    artifactId: artifact.artifactId,
    archiveSha256: artifact.archiveSha256,
    apkSha256: artifact.apkSha256,
    signerSha256: artifact.signerCertificateSha256,
    manifestDigest: handoff.canonicalArtifactManifest.digest,
    handoffDigest: handoff.digest,
  })
}

function validateMetrics(value, code) {
  exactKeys(value, EXACT_KEYS.metrics, code)
  for (const key of EXACT_KEYS.metrics) {
    if (!Number.isInteger(value[key]) || value[key] < 0) fail(code)
  }
  return value
}

function exactData(value, keys, code) {
  rejectForbiddenKeys(value)
  exactKeys(value, keys, code)
  return value
}

function validateUi(data, selectors) {
  exactData(data, ['acted', 'selectorsUsed'], 'shop_android_installed_qa_ui_observation_invalid')
  if (data.acted !== true || !Array.isArray(data.selectorsUsed)
      || data.selectorsUsed.join('\n') !== selectors.join('\n')) {
    fail('shop_android_installed_qa_ui_observation_invalid')
  }
}

function validateStep(kind, data, plan, state) {
  const e = plan.expected
  const p = plan.paths
  if (kind === 'target') {
    exactData(data, ['containmentId', 'adbHost', 'adbTcpipEnabled', 'adbListenAll', 'providerAccessFromApp', 'noEgress', 'loopbackOnly'], 'shop_android_installed_qa_target_observation_invalid')
    if (canonical(data) !== canonical(plan.isolation)) fail('shop_android_installed_qa_target_isolation_drift')
  } else if (kind === 'recovery') {
    exactData(data, ['priorSessionState', 'priorSessionNonce', 'targetId', 'containmentId', 'recoveryReceiptSha256', 'staleLockReleased', 'externalStageDeleted', 'privateEvidenceDeleted', 'recoveredAt'], 'shop_android_installed_qa_recovery_invalid')
    if (data.priorSessionState !== e.priorSessionState) fail('shop_android_installed_qa_recovery_state_mismatch')
    if (data.priorSessionState === 'abandoned') {
      if (data.priorSessionNonce !== e.priorSessionNonce || data.targetId !== plan.targetId
          || data.containmentId !== plan.isolation.containmentId
          || data.recoveryReceiptSha256 !== e.recoveryReceiptSha256
          || data.staleLockReleased !== true || data.externalStageDeleted !== true
          || data.privateEvidenceDeleted !== true || !validIso(data.recoveredAt)
          || Date.parse(data.recoveredAt) < Date.parse(plan.timing.sessionStartedAt)
          || Date.parse(data.recoveredAt) > Date.parse(plan.timing.sessionDeadlineAt)) {
        fail('shop_android_installed_qa_recovery_receipt_invalid')
      }
    } else if (data.priorSessionNonce !== null || data.targetId !== plan.targetId
        || data.containmentId !== plan.isolation.containmentId
        || data.recoveryReceiptSha256 !== null || data.staleLockReleased !== false
        || data.externalStageDeleted !== false || data.privateEvidenceDeleted !== false
        || data.recoveredAt !== null) fail('shop_android_installed_qa_recovery_receipt_invalid')
  } else if (kind === 'lock') {
    exactData(data, ['acquired', 'concurrentOwner', 'lockToken'], 'shop_android_installed_qa_lock_invalid')
    assertSha(data.lockToken, 'shop_android_installed_qa_lock_invalid')
    if (data.acquired !== true || data.concurrentOwner !== false) fail('shop_android_installed_qa_target_locked')
    state.lockToken = data.lockToken
  } else if (kind === 'artifact') {
    exactData(data, ['packageId', 'profileId', 'apkSha256', 'signerSha256', 'manifestDigest', 'handoffDigest', 'debuggable', 'productionSigned'], 'shop_android_installed_qa_artifact_observation_invalid')
    const a = state.identity
    if (data.packageId !== a.packageId || data.profileId !== a.profileId
        || data.apkSha256 !== a.apkSha256 || data.signerSha256 !== a.signerSha256
        || data.manifestDigest !== a.manifestDigest || data.handoffDigest !== a.handoffDigest
        || data.debuggable !== true || data.productionSigned !== false) {
      fail('shop_android_installed_qa_artifact_substitution')
    }
  } else if (kind === 'metrics_pre') {
    state.pre = validateMetrics(data, 'shop_android_installed_qa_pre_metrics_invalid')
  } else if (kind === 'metrics_post') {
    state.post = validateMetrics(data, 'shop_android_installed_qa_post_metrics_invalid')
    const deltas = {
      sales: e.saleDelta, stockMovements: e.stockMovementDelta,
      receipts: e.receiptDelta, outbox: e.outboxDelta,
      onHand: e.onHandDelta, shifts: 0,
    }
    for (const key of EXACT_KEYS.metrics) {
      if (state.post[key] - state.pre[key] !== deltas[key]) fail('shop_android_installed_qa_sale_delta_invalid')
    }
  } else if (kind === 'metrics_restored') {
    const restored = validateMetrics(data, 'shop_android_installed_qa_restored_metrics_invalid')
    if (canonical(restored) !== canonical(state.post)) fail('shop_android_installed_qa_restored_metrics_mismatch')
    state.restored = restored
  } else if (kind === 'ui_start') {
    validateUi(data, [plan.selectors.startNew, plan.selectors.startNewConfirm])
  } else if (kind === 'ui_product') {
    validateUi(data, [plan.selectors.emptyAdd, plan.selectors.productName,
      plan.selectors.productCategory, plan.selectors.productPrice,
      plan.selectors.productStock, plan.selectors.barcodeReveal,
      plan.selectors.barcode, plan.selectors.productSave])
  } else if (kind === 'ui_sale') {
    exactData(data, ['acted', 'productSelector', 'selectorsUsed'], 'shop_android_installed_qa_ui_observation_invalid')
    if (data.acted !== true || data.productSelector !== e.productSelector
        || data.selectorsUsed.join('\n') !== [plan.selectors.cartReview, plan.selectors.checkoutCash,
          plan.selectors.cashGiven, plan.selectors.cashConfirm, plan.selectors.saleCompletion].join('\n')) {
      fail('shop_android_installed_qa_ui_observation_invalid')
    }
  } else if (kind === 'ui_reprint') {
    validateUi(data, [plan.selectors.openRecentSales, plan.selectors.savedReceipt, plan.selectors.savedReceiptReprint])
  } else if (kind === 'ui_restore') {
    validateUi(data, [plan.selectors.restoreChoose, plan.selectors.restorePassword, plan.selectors.restoreConfirm])
  } else if (kind === 'ui_backup') {
    validateUi(data, [plan.selectors.backupPassword, plan.selectors.backupPasswordConfirm, plan.selectors.backupExport])
  } else if (kind === 'receipt_one' || kind === 'receipt_two' || kind === 'receipt_restored') {
    exactData(data, ['captureCount', 'receiptBindingSha256', 'receiptRenderSha256', 'sidecarPath'], 'shop_android_installed_qa_receipt_observation_invalid')
    const expectedCount = kind === 'receipt_two' ? 2 : 1
    if (data.captureCount !== expectedCount || data.receiptBindingSha256 !== e.receiptBindingSha256
        || data.receiptRenderSha256 !== e.receiptRenderSha256
        || data.sidecarPath !== p.privateReceiptSidecar) fail('shop_android_installed_qa_receipt_binding_invalid')
  } else if (kind === 'lifecycle') {
    exactData(data, ['completed', 'packageId'], 'shop_android_installed_qa_lifecycle_invalid')
    if (data.completed !== true || data.packageId !== PACKAGE_ID) fail('shop_android_installed_qa_lifecycle_invalid')
  } else if (kind === 'private_export') {
    exactData(data, ['envelopePath', 'envelopeSha256', 'inventoryCount', 'regularFile', 'symlink'], 'shop_android_installed_qa_private_export_invalid')
    if (data.envelopePath !== p.privateEnvelope || data.envelopeSha256 !== e.envelopeSha256
        || data.inventoryCount !== 1 || data.regularFile !== true || data.symlink !== false) fail('shop_android_installed_qa_private_export_invalid')
  } else if (kind === 'stage') {
    exactData(data, ['sourcePath', 'destinationPath', 'sourceSha256', 'destinationSha256', 'inventoryCount', 'regularFile', 'symlink'], 'shop_android_installed_qa_stage_invalid')
    if (data.sourcePath !== p.privateEnvelope || data.destinationPath !== p.stagedEnvelope
        || data.sourceSha256 !== e.envelopeSha256 || data.destinationSha256 !== e.envelopeSha256
        || data.inventoryCount !== 1 || data.regularFile !== true || data.symlink !== false) fail('shop_android_installed_qa_stage_invalid')
  } else if (kind === 'clear') {
    exactData(data, ['packageId', 'cleared'], 'shop_android_installed_qa_clear_invalid')
    if (data.packageId !== PACKAGE_ID || data.cleared !== true) fail('shop_android_installed_qa_clear_invalid')
  } else if (kind === 'cleared') {
    exactData(data, ['privateSourceExists', 'receiptSidecarExists', 'stagedExists', 'stagedSha256', 'stagedInventoryCount', 'stagedRegularFile', 'stagedSymlink'], 'shop_android_installed_qa_clear_observation_invalid')
    if (data.privateSourceExists !== false || data.receiptSidecarExists !== false
        || data.stagedExists !== true || data.stagedSha256 !== e.envelopeSha256
        || data.stagedInventoryCount !== 1 || data.stagedRegularFile !== true
        || data.stagedSymlink !== false) fail('shop_android_installed_qa_clear_observation_invalid')
  } else if (kind === 'restore_copy') {
    exactData(data, ['sourcePath', 'destinationPath', 'sourceSha256', 'destinationSha256', 'regularFile', 'symlink'], 'shop_android_installed_qa_restore_copy_invalid')
    if (data.sourcePath !== p.stagedEnvelope || data.destinationPath !== p.privateEnvelope
        || data.sourceSha256 !== e.envelopeSha256 || data.destinationSha256 !== e.envelopeSha256
        || data.regularFile !== true || data.symlink !== false) fail('shop_android_installed_qa_restore_copy_invalid')
  } else fail('shop_android_installed_qa_step_kind_invalid')
}

function validateCommon(observation, request, plan, state) {
  rejectForbiddenKeys(observation)
  exactKeys(observation, EXACT_KEYS.common, 'shop_android_installed_qa_observation_shape_invalid')
  if (observation.contract !== SHOP_ANDROID_INSTALLED_QA_PROTOCOL
      || observation.sessionNonce !== plan.sessionNonce || observation.targetId !== plan.targetId
      || observation.sequence !== request.sequence || observation.step !== request.step
      || observation.requestDigest !== request.requestDigest
      || observation.previousAck !== request.previousAck || observation.status !== 'PASS') {
    fail('shop_android_installed_qa_observation_binding_invalid')
  }
  if (request.sequence >= 3 && observation.lockToken !== state.lockToken) {
    fail('shop_android_installed_qa_lock_binding_invalid')
  }
  if (request.sequence < 3 && observation.lockToken !== null) {
    fail('shop_android_installed_qa_lock_binding_invalid')
  }
  if (!validIso(observation.startedAt) || !validIso(observation.completedAt)) {
    fail('shop_android_installed_qa_observation_time_invalid')
  }
  const started = Date.parse(observation.startedAt)
  const completed = Date.parse(observation.completedAt)
  const sessionStart = Date.parse(plan.timing.sessionStartedAt)
  const sessionDeadline = Date.parse(plan.timing.sessionDeadlineAt)
  if (started < sessionStart || started < state.lastCompletedAt || completed < started
      || completed > sessionDeadline || completed > Date.parse(request.deadlineAt)
      || completed - started > plan.timing.maxStepDurationMs) {
    fail('shop_android_installed_qa_observation_time_invalid')
  }
  state.lastCompletedAt = completed
}

function makeRequest(plan, state, sequence, step, reasonCode = null, hostBudget = false) {
  const operationDeadline = Math.min(
    (hostBudget ? Date.now() : state.lastCompletedAt) + plan.timing.maxStepDurationMs,
    Date.parse(plan.timing.sessionDeadlineAt),
  )
  const request = {
    contract: SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
    sessionNonce: plan.sessionNonce,
    targetId: plan.targetId,
    sequence,
    step,
    previousAck: state.previousAck,
    deadlineAt: new Date(operationDeadline).toISOString(),
    reasonCode,
  }
  return Object.freeze({ ...request, requestDigest: sha256(request) })
}

function sanitizedReceipt(observation) {
  return {
    step: observation.step,
    status: observation.status,
    durationMs: Date.parse(observation.completedAt) - Date.parse(observation.startedAt),
    acknowledgementSha256: sha256(observation),
  }
}

async function observeBounded(adapter, request, plan) {
  const remaining = Math.min(
    Date.parse(request.deadlineAt) - Date.now(),
    plan.timing.maxStepDurationMs,
  )
  if (remaining <= 0) fail('shop_android_installed_qa_operation_timeout')
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort('shop_android_installed_qa_operation_timeout')
      const error = new Error('shop_android_installed_qa_operation_timeout')
      error.code = 'shop_android_installed_qa_operation_timeout'
      error.operationOutcome = 'UNKNOWN'
      error.timedOutRequest = { sequence: request.sequence, requestDigest: request.requestDigest }
      reject(error)
    }, remaining)
  })
  try {
    return await Promise.race([adapter.observe(request, { signal: controller.signal }), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function cleanup(adapter, plan, state, reasonCode) {
  const sequence = STEP_DEFINITIONS.length
    + (state.operationOutcome === 'NOT_APPLICABLE' ? 0 : 1)
  const request = makeRequest(plan, state, sequence, 'cleanup_and_release', reasonCode, true)
  const observation = await observeBounded(adapter, request, plan)
  validateCommon(observation, request, plan, state)
  const data = exactData(observation.data,
    ['cleanupReceiptSha256', 'externalStageDeleted', 'privateEvidenceDeleted', 'lockReleased', 'operationOutcome', 'reasonCode'],
    'shop_android_installed_qa_cleanup_invalid')
  assertSha(data.cleanupReceiptSha256, 'shop_android_installed_qa_cleanup_receipt_invalid')
  if (data.externalStageDeleted !== true || data.privateEvidenceDeleted !== true
      || data.lockReleased !== true || data.operationOutcome !== state.operationOutcome
      || data.reasonCode !== reasonCode) {
    fail('shop_android_installed_qa_cleanup_invalid')
  }
  return sanitizedReceipt(observation)
}

async function abortAndJoin(adapter, plan, state, timedOutRequest) {
  const request = makeRequest(plan, state, STEP_DEFINITIONS.length,
    'abort_and_join_timed_out_operation', 'operation_timeout', true)
  const observation = await observeBounded(adapter, request, plan)
  validateCommon(observation, request, plan, state)
  const data = exactData(observation.data,
    ['aborted', 'joined', 'outcome', 'timedOutRequestDigest', 'timedOutSequence'],
    'shop_android_installed_qa_abort_ack_invalid')
  if (data.aborted !== true || data.joined !== true || data.outcome !== 'ABORTED'
      || data.timedOutRequestDigest !== timedOutRequest.requestDigest
      || data.timedOutSequence !== timedOutRequest.sequence) fail('shop_android_installed_qa_abort_ack_invalid')
  state.operationOutcome = 'ABORTED'
  const receipt = sanitizedReceipt(observation)
  state.previousAck = receipt.acknowledgementSha256
  return receipt
}

export async function runShopAndroidInstalledQaProtocol(inputPlan, adapter) {
  const plan = immutableSnapshot(inputPlan)
  const handoff = validatePlan(plan, Date.now())
  if (!adapter || typeof adapter.observe !== 'function') {
    fail('shop_android_installed_qa_adapter_invalid')
  }
  if (Date.now() > Date.parse(plan.timing.sessionDeadlineAt)) {
    fail('shop_android_installed_qa_session_expired')
  }
  const state = {
    previousAck: '0'.repeat(64), lockToken: null,
    lastCompletedAt: Date.parse(plan.timing.sessionStartedAt),
    seenRequestDigests: new Set(), pre: null, post: null, restored: null,
    identity: identityFromHandoff(handoff), operationOutcome: 'NOT_APPLICABLE',
  }
  const receipts = []
  let failure = null
  try {
    for (let sequence = 0; sequence < STEP_DEFINITIONS.length; sequence += 1) {
      const [step, kind] = STEP_DEFINITIONS[sequence]
      const request = makeRequest(plan, state, sequence, step)
      if (state.seenRequestDigests.has(request.requestDigest)) fail('shop_android_installed_qa_request_replay')
      state.seenRequestDigests.add(request.requestDigest)
      const observation = await observeBounded(adapter, request, plan)
      if (step === 'acquire_target_lock' && observation?.data?.acquired === true
          && SHA64.test(observation.data.lockToken || '')) {
        state.lockToken = observation.data.lockToken
      }
      validateCommon(observation, request, plan, state)
      validateStep(kind, observation.data, plan, state)
      const receipt = sanitizedReceipt(observation)
      state.previousAck = receipt.acknowledgementSha256
      receipts.push(receipt)
    }
  } catch (error) {
    failure = error
  }
  if (failure?.operationOutcome === 'UNKNOWN') {
    try {
      receipts.push(await abortAndJoin(adapter, plan, state, failure.timedOutRequest))
      failure.operationOutcome = 'ABORTED'
    } catch {
      state.operationOutcome = 'UNKNOWN'
    }
  }
  const reasonCode = failure?.code || 'completed'
  let cleanupReceipt
  try {
    cleanupReceipt = await cleanup(adapter, plan, state, reasonCode)
  } catch (cleanupError) {
    const error = new Error(`shop_android_installed_qa_cleanup_failed:${reasonCode}:${cleanupError.code || 'unknown'}`)
    error.code = 'shop_android_installed_qa_cleanup_failed'
    error.cleanupOutcome = 'UNKNOWN'
    error.lockReleaseProven = false
    throw error
  }
  if (failure) {
    if (state.operationOutcome === 'UNKNOWN') {
      const error = new Error('shop_android_installed_qa_timed_out_operation_unsettled')
      error.code = 'shop_android_installed_qa_cleanup_failed'
      error.cleanupOutcome = 'UNKNOWN'
      error.lockReleaseProven = false
      throw error
    }
    failure.cleanupReceipt = cleanupReceipt
    throw failure
  }
  const result = {
    contract: SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
    status: 'PASS',
    sessionNonce: plan.sessionNonce,
    targetId: plan.targetId,
    artifact: {
      packageId: state.identity.packageId,
      headSha: state.identity.headSha,
      mergeSha: state.identity.mergeSha,
      apkSha256: state.identity.apkSha256,
      signerSha256: state.identity.signerSha256,
      sourceSha: state.identity.sourceSha,
      nativeTree: state.identity.nativeTree,
      runId: state.identity.runId,
      artifactId: state.identity.artifactId,
      archiveSha256: state.identity.archiveSha256,
      manifestDigest: state.identity.manifestDigest,
      handoffDigest: state.identity.handoffDigest,
    },
    counts: state.restored,
    receipts: [...receipts, cleanupReceipt],
  }
  return Object.freeze({ ...result, digest: sha256(result) })
}
