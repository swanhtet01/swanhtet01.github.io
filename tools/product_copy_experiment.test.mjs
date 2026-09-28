import assert from 'node:assert/strict'
import test from 'node:test'
import { cases, validateDraft } from './product_copy_experiment.mjs'

test('three synthetic product baselines meet bounded copy shape', () => {
  assert.deepEqual(cases.map(row => row.product), ['website','ecommerce','shop'])
  for (const row of cases) assert.equal(validateDraft(row.baseline), true)
})
test('reject malformed, executable, oversized and authority-bearing extra fields', () => {
  const valid = cases[0].baseline
  for (const value of [null, [], {}, {...valid,price:200}, {...valid,headline:' '}, {...valid,description:'x'.repeat(241)}, {...valid,action:'<script>'}, {...valid,action:'go\nnow'}, {...valid,action:3}]) assert.equal(validateDraft(value), false)
})
