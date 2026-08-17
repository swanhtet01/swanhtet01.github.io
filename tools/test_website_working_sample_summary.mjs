// Website working sample summary: loaded, templateId, contentFingerprint, installedAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteWorkingSampleSummary } from './website-working-sample-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-working-sample-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteWorkingSampleSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.website.workspace.v2'

function sample({ templateId = 'tpl-retail', contentFingerprint = 'fp-abc', installedAt = '2026-01-01T00:00:00Z' } = {}) {
  return {
    contract: 'supermega.website.working_sample.v1',
    templateId,
    contentFingerprint,
    installedAt,
  }
}

function workspace(workingSample = undefined) {
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
    ...(workingSample !== undefined ? { workingSample } : {}),
  }
}

// 1. No workingSample → all defaults
{
  const r = projectWebsiteWorkingSampleSummary(workspace())
  check(r.loaded === false, 'none: loaded false')
  check(r.templateId === null, 'none: templateId null')
  check(r.contentFingerprint === null, 'none: contentFingerprint null')
  check(r.installedAt === null, 'none: installedAt null')
}

// 2. With workingSample → all fields propagated
{
  const r = projectWebsiteWorkingSampleSummary(workspace(
    sample({ templateId: 'tpl-cafe', contentFingerprint: 'fp-xyz-123', installedAt: '2026-03-15T09:00:00Z' })
  ))
  check(r.loaded === true, 'present: loaded true')
  check(r.templateId === 'tpl-cafe', 'present: templateId')
  check(r.contentFingerprint === 'fp-xyz-123', 'present: contentFingerprint')
  check(r.installedAt === '2026-03-15T09:00:00Z', 'present: installedAt')
}

// 3. Different templateId
{
  const r = projectWebsiteWorkingSampleSummary(workspace(sample({ templateId: 'tpl-restaurant' })))
  check(r.templateId === 'tpl-restaurant', 'tpl: different templateId')
}

// 4. contentFingerprint propagated exactly
{
  const fp = 'sha256-abcdef0123456789'
  const r = projectWebsiteWorkingSampleSummary(workspace(sample({ contentFingerprint: fp })))
  check(r.contentFingerprint === fp, 'fp: contentFingerprint exact')
}

// 5. installedAt propagated exactly
{
  const ts = '2026-08-11T12:00:00Z'
  const r = projectWebsiteWorkingSampleSummary(workspace(sample({ installedAt: ts })))
  check(r.installedAt === ts, 'ts: installedAt exact')
}

// 6. All fields at once — different sample
{
  const r = projectWebsiteWorkingSampleSummary(workspace(
    sample({ templateId: 'tpl-spa', contentFingerprint: 'fp-001', installedAt: '2026-06-01T00:00:00Z' })
  ))
  check(r.loaded === true, 'spa: loaded true')
  check(r.templateId === 'tpl-spa', 'spa: templateId tpl-spa')
  check(r.contentFingerprint === 'fp-001', 'spa: contentFingerprint fp-001')
  check(r.installedAt === '2026-06-01T00:00:00Z', 'spa: installedAt')
}

console.log(JSON.stringify({ ok: true, checks }))
