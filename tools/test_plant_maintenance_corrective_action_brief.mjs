// Plant maintenance corrective action brief: finalDisposition enum distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaintenanceCorrectiveActionBrief } from './plant-maintenance-corrective-action-brief.ts'`,
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

const { projectPlantMaintenanceCorrectiveActionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function issue({ disposition } = {}) {
  issueId++
  const base = {
    id: `issue-${issueId}`,
    createdAt: '2026-08-11T08:00:00Z',
    area: 'area-01',
    kind: 'maintenance',
    summary: 'Maintenance issue.',
    status: 'resolved',
  }
  if (disposition === undefined) return base
  return {
    ...base,
    resolution: {
      actionId: `res-${issueId}`,
      resolvedAt: '2026-08-11T09:00:00Z',
      resolvedBy: 'tech-01',
      reason: 'Resolved.',
      evidenceReference: '',
      maintenanceCorrectiveAction: {
        contract: 'supermega.production.maintenance-corrective-action.v1',
        correctiveAction: 'Replaced bearing.',
        verificationResult: 'Equipment runs smoothly.',
        finalDisposition: disposition,
      },
    },
  }
}

function state(issues) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: issues ?? [],
    machines: [],
    events: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([]))
  check(r.totalCorrectiveActions === 0, 'empty: totalCorrectiveActions 0')
  check(r.recommendedCount === 0, 'empty: recommendedCount 0')
  check(r.restrictedCount === 0, 'empty: restrictedCount 0')
  check(r.notRecommendedCount === 0, 'empty: notRecommendedCount 0')
  check(r.recommendedRate === 0, 'empty: recommendedRate 0')
  check(r.restrictedRate === 0, 'empty: restrictedRate 0')
  check(r.notRecommendedRate === 0, 'empty: notRecommendedRate 0')
}

// 2. Issue with no resolution → not counted
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([issue()]))
  check(r.totalCorrectiveActions === 0, 'no-resolution: not counted')
}

// 3. Issue with resolution but no maintenanceCorrectiveAction
{
  const resolved = {
    ...issue(),
    status: 'resolved',
    resolution: {
      actionId: 'res-x',
      resolvedAt: '2026-08-11T09:00:00Z',
      resolvedBy: 'tech-01',
      reason: 'Resolved.',
      evidenceReference: '',
    },
  }
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([resolved]))
  check(r.totalCorrectiveActions === 0, 'no-mca: not counted')
}

// 4. Single recommended
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([issue({ disposition: 'recommended' })]))
  check(r.totalCorrectiveActions === 1, 'recommended: total 1')
  check(r.recommendedCount === 1, 'recommended: count 1')
  check(r.restrictedCount === 0, 'recommended: restricted 0')
  check(r.notRecommendedCount === 0, 'recommended: notRecommended 0')
  check(r.recommendedRate === 100, 'recommended: rate 100')
  check(r.restrictedRate === 0, 'recommended: restrictedRate 0')
  check(r.notRecommendedRate === 0, 'recommended: notRecommendedRate 0')
}

// 5. Single restricted
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([issue({ disposition: 'restricted' })]))
  check(r.restrictedCount === 1, 'restricted: count 1')
  check(r.restrictedRate === 100, 'restricted: rate 100')
  check(r.recommendedCount === 0, 'restricted: recommended 0')
}

// 6. Single not_recommended
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([issue({ disposition: 'not_recommended' })]))
  check(r.notRecommendedCount === 1, 'not_recommended: count 1')
  check(r.notRecommendedRate === 100, 'not_recommended: rate 100')
  check(r.recommendedCount === 0, 'not_recommended: recommended 0')
}

// 7. All three dispositions — 1 recommended, 1 restricted, 1 not_recommended
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([
    issue({ disposition: 'recommended' }),
    issue({ disposition: 'restricted' }),
    issue({ disposition: 'not_recommended' }),
  ]))
  check(r.totalCorrectiveActions === 3, 'all-three: total 3')
  check(r.recommendedCount === 1, 'all-three: recommended 1')
  check(r.restrictedCount === 1, 'all-three: restricted 1')
  check(r.notRecommendedCount === 1, 'all-three: notRecommended 1')
  check(r.recommendedRate === 33, 'all-three: recommendedRate 33')
  check(r.restrictedRate === 33, 'all-three: restrictedRate 33')
  check(r.notRecommendedRate === 33, 'all-three: notRecommendedRate 33')
}

// 8. Counts accumulate — 2 recommended, 1 restricted
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([
    issue({ disposition: 'recommended' }),
    issue({ disposition: 'recommended' }),
    issue({ disposition: 'restricted' }),
  ]))
  check(r.totalCorrectiveActions === 3, 'multi: total 3')
  check(r.recommendedCount === 2, 'multi: recommended 2')
  check(r.restrictedCount === 1, 'multi: restricted 1')
  check(r.notRecommendedCount === 0, 'multi: notRecommended 0')
}

// 9. Rate rounds — 1 recommended of 3 = 33%
{
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([
    issue({ disposition: 'recommended' }),
    issue({ disposition: 'restricted' }),
    issue({ disposition: 'restricted' }),
  ]))
  check(r.recommendedRate === 33, 'round-33: recommendedRate 33')
  check(r.restrictedRate === 67, 'round-67: restrictedRate 67')
}

// 10. Mixed: some issues without resolution, some with quality CAPA only, one with maintenance CAPA
{
  const qualityOnly = {
    ...issue(),
    status: 'resolved',
    resolution: {
      actionId: 'res-q',
      resolvedAt: '2026-08-11T09:00:00Z',
      resolvedBy: 'tech-01',
      reason: 'Quality corrective action.',
      evidenceReference: '',
      qualityCorrectiveAction: {
        contract: 'supermega.production.quality-capa.v1',
        failureMode: 'surface defect',
        causeCategory: 'material',
        rootCause: 'Supplier material variance.',
        correctiveAction: 'Switch supplier batch.',
        verificationResult: 'Pass.',
        effectivenessOwner: 'qa-01',
        effectivenessDue: '2026-09-01',
        recurrenceKey: 'surface-defect::material',
        priorIssueIds: [],
      },
    },
  }
  const r = projectPlantMaintenanceCorrectiveActionBrief(state([
    issue(),
    qualityOnly,
    issue({ disposition: 'recommended' }),
  ]))
  check(r.totalCorrectiveActions === 1, 'mixed: only mca issues counted (total 1)')
  check(r.recommendedCount === 1, 'mixed: recommendedCount 1')
}

console.log(JSON.stringify({ ok: true, checks }))
