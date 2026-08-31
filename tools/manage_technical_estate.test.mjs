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
} from './manage_technical_estate.mjs'
import { readinessDigest } from '../kernel/managed-pilot-readiness.mjs'

const root = resolve(import.meta.dirname, '..')
const execFileAsync = promisify(execFile)

async function directTexts() {
  return new Map(await Promise.all(TECHNICAL_ESTATE_DIRECT_SOURCE_PATHS.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')])))
}

async function currentReadiness() {
  return JSON.parse(await readFile(resolve(root, 'hq/readiness/managed-pilot-readiness.json'), 'utf8'))
}

test('technical estate binds the full validated readiness semantic projection, not receipt-internal metadata', async () => {
  const texts = await directTexts()
  const readiness = await currentReadiness()
  const refreshed = structuredClone(readiness)
  refreshed.sourceReceipts[0].digest = `sha256:${'a'.repeat(64)}`
  refreshed.sourceDigest = readinessDigest(refreshed.sourceReceipts)

  assert.deepEqual(managedReadinessSemanticProjection(refreshed), managedReadinessSemanticProjection(readiness))
  assert.deepEqual(technicalEstateSourceReceipts(texts, refreshed), technicalEstateSourceReceipts(texts, readiness))
  assert.equal(technicalEstateSourceReceipts(texts, readiness).at(-1).path, MANAGED_READINESS_SEMANTIC_RECEIPT_PATH)
})

test('technical estate still rejects invalid readiness and binds direct-source or readiness-policy drift', async () => {
  const texts = await directTexts()
  const readiness = await currentReadiness()
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
    for (const path of ['tools/manage_technical_estate.mjs', 'kernel/managed-pilot-readiness.mjs', ...TECHNICAL_ESTATE_DIRECT_SOURCE_PATHS, 'hq/readiness/managed-pilot-readiness.json']) {
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
    const refreshed = JSON.parse(await readFile(readinessPath, 'utf8'))
    refreshed.sourceReceipts[0].digest = `sha256:${'b'.repeat(64)}`
    refreshed.sourceDigest = readinessDigest(refreshed.sourceReceipts)
    await writeFile(readinessPath, `${JSON.stringify(refreshed, null, 2)}\n`)

    const generator = resolve(fixtureRoot, 'tools/manage_technical_estate.mjs')
    await execFileAsync(process.execPath, [generator], { cwd: fixtureRoot })
    const generated = await readFile(resolve(fixtureRoot, 'hq/technical-estate.json'), 'utf8')
    await execFileAsync(process.execPath, [generator, '--verify'], { cwd: fixtureRoot })
    assert.equal(await readFile(resolve(fixtureRoot, 'hq/technical-estate.json'), 'utf8'), generated)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
