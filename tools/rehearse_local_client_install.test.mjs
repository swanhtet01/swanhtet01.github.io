import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { initializeClientWorkspace, prepareClientDemo } from './prepare_client_demo.mjs'
import {
  LOCAL_CLIENT_INSTALL_REHEARSAL_CONTRACT,
  rehearseLocalClientInstall,
} from './rehearse_local_client_install.mjs'

async function preparedFixture({ presetId, products } = {}) {
  const parent = await mkdtemp(resolve(tmpdir(), 'supermega-local-install-'))
  const directory = resolve(parent, 'client')
  await initializeClientWorkspace({ directory, presetId, products })
  const profilePath = resolve(directory, 'client.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf8'))
  await writeFile(profilePath, JSON.stringify({
    ...profile,
    workspace: 'Private installation rehearsal',
    owner: 'Founder reviewer',
  }), 'utf8')
  return {
    parent,
    preparation: await prepareClientDemo({
      dataDirectory: directory,
      preparedAt: '2026-07-31T06:00:00.000Z',
    }),
  }
}

test('four prepared products install, replay exactly, and roll back in memory', async () => {
  const fixture = await preparedFixture()
  try {
    const receipt = await rehearseLocalClientInstall(
      fixture.preparation,
      fixture.preparation.review.confirmation,
    )
    assert.equal(receipt.contract, LOCAL_CLIENT_INSTALL_REHEARSAL_CONTRACT)
    assert.equal(receipt.status, 'passed_and_rolled_back')
    assert.deepEqual(receipt.products.map((product) => product.product), ['commerce', 'production', 'website', 'ecommerce'])
    assert.equal(receipt.products.every((product) => (
      product.firstApply.created === product.rowCount
        && product.firstApply.alreadyPresent === 0
        && product.exactReplay.created === 0
        && product.exactReplay.alreadyPresent === product.rowCount
    )), true)
    assert.equal(receipt.metrics.productCount, 4)
    assert.equal(receipt.metrics.installedRows, receipt.metrics.replayedRows)
    assert.equal(receipt.metrics.localStorageKeysCreated, 4)
    assert.equal(receipt.controls.rollbackVerified, true)
    assert.equal(receipt.controls.unrelatedStatePreserved, true)
    assert.equal(receipt.controls.persistentBrowserWrites, 0)
    assert.equal(receipt.controls.hostedWrites, 0)
    assert.match(receipt.digest, /^sha256:[a-f0-9]{64}$/)
    assert.doesNotMatch(JSON.stringify(receipt), /Private installation rehearsal|Founder reviewer/)
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})

test('a Beauty Spa portal installs only Shop, Website, and Ecommerce storage', async () => {
  const fixture = await preparedFixture({
    presetId: 'service-business',
    products: ['commerce', 'website', 'ecommerce'],
  })
  try {
    const receipt = await rehearseLocalClientInstall(
      fixture.preparation,
      fixture.preparation.review.confirmation,
    )
    assert.deepEqual(receipt.products.map((product) => product.product), ['commerce', 'website', 'ecommerce'])
    assert.equal(receipt.metrics.productCount, 3)
    assert.equal(receipt.metrics.localStorageKeysCreated, 3)
    assert.equal(receipt.controls.rollbackVerified, true)
    assert.equal(receipt.controls.unrelatedStatePreserved, true)
    assert.equal(receipt.controls.productionActivationPerformed, false)
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})

test('wrong approval and tampered preparation fail before local installation', async () => {
  const fixture = await preparedFixture()
  try {
    await assert.rejects(
      rehearseLocalClientInstall(fixture.preparation, 'APPROVE EVERYTHING'),
      /local_client_install_confirmation_invalid/,
    )
    const tampered = structuredClone(fixture.preparation)
    tampered.products[0].stagingPackage.rows[0].values.name = 'Changed after founder review'
    await assert.rejects(
      rehearseLocalClientInstall(tampered, tampered.review.confirmation),
      /client_demo_product_validation_drift|client_demo_bundle_digest_invalid/,
    )
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})


test('prepared Website and Ecommerce reject lost writes and recover with one exact installation', async () => {
  const fixture = await preparedFixture({ presetId: 'service-business', products: ['commerce', 'website', 'ecommerce'] })
  const previous = new Map(['localStorage', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  try {
    const commerce = await import('../showroom/src/core/commerce-workspace.ts')
    const website = await import('../showroom/src/products/website/website-model.ts')
    const installer = await import('../showroom/src/core/local-client-import.ts')
    for (const fault of ['throw', 'drop']) {
      const values = new Map([[commerce.COMMERCE_KEY, JSON.stringify(commerce.createEmptyCommerce())], [website.WEBSITE_STORAGE_KEY, JSON.stringify(website.createInitialWorkspace())]])
      let failing = false, attempts = 0
      const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { if (failing) { attempts++; if (fault === 'throw') throw new Error('synthetic quota'); return } values.set(key, value) },
        removeItem: key => values.delete(key),
      }
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name, _options, callback) => callback() } } })
      const apply = product => installer.applyPreparedLocalClientDemoProduct(fixture.preparation, product, fixture.preparation.review.confirmation)
      await apply('commerce')
      for (const product of ['website', 'ecommerce']) {
        const before = [...values]
        failing = true
        attempts = 0
        await assert.rejects(apply(product))
        assert.ok(attempts > 0, product + ' reached the failing write')
        assert.deepEqual([...values], before, product + ' preserved saved records')
        failing = false
        const recovered = await apply(product)
        const count = fixture.preparation.products.find(entry => entry.product === product).rowCount
        assert.equal(recovered.created, count)
        assert.equal(recovered.alreadyPresent, 0)
        const saved = [...values]
        const replay = await apply(product)
        assert.equal(replay.created, 0)
        assert.equal(replay.alreadyPresent, count)
        assert.deepEqual([...values], saved)
      }
    }
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
    await rm(fixture.parent, { recursive: true, force: true })
  }
})


test('prepared installer UI binds installed status to the exact package, not general demo progress', async () => {
  const source = await readFile(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
  const expression = source.split('\n').find(line => line.includes('const preparedAppliedProducts ='))
  assert.ok(expression)
  const evaluate = (preparedArtifact, preparedInstalled = {}) => [...runInNewContext(expression + '; preparedAppliedProducts', {
    preparedArtifact, preparedInstalled, demoWorkspace: { products: [{ product: 'website', status: 'applied' }] },
  })]
  assert.deepEqual(evaluate({ bundleDigest: 'new' }), [])
  assert.deepEqual(evaluate({ bundleDigest: 'new' }, { website: 'old' }), [])
  assert.deepEqual(evaluate({ bundleDigest: 'new' }, { website: 'new', ecommerce: 'old' }), ['website'])
  assert.deepEqual(evaluate(null, { website: 'new' }), [])
  assert.match(source, /const installedBeforeRun = preparedAppliedProducts/)
  assert.match(source, /const applied = preparedAppliedProducts.has\(product.product\)/)
  assert.match(source, /await applyPreparedLocalClientDemoProduct\(artifact, product, preparedConfirmation\)\s+setPreparedInstalled\(\(current\) => \(\{ \.\.\.current, \[product\]: artifact.bundleDigest \}\)\)/)
})


test('actual Settings installer refuses overlapping starts before module loading completes', async () => {
  const source = await readFile(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('  async function installPreparedProducts()')
  const end = source.indexOf('  async function createDemoKit()', start)
  assert.ok(start > 0 && end > start)
  const handler = source.slice(start, end).replace(': SetupProductId | null', '').replace(': string[]', '').replace("import('./local-client-import')", 'loadInstaller()')
  let finish, loads = 0
  const pending = new Promise(resolve => { finish = resolve })
  const running = { current: false }
  const context = {
    preparedArtifact: {}, preparedBusyProduct: null, managedIdentity: null, preparedApprovalReady: true,
    preparedAppliedProducts: new Set(), preparedInstallRunning: running,
    setPreparedBlockedProduct() {}, setPreparedNotice() {}, setPreparedBusyProduct() {}, setPreparedInstallStep() {},
    loadInstaller: () => { loads++; return pending },
  }
  const run = runInNewContext(handler + '; installPreparedProducts', context)
  const first = run()
  assert.equal(running.current, true)
  await run()
  assert.equal(loads, 1)
  finish({ preparedLocalClientDemoInstallOrder: async () => [] })
  await first
  assert.equal(running.current, false)
  await run()
  assert.equal(loads, 2, 'completed attempt releases the guard')
  context.loadInstaller = async () => { throw new Error('synthetic import failure') }
  await run()
  assert.equal(running.current, false, 'failed attempt also releases the guard')
})


test('Settings package operations exclude each other while file reading is pending', async () => {
  const source = await readFile(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
  const extract = name => {
    const start = source.indexOf('  async function ' + name + '(')
    const end = source.indexOf('\n  }', start) + 4
    assert.ok(start > 0 && end > start)
    return source.slice(start, end).replaceAll(': File | null', '').replace(': readonly File[]', '').replace(': SetupProductId | null', '').replace(': string[]', '').replace(': ClientDemoPreparationSource[]', '').replace('new Set<ClientSolutionId>()', 'new Set()')
  }
  const names = ['loadDemoKit', 'loadPreparedClientDemo', 'prepareClientFiles', 'createDemoKit', 'installPreparedProducts']
  let finish, reads = 0
  const pending = new Promise(resolve => { finish = resolve })
  const running = { current: false }
  const context = { preparedInstallRunning: running, preparedArtifact: {}, preparedBusyProduct: null, managedIdentity: null, preparedApprovalReady: true,
    demoKitReadiness: { kit: {} }, CLIENT_DEMO_KIT_MAX_BYTES: 100,
    restoreClientDemoKit: () => null, setNotice() {},
  }
  const handlers = runInNewContext(names.map(extract).join('\n') + '; ({' + names.join(',') + '})', context)
  const file = { size: 2, text: () => { reads++; return pending } }
  const first = handlers.loadDemoKit(file)
  assert.equal(running.current, true)
  await handlers.loadDemoKit(file)
  await handlers.loadPreparedClientDemo(file)
  await handlers.prepareClientFiles([file])
  await handlers.createDemoKit()
  await handlers.installPreparedProducts()
  assert.equal(reads, 1)
  finish('{}')
  await first
  assert.equal(running.current, false, 'validation failure releases shared guard')
  await handlers.loadDemoKit(file)
  assert.equal(reads, 2)
  for (const name of names) {
    assert.match(extract(name), /preparedInstallRunning.current = true/)
    assert.match(extract(name), /finally \{\s+preparedInstallRunning.current = false/)
  }
})


test('switching a setup clears previous package approval and progress before setup work', async () => {
  const source = await readFile(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
  const start = source.indexOf("  async function installDemoBlueprint(")
  const body = source.indexOf(' {', start) + 2
  const end = source.indexOf('    let shopPackNotice', body)
  assert.ok(start > 0 && body > start && end > body)
  const state = { artifact: 'old', confirmation: 'approved old', installed: { website: 'old' }, blocked: 'website', notice: 'old installed' }
  runInNewContext(source.slice(body, end), {
    setPreparedArtifact: value => { state.artifact = value },
    setPreparedConfirmation: value => { state.confirmation = value },
    setPreparedInstalled: value => { state.installed = value },
    setPreparedBlockedProduct: value => { state.blocked = value },
    setPreparedNotice: value => { state.notice = value },
  })
  assert.equal(state.artifact, null)
  assert.equal(state.confirmation, '')
  assert.equal(Object.keys(state.installed).length, 0)
  assert.equal(state.blocked, null)
  assert.equal(state.notice, '')
  assert.match(source, /await installDemoBlueprint\(clientDemoPreparationBlueprint\(artifact\), 'loaded'\)\s+setPreparedArtifact\(artifact\)\s+setPreparedConfirmation\(''\)/)
})
