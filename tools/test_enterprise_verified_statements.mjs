import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      OWNER_VERIFICATION_SCHEMA,
      buildOwnerVerification,
      verifyOwnerVerification,
      computeOwnerVerificationDigest,
    } from './enterprise-verified-statements.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/verified-statements-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  OWNER_VERIFICATION_SCHEMA,
  buildOwnerVerification,
  verifyOwnerVerification,
  computeOwnerVerificationDigest,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ARTIFACT_DIGEST = 'sha256:' + 'a'.repeat(64)
const VERIFIED_AT = '2026-08-11T14:30:00.000Z'
const VERIFIED_BY = 'swan@supermega.dev'
const REVIEW_EVIDENCE = 'Reviewed line items 1-47, balance matches close-2026-08-11, totals agree'

// 1. Schema constant is correct
check(OWNER_VERIFICATION_SCHEMA === 'supermega.owner-verification.v1', 'schema constant value')

// 2. buildOwnerVerification returns a valid artifact
const v1 = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: REVIEW_EVIDENCE,
})
check(v1 !== null, 'buildOwnerVerification returns non-null for valid input')
check(v1.schema === OWNER_VERIFICATION_SCHEMA, 'built artifact has correct schema')
check(v1.artifactDigest === ARTIFACT_DIGEST, 'built artifact stores artifactDigest')
check(v1.verifiedAt === VERIFIED_AT, 'built artifact stores verifiedAt')
check(v1.verifiedBy === VERIFIED_BY, 'built artifact stores verifiedBy')
check(v1.reviewEvidence === REVIEW_EVIDENCE, 'built artifact stores reviewEvidence')
check(typeof v1.verificationDigest === 'string', 'verificationDigest is a string')
check(v1.verificationDigest.startsWith('sha256:'), 'verificationDigest starts with sha256:')

// 3. verifyOwnerVerification confirms a freshly built artifact
check(await verifyOwnerVerification(v1), 'freshly built artifact verifies true')

// 4. Deterministic: same inputs produce the same digest
const v2 = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: REVIEW_EVIDENCE,
})
check(v1.verificationDigest === v2.verificationDigest, 'same inputs produce same verificationDigest')

// 5. Different artifact digest → different verificationDigest
const vDiff = await buildOwnerVerification({
  artifactDigest: 'sha256:' + 'b'.repeat(64),
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: REVIEW_EVIDENCE,
})
check(vDiff !== null, 'different artifactDigest builds artifact')
check(vDiff.verificationDigest !== v1.verificationDigest, 'different artifactDigest produces different verificationDigest')

// 6. Tampered artifactDigest fails verification
const tampered1 = { ...v1, artifactDigest: 'sha256:' + '0'.repeat(64) }
check(!(await verifyOwnerVerification(tampered1)), 'tampered artifactDigest fails verification')

// 7. Tampered verifiedBy fails verification
const tampered2 = { ...v1, verifiedBy: 'other@supermega.dev' }
check(!(await verifyOwnerVerification(tampered2)), 'tampered verifiedBy fails verification')

// 8. Tampered reviewEvidence fails verification
const tampered3 = { ...v1, reviewEvidence: 'Tampered review note that is long enough' }
check(!(await verifyOwnerVerification(tampered3)), 'tampered reviewEvidence fails verification')

// 9. Tampered verifiedAt fails verification
const tampered4 = { ...v1, verifiedAt: '2026-08-12T00:00:00.000Z' }
check(!(await verifyOwnerVerification(tampered4)), 'tampered verifiedAt fails verification')

// 10. Wrong schema in verificationDigest check is rejected
const tampered5 = { ...v1, schema: 'supermega.owner-verification.v0' }
check(!(await verifyOwnerVerification(tampered5)), 'wrong schema is rejected by verifyOwnerVerification')

// 11. reviewEvidence shorter than 20 chars returns null
const shortEvidence = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: 'Too short',
})
check(shortEvidence === null, 'reviewEvidence < 20 chars returns null')

// 12. Exactly 20 chars evidence is accepted
const exactEvidence = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: 'A'.repeat(20),
})
check(exactEvidence !== null, 'reviewEvidence of exactly 20 chars is accepted')

// 13. artifactDigest not starting with sha256: returns null
const badDigest = await buildOwnerVerification({
  artifactDigest: 'md5:' + 'a'.repeat(32),
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: REVIEW_EVIDENCE,
})
check(badDigest === null, 'artifactDigest not starting with sha256: returns null')

// 14. Empty verifiedBy returns null
const emptyBy = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: '',
  reviewEvidence: REVIEW_EVIDENCE,
})
check(emptyBy === null, 'empty verifiedBy returns null')

// 15. Whitespace-only verifiedBy returns null
const whitespaceBy = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: '   ',
  reviewEvidence: REVIEW_EVIDENCE,
})
check(whitespaceBy === null, 'whitespace-only verifiedBy returns null')

// 16. Missing verifiedAt returns null
const noAt = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: '',
  verifiedBy: VERIFIED_BY,
  reviewEvidence: REVIEW_EVIDENCE,
})
check(noAt === null, 'empty verifiedAt returns null')

// 17. computeOwnerVerificationDigest matches the stored digest
const recomputed = await computeOwnerVerificationDigest(
  v1.artifactDigest,
  v1.verifiedAt,
  v1.verifiedBy,
  v1.reviewEvidence,
)
check(recomputed === v1.verificationDigest, 'recomputed digest matches stored verificationDigest')

// 18. verificationDigest is 71 chars: 'sha256:' + 64 hex chars
check(v1.verificationDigest.length === 71, 'verificationDigest is 71 chars (sha256: prefix + 64 hex)')

// 19. Whitespace-only reviewEvidence returns null (trim check)
const wsEvidence = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: VERIFIED_BY,
  reviewEvidence: ' '.repeat(25),
})
check(wsEvidence === null, 'whitespace-only reviewEvidence returns null')

// 20. Different verifiedBy values produce different digests
const v3 = await buildOwnerVerification({
  artifactDigest: ARTIFACT_DIGEST,
  verifiedAt: VERIFIED_AT,
  verifiedBy: 'other@supermega.dev',
  reviewEvidence: REVIEW_EVIDENCE,
})
check(v3 !== null, 'different verifiedBy builds artifact')
check(v3.verificationDigest !== v1.verificationDigest, 'different verifiedBy produces different digest')

console.log(`\ntest_enterprise_verified_statements: ${checks} checks passed\n`)
