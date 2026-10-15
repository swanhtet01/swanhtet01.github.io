import { readFileSync } from 'node:fs'
import { implementationPaths, proofDigest, sha256 } from './database-rehearsal-evidence.mjs'

// The recorded rehearsal is historical evidence. Unit tests need the current
// contract shape, so this synthetic copy exists only in memory and is never
// saved as a rehearsal receipt or passed to a release workflow.
export function syntheticDatabaseRehearsalFixture() {
  const proof = JSON.parse(readFileSync(new URL('../hq/research/postgres17-rehearsal.json', import.meta.url), 'utf8'))
  proof.migration.names.push('20261015091500_website_six_page_reviews.sql')
  proof.migration.count = proof.migration.names.length
  proof.implementation.paths = [...implementationPaths]
  proof.implementationFileCount = implementationPaths.length
  proof.implementation.digest = sha256('six-page-managed-pilot-unit-fixture')
  proof.implementationDigest = proof.implementation.digest
  proof.receiptDigest = proofDigest(proof)
  return proof
}
