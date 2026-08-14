// Plant issue ownership brief: owner diversity, containment/resolution coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantIssueOwnershipBrief } from './plant-issue-ownership-brief.ts'`,
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

const { projectPlantIssueOwnershipBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'

function issue({ id = 'ISS-1', status = 'open', kind = 'quality', area = 'line-a', owner, containment, resolution, maintenanceFindingSource } = {}) {
  const base = { id, createdAt: '2026-01-01T00:00:00Z', area, kind, summary: 'Issue', status }
  if (owner !== undefined) base.owner = owner
  if (containment !== undefined) base.containment = containment
  if (resolution !== undefined) base.resolution = resolution
  if (maintenanceFindingSource !== undefined) base.maintenanceFindingSource = maintenanceFindingSource
  return base
}

function state(issues = []) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues, machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantIssueOwnershipBrief(state([]))
  check(r.totalIssues === 0, 'empty: totalIssues 0')
  check(r.issuesWithOwner === 0, 'empty: issuesWithOwner 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.topOwners.length === 0, 'empty: topOwners empty')
  check(r.openWithoutOwner === 0, 'empty: openWithoutOwner 0')
  check(r.issuesWithContainment === 0, 'empty: issuesWithContainment 0')
  check(r.issuesWithResolution === 0, 'empty: issuesWithResolution 0')
  check(r.issuesFromMaintenance === 0, 'empty: issuesFromMaintenance 0')
}

// 2. Single open issue, no owner
{
  const r = projectPlantIssueOwnershipBrief(state([issue({ id: 'ISS-1', status: 'open' })]))
  check(r.totalIssues === 1, 'no-owner: totalIssues 1')
  check(r.issuesWithOwner === 0, 'no-owner: issuesWithOwner 0')
  check(r.openWithoutOwner === 1, 'no-owner: openWithoutOwner 1')
}

// 3. Resolved issue without owner does NOT add to openWithoutOwner
{
  const r = projectPlantIssueOwnershipBrief(state([issue({ id: 'ISS-1', status: 'resolved' })]))
  check(r.openWithoutOwner === 0, 'resolved-no-owner: openWithoutOwner 0')
}

// 4. Issue with owner
{
  const r = projectPlantIssueOwnershipBrief(state([issue({ id: 'ISS-1', owner: 'alice' })]))
  check(r.issuesWithOwner === 1, 'with-owner: issuesWithOwner 1')
  check(r.uniqueOwners === 1, 'with-owner: uniqueOwners 1')
  check(r.topOwners[0].owner === 'alice', 'with-owner: topOwners[0] alice')
  check(r.topOwners[0].issueCount === 1, 'with-owner: topOwners[0].issueCount 1')
  check(r.openWithoutOwner === 0, 'with-owner: openWithoutOwner 0')
}

// 5. Multiple issues, same owner
{
  const r = projectPlantIssueOwnershipBrief(state([
    issue({ id: 'ISS-1', owner: 'alice' }),
    issue({ id: 'ISS-2', owner: 'alice' }),
  ]))
  check(r.uniqueOwners === 1, 'same-owner: uniqueOwners 1')
  check(r.topOwners[0].issueCount === 2, 'same-owner: issueCount 2')
}

// 6. Multiple owners, topOwners ranked
{
  const r = projectPlantIssueOwnershipBrief(state([
    issue({ id: 'ISS-1', owner: 'bob' }),
    issue({ id: 'ISS-2', owner: 'alice' }),
    issue({ id: 'ISS-3', owner: 'alice' }),
  ]))
  check(r.topOwners[0].owner === 'alice', 'rank: alice first (2 issues)')
  check(r.topOwners[1].owner === 'bob', 'rank: bob second')
}

// 7. issuesWithContainment
{
  const r = projectPlantIssueOwnershipBrief(state([
    issue({ id: 'ISS-1', containment: 'Quarantine batch' }),
    issue({ id: 'ISS-2' }),
  ]))
  check(r.issuesWithContainment === 1, 'containment: issuesWithContainment 1')
}

// 8. issuesWithResolution
{
  const r = projectPlantIssueOwnershipBrief(state([
    issue({ id: 'ISS-1', status: 'resolved', resolution: { resolvedAt: '2026-01-02T00:00:00Z', resolvedBy: 'alice', outcome: 'Closed', evidenceReference: 'EV-1' } }),
    issue({ id: 'ISS-2', status: 'open' }),
  ]))
  check(r.issuesWithResolution === 1, 'resolution: issuesWithResolution 1')
}

// 9. issuesFromMaintenance
{
  const r = projectPlantIssueOwnershipBrief(state([
    issue({ id: 'ISS-1', maintenanceFindingSource: { maintenanceEventId: 'ME-1', machineId: 'M-1' } }),
    issue({ id: 'ISS-2' }),
  ]))
  check(r.issuesFromMaintenance === 1, 'maintenance-source: issuesFromMaintenance 1')
}

// 10. topOwners capped at 5
{
  const owners = ['a', 'b', 'c', 'd', 'e', 'f']
  const issues = owners.map((o, i) => issue({ id: `ISS-${i}`, owner: o }))
  const r = projectPlantIssueOwnershipBrief(state(issues))
  check(r.topOwners.length === 5, 'cap5: topOwners capped at 5')
  check(r.uniqueOwners === 6, 'cap5: uniqueOwners still 6')
}

console.log(JSON.stringify({ ok: true, checks }))
