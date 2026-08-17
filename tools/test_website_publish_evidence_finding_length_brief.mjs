import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishEvidenceFindingLengthBrief } from './website-publish-evidence-finding-length-brief.ts'`,
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

const { projectWebsitePublishEvidenceFindingLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evId = 0
function evidence({ kind = 'content', finding = 'Content verified' } = {}) {
  evId++
  return {
    id: `EV-${evId}`,
    kind,
    finding,
    reference: `ref-${evId}`,
    verifiedBy: 'tester',
    verifiedAt: '2026-08-01T09:00:00Z',
    fingerprint: `fp-${evId}`,
    source: { contentRevision: 1, digest: `d-${evId}` },
    migratedFromV1: false,
  }
}

function workspace(evidenceList) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: evidenceList,
    approvals: [],
    localPublishes: [],
    events: [],
  }
}

// 1. Empty workspace
{
  const r = projectWebsitePublishEvidenceFindingLengthBrief(workspace([]))
  check(r.totalEvidence === 0, 'empty: totalEvidence 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minFindingLength === null, 'empty: minFindingLength null')
  check(r.maxFindingLength === null, 'empty: maxFindingLength null')
  check(r.averageFindingLength === 0, 'empty: averageFindingLength 0')
}

// 2. Single short finding (≤40 chars)
{
  const r = projectWebsitePublishEvidenceFindingLengthBrief(workspace([
    evidence({ finding: 'All pages look good' }), // 19 chars
  ]))
  check(r.totalEvidence === 1, 'single-short: totalEvidence 1')
  check(r.shortCount === 1, 'single-short: shortCount 1')
  check(r.shortRate === 100, 'single-short: shortRate 100')
  check(r.minFindingLength === 19, 'single-short: minFindingLength 19')
  check(r.maxFindingLength === 19, 'single-short: maxFindingLength 19')
  check(r.averageFindingLength === 19, 'single-short: averageFindingLength 19')
}

// 3. Boundary: exactly 40 chars = short
{
  const r = projectWebsitePublishEvidenceFindingLengthBrief(workspace([
    evidence({ finding: 'A'.repeat(40) }),
  ]))
  check(r.shortCount === 1, 'boundary-40: shortCount 1')
  check(r.mediumCount === 0, 'boundary-40: mediumCount 0')
}

// 4. Boundary: exactly 41 chars = medium
{
  const r = projectWebsitePublishEvidenceFindingLengthBrief(workspace([
    evidence({ finding: 'A'.repeat(41) }),
  ]))
  check(r.shortCount === 0, 'boundary-41: shortCount 0')
  check(r.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 5. Boundary: 120 = medium, 121 = long
{
  const r120 = projectWebsitePublishEvidenceFindingLengthBrief(workspace([evidence({ finding: 'B'.repeat(120) })]))
  check(r120.mediumCount === 1, 'boundary-120: mediumCount 1')
  check(r120.longCount === 0, 'boundary-120: longCount 0')

  const r121 = projectWebsitePublishEvidenceFindingLengthBrief(workspace([evidence({ finding: 'C'.repeat(121) })]))
  check(r121.longCount === 1, 'boundary-121: longCount 1')
  check(r121.longRate === 100, 'boundary-121: longRate 100')
}

// 6. Mixed bands + rates + avg
{
  const s = 'Quick check' // 11 chars
  const m = 'D'.repeat(80)  // 80 chars
  const l = 'E'.repeat(160) // 160 chars
  const r = projectWebsitePublishEvidenceFindingLengthBrief(workspace([
    evidence({ finding: s }),
    evidence({ finding: m }),
    evidence({ finding: l }),
  ]))
  check(r.totalEvidence === 3, 'mixed: totalEvidence 3')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.shortRate === 33, 'mixed: shortRate 33')
  check(r.mediumRate === 33, 'mixed: mediumRate 33')
  check(r.longRate === 33, 'mixed: longRate 33')
  check(r.minFindingLength === 11, 'mixed: minFindingLength 11')
  check(r.maxFindingLength === 160, 'mixed: maxFindingLength 160')
  check(r.averageFindingLength === Math.round((11 + 80 + 160) / 3), 'mixed: averageFindingLength')
}

console.log(`website-publish-evidence-finding-length-brief: ${checks} checks passed`)
