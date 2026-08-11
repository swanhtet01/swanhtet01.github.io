// Plant maintenance corrective text brief: correctiveAction and verificationResult strings.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaintenanceCorrectiveTextBrief } from './plant-maintenance-corrective-text-brief.ts'`,
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

const { projectPlantMaintenanceCorrectiveTextBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let issueId = 0
function mca({ correctiveAction = 'Replaced bearing.', verificationResult = 'Runs smoothly.' } = {}) {
  return {
    contract: 'supermega.production.maintenance-corrective-action.v1',
    correctiveAction,
    verificationResult,
    finalDisposition: 'recommended',
  }
}

function issue({ action } = {}) {
  issueId++
  const base = {
    id: `ISS-${issueId}`,
    reportedAt: '2026-08-01T09:00:00Z',
    description: 'issue',
    status: 'resolved',
    owner: 'team-a',
  }
  if (action !== undefined) base.resolution = { maintenanceCorrectiveAction: action }
  return base
}

function state(issues = []) {
  return {
    schema: 'supermega.production.workspace.v2',
    issues,
    machines: [],
    jobs: [],
    events: [],
  }
}

// 1. Empty issues → all zeros
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([]))
  check(r.totalCorrectiveActions === 0, 'empty: totalCorrectiveActions 0')
  check(r.uniqueCorrectiveActions === 0, 'empty: uniqueCorrectiveActions 0')
  check(r.topCorrectiveActionsByCount.length === 0, 'empty: topActions empty')
  check(r.uniqueVerificationResults === 0, 'empty: uniqueVerificationResults 0')
  check(r.topVerificationResultsByCount.length === 0, 'empty: topResults empty')
}

// 2. Issues without corrective action → zero
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([issue(), issue()]))
  check(r.totalCorrectiveActions === 0, 'no-mca: totalCorrectiveActions 0')
}

// 3. Single issue with corrective action
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([
    issue({ action: mca({ correctiveAction: 'Lubricated chain.', verificationResult: 'No vibration.' }) }),
  ]))
  check(r.totalCorrectiveActions === 1, 'single: totalCorrectiveActions 1')
  check(r.uniqueCorrectiveActions === 1, 'single: uniqueCorrectiveActions 1')
  check(r.topCorrectiveActionsByCount[0].correctiveAction === 'Lubricated chain.', 'single: top action')
  check(r.topCorrectiveActionsByCount[0].count === 1, 'single: action count 1')
  check(r.uniqueVerificationResults === 1, 'single: uniqueVerificationResults 1')
  check(r.topVerificationResultsByCount[0].verificationResult === 'No vibration.', 'single: top result')
}

// 4. Multiple issues with same action (dedup counting)
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([
    issue({ action: mca({ correctiveAction: 'Replaced bearing.', verificationResult: 'OK.' }) }),
    issue({ action: mca({ correctiveAction: 'Replaced bearing.', verificationResult: 'OK.' }) }),
    issue({ action: mca({ correctiveAction: 'Cleaned filter.', verificationResult: 'OK.' }) }),
  ]))
  check(r.totalCorrectiveActions === 3, 'dedup: totalCorrectiveActions 3')
  check(r.uniqueCorrectiveActions === 2, 'dedup: uniqueCorrectiveActions 2')
  check(r.topCorrectiveActionsByCount[0].correctiveAction === 'Replaced bearing.', 'dedup: top action')
  check(r.topCorrectiveActionsByCount[0].count === 2, 'dedup: action count 2')
  check(r.uniqueVerificationResults === 1, 'dedup: uniqueVerificationResults 1 (both have OK)')
  check(r.topVerificationResultsByCount[0].count === 3, 'dedup: result count 3')
}

// 5. Mixed: issues with and without MCA
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([
    issue(),
    issue({ action: mca() }),
    issue({ action: mca({ correctiveAction: 'Adjusted tension.' }) }),
  ]))
  check(r.totalCorrectiveActions === 2, 'mixed: totalCorrectiveActions 2')
  check(r.uniqueCorrectiveActions === 2, 'mixed: uniqueCorrectiveActions 2')
}

// 6. Top-5 cap on actions
{
  const actions = ['A', 'B', 'C', 'D', 'E', 'F'].map(a =>
    issue({ action: mca({ correctiveAction: a }) }),
  )
  const r = projectPlantMaintenanceCorrectiveTextBrief(state(actions))
  check(r.topCorrectiveActionsByCount.length === 5, 'top5: actions capped at 5')
}

// 7. Alphabetical tie-break: equal counts sort by action text
{
  const r = projectPlantMaintenanceCorrectiveTextBrief(state([
    issue({ action: mca({ correctiveAction: 'Zebra fix.' }) }),
    issue({ action: mca({ correctiveAction: 'Apple fix.' }) }),
  ]))
  check(r.topCorrectiveActionsByCount[0].correctiveAction === 'Apple fix.', 'tiebreak: Apple before Zebra')
}

console.log(JSON.stringify({ ok: true, checks }))
