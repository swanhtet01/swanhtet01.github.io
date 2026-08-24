#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

import { TECHNICAL_ESTATE_SOURCE_PATHS, buildTechnicalEstate, estateDigest, validateTechnicalEstate } from '../kernel/technical-estate.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'technical-estate.json')
const sources = TECHNICAL_ESTATE_SOURCE_PATHS

async function currentEstate() {
  const texts = new Map()
  for (const path of sources) texts.set(path, await readFile(resolve(root, path), 'utf8'))
  const sourceReceipts = sources.map((path) => ({ path, digest: estateDigest(texts.get(path)) }))
  return buildTechnicalEstate({
    source: JSON.parse(texts.get('hq/technical-estate-source.json')),
    portfolio: JSON.parse(texts.get('hq/portfolio.json')),
    siteManifest: JSON.parse(texts.get('site-manifest.json')),
    workflowText: texts.get('.github/workflows/supermega-public-release.yml'),
    sourceReceipts,
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && args[0] !== '--verify')) throw new Error('technical_estate_arguments_invalid')
  const expected = await currentEstate()
  if (args[0] === '--verify') {
    const actual = validateTechnicalEstate(JSON.parse(await readFile(output, 'utf8')))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('technical_estate_evidence_stale')
    console.log(JSON.stringify({ ok: true, contract: actual.contract, products: actual.products.length, observedVercelProjects: actual.infrastructure.vercel.observedProjects.length, ownerGates: actual.ownerGates.length }))
    return
  }
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.technical-estate.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(expected, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  console.log(JSON.stringify({ ok: true, contract: expected.contract, output: relative(root, output).split(sep).join('/'), products: expected.products.length, externalWritesPerformed: false }))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || 'technical_estate_failed').slice(0, 240), externalWritesPerformed: false }))
  process.exitCode = 1
})
