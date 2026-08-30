import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const ROOT = resolve('.')
const PREPARE = resolve('tools/prepare_client_demo.mjs')
const TOOL = resolve('tools/prepare_client_portal_workspace.mjs')

function run(command, args, timeout = 120_000) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout })
}

test('creates and verifies one private four-product portal workspace without external action', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-generic-client-portal-'))
  const intake = join(parent, 'intake')
  const preparation = join(parent, 'reviewed-preparation.json')
  const workspace = join(parent, 'private-client-workspace')
  const privateBusiness = 'PRIVATE LOTUS WELLNESS SPA'
  const privateOwner = 'PRIVATE NAMED OWNER'
  try {
    const initialized = run(process.execPath, [PREPARE, '--init', intake, '--preset', 'service-business', '--products', 'shop,plant,website,ecommerce'])
    assert.equal(initialized.status, 0, initialized.stderr)
    const clientPath = join(intake, 'client.json')
    const client = JSON.parse(await readFile(clientPath, 'utf8'))
    client.workspace = privateBusiness
    client.owner = privateOwner
    await writeFile(clientPath, `${JSON.stringify(client, null, 2)}\n`)
    for (const product of ['commerce', 'production', 'website', 'ecommerce']) {
      await cp(join(intake, '_templates', `${product}.csv`), join(intake, `${product}.csv`))
    }
    const prepared = run(process.execPath, [PREPARE, '--data-dir', intake, '--out', preparation])
    assert.equal(prepared.status, 0, prepared.stderr)

    const created = run(process.execPath, [TOOL, 'prepare', '--preparation', preparation, '--workspace', workspace])
    assert.equal(created.status, 0, created.stderr)
    const receipt = JSON.parse(created.stdout)
    assert.equal(receipt.contract, 'supermega.client_portal_workspace.v1')
    assert.equal(receipt.productCount, 4)
    assert.equal(receipt.connectionCount, 3)
    assert.equal(receipt.safeEntryFilename, 'START-HERE.html')
    assert.equal(receipt.terminalReceiptContainsClientIdentity, false)
    assert.equal(receipt.externalWritesPerformed, false)
    assert.equal(receipt.tenantWritesPerformed, false)
    assert.doesNotMatch(created.stdout, new RegExp(`${privateBusiness}|${privateOwner}|private-client-workspace`))

    const manifest = JSON.parse(await readFile(join(workspace, 'client-workspace-manifest.json'), 'utf8'))
    assert.equal(manifest.products.length, 4)
    assert.deepEqual(manifest.products.map((product) => product.productId), ['shop', 'plant', 'website', 'ecommerce'])
    assert.deepEqual(manifest.connections.map((connection) => connection.id), ['website-shop-intake', 'ecommerce-shop-orders', 'shop-plant-demand'])
    assert.equal(manifest.controls.privateLocalWorkspace, true)
    assert.equal(manifest.controls.productionActivationPerformed, false)
    const dashboard = await readFile(join(workspace, 'START-HERE.html'), 'utf8')
    assert.match(dashboard, /One clear path to launch/)
    assert.doesNotMatch(dashboard, new RegExp(`${privateBusiness}|${privateOwner}`))
    const retainedPreparation = await readFile(join(workspace, 'client-preparation.private.json'), 'utf8')
    assert.match(retainedPreparation, new RegExp(privateBusiness))

    const verified = run(process.execPath, [TOOL, 'verify', '--workspace', workspace])
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).workspaceDigest, receipt.workspaceDigest)
    assert.doesNotMatch(verified.stdout, new RegExp(`${privateBusiness}|${privateOwner}|private-client-workspace`))

    const duplicate = run(process.execPath, [TOOL, 'prepare', '--preparation', preparation, '--workspace', workspace])
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.stderr, /output_exists/)

    await writeFile(join(workspace, 'START-HERE.html'), `${dashboard}\nchanged`)
    const tampered = run(process.execPath, [TOOL, 'verify', '--workspace', workspace])
    assert.notEqual(tampered.status, 0)
    assert.match(tampered.stderr, /stale_or_altered|manifest_stale_or_altered/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
