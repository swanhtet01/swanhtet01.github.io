import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

import {
  buildManagedPilotReadiness,
  readinessDigest,
  validateManagedPilotReadiness,
} from '../kernel/managed-pilot-readiness.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')
const sources = [
  'hq/portfolio.json',
  'hq/research/postgres17-rehearsal.json',
  'hq/pilots/private-storage-privacy-audit.md',
  'hq/NOW.md',
  'package.json',
  'kernel/managed-pilot-readiness.mjs',
]

async function currentLedger() {
  const texts = new Map()
  for (const path of sources) texts.set(path, await readFile(resolve(root, path), 'utf8'))
  const sourceReceipts = sources.map((path) => ({ path, digest: readinessDigest(texts.get(path)) }))
  return buildManagedPilotReadiness({
    portfolio: JSON.parse(texts.get('hq/portfolio.json')),
    databaseEvidence: JSON.parse(texts.get('hq/research/postgres17-rehearsal.json')),
    storageAudit: texts.get('hq/pilots/private-storage-privacy-audit.md'),
    hqNow: texts.get('hq/NOW.md'),
    packageManifest: JSON.parse(texts.get('package.json')),
    sourceReceipts,
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && args[0] !== '--verify')) throw new Error('managed_pilot_readiness_arguments_invalid')
  const expected = currentLedger()
  if (args[0] === '--verify') {
    const actual = validateManagedPilotReadiness(JSON.parse(await readFile(output, 'utf8')))
    if (JSON.stringify(actual) !== JSON.stringify(await expected)) throw new Error('managed_pilot_readiness_evidence_stale')
    console.log(JSON.stringify({ ok: true, contract: actual.contract, products: actual.products.length, blockingGates: actual.overall.blockingGateCount, hostedActivationReady: false }))
    return
  }
  const ledger = await expected
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.managed-pilot-readiness.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  console.log(JSON.stringify({ ok: true, contract: ledger.contract, output: relative(root, output).split(sep).join('/'), products: ledger.products.length, blockingGates: ledger.overall.blockingGateCount, hostedActivationReady: false }))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || 'managed_pilot_readiness_failed').slice(0, 240), externalWritesPerformed: false }))
  process.exitCode = 1
})
