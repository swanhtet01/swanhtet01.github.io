import { readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const chain = pkg.scripts?.['app:verify']
if (!chain) throw new Error('app_verify_chain_missing')

// Windows cmd.exe rejects command lines over 8191 chars, so the app:verify
// chain (~23KB) can never run as one npm script there. This runner executes
// the same chain step-by-step from the canonical package.json string.
const steps = chain.split(' && ')

function resolveStep(step) {
  const npmRun = step.match(/^npm run (\S+)$/)
  if (!npmRun) return { label: step, command: step }
  const name = npmRun[1]
  const target = pkg.scripts?.[name]
  if (!target) throw new Error(`app_verify_step_unknown:${name}`)
  const direct = /^node \S+\.mjs(?: [^&|<>]*)?$/.test(target) && !pkg.scripts?.[`pre${name}`] && !pkg.scripts?.[`post${name}`]
  return { label: name, command: direct ? target : step }
}

const startedAt = process.hrtime.bigint()
let index = 0
for (const step of steps) {
  index += 1
  const { label, command } = resolveStep(step)
  process.stdout.write(`[${index}/${steps.length}] ${label}\n`)
  try {
    execSync(command, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    process.stdout.write(String(error.stdout || ''))
    process.stderr.write(String(error.stderr || ''))
    console.error(JSON.stringify({ ok: false, failedStep: label, stepIndex: index, totalSteps: steps.length }))
    process.exit(1)
  }
}
const seconds = Number((process.hrtime.bigint() - startedAt) / 1000000n) / 1000
console.log(JSON.stringify({ ok: true, contract: 'supermega.app-verify-runner.v1', steps: steps.length, seconds }))
