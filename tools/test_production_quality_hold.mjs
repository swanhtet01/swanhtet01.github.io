// Contract guard for the Plant quality hold -- the mechanism that stops defective product
// leaving the floor.
//
// A hold is placed on a job, and until it is released that job is flagged. The rules worth
// pinning are the ones that decide whether a hold can be bypassed: you cannot release a hold
// that was never placed, you cannot backdate a release to before the hold, you cannot hold a
// closed job, and replaying the same action id must not create a second event.
//
// That last one matters more than it looks. These functions are called from a UI that can
// retry, and the idempotency contract here is unusual: replaying the SAME action id with the
// SAME proof returns the state unchanged, while reusing that id for anything else returns
// null. Both halves are asserted.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedProduction, placeProductionQualityHold, releaseProductionQualityHold,
    } from './production-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/quality-hold-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedProduction, placeProductionQualityHold, releaseProductionQualityHold } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const seed = createSeedProduction()
const job = seed.jobs.find((candidate) => !candidate.qualityHold && !candidate.closure)
check(Boolean(job), 'the seed contains an open job with no existing hold')

const proof = (actionId, capturedAt = '2026-07-24T09:00:00.000Z') => ({
  actionId,
  capturedAt,
  actor: 'Swan Htet',
  reason: 'Suspected weld defect on this batch',
  evidenceReference: `QA-${actionId}`,
})

const heldJob = (state) => state.jobs.find((candidate) => candidate.id === job.id)

// --- placing a hold ----------------------------------------------------------
const held = placeProductionQualityHold(seed, job.id, proof('ACT-HOLD-1'))
check(Boolean(held), 'a quality hold can be placed on an open job')
check(Boolean(heldJob(held).qualityHold), 'the job carries the hold afterwards')
check(heldJob(held).qualityHold.heldBy === 'Swan Htet', 'the hold records who placed it')
check(heldJob(held).qualityHold.evidenceReference === 'QA-ACT-HOLD-1', 'and the evidence reference')
check(held.revision === seed.revision + 1, 'the state revision advances exactly once')
check(seed.jobs.find((c) => c.id === job.id).qualityHold === undefined, 'the original state is not mutated')
check(
  held.events.filter((event) => event.kind === 'quality_hold_placed' && event.subjectId === job.id).length === 1,
  'exactly one hold event is recorded',
)

// --- idempotency: same id, same proof, no second event -----------------------
const replayed = placeProductionQualityHold(held, job.id, proof('ACT-HOLD-1'))
check(replayed === held, 'replaying the identical action returns the SAME state object, not a new one')
check(
  replayed.events.filter((event) => event.kind === 'quality_hold_placed').length
    === held.events.filter((event) => event.kind === 'quality_hold_placed').length,
  'and creates no second hold event -- a retried click cannot double-hold',
)

// ...but the same id used for a DIFFERENT subject is refused outright.
const otherJob = seed.jobs.find((candidate) => candidate.id !== job.id && !candidate.qualityHold && !candidate.closure)
if (otherJob) {
  check(
    placeProductionQualityHold(held, otherJob.id, proof('ACT-HOLD-1')) === null,
    'reusing that action id for a different job is refused, not silently applied',
  )
}

// --- a job already on hold cannot be held again ------------------------------
check(
  placeProductionQualityHold(held, job.id, proof('ACT-HOLD-2')) === null,
  'a job already on quality hold cannot be held a second time',
)

// --- releasing ---------------------------------------------------------------
check(
  releaseProductionQualityHold(seed, job.id, proof('ACT-REL-0')) === null,
  'releasing a hold that was never placed is refused',
)

check(
  releaseProductionQualityHold(held, job.id, proof('ACT-REL-BACKDATED', '2026-07-24T08:00:00.000Z')) === null,
  'a release backdated to BEFORE the hold was placed is refused',
)

const released = releaseProductionQualityHold(held, job.id, proof('ACT-REL-1', '2026-07-24T10:00:00.000Z'))
check(Boolean(released), 'a hold can be released after it was placed')
check(heldJob(released).qualityHold === undefined, 'the job no longer carries a hold')
check(released.revision === held.revision + 1, 'the release advances the revision once')
check(
  released.events.filter((event) => event.kind === 'quality_hold_released' && event.subjectId === job.id).length === 1,
  'exactly one release event is recorded',
)
check(
  released.events.filter((event) => event.kind === 'quality_hold_placed' && event.subjectId === job.id).length === 1,
  'and the original hold event is retained -- the trail keeps both halves',
)

const replayedRelease = releaseProductionQualityHold(released, job.id, proof('ACT-REL-1', '2026-07-24T10:00:00.000Z'))
check(replayedRelease === released, 'replaying the identical release returns the same state')

check(
  releaseProductionQualityHold(released, job.id, proof('ACT-REL-2', '2026-07-24T11:00:00.000Z')) === null,
  'releasing again after the hold is gone is refused',
)

// --- proofs must be well formed ----------------------------------------------
for (const [label, bad] of [
  ['no actionId', { ...proof('ACT-X'), actionId: '' }],
  ['untrimmed actionId', { ...proof('ACT-X'), actionId: '  ACT-X  ' }],
  ['no actor', { ...proof('ACT-X'), actor: '' }],
  ['not an object', 'nope'],
]) {
  check(
    placeProductionQualityHold(seed, job.id, bad) === null,
    `a hold with ${label} is refused`,
  )
}

// --- what these assertions do NOT individually prove -------------------------
// Two of the source guards can be deleted with every check above still passing, because an
// earlier guard already refuses the same input. Verified directly rather than assumed:
//
//   timestampBefore(proof.capturedAt, job.qualityHold.heldAt) -- a backdated release is also
//   caught by the latestJobEvent ordering check, since the hold event itself is newer.
//
//   actionIdIsUsed(state, proof.actionId) -- reusing an id for a different job is also caught
//   by the `existing` branch at the top, which requires the recorded subjectId to match.
//
// The behaviour is right either way, and these tests assert behaviour, so they stay green.
// Recorded so the numbers are not mistaken for per-guard coverage.

console.log(`production quality hold contract: ${checks} checks passed`)
