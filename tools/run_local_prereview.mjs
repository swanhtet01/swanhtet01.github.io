#!/usr/bin/env node

// Advisory local lane pre-review.
//
// Wraps the free local coding stack (Ollama + OpenCode via
// ../local-agent-company/local-code.cmd, receipt schema local-ai.coding-run.v1)
// to summarize a committed git range and flag suspicious deletions, secret-shaped
// additions, and scope creep. Advisory only: findings never gate a lane, the
// wrapper mutates nothing outside the git-ignored .tmp/local-prereview/ output
// directory, and the wrapper itself performs zero network calls (the runner's
// inference is loopback-only by design). When the local stack is absent the tool
// fails closed with the single reason line "local_prereview_unavailable".

import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export const LOCAL_PREREVIEW_CONTRACT = 'supermega.local-prereview.v1'
export const RUNNER_RECEIPT_SCHEMA = 'local-ai.coding-run.v1'
export const READINESS_PROBE_CONTRACT = 'supermega.local-ai-readiness.v1'
export const UNAVAILABLE_REASON = 'local_prereview_unavailable'
export const DEFAULT_RANGE = 'origin/main...HEAD'
export const MAX_TASK_DOCUMENT_BYTES = 30_000
export const MAX_TASK_FILE_LIST = 50

const root = resolve(import.meta.dirname, '..')
const defaultLauncher = resolve(root, '..', 'local-agent-company', 'local-code.cmd')
const defaultProbeScript = resolve(homedir(), '.codex', 'skills', 'supermega-local-ai', 'scripts', 'check_local_ai.ps1')
const defaultPowershell = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const defaultOutputDirectory = resolve(root, '.tmp', 'local-prereview')

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024
const MAX_REPORT_CHANGED_FILES = 1_000
const RUNNER_TIMEOUT_SECONDS = 300
const RUNNER_WRAPPER_TIMEOUT_MS = 900_000
const RANGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./~^-]*(?:\.\.\.?[A-Za-z0-9][A-Za-z0-9_./~^-]*)?$/
const RUNNER_TEST_COMMAND = Object.freeze(['git', 'status', '--porcelain=v1'])

export class PrereviewError extends Error {
  constructor(reason, detail) {
    super(detail ? `${reason}:${detail}` : reason)
    this.name = 'PrereviewError'
    this.reason = reason
    this.detail = detail
  }
}

const execFileAsync = promisify(execFile)

async function defaultExec(file, args, { cwd, timeoutMs } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: cwd ?? root,
      timeout: timeoutMs ?? 120_000,
      maxBuffer: MAX_CAPTURE_BYTES,
      windowsHide: true,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    if (typeof error?.code === 'number') {
      return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
    }
    if (error?.killed || error?.signal) {
      return { code: null, timedOut: true, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' }
    }
    return {
      code: null,
      spawnError: String(error?.code || error?.message || 'spawn_failed').slice(0, 80),
      stdout: '',
      stderr: '',
    }
  }
}

async function defaultExists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

export function validateRange(value) {
  const candidate = String(value ?? DEFAULT_RANGE).trim()
  if (!candidate || candidate.length > 200 || !RANGE_PATTERN.test(candidate)) {
    throw new PrereviewError('local_prereview_range_invalid')
  }
  return candidate
}

export function parseNameStatus(output) {
  const entries = []
  for (const line of String(output ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 2 || !parts[0].trim()) throw new PrereviewError('local_prereview_git_output_invalid')
    entries.push({ status: parts[0].trim(), path: parts.at(-1).trim() })
  }
  return entries
}

export function buildTaskDocument({ range, changedFiles, diff }) {
  const listed = changedFiles.slice(0, MAX_TASK_FILE_LIST)
  const omitted = changedFiles.length - listed.length
  const header = [
    '# Local lane pre-review (advisory only)',
    '',
    'You are a read-only reviewer. Do not modify, create, delete, rename, or move any file.',
    'Do not run formatters, installers, package managers, or any write command.',
    'Do not access the network. Produce review text only.',
    `Review the committed change described by the git range ${range} using the diff below.`,
    '',
    'Answer in exactly this shape:',
    '1. SUMMARY: at most 8 bullet lines describing what the change does.',
    '2. SUSPICIOUS DELETIONS: removed code, tests, guards, or files that look unintentional.',
    '3. POSSIBLE SECRETS: credential-, token-, or key-shaped content added by the diff.',
    '4. SCOPE CREEP: hunks unrelated to what the summary describes.',
    'Write "none" for a section without findings. Findings are advisory and block nothing.',
    '',
    `## Changed files (${changedFiles.length}${omitted > 0 ? `, listing first ${listed.length}` : ''})`,
    '',
    ...listed.map((entry) => `- ${entry.status} ${entry.path}`),
    ...(omitted > 0 ? [`- (${omitted} more files omitted)`] : []),
    '',
    '## Diff (git, unified=1)',
    '',
  ].join('\n')
  const truncationNote = '\n[diff truncated to fit the bounded task budget]\n'
  let body = String(diff ?? '').replace(/\u0000/g, '')
  let diffTruncated = false
  let document = `${header}${body}\n`
  if (Buffer.byteLength(document, 'utf8') > MAX_TASK_DOCUMENT_BYTES) {
    diffTruncated = true
    const budget = MAX_TASK_DOCUMENT_BYTES - Buffer.byteLength(header, 'utf8') - Buffer.byteLength(truncationNote, 'utf8')
    if (budget <= 0) throw new PrereviewError('local_prereview_task_budget_invalid')
    body = Buffer.from(body, 'utf8').subarray(0, budget).toString('utf8').replace(/\uFFFD+$/u, '')
    document = `${header}${body}${truncationNote}`
  }
  if (Buffer.byteLength(document, 'utf8') > MAX_TASK_DOCUMENT_BYTES) throw new PrereviewError('local_prereview_task_budget_invalid')
  return { document, diffTruncated, listedFileCount: listed.length }
}

function parseLastJsonLine(output) {
  const lines = String(output ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const line = lines.at(-1)
  if (!line || line.length > 96_000) return { line: null, parsed: null }
  try {
    return { line, parsed: JSON.parse(line) }
  } catch {
    return { line, parsed: null }
  }
}

export function evaluateReceipt(stdout) {
  const { line, parsed: receipt } = parseLastJsonLine(stdout)
  if (!line || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || receipt.schema !== RUNNER_RECEIPT_SCHEMA
    || receipt.paidApiUsed !== false
    || receipt.externalActionPerformed !== false
    || receipt.autoPermissionsEnabled !== false) {
    throw new PrereviewError('local_prereview_receipt_invalid')
  }
  const changedFiles = Array.isArray(receipt.changedFiles) ? receipt.changedFiles : []
  const outcome = changedFiles.length > 0
    ? 'mutation_detected'
    : receipt.status === 'rejected' && receipt.reason === 'no_file_change'
      ? 'clean_advisory'
      : 'agent_failed'
  return {
    receipt,
    receiptDigest: `sha256:${createHash('sha256').update(line, 'utf8').digest('hex')}`,
    outcome,
  }
}

async function gitObserve(exec, projectRoot, args) {
  const result = await exec('git', args, { cwd: projectRoot, timeoutMs: 120_000 })
  if (result.code !== 0) {
    throw new PrereviewError('local_prereview_git_failed', `${args[0]}_${result.code ?? result.spawnError ?? 'unknown'}`)
  }
  return result.stdout
}

export async function probeLocalStack({ exec, exists, powershell, probeScript, launcher, projectRoot }) {
  if (await exists(probeScript)) {
    const probe = await exec(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probeScript, '-ProjectPath', projectRoot], { cwd: projectRoot, timeoutMs: 120_000 })
    let parsed = null
    try {
      parsed = JSON.parse(String(probe.stdout ?? ''))
    } catch {
      parsed = null
    }
    if (parsed && parsed.contract === READINESS_PROBE_CONTRACT) {
      return { method: 'check_local_ai.ps1', ready: parsed.codingAgentReady === true }
    }
  }
  if (await exists(launcher)) {
    const check = await exec('cmd.exe', ['/d', '/s', '/c', launcher, '--check', projectRoot], { cwd: projectRoot, timeoutMs: 180_000 })
    return {
      method: 'local-code.cmd --check',
      ready: check.code === 0,
      ...(check.code === 0 ? {} : { detail: `check_exit_${check.code ?? check.spawnError ?? 'unknown'}` }),
    }
  }
  return { method: 'none', ready: false, detail: 'local_stack_not_installed' }
}

function toPosix(projectRoot, path) {
  return relative(projectRoot, path).split(sep).join('/')
}

export async function runLocalPrereview(options = {}) {
  const projectRoot = options.projectRoot ?? root
  const exec = options.exec ?? defaultExec
  const exists = options.exists ?? defaultExists
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory
  const launcher = options.launcher ?? defaultLauncher
  const probeScript = options.probeScript ?? defaultProbeScript
  const powershell = options.powershell ?? defaultPowershell
  const mkdirImpl = options.mkdir ?? mkdir
  const writeFileImpl = options.writeFile ?? writeFile
  const now = options.now ?? (() => new Date())
  const range = validateRange(options.range)

  if (options.probeOnly === true) {
    const probe = await probeLocalStack({ exec, exists, powershell, probeScript, launcher, projectRoot })
    return { ok: probe.ready === true, contract: LOCAL_PREREVIEW_CONTRACT, mode: 'check', advisory: true, blocking: false, probe, ...(probe.ready ? {} : { reason: UNAVAILABLE_REASON }), networkCallsByWrapper: 0, worktreeMutationsByWrapper: 0 }
  }

  const head = (await gitObserve(exec, projectRoot, ['rev-parse', 'HEAD'])).trim()
  const changedFiles = parseNameStatus(await gitObserve(exec, projectRoot, ['diff', '--name-status', range, '--']))
  if (changedFiles.length === 0) {
    return { ok: true, contract: LOCAL_PREREVIEW_CONTRACT, advisory: true, blocking: false, outcome: 'no_changes', range, head, changedFileCount: 0, report: null, networkCallsByWrapper: 0, worktreeMutationsByWrapper: 0 }
  }
  const diff = await gitObserve(exec, projectRoot, ['diff', '--unified=1', range, '--'])

  const probe = await probeLocalStack({ exec, exists, powershell, probeScript, launcher, projectRoot })
  if (probe.ready !== true) {
    throw new PrereviewError(UNAVAILABLE_REASON, [probe.method, probe.detail].filter(Boolean).join(':').slice(0, 160))
  }

  const { document, diffTruncated, listedFileCount } = buildTaskDocument({ range, changedFiles, diff })
  const stamp = `${now().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  await mkdirImpl(outputDirectory, { recursive: true })
  const taskPath = resolve(outputDirectory, `task-${stamp}.md`)
  await writeFileImpl(taskPath, document, { encoding: 'utf8', flag: 'wx' })

  const runnerArgs = ['/d', '/s', '/c', launcher, '--run', projectRoot, taskPath, '--timeout-seconds', String(RUNNER_TIMEOUT_SECONDS), '--test', ...RUNNER_TEST_COMMAND]
  const runner = await exec('cmd.exe', runnerArgs, { cwd: projectRoot, timeoutMs: RUNNER_WRAPPER_TIMEOUT_MS })
  if (runner.timedOut) throw new PrereviewError('local_prereview_runner_timeout')
  if (runner.code !== 0 && runner.code !== 1) {
    const { parsed: blocked } = parseLastJsonLine(runner.stderr)
    const detail = blocked && blocked.schema === RUNNER_RECEIPT_SCHEMA && typeof blocked.reason === 'string'
      ? blocked.reason.slice(0, 160)
      : runner.spawnError ? `spawn_${runner.spawnError}` : `runner_exit_${runner.code}`
    throw new PrereviewError(UNAVAILABLE_REASON, detail)
  }
  const { receipt, receiptDigest, outcome } = evaluateReceipt(runner.stdout)

  const generatedAt = now().toISOString()
  const report = {
    contract: LOCAL_PREREVIEW_CONTRACT,
    advisory: true,
    blocking: false,
    generatedAt,
    range,
    head,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.slice(0, MAX_REPORT_CHANGED_FILES),
    diffBytes: Buffer.byteLength(diff, 'utf8'),
    diffTruncatedInTask: diffTruncated,
    taskFile: toPosix(projectRoot, taskPath),
    listedFileCount,
    probe: { method: probe.method, ready: true },
    runner: { launcher, exitCode: runner.code, timeoutSeconds: RUNNER_TIMEOUT_SECONDS, testCommand: [...RUNNER_TEST_COMMAND] },
    receiptDigest,
    receipt,
    review: { outcome, text: typeof receipt.agentOutput === 'string' ? receipt.agentOutput : '' },
    wrapper: { networkCalls: 0, worktreeMutations: 0, writesConfinedTo: toPosix(projectRoot, outputDirectory) },
  }
  const reportPath = resolve(outputDirectory, `prereview-${stamp}.json`)
  await writeFileImpl(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

  return {
    ok: true,
    contract: LOCAL_PREREVIEW_CONTRACT,
    advisory: true,
    blocking: false,
    outcome,
    range,
    head,
    changedFileCount: changedFiles.length,
    report: toPosix(projectRoot, reportPath),
    receiptDigest,
    networkCallsByWrapper: 0,
    worktreeMutationsByWrapper: 0,
  }
}

export function parseCliArguments(argv) {
  let range
  let probeOnly = false
  for (const value of argv.slice(2)) {
    if (value === '--check') {
      probeOnly = true
      continue
    }
    if (value.startsWith('-') || range !== undefined) throw new PrereviewError('local_prereview_arguments_invalid')
    range = value
  }
  return { range, probeOnly }
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (executedDirectly) {
  try {
    const result = await runLocalPrereview(parseCliArguments(process.argv))
    console.log(JSON.stringify(result))
    if (result.ok !== true) process.exitCode = 2
  } catch (error) {
    const known = error instanceof PrereviewError
    const detail = known ? error.detail : String(error?.message ?? 'unknown').slice(0, 200)
    console.error(JSON.stringify({
      ok: false,
      contract: LOCAL_PREREVIEW_CONTRACT,
      advisory: true,
      blocking: false,
      reason: known ? error.reason : 'local_prereview_failed',
      ...(detail ? { detail } : {}),
      networkCallsByWrapper: 0,
      worktreeMutationsByWrapper: 0,
    }))
    process.exitCode = 2
  }
}
