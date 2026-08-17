// Website opening plan summary: loaded, pageCount, workflowTemplateId, confirmedAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteOpeningPlanSummary } from './website-opening-plan-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-opening-plan-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteOpeningPlanSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.website.workspace.v2'

function plan({ workflowTemplateId = 'business-presence', pageIds = [], confirmedAt = '2026-01-01T00:00:00Z' } = {}) {
  return {
    contract: 'supermega.website.opening_plan.v1',
    packageDigest: 'digest-1',
    workflowTemplateId,
    confirmedAt,
    pageIds,
  }
}

function workspace(openingPlan = undefined) {
  return {
    schema: SCHEMA,
    version: 2,
    revision: 1,
    contentRevision: 1,
    siteName: 'Test Site',
    pages: [],
    selectedPageId: 'page-1',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events: [],
    ...(openingPlan !== undefined ? { openingPlan } : {}),
  }
}

// 1. No openingPlan → all defaults
{
  const r = projectWebsiteOpeningPlanSummary(workspace())
  check(r.loaded === false, 'none: loaded false')
  check(r.pageCount === 0, 'none: pageCount 0')
  check(r.workflowTemplateId === null, 'none: workflowTemplateId null')
  check(r.confirmedAt === null, 'none: confirmedAt null')
}

// 2. business-presence with 2 pages
{
  const r = projectWebsiteOpeningPlanSummary(workspace(
    plan({ workflowTemplateId: 'business-presence', pageIds: ['p-1', 'p-2'], confirmedAt: '2026-01-15T10:00:00Z' })
  ))
  check(r.loaded === true, 'bp-2p: loaded true')
  check(r.pageCount === 2, 'bp-2p: pageCount 2')
  check(r.workflowTemplateId === 'business-presence', 'bp-2p: workflowTemplateId business-presence')
  check(r.confirmedAt === '2026-01-15T10:00:00Z', 'bp-2p: confirmedAt propagated')
}

// 3. lead-generation
{
  const r = projectWebsiteOpeningPlanSummary(workspace(
    plan({ workflowTemplateId: 'lead-generation', pageIds: ['p-1'] })
  ))
  check(r.workflowTemplateId === 'lead-generation', 'lg: workflowTemplateId lead-generation')
}

// 4. catalog-showcase
{
  const r = projectWebsiteOpeningPlanSummary(workspace(
    plan({ workflowTemplateId: 'catalog-showcase', pageIds: [] })
  ))
  check(r.workflowTemplateId === 'catalog-showcase', 'cs: workflowTemplateId catalog-showcase')
}

// 5. 0 pages → loaded true, pageCount 0
{
  const r = projectWebsiteOpeningPlanSummary(workspace(plan({ pageIds: [] })))
  check(r.loaded === true, 'zero-pages: loaded true')
  check(r.pageCount === 0, 'zero-pages: pageCount 0')
}

// 6. 5 pages
{
  const r = projectWebsiteOpeningPlanSummary(workspace(
    plan({ pageIds: ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'] })
  ))
  check(r.pageCount === 5, 'five-pages: pageCount 5')
}

// 7. confirmedAt string preserved exactly
{
  const ts = '2026-08-11T08:30:00Z'
  const r = projectWebsiteOpeningPlanSummary(workspace(plan({ confirmedAt: ts })))
  check(r.confirmedAt === ts, 'ts: confirmedAt exact')
}

// 8. pageCount 1
{
  const r = projectWebsiteOpeningPlanSummary(workspace(plan({ pageIds: ['only'] })))
  check(r.pageCount === 1, 'one-page: pageCount 1')
}

// 9. catalog-showcase, 3 pages, specific confirmedAt
{
  const r = projectWebsiteOpeningPlanSummary(workspace(
    plan({ workflowTemplateId: 'catalog-showcase', pageIds: ['a', 'b', 'c'], confirmedAt: '2026-03-01T00:00:00Z' })
  ))
  check(r.loaded === true, 'cs-3p: loaded true')
  check(r.pageCount === 3, 'cs-3p: pageCount 3')
  check(r.workflowTemplateId === 'catalog-showcase', 'cs-3p: workflowTemplateId catalog-showcase')
  check(r.confirmedAt === '2026-03-01T00:00:00Z', 'cs-3p: confirmedAt')
}

console.log(JSON.stringify({ ok: true, checks }))
