import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { cpus } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const chain = pkg.scripts?.['app:verify:steps']
if (!chain) throw new Error('app_verify_chain_missing')

// Windows cmd.exe rejects command lines over 8191 chars, so the app:verify
// chain can never run as one npm script there. This runner executes
// the same chain step-by-step from the canonical package.json string.
//
// Default behaviour is byte-identical to the historical serial runner: no flags
// => run every step in canonical order, stop at the first failure. Opt into
// parallelism with --jobs N (capped at the core count). Parallel mode never
// uses an unbounded pool. It runs a serial prelude first -- the dist-producing
// app:build and the port-bound app:dev:verify (hard 45s timeout) -- so the
// artifact is complete before anything reads it and the dev boot is never
// starved; see the prelude block below for why each is there. First-failure
// reporting is deterministic in BOTH modes: the minimum failing canonical
// stepIndex wins, identical to serial semantics.
//
// This header previously listed five steps as the prelude (typecheck, build,
// dev-verify, deploy-workflow, security-contract) while the code preludes only
// app:dev:verify. Two of the three claims were wrong and stayed wrong for a
// while, so: the code below is the contract, and this comment tracks it.
//
// Subset flags for local iteration (do not affect canonical indices):
//   --only <substring>   keep only steps whose label/command contains it (repeatable)
//   --from <step>        start at a canonical index number or a label/command substring
const rawSteps = chain.split(' && ')
const totalSteps = rawSteps.length

function resolveStep(step) {
  const npmRun = step.match(/^npm run (\S+)$/)
  if (!npmRun) return { label: step, command: step }
  const name = npmRun[1]
  const target = pkg.scripts?.[name]
  if (!target) throw new Error(`app_verify_step_unknown:${name}`)
  const direct = /^node \S+\.mjs(?: [^&|<>]*)?$/.test(target) && !pkg.scripts?.[`pre${name}`] && !pkg.scripts?.[`post${name}`]
  return { label: name, command: direct ? target : step }
}

// ---- argv ----
const argv = process.argv.slice(2)
const only = []
let from = null
let jobs = 1
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--serial') jobs = 1
  else if (arg === '--jobs') jobs = Math.max(1, Number.parseInt(argv[++i] ?? '', 10) || 1)
  else if (arg === '--only') only.push(String(argv[++i] ?? ''))
  else if (arg === '--from') from = String(argv[++i] ?? '')
  else throw new Error(`app_verify_unknown_flag:${arg}`)
}
jobs = Math.min(jobs, Math.max(1, cpus().length))

// ---- build steps with canonical indices, then apply filters ----
let steps = rawSteps.map((step, i) => ({ index: i + 1, ...resolveStep(step) }))

if (from !== null) {
  const asNumber = Number.parseInt(from, 10)
  const numeric = String(asNumber) === from
  const start = steps.findIndex((s) =>
    (numeric && s.index === asNumber) || s.label.includes(from) || s.command.includes(from))
  if (start < 0) throw new Error(`app_verify_from_not_found:${from}`)
  steps = steps.slice(start)
}
if (only.length) {
  steps = steps.filter((s) => only.some((q) => s.label.includes(q) || s.command.includes(q)))
  if (!steps.length) throw new Error(`app_verify_only_no_match:${only.join(',')}`)
}

// Two steps must run before the fan-out, for unrelated reasons.
//
// app:dev:verify boots FastAPI+Vite on an ephemeral port with a hard 45s
// timeout, so CPU/IO starvation from a saturated pool could push its boot past
// the deadline.
//
// app:build PRODUCES showroom/dist/, which verify_app_build CONSUMES. An
// earlier revision of this comment claimed the heavy steps "do NOT mutate
// shared state and have no hard timeout, so they pool safely". That was wrong
// about the build: `npm run app:build` runs app:release:write and then Vite,
// which EMPTIES dist/ before repopulating it. With both steps in the pool at
// --jobs 8 they start together, and verify_app_build reads the directory
// mid-write. Three independent lanes hit this on 2026-08-20 and each reported
// the same shape: missing_app_webmanifest / missing_apple_touch_icon /
// missing_service_worker / missing_release_metadata, on a tree where those
// files demonstrably existed in dist/ afterwards.
//
// The false-RED above is the benign direction. The silent one is worse: when a
// previous complete dist/ is already on disk and verify_app_build finishes
// reading it before Vite empties it, the gate validates the OLD artifact and
// reports green while this build's output was never inspected at all. That is
// the same stale-dist false-green CLAUDE.md warns about after a suppressed
// build, arrived at by a different route -- and unlike that one, it leaves no
// trace in the output to notice afterwards.
//
// Ordering the producer ahead of the pool removes both directions. The cost is
// that the build no longer overlaps the other heavy steps; correctness over a
// few seconds of wall clock, and the fan-out still covers the remaining ~637.
const PRELUDE_MATCHERS = ['app:build', 'app:dev:verify', 'verify_local_app_dev']
const isPrelude = (s) => PRELUDE_MATCHERS.some((m) => s.label.includes(m) || s.command.includes(m))

// Regression guard for the race above. If a future chain adds another consumer
// of dist/ -- or the build is dropped from the prelude -- this fails loudly at
// scheduling time instead of racing silently and reporting a colour nobody can
// trust. Deliberately scoped to the case where the chain being run contains
// BOTH sides: `--only verify_app_build` filters the producer out on purpose, to
// re-check an existing dist/, and that is not a race.
const DIST_PRODUCER_MATCHERS = ['app:build']
const DIST_CONSUMER_MATCHERS = ['verify_app_build']
const matchesAny = (s, matchers) => matchers.some((m) => s.label.includes(m) || s.command.includes(m))

function runStep(step) {
  return new Promise((done) => {
    const child = spawn(step.command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', (error) => done({ step, code: 1, stdout: out, stderr: err + String(error?.message ?? error) }))
    child.on('close', (code) => done({ step, code: code ?? 0, stdout: out, stderr: err }))
  })
}

const startedAt = process.hrtime.bigint()

function finishFailure(result) {
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  console.error(JSON.stringify({ ok: false, failedStep: result.step.label, stepIndex: result.step.index, totalSteps }))
  process.exit(1)
}

function finishSuccess() {
  const seconds = Number((process.hrtime.bigint() - startedAt) / 1000000n) / 1000
  console.log(JSON.stringify({ ok: true, contract: 'supermega.app-verify-runner.v1', steps: steps.length, totalSteps, jobs, seconds }))
}

// Serial run in canonical order; returns the first failing result or null.
async function runSerial(list) {
  for (const step of list) {
    process.stdout.write(`[${step.index}/${totalSteps}] ${step.label}\n`)
    const result = await runStep(step)
    if (result.code !== 0) return result
  }
  return null
}

if (jobs <= 1) {
  const failure = await runSerial(steps)
  if (failure) finishFailure(failure)
  finishSuccess()
} else {
  // The dist producer and the port-bound step first, uncontended, in canonical
  // order. Every pool worker starts only after this returns.
  const prelude = steps.filter(isPrelude)
  const light = steps.filter((s) => !isPrelude(s))

  if (
    light.some((s) => matchesAny(s, DIST_CONSUMER_MATCHERS)) &&
    steps.some((s) => matchesAny(s, DIST_PRODUCER_MATCHERS)) &&
    !prelude.some((s) => matchesAny(s, DIST_PRODUCER_MATCHERS))
  ) {
    throw new Error('app_verify_dist_producer_not_ordered_before_pool')
  }

  const preludeFailure = await runSerial(prelude)
  if (preludeFailure) finishFailure(preludeFailure)

  // Bounded pool over the remaining steps with a shared ascending cursor. No
  // await sits between reading and incrementing the cursor, so assignment is
  // strictly ascending on Node's single thread. On the first failure we stop
  // scheduling NEW steps but let in-flight ones drain (Promise.all), then report
  // the minimum failing canonical index -- identical to serial's first failure.
  const failures = []
  let cursor = 0
  let stop = false
  async function worker() {
    while (!stop) {
      const i = cursor
      cursor += 1
      if (i >= light.length) return
      const result = await runStep(light[i])
      process.stdout.write(`[${result.step.index}/${totalSteps}] ${result.step.label}\n`)
      if (result.code !== 0) { failures.push(result); stop = true; return }
    }
  }
  const width = Math.max(1, Math.min(jobs, light.length))
  await Promise.all(Array.from({ length: width }, () => worker()))
  if (failures.length) {
    failures.sort((a, b) => a.step.index - b.step.index)
    finishFailure(failures[0])
  }
  finishSuccess()
}
