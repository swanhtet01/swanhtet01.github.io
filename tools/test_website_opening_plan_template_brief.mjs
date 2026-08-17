// Website opening plan template brief: workflowTemplateId presence + which template.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteOpeningPlanTemplateBrief } from './website-opening-plan-template-brief.ts'`,
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

const { projectWebsiteOpeningPlanTemplateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHA256_DIGEST = 'sha256:' + 'a'.repeat(64)

function ws(openingPlan) {
  const base = {
    schema: 'supermega.website.v2',
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
  if (openingPlan !== undefined) base.openingPlan = openingPlan
  return base
}

function plan(workflowTemplateId = 'business-presence') {
  return {
    contract: 'supermega.website.opening-plan.v1',
    packageDigest: SHA256_DIGEST,
    workflowTemplateId,
    confirmedAt: '2026-08-01T00:00:00Z',
    pageIds: ['pg-1'],
  }
}

// 1. No opening plan
{
  const r = projectWebsiteOpeningPlanTemplateBrief(ws())
  check(r.hasOpeningPlan === false, 'no-plan: hasOpeningPlan false')
  check(r.workflowTemplateId === null, 'no-plan: workflowTemplateId null')
  check(r.isBusinessPresence === false, 'no-plan: isBusinessPresence false')
  check(r.isLeadGeneration === false, 'no-plan: isLeadGeneration false')
  check(r.isCatalogShowcase === false, 'no-plan: isCatalogShowcase false')
}

// 2. business-presence template
{
  const r = projectWebsiteOpeningPlanTemplateBrief(ws(plan('business-presence')))
  check(r.hasOpeningPlan === true, 'bp: hasOpeningPlan true')
  check(r.workflowTemplateId === 'business-presence', 'bp: workflowTemplateId')
  check(r.isBusinessPresence === true, 'bp: isBusinessPresence true')
  check(r.isLeadGeneration === false, 'bp: isLeadGeneration false')
  check(r.isCatalogShowcase === false, 'bp: isCatalogShowcase false')
}

// 3. lead-generation template
{
  const r = projectWebsiteOpeningPlanTemplateBrief(ws(plan('lead-generation')))
  check(r.hasOpeningPlan === true, 'lg: hasOpeningPlan true')
  check(r.workflowTemplateId === 'lead-generation', 'lg: workflowTemplateId')
  check(r.isBusinessPresence === false, 'lg: isBusinessPresence false')
  check(r.isLeadGeneration === true, 'lg: isLeadGeneration true')
  check(r.isCatalogShowcase === false, 'lg: isCatalogShowcase false')
}

// 4. catalog-showcase template
{
  const r = projectWebsiteOpeningPlanTemplateBrief(ws(plan('catalog-showcase')))
  check(r.hasOpeningPlan === true, 'cs: hasOpeningPlan true')
  check(r.workflowTemplateId === 'catalog-showcase', 'cs: workflowTemplateId')
  check(r.isBusinessPresence === false, 'cs: isBusinessPresence false')
  check(r.isLeadGeneration === false, 'cs: isLeadGeneration false')
  check(r.isCatalogShowcase === true, 'cs: isCatalogShowcase true')
}

// 5. Exactly one isX flag is true for each template
for (const [tpl, bp, lg, cs] of [
  ['business-presence', true, false, false],
  ['lead-generation', false, true, false],
  ['catalog-showcase', false, false, true],
]) {
  const r = projectWebsiteOpeningPlanTemplateBrief(ws(plan(tpl)))
  check(r.isBusinessPresence === bp, `flags:${tpl}: isBusinessPresence ${bp}`)
  check(r.isLeadGeneration === lg, `flags:${tpl}: isLeadGeneration ${lg}`)
  check(r.isCatalogShowcase === cs, `flags:${tpl}: isCatalogShowcase ${cs}`)
}

// 6. hasOpeningPlan true means workflowTemplateId is non-null
for (const tpl of ['business-presence', 'lead-generation', 'catalog-showcase']) {
  const r = projectWebsiteOpeningPlanTemplateBrief(ws(plan(tpl)))
  check(r.hasOpeningPlan && r.workflowTemplateId !== null, `non-null:${tpl}: workflowTemplateId not null`)
}

console.log(JSON.stringify({ ok: true, checks }))
