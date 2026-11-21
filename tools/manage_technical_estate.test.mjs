import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  MANAGED_READINESS_SEMANTIC_RECEIPT_PATH,
  TECHNICAL_ESTATE_DIRECT_SOURCE_PATHS,
  TECHNICAL_ESTATE_PRODUCT_SOURCE_PATHS,
  managedReadinessSemanticProjection,
  technicalEstateSourceReceipts,
  validateTechnicalEstate,
} from './manage_technical_estate.mjs'
import {
  readinessDigest,
  validateManagedPilotReadiness,
} from '../kernel/managed-pilot-readiness.mjs'

const root = resolve(import.meta.dirname, '..')
const execFileAsync = promisify(execFile)

async function directTexts() {
  return new Map(await Promise.all(TECHNICAL_ESTATE_DIRECT_SOURCE_PATHS.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')])))
}

async function currentReadiness() {
  return JSON.parse(await readFile(resolve(root, 'hq/readiness/managed-pilot-readiness.json'), 'utf8'))
}

async function syntheticV14Readiness() {
  const readiness = await currentReadiness()
  readiness.localDatabase = {
    contract: 'supermega.hq.database-rehearsal.v3',
    schemaVersion: 14,
    schemaProfile: 'v14-shop-correction',
    migrationCount: 24,
    implementationCommit: 'a'.repeat(40),
    implementationTree: 'b'.repeat(40),
    implementationDigest: `sha256:${'c'.repeat(64)}`,
    receiptDigest: `sha256:${'d'.repeat(64)}`,
    behaviorChecks: 79,
    catalogChecksBefore: 33,
    catalogChecksAfter: 33,
    hostedEvidenceCurrent: false,
  }
  readiness.liveProduction.localTargetVersion = 14
  readiness.liveProduction.versionDrift = 14 - readiness.liveProduction.schemaVersion
  readiness.gates.find((gate) => gate.id === 'managed_persistence').evidence =
    'Historical seven-proof hosted audit is retained for its deleted branch; it does not bind current schema v14, billing, durable signup limits, Shop correction consumption or this candidate.'
  const securityGate = readiness.gates.find((gate) => gate.id === 'security')
  securityGate.evidence = `Historical ${readiness.securityAudit.advisorStatus} audit (${readiness.securityAudit.findingCount} findings) observed managed schema v${readiness.securityAudit.liveSchemaVersion} against its then-target v${readiness.securityAudit.localTargetVersion}. Current schema v14 and this candidate require new hosted security evidence; older findings and local quarantine tests are not current production proof.`
  securityGate.nextAction = 'Obtain fresh schema v14, privilege/RLS, session/billing and Shop correction-consumption evidence for this candidate on an owner-approved isolated target; retain prior security audits only as history.'
  return validateManagedPilotReadiness(readiness)
}

test('tracked v13 readiness remains rejected until a genuine v14 receipt exists', async () => {
  const tracked = await currentReadiness()
  assert.throws(
    () => validateManagedPilotReadiness(tracked),
    /managed_pilot_readiness_local_database_invalid/,
  )
})

test('technical estate binds the full validated readiness semantic projection, not receipt-internal metadata', async () => {
  const texts = await directTexts()
  const readiness = await syntheticV14Readiness()
  const refreshed = structuredClone(readiness)
  refreshed.sourceReceipts[0].digest = `sha256:${'a'.repeat(64)}`
  refreshed.sourceDigest = readinessDigest(refreshed.sourceReceipts)

  assert.deepEqual(managedReadinessSemanticProjection(refreshed), managedReadinessSemanticProjection(readiness))
  assert.deepEqual(technicalEstateSourceReceipts(texts, refreshed), technicalEstateSourceReceipts(texts, readiness))
  assert.equal(technicalEstateSourceReceipts(texts, readiness).at(-1).path, MANAGED_READINESS_SEMANTIC_RECEIPT_PATH)
})

test('technical estate still rejects invalid readiness and binds direct-source or readiness-policy drift', async () => {
  const texts = await directTexts()
  const readiness = await syntheticV14Readiness()
  const sourceTampered = new Map(texts)
  sourceTampered.set('package.json', `${texts.get('package.json')} `)
  assert.notDeepEqual(technicalEstateSourceReceipts(sourceTampered, readiness), technicalEstateSourceReceipts(texts, readiness))

  const invalid = structuredClone(readiness)
  invalid.controls.productionWritesEnabled = true
  assert.throws(() => managedReadinessSemanticProjection(invalid), /managed_pilot_readiness_controls_invalid/)
})

test('one managed-readiness refresh followed by one technical-estate regeneration converges and verifies', async () => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'supermega-estate-'))
  try {
    for (const path of [
      'tools/manage_technical_estate.mjs',
      'tools/postgres17_source_registry.mjs',
      'tools/postgres17_toolchain_profile.mjs',
      'kernel/managed-pilot-readiness.mjs',
      'kernel/database-rehearsal-evidence.mjs',
      ...TECHNICAL_ESTATE_DIRECT_SOURCE_PATHS,
    ]) {
      const destination = resolve(fixtureRoot, path)
      await mkdir(dirname(destination), { recursive: true })
      await cp(resolve(root, path), destination)
    }
    for (const path of Object.values(TECHNICAL_ESTATE_PRODUCT_SOURCE_PATHS).flat()) {
      const destination = resolve(fixtureRoot, path)
      const metadata = await stat(resolve(root, path))
      if (metadata.isDirectory()) await mkdir(destination, { recursive: true })
      else {
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, '')
      }
    }
    const readinessPath = resolve(fixtureRoot, 'hq/readiness/managed-pilot-readiness.json')
    await mkdir(dirname(readinessPath), { recursive: true })
    const refreshed = await syntheticV14Readiness()
    refreshed.sourceReceipts[0].digest = `sha256:${'b'.repeat(64)}`
    refreshed.sourceDigest = readinessDigest(refreshed.sourceReceipts)
    await writeFile(readinessPath, `${JSON.stringify(refreshed, null, 2)}\n`)

    const generator = resolve(fixtureRoot, 'tools/manage_technical_estate.mjs')
    await execFileAsync(process.execPath, [generator], { cwd: fixtureRoot })
    const generated = await readFile(resolve(fixtureRoot, 'hq/technical-estate.json'), 'utf8')
    const estate = JSON.parse(generated)
    assert.equal(estate.supabase.schemaAuthority.localTargetVersion, 14)
    assert.equal(estate.supabase.schemaAuthority.currentStateRevalidated, false)
    for (const mutate of [s => { s.publicBrowserQuarantine = true }, s => { s.currentStateRevalidated = true },
      s => { s.localTargetVersion = 11 }, s => { s.versionDrift = 0 }]) {
      const changed = structuredClone(estate)
      mutate(changed.supabase.schemaAuthority)
      assert.throws(() => validateTechnicalEstate(changed), /technical_estate_supabase_quarantine_invalid/)
    }
    await execFileAsync(process.execPath, [generator, '--verify'], { cwd: fixtureRoot })
    assert.equal(await readFile(resolve(fixtureRoot, 'hq/technical-estate.json'), 'utf8'), generated)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
