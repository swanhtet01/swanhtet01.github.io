import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { cpus } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const chain = pkg.scripts?.['app:verify']
if (!chain) throw new Error('app_verify_chain_missing')

// Windows cmd.exe rejects command lines over 8191 chars, so the app:verify
// chain (~23KB) can never run as one npm script there. This runner executes
// the same chain step-by-step from the canonical package.json string.
//
// Default behaviour is byte-identical to the historical serial runner: no flags
// => run every step in canonical order, stop at the first failure. Opt into
// parallelism with --jobs N (capped at the core count). Parallel mode never
// uses an unbounded pool and runs the five heavy, subprocess-spawning steps
// (typecheck, build, dev-verify, deploy-workflow, security-contract) as a
// serial prelude first, so the port-bound app:dev:verify (hard 45s timeout) is
// never starved and the most common breakages fast-fail before the wide
// fan-out. First-failure reporting is deterministic in BOTH modes: the minimum
// failing canonical stepIndex wins, identical to serial semantics.
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

// The adversarial safety audit found exactly ONE step that can FALSE-FAIL under
// concurrency: app:dev:verify boots FastAPI+Vite on an ephemeral port with a
// hard 45s timeout, so CPU/IO starvation from a saturated pool could push its
// boot past the deadline. It alone runs uncontended, as a serial prelude, before
// the fan-out. The other subprocess-heavy steps (typecheck, build,
// deploy-workflow, security-contract) do NOT mutate shared state and have no
// hard timeout, so they pool safely (peak concurrency is capped at `jobs`), and
// ascending assignment still surfaces an early typecheck/build failure quickly.
const PRELUDE_MATCHERS = ['app:dev:verify', 'verify_local_app_dev']
const isPrelude = (s) => PRELUDE_MATCHERS.some((m) => s.label.includes(m) || s.command.includes(m))

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
  // The port-bound step first, uncontended, in canonical order.
  const prelude = steps.filter(isPrelude)
  const light = steps.filter((s) => !isPrelude(s))
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
