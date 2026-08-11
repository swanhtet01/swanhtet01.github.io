// Website release records summary: totalRecords, totalCommands, byCommandKind, latestRevision.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseRecordsSummary } from './website-release-records-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/website-release-records-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteReleaseRecordsSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.website.workspace.v2'
const RELEASE_SCHEMA = 'supermega.website.release_foundation.v1'

function cmd(kind, sequence = 1) {
  return { sequence, previousDigest: 'prev', payload: { kind, id: `id-${sequence}` }, digest: `d-${sequence}` }
}

function record({ revision = 1, scope = 'site', commands = [] } = {}) {
  return { schema: RELEASE_SCHEMA, scope, revision, headDigest: 'head', commands }
}

function workspace(releaseRecords = undefined) {
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
    ...(releaseRecords !== undefined ? { releaseRecords } : {}),
  }
}

// 1. No releaseRecords (undefined) → all defaults
{
  const r = projectWebsiteReleaseRecordsSummary(workspace())
  check(r.totalRecords === 0, 'none: totalRecords 0')
  check(r.totalCommands === 0, 'none: totalCommands 0')
  check(r.byCommandKind.prepare_package === 0, 'none: prepare_package 0')
  check(r.byCommandKind.upgrade_template === 0, 'none: upgrade_template 0')
  check(r.byCommandKind.approve_release === 0, 'none: approve_release 0')
  check(r.byCommandKind.prepare_deploy_plan === 0, 'none: prepare_deploy_plan 0')
}

// 2. Empty releaseRecords array
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([]))
  check(r.totalRecords === 0, 'empty-arr: totalRecords 0')
  check(r.latestRevision === null, 'empty-arr: latestRevision null')
}

// 3. Single record, 1 prepare_package, revision 1
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ revision: 1, commands: [cmd('prepare_package')] }),
  ]))
  check(r.totalRecords === 1, 'single: totalRecords 1')
  check(r.byCommandKind.prepare_package === 1, 'single: prepare_package 1')
  check(r.totalCommands === 1, 'single: totalCommands 1')
  check(r.latestRevision === 1, 'single: latestRevision 1')
}

// 4. upgrade_template
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ commands: [cmd('upgrade_template')] }),
  ]))
  check(r.byCommandKind.upgrade_template === 1, 'ut: upgrade_template 1')
}

// 5. approve_release
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ commands: [cmd('approve_release')] }),
  ]))
  check(r.byCommandKind.approve_release === 1, 'ar: approve_release 1')
}

// 6. prepare_deploy_plan
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ commands: [cmd('prepare_deploy_plan')] }),
  ]))
  check(r.byCommandKind.prepare_deploy_plan === 1, 'pdp: prepare_deploy_plan 1')
}

// 7. 2 records: totalRecords 2, latestRevision = max, totalCommands = sum
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ revision: 1, commands: [cmd('prepare_package', 1), cmd('upgrade_template', 2)] }),
    record({ revision: 3, commands: [cmd('approve_release', 1)] }),
  ]))
  check(r.totalRecords === 2, '2rec: totalRecords 2')
  check(r.latestRevision === 3, '2rec: latestRevision 3')
  check(r.totalCommands === 3, '2rec: totalCommands 3')
}

// 8. byCommandKind accumulates across records
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ commands: [cmd('prepare_package'), cmd('prepare_package', 2)] }),
    record({ commands: [cmd('approve_release')] }),
  ]))
  check(r.byCommandKind.prepare_package === 2, 'accum: prepare_package 2')
  check(r.byCommandKind.approve_release === 1, 'accum: approve_release 1')
}

// 9. latestRevision from 3 records = max
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ revision: 2 }),
    record({ revision: 5 }),
    record({ revision: 1 }),
  ]))
  check(r.latestRevision === 5, '3rec: latestRevision 5 (max)')
}

// 10. All 4 command kinds in one record
{
  const r = projectWebsiteReleaseRecordsSummary(workspace([
    record({ revision: 4, commands: [
      cmd('prepare_package', 1),
      cmd('upgrade_template', 2),
      cmd('approve_release', 3),
      cmd('prepare_deploy_plan', 4),
    ]}),
  ]))
  check(r.byCommandKind.prepare_package === 1, 'all4: prepare_package 1')
  check(r.byCommandKind.upgrade_template === 1, 'all4: upgrade_template 1')
  check(r.byCommandKind.approve_release === 1, 'all4: approve_release 1')
  check(r.byCommandKind.prepare_deploy_plan === 1, 'all4: prepare_deploy_plan 1')
}

console.log(JSON.stringify({ ok: true, checks }))
