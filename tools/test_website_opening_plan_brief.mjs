// Website opening plan brief: hasPlan, pageCount, workflowTemplate identity flags.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteOpeningPlanBrief } from './website-opening-plan-brief.ts'`,
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

const { projectWebsiteOpeningPlanBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function openingPlan({ template = 'business-presence', pageIds = ['pg-1', 'pg-2', 'pg-3'] } = {}) {
  return {
    contract: 'supermega.website.opening-plan.v1',
    packageDigest: 'pkg-digest-1',
    workflowTemplateId: template,
    confirmedAt: '2026-08-01T09:00:00Z',
    pageIds,
  }
}

function workingSample() {
  return {
    contract: 'supermega.website.working-sample.v1',
    templateId: 'business-presence',
    contentFingerprint: 'fp-1',
    installedAt: '2026-08-01T09:00:00Z',
  }
}

function workspace({ plan = undefined, sample = undefined } = {}) {
  return {
    schema: 'supermega.website.workspace.v1',
    scope: 'scope-1',
    revision: 0,
    contentRevision: 0,
    headDigest: 'hd-1',
    pages: [],
    publishApprovals: [],
    evidence: [],
    localPublishRecords: [],
    events: [],
    openingPlan: plan,
    workingSample: sample,
  }
}

// 1. No plan, no sample
{
  const r = projectWebsiteOpeningPlanBrief(workspace())
  check(r.hasPlan === false, 'no-plan: hasPlan false')
  check(r.pageCount === null, 'no-plan: pageCount null')
  check(r.workflowTemplate === null, 'no-plan: workflowTemplate null')
  check(r.isBusinessPresence === false, 'no-plan: isBusinessPresence false')
  check(r.isLeadGeneration === false, 'no-plan: isLeadGeneration false')
  check(r.isCatalogShowcase === false, 'no-plan: isCatalogShowcase false')
  check(r.hasWorkingSample === false, 'no-plan: hasWorkingSample false')
}

// 2. business-presence plan with 3 pages
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan({ template: 'business-presence' }) }))
  check(r.hasPlan === true, 'bp: hasPlan true')
  check(r.pageCount === 3, 'bp: pageCount 3')
  check(r.workflowTemplate === 'business-presence', 'bp: workflowTemplate business-presence')
  check(r.isBusinessPresence === true, 'bp: isBusinessPresence true')
  check(r.isLeadGeneration === false, 'bp: isLeadGeneration false')
  check(r.isCatalogShowcase === false, 'bp: isCatalogShowcase false')
}

// 3. lead-generation plan
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan({ template: 'lead-generation', pageIds: ['p1', 'p2'] }) }))
  check(r.workflowTemplate === 'lead-generation', 'lg: template')
  check(r.isLeadGeneration === true, 'lg: isLeadGeneration true')
  check(r.isBusinessPresence === false, 'lg: isBusinessPresence false')
  check(r.pageCount === 2, 'lg: pageCount 2')
}

// 4. catalog-showcase plan
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan({ template: 'catalog-showcase', pageIds: ['p1', 'p2', 'p3', 'p4', 'p5'] }) }))
  check(r.workflowTemplate === 'catalog-showcase', 'cs: template')
  check(r.isCatalogShowcase === true, 'cs: isCatalogShowcase true')
  check(r.pageCount === 5, 'cs: pageCount 5')
}

// 5. Working sample present
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan(), sample: workingSample() }))
  check(r.hasWorkingSample === true, 'sample: hasWorkingSample true')
}

// 6. Empty pageIds
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan({ pageIds: [] }) }))
  check(r.hasPlan === true, 'empty-pages: hasPlan true')
  check(r.pageCount === 0, 'empty-pages: pageCount 0')
}

// 7. Only one of the three template flags is true
{
  const r = projectWebsiteOpeningPlanBrief(workspace({ plan: openingPlan({ template: 'lead-generation' }) }))
  const trueFlags = [r.isBusinessPresence, r.isLeadGeneration, r.isCatalogShowcase].filter(Boolean).length
  check(trueFlags === 1, 'invariant: exactly one template flag true')
}

console.log(JSON.stringify({ ok: true, checks }))
