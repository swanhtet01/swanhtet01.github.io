import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventEvidenceReferenceLengthBrief } from './website-workflow-event-evidence-reference-length-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteWorkflowEventEvidenceReferenceLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evtId = 0
function event(evidenceReference, action = 'publish_evidence_recorded') {
  evtId++
  return {
    id: `WE-${evtId}`,
    createdAt: '2026-08-01T10:00:00Z',
    actorKind: 'human',
    actor: 'alice',
    action,
    subjectId: `subj-${evtId}`,
    reason: 'Routine check',
    evidenceReference,
    source: { contentRevision: 1, digest: `d-${evtId}` },
  }
}

function workspace(events = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'pg-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// Reference strings of known lengths
const SHORT_REF = 'ev-001'                                                             // 6 chars → short
const SHORT2_REF = 'ap-007'                                                             // 6 chars → short
const MEDIUM_REF = 'https://staging.supermega.dev/evidence/content-check-2026-08-01'   // 63 chars → medium
const LONG_REF = 'ev-101,ev-102,ev-103,ev-104,ev-105,ev-106,ev-107,ev-108,ev-109,ev-110,ev-111,ev-112,ev-113,ev-114,ev-115,ev-116,ev-117,ev-118,ev-119' // 127 chars → long

// 1. Empty events
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minLength === null, 'empty: minLength null')
  check(r.maxLength === null, 'empty: maxLength null')
  check(r.averageLength === 0, 'empty: averageLength 0')
}

// 2. Single short evidenceReference (≤40)
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(SHORT_REF)]))
  check(r.totalEvents === 1, 'short: totalEvents 1')
  check(r.shortCount === 1, 'short: shortCount 1')
  check(r.mediumCount === 0, 'short: mediumCount 0')
  check(r.longCount === 0, 'short: longCount 0')
  check(r.shortRate === 100, 'short: shortRate 100')
  check(r.minLength === SHORT_REF.length, 'short: minLength')
  check(r.maxLength === SHORT_REF.length, 'short: maxLength')
  check(r.averageLength === SHORT_REF.length, 'short: averageLength')
}

// 3. Single medium evidenceReference (41-120)
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(MEDIUM_REF)]))
  check(r.totalEvents === 1, 'medium: totalEvents 1')
  check(r.shortCount === 0, 'medium: shortCount 0')
  check(r.mediumCount === 1, 'medium: mediumCount 1')
  check(r.longCount === 0, 'medium: longCount 0')
  check(r.mediumRate === 100, 'medium: mediumRate 100')
  check(r.minLength === MEDIUM_REF.length, 'medium: minLength')
  check(r.maxLength === MEDIUM_REF.length, 'medium: maxLength')
}

// 4. Single long evidenceReference (>120)
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(LONG_REF)]))
  check(r.totalEvents === 1, 'long: totalEvents 1')
  check(r.shortCount === 0, 'long: shortCount 0')
  check(r.mediumCount === 0, 'long: mediumCount 0')
  check(r.longCount === 1, 'long: longCount 1')
  check(r.longRate === 100, 'long: longRate 100')
  check(r.minLength === LONG_REF.length, 'long: minLength')
  check(r.maxLength === LONG_REF.length, 'long: maxLength')
}

// 5. Mix of short, medium, long — different action types
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([
    event(SHORT_REF, 'website_revision_approved'),
    event(MEDIUM_REF, 'publish_evidence_recorded'),
    event(LONG_REF, 'local_snapshot_recorded'),
  ]))
  check(r.totalEvents === 3, 'mix: totalEvents 3')
  check(r.shortCount === 1, 'mix: shortCount 1')
  check(r.mediumCount === 1, 'mix: mediumCount 1')
  check(r.longCount === 1, 'mix: longCount 1')
  check(r.shortRate === 33, 'mix: shortRate 33')
  check(r.minLength === SHORT_REF.length, 'mix: minLength')
  check(r.maxLength === LONG_REF.length, 'mix: maxLength')
  check(r.averageLength === Math.round((SHORT_REF.length + MEDIUM_REF.length + LONG_REF.length) / 3), 'mix: averageLength')
}

// 6. Boundary: len=40 is short, len=41 is medium
{
  const AT = 'a'.repeat(40)
  const OVER = 'a'.repeat(41)

  const r1 = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(AT)]))
  check(r1.shortCount === 1, 'boundary-40: shortCount 1')
  check(r1.mediumCount === 0, 'boundary-40: mediumCount 0')

  const r2 = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(OVER)]))
  check(r2.shortCount === 0, 'boundary-41: shortCount 0')
  check(r2.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 7. Two short refs — min/max
{
  const r = projectWebsiteWorkflowEventEvidenceReferenceLengthBrief(workspace([event(SHORT_REF), event(SHORT2_REF)]))
  check(r.shortCount === 2, 'two-short: shortCount 2')
  check(r.minLength === SHORT_REF.length, 'two-short: minLength same (both 6)')
  check(r.maxLength === SHORT2_REF.length, 'two-short: maxLength same (both 6)')
  check(r.averageLength === SHORT_REF.length, 'two-short: averageLength 6')
}

console.log(`website-workflow-event-evidence-reference-length-brief: ${checks} checks passed`)
