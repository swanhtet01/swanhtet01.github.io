import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT,
  createShopSpaOwnerOnboardingPacket,
  shopSpaOwnerOnboardingPacketFiles,
  verifyShopSpaOwnerOnboardingPacket,
} from './create_shop_spa_owner_onboarding_packet.mjs'

const expectedFiles = [
  'NO-EXTERNAL-ACTION.md',
  'START-HERE.md',
  'contact-event.sample.json',
  'five-day-proof-plan.md',
  'owner-input.template.json',
  'packet.json',
  'sample-client-import.csv',
  'sample-spa-services.csv',
]

test('creates a deterministic private Shop Spa owner onboarding packet', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-spa-owner-packet-'))
  const workspace = join(parent, 'packet')
  try {
    const created = await createShopSpaOwnerOnboardingPacket(workspace)
    assert.equal(created.contract, SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT)
    assert.equal(created.product, 'shop')
    assert.equal(created.pilotMode, 'owner_named')
    assert.equal(created.verticalPack, 'spa-services')
    assert.equal(created.stage, 'local-owner-review-required')
    assert.equal(created.filesCreated, expectedFiles.length)
    assert.equal(created.externalWritesPerformed, false)
    assert.equal(created.customerContactPerformed, false)
    assert.equal(created.paymentPerformed, false)
    assert.equal(created.deploymentPerformed, false)
    assert.deepEqual((await readdir(workspace)).sort(), expectedFiles)
    assert.equal((await verifyShopSpaOwnerOnboardingPacket(workspace)).verified, true)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('packet copy is practical, generic Shop first, and Spa only as the vertical pack', () => {
  const files = shopSpaOwnerOnboardingPacketFiles()
  assert.match(files['START-HERE.md'], /Start your SuperMega Shop pilot/)
  assert.match(files['START-HERE.md'], /Product: Shop/)
  assert.match(files['START-HERE.md'], /Vertical pack: Spa services/)
  assert.match(files['START-HERE.md'], /Shop baseline: weekly orders/)
  assert.match(files['START-HERE.md'], /Spa services vertical pack: client import rows/)
  assert.match(files['five-day-proof-plan.md'], /Package sale/)
  assert.match(files['five-day-proof-plan.md'], /Treatment redemption/)
  assert.doesNotMatch(files['START-HERE.md'], /\bPOS\b/i)
  assert.doesNotMatch(files['START-HERE.md'], /SAP replacement|Odoo replacement/i)
})

test('packet metadata and owner template preserve closed authority gates', () => {
  const files = shopSpaOwnerOnboardingPacketFiles()
  const manifest = JSON.parse(files['packet.json'])
  const owner = JSON.parse(files['owner-input.template.json'])
  assert.equal(manifest.product, 'shop')
  assert.equal(manifest.pilotMode, 'owner_named')
  assert.equal(manifest.verticalPack, 'spa-services')
  assert.equal(owner.product, 'shop')
  assert.equal(owner.pilotMode, 'owner_named')
  assert.equal(owner.verticalPack, 'spa-services')
  for (const key of [
    'customerContactAllowed',
    'externalMessagesAllowed',
    'paymentAllowed',
    'stockMovementAllowed',
    'accountingPostingAllowed',
    'deploymentAllowed',
    'productionActivationAllowed',
    'hostedWritesAllowed',
  ]) assert.equal(manifest.authority[key], false)
  for (const key of [
    'contactIsNamedOperator',
    'contactBaselineReviewed',
    'isolatedNonProductionTenantApproved',
    'namedOperatorAuthorized',
    'pilotDataHandlingApproved',
    'ownerReviewedCommercialDraft',
  ]) assert.equal(owner[key], false)
})

test('packet contains sample-only data and no network-capable browser code', () => {
  const combined = Object.values(shopSpaOwnerOnboardingPacketFiles()).join('\n')
  assert.match(combined, /Sample Spa/)
  assert.match(combined, /owner@example\.invalid/)
  assert.match(combined, /sample only/)
  assert.doesNotMatch(combined, /\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/)
  assert.doesNotMatch(combined, /https?:\/\/(?!example\.invalid)/)
  assert.doesNotMatch(combined, /thesw|swanhtet|private@example\.com|workspace-private@example\.com/i)
})

test('CLI creates, verifies, refuses overwrite, and detects tampering', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-spa-owner-packet-cli-'))
  const workspace = join(parent, 'packet')
  const tool = resolve('tools/create_shop_spa_owner_onboarding_packet.mjs')
  try {
    const created = spawnSync(process.execPath, [tool, '--workspace', workspace], { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    const receipt = JSON.parse(created.stdout)
    assert.equal(receipt.contract, SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT)
    assert.equal(receipt.customerContactPerformed, false)
    assert.match(receipt.packetSha256, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(created.stdout, /Sample Spa|owner@example\.invalid/)

    const verified = spawnSync(process.execPath, [tool, '--verify', '--workspace', workspace], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).verified, true)

    const overwrite = spawnSync(process.execPath, [tool, '--workspace', workspace], { encoding: 'utf8' })
    assert.notEqual(overwrite.status, 0)
    assert.match(overwrite.stderr, /EEXIST/)

    await writeFile(join(workspace, 'START-HERE.md'), `${await readFile(join(workspace, 'START-HERE.md'), 'utf8')}\nchanged\n`)
    const tampered = spawnSync(process.execPath, [tool, '--verify', '--workspace', workspace], { encoding: 'utf8' })
    assert.notEqual(tampered.status, 0)
    assert.match(tampered.stderr, /shop_spa_owner_packet_stale_or_tampered/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
