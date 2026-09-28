import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPythonFunction } from './verify_generated_python_function.mjs'

async function fixture(t, config = { runtime: 'python3.12', handler: 'vc__handler__python.vc_handler' }) {
  const root = await mkdtemp(join(tmpdir(), 'supermega-python-contract-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bundle = join(root, 'functions/api/app.func')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(bundle, '.vc-config.json'), JSON.stringify(config))
  await writeFile(join(bundle, 'vc__handler__python.py'), 'def vc_handler(): pass\n')
  return { root, bundle }
}

test('accepts pinned builder metadata without claiming runtime acceptance', async t => {
  const { root } = await fixture(t)
  const result = await verifyPythonFunction(root)
  assert.equal(result.status, 'PASS')
  assert.equal(result.coldImport, 'NOT RUN')
  assert.equal(result.hostedAcceptance, 'NOT RUN')
})
for (const config of [null, {}, { runtime: 'nodejs24.x' }, { runtime: 'python3.12', handler: '../private' }, { runtime: 'python3.12', handler: 'vc__handler__python.py' }]) {
  test(`rejects invalid metadata ${JSON.stringify(config)}`, async t => {
    const { root } = await fixture(t, config)
    await assert.rejects(verifyPythonFunction(root))
  })
}
for (const name of ['.vc-config.json', 'vc__handler__python.py']) {
  test(`rejects empty ${name}`, async t => {
    const { root, bundle } = await fixture(t)
    await writeFile(join(bundle, name), '')
    await assert.rejects(verifyPythonFunction(root))
  })
}
test('rejects missing launcher', async t => {
  const { root, bundle } = await fixture(t)
  await rm(join(bundle, 'vc__handler__python.py'))
  await assert.rejects(verifyPythonFunction(root))
})
