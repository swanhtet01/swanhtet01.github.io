import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'

const corpus = JSON.parse(readFileSync(new URL('./catalog_mapping_corpus.json', import.meta.url), 'utf8'))
assert.equal(corpus.provenance, 'synthetic')
for (const scenario of corpus.cases) {
  test(`catalog mapping baseline: ${scenario.id}`, async () => {
    const result = await createClientImportPreview(scenario.csv, 'commerce')
    assert.equal(result.rows.filter(row => row.status === 'ready').length, scenario.ready)
    if (scenario.ambiguous) {
      assert.equal(result.mapping[scenario.ambiguous], '')
      assert.equal(result.suggestions.find(item => item.field === scenario.ambiguous).basis, 'ambiguous')
    }
    for (const [field, value] of Object.entries(scenario.values ?? {})) {
      assert.equal(result.rows[0].values[field], value)
    }
  })
}
