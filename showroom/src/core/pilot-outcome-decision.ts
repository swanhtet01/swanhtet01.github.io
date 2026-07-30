import { sha256Hex } from './managed-trial-proof.ts'
import { type PilotOutcomeReport, type PilotOutcomeReview } from './pilot-outcome.ts'

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

type OutcomeDecisionClaim = {
  id: string
  claimType: 'fact' | 'analysis'
  statement: string
  sourceReference: string
  capturedAt: string
  status: 'verified'
  uncertainty: 'low'
  visibility: 'private'
  digest: string
}

export type PilotOutcomeDecisionApproval = {
  id: string
  createdAt: string
  title: string
  requestedBy: string
  requestedActorKind: 'human'
  packet: {
    contract: 'decision_packet.v1'
    subject: { kind: 'pilot_outcome'; id: string; version: 1 }
    decision: string
    claims: OutcomeDecisionClaim[]
    baseline: string
    target: string
    result: string
    acceptance: string
    artifactReference: string
  }
  packetFingerprint: string
  status: 'approved'
  decidedAt: string
  decidedBy: string
  decidedActorKind: 'human'
  decisionNote: string
  managed: false
}

function visibleText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) return ''
  return Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  }) ? '' : normalized
}

function metricText(value: number, unit: string) {
  return `${value} ${unit}`
}

export function buildPilotOutcomeDecisionApproval(
  report: PilotOutcomeReport,
  review: PilotOutcomeReview,
  acceptanceEvidence: string,
): PilotOutcomeDecisionApproval {
  const owner = visibleText(report.owner, 80)
  const acceptance = visibleText(acceptanceEvidence, 240) || 'The named owner accepted the exact measured result.'
  if (!owner
    || review.decision !== 'accepted'
    || review.reviewedBy !== owner
    || review.reportDigest !== report.reportDigest
    || !Number.isFinite(Date.parse(review.reviewedAt))
    || !['target_met', 'improved'].includes(report.outcomeStatus)
    || report.rawRecordsIncluded !== false
    || report.externalWritesPerformed !== false
    || !SHA256_DIGEST.test(report.reportDigest)
    || !SHA256_DIGEST.test(report.baseline.sourceDigest)
    || !SHA256_DIGEST.test(report.current.sourceDigest)) {
    throw new Error('Pilot outcome decision requires exact named-owner acceptance of a clear or improved aggregate result.')
  }

  const digestToken = report.reportDigest.slice('sha256:'.length, 'sha256:'.length + 16).toUpperCase()
  const id = `APR-PILOT-${digestToken}`
  const artifactReference = `local://pilot-outcome/${report.reportDigest}`
  const claims: OutcomeDecisionClaim[] = [
    {
      id: `${id}-CLM-1`,
      claimType: 'fact',
      statement: `Starting ${report.baseline.label}: ${metricText(report.baseline.value, report.baseline.unit)}.`,
      sourceReference: `${artifactReference}/baseline`,
      capturedAt: review.reviewedAt,
      status: 'verified',
      uncertainty: 'low',
      visibility: 'private',
      digest: report.baseline.sourceDigest,
    },
    {
      id: `${id}-CLM-2`,
      claimType: 'fact',
      statement: `Current ${report.current.label}: ${metricText(report.current.value, report.current.unit)}.`,
      sourceReference: `${artifactReference}/current`,
      capturedAt: review.reviewedAt,
      status: 'verified',
      uncertainty: 'low',
      visibility: 'private',
      digest: report.current.sourceDigest,
    },
    {
      id: `${id}-CLM-3`,
      claimType: 'analysis',
      statement: `Measured outcome ${report.outcomeStatus}; change ${report.change}.`,
      sourceReference: artifactReference,
      capturedAt: review.reviewedAt,
      status: 'verified',
      uncertainty: 'low',
      visibility: 'private',
      digest: report.reportDigest,
    },
  ]
  const packet = {
    contract: 'decision_packet.v1' as const,
    subject: { kind: 'pilot_outcome' as const, id: report.reportDigest, version: 1 as const },
    decision: `Accept the measured ${report.product} pilot outcome for premium handoff.`,
    claims,
    baseline: metricText(report.baseline.value, report.baseline.unit),
    target: `Improve ${report.baseline.label} from the recorded starting point.`,
    result: `${report.outcomeStatus}; ${metricText(report.current.value, report.current.unit)}; change ${report.change}.`,
    acceptance,
    artifactReference,
  }
  const packetFingerprint = `sha256:${sha256Hex(JSON.stringify(packet))}`

  return {
    id,
    createdAt: review.reviewedAt,
    title: `Accept ${report.product} pilot outcome`,
    requestedBy: owner,
    requestedActorKind: 'human',
    packet,
    packetFingerprint,
    status: 'approved',
    decidedAt: review.reviewedAt,
    decidedBy: owner,
    decidedActorKind: 'human',
    decisionNote: `Named owner accepted exact aggregate outcome ${report.reportDigest}; no raw records or external writes were included.`,
    managed: false,
  }
}
