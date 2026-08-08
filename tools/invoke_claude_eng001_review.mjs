#!/usr/bin/env node

// Bounded Claude coordination lane for ENG-001.
//
// The default mode is a zero-provider-call preflight. Execution is explicit,
// foreground-only, read-only, cost-capped, and allowed only after the current
// integration checkout and all three candidate worktrees are clean and pinned
// to the assignment packet. The wrapper never inspects, continues, or stops an
// existing Claude session.

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CONTRACT = 'supermega.claude-eng001-review.v1'
export const ASSIGNMENT = 'ENG-001'
export const INTEGRATOR_BRANCH = 'codex/fix-ecommerce-intake-count-20260808'
export const INTEGRATOR_BASE = '4bc55a6ab01de13c436a422ecba8a54bbae1d6f6'
export const MAX_BUDGET_USD = '0.20'
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024
export const REVIEW_TIMEOUT_MS = 15 * 60 * 1000

const root = resolve(import.meta.dirname, '..')
const DEFAULT_CLAUDE = 'claude.cmd'
const CANDIDATES = Object.freeze([
  Object.freeze({
    pr: 411,
    path: 'C:\\Users\\thesw\\Projects\\supermega-showroom-fixes',
    commit: 'decb001d2e4c47c1434ea3fb1898c599228c2bf4',
  }),
  Object.freeze({
    pr: 412,
    path: 'C:\\Users\\thesw\\Projects\\supermega-slice1',
    commit: 'bc0970656e25c132fcf4923a91ac45e8e2c34102',
  }),
  Object.freeze({
    pr: 413,
    path: 'C:\\Users\\thesw\\Projects\\supermega-rebaseline',
    commit: '3aab5edc398e4a3e2d7ec0aca4346438872c7d87',
  }),
])

export class Eng001Error extends Error {
  constructor(reason, detail) {
    super(detail ? `${reason}:${detail}` : reason)
    this.name = 'Eng001Error'
    this.reason = reason
    this.detail = detail
  }
}

function bounded(value, maximum = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function defaultExec(file, args, { cwd = root, timeoutMs = 30_000, input = '', env = process.env } = {}) {
  return new Promise((resolveResult) => {
    const isCommandShim = process.platform === 'win32' && /\.cmd$/i.test(file)
    const executable = isCommandShim ? (process.env.ComSpec || 'cmd.exe') : file
    const executableArgs = isCommandShim ? ['/d', '/s', '/c', file, ...args] : args
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let captureExceeded = false
    const child = spawn(executable, executableArgs, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveResult(result)
    }
    const capture = (kind, chunk) => {
      const text = chunk.toString('utf8')
      if (kind === 'stdout') stdout += text
      else stderr += text
      if (Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8') > MAX_CAPTURE_BYTES) {
        captureExceeded = true
        child.kill()
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => capture('stdout', chunk))
    child.stderr.on('data', (chunk) => capture('stderr', chunk))
    child.stdin.on('error', () => {})
    child.on('error', (error) => finish({
      code: null,
      stdout,
      stderr,
      spawnError: bounded(error?.code || error?.message || 'spawn_failed', 80),
    }))
    child.on('close', (code, signal) => finish({ code, signal, stdout, stderr, timedOut, captureExceeded }))
    child.stdin.end(input)
  })
}

async function observe(exec, file, args, options) {
  const result = await exec(file, args, options)
  if (result.code !== 0) {
    throw new Eng001Error('eng001_observation_failed', `${bounded(file, 40)}_${bounded(args[0], 40)}_${result.code ?? result.spawnError ?? 'unknown'}`)
  }
  return String(result.stdout ?? '')
}

async function inspectCheckout(exec, candidate, { integrator = false } = {}) {
  const cwd = candidate.path
  const env = { ...process.env, GIT_NO_LAZY_FETCH: '1' }
  const status = await observe(exec, 'git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd, env })
  if (status.trim()) throw new Eng001Error('eng001_worktree_dirty', candidate.pr ? `pr_${candidate.pr}` : 'integrator')

  const head = (await observe(exec, 'git', ['rev-parse', 'HEAD'], { cwd, env })).trim().toLowerCase()
  if (integrator) {
    const branch = (await observe(exec, 'git', ['branch', '--show-current'], { cwd, env })).trim()
    if (branch !== INTEGRATOR_BRANCH) throw new Eng001Error('eng001_integrator_branch_mismatch', bounded(branch, 100))
    await observe(exec, 'git', ['rev-parse', '--verify', `${INTEGRATOR_BASE}^{commit}`], { cwd, env })
    await observe(exec, 'git', ['merge-base', '--is-ancestor', INTEGRATOR_BASE, 'HEAD'], { cwd, env })
    return { path: cwd, branch, head, base: INTEGRATOR_BASE, clean: true }
  }

  if (head !== candidate.commit) throw new Eng001Error('eng001_candidate_commit_mismatch', `pr_${candidate.pr}`)
  const changedOutput = await observe(exec, 'git', ['diff', '--name-only', 'origin/main...HEAD', '--'], { cwd, env })
  const changedFiles = changedOutput.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
  if (changedFiles.length > 500) throw new Eng001Error('eng001_candidate_scope_too_large', `pr_${candidate.pr}`)
  return { pr: candidate.pr, path: cwd, head, clean: true, changedFiles }
}

function overlapSummary(candidates) {
  const summary = []
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const rightFiles = new Set(candidates[right].changedFiles)
      const files = candidates[left].changedFiles.filter((file) => rightFiles.has(file)).sort()
      summary.push({ left: candidates[left].pr, right: candidates[right].pr, files })
    }
  }
  return summary
}

export function parseAuthStatus(stdout) {
  let parsed
  try {
    parsed = JSON.parse(String(stdout ?? ''))
  } catch {
    throw new Eng001Error('eng001_claude_auth_status_invalid')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.loggedIn !== 'boolean') {
    throw new Eng001Error('eng001_claude_auth_status_invalid')
  }
  return {
    loggedIn: parsed.loggedIn,
    authMethod: bounded(parsed.authMethod || 'none', 40),
    apiProvider: bounded(parsed.apiProvider || 'unknown', 40),
  }
}

export function buildClaudeArgs(candidates = CANDIDATES) {
  return [
    '-p',
    '--safe-mode',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--no-chrome',
    '--permission-mode', 'dontAsk',
    '--tools', 'Read,Grep,Glob',
    '--allowedTools', 'Read,Grep,Glob',
    '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task',
    '--output-format', 'json',
    '--prompt-suggestions', 'false',
    '--effort', 'low',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--add-dir', ...candidates.map((candidate) => candidate.path),
  ]
}

export function buildPrompt({ integrator, candidates, overlaps }) {
  const fileSections = candidates.map((candidate) => [
    `PR #${candidate.pr}: ${candidate.path}`,
    `Pinned commit: ${candidate.head}`,
    `Changed files (${candidate.changedFiles.length}):`,
    ...(candidate.changedFiles.length ? candidate.changedFiles.map((file) => `- ${file}`) : ['- none']),
  ].join('\n')).join('\n\n')
  const overlapLines = overlaps.flatMap((entry) => [
    `PR #${entry.left} / PR #${entry.right} overlap (${entry.files.length}):`,
    ...(entry.files.length ? entry.files.map((file) => `- ${file}`) : ['- none']),
  ]).join('\n')
  return [
    '# ENG-001 bounded SuperMega review',
    '',
    'You are a foreground, read-only reviewer. Use only Read, Grep, and Glob.',
    'Never use a shell, edit or create files, start an agent, access the web or secrets, send messages, or perform any external action.',
    'Do not continue or interact with another Claude session. Return one response and exit.',
    '',
    'Objective: identify the safe merge order, contradictions, release blockers, and exact next managed-account gate across PRs #411-#413.',
    `Integrator checkout: ${integrator.path}`,
    `Integrator branch: ${integrator.branch}`,
    `Integrator head: ${integrator.head}`,
    `Required ancestor: ${integrator.base}`,
    '',
    'Canonical authority in the integrator checkout:',
    '- hq/NOW.md',
    '- hq/WORKBOARD.md',
    '- hq/readiness/managed-pilot-readiness.json',
    '',
    fileSections,
    '',
    'Locally observed changed-file overlap:',
    overlapLines,
    '',
    'Evidence boundary:',
    '- Live public and app domains remain on commit 4ce500c29b1cca9617eeba83528293bc1af6c83e in isolated_demo mode.',
    '- The existing Supabase preview remains MIGRATIONS_FAILED and must stay disconnected from Vercel and Auth invitations.',
    '- A real account remains blocked until tenant isolation, session revocation, private Storage, backup/restore, role boundaries, and exact release binding pass.',
    '',
    'Return: (1) verified facts, (2) hidden coupling or contradictions, (3) merge order and rationale, (4) security/rollback/billing/evidence blockers, and (5) the smallest safe next action for one named Shop preview operator.',
    'Do not call local tests, documentation, or an isolated preview production-ready. If evidence is unreadable or contradictory, report the exact blocker.',
  ].join('\n')
}

async function inspectAll(exec, projectRoot, candidates) {
  const integrator = await inspectCheckout(exec, { path: projectRoot }, { integrator: true })
  const inspectedCandidates = []
  for (const candidate of candidates) inspectedCandidates.push(await inspectCheckout(exec, candidate))
  return { integrator, candidates: inspectedCandidates, overlaps: overlapSummary(inspectedCandidates) }
}

function publicInspection(inspection) {
  return {
    integrator: inspection.integrator,
    candidates: inspection.candidates.map(({ changedFiles, ...candidate }) => ({ ...candidate, changedFileCount: changedFiles.length })),
    overlaps: inspection.overlaps.map(({ files, ...entry }) => ({ ...entry, fileCount: files.length })),
  }
}

export async function runEng001(options = {}) {
  const exec = options.exec ?? defaultExec
  const projectRoot = options.projectRoot ?? root
  const candidates = options.candidates ?? CANDIDATES
  const claude = options.claude ?? DEFAULT_CLAUDE
  const execute = options.execute === true
  let inspection
  try {
    inspection = await inspectAll(exec, projectRoot, candidates)
  } catch (error) {
    const reason = error instanceof Eng001Error ? error.reason : 'eng001_preflight_failed'
    return {
      ok: false,
      contract: CONTRACT,
      assignment: ASSIGNMENT,
      mode: execute ? 'execute' : 'preflight',
      readyToDispatch: false,
      reason,
      ...(error instanceof Eng001Error && error.detail ? { detail: error.detail } : {}),
      controls: { providerRequestStarted: false, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }

  const authResult = await exec(claude, ['auth', 'status'], { cwd: projectRoot, timeoutMs: 30_000 })
  let auth
  try {
    auth = parseAuthStatus(authResult.stdout)
  } catch (error) {
    return {
      ok: false,
      contract: CONTRACT,
      assignment: ASSIGNMENT,
      mode: execute ? 'execute' : 'preflight',
      readyToDispatch: false,
      reason: error instanceof Eng001Error ? error.reason : 'eng001_claude_auth_status_invalid',
      inspection: publicInspection(inspection),
      controls: { providerRequestStarted: false, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }

  const preflight = {
    ok: auth.loggedIn,
    contract: CONTRACT,
    assignment: ASSIGNMENT,
    mode: execute ? 'execute' : 'preflight',
    readyToDispatch: auth.loggedIn,
    auth,
    inspection: publicInspection(inspection),
  }
  if (!auth.loggedIn) {
    return {
      ...preflight,
      reason: 'eng001_claude_auth_unavailable',
      controls: { providerRequestStarted: false, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }
  if (!execute) {
    return {
      ...preflight,
      controls: { providerRequestStarted: false, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }

  const prompt = buildPrompt(inspection)
  const review = await exec(claude, buildClaudeArgs(candidates), { cwd: projectRoot, timeoutMs: REVIEW_TIMEOUT_MS, input: prompt })
  let after
  try {
    after = await inspectAll(exec, projectRoot, candidates)
  } catch {
    return {
      ...preflight,
      ok: false,
      readyToDispatch: false,
      reason: 'eng001_post_review_identity_failed',
      controls: { providerRequestStarted: true, existingClaudeSessionsInspected: false, processTerminationCalls: review.timedOut || review.captureExceeded ? 1 : 0, repositoryWrites: 'mutation_detected', externalWrites: 0 },
    }
  }
  if (review.timedOut || review.captureExceeded || review.code !== 0) {
    return {
      ...preflight,
      ok: false,
      readyToDispatch: false,
      reason: review.timedOut ? 'eng001_review_timeout' : review.captureExceeded ? 'eng001_review_output_limit' : 'eng001_review_failed',
      detail: review.timedOut || review.captureExceeded ? undefined : bounded(review.stderr || `exit_${review.code}`),
      postReviewInspection: publicInspection(after),
      controls: { providerRequestStarted: true, existingClaudeSessionsInspected: false, processTerminationCalls: review.timedOut || review.captureExceeded ? 1 : 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }
  let result
  try {
    result = JSON.parse(String(review.stdout ?? ''))
  } catch {
    return {
      ...preflight,
      ok: false,
      readyToDispatch: false,
      reason: 'eng001_review_output_invalid',
      postReviewInspection: publicInspection(after),
      controls: { providerRequestStarted: true, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }
  if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.result !== 'string' || !result.result.trim()) {
    return {
      ...preflight,
      ok: false,
      readyToDispatch: false,
      reason: 'eng001_review_output_invalid',
      postReviewInspection: publicInspection(after),
      controls: { providerRequestStarted: true, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
    }
  }
  return {
    ...preflight,
    completed: true,
    report: result.result.trim().slice(0, 80_000),
    costUsd: Number.isFinite(Number(result.total_cost_usd)) ? Number(result.total_cost_usd) : null,
    postReviewInspection: publicInspection(after),
    controls: { providerRequestStarted: true, existingClaudeSessionsInspected: false, processTerminationCalls: 0, repositoryWrites: 0, externalWrites: 0 },
  }
}

async function main() {
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--execute')
  if (unknown.length) throw new Eng001Error('eng001_argument_invalid', bounded(unknown[0], 80))
  const result = await runEng001({ execute: process.argv.includes('--execute') })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    const reason = error instanceof Eng001Error ? error.reason : 'eng001_unhandled_error'
    process.stderr.write(`${JSON.stringify({ ok: false, contract: CONTRACT, assignment: ASSIGNMENT, reason })}\n`)
    process.exitCode = 1
  })
}
