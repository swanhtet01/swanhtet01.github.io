// Website publish evidence kind brief: content/responsive/links 3-value enum + allKindsPresent.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsitePublishEvidenceKindBrief } from './website-publish-evidence-kind-brief.ts'`,
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

const { projectWebsitePublishEvidenceKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evId = 0
function evidence(kind = 'content') {
  evId++
  return {
    id: `EV-${evId}`,
    kind,
    finding: 'Test finding',
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
    schema: 'supermega.website.workspace.v1',
    scope: 'scope-1',
    revision: 0,
    contentRevision: 0,
    headDigest: 'hd-1',
    pages: [],
    publishApprovals: [],
    evidence: evidenceList,
    localPublishRecords: [],
    events: [],
    openingPlan: undefined,
    workingSample: undefined,
  }
}

// 1. Empty workspace
{
  const r = projectWebsitePublishEvidenceKindBrief(workspace([]))
  check(r.totalEvidence === 0, 'empty: totalEvidence 0')
  check(r.contentCount === 0, 'empty: contentCount 0')
  check(r.responsiveCount === 0, 'empty: responsiveCount 0')
  check(r.linksCount === 0, 'empty: linksCount 0')
  check(r.contentRate === 0, 'empty: contentRate 0')
  check(r.allKindsPresent === false, 'empty: allKindsPresent false')
}

// 2. Single content evidence
{
  const r = projectWebsitePublishEvidenceKindBrief(workspace([evidence('content')]))
  check(r.totalEvidence === 1, 'content: totalEvidence 1')
  check(r.contentCount === 1, 'content: contentCount 1')
  check(r.contentRate === 100, 'content: contentRate 100')
  check(r.responsiveRate === 0, 'content: responsiveRate 0')
  check(r.allKindsPresent === false, 'content: allKindsPresent false (missing responsive/links)')
}

// 3. Single responsive evidence
{
  const r = projectWebsitePublishEvidenceKindBrief(workspace([evidence('responsive')]))
  check(r.responsiveCount === 1, 'responsive: responsiveCount 1')
  check(r.responsiveRate === 100, 'responsive: responsiveRate 100')
  check(r.allKindsPresent === false, 'responsive: allKindsPresent false')
}

// 4. Single links evidence
{
  const r = projectWebsitePublishEvidenceKindBrief(workspace([evidence('links')]))
  check(r.linksCount === 1, 'links: linksCount 1')
  check(r.linksRate === 100, 'links: linksRate 100')
  check(r.allKindsPresent === false, 'links: allKindsPresent false')
}

// 5. All 3 kinds present → allKindsPresent true
{
  const r = projectWebsitePublishEvidenceKindBrief(
    workspace([evidence('content'), evidence('responsive'), evidence('links')]),
  )
  check(r.totalEvidence === 3, 'all-3: totalEvidence 3')
  check(r.contentCount === 1, 'all-3: contentCount 1')
  check(r.responsiveCount === 1, 'all-3: responsiveCount 1')
  check(r.linksCount === 1, 'all-3: linksCount 1')
  check(r.allKindsPresent === true, 'all-3: allKindsPresent true')
}

// 6. Counts sum to total invariant
{
  const r = projectWebsitePublishEvidenceKindBrief(
    workspace([evidence('content'), evidence('content'), evidence('links')]),
  )
  check(r.contentCount + r.responsiveCount + r.linksCount === r.totalEvidence, 'invariant: counts sum')
}

// 7. Rounding: 1/3 → 33%, 2/3 → 67%
{
  const r = projectWebsitePublishEvidenceKindBrief(
    workspace([evidence('content'), evidence('responsive'), evidence('responsive')]),
  )
  check(r.contentRate === 33, 'round: contentRate 33')
  check(r.responsiveRate === 67, 'round: responsiveRate 67')
  check(r.linksRate === 0, 'round: linksRate 0')
}

// 8. Multiple of same kind — still allKindsPresent false if a kind missing
{
  const r = projectWebsitePublishEvidenceKindBrief(
    workspace([evidence('content'), evidence('content'), evidence('responsive'), evidence('responsive')]),
  )
  check(r.allKindsPresent === false, 'missing-links: allKindsPresent false')
}

// 9. Many evidence — rates distribute correctly
{
  const r = projectWebsitePublishEvidenceKindBrief(
    workspace([
      evidence('content'), evidence('content'),
      evidence('responsive'),
      evidence('links'),
    ]),
  )
  check(r.totalEvidence === 4, 'many: totalEvidence 4')
  check(r.contentRate === 50, 'many: contentRate 50')
  check(r.responsiveRate === 25, 'many: responsiveRate 25')
  check(r.linksRate === 25, 'many: linksRate 25')
  check(r.allKindsPresent === true, 'many: allKindsPresent true')
}

console.log(JSON.stringify({ ok: true, checks }))
