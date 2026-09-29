import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const chain = pkg.scripts?.['hq:verify:steps']

if (!chain) throw new Error('hq_verify_steps_missing')

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--release-contracts')) throw new Error('hq_verify_mode_invalid')
const mode = process.env.SUPERMEGA_HQ_VERIFY_MODE || ''
if (mode && mode !== 'release-contracts') throw new Error('hq_verify_mode_invalid')
const releaseContracts = args[0] === '--release-contracts' || mode === 'release-contracts'
const operationalChecks = new Map([
  ['node tools/verify_release_stack_owner_gates.mjs --verify', 'node tools/verify_release_stack_owner_gates.mjs --self-test'],
  ['npm run shop:pilot:day0-readiness', 'npm run shop:pilot:day0-readiness:self-test'],
  ['node tools/verify_shop_pilot_launch_gate.mjs --verify', 'node tools/verify_shop_pilot_launch_gate.mjs --self-test'],
])
const originalSteps = chain.split(' && ')
if (releaseContracts && [...operationalChecks.keys()].some(command => originalSteps.filter(step => step === command).length !== 1)) throw new Error('hq_operational_contract_step_missing')
// An exact-main, writes-disabled artifact release is not a review branch or pilot handoff.
// Keep those readiness assessors unchanged; exercise their contracts in this mode.
// Authority, exact-head, provider configuration and hosted checks remain in the workflow.
const rawSteps = releaseContracts
  ? [...new Set(originalSteps.map(step => operationalChecks.get(step) || step))]
  : originalSteps
const totalSteps = rawSteps.length

function npmScriptName(command) {
  const match = command.match(/^npm run (\S+)$/)
  return match?.[1] || null
}

function runShell(command) {
  return new Promise((done) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => done({ code: 1, stdout, stderr: `${stderr}${String(error?.message ?? error)}` }))
    child.on('close', (code) => done({ code: code ?? 0, stdout, stderr }))
  })
}

async function runCommand(command) {
  const scriptName = npmScriptName(command)
  if (!scriptName) return runShell(command)

  const target = pkg.scripts?.[scriptName]
  if (!target) {
    return {
      code: 1,
      stdout: '',
      stderr: `hq_verify_step_unknown:${scriptName}`,
    }
  }

  let stdout = ''
  let stderr = ''
  for (const nestedCommand of target.split(' && ')) {
    const result = await runCommand(nestedCommand)
    stdout += result.stdout || ''
    stderr += result.stderr || ''
    if (result.code !== 0) return { code: result.code, stdout, stderr }
  }
  return { code: 0, stdout, stderr }
}

const startedAt = process.hrtime.bigint()

for (const [index, command] of rawSteps.entries()) {
  const label = npmScriptName(command) || command
  process.stdout.write(`[${index + 1}/${totalSteps}] ${label}\n`)
  const result = await runCommand(command)
  if (result.code !== 0) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    console.error(JSON.stringify({
      ok: false,
      contract: 'supermega.hq-verify-runner.v1',
      failedStep: label,
      stepIndex: index + 1,
      totalSteps,
    }))
    process.exit(1)
  }
}

const seconds = Number((process.hrtime.bigint() - startedAt) / 1000000n) / 1000
console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.hq-verify-runner.v1',
  steps: totalSteps,
  seconds,
  externalWritesPerformed: false,
  evidence: releaseContracts ? 'source_contracts_not_operational_readiness' : 'review_workspace_checks',
}))
