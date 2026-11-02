import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { ShopAndroidInstalledQaAdbAdapter } from './shop_android_installed_qa_adb_adapter.mjs'
import {
  SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
  SHOP_ANDROID_INSTALLED_QA_SELECTORS,
  runShopAndroidInstalledQaProtocol,
} from './shop_android_installed_qa_protocol.mjs'
import {
  assessShopAndroidQaHandoff,
  sampleShopAndroidQaHandoffInput,
} from './prepare_shop_android_qa_handoff.mjs'

const SERIAL = 'emulator-5554'
const SESSION = '0123456789abcdef0123456789abcdef'
const TARGET = '4'.repeat(64)
const CONTAINMENT = '5'.repeat(64)
const LOCK = /^[0-9a-f]{64}$/
const RECEIPT = '1'.repeat(64)
const RENDER = '2'.repeat(64)
const ENVELOPE = Buffer.from('SMQA synthetic encrypted evidence')
const APK_BYTES = Buffer.from('synthetic android qa apk fixture')
const ENVELOPE_SHA = createHash('sha256').update(ENVELOPE).digest('hex')
const PRE = { sales: 0, stockMovements: 0, receipts: 0, outbox: 0, onHand: 3, shifts: 1 }
const POST = { sales: 1, stockMovements: 1, receipts: 1, outbox: 1, onHand: 2, shifts: 1 }

function plan() {
  const handoff = assessShopAndroidQaHandoff(
    sampleShopAndroidQaHandoffInput({ canonicalAware: true }),
  )
  const now = Date.now()
  return {
    contract: SHOP_ANDROID_INSTALLED_QA_PROTOCOL,
    sessionNonce: SESSION,
    targetId: TARGET,
    handoff,
    isolation: {
      containmentId: CONTAINMENT, adbHost: '127.0.0.1', adbTcpipEnabled: false,
      adbListenAll: false, providerAccessFromApp: false, noEgress: true, loopbackOnly: true,
    },
    timing: {
      sessionStartedAt: new Date(now).toISOString(),
      sessionDeadlineAt: new Date(now + 60_000).toISOString(), maxStepDurationMs: 250,
    },
    expected: {
      saleDelta: 1, stockMovementDelta: 1, receiptDelta: 1, outboxDelta: 1,
      onHandDelta: -1, productSelector: 'shop.catalog.product.synthetic-product',
      receiptBindingSha256: RECEIPT, receiptRenderSha256: RENDER,
      envelopeSha256: ENVELOPE_SHA, priorSessionState: 'none',
      priorSessionNonce: null, recoveryReceiptSha256: null,
    },
    paths: {
      privateEnvelope: 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-20261103-000000-abcdef123456.smqa',
      privateReceiptSidecar: 'files/synthetic-qa-v1/synthetic-evidence/SuperMega-Shop-SYNTHETIC-QA-RECEIPTS-v1.json',
      stagingRoot: `supermega-shop-installed-qa/${SESSION}/`,
      stagedEnvelope: `supermega-shop-installed-qa/${SESSION}/evidence.smqa`,
    },
    selectors: { ...SHOP_ANDROID_INSTALLED_QA_SELECTORS },
  }
}

function ok(stdout = '') {
  return { abortedAndJoined: true, exitCode: 0, stderr: '', stdout }
}

function uiDocument(state) {
  return Object.values(SHOP_ANDROID_INSTALLED_QA_SELECTORS)
    .map((id) => `<node resource-id="${id}" state="${state}"/>`).join('')
}

class FakeExecutor {
  constructor(source, { mutate, hang, device = {} } = {}) {
    this.plan = source
    this.mutate = mutate
    this.hang = hang
    this.calls = []
    this.sensitiveCalls = []
    this.receipts = 0
    this.uiDumps = 0
    this.device = device
    this.sensitiveIoContract = 'supermega.shop.android-installed-qa-sensitive-executor.v1'
    this.lockReleaseContract = 'supermega.shop.android-installed-qa-lock-release.v1'
  }

  async run(command, args, options) {
    this.calls.push({ command, args: [...args], options })
    if (this.hang?.(command, args)) return new Promise(() => {})
    let result = this.#result(command, args, options)
    if (this.mutate) result = this.mutate(result, command, args) || result
    return result
  }

  async runSensitive(command, args, options) {
    this.sensitiveCalls.push({ command, args: [...args], inputBytes: options.input?.length ?? 0,
      contract: options.contract })
    if (this.hang?.(command, args)) return new Promise(() => {})
    let result = this.#result(command, args, options)
    if (this.mutate) result = this.mutate(result, command, args) || result
    return result
  }

  async abortAndJoin({ timedOutRequestDigest, timedOutSequence }) {
    return { aborted: true, joined: true, outcome: 'ABORTED', timedOutRequestDigest, timedOutSequence }
  }

  async releaseOwnedLock({ path, ownerToken, contract }) {
    assert.equal(path, `/data/local/tmp/supermega-shop-installed-qa/${TARGET}.lock`)
    assert.equal(contract, this.lockReleaseContract)
    if (this.device.swapOnRelease) this.device.lockOwner = 'foreign-owner-after-read'
    if (this.device.lockOwner !== ownerToken) {
      return { released: false, ownerMatched: false, lockAbsent: false }
    }
    this.device.lockOwner = null
    return { released: true, ownerMatched: true, lockAbsent: true }
  }

  #result(command, args, options) {
    const artifact = this.plan.handoff.artifact
    if (command === 'ss') return ok('LISTEN 0 4096 127.0.0.1:5037 0.0.0.0:* users:(("adb",pid=1,fd=1))')
    if (command === 'sha256sum') return ok(`${artifact.apkSha256}  ${args[0]}`)
    if (command === 'apkanalyzer' && args.includes('application-id')) return ok('dev.supermega.supermega_shop.qa\n')
    if (command === 'apkanalyzer') return ok('<application android:debuggable="true"/>')
    if (command === 'apksigner') return ok(`Signer #1 certificate SHA-256 digest: ${artifact.signerCertificateSha256}`)
    assert.equal(command, 'adb')
    const tail = args.slice(2)
    const lockPath = `/data/local/tmp/supermega-shop-installed-qa/${TARGET}.lock`
    if (tail[0] === 'shell' && tail[1] === 'mkdir' && tail[2] === lockPath) {
      if (this.device.lockOwner) return { ...ok(), exitCode: 1 }
      this.device.lockOwner = 'pending'
      return ok()
    }
    if (tail[0] === 'exec-in' && tail.includes('tee') && tail.at(-1) === `${lockPath}/owner`) {
      this.device.lockOwner = options.input.toString('utf8')
      return ok(Buffer.from(options.input))
    }
    if (tail[0] === 'exec-out' && tail[1] === 'cat' && tail[2] === `${lockPath}/owner`) {
      return this.device.lockOwner ? ok(this.device.lockOwner) : { ...ok(), exitCode: 1 }
    }
    if (tail[0] === 'shell' && tail[1] === 'rm' && tail.at(-1) === `${lockPath}/owner`) return ok()
    if (tail[0] === 'shell' && tail[1] === 'rmdir' && tail[2] === lockPath) {
      this.device.lockOwner = null
      return ok()
    }
    if (tail[0] === 'get-state') return ok('device\n')
    if (tail.includes('service.adb.tcp.port')) return ok('-1\n')
    if (tail[0] === 'exec-out' && tail[1] === 'uiautomator') {
      this.uiDumps += 1
      return ok(uiDocument(this.uiDumps))
    }
    if (tail.includes('pm') && tail.includes('path')) return ok('package:/data/app/qa/base.apk\n')
    if (tail[0] === 'exec-out' && tail[1] === 'cat' && tail[2] === '/data/app/qa/base.apk') {
      return ok(Buffer.from(APK_BYTES))
    }
    if (tail[0] === 'exec-out' && tail.includes('cat') && tail.at(-1).endsWith('.json')) {
      this.receipts += 1
      const count = this.receipts === 1 ? 1 : (this.receipts === 2 ? 2 : 1)
      const captures = [{ captureCount: count, language: 'en',
        receiptBindingSha256: RECEIPT, renderedReceiptSha256: RENDER }]
      return ok(JSON.stringify({ contract: 'supermega.shop.qa-loopback-receipt.v1',
        profileId: 'synthetic_qa_v1', platformIdentity: 'dev.supermega.supermega_shop.qa',
        captures, inventorySha256: createHash('sha256').update(JSON.stringify(captures)).digest('hex') }))
    }
    if (tail[0] === 'exec-out' && tail.includes('cat') && tail.at(-1).endsWith('.smqa')) return ok(Buffer.from(ENVELOPE))
    if (tail[0] === 'exec-out' && tail[1] === 'cat') return ok(Buffer.from(ENVELOPE))
    if (tail.includes('find')) {
      const root = tail[tail.indexOf('find') + 1]
      return root.startsWith('/data/local/tmp')
        ? ok(`${this.plan.paths.stagedEnvelope.replace(/^/, '/data/local/tmp/')}\n`)
        : ok(`${this.plan.paths.privateEnvelope}\n${this.plan.paths.privateReceiptSidecar}\n`)
    }
    if (tail.includes('sha256sum')) return ok(`${ENVELOPE_SHA}  staged\n`)
    if (tail.includes('test') && tail.includes('-L')) return { ...ok(), exitCode: 1 }
    if (tail.includes('test') && tail.includes('-e') && tail.at(-1) === lockPath) {
      return { ...ok(), exitCode: this.device.lockOwner ? 0 : 1 }
    }
    if (tail.includes('test') && tail.includes('-e')) return { ...ok(), exitCode: 1 }
    if (tail.includes('pm') && tail.includes('clear')) return ok('Success\n')
    if (tail[0] === 'exec-in' && tail.includes('tee')) {
      assert.deepEqual(options.input, ENVELOPE)
      return ok(Buffer.from(ENVELOPE))
    }
    return ok()
  }
}

function dependencies(source, overrides = {}) {
  const executor = overrides.executor ?? new FakeExecutor(source)
  let metricCount = 0
  return {
    plan: source, serial: SERIAL, apkPath: '/authorized/app-qa-debug.apk', executor,
    clock: { now: () => Date.now() },
    authorizationVerifier: overrides.authorizationVerifier ?? (async () => ({
      authorized: true, targetId: TARGET, containmentId: CONTAINMENT,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      adbTcpipEnabled: false, adbListenAll: false, providerAccessFromApp: false,
      noEgress: true, loopbackOnly: true,
    })),
    recoveryObserver: overrides.recoveryObserver ?? { observe: async ({ requestDigest, authorityDigest }) => ({
      requestDigest, authorityDigest, recovery: { priorSessionState: 'none', priorSessionNonce: null,
        targetId: TARGET, containmentId: CONTAINMENT, recoveryReceiptSha256: null,
        staleLockReleased: false, externalStageDeleted: false,
        privateEvidenceDeleted: false, recoveredAt: null } }) },
    metricsObserver: overrides.metricsObserver ?? { observe: async ({ requestDigest, authorityDigest }) => {
      metricCount += 1
      return { requestDigest, authorityDigest,
        counts: metricCount === 1 ? { ...PRE } : { ...POST } }
    } },
    uiDriver: overrides.uiDriver ?? { act: async ({ selector, requestDigest, authorityDigest,
      beforeUiDigest }) => ({ acted: true, selector, requestDigest, authorityDigest,
      beforeUiDigest, afterUiDigest: createHash('sha256')
        .update(uiDocument(executor.uiDumps + 1)).digest('hex') }) },
  }
}

test('fake authorized target completes protocol without executing a real tool', async () => {
  const source = plan()
  const deps = dependencies(source)
  const adapter = new ShopAndroidInstalledQaAdbAdapter(deps)
  const result = await runShopAndroidInstalledQaProtocol(source, adapter)
  assert.equal(result.status, 'PASS')
  assert.deepEqual(result.counts, POST)
  assert.match(adapter.lockToken, LOCK)
  assert.ok(deps.executor.calls.every((call) =>
    ['adb', 'apkanalyzer', 'apksigner', 'sha256sum', 'ss'].includes(call.command)))
  assert.ok(deps.executor.calls.every((call) => call.args.every((arg) => typeof arg === 'string')))
  assert.ok(deps.executor.sensitiveCalls.every((call) => !('input' in call) && !('stdout' in call)))
})

test('missing dependencies and unsafe target paths fail before execution', () => {
  const source = plan()
  assert.throws(() => new ShopAndroidInstalledQaAdbAdapter({ ...dependencies(source), executor: null }),
    /shop_android_adb_adapter_dependency_missing/)
  assert.throws(() => new ShopAndroidInstalledQaAdbAdapter({ ...dependencies(source), serial: 'x;rm' }),
    /shop_android_adb_adapter_configuration_invalid/)
  assert.throws(() => new ShopAndroidInstalledQaAdbAdapter({ ...dependencies(source), apkPath: '../app.apk' }),
    /shop_android_adb_adapter_configuration_invalid/)
})

test('authorization and isolation observations fail closed', async () => {
  const source = plan()
  const executor = new FakeExecutor(source)
  const adapter = new ShopAndroidInstalledQaAdbAdapter(dependencies(source, {
    executor,
    authorizationVerifier: async () => ({ authorized: false, targetId: TARGET,
      containmentId: CONTAINMENT, expiresAt: new Date(Date.now() + 1000).toISOString(),
      adbTcpipEnabled: false, adbListenAll: false, providerAccessFromApp: false,
      noEgress: true, loopbackOnly: true }),
  }))
  await assert.rejects(runShopAndroidInstalledQaProtocol(source, adapter),
    (error) => error.code === 'shop_android_installed_qa_cleanup_failed')
  assert.equal(executor.calls.length, 0)

  const exposed = new FakeExecutor(source, { mutate(result, command) {
    if (command === 'ss') return ok('LISTEN 0 4096 0.0.0.0:5037 0.0.0.0:*')
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: exposed }))))
})

test('artifact and UI identifier substitutions never reach a claimed pass', async () => {
  const source = plan()
  const wrongArtifact = new FakeExecutor(source, { mutate(result, command) {
    if (command === 'sha256sum') return ok(`${'a'.repeat(64)}  app.apk`)
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: wrongArtifact }))))

  const missingSelector = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('uiautomator')) return ok('<hierarchy/>')
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: missingSelector }))))
})

test('installed bytes, split inventory, and exact single signer are all bound', async () => {
  const source = plan()
  for (const executor of [
    new FakeExecutor(source, { mutate(result, command, args) {
      if (command === 'adb' && args.includes('/data/app/qa/base.apk')) return ok(Buffer.from('substituted'))
    } }),
    new FakeExecutor(source, { mutate(result, command, args) {
      if (command === 'adb' && args.includes('path')) {
        return ok('package:/data/app/qa/base.apk\npackage:/data/app/qa/split_config.apk\n')
      }
    } }),
    new FakeExecutor(source, { mutate(result, command) {
      if (command === 'apksigner') return ok(`${result.stdout}\nSigner #2 certificate SHA-256 digest: ${'a'.repeat(64)}`)
    } }),
  ]) {
    await assert.rejects(runShopAndroidInstalledQaProtocol(source,
      new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor }))))
  }
})

test('target lock is nonce-independent and foreign ownership is never removed', async () => {
  const first = plan()
  const second = plan()
  second.sessionNonce = 'abcdef0123456789abcdef0123456789'
  second.paths.stagingRoot = `supermega-shop-installed-qa/${second.sessionNonce}/`
  second.paths.stagedEnvelope = `${second.paths.stagingRoot}evidence.smqa`
  const device = { lockOwner: 'foreign-owner-token' }
  const executor = new FakeExecutor(second, { device })
  await assert.rejects(runShopAndroidInstalledQaProtocol(second,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(second, { executor }))),
  (error) => error.code === 'shop_android_installed_qa_cleanup_failed')
  assert.equal(device.lockOwner, 'foreign-owner-token')
  assert.equal(executor.calls.some((call) => call.args.includes('foreign-owner-token')), false)
  assert.equal(executor.calls.some((call) => call.args.includes('rm')
    && call.args.some((arg) => arg.endsWith(`${TARGET}.lock/owner`))), false)
  assert.equal(first.targetId, second.targetId)
})

test('UI, metrics, and recovery reject request or authority substitution', async () => {
  const source = plan()
  const wrongUi = { act: async ({ selector, authorityDigest, beforeUiDigest }) => ({
    acted: true, selector, requestDigest: 'a'.repeat(64), authorityDigest,
    beforeUiDigest, afterUiDigest: beforeUiDigest,
  }) }
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { uiDriver: wrongUi }))))

  const wrongMetrics = { observe: async ({ requestDigest }) => ({
    requestDigest, authorityDigest: 'b'.repeat(64), counts: { ...PRE },
  }) }
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { metricsObserver: wrongMetrics }))))

  const wrongRecovery = { observe: async ({ requestDigest }) => ({
    requestDigest, authorityDigest: 'c'.repeat(64), recovery: {},
  }) }
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { recoveryObserver: wrongRecovery }))))
})

test('no-op UI transitions and substituted restore destinations are rejected', async () => {
  const source = plan()
  let noOpActions = 0
  const noOpExecutor = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('uiautomator')) return ok(uiDocument(0))
  } })
  const noOpDriver = { act: async ({ selector, requestDigest, authorityDigest, beforeUiDigest }) => {
    noOpActions += 1
    return { acted: true, selector, requestDigest, authorityDigest, beforeUiDigest,
      afterUiDigest: beforeUiDigest }
  } }
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source,
      { executor: noOpExecutor, uiDriver: noOpDriver }))))
  assert.equal(noOpActions, 1)

  let privateEnvelopeReads = 0
  const substitutedRestore = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.at(-1)?.endsWith('.smqa') && args.includes('run-as')
        && args.includes('cat')) {
      privateEnvelopeReads += 1
      if (privateEnvelopeReads === 2) return ok(Buffer.from('substituted restored bytes'))
    }
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: substitutedRestore }))))
})

test('atomic lock release refuses an owner swap and preserves the foreign lock', async () => {
  const source = plan()
  const device = { lockOwner: null, swapOnRelease: true }
  const executor = new FakeExecutor(source, { device })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor }))),
  (error) => error.code === 'shop_android_installed_qa_cleanup_failed')
  assert.equal(device.lockOwner, 'foreign-owner-after-read')
})

test('receipt root privacy and post-clean absence are fail-closed', async () => {
  const source = plan()
  const leakedReceipt = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.at(-1)?.endsWith('.json')) {
      const decoded = JSON.parse(result.stdout)
      decoded.customerName = 'forbidden'
      return ok(JSON.stringify(decoded))
    }
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: leakedReceipt }))))

  const remains = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('test') && args.includes('-e')
        && args.some((arg) => arg.endsWith('.smqa'))) return ok()
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: remains }))),
  (error) => error.code === 'shop_android_installed_qa_cleanup_failed')
})

test('stage symlink or extra-file proof and cleanup failure are rejected', async () => {
  const source = plan()
  const symlink = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('-L')
        && args.some((arg) => arg.startsWith('/data/local/tmp/'))) return ok()
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: symlink }))))

  const extraFile = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('find')
        && args.some((arg) => arg.startsWith('/data/local/tmp/'))) {
      return ok(`${source.paths.stagedEnvelope.replace(/^/, '/data/local/tmp/')}\n/data/local/tmp/unreviewed.smqa\n`)
    }
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: extraFile }))))

  const cleanup = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('rmdir')) return { ...ok(), exitCode: 1 }
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: cleanup }))),
  (error) => error.code === 'shop_android_installed_qa_cleanup_failed')
})

test('timed-out command requires exact abort/join proof before cleanup', async () => {
  const source = plan()
  source.timing.maxStepDurationMs = 100
  const executor = new FakeExecutor(source, { hang: (command) => command === 'sha256sum' })
  const adapter = new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor }))
  await assert.rejects(runShopAndroidInstalledQaProtocol(source, adapter), (error) =>
    error.code === 'shop_android_installed_qa_operation_timeout'
      && error.operationOutcome === 'ABORTED' && Boolean(error.cleanupReceipt))
  assert.ok(executor.calls.some((call) => call.args.includes('rmdir')))

  const unsettledPlan = plan()
  unsettledPlan.timing.maxStepDurationMs = 100
  const unsettledExecutor = new FakeExecutor(unsettledPlan, { hang: (command) => command === 'sha256sum' })
  unsettledExecutor.abortAndJoin = async ({ timedOutRequestDigest, timedOutSequence }) => ({
    aborted: true, joined: false, outcome: 'UNKNOWN', timedOutRequestDigest, timedOutSequence,
  })
  await assert.rejects(runShopAndroidInstalledQaProtocol(unsettledPlan,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(unsettledPlan, { executor: unsettledExecutor }))),
  (error) => error.code === 'shop_android_installed_qa_cleanup_failed'
    && error.cleanupOutcome === 'UNKNOWN')
})

test('adapter source has no real executor and forbids shell/process/filesystem/network imports', async () => {
  const source = await readFile(new URL('./shop_android_installed_qa_adb_adapter.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:(?:child_process|fs|net|http|https|tls|dgram)/)
  assert.doesNotMatch(source, /\b(?:spawn|execFile|execSync|fetch)\s*\(/)
  assert.match(source, /executor\.run/)
  assert.doesNotMatch(source, /\.github|workflow_dispatch|gcloud|provider SDK/i)
})
