import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteOpeningPlanConfirmedAtBrief } from './website-opening-plan-confirmed-at-brief.ts'`,
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

const { projectWebsiteOpeningPlanConfirmedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function workspace({ openingPlan = undefined } = {}) {
  const ws = {
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
    events: [],
  }
  if (openingPlan !== undefined) ws.openingPlan = openingPlan
  return ws
}

function plan({ confirmedAt = '2026-01-15T00:00:00Z', pageIds = [], workflowTemplateId = 'business-presence' } = {}) {
  return {
    contract: 'supermega.website.opening-plan.v1',
    packageDigest: 'pkg-digest-1',
    workflowTemplateId,
    confirmedAt,
    pageIds,
  }
}

// 1. No opening plan (openingPlan absent)
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace())
  check(r.hasPlan === false, 'no-plan: hasPlan false')
  check(r.confirmedAt === null, 'no-plan: confirmedAt null')
  check(r.pageCount === 0, 'no-plan: pageCount 0')
}

// 2. Plan with no pages
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({ openingPlan: plan() }))
  check(r.hasPlan === true, 'no-pages: hasPlan true')
  check(r.confirmedAt === '2026-01-15T00:00:00Z', 'no-pages: confirmedAt')
  check(r.pageCount === 0, 'no-pages: pageCount 0')
}

// 3. Plan with 3 pages
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({
    openingPlan: plan({ confirmedAt: '2026-03-20T08:00:00Z', pageIds: ['pg-1', 'pg-2', 'pg-3'] }),
  }))
  check(r.hasPlan === true, 'three-pages: hasPlan true')
  check(r.confirmedAt === '2026-03-20T08:00:00Z', 'three-pages: confirmedAt')
  check(r.pageCount === 3, 'three-pages: pageCount 3')
}

// 4. Plan with 7 pages
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({
    openingPlan: plan({ confirmedAt: '2026-06-01T00:00:00Z', pageIds: ['pg-1','pg-2','pg-3','pg-4','pg-5','pg-6','pg-7'] }),
  }))
  check(r.hasPlan === true, 'seven-pages: hasPlan true')
  check(r.confirmedAt === '2026-06-01T00:00:00Z', 'seven-pages: confirmedAt')
  check(r.pageCount === 7, 'seven-pages: pageCount 7')
}

// 5. lead-generation template
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({
    openingPlan: plan({ workflowTemplateId: 'lead-generation', confirmedAt: '2025-12-01T00:00:00Z', pageIds: ['pg-a', 'pg-b'] }),
  }))
  check(r.hasPlan === true, 'lead-gen: hasPlan true')
  check(r.confirmedAt === '2025-12-01T00:00:00Z', 'lead-gen: confirmedAt')
  check(r.pageCount === 2, 'lead-gen: pageCount 2')
}

// 6. catalog-showcase template
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({
    openingPlan: plan({ workflowTemplateId: 'catalog-showcase', confirmedAt: '2026-08-10T12:00:00Z', pageIds: ['pg-x'] }),
  }))
  check(r.hasPlan === true, 'catalog: hasPlan true')
  check(r.confirmedAt === '2026-08-10T12:00:00Z', 'catalog: confirmedAt')
  check(r.pageCount === 1, 'catalog: pageCount 1')
}

// 7. Workspace with evidence and approvals but no opening plan
{
  const ws = workspace()
  ws.evidence = [{ id: 'ev-1', kind: 'content', finding: 'ok', reference: 'tool/v1', verifiedBy: 'alice', verifiedAt: '2026-08-01T00:00:00Z', fingerprint: 'fp1', source: { contentRevision: 1, digest: 'd1' }, migratedFromV1: false }]
  ws.approvals = [{ id: 'ap-1', reviewer: 'bob', note: '', approvedAt: '2026-08-02T00:00:00Z', fingerprint: 'fp2', evidenceIds: ['ev-1'], source: { contentRevision: 1, digest: 'd1' }, migratedFromV1: false }]
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(ws)
  check(r.hasPlan === false, 'no-plan-with-evidence: hasPlan false')
  check(r.confirmedAt === null, 'no-plan-with-evidence: confirmedAt null')
  check(r.pageCount === 0, 'no-plan-with-evidence: pageCount 0')
}

// 8. Type assertions
{
  const r1 = projectWebsiteOpeningPlanConfirmedAtBrief(workspace())
  const r2 = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({ openingPlan: plan() }))
  check(typeof r1.hasPlan === 'boolean', 'type: hasPlan is boolean (no plan)')
  check(typeof r2.hasPlan === 'boolean', 'type: hasPlan is boolean (with plan)')
  check(typeof r2.confirmedAt === 'string', 'type: confirmedAt is string when plan exists')
  check(r1.confirmedAt === null, 'type: confirmedAt is null when no plan')
  check(typeof r1.pageCount === 'number', 'type: pageCount is number')
}

// 9. pageCount matches actual pageIds length
{
  const r = projectWebsiteOpeningPlanConfirmedAtBrief(workspace({
    openingPlan: plan({ pageIds: ['p1', 'p2', 'p3', 'p4', 'p5'] }),
  }))
  check(r.pageCount === 5, 'pagecount-5: pageCount 5')
  check(r.hasPlan === true, 'pagecount-5: hasPlan true')
}

console.log(`website-opening-plan-confirmed-at-brief: ${checks} checks passed`)
