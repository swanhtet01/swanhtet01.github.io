// Implementation of the verified-statements enterprise capability.
// See hq/research/enterprise-capabilities-design-2026-08.md Tier 1.
// Gated behind capability 'verified-statements' (enterprise tier, requires managedIdentity).

export const OWNER_VERIFICATION_SCHEMA = 'supermega.owner-verification.v1' as const

export type OwnerVerification = {
  schema: typeof OWNER_VERIFICATION_SCHEMA
  artifactDigest: string    // sha256:… digest of the artifact being verified
  verifiedAt: string        // ISO 8601 timestamp (monotonic managed time in production)
  verifiedBy: string        // authenticated actor identity
  reviewEvidence: string    // minimum 20 chars; summarises what the reviewer checked
  verificationDigest: string // sha256 of fields joined by '|'
}

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return 'sha256:' + Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function verificationPayload(
  artifactDigest: string,
  verifiedAt: string,
  verifiedBy: string,
  reviewEvidence: string,
): string {
  return `${artifactDigest}|${verifiedAt}|${verifiedBy}|${reviewEvidence}`
}

export async function computeOwnerVerificationDigest(
  artifactDigest: string,
  verifiedAt: string,
  verifiedBy: string,
  reviewEvidence: string,
): Promise<string> {
  return sha256hex(verificationPayload(artifactDigest, verifiedAt, verifiedBy, reviewEvidence))
}

export async function buildOwnerVerification(input: {
  artifactDigest: string
  verifiedAt: string
  verifiedBy: string
  reviewEvidence: string
}): Promise<OwnerVerification | null> {
  const evidence = input.reviewEvidence?.trim() ?? ''
  if (evidence.length < 20) return null
  if (!input.artifactDigest.startsWith('sha256:')) return null
  if (!input.verifiedBy.trim()) return null
  if (!input.verifiedAt) return null

  const verificationDigest = await computeOwnerVerificationDigest(
    input.artifactDigest,
    input.verifiedAt,
    input.verifiedBy,
    input.reviewEvidence,
  )

  return {
    schema: OWNER_VERIFICATION_SCHEMA,
    artifactDigest: input.artifactDigest,
    verifiedAt: input.verifiedAt,
    verifiedBy: input.verifiedBy,
    reviewEvidence: input.reviewEvidence,
    verificationDigest,
  }
}

export async function verifyOwnerVerification(verification: OwnerVerification): Promise<boolean> {
  if (verification.schema !== OWNER_VERIFICATION_SCHEMA) return false
  const expected = await computeOwnerVerificationDigest(
    verification.artifactDigest,
    verification.verifiedAt,
    verification.verifiedBy,
    verification.reviewEvidence,
  )
  return expected === verification.verificationDigest
}
