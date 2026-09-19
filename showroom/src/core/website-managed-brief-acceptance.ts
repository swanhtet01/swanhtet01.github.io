import { sha256Hex } from './managed-trial-proof.ts'
import {
  createWebsiteArtifact,
  createInitialWorkspace,
  evidenceRequirements,
  getCurrentApproval,
  getCurrentEvidence,
  getCurrentPublish,
  readinessChecks,
  websiteSource,
  workspaceFingerprint,
  type WebsiteWorkspace,
} from '../products/website/website-model.ts'
import {
  applyWebsiteStarterBrief,
  websiteStarterBriefIssues,
  type WebsiteStarterBrief,
} from '../products/website/website-starter.ts'

export const WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT = 'supermega.website-managed-brief-acceptance.v1' as const

export type WebsiteManagedBriefAcceptanceInput = {
  brief: WebsiteStarterBrief
  briefCapturedAt: string
  ownerReviewDigest?: string
  responsiveReviewDigest?: string
}

export type WebsiteManagedBriefAcceptanceGateId =
  | 'brief_valid'
  | 'brief_business_matches_site'
  | 'brief_requirements_match_site'
  | 'brief_timestamp_valid'
  | 'readiness_checks_pass'
  | 'current_evidence_complete'
  | 'current_evidence_not_migrated'
  | 'current_approval_present'
  | 'current_approval_not_migrated'
  | 'current_publish_present'
  | 'retained_artifact_present'
  | 'owner_review_digest_present'
  | 'responsive_review_digest_present'
  | 'independent_review_digests'
  | 'snapshot_after_approval'

export type WebsiteManagedBriefAcceptanceGate = {
  id: WebsiteManagedBriefAcceptanceGateId
  passed: boolean
  reason: string
}

export type WebsiteManagedBriefAcceptanceMetrics = {
  contentRevision: number
  readyPageCount: number
  artifactPageCount: number
  currentEvidenceCount: number
  requiredEvidenceCount: number
  approvalEvidenceCount: number
  readinessPassedCount: number
  readinessTotalCount: number
}

export type WebsiteManagedBriefAcceptanceEvidence = {
  briefDigest: string
  expectedBriefRequirementsDigest: string
  retainedBriefRequirementsDigest: string
  briefCapturedAt: string
  workspaceFingerprint: string
  contentRevision: number
  approvalDigest: string | null
  retainedArtifactDigest: string | null
  publishDigest: string | null
  ownerReviewDigest: string | null
  responsiveReviewDigest: string | null
}

export type WebsiteManagedBriefAcceptance = {
  contract: typeof WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT
  readyForManagedRehearsal: boolean
  blockingCount: number
  gates: WebsiteManagedBriefAcceptanceGate[]
  metrics: WebsiteManagedBriefAcceptanceMetrics
  evidence: WebsiteManagedBriefAcceptanceEvidence
  acceptanceDigest: string
}

const digestPattern = /^sha256:[0-9a-f]{64}$/i

function normalizedLine(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}

function safeTimestamp(value: string) {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

function digest(value: unknown) {
  return `sha256:${sha256Hex(JSON.stringify(value))}`
}

function reviewDigest(value: string | undefined) {
  return value && digestPattern.test(value) ? value.toLowerCase() : null
}

function briefDerivedRequirements(workspace: WebsiteWorkspace) {
  return {
    siteName: workspace.siteName,
    selectedPageId: workspace.selectedPageId,
    pages: workspace.pages.map((page) => ({
      id: page.id,
      internalName: page.internalName,
      slug: page.slug,
      navigation: page.navigation,
      hero: page.hero,
      sections: page.sections,
      seo: page.seo,
      updatedAt: page.updatedAt,
    })),
  }
}

export function projectWebsiteManagedBriefAcceptance(
  workspace: WebsiteWorkspace,
  input: WebsiteManagedBriefAcceptanceInput,
): WebsiteManagedBriefAcceptance {
  const source = websiteSource(workspace)
  const fingerprint = workspaceFingerprint(workspace)
  const briefIssues = websiteStarterBriefIssues(input.brief)
  const expectedBriefWorkspace = applyWebsiteStarterBrief(createInitialWorkspace(), input.brief, input.briefCapturedAt)
  const expectedBriefRequirementsDigest = digest(briefDerivedRequirements(expectedBriefWorkspace))
  const retainedBriefRequirementsDigest = digest(briefDerivedRequirements(workspace))
  const briefRequirementsMatch = briefIssues.length === 0
    && safeTimestamp(input.briefCapturedAt)
    && expectedBriefRequirementsDigest === retainedBriefRequirementsDigest
  const checks = readinessChecks(workspace, fingerprint)
  const currentEvidence = getCurrentEvidence(workspace)
  const approval = getCurrentApproval(workspace)
  const publish = getCurrentPublish(workspace)
  const artifact = publish?.artifact ?? null
  const expectedArtifact = createWebsiteArtifact(workspace)
  const ownerReviewDigest = reviewDigest(input.ownerReviewDigest)
  const responsiveReviewDigest = reviewDigest(input.responsiveReviewDigest)
  const approvalDigest = approval ? digest({
    id: approval.id,
    approvedAt: approval.approvedAt,
    fingerprint: approval.fingerprint,
    evidenceIds: approval.evidenceIds,
    source: approval.source,
  }) : null
  const publishDigest = publish ? digest({
    id: publish.id,
    recordedAt: publish.recordedAt,
    fingerprint: publish.fingerprint,
    approvalId: publish.approvalId,
    evidenceIds: publish.evidenceIds,
    source: publish.source,
    artifactDigest: publish.artifact?.contentDigest ?? null,
  }) : null
  const readyPageCount = workspace.pages.filter((page) => page.stage === 'ready').length
  const readinessPassedCount = checks.filter((check) => check.passed).length

  const gates: WebsiteManagedBriefAcceptanceGate[] = [
    {
      id: 'brief_valid',
      passed: briefIssues.length === 0,
      reason: briefIssues.length === 0 ? 'Business brief is structurally valid.' : `${briefIssues.length} business brief issue(s) remain.`,
    },
    {
      id: 'brief_business_matches_site',
      passed: normalizedLine(input.brief.businessName) === normalizedLine(workspace.siteName),
      reason: normalizedLine(input.brief.businessName) === normalizedLine(workspace.siteName)
        ? 'Brief business name matches the retained site identity.'
        : 'Brief business name does not match the retained site identity.',
    },
    {
      id: 'brief_requirements_match_site',
      passed: briefRequirementsMatch,
      reason: briefRequirementsMatch
        ? 'Every brief-derived requirement matches the retained site content.'
        : 'The retained site content does not match every requirement derived from this brief.',
    },
    {
      id: 'brief_timestamp_valid',
      passed: safeTimestamp(input.briefCapturedAt),
      reason: safeTimestamp(input.briefCapturedAt) ? 'Brief capture timestamp is canonical.' : 'Brief capture timestamp must be canonical ISO.',
    },
    {
      id: 'readiness_checks_pass',
      passed: readinessPassedCount === checks.length,
      reason: readinessPassedCount === checks.length ? 'All Website readiness checks pass.' : `${checks.length - readinessPassedCount} Website readiness check(s) fail.`,
    },
    {
      id: 'current_evidence_complete',
      passed: currentEvidence.length === evidenceRequirements.length,
      reason: currentEvidence.length === evidenceRequirements.length
        ? 'All required evidence kinds are current.'
        : `${evidenceRequirements.length - currentEvidence.length} current evidence kind(s) missing.`,
    },
    {
      id: 'current_evidence_not_migrated',
      passed: currentEvidence.length === evidenceRequirements.length && currentEvidence.every((entry) => !entry.migratedFromV1),
      reason: currentEvidence.length === evidenceRequirements.length && currentEvidence.every((entry) => !entry.migratedFromV1)
        ? 'Current evidence is native to the v2 workflow.'
        : 'Current evidence is missing or includes migrated history.',
    },
    {
      id: 'current_approval_present',
      passed: !!approval,
      reason: approval ? 'Current evidence-bound approval is present.' : 'Current evidence-bound approval is missing.',
    },
    {
      id: 'current_approval_not_migrated',
      passed: !!approval && !approval.migratedFromV1,
      reason: approval && !approval.migratedFromV1 ? 'Current approval is native to the v2 workflow.' : 'Current approval is missing or migrated.',
    },
    {
      id: 'current_publish_present',
      passed: !!publish,
      reason: publish ? 'Current retained local snapshot is present.' : 'Current retained local snapshot is missing.',
    },
    {
      id: 'retained_artifact_present',
      passed: !!artifact && artifact.contentDigest === expectedArtifact.contentDigest,
      reason: artifact && artifact.contentDigest === expectedArtifact.contentDigest
        ? 'Retained artifact matches the current approved website.'
        : 'Retained artifact is missing or stale.',
    },
    {
      id: 'owner_review_digest_present',
      passed: !!ownerReviewDigest,
      reason: ownerReviewDigest ? 'Owner review digest is present.' : 'Owner review digest is missing or not sha256.',
    },
    {
      id: 'responsive_review_digest_present',
      passed: !!responsiveReviewDigest,
      reason: responsiveReviewDigest ? 'Responsive review digest is present.' : 'Responsive review digest is missing or not sha256.',
    },
    {
      id: 'independent_review_digests',
      passed: !!ownerReviewDigest && !!responsiveReviewDigest && ownerReviewDigest !== responsiveReviewDigest,
      reason: ownerReviewDigest && responsiveReviewDigest && ownerReviewDigest !== responsiveReviewDigest
        ? 'Owner and responsive review digests are independent.'
        : 'Owner and responsive review digests must both be present and different.',
    },
    {
      id: 'snapshot_after_approval',
      passed: !!approval && !!publish && Date.parse(publish.recordedAt) >= Date.parse(approval.approvedAt),
      reason: approval && publish && Date.parse(publish.recordedAt) >= Date.parse(approval.approvedAt)
        ? 'Retained snapshot was recorded after approval.'
        : 'Retained snapshot must follow approval.',
    },
  ]

  const evidence: WebsiteManagedBriefAcceptanceEvidence = {
    briefDigest: digest({
      templateId: input.brief.templateId,
      businessName: normalizedLine(input.brief.businessName),
      audience: normalizedLine(input.brief.audience),
      offer: normalizedLine(input.brief.offer),
      proof: normalizedLine(input.brief.proof),
      contactHref: normalizedLine(input.brief.contactHref),
    }),
    expectedBriefRequirementsDigest,
    retainedBriefRequirementsDigest,
    briefCapturedAt: input.briefCapturedAt,
    workspaceFingerprint: fingerprint,
    contentRevision: source.contentRevision,
    approvalDigest,
    retainedArtifactDigest: artifact?.contentDigest ?? null,
    publishDigest,
    ownerReviewDigest,
    responsiveReviewDigest,
  }
  const metrics: WebsiteManagedBriefAcceptanceMetrics = {
    contentRevision: source.contentRevision,
    readyPageCount,
    artifactPageCount: artifact?.pages.length ?? 0,
    currentEvidenceCount: currentEvidence.length,
    requiredEvidenceCount: evidenceRequirements.length,
    approvalEvidenceCount: approval?.evidenceIds.length ?? 0,
    readinessPassedCount,
    readinessTotalCount: checks.length,
  }
  const blockingCount = gates.filter((gate) => !gate.passed).length
  const projection = {
    contract: WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT,
    evidence,
    metrics,
    gates: gates.map((gate) => ({ id: gate.id, passed: gate.passed })),
  }

  return {
    contract: WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT,
    readyForManagedRehearsal: blockingCount === 0,
    blockingCount,
    gates,
    metrics,
    evidence,
    acceptanceDigest: digest(projection),
  }
}
