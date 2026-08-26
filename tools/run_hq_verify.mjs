import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const chain = pkg.scripts?.['hq:verify:steps']

if (!chain) throw new Error('hq_verify_steps_missing')

const rawSteps = chain.split(' && ')
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
}))
