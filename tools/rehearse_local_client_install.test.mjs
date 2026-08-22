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
