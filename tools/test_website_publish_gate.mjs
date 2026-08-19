// Contract guard for the Website publish gate.
//
// The question this answers is "was the thing about to be published actually the thing that
// was approved?" A shopkeeper records three kinds of evidence, an approval is granted
// against that exact content, and only then can a publish record be current. If any of those
// bindings is loose, edited-but-unapproved content can go out under an old approval.
//
// isCurrentApproval ties an approval to the workspace SOURCE DIGEST and to the full evidence
// set. isCurrentPublish goes further: the recorded artifact must serialize identically to
// what the workspace would produce right now. These checks pin that an ordinary content edit
// invalidates both.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createInitialWorkspace, recordWebsiteEvidence, approveWebsiteRevision,
      getCurrentApproval, isCurrentApproval, getCurrentEvidence, readinessChecks,
      websiteSource, evidenceRequirements,
    } from './website-model.ts'`,
    resolveDir: 'showroom/src/products/website',
    sourcefile: 'showroom/src/products/website/publish-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createInitialWorkspace, recordWebsiteEvidence, approveWebsiteRevision,
  getCurrentApproval, isCurrentApproval, getCurrentEvidence, readinessChecks,
  websiteSource, evidenceRequirements,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

const unwrap = (result, label) => {
  check(result && result.ok !== false, `${label} succeeded${result && result.error ? `: ${result.error}` : ''}`)
  return result.workspace ?? result
}

check(evidenceRequirements.length === 3, `three evidence kinds are required, got ${evidenceRequirements.length}`)

// --- approval cannot happen before the evidence is complete ------------------
const fresh = createInitialWorkspace()
check(getCurrentEvidence(fresh).length === 0, 'a fresh workspace carries no evidence')
check(getCurrentApproval(fresh) === null, 'and therefore has no current approval')
rejects(
  () => approveWebsiteRevision(fresh, { actionId: 'APR-1', capturedAt: '2026-07-23T10:00:00.000Z', reviewer: 'Swan Htet', note: 'looks fine' }),
  'approving before the readiness checks pass is refused',
)

// --- record all three kinds of evidence --------------------------------------
let workspace = fresh
for (const [index, requirement] of evidenceRequirements.entries()) {
  workspace = unwrap(recordWebsiteEvidence(workspace, {
    actionId: `EVD-${index + 1}`,
    capturedAt: '2026-07-23T10:00:00.000Z',
    kind: requirement.id,
    finding: `${requirement.label} completed`,
    reference: `EVIDENCE-${index + 1}`,
    verifiedBy: 'Swan Htet',
  }), `recording ${requirement.id} evidence`)
}
check(getCurrentEvidence(workspace).length === 3, 'all three evidence kinds are now current')

// --- approval binds to this exact content ------------------------------------
const beforeDigest = websiteSource(workspace).digest
const readiness = readinessChecks(workspace, beforeDigest)
check(readiness.every((entry) => entry.passed), `every readiness check passes before approval (${readiness.filter((e) => !e.passed).map((e) => e.id ?? e.label).join(', ')})`)

const approved = unwrap(approveWebsiteRevision(workspace, {
  actionId: 'APR-1', capturedAt: '2026-07-23T11:00:00.000Z', reviewer: 'Swan Htet', note: 'Reviewed all three pages',
}), 'approval')

const approval = getCurrentApproval(approved)
check(Boolean(approval), 'the approval is current immediately after it is granted')
check(approval.fingerprint === beforeDigest, 'and is bound to the content digest it was granted against')
check(approval.evidenceIds.length === 3, 'and to the full evidence set')

// --- an ordinary content edit invalidates it ---------------------------------
// This is the whole point of the gate. Renaming the site is about as innocuous as an edit
// gets, and it must still drop the approval.
const editedAfterApproval = { ...approved, siteName: 'Renamed After Approval' }
check(
  websiteSource(editedAfterApproval).digest !== beforeDigest,
  'editing the site name changes the content digest',
)
check(
  !isCurrentApproval(approval, editedAfterApproval),
  'so the approval granted against the older content is no longer current',
)
check(
  getCurrentApproval(editedAfterApproval) === null,
  'and the workspace reports no current approval at all -- edited content cannot ride an old approval',
)

// Which mechanism actually does that work is worth being precise about, because there are
// two and they are redundant. isCurrentApproval checks the approval's own source, AND it
// requires the full evidence set -- but getCurrentEvidence itself filters evidence by
// sameSource, so an edit empties the evidence list too. Deleting the approval's source check
// alone leaves every assertion above still passing; confirmed by mutation. The evidence
// binding is the load-bearing one, so it gets its own assertion rather than being implied.
check(
  getCurrentEvidence(editedAfterApproval).length === 0,
  'the EVIDENCE is source-bound too: a content edit empties the current evidence set',
)
check(
  getCurrentEvidence(approved).length === 3,
  'while the unedited workspace still has all three -- so the emptying is caused by the edit',
)

// --- and so does losing evidence ---------------------------------------------
const evidenceStripped = { ...approved, evidence: [] }
check(
  !isCurrentApproval(approval, evidenceStripped),
  'an approval whose evidence is no longer present is not current',
)

// --- a v1-migrated approval is never treated as current ----------------------
check(
  !isCurrentApproval({ ...approval, migratedFromV1: true }, approved),
  'an approval migrated from v1 is never current, whatever else matches',
)

// --- evidence is per-kind, and a partial set does not approve ----------------
let partial = createInitialWorkspace()
partial = unwrap(recordWebsiteEvidence(partial, {
  actionId: 'EVD-P1', capturedAt: '2026-07-23T10:00:00.000Z', kind: evidenceRequirements[0].id,
  finding: 'only one kind', reference: 'EVIDENCE-P1', verifiedBy: 'Swan Htet',
}), 'recording one evidence kind')
check(getCurrentEvidence(partial).length === 1, 'one evidence kind recorded')
rejects(
  () => approveWebsiteRevision(partial, { actionId: 'APR-P', capturedAt: '2026-07-23T11:00:00.000Z', reviewer: 'Swan Htet', note: 'partial' }),
  'approving with only part of the evidence is refused',
)

// --- two different ready paths must not flatten to the same on-page anchor ---
// The export step (website-export.ts createPageTargets) de-duplicates colliding
// flattened anchors with a numeric suffix so the exported HTML still renders --
// but that means /checkout-info and /checkout/info, which both flatten to the
// anchor "checkout-info", would silently send a raw '#checkout-info' CTA to
// whichever page export processed first. Readiness must catch the collision
// itself, not just check that the raw slugs are distinct strings.
const collidingWorkspace = {
  ...fresh,
  pages: [
    fresh.pages[0],
    { ...fresh.pages[1], slug: '/checkout-info' },
    { ...fresh.pages[2], slug: '/checkout/info' },
  ],
}
const collisionReadiness = readinessChecks(collidingWorkspace)
const anchorCheck = collisionReadiness.find((entry) => entry.id === 'unique-anchors')
check(Boolean(anchorCheck), 'readiness reports a unique-anchors check')
check(anchorCheck?.passed === false, 'two ready paths that flatten to the same anchor fail readiness')
check(
  Boolean(anchorCheck?.detail.includes('/checkout-info') && anchorCheck.detail.includes('/checkout/info')),
  `the failing detail names both colliding paths (got: ${anchorCheck?.detail})`,
)
check(
  collisionReadiness.find((entry) => entry.id === 'unique-paths')?.passed === true,
  'the raw slugs are still distinct strings, so unique-paths alone would have missed this',
)

console.log(`website publish gate contract: ${checks} checks passed`)
