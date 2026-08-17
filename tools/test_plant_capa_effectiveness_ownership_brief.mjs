// Plant CAPA effectiveness ownership brief: effectivenessOwner accountability per CAPA.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantCapaEffectivenessOwnershipBrief } from './plant-capa-effectiveness-ownership-brief.ts'`,
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

const { projectPlantCapaEffectivenessOwnershipBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const AS_OF = '2026-08-11T00:00:00Z'

let issueId = 0
function issue({ effectivenessOwner = 'owner-a', effectivenessDue = '2026-09-01T00:00:00Z', withResolution = true, withCapa = true } = {}) {
  issueId++
  const resolution = withResolution
    ? {
        actionId: `act-${issueId}`,
        resolvedAt: '2026-08-01T10:00:00Z',
        resolvedBy: 'tech-01',
        reason: 'Fixed.',
        evidenceReference: '',
        ...(withCapa && {
          qualityCorrectiveAction: {
            contract: 'supermega.plant.production.quality-capa.v1',
            failureMode: 'surface_defect',
            causeCategory: 'material',
            rootCause: 'Supplier batch variance.',
            correctiveAction: 'Inspection gate added.',
            verificationResult: 'Gate active.',
            effectivenessOwner,
            effectivenessDue,
            recurrenceKey: `rk-${issueId}`,
            priorIssueIds: [],
          },
        }),
      }
    : undefined

  return {
    id: `issue-${issueId}`,
    createdAt: '2026-07-20T08:00:00Z',
    equipmentId: `eq-${issueId}`,
    kind: 'surface_defect',
    description: 'Issue.',
    reportedBy: 'operator-01',
    status: withResolution ? 'resolved' : 'open',
    ...(resolution && { resolution }),
  }
}

function state(issues) {
  return {
    schema: 'supermega.plant.production.v1',
    batches: [],
    jobs: [],
    issues: issues ?? [],
    machines: [],
    events: [],
  }
}

// 1. Empty → all zeros, empty topOwners
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(state([]), AS_OF)
  check(r.totalCapas === 0, 'empty: totalCapas 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.overdueCapas === 0, 'empty: overdueCapas 0')
  check(r.topOwnersByTotal.length === 0, 'empty: topOwnersByTotal empty')
}

// 2. Issue with no resolution → skipped
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(state([issue({ withResolution: false })]), AS_OF)
  check(r.totalCapas === 0, 'no-resolution: totalCapas 0')
}

// 3. Issue with resolution but no CAPA → skipped
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(state([issue({ withCapa: false })]), AS_OF)
  check(r.totalCapas === 0, 'no-capa: totalCapas 0')
}

// 4. One CAPA, not overdue (effectivenessDue > asOf)
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([issue({ effectivenessOwner: 'owner-a', effectivenessDue: '2026-09-01T00:00:00Z' })]),
    AS_OF,
  )
  check(r.totalCapas === 1, 'not-overdue: totalCapas 1')
  check(r.uniqueOwners === 1, 'not-overdue: uniqueOwners 1')
  check(r.overdueCapas === 0, 'not-overdue: overdueCapas 0')
  check(r.topOwnersByTotal.length === 1, 'not-overdue: topOwnersByTotal has 1 entry')
  check(r.topOwnersByTotal[0].owner === 'owner-a', 'not-overdue: owner-a')
  check(r.topOwnersByTotal[0].total === 1, 'not-overdue: total 1')
  check(r.topOwnersByTotal[0].overdue === 0, 'not-overdue: overdue 0')
}

// 5. One CAPA, overdue (effectivenessDue < asOf)
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([issue({ effectivenessOwner: 'owner-b', effectivenessDue: '2026-08-01T00:00:00Z' })]),
    AS_OF,
  )
  check(r.overdueCapas === 1, 'overdue: overdueCapas 1')
  check(r.topOwnersByTotal[0].overdue === 1, 'overdue: owner-b overdue 1')
}

// 6. effectivenessDue === asOf is NOT overdue (strict less-than)
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([issue({ effectivenessDue: AS_OF })]),
    AS_OF,
  )
  check(r.overdueCapas === 0, 'equal-due: not overdue when due === asOf')
}

// 7. Two CAPAs, same owner → total 2
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([
      issue({ effectivenessOwner: 'owner-a', effectivenessDue: '2026-09-01T00:00:00Z' }),
      issue({ effectivenessOwner: 'owner-a', effectivenessDue: '2026-08-01T00:00:00Z' }),
    ]),
    AS_OF,
  )
  check(r.totalCapas === 2, 'same-owner: totalCapas 2')
  check(r.uniqueOwners === 1, 'same-owner: uniqueOwners 1')
  check(r.overdueCapas === 1, 'same-owner: overdueCapas 1')
  check(r.topOwnersByTotal[0].total === 2, 'same-owner: total 2')
  check(r.topOwnersByTotal[0].overdue === 1, 'same-owner: overdue 1')
}

// 8. Two different owners
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([
      issue({ effectivenessOwner: 'owner-a', effectivenessDue: '2026-09-01T00:00:00Z' }),
      issue({ effectivenessOwner: 'owner-b', effectivenessDue: '2026-08-01T00:00:00Z' }),
    ]),
    AS_OF,
  )
  check(r.uniqueOwners === 2, 'two-owners: uniqueOwners 2')
}

// 9. topOwnersByTotal sorted by total desc, secondary by owner localeCompare asc
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([
      issue({ effectivenessOwner: 'owner-b' }),
      issue({ effectivenessOwner: 'owner-a' }),
      issue({ effectivenessOwner: 'owner-b' }),
    ]),
    AS_OF,
  )
  check(r.topOwnersByTotal[0].owner === 'owner-b', 'sort: top is owner-b (2 total)')
  check(r.topOwnersByTotal[0].total === 2, 'sort: owner-b total 2')
  check(r.topOwnersByTotal[1].owner === 'owner-a', 'sort: second is owner-a (1 total)')
}

// 10. Same total → secondary sort by owner localeCompare
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([
      issue({ effectivenessOwner: 'zeta-owner' }),
      issue({ effectivenessOwner: 'alpha-owner' }),
    ]),
    AS_OF,
  )
  check(r.topOwnersByTotal[0].owner === 'alpha-owner', 'secondary-sort: alpha before zeta')
}

// 11. 6 owners → only top 5 returned
{
  const issues = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap(o => [
    issue({ effectivenessOwner: `owner-${o}` }),
  ])
  const r = projectPlantCapaEffectivenessOwnershipBrief(state(issues), AS_OF)
  check(r.uniqueOwners === 6, 'top-5: uniqueOwners 6')
  check(r.topOwnersByTotal.length === 5, 'top-5: topOwnersByTotal capped at 5')
}

// 12. Mixed issues — some with CAPA, some without
{
  const r = projectPlantCapaEffectivenessOwnershipBrief(
    state([
      issue({ effectivenessOwner: 'owner-a' }),
      issue({ withCapa: false }),
      issue({ effectivenessOwner: 'owner-a', effectivenessDue: '2026-07-01T00:00:00Z' }),
    ]),
    AS_OF,
  )
  check(r.totalCapas === 2, 'mixed: totalCapas 2 (one skipped)')
  check(r.overdueCapas === 1, 'mixed: overdueCapas 1')
  check(r.uniqueOwners === 1, 'mixed: uniqueOwners 1')
}

console.log(JSON.stringify({ ok: true, checks }))
