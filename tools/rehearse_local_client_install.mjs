import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  CLIENT_DEMO_PREPARATION_MAX_BYTES,
  verifyClientDemoPreparation,
} from './prepare_client_demo.mjs'

export const LOCAL_CLIENT_INSTALL_REHEARSAL_CONTRACT = 'supermega.local_client_install_rehearsal.v1'

function invariant(condition, reason) {
  if (!condition) throw new Error(reason)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function memoryStorage(initialEntries = []) {
  const values = new Map(initialEntries)
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
    entries: () => [...values.entries()],
  }
}

function serialLocks() {
  let queue = Promise.resolve()
  let requests = 0
  return {
    get requests() { return requests },
    request: (_name, _options, callback) => {
      requests += 1
      const run = queue.then(callback, callback)
      queue = run.then(() => undefined, () => undefined)
      return run
    },
  }
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
}

function resultCountsMatch(result, rowCount, replay) {
  return result.created === (replay ? 0 : rowCount)
    && result.alreadyPresent === (replay ? rowCount : 0)
}

async function initializeLocalProductBaselines(storage, products) {
  const nonce = Date.now()
  const selected = new Set(products)
  if (selected.has('commerce')) {
    const commerce = await import(`../showroom/src/core/commerce-workspace.ts?local-install-baseline=${nonce}`)
    storage.setItem(commerce.COMMERCE_KEY, JSON.stringify(commerce.createEmptyCommerce()))
  }
  if (selected.has('production')) {
    const production = await import(`../showroom/src/core/production-workspace.ts?local-install-baseline=${nonce}`)
    storage.setItem(production.PRODUCTION_KEY, JSON.stringify(production.createEmptyProduction()))
  }
  if (selected.has('website')) {
    const website = await import(`../showroom/src/products/website/website-model.ts?local-install-baseline=${nonce}`)
    storage.setItem(website.WEBSITE_STORAGE_KEY, JSON.stringify(website.createInitialWorkspace()))
  }
}

export async function rehearseLocalClientInstall(preparation, founderConfirmation) {
  const verification = verifyClientDemoPreparation(preparation)
  invariant(
    typeof founderConfirmation === 'string' && founderConfirmation === preparation.review.confirmation,
    'local_client_install_confirmation_invalid',
  )
  const sentinelKey = 'supermega.rehearsal.unrelated-state'
  const sentinelValue = 'preserve'
  const storage = memoryStorage([[sentinelKey, sentinelValue]])
  const initialEntries = storage.entries()
  const locks = serialLocks()
  const restoreStorage = replaceGlobal('localStorage', storage)
  const restoreNavigator = replaceGlobal('navigator', { locks })
  let installResults = []
  let replayResults = []
  let installedStorageKeys = []
  try {
    await initializeLocalProductBaselines(storage, preparation.products.map((product) => product.product))
    const installer = await import(`../showroom/src/core/local-client-import.ts?local-install-rehearsal=${Date.now()}`)
    const order = await installer.preparedLocalClientDemoInstallOrder(preparation)
    invariant(
      order.join(',') === preparation.products.map((product) => product.product).join(','),
      'local_client_install_order_drift',
    )
    for (const product of order) {
      installResults.push(await installer.applyPreparedLocalClientDemoProduct(
        preparation,
        product,
        founderConfirmation,
      ))
    }
    installedStorageKeys = storage.entries()
      .map(([key]) => key)
      .filter((key) => key !== sentinelKey)
      .sort()
    invariant(installedStorageKeys.length === order.length, 'local_client_install_storage_scope_invalid')
    for (const product of order) {
      replayResults.push(await installer.applyPreparedLocalClientDemoProduct(
        preparation,
        product,
        founderConfirmation,
      ))
    }
    preparation.products.forEach((product, index) => {
      invariant(
        installResults[index]?.product === product.product
          && resultCountsMatch(installResults[index], product.rowCount, false),
        `local_client_install_first_apply_invalid:${product.product}`,
      )
      invariant(
        replayResults[index]?.product === product.product
          && resultCountsMatch(replayResults[index], product.rowCount, true),
        `local_client_install_replay_invalid:${product.product}`,
      )
    })
    storage.clear()
    initialEntries.forEach(([key, value]) => storage.setItem(key, value))
    invariant(
      storage.length === 1 && storage.getItem(sentinelKey) === sentinelValue,
      'local_client_install_rollback_failed',
    )
  } finally {
    restoreNavigator()
    restoreStorage()
  }
  const payload = {
    contract: LOCAL_CLIENT_INSTALL_REHEARSAL_CONTRACT,
    preparationDigest: preparation.bundleDigest,
    status: 'passed_and_rolled_back',
    products: preparation.products.map((product, index) => ({
      product: product.product,
      templateId: product.templateId,
      sourceMode: product.sourceMode,
      rowCount: product.rowCount,
      packageDigest: product.packageDigest,
      firstApply: { ...installResults[index] },
      exactReplay: { ...replayResults[index] },
    })),
    metrics: {
      productCount: verification.productCount,
      installedRows: installResults.reduce((total, result) => total + result.created, 0),
      replayedRows: replayResults.reduce((total, result) => total + result.alreadyPresent, 0),
      localStorageKeysCreated: installedStorageKeys.length,
      lockRequests: locks.requests,
    },
    controls: {
      memoryStorageOnly: true,
      exactFounderConfirmationRequired: true,
      exactReplayRequired: true,
      rollbackVerified: true,
      unrelatedStatePreserved: true,
      containsClientValues: false,
      persistentBrowserWrites: 0,
      hostedWrites: 0,
      networkRequests: 0,
      connectorCalls: 0,
      modelCalls: 0,
      productionActivationPerformed: false,
    },
  }
  const serialized = JSON.stringify(payload)
  invariant(!serialized.includes(preparation.client.workspace), 'local_client_install_receipt_exposed_workspace')
  invariant(!serialized.includes(preparation.client.owner), 'local_client_install_receipt_exposed_owner')
  return { ...payload, digest: sha256(serialized) }
}

async function preparationFromFile(pathValue) {
  invariant(typeof pathValue === 'string' && pathValue.trim(), 'local_client_install_preparation_path_missing')
  const path = resolve(pathValue)
  const metadata = await lstat(path)
  invariant(metadata.isFile() && !metadata.isSymbolicLink(), 'local_client_install_preparation_file_invalid')
  invariant(metadata.size > 0 && metadata.size <= CLIENT_DEMO_PREPARATION_MAX_BYTES, 'local_client_install_preparation_size_invalid')
  let value
  try { value = JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error('local_client_install_preparation_json_invalid') }
  verifyClientDemoPreparation(value)
  return value
}

function parseArgs(argv) {
  const options = { preparationPath: '', confirmation: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--preparation') options.preparationPath = argv[++index] ?? ''
    else if (argument === '--confirm') options.confirmation = argv[++index] ?? ''
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`local_client_install_unknown_argument:${argument}`)
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write([
        'SuperMega local client installation rehearsal',
        '',
        '  npm run client:install:rehearse -- --preparation <private-review.json> --confirm "APPROVE CLIENT DEMO sha256:..."',
        '',
        'Applies all selected products to isolated memory storage, proves exact replay, and rolls back.',
        'No persistent browser, hosted, connector, network, model, or production write is available.',
      ].join('\n') + '\n')
    } else {
      const preparation = await preparationFromFile(options.preparationPath)
      process.stdout.write(`${JSON.stringify(await rehearseLocalClientInstall(preparation, options.confirmation), null, 2)}\n`)
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      contract: LOCAL_CLIENT_INSTALL_REHEARSAL_CONTRACT,
      error: error instanceof Error ? error.message : 'Local client install rehearsal failed.',
    })}\n`)
    process.exitCode = 1
  }
}
