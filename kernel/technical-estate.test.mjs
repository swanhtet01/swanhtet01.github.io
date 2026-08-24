import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildTechnicalEstate, estateDigest, validateTechnicalEstate } from './technical-estate.mjs'

const root = resolve(import.meta.dirname, '..')
const paths = [
  'hq/technical-estate-source.json',
  'hq/portfolio.json',
  'site-manifest.json',
  '.github/workflows/supermega-public-release.yml',
]
const texts = new Map(await Promise.all(paths.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')])))
const estate = () => buildTechnicalEstate({
  source: JSON.parse(texts.get(paths[0])),
  portfolio: JSON.parse(texts.get(paths[1])),
  siteManifest: JSON.parse(texts.get(paths[2])),
  workflowText: texts.get(paths[3]),
  sourceReceipts: paths.map((path) => ({ path, digest: estateDigest(texts.get(path)) })),
})

test('maps exactly four products and keeps AI as a shared capability', () => {
  const value = estate()
  assert.equal(value.contract, 'supermega.technical-estate.v1')
  assert.deepEqual(value.products.map((product) => product.productId), ['shop', 'plant', 'website', 'ecommerce'])
  assert.equal(value.sharedCapabilities[0].classification, 'shared-capability-not-product')
  assert.equal(value.infrastructure.vercel.observedProjects.length, 13)
  assert.equal(value.infrastructure.supabase.liveManagedSchemaVersion, 10)
  assert.equal(validateTechnicalEstate(value), value)
})

test('rejects a fifth customer product', () => {
  const source = JSON.parse(texts.get(paths[0]))
  const portfolio = JSON.parse(texts.get(paths[1]))
  portfolio.products.push({ id: 'ai' })
  assert.throws(() => buildTechnicalEstate({ source, portfolio, siteManifest: JSON.parse(texts.get(paths[2])), workflowText: texts.get(paths[3]), sourceReceipts: paths.map((path) => ({ path, digest: estateDigest(texts.get(path)) })) }), /technical_estate_portfolio_invalid/)
})

test('rejects missing owner gates or premature provider authority', () => {
  const value = estate()
  value.ownerGates.pop()
  assert.throws(() => validateTechnicalEstate(value), /technical_estate_lifecycle_invalid/)
  const writable = estate()
  writable.infrastructure.supabase.managedWritesEnabled = true
  assert.throws(() => validateTechnicalEstate(writable), /technical_estate_infrastructure_invalid/)
})

test('rejects stale generated receipts', () => {
  const value = estate()
  value.sourceReceipts[0].digest = estateDigest('tampered')
  assert.throws(() => validateTechnicalEstate(value), /technical_estate_digest_invalid/)
})
