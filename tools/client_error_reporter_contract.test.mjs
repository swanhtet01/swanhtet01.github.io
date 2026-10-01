import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const reporter = await readFile(resolve(root, 'showroom/src/core/client-error-reporter.ts'), 'utf8')
const runtime = await readFile(resolve(root, 'showroom/src/core/workspace-runtime.ts'), 'utf8')

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
