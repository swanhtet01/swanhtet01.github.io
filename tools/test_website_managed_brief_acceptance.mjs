// Website managed brief acceptance: digest-only projection for a reviewed brief and retained artifact.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { projectWebsiteManagedBriefAcceptance, WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT } from './website-managed-brief-acceptance.ts'
      export { createInitialWorkspace, recordWebsiteEvidence, approveWebsiteRevision, recordWebsiteSnapshot } from '../products/website/website-model.ts'
      export { applyWebsiteStarterBrief } from '../products/website/website-starter.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-managed-brief-acceptance-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  projectWebsiteManagedBriefAcceptance,
  WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT,
  createInitialWorkspace,
  recordWebsiteEvidence,
  approveWebsiteRevision,
  recordWebsiteSnapshot,
  applyWebsiteStarterBrief,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const CAPTURED_AT = '2026-08-25T08:00:00.000Z'
const OWNER_DIGEST = 'sha256:1111111111111111111111111111111111111111111111111111111111111111'
const RESPONSIVE_DIGEST = 'sha256:2222222222222222222222222222222222222222222222222222222222222222'

function brief(extra = {}) {
  return {
    templateId: 'lead-generation',
    businessName: 'SuperMega Test Site',
    audience: 'customers ready to ask for help',
    offer: 'Request one clear next step from the team.',
    proof: 'Every inquiry is reviewed against the same source record before a promise is made.',
    contactHref: '',
    ...extra,
  }
}

function input(extra = {}) {
  return {
    brief: brief(),
    briefCapturedAt: CAPTURED_AT,
    ownerReviewDigest: OWNER_DIGEST,
    responsiveReviewDigest: RESPONSIVE_DIGEST,
    ...extra,
  }
}

function makeReadyWorkspace(sourceBrief = brief()) {
  const seed = createInitialWorkspace()
  const drafted = applyWebsiteStarterBrief(seed, sourceBrief, CAPTURED_AT)
  const ready = {
    ...drafted,
    revision: 1,
    contentRevision: 1,
    pages: drafted.pages.map((page) => ({ ...page, stage: 'ready' })),
  }
  let current = ready
  current = recordWebsiteEvidence(current, {
    actionId: 'EV-CONTENT',
    capturedAt: '2026-08-25T08:10:00.000Z',
    kind: 'content',
    finding: 'Reviewed public copy against the accepted brief digest.',
    reference: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    verifiedBy: 'content-reviewer',
  })
  current = recordWebsiteEvidence(current, {
    actionId: 'EV-RESPONSIVE',
    capturedAt: '2026-08-25T08:20:00.000Z',
    kind: 'responsive',
    finding: 'Reviewed desktop, tablet, and mobile preview.',
    reference: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    verifiedBy: 'responsive-reviewer',
  })
  current = recordWebsiteEvidence(current, {
    actionId: 'EV-LINKS',
    capturedAt: '2026-08-25T08:30:00.000Z',
    kind: 'links',
    finding: 'Reviewed navigation and CTA destinations.',
    reference: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    verifiedBy: 'links-reviewer',
  })
  current = approveWebsiteRevision(current, {
    actionId: 'APPROVE-WEBSITE',
    capturedAt: '2026-08-25T08:40:00.000Z',
    reviewer: 'owner-reviewer',
    note: 'Accepted for retained local Website artifact.',
  })
  current = recordWebsiteSnapshot(current, {
    actionId: 'SNAP-WEBSITE',
    capturedAt: '2026-08-25T08:50:00.000Z',
  })
  return current
}

// 1. Happy path: ready, digest-only evidence, and no raw reviewer text in projection.
{
  const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(), input())
  check(r.contract === WEBSITE_MANAGED_BRIEF_ACCEPTANCE_CONTRACT, 'contract stable')
  check(r.readyForManagedRehearsal === true, 'happy path ready')
  check(r.blockingCount === 0, 'happy path zero blockers')
  check(r.metrics.readyPageCount === 3, 'ready page count')
  check(r.metrics.currentEvidenceCount === 3, 'all evidence current')
  check(r.metrics.approvalEvidenceCount === 3, 'approval binds all evidence')
  check(r.metrics.artifactPageCount === 3, 'retained artifact page count')
  check(/^sha256:[0-9a-f]{64}$/.test(r.evidence.briefDigest), 'brief digest is sha256')
  check(r.evidence.expectedBriefRequirementsDigest === r.evidence.retainedBriefRequirementsDigest, 'retained site matches every brief-derived requirement')
  check(/^sha256:[0-9a-f]{64}$/.test(r.acceptanceDigest), 'acceptance digest is sha256')
  check(!JSON.stringify(r).includes('owner-reviewer'), 'projection does not expose raw owner reviewer')
  check(!JSON.stringify(r).includes('SuperMega Test Site'), 'projection does not expose raw business name')
}

// 1a. Complete brief-derived matching remains digest-only in owner-facing output.
{
  const privateBrief = brief({
    businessName: 'Private Business Marker',
    audience: 'Private Audience Marker',
    offer: 'Private Offer Marker',
    proof: 'Private Proof Marker',
    contactHref: 'https://example.com/private-contact-marker',
  })
  const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(privateBrief), input({ brief: privateBrief }))
  const serialized = JSON.stringify(r)
  check(r.readyForManagedRehearsal === true, 'complete private brief can be accepted when retained content matches')
  for (const marker of ['Private Business Marker', 'Private Audience Marker', 'Private Offer Marker', 'Private Proof Marker', 'private-contact-marker']) {
    check(!serialized.includes(marker), `${marker} is not exposed`)
  }
}

// 2. Invalid brief blocks readiness even if workspace is otherwise accepted.
{
  const r = projectWebsiteManagedBriefAcceptance(createInitialWorkspace(), input())
  check(r.readyForManagedRehearsal === false, 'untouched workspace fails closed')
  check(r.blockingCount > 0, 'untouched workspace reports blockers')
}

// 3. Invalid brief blocks readiness even if workspace is otherwise accepted.
{
  const invalidBrief = brief({ offer: '' })
  const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(), input({ brief: invalidBrief }))
  check(r.readyForManagedRehearsal === false, 'invalid brief blocks')
  check(r.gates.find((gate) => gate.id === 'brief_valid')?.passed === false, 'brief_valid gate fails')
}

// 4. Every individually stale brief field blocks retained-site acceptance.
{
  const staleFields = [
    ['templateId', 'catalog-showcase'],
    ['businessName', 'Different Site'],
    ['audience', 'customers comparing a different need'],
    ['offer', 'Request a different supported next step.'],
    ['proof', 'A different supportable fact was reviewed for this stale brief.'],
    ['contactHref', 'https://example.com/different-contact'],
  ]
  for (const [field, value] of staleFields) {
    const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(), input({ brief: brief({ [field]: value }) }))
    check(r.readyForManagedRehearsal === false, `${field} mismatch blocks`)
    check(r.gates.find((gate) => gate.id === 'brief_requirements_match_site')?.passed === false, `${field} requirement gate fails`)
    check(r.evidence.expectedBriefRequirementsDigest !== r.evidence.retainedBriefRequirementsDigest, `${field} changes the expected requirements digest`)
    if (field === 'businessName') {
      check(r.gates.find((gate) => gate.id === 'brief_business_matches_site')?.passed === false, 'business identity gate still fails')
    }
  }
}

// 5. Missing responsive evidence prevents current approval and readiness.
{
  const sourceBrief = brief()
  const seed = createInitialWorkspace()
  const drafted = applyWebsiteStarterBrief(seed, sourceBrief, CAPTURED_AT)
  let current = { ...drafted, revision: 1, contentRevision: 1, pages: drafted.pages.map((page) => ({ ...page, stage: 'ready' })) }
  current = recordWebsiteEvidence(current, {
    actionId: 'EV-CONTENT',
    capturedAt: '2026-08-25T08:10:00.000Z',
    kind: 'content',
    finding: 'Reviewed content.',
    reference: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    verifiedBy: 'content-reviewer',
  })
  current = recordWebsiteEvidence(current, {
    actionId: 'EV-LINKS',
    capturedAt: '2026-08-25T08:30:00.000Z',
    kind: 'links',
    finding: 'Reviewed links.',
    reference: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    verifiedBy: 'links-reviewer',
  })
  const r = projectWebsiteManagedBriefAcceptance(current, input())
  check(r.readyForManagedRehearsal === false, 'missing evidence blocks')
  check(r.gates.find((gate) => gate.id === 'current_evidence_complete')?.passed === false, 'evidence gate fails')
  check(r.gates.find((gate) => gate.id === 'current_approval_present')?.passed === false, 'approval gate fails')
}

// 6. Accepted workspace without retained snapshot blocks artifact acceptance.
{
  const current = makeReadyWorkspace()
  const withoutPublish = { ...current, localPublishes: [], events: current.events.filter((event) => event.action !== 'local_snapshot_recorded') }
  const r = projectWebsiteManagedBriefAcceptance(withoutPublish, input())
  check(r.readyForManagedRehearsal === false, 'missing retained snapshot blocks')
  check(r.gates.find((gate) => gate.id === 'current_publish_present')?.passed === false, 'publish gate fails')
}

// 7. Same review digest blocks independent review.
{
  const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(), input({ responsiveReviewDigest: OWNER_DIGEST }))
  check(r.readyForManagedRehearsal === false, 'same review digest blocks')
  check(r.gates.find((gate) => gate.id === 'independent_review_digests')?.passed === false, 'independent digest gate fails')
}

// 8. Stale content after approval blocks current approval and publish.
{
  const current = makeReadyWorkspace()
  const stale = { ...current, siteName: 'Changed After Approval' }
  const r = projectWebsiteManagedBriefAcceptance(stale, input())
  check(r.readyForManagedRehearsal === false, 'stale content blocks')
  check(r.gates.find((gate) => gate.id === 'current_approval_present')?.passed === false, 'stale approval gate fails')
  check(r.gates.find((gate) => gate.id === 'current_publish_present')?.passed === false, 'stale publish gate fails')
}

// 9. Migrated evidence blocks managed acceptance.
{
  const current = makeReadyWorkspace()
  const migrated = {
    ...current,
    evidence: current.evidence.map((entry, index) => index === 0 ? { ...entry, migratedFromV1: true } : entry),
  }
  const r = projectWebsiteManagedBriefAcceptance(migrated, input())
  check(r.readyForManagedRehearsal === false, 'migrated evidence blocks')
  check(r.gates.find((gate) => gate.id === 'current_evidence_not_migrated')?.passed === false, 'migrated evidence gate fails')
}

// 10. Invalid capture timestamp blocks readiness.
{
  const r = projectWebsiteManagedBriefAcceptance(makeReadyWorkspace(), input({ briefCapturedAt: '2026-08-25 08:00' }))
  check(r.readyForManagedRehearsal === false, 'invalid timestamp blocks')
  check(r.gates.find((gate) => gate.id === 'brief_timestamp_valid')?.passed === false, 'timestamp gate fails')
}

console.log(JSON.stringify({ ok: true, checks }))
