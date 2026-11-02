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

class FakeExecutor {
  constructor(source, { mutate, hang } = {}) {
    this.plan = source
    this.mutate = mutate
    this.hang = hang
    this.calls = []
    this.receipts = 0
  }

  async run(command, args, options) {
    this.calls.push({ command, args: [...args], options })
    if (this.hang?.(command, args)) return new Promise(() => {})
    let result = this.#result(command, args, options)
    if (this.mutate) result = this.mutate(result, command, args) || result
    return result
  }

  async abortAndJoin({ timedOutRequestDigest, timedOutSequence }) {
    return { aborted: true, joined: true, outcome: 'ABORTED', timedOutRequestDigest, timedOutSequence }
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
    if (tail[0] === 'get-state') return ok('device\n')
    if (tail.includes('service.adb.tcp.port')) return ok('-1\n')
    if (tail[0] === 'exec-out' && tail[1] === 'uiautomator') {
      return ok(Object.values(SHOP_ANDROID_INSTALLED_QA_SELECTORS)
        .map((id) => `<node resource-id="${id}"/>`).join(''))
    }
    if (tail.includes('pm') && tail.includes('path')) return ok('package:/data/app/base.apk\n')
    if (tail[0] === 'exec-out' && tail.includes('cat') && tail.at(-1).endsWith('.json')) {
      this.receipts += 1
      const count = this.receipts === 1 ? 1 : (this.receipts === 2 ? 2 : 1)
      return ok(JSON.stringify({ captures: [{ captureCount: count, language: 'en',
        receiptBindingSha256: RECEIPT, renderedReceiptSha256: RENDER }] }))
    }
    if (tail[0] === 'exec-out' && tail.includes('cat') && tail.at(-1).endsWith('.smqa')) return ok(Buffer.from(ENVELOPE))
    if (tail[0] === 'exec-out' && tail[1] === 'cat') return ok(Buffer.from(ENVELOPE))
    if (tail.includes('find')) {
      const root = tail[tail.indexOf('find') + 1]
      return root.startsWith('/data/local/tmp')
        ? ok(`${this.plan.paths.stagedEnvelope.replace(/^/, '/data/local/tmp/')}\n`)
        : ok(`${this.plan.paths.privateEnvelope}\n${this.plan.paths.privateReceiptSidecar}\n`)
    }
    if (tail.includes('stat')) return ok('regular file\n')
    if (tail.includes('sha256sum')) return ok(`${ENVELOPE_SHA}  staged\n`)
    if (tail.includes('test') && tail.includes('-e')) return { ...ok(), exitCode: 1 }
    if (tail.includes('pm') && tail.includes('clear')) return ok('Success\n')
    if (tail[0] === 'exec-in' && tail.includes('tee')) {
      assert.deepEqual(options.stdin, ENVELOPE)
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
    recoveryObserver: { observe: async () => ({ priorSessionState: 'none', priorSessionNonce: null,
      targetId: TARGET, containmentId: CONTAINMENT, recoveryReceiptSha256: null,
      staleLockReleased: false, externalStageDeleted: false,
      privateEvidenceDeleted: false, recoveredAt: null }) },
    metricsObserver: overrides.metricsObserver ?? { observe: async () => {
      metricCount += 1
      return metricCount === 1 ? { ...PRE } : { ...POST }
    } },
    uiDriver: overrides.uiDriver ?? { act: async ({ step, selectors }) => step === 'ui_commit_sale'
      ? { acted: true, productSelector: source.expected.productSelector, selectorsUsed: selectors }
      : { acted: true, selectorsUsed: selectors } },
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

test('stage symlink or extra-file proof and cleanup failure are rejected', async () => {
  const source = plan()
  const symlink = new FakeExecutor(source, { mutate(result, command, args) {
    if (command === 'adb' && args.includes('!') && args.includes('-L')
        && args.some((arg) => arg.startsWith('/data/local/tmp/'))) return { ...ok(), exitCode: 1 }
  } })
  await assert.rejects(runShopAndroidInstalledQaProtocol(source,
    new ShopAndroidInstalledQaAdbAdapter(dependencies(source, { executor: symlink }))))

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
