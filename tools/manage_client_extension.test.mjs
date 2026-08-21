import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const tool = resolve(root, 'tools', 'manage_client_extension.mjs')
const prepare = resolve(root, 'tools', 'prepare_client_demo.mjs')

function run(...args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 90_000 })
}

function output(result) {
  return JSON.parse((result.stdout || result.stderr).trim())
}

test('internal extension tool creates and verifies a no-write request and activation plan', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'supermega-extension-'))
  const intake = resolve(directory, 'intake')
  const initialized = run(prepare, '--init', intake, '--preset', 'service-business', '--products', 'shop,website,ecommerce')
  assert.equal(initialized.status, 0, initialized.stderr)
  const profilePath = resolve(intake, 'client.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf8'))
  profile.workspace = 'Named Spa Workspace'
  profile.owner = 'Named Spa Owner'
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`)
  const preparation = resolve(directory, 'private-review.json')
  const prepared = run(prepare, '--data-dir', intake, '--out', preparation)
  assert.equal(prepared.status, 0, prepared.stderr)

  const requestPath = resolve(directory, 'extension-request.json')
  await writeFile(requestPath, `${JSON.stringify({
    id: 'ext-spa-membership',
    label: 'Spa membership packages',
    outcome: 'Track reviewed package balances through the existing Shop payment authority.',
    baseProduct: 'commerce',
    domain: 'customer',
    mode: 'reviewed-write',
    records: ['membership_plan', 'membership_balance', 'membership_redemption'],
    roles: ['Spa manager', 'Front desk operator'],
    dependsOn: ['shop-order-to-cash', 'shop-customer-credit', 'platform-approval'],
    acceptanceCriteria: ['Drafting never charges a customer.', 'A reviewed Shop payment creates one balance.'],
  }, null, 2)}\n`)
  const manifestPath = resolve(directory, 'extension-manifest.json')
  const requested = run(tool, 'request', '--preparation', preparation, '--request', requestPath, '--created-at', '2026-08-21T00:00:00.000Z', '--output', manifestPath)
  assert.equal(requested.status, 0, requested.stderr)
  assert.equal(output(requested).externalWritesPerformed, false)
  const duplicateOutput = run(tool, 'request', '--preparation', preparation, '--request', requestPath, '--created-at', '2026-08-21T00:00:00.000Z', '--output', manifestPath)
  assert.notEqual(duplicateOutput.status, 0)
  const verifiedRequest = run(tool, 'verify-request', '--preparation', preparation, '--manifest', manifestPath)
  assert.equal(verifiedRequest.status, 0, verifiedRequest.stderr)

  const digest = (character) => `sha256:${character.repeat(64)}`
  const evidencePath = resolve(directory, 'activation-evidence.json')
  await writeFile(evidencePath, `${JSON.stringify({
    implementationVersion: 1,
    implementationDigest: digest('1'),
    migrationDigest: digest('2'),
    rollbackDigest: digest('3'),
    securityReviewDigest: digest('4'),
    securityReviewedBy: 'Named Security Reviewer',
    securityReviewedAt: '2026-08-21T01:00:00.000Z',
    approvedBy: 'Named Spa Owner',
    approvedAt: '2026-08-21T02:00:00.000Z',
  }, null, 2)}\n`)
  const planPath = resolve(directory, 'activation-plan.json')
  const planned = run(tool, 'plan', '--preparation', preparation, '--manifest', manifestPath, '--evidence', evidencePath, '--output', planPath)
  assert.equal(planned.status, 0, planned.stderr)
  assert.equal(output(planned).status, 'planned-not-applied')
  const verifiedPlan = run(tool, 'verify-plan', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath)
  assert.equal(verifiedPlan.status, 0, verifiedPlan.stderr)
  assert.equal(output(verifiedPlan).externalWritesPerformed, false)

  const tampered = JSON.parse(await readFile(planPath, 'utf8'))
  tampered.implementation.version = 2
  await writeFile(planPath, `${JSON.stringify(tampered, null, 2)}\n`)
  const rejected = run(tool, 'verify-plan', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath)
  assert.notEqual(rejected.status, 0)
  assert.match(output(rejected).error, /invalid|stale|changed/)
})
