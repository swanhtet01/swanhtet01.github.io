// Website opening plan package digest brief: packageDigest + algorithm extraction.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteOpeningPlanPackageDigestBrief } from './website-opening-plan-package-digest-brief.ts'`,
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

const { projectWebsiteOpeningPlanPackageDigestBrief } = await import(
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

function plan(packageDigest = SHA256_DIGEST) {
  return {
    contract: 'supermega.website.opening-plan.v1',
    packageDigest,
    workflowTemplateId: 'business-presence',
    confirmedAt: '2026-08-01T00:00:00Z',
    pageIds: ['pg-1'],
  }
}

// 1. No opening plan
{
  const r = projectWebsiteOpeningPlanPackageDigestBrief(ws())
  check(r.hasOpeningPlan === false, 'no-plan: hasOpeningPlan false')
  check(r.packageDigest === null, 'no-plan: packageDigest null')
  check(r.packageDigestAlgorithm === null, 'no-plan: packageDigestAlgorithm null')
}

// 2. With opening plan — sha256 digest
{
  const r = projectWebsiteOpeningPlanPackageDigestBrief(ws(plan()))
  check(r.hasOpeningPlan === true, 'has-plan: hasOpeningPlan true')
  check(r.packageDigest === SHA256_DIGEST, 'has-plan: packageDigest value')
  check(r.packageDigestAlgorithm === 'sha256', 'has-plan: algorithm sha256')
}

// 3. Algorithm is extracted correctly: prefix before ':'
{
  const r = projectWebsiteOpeningPlanPackageDigestBrief(ws(plan('sha512:' + 'b'.repeat(128))))
  check(r.packageDigestAlgorithm === 'sha512', 'algo: sha512 extracted')
}

// 4. Digest without ':' → algorithm null
{
  const r = projectWebsiteOpeningPlanPackageDigestBrief(ws(plan('nodash')))
  check(r.packageDigestAlgorithm === null, 'no-colon: algorithm null')
  check(r.packageDigest === 'nodash', 'no-colon: digest preserved')
}

// 5. Different digests produce different brief values
{
  const d1 = 'sha256:' + '1'.repeat(64)
  const d2 = 'sha256:' + '2'.repeat(64)
  const r1 = projectWebsiteOpeningPlanPackageDigestBrief(ws(plan(d1)))
  const r2 = projectWebsiteOpeningPlanPackageDigestBrief(ws(plan(d2)))
  check(r1.packageDigest !== r2.packageDigest, 'diff-digest: values differ')
  check(r1.packageDigestAlgorithm === r2.packageDigestAlgorithm, 'diff-digest: algorithm same')
}

// 6. All workflowTemplateId variants work (plan struct is valid for any)
for (const tpl of ['business-presence', 'lead-generation', 'catalog-showcase']) {
  const p = { ...plan(), workflowTemplateId: tpl }
  const r = projectWebsiteOpeningPlanPackageDigestBrief(ws(p))
  check(r.hasOpeningPlan === true, `tpl:${tpl}: hasOpeningPlan true`)
  check(r.packageDigestAlgorithm === 'sha256', `tpl:${tpl}: algorithm sha256`)
}

console.log(JSON.stringify({ ok: true, checks }))
