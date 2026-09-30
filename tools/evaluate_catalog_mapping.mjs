import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { reviewCatalogMappingProposal } from '../showroom/src/core/catalog-mapping-proposal.ts'

export async function evaluateCatalogMappings(corpus, responses) {
  if (!Array.isArray(responses)) throw new Error('responses_array_required')
  const ids = responses.map(row => row?.id)
  const expected = corpus.cases.map(row => row.id)
  if (ids.length !== expected.length || new Set(ids).size !== ids.length
    || ids.some(id => !expected.includes(id))) throw new Error('exact_case_coverage_required')
  if (corpus.cases.some(row => row.ready === 0 && !['human_choice_required', 'import_validation_failed'].includes(row.expectedRejection))) {
    throw new Error('expected_rejection_required')
  }
  const results = []
  for (const scenario of corpus.cases) {
    const response = responses.find(row => row.id === scenario.id)
    const result = await reviewCatalogMappingProposal(scenario.csv, [], response.proposal)
    const reviewable = result.status === 'review_required'
    const preserved = !reviewable || Object.entries(scenario.values ?? {}).every(([key, value]) =>
      String(result.preview.rows[0]?.item?.[key]) === value)
    results.push({ id: scenario.id, status: result.status, reason: result.reason ?? null,
      expectationMet: scenario.ready > 0
        ? reviewable && preserved
        : !reviewable && result.reason === scenario.expectedRejection })
  }
  return { schema: 'supermega.catalog-mapping-evaluation.v1',
    evidence: 'offline_synthetic_proposals_not_customer_acceptance',
    technicalPass: results.every(row => row.expectationMet), results,
    modelCalled: false, importExecuted: false, operatorTimeSavings: null, adoptionApproved: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: node tools/evaluate_catalog_mapping.mjs responses.json')
    const corpus = JSON.parse(await readFile(new URL('./catalog_mapping_corpus.json', import.meta.url), 'utf8'))
    const responses = JSON.parse(await readFile(process.argv[2], 'utf8'))
    const result = await evaluateCatalogMappings(corpus, responses)
    console.log(JSON.stringify(result, null, 2))
    if (!result.technicalPass) process.exitCode = 1
  } catch {
    console.error('Catalog evaluation failed: provide valid JSON with exactly one response per corpus case.')
    process.exitCode = 1
  }
}
