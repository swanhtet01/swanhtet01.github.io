import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkflowEventReasonLengthBrief } from './website-workflow-event-reason-length-brief.ts'`,
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

const { projectWebsiteWorkflowEventReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evtId = 0
function workflowEvent({ reason = 'Verified', action = 'publish_evidence_recorded' } = {}) {
  evtId++
  return {
    id: `WE-${evtId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actorKind: 'human',
    actor: 'alice',
    action,
    subjectId: `sub-${evtId}`,
    reason,
    evidenceReference: `ref-${evtId}`,
    source: { contentRevision: 1, digest: `d-${evtId}` },
  }
}

function workspace(events) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events,
  }
}

// 1. Empty workspace
{
  const r = projectWebsiteWorkflowEventReasonLengthBrief(workspace([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minReasonLength === null, 'empty: minReasonLength null')
  check(r.maxReasonLength === null, 'empty: maxReasonLength null')
  check(r.averageReasonLength === 0, 'empty: averageReasonLength 0')
}

// 2. Single short reason (≤40 chars)
{
  const r = projectWebsiteWorkflowEventReasonLengthBrief(workspace([
    workflowEvent({ reason: 'LGTM' }), // 4 chars
  ]))
  check(r.totalEvents === 1, 'single-short: totalEvents 1')
  check(r.shortCount === 1, 'single-short: shortCount 1')
  check(r.shortRate === 100, 'single-short: shortRate 100')
  check(r.minReasonLength === 4, 'single-short: minReasonLength 4')
  check(r.maxReasonLength === 4, 'single-short: maxReasonLength 4')
  check(r.averageReasonLength === 4, 'single-short: averageReasonLength 4')
}

// 3. Boundary: exactly 40 chars = short
{
  const r = projectWebsiteWorkflowEventReasonLengthBrief(workspace([
    workflowEvent({ reason: 'A'.repeat(40) }),
  ]))
  check(r.shortCount === 1, 'boundary-40: shortCount 1')
  check(r.mediumCount === 0, 'boundary-40: mediumCount 0')
}

// 4. Boundary: exactly 41 chars = medium
{
  const r = projectWebsiteWorkflowEventReasonLengthBrief(workspace([
    workflowEvent({ reason: 'A'.repeat(41) }),
  ]))
  check(r.shortCount === 0, 'boundary-41: shortCount 0')
  check(r.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 5. Boundary: 120 = medium, 121 = long
{
  const r120 = projectWebsiteWorkflowEventReasonLengthBrief(workspace([workflowEvent({ reason: 'B'.repeat(120) })]))
  check(r120.mediumCount === 1, 'boundary-120: mediumCount 1')
  check(r120.longCount === 0, 'boundary-120: longCount 0')

  const r121 = projectWebsiteWorkflowEventReasonLengthBrief(workspace([workflowEvent({ reason: 'C'.repeat(121) })]))
  check(r121.longCount === 1, 'boundary-121: longCount 1')
  check(r121.longRate === 100, 'boundary-121: longRate 100')
}

// 6. Mixed bands + rates + min/max/avg
{
  const s = 'OK' // 2 chars
  const m = 'D'.repeat(80)  // 80 chars
  const l = 'E'.repeat(200) // 200 chars
  const r = projectWebsiteWorkflowEventReasonLengthBrief(workspace([
    workflowEvent({ reason: s }),
    workflowEvent({ reason: m }),
    workflowEvent({ reason: l }),
  ]))
  check(r.totalEvents === 3, 'mixed: totalEvents 3')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.shortRate === 33, 'mixed: shortRate 33')
  check(r.mediumRate === 33, 'mixed: mediumRate 33')
  check(r.longRate === 33, 'mixed: longRate 33')
  check(r.minReasonLength === 2, 'mixed: minReasonLength 2')
  check(r.maxReasonLength === 200, 'mixed: maxReasonLength 200')
  check(r.averageReasonLength === Math.round((2 + 80 + 200) / 3), 'mixed: averageReasonLength')
}

console.log(`website-workflow-event-reason-length-brief: ${checks} checks passed`)
