// Website evidence summary: totalEvidence, byKind (content/responsive/links),
// uniqueReviewers, latestVerifiedAt from WebsiteWorkspace.evidence.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteEvidenceSummary } from './website-evidence-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/evidence-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteEvidenceSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function ev(kind, verifiedBy, verifiedAt) {
  seq++
  return {
    id: `ev-${seq}`,
    kind,
    finding: `Finding ${seq}`,
    reference: `ref-${seq}`,
    verifiedBy,
    verifiedAt,
    fingerprint: `fp-${seq}`,
    source: { contentRevision: 1, storefrontRevision: 1, revisionActionId: 'act1' },
    migratedFromV1: false,
  }
}

function workspace(evidence = [], pages = [], localPublishes = [], approvals = [], events = []) {
  return { pages, evidence, localPublishes, approvals, events, contentRevision: 1, storefrontRevision: null }
}

// 1. Empty workspace → all zeros, null latestVerifiedAt
{
  const r = projectWebsiteEvidenceSummary(workspace())
  check(r.totalEvidence === 0, 'empty: totalEvidence 0')
  check(r.byKind.content === 0, 'empty: byKind.content 0')
  check(r.byKind.responsive === 0, 'empty: byKind.responsive 0')
  check(r.byKind.links === 0, 'empty: byKind.links 0')
  check(r.uniqueReviewers === 0, 'empty: uniqueReviewers 0')
  check(r.latestVerifiedAt === null, 'empty: latestVerifiedAt null')
}

// 2. Single content evidence
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('content', 'alice', '2026-08-11T10:00:00.000Z'),
  ]))
  check(r.totalEvidence === 1, 'single: totalEvidence 1')
  check(r.byKind.content === 1, 'single: byKind.content 1')
  check(r.byKind.responsive === 0, 'single: byKind.responsive 0')
  check(r.byKind.links === 0, 'single: byKind.links 0')
  check(r.uniqueReviewers === 1, 'single: uniqueReviewers 1')
  check(r.latestVerifiedAt === '2026-08-11T10:00:00.000Z', 'single: latestVerifiedAt')
}

// 3. All three kinds
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('content', 'alice', '2026-08-11T08:00:00.000Z'),
    ev('responsive', 'bob', '2026-08-11T09:00:00.000Z'),
    ev('links', 'alice', '2026-08-11T10:00:00.000Z'),
  ]))
  check(r.byKind.content === 1, 'all-kinds: content 1')
  check(r.byKind.responsive === 1, 'all-kinds: responsive 1')
  check(r.byKind.links === 1, 'all-kinds: links 1')
  check(r.totalEvidence === 3, 'all-kinds: totalEvidence 3')
}

// 4. uniqueReviewers deduplicates same reviewer
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('content', 'alice', '2026-08-11T08:00:00.000Z'),
    ev('responsive', 'alice', '2026-08-11T09:00:00.000Z'),
    ev('links', 'bob', '2026-08-11T10:00:00.000Z'),
  ]))
  check(r.uniqueReviewers === 2, 'reviewers: alice+bob = 2 unique')
}

// 5. latestVerifiedAt picks the most recent
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('content', 'alice', '2026-08-11T10:00:00.000Z'),
    ev('responsive', 'bob', '2026-08-11T08:00:00.000Z'),
    ev('links', 'alice', '2026-08-11T12:00:00.000Z'),
  ]))
  check(r.latestVerifiedAt === '2026-08-11T12:00:00.000Z', 'latest: 12:00 is the latest')
}

// 6. Multiple of same kind counted correctly
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('responsive', 'alice', '2026-08-10T08:00:00.000Z'),
    ev('responsive', 'alice', '2026-08-11T08:00:00.000Z'),
    ev('responsive', 'bob', '2026-08-11T09:00:00.000Z'),
  ]))
  check(r.byKind.responsive === 3, 'multi-kind: responsive 3')
  check(r.byKind.content === 0, 'multi-kind: content stays 0')
  check(r.uniqueReviewers === 2, 'multi-kind: 2 unique reviewers')
}

// 7. Three distinct reviewers
{
  const r = projectWebsiteEvidenceSummary(workspace([
    ev('content', 'alice', '2026-08-11T08:00:00.000Z'),
    ev('responsive', 'bob', '2026-08-11T09:00:00.000Z'),
    ev('links', 'charlie', '2026-08-11T10:00:00.000Z'),
  ]))
  check(r.uniqueReviewers === 3, 'three-reviewers: uniqueReviewers 3')
}

console.log(JSON.stringify({ ok: true, checks }))
