import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const reporter = await readFile(resolve(root, 'showroom/src/core/client-error-reporter.ts'), 'utf8')
const runtime = await readFile(resolve(root, 'showroom/src/core/workspace-runtime.ts'), 'utf8')
const coreApp = await readFile(resolve(root, 'showroom/src/core/CoreApp.tsx'), 'utf8')
const managedTrial = await readFile(resolve(root, 'showroom/src/core/managed-trial.ts'), 'utf8')

test('direct error reports remain production-host gated and privacy bounded', () => {
  const reportClass = reporter.slice(reporter.indexOf('function reportClass('), reporter.indexOf('export function report('))
  assert.match(reportClass, /if \(!isBeaconHost\(\)\) return/)
  assert.match(reportClass, /hashErrorMessage\(messageText\)/)
  assert.match(reportClass, /class: errorClass, hash, route, commit/)
  assert.doesNotMatch(reportClass, /message:/)
})

test('caught managed persistence failures use a closed operation vocabulary', () => {
  for (const operation of ['shop.load', 'shop.save', 'shop.reconcile', 'plant.load', 'plant.save', 'plant.reconcile']) {
    const escaped = operation.replace('.', '\\.')
    assert.match(reporter, new RegExp(`'${escaped}'`))
    assert.match(runtime, new RegExp(`reportManagedPersistenceFailure\\('${escaped}'`))
  }
  assert.match(reporter, /reportClass\('managed_persistence', `\$\{operation\}:\$\{message\}`\)/)
})

test('expected version conflicts are refreshed before save failures are reported', () => {
  const commerceCatch = runtime.slice(
    runtime.indexOf("const message = error instanceof Error ? error.message : 'The managed Shop write was not confirmed.'"),
    runtime.indexOf('type ProductionWorkspaceMode'),
  )
  const plantCatch = runtime.slice(runtime.indexOf("const message = error instanceof Error ? error.message : 'The managed Plant write was not confirmed.'"))
  assert.ok(commerceCatch.indexOf("error.code === 'trial_version_conflict'") < commerceCatch.indexOf("reportManagedPersistenceFailure('shop.save'"))
  assert.ok(plantCatch.indexOf("error.code === 'trial_version_conflict'") < plantCatch.indexOf("reportManagedPersistenceFailure('plant.save'"))
})

test('managed load failures expose identity-bound read-only retry controls', () => {
  const retries = [...runtime.matchAll(/const retryManagedLoad = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\)/g)]
  assert.equal(retries.length, 2)
  for (const [, retry] of retries) {
    assert.match(retry, /identityRef\.current/)
    assert.match(retry, /snapshotRef\.current\.mode !== 'managed-error'/)
    assert.match(retry, /mode: 'managed-loading' as const, error: '', writeReady: false/)
    assert.match(retry, /setManagedLoadAttempt\(\(attempt\) => attempt \+ 1\)/)
    assert.doesNotMatch(retry, /saveManaged(?:Commerce|Production)Command\(/)
  }
  assert.equal((runtime.match(/\}, \[managedIdentity, managedLoadAttempt\]\)/g) ?? []).length, 2)
  assert.equal((coreApp.match(/Retry company account/g) ?? []).length, 2)
  assert.equal((coreApp.match(/effectiveMode === 'managed-error' \? <button className="core-button primary"/g) ?? []).length, 2)
})

test('managed bootstrap fails closed instead of spinning forever', () => {
  const bootstrap = managedTrial.slice(
    managedTrial.indexOf('export async function loadManagedBootstrap'),
    managedTrial.indexOf('export async function loadManagedCompanyBrief'),
  )
  assert.match(managedTrial, /const MANAGED_BOOTSTRAP_TIMEOUT_MS = 8000/)
  assert.match(bootstrap, /cache: 'no-store'/)
  assert.match(bootstrap, /redirect: 'error'/)
  assert.match(bootstrap, /credentials: 'omit'/)
  assert.match(bootstrap, /signal: AbortSignal\.timeout\(MANAGED_BOOTSTRAP_TIMEOUT_MS\)/)
  assert.match(bootstrap, /error\.name === 'TimeoutError'/)
  assert.match(bootstrap, /code: 'managed_bootstrap_timeout'/)
  assert.match(bootstrap, /true,\s*expectedIdentity/)
})
