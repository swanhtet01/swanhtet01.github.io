import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { hasPGliteRuntimeContract } from './verify_migration_verifier_runtime_contract.mjs'

const source = await readFile('tools/verify_private_trial_migrations.mjs', 'utf8')

test('current migration verifier retains its executable PGlite loader contract', () => {
  assert.equal(hasPGliteRuntimeContract(source), true)
})

test('missing or substituted PGlite execution paths fail closed', () => {
  const mutations = [
    source.replace("import('@electric-sql/pglite')", "import('@example/pglite')"),
    source.replace("('@electric-sql/pglite').PGlite", "('@example/pglite').PGlite"),
    source.replace('const loadPGlite = async () => {', 'const loadPGlite = () => {'),
    source.replace('const PGlite = await loadPGlite()', 'const PGlite = undefined'),
  ]

  for (const mutation of mutations) {
    assert.equal(hasPGliteRuntimeContract(mutation), false)
  }
  assert.equal(hasPGliteRuntimeContract(null), false)
})

test('dead or commented loader tokens cannot satisfy the top-level contract', () => {
  const disabled = source
    .replace("return (await import('@electric-sql/pglite')).PGlite", 'return globalThis.NotPGlite')
    .replace("return createRequire(resolve(moduleRoot, 'package.json'))('@electric-sql/pglite').PGlite",
      'return globalThis.NotPGlite')
    .replace('const PGlite = await loadPGlite()', 'const PGlite = globalThis.NotPGlite')
  const commentedTokens = `${disabled}\n/*\n${source.slice(0, source.indexOf('import { verifySelfServeAttemptBudget'))}\n*/\n`
  assert.equal(hasPGliteRuntimeContract(commentedTokens), false)
})
