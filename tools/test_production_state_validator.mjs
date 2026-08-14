// Contract guard for validateProductionState -- Plant's backstop, and the counterpart to
// the commerce one.
//
// The quality-hold guard already showed the pattern on this side: deleting the
// release-predates-hold check still refused the release, because this validator rejects the
// resulting event history. So the same risk applies -- if it stopped enforcing one of these,
// function-level guards would keep passing while the invariant was held nowhere.
//
// Each case corrupts ONE field of a state the seed produced. The seed must validate cleanly
// first, and a valid state must come back unchanged, or every rejection below is vacuous.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedProduction, validateProductionState, placeProductionQualityHold,
    } from './production-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/production-validator-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedProduction, validateProductionState, placeProductionQualityHold } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(mutate, label) {
  checks += 1
  const corrupted = structuredClone(createSeedProduction())
  mutate(corrupted)
  assert.throws(() => validateProductionState(corrupted), undefined, label)
}

// --- the baseline must pass --------------------------------------------------
const seed = createSeedProduction()
check(Boolean(validateProductionState(seed)), 'the seeded production workspace validates cleanly')
check(
  validateProductionState(seed).jobs.length === seed.jobs.length,
  'and comes back with its jobs intact rather than emptied',
)

// --- schema and shape --------------------------------------------------------
rejects((state) => { state.schema = 'supermega.production.workspace.v1' }, 'a workspace on the wrong schema is rejected')
rejects((state) => { delete state.jobs }, 'a workspace missing its jobs collection is rejected')
rejects((state) => { state.events = 'not an array' }, 'a non-array events collection is rejected')
rejects((state) => { state.revision = 1.5 }, 'a fractional revision is rejected')
rejects((state) => { state.revision = -1 }, 'a negative revision is rejected')
rejects((state) => { state.unexpectedField = true }, 'an unexpected top-level field is rejected, not ignored')

// --- job integrity -----------------------------------------------------------
rejects((state) => { state.jobs[0].target = 0 }, 'a job with a zero target is rejected')
rejects((state) => { state.jobs[0].target = -5 }, 'a job with a negative target is rejected')
rejects((state) => { state.jobs[0].output = -1 }, 'negative output is rejected')
rejects((state) => { state.jobs.push({ ...state.jobs[0] }) }, 'a duplicated job id is rejected')
// NOTE: `owner` is declared optional on ProductionJob (owner?: string), so deleting it is
// legitimately accepted. Asserting a rejection here would have been asserting a property the
// type does not claim. Corrupting its TYPE is the real check.
rejects((state) => { state.jobs[0].owner = 42 }, 'a job whose owner is not a string is rejected')

// --- the quality-hold invariant this backstops -------------------------------
// A hold on a job with no corresponding hold event is exactly the shape the quality-hold
// guard relies on this validator to refuse.
rejects(
  (state) => {
    state.jobs[0].qualityHold = {
      actionId: 'ACT-FABRICATED',
      heldAt: '2026-07-24T09:00:00.000Z',
      heldBy: 'Swan Htet',
      reason: 'fabricated hold with no event behind it',
      evidenceReference: 'QA-FABRICATED',
    }
  },
  'a quality hold with no matching event in the history is rejected',
)

// ...and the reverse: a legitimately held state must still validate, so the check above is
// rejecting the fabrication rather than holds in general.
const held = placeProductionQualityHold(seed, seed.jobs[0].id, {
  actionId: 'ACT-HOLD-VALID',
  capturedAt: '2026-07-24T09:00:00.000Z',
  actor: 'Swan Htet',
  reason: 'Suspected defect',
  evidenceReference: 'QA-HOLD-VALID',
})
check(Boolean(held), 'a properly placed hold produces a state')
check(Boolean(validateProductionState(held)), 'and that state validates -- holds themselves are fine')

// --- event history -----------------------------------------------------------
rejects(
  (state) => { state.events.push({ ...state.events[0] }) },
  'a duplicated event action id is rejected',
)

// --- no silent repair --------------------------------------------------------
const returned = validateProductionState(seed)
check(returned.jobs[0].target === seed.jobs[0].target, 'a valid state comes back with job targets unchanged')
check(returned.events.length === seed.events.length, 'and its full event history, not a filtered subset')

console.log(`production state validator contract: ${checks} checks passed`)
