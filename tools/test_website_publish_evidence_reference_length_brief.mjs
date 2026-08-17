import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishEvidenceReferenceLengthBrief } from './website-publish-evidence-reference-length-brief.ts'`,
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

const { projectWebsitePublishEvidenceReferenceLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evId = 0
function ev(reference) {
  evId++
  return {
    id: `ev-${evId}`,
    kind: 'content',
    finding: 'page renders ok',
    reference,
    verifiedBy: 'alice',
    verifiedAt: '2026-08-01T00:00:00Z',
    fingerprint: `fp-${evId}`,
    source: { contentRevision: 1, digest: `d-${evId}` },
    migratedFromV1: false,
  }
}

function workspace(evidence = []) {
  return {
    schema: 'supermega.website.workspace.v2',
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'pg-1',
    evidence,
    approvals: [],
    localPublishes: [],
    events: [],
  }
}

// Known-length references
const SHORT_REF = 'tool/browser-check-v1'                    // 21 chars → short
const SHORT2_REF = 'qa/link-check'                           // 13 chars → short
const MEDIUM_REF = 'https://staging.example.com/report/link-check-results-page-home-2026-08' // 72 chars → medium
const LONG_REF = 'https://internal.qa.supermega.dev/evidence/website-publish/automated-check/lighthouse/2026-08-01/run-007/full-report/page-home-2026-08' // 129 chars → long

// 1. Empty evidence
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace())
  check(r.totalEvidence === 0, 'empty: totalEvidence 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minReferenceLength === null, 'empty: minReferenceLength null')
  check(r.maxReferenceLength === null, 'empty: maxReferenceLength null')
  check(r.averageReferenceLength === 0, 'empty: averageReferenceLength 0')
}

// 2. Single short reference (≤40 chars)
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(SHORT_REF)]))
  check(r.totalEvidence === 1, 'short: totalEvidence 1')
  check(r.shortCount === 1, 'short: shortCount 1')
  check(r.mediumCount === 0, 'short: mediumCount 0')
  check(r.longCount === 0, 'short: longCount 0')
  check(r.shortRate === 100, 'short: shortRate 100')
  check(r.mediumRate === 0, 'short: mediumRate 0')
  check(r.minReferenceLength === SHORT_REF.length, 'short: minReferenceLength')
  check(r.maxReferenceLength === SHORT_REF.length, 'short: maxReferenceLength')
  check(r.averageReferenceLength === SHORT_REF.length, 'short: averageReferenceLength')
}

// 3. Single medium reference (41–120 chars)
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(MEDIUM_REF)]))
  check(r.totalEvidence === 1, 'medium: totalEvidence 1')
  check(r.shortCount === 0, 'medium: shortCount 0')
  check(r.mediumCount === 1, 'medium: mediumCount 1')
  check(r.longCount === 0, 'medium: longCount 0')
  check(r.mediumRate === 100, 'medium: mediumRate 100')
  check(r.minReferenceLength === MEDIUM_REF.length, 'medium: minReferenceLength')
  check(r.maxReferenceLength === MEDIUM_REF.length, 'medium: maxReferenceLength')
  check(r.averageReferenceLength === MEDIUM_REF.length, 'medium: averageReferenceLength')
}

// 4. Single long reference (>120 chars)
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(LONG_REF)]))
  check(r.totalEvidence === 1, 'long: totalEvidence 1')
  check(r.shortCount === 0, 'long: shortCount 0')
  check(r.mediumCount === 0, 'long: mediumCount 0')
  check(r.longCount === 1, 'long: longCount 1')
  check(r.longRate === 100, 'long: longRate 100')
  check(r.minReferenceLength === LONG_REF.length, 'long: minReferenceLength')
  check(r.maxReferenceLength === LONG_REF.length, 'long: maxReferenceLength')
  check(r.averageReferenceLength === LONG_REF.length, 'long: averageReferenceLength')
}

// 5. Mix of short, medium, long
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([
    ev(SHORT_REF),
    ev(MEDIUM_REF),
    ev(LONG_REF),
  ]))
  check(r.totalEvidence === 3, 'mix: totalEvidence 3')
  check(r.shortCount === 1, 'mix: shortCount 1')
  check(r.mediumCount === 1, 'mix: mediumCount 1')
  check(r.longCount === 1, 'mix: longCount 1')
  check(r.shortRate === 33, 'mix: shortRate 33')
  check(r.mediumRate === 33, 'mix: mediumRate 33')
  check(r.longRate === 33, 'mix: longRate 33')
  check(r.minReferenceLength === SHORT_REF.length, 'mix: minReferenceLength')
  check(r.maxReferenceLength === LONG_REF.length, 'mix: maxReferenceLength')
  check(r.averageReferenceLength === Math.round((SHORT_REF.length + MEDIUM_REF.length + LONG_REF.length) / 3), 'mix: averageReferenceLength')
}

// 6. Boundary: len=40 is short, len=41 is medium
{
  const AT = 'a'.repeat(40)
  const OVER = 'a'.repeat(41)
  const r1 = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(AT)]))
  check(r1.shortCount === 1, 'boundary-40: shortCount 1')
  check(r1.mediumCount === 0, 'boundary-40: mediumCount 0')

  const r2 = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(OVER)]))
  check(r2.shortCount === 0, 'boundary-41: shortCount 0')
  check(r2.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 7. Two short refs — min/max/average
{
  const r = projectWebsitePublishEvidenceReferenceLengthBrief(workspace([ev(SHORT_REF), ev(SHORT2_REF)]))
  check(r.shortCount === 2, 'two-short: shortCount 2')
  check(r.minReferenceLength === SHORT2_REF.length, 'two-short: minReferenceLength')
  check(r.maxReferenceLength === SHORT_REF.length, 'two-short: maxReferenceLength')
  check(r.averageReferenceLength === Math.round((SHORT_REF.length + SHORT2_REF.length) / 2), 'two-short: averageReferenceLength')
}

console.log(`website-publish-evidence-reference-length-brief: ${checks} checks passed`)
