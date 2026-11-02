import { createHash } from 'node:crypto'

import {
  SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
  SHOP_ANDROID_INSTALLED_QA_SELECTORS,
} from './shop_android_installed_qa_protocol.mjs'
import { validateShopAndroidQaHandoff } from './shop_android_qa_handoff_validator.mjs'

const PACKAGE_ID = 'dev.supermega.supermega_shop.qa'
const SHA64 = /^[0-9a-f]{64}$/
const NONCE = /^[0-9a-f]{32,64}$/
const SAFE_SERIAL = /^[A-Za-z0-9._:-]{1,128}$/
const SAFE_ARG = /^[A-Za-z0-9_./:=+@,-]{1,512}$/
const ALLOWED_COMMANDS = new Set(['adb', 'apkanalyzer', 'apksigner', 'sha256sum', 'ss'])
const SENSITIVE_IO_CONTRACT = 'supermega.shop.android-installed-qa-sensitive-executor.v1'
const LOCK_RELEASE_CONTRACT = 'supermega.shop.android-installed-qa-lock-release.v1'
const RECEIPT_CONTRACT = 'supermega.shop.qa-loopback-receipt.v1'

const UI_SELECTORS = Object.freeze({
  ui_start_new: ['startNew', 'startNewConfirm'],
  ui_create_product: ['emptyAdd', 'productName', 'productCategory', 'productPrice', 'productStock', 'barcodeReveal', 'barcode', 'productSave'],
  ui_commit_sale: ['cartReview', 'checkoutCash', 'cashGiven', 'cashConfirm', 'saleCompletion'],
  ui_reprint_before_restart: ['openRecentSales', 'savedReceipt', 'savedReceiptReprint'],
  ui_reprint_after_restart: ['openRecentSales', 'savedReceipt', 'savedReceiptReprint'],
  ui_export_backup: ['backupPassword', 'backupPasswordConfirm', 'backupExport'],
  ui_restore_fresh_profile: ['restoreChoose', 'restorePassword', 'restoreConfirm'],
  ui_reprint_restored_receipt: ['openRecentSales', 'savedReceipt', 'savedReceiptReprint'],
})

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function sha256(value) {
  return createHash('sha256').update(
    value && typeof value === 'object' && !Buffer.isBuffer(value)
      ? JSON.stringify(value) : value,
  ).digest('hex')
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\n') !== [...keys].sort().join('\n')) fail(code)
}

function safePath(value, prefix, suffix = '') {
  return typeof value === 'string' && value.startsWith(prefix) && value.endsWith(suffix)
    && !value.includes('..') && !value.includes('//') && /^[A-Za-z0-9_./-]+$/.test(value)
}

function futureIso(value, nowMillis) {
  if (typeof value !== 'string' || !Number.isFinite(nowMillis)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    && parsed > nowMillis
}

function text(output) {
  return Buffer.isBuffer(output) ? output.toString('utf8') : String(output ?? '')
}

function immutableSnapshot(value) {
  const copy = structuredClone(value)
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item
    for (const child of Object.values(item)) freeze(child)
    return Object.freeze(item)
  }
  return freeze(copy)
}

export class ShopAndroidInstalledQaAdbAdapter {
  constructor({ plan, serial, apkPath, authorizationVerifier, executor, uiDriver,
    metricsObserver, recoveryObserver, clock = { now: () => Date.now() } }) {
    if (!plan || plan.contract !== SHOP_ANDROID_INSTALLED_QA_PROTOCOL
        || !NONCE.test(plan.sessionNonce) || !SHA64.test(plan.targetId)
        || !SAFE_SERIAL.test(serial) || !safePath(apkPath, '/')) {
      fail('shop_android_adb_adapter_configuration_invalid')
    }
    this.plan = immutableSnapshot(plan)
    let handoff
    try { handoff = validateShopAndroidQaHandoff(this.plan.handoff, { nowMillis: clock.now() }) } catch {
      fail('shop_android_adb_adapter_handoff_invalid')
    }
    if (handoff.artifact.applicationId !== PACKAGE_ID
        || typeof authorizationVerifier !== 'function'
        || typeof executor?.run !== 'function' || typeof executor?.runSensitive !== 'function'
        || executor?.sensitiveIoContract !== SENSITIVE_IO_CONTRACT
        || typeof executor?.releaseOwnedLock !== 'function'
        || executor?.lockReleaseContract !== LOCK_RELEASE_CONTRACT
        || typeof executor?.abortAndJoin !== 'function'
        || typeof uiDriver?.act !== 'function' || typeof metricsObserver?.observe !== 'function'
        || typeof recoveryObserver?.observe !== 'function' || typeof clock?.now !== 'function') {
      fail('shop_android_adb_adapter_dependency_missing')
    }
    this.serial = serial
    this.apkPath = apkPath
    this.handoff = immutableSnapshot(handoff)
    this.authorizationVerifier = authorizationVerifier
    this.executor = executor
    this.uiDriver = uiDriver
    this.metricsObserver = metricsObserver
    this.recoveryObserver = recoveryObserver
    this.clock = clock
    this.lockToken = null
    this.lockOwned = false
    this.operationOutcome = 'NOT_APPLICABLE'
    this.activeRequest = null
    this.envelope = null
    this.stageRoot = `/data/local/tmp/${this.plan.paths.stagingRoot.replace(/\/$/, '')}`
    this.stagedEnvelope = `/data/local/tmp/${this.plan.paths.stagedEnvelope}`
    this.lockPath = `/data/local/tmp/supermega-shop-installed-qa/${this.plan.targetId}.lock`
    if (!safePath(this.stageRoot, `/data/local/tmp/supermega-shop-installed-qa/${this.plan.sessionNonce}`)
        || !safePath(this.stagedEnvelope, `${this.stageRoot}/`, '.smqa')) {
      fail('shop_android_adb_adapter_stage_path_invalid')
    }
  }

  async observe(request, { signal } = {}) {
    this.#request(request, signal)
    const authorization = await this.authorizationVerifier({
      targetId: request.targetId, containmentId: this.plan.isolation.containmentId,
      sessionNonce: request.sessionNonce, nowMillis: this.clock.now(), signal,
    })
    exactKeys(authorization, ['adbListenAll', 'adbTcpipEnabled', 'authorized', 'containmentId', 'expiresAt', 'loopbackOnly', 'noEgress', 'providerAccessFromApp', 'targetId'], 'shop_android_adb_authorization_invalid')
    if (authorization.authorized !== true || authorization.targetId !== request.targetId
        || authorization.containmentId !== this.plan.isolation.containmentId
        || authorization.adbTcpipEnabled !== false || authorization.adbListenAll !== false
        || authorization.providerAccessFromApp !== false || authorization.noEgress !== true
        || authorization.loopbackOnly !== true
        || !futureIso(authorization.expiresAt, this.clock.now())) fail('shop_android_adb_authorization_invalid')
    const authorityDigest = sha256(authorization)
    const startedAt = new Date(this.clock.now()).toISOString()
    const special = ['abort_and_join_timed_out_operation', 'cleanup_and_release'].includes(request.step)
    if (!special) this.activeRequest = request
    let data
    try {
      data = await this.#step(request, signal, authorityDigest)
    } catch (error) {
      if (!special && !signal.aborted && this.activeRequest === request) this.activeRequest = null
      throw error
    }
    if (!special && this.activeRequest === request) this.activeRequest = null
    return {
      contract: request.contract, sessionNonce: request.sessionNonce,
      targetId: request.targetId, sequence: request.sequence, step: request.step,
      requestDigest: request.requestDigest, previousAck: request.previousAck,
      startedAt, completedAt: new Date(this.clock.now()).toISOString(), status: 'PASS',
      lockToken: request.sequence >= 3 || request.step === 'cleanup_and_release'
        || request.step === 'abort_and_join_timed_out_operation' ? this.lockToken : null,
      data,
    }
  }

  #request(request, signal) {
    if (!request || request.contract !== SHOP_ANDROID_INSTALLED_QA_PROTOCOL
        || request.sessionNonce !== this.plan.sessionNonce || request.targetId !== this.plan.targetId
        || !Number.isInteger(request.sequence) || !SHA64.test(request.requestDigest)
        || !SHA64.test(request.previousAck) || typeof request.step !== 'string'
        || !futureIso(request.deadlineAt, this.clock.now())
        || !signal || typeof signal.aborted !== 'boolean') fail('shop_android_adb_request_invalid')
  }

  async #run(command, args, signal, { stdin } = {}) {
    if (stdin !== undefined) fail('shop_android_adb_sensitive_io_required')
    if (!ALLOWED_COMMANDS.has(command) || !Array.isArray(args) || args.some((arg) =>
      typeof arg !== 'string' || !SAFE_ARG.test(arg))) fail('shop_android_adb_command_forbidden')
    const result = await this.executor.run(command, [...args], { signal, stdin })
    exactKeys(result, ['abortedAndJoined', 'exitCode', 'stderr', 'stdout'], 'shop_android_adb_command_result_invalid')
    if (!Number.isInteger(result.exitCode) || result.abortedAndJoined !== true) {
      fail('shop_android_adb_command_unsettled')
    }
    return result
  }

  async #runSensitive(command, args, signal, { input = null } = {}) {
    if (!ALLOWED_COMMANDS.has(command) || !Array.isArray(args) || args.some((arg) =>
      typeof arg !== 'string' || !SAFE_ARG.test(arg))) fail('shop_android_adb_command_forbidden')
    const result = await this.executor.runSensitive(command, [...args], {
      signal, input, contract: SENSITIVE_IO_CONTRACT,
    })
    exactKeys(result, ['abortedAndJoined', 'exitCode', 'stderr', 'stdout'], 'shop_android_adb_command_result_invalid')
    if (!Number.isInteger(result.exitCode) || result.abortedAndJoined !== true) {
      fail('shop_android_adb_command_unsettled')
    }
    return result
  }

  #adb(args, signal, options) {
    return this.#run('adb', ['-s', this.serial, ...args], signal, options)
  }

  #adbSensitive(args, signal, options) {
    return this.#runSensitive('adb', ['-s', this.serial, ...args], signal, options)
  }

  async #step(request, signal, authorityDigest) {
    const step = request.step
    if (step === 'observe_target' || step === 'reobserve_runtime_isolation') return this.#target(signal)
    if (step === 'recover_prior_session') return this.#recovery(request, signal, authorityDigest)
    if (step === 'acquire_target_lock') return this.#lock(signal)
    if (step === 'verify_installed_artifact') return this.#artifact(signal)
    if (['observe_pre_sale', 'observe_post_sale', 'observe_restored_state'].includes(step)) {
      const observation = await this.metricsObserver.observe({ step, requestDigest: request.requestDigest,
        authorityDigest, signal })
      exactKeys(observation, ['authorityDigest', 'counts', 'requestDigest'], 'shop_android_adb_metrics_invalid')
      if (observation.authorityDigest !== authorityDigest
          || observation.requestDigest !== request.requestDigest) fail('shop_android_adb_metrics_invalid')
      const value = observation.counts
      exactKeys(value, ['onHand', 'outbox', 'receipts', 'sales', 'shifts', 'stockMovements'], 'shop_android_adb_metrics_invalid')
      if (Object.values(value).some((item) => !Number.isInteger(item) || item < 0)) fail('shop_android_adb_metrics_invalid')
      return value
    }
    if (UI_SELECTORS[step]) return this.#ui(step, request, signal, authorityDigest)
    if (step.startsWith('observe_receipt_') || step === 'observe_restored_receipt') {
      return this.#receipt(signal)
    }
    if (step === 'force_stop') return this.#forceStop(signal)
    if (step === 'reopen') return this.#reopen(signal)
    if (step === 'export_private_evidence') return this.#export(signal)
    if (step === 'stage_envelope_external') return this.#stage(signal)
    if (step === 'verify_external_stage') return this.#verifyStage(signal)
    if (step === 'clear_package_data') return this.#clear(signal)
    if (step === 'observe_after_clear') return this.#afterClear(signal)
    if (step === 'restore_envelope_to_fresh_profile') return this.#restore(signal)
    if (step === 'abort_and_join_timed_out_operation') return this.#abort(request, signal)
    if (step === 'cleanup_and_release') return this.#cleanup(request, signal)
    const error = new Error('shop_android_adb_step_unsupported')
    error.code = 'shop_android_adb_step_unsupported'
    error.step = step
    throw error
  }

  async #target(signal) {
    const [state, tcp, sockets] = await Promise.all([
      this.#adb(['get-state'], signal),
      this.#adb(['shell', 'getprop', 'service.adb.tcp.port'], signal),
      this.#run('ss', ['-ltnp'], signal),
    ])
    if (state.exitCode !== 0 || text(state.stdout).trim() !== 'device'
        || tcp.exitCode !== 0 || !['', '-1'].includes(text(tcp.stdout).trim())
        || sockets.exitCode !== 0
        || text(sockets.stdout).split('\n').some((line) => line.includes(':5037')
          && !line.includes('127.0.0.1:5037') && !line.includes('[::1]:5037'))) {
      fail('shop_android_adb_isolation_unproven')
    }
    return { ...this.plan.isolation }
  }

  async #recovery(request, signal, authorityDigest) {
    const observation = await this.recoveryObserver.observe({ request,
      requestDigest: request.requestDigest, authorityDigest, signal })
    exactKeys(observation, ['authorityDigest', 'recovery', 'requestDigest'], 'shop_android_adb_recovery_invalid')
    if (observation.authorityDigest !== authorityDigest
        || observation.requestDigest !== request.requestDigest) fail('shop_android_adb_recovery_invalid')
    return observation.recovery
  }

  async #lock(signal) {
    const result = await this.#adb(['shell', 'mkdir', this.lockPath], signal)
    const candidateToken = sha256(`${this.plan.targetId}:${this.plan.sessionNonce}:${this.lockPath}`)
    if (result.exitCode !== 0) {
      this.lockToken = null
      return { acquired: false, concurrentOwner: true, lockToken: candidateToken }
    }
    this.lockToken = candidateToken
    const ownerPath = `${this.lockPath}/owner`
    const written = await this.#adbSensitive(['exec-in', 'shell', 'tee', ownerPath], signal,
      { input: Buffer.from(this.lockToken, 'utf8') })
    const owner = await this.#adbSensitive(['exec-out', 'cat', ownerPath], signal)
    if (written.exitCode !== 0 || owner.exitCode !== 0
        || text(owner.stdout).trim() !== this.lockToken) fail('shop_android_adb_lock_unproven')
    this.lockOwned = true
    return { acquired: true, concurrentOwner: false, lockToken: this.lockToken }
  }

  async #artifact(signal) {
    const artifact = this.handoff.artifact
    const [hash, appId, manifest, signing, installed] = await Promise.all([
      this.#run('sha256sum', [this.apkPath], signal),
      this.#run('apkanalyzer', ['manifest', 'application-id', this.apkPath], signal),
      this.#run('apkanalyzer', ['manifest', 'print', this.apkPath], signal),
      this.#run('apksigner', ['verify', '--verbose', '--print-certs', this.apkPath], signal),
      this.#adb(['shell', 'pm', 'path', PACKAGE_ID], signal),
    ])
    const signers = [...text(signing.stdout).matchAll(/certificate SHA-256 digest:\s*([0-9a-f]{64})/ig)]
      .map((match) => match[1].toLowerCase())
    const installedPaths = text(installed.stdout).trim().split('\n')
      .filter(Boolean).map((line) => line.startsWith('package:') ? line.slice(8) : '')
    if (installedPaths.length !== 1 || !safePath(installedPaths[0], '/data/app/', '/base.apk')) {
      fail('shop_android_adb_artifact_unproven')
    }
    const installedBytes = await this.#adbSensitive(['exec-out', 'cat', installedPaths[0]], signal)
    if ([hash, appId, manifest, signing, installed].some((item) => item.exitCode !== 0)
        || text(hash.stdout).trim().split(/\s+/)[0] !== artifact.apkSha256
        || text(appId.stdout).trim() !== PACKAGE_ID || signers.length !== 1
        || signers[0] !== artifact.signerCertificateSha256
        || !text(manifest.stdout).includes('android:debuggable="true"')
        || installedBytes.exitCode !== 0 || !Buffer.isBuffer(installedBytes.stdout)
        || sha256(installedBytes.stdout) !== artifact.apkSha256) fail('shop_android_adb_artifact_unproven')
    return {
      packageId: PACKAGE_ID, profileId: 'synthetic_qa_v1', apkSha256: artifact.apkSha256,
      signerSha256: artifact.signerCertificateSha256,
      manifestDigest: this.handoff.canonicalArtifactManifest.digest,
      handoffDigest: this.handoff.digest, debuggable: true, productionSigned: false,
    }
  }

  async #ui(step, request, signal, authorityDigest) {
    const selectors = UI_SELECTORS[step].map((key) => SHOP_ANDROID_INSTALLED_QA_SELECTORS[key])
    for (const [transitionIndex, selector] of selectors.entries()) {
      const before = await this.#adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], signal)
      if (before.exitCode !== 0) fail('shop_android_adb_ui_identifiers_unavailable')
      const matches = text(before.stdout).split(`resource-id="${selector}"`).length - 1
      if (matches !== 1) fail('shop_android_adb_ui_identifiers_unavailable')
      const beforeUiDigest = sha256(text(before.stdout))
      const result = await this.uiDriver.act({ step, selector, transitionIndex,
        requestDigest: request.requestDigest, authorityDigest, beforeUiDigest, signal })
      exactKeys(result, ['acted', 'afterUiDigest', 'authorityDigest', 'beforeUiDigest',
        'requestDigest', 'selector'], 'shop_android_adb_ui_result_invalid')
      const after = await this.#adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], signal)
      if (result.acted !== true || result.selector !== selector
          || result.requestDigest !== request.requestDigest
          || result.authorityDigest !== authorityDigest
          || result.beforeUiDigest !== beforeUiDigest || after.exitCode !== 0
          || result.afterUiDigest === beforeUiDigest
          || result.afterUiDigest !== sha256(text(after.stdout))) fail('shop_android_adb_ui_result_invalid')
    }
    return step === 'ui_commit_sale'
      ? { acted: true, productSelector: this.plan.expected.productSelector, selectorsUsed: selectors }
      : { acted: true, selectorsUsed: selectors }
  }

  async #receipt(signal) {
    const path = this.plan.paths.privateReceiptSidecar
    const result = await this.#adbSensitive(['exec-out', 'run-as', PACKAGE_ID, 'cat', path], signal)
    if (result.exitCode !== 0) fail('shop_android_adb_receipt_unavailable')
    let source
    try { source = JSON.parse(text(result.stdout)) } catch { fail('shop_android_adb_receipt_invalid') }
    exactKeys(source, ['captures', 'contract', 'inventorySha256', 'platformIdentity', 'profileId'], 'shop_android_adb_receipt_invalid')
    if (source.contract !== RECEIPT_CONTRACT || source.profileId !== 'synthetic_qa_v1'
        || source.platformIdentity !== PACKAGE_ID || !Array.isArray(source.captures)
        || source.captures.length !== 1 || !SHA64.test(source.inventorySha256)) fail('shop_android_adb_receipt_invalid')
    const capture = source.captures[0]
    exactKeys(capture, ['captureCount', 'language', 'receiptBindingSha256', 'renderedReceiptSha256'], 'shop_android_adb_receipt_invalid')
    if (!Number.isInteger(capture.captureCount) || capture.captureCount < 1
        || !['en', 'my'].includes(capture.language)
        || !SHA64.test(capture.receiptBindingSha256)
        || !SHA64.test(capture.renderedReceiptSha256)
        || source.inventorySha256 !== sha256(source.captures)) fail('shop_android_adb_receipt_invalid')
    return { captureCount: capture.captureCount, receiptBindingSha256: capture.receiptBindingSha256,
      receiptRenderSha256: capture.renderedReceiptSha256, sidecarPath: path }
  }

  async #forceStop(signal) {
    const result = await this.#adb(['shell', 'am', 'force-stop', PACKAGE_ID], signal)
    if (result.exitCode !== 0) fail('shop_android_adb_force_stop_failed')
    return { completed: true, packageId: PACKAGE_ID }
  }

  async #reopen(signal) {
    const result = await this.#adb(['shell', 'monkey', '-p', PACKAGE_ID, '-c', 'android.intent.category.LAUNCHER', '1'], signal)
    if (result.exitCode !== 0) fail('shop_android_adb_reopen_failed')
    return { completed: true, packageId: PACKAGE_ID }
  }

  async #export(signal) {
    const parent = this.plan.paths.privateEnvelope.split('/').slice(0, -1).join('/')
    const [regular, noLink, inventory, result] = await Promise.all([
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-f', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-L', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'toybox', 'find', parent, '-mindepth', '1', '-maxdepth', '1', '-type', 'f'], signal),
      this.#adbSensitive(['exec-out', 'run-as', PACKAGE_ID, 'cat', this.plan.paths.privateEnvelope], signal),
    ])
    const envelopes = text(inventory.stdout).trim().split('\n').filter((path) => path.endsWith('.smqa'))
    if (regular.exitCode !== 0 || noLink.exitCode === 0 || inventory.exitCode !== 0
        || envelopes.length !== 1 || envelopes[0] !== this.plan.paths.privateEnvelope
        || result.exitCode !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0) fail('shop_android_adb_private_export_failed')
    this.envelope = Buffer.from(result.stdout)
    const digest = sha256(this.envelope)
    if (digest !== this.plan.expected.envelopeSha256) fail('shop_android_adb_private_export_failed')
    return { envelopePath: this.plan.paths.privateEnvelope, envelopeSha256: digest,
      inventoryCount: 1, regularFile: true, symlink: false }
  }

  async #stage(signal) {
    if (!this.envelope) fail('shop_android_adb_stage_source_missing')
    const made = await this.#adb(['shell', 'mkdir', '-p', this.stageRoot], signal)
    const written = await this.#adbSensitive(['exec-in', 'shell', 'tee', this.stagedEnvelope], signal,
      { input: this.envelope })
    if (made.exitCode !== 0 || written.exitCode !== 0) fail('shop_android_adb_stage_failed')
    return this.#stageProof(signal)
  }

  async #verifyStage(signal) { return this.#stageProof(signal) }

  async #stageProof(signal) {
    const [kind, noLink, digest, inventory] = await Promise.all([
      this.#adb(['shell', 'toybox', 'test', '-f', this.stagedEnvelope], signal),
      this.#adb(['shell', 'toybox', 'test', '-L', this.stagedEnvelope], signal),
      this.#adb(['shell', 'toybox', 'sha256sum', this.stagedEnvelope], signal),
      this.#adb(['shell', 'toybox', 'find', this.stageRoot, '-mindepth', '1', '-maxdepth', '1', '-type', 'f'], signal),
    ])
    const actual = text(digest.stdout).trim().split(/\s+/)[0]
    const files = text(inventory.stdout).trim().split('\n').filter(Boolean)
    if (kind.exitCode !== 0 || noLink.exitCode === 0
        || digest.exitCode !== 0 || actual !== this.plan.expected.envelopeSha256
        || inventory.exitCode !== 0 || files.length !== 1 || files[0] !== this.stagedEnvelope) fail('shop_android_adb_stage_proof_invalid')
    return { sourcePath: this.plan.paths.privateEnvelope, destinationPath: this.plan.paths.stagedEnvelope,
      sourceSha256: actual, destinationSha256: actual, inventoryCount: 1, regularFile: true, symlink: false }
  }

  async #clear(signal) {
    const result = await this.#adb(['shell', 'pm', 'clear', PACKAGE_ID], signal)
    if (result.exitCode !== 0 || !text(result.stdout).includes('Success')) fail('shop_android_adb_clear_failed')
    return { packageId: PACKAGE_ID, cleared: true }
  }

  async #afterClear(signal) {
    const [privateSource, sidecar, stage] = await Promise.all([
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-e', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-e', this.plan.paths.privateReceiptSidecar], signal),
      this.#stageProof(signal),
    ])
    if (privateSource.exitCode !== 1 || sidecar.exitCode !== 1) {
      fail('shop_android_adb_clear_absence_unproven')
    }
    return { privateSourceExists: false, receiptSidecarExists: false,
      stagedExists: true, stagedSha256: stage.destinationSha256, stagedInventoryCount: stage.inventoryCount,
      stagedRegularFile: stage.regularFile, stagedSymlink: stage.symlink }
  }

  async #restore(signal) {
    const source = await this.#adbSensitive(['exec-out', 'cat', this.stagedEnvelope], signal)
    const parent = this.plan.paths.privateEnvelope.split('/').slice(0, -1).join('/')
    const made = await this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'mkdir', '-p', parent], signal)
    const written = await this.#adbSensitive(['exec-in', 'run-as', PACKAGE_ID, 'tee', this.plan.paths.privateEnvelope], signal,
      { input: source.stdout })
    const [destination, regular, link] = await Promise.all([
      this.#adbSensitive(['exec-out', 'run-as', PACKAGE_ID, 'cat', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-f', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-L', this.plan.paths.privateEnvelope], signal),
    ])
    const digest = sha256(source.stdout)
    if (source.exitCode !== 0 || made.exitCode !== 0 || written.exitCode !== 0
        || destination.exitCode !== 0 || !Buffer.isBuffer(destination.stdout)
        || regular.exitCode !== 0 || link.exitCode !== 1
        || digest !== this.plan.expected.envelopeSha256
        || sha256(destination.stdout) !== digest) fail('shop_android_adb_restore_copy_failed')
    return { sourcePath: this.plan.paths.stagedEnvelope, destinationPath: this.plan.paths.privateEnvelope,
      sourceSha256: digest, destinationSha256: digest, regularFile: true, symlink: false }
  }

  async #abort(request, signal) {
    if (!this.activeRequest) fail('shop_android_adb_abort_ack_invalid')
    const timedOut = this.activeRequest
    const result = await this.executor.abortAndJoin({ targetId: request.targetId,
      timedOutRequestDigest: timedOut.requestDigest, timedOutSequence: timedOut.sequence, signal })
    exactKeys(result, ['aborted', 'joined', 'outcome', 'timedOutRequestDigest', 'timedOutSequence'], 'shop_android_adb_abort_ack_invalid')
    if (result.aborted !== true || result.joined !== true || result.outcome !== 'ABORTED'
        || result.timedOutRequestDigest !== timedOut.requestDigest
        || result.timedOutSequence !== timedOut.sequence) fail('shop_android_adb_abort_ack_invalid')
    this.operationOutcome = 'ABORTED'
    this.activeRequest = null
    return result
  }

  async #cleanup(request, signal) {
    if (this.activeRequest) fail('shop_android_adb_cleanup_unproven')
    const results = [
      await this.#adb(['shell', 'rm', '-f', this.stagedEnvelope], signal),
      await this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'rm', '-f', this.plan.paths.privateEnvelope,
        this.plan.paths.privateReceiptSidecar], signal),
      await this.#adb(['shell', 'rmdir', this.stageRoot], signal),
    ]
    if (this.lockOwned) {
      const released = await this.executor.releaseOwnedLock({ path: this.lockPath,
        ownerToken: this.lockToken, signal, contract: LOCK_RELEASE_CONTRACT })
      exactKeys(released, ['lockAbsent', 'ownerMatched', 'released'], 'shop_android_adb_cleanup_foreign_lock')
      if (released.ownerMatched !== true || released.released !== true
          || released.lockAbsent !== true) fail('shop_android_adb_cleanup_foreign_lock')
    }
    if (results.some((result) => result.exitCode !== 0)) fail('shop_android_adb_cleanup_unproven')
    const [stageAbsent, privateAbsent, sidecarAbsent, lockAbsent] = await Promise.all([
      this.#adb(['shell', 'test', '-e', this.stageRoot], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-e', this.plan.paths.privateEnvelope], signal),
      this.#adb(['exec-out', 'run-as', PACKAGE_ID, 'test', '-e', this.plan.paths.privateReceiptSidecar], signal),
      this.#adb(['shell', 'test', '-e', this.lockPath], signal),
    ])
    if ([stageAbsent, privateAbsent, sidecarAbsent, lockAbsent]
      .some((result) => result.exitCode !== 1)) fail('shop_android_adb_cleanup_unproven')
    this.envelope = null
    this.lockOwned = false
    return { cleanupReceiptSha256: sha256(`${request.requestDigest}:${request.reasonCode}`),
      externalStageDeleted: true, privateEvidenceDeleted: true, lockReleased: true,
      operationOutcome: this.operationOutcome, reasonCode: request.reasonCode }
  }
}
