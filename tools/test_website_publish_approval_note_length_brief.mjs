import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishApprovalNoteLengthBrief } from './website-publish-approval-note-length-brief.ts'`,
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

const { projectWebsitePublishApprovalNoteLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let approvalId = 0
function approval({ note = 'LGTM', reviewer = 'alice' } = {}) {
  approvalId++
  return {
    id: `PA-${approvalId}`,
    reviewer,
    note,
    approvedAt: '2026-08-01T10:00:00Z',
    fingerprint: `fp-${approvalId}`,
    evidenceIds: ['ev-1'],
    source: { contentRevision: 1, digest: `dig-${approvalId}` },
    migratedFromV1: false,
  }
}

function workspace(approvals) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals,
    localPublishes: [],
    events: [],
  }
}

// 1. Empty
{
  const r = projectWebsitePublishApprovalNoteLengthBrief(workspace([]))
  check(r.totalApprovals === 0, 'empty: totalApprovals 0')
  check(r.withNoteCount === 0, 'empty: withNoteCount 0')
  check(r.withNoteRate === 0, 'empty: withNoteRate 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.averageNoteLength === 0, 'empty: averageNoteLength 0')
  check(r.minNoteLength === null, 'empty: minNoteLength null')
  check(r.maxNoteLength === null, 'empty: maxNoteLength null')
}

// 2. Single approval with blank note
{
  const r = projectWebsitePublishApprovalNoteLengthBrief(workspace([
    approval({ note: '' }),
  ]))
  check(r.totalApprovals === 1, 'blank: totalApprovals 1')
  check(r.withNoteCount === 0, 'blank: withNoteCount 0')
  check(r.withNoteRate === 0, 'blank: withNoteRate 0')
  check(r.minNoteLength === null, 'blank: minNoteLength null')
}

// 3. Single short note
{
  const r = projectWebsitePublishApprovalNoteLengthBrief(workspace([
    approval({ note: 'Approved' }), // 8 chars
  ]))
  check(r.withNoteCount === 1, 'short: withNoteCount 1')
  check(r.withNoteRate === 100, 'short: withNoteRate 100')
  check(r.shortCount === 1, 'short: shortCount 1')
  check(r.averageNoteLength === 8, 'short: averageNoteLength 8')
  check(r.minNoteLength === 8, 'short: minNoteLength 8')
  check(r.maxNoteLength === 8, 'short: maxNoteLength 8')
}

// 4. Boundaries: 40 = short, 41 = medium, 120 = medium, 121 = long
{
  const r40 = projectWebsitePublishApprovalNoteLengthBrief(workspace([approval({ note: 'A'.repeat(40) })]))
  check(r40.shortCount === 1, 'b40: shortCount 1')
  check(r40.mediumCount === 0, 'b40: mediumCount 0')

  const r41 = projectWebsitePublishApprovalNoteLengthBrief(workspace([approval({ note: 'A'.repeat(41) })]))
  check(r41.mediumCount === 1, 'b41: mediumCount 1')

  const r120 = projectWebsitePublishApprovalNoteLengthBrief(workspace([approval({ note: 'B'.repeat(120) })]))
  check(r120.mediumCount === 1, 'b120: mediumCount 1')
  check(r120.longCount === 0, 'b120: longCount 0')

  const r121 = projectWebsitePublishApprovalNoteLengthBrief(workspace([approval({ note: 'C'.repeat(121) })]))
  check(r121.longCount === 1, 'b121: longCount 1')
  check(r121.longCount === 1, 'b121: longCount 1 again')
}

// 5. Mixed: blank + short + long
{
  const r = projectWebsitePublishApprovalNoteLengthBrief(workspace([
    approval({ note: '' }),
    approval({ note: 'OK' }),         // 2 chars → short
    approval({ note: 'D'.repeat(200) }), // 200 chars → long
  ]))
  check(r.totalApprovals === 3, 'mixed: totalApprovals 3')
  check(r.withNoteCount === 2, 'mixed: withNoteCount 2')
  check(r.withNoteRate === 67, 'mixed: withNoteRate 67')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.averageNoteLength === Math.round((2 + 200) / 2), 'mixed: averageNoteLength 101')
  check(r.minNoteLength === 2, 'mixed: minNoteLength 2')
  check(r.maxNoteLength === 200, 'mixed: maxNoteLength 200')
}

console.log(`website-publish-approval-note-length-brief: ${checks} checks passed`)
