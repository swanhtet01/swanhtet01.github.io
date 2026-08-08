import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTRACT,
  INTEGRATOR_BASE,
  INTEGRATOR_BRANCH,
  MAX_BUDGET_USD,
  buildClaudeArgs,
  buildPrompt,
  parseAuthStatus,
  runEng001,
} from './invoke_claude_eng001_review.mjs'

const projectRoot = 'C:\\repo'
const candidates = [
  { pr: 411, path: 'C:\\pr411', commit: 'a'.repeat(40) },
  { pr: 412, path: 'C:\\pr412', commit: 'b'.repeat(40) },
  { pr: 413, path: 'C:\\pr413', commit: 'c'.repeat(40) },
]

function makeExec({ loggedIn = false, dirtyPath = null, changedAfterReview = false } = {}) {
  const calls = []
  let reviewStarted = false
  const exec = async (file, args, options = {}) => {
    calls.push({ file, args: [...args], cwd: options.cwd, input: options.input })
    if (file === 'git') {
      if (args[0] === 'status') {
        if (options.cwd === dirtyPath || (changedAfterReview && reviewStarted && options.cwd === projectRoot)) {
          return { code: 0, stdout: ' M changed.txt\n', stderr: '' }
        }
        return { code: 0, stdout: '', stderr: '' }
      }
      if (args[0] === 'branch') return { code: 0, stdout: `${INTEGRATOR_BRANCH}\n`, stderr: '' }
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        const candidate = candidates.find((entry) => entry.path === options.cwd)
        return { code: 0, stdout: `${candidate?.commit || 'd'.repeat(40)}\n`, stderr: '' }
      }
      if (args[0] === 'diff') {
        const candidate = candidates.find((entry) => entry.path === options.cwd)
        return { code: 0, stdout: `shared.txt\npr-${candidate?.pr}.txt\n`, stderr: '' }
      }
      return { code: 0, stdout: `${INTEGRATOR_BASE}\n`, stderr: '' }
    }
    if (args[0] === 'auth') {
      return { code: loggedIn ? 0 : 1, stdout: JSON.stringify({ loggedIn, authMethod: loggedIn ? 'oauth' : 'none', apiProvider: 'firstParty' }), stderr: '' }
    }
    reviewStarted = true
    return { code: 0, stdout: JSON.stringify({ result: 'Verified report', total_cost_usd: 0.03 }), stderr: '' }
  }
  return { exec, calls }
}

test('auth status exposes only bounded routing metadata', () => {
  assert.deepEqual(parseAuthStatus('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty","token":"secret"}'), {
    loggedIn: false,
    authMethod: 'none',
    apiProvider: 'firstParty',
  })
  assert.throws(() => parseAuthStatus('not json'), /eng001_claude_auth_status_invalid/)
})

test('Claude arguments enforce one cheap foreground read-only response', () => {
  const args = buildClaudeArgs(candidates)
  assert.ok(args.includes('-p'))
  assert.ok(args.includes('--safe-mode'))
  assert.ok(args.includes('--no-session-persistence'))
  assert.ok(args.includes('--no-chrome'))
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk')
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Grep,Glob')
  assert.match(args[args.indexOf('--disallowedTools') + 1], /Bash/)
  assert.match(args[args.indexOf('--disallowedTools') + 1], /Task/)
  assert.equal(args[args.indexOf('--max-budget-usd') + 1], MAX_BUDGET_USD)
  assert.equal(args.includes('--background'), false)
  assert.equal(args.includes('--continue'), false)
  assert.equal(args.includes('--resume'), false)
  assert.equal(args.includes('--worktree'), false)
})

test('prompt carries pinned evidence and forbids session interaction', () => {
  const prompt = buildPrompt({
    integrator: { path: projectRoot, branch: INTEGRATOR_BRANCH, head: 'd'.repeat(40), base: INTEGRATOR_BASE },
    candidates: candidates.map((candidate) => ({ ...candidate, head: candidate.commit, changedFiles: ['shared.txt'] })),
    overlaps: [{ left: 411, right: 412, files: ['shared.txt'] }],
  })
  assert.match(prompt, /Read, Grep, and Glob/)
  assert.match(prompt, /Do not continue or interact with another Claude session/)
  assert.match(prompt, /MIGRATIONS_FAILED/)
  assert.match(prompt, /PR #411/)
})

test('unauthenticated preflight performs zero provider requests', async () => {
  const state = makeExec({ loggedIn: false })
  const result = await runEng001({ exec: state.exec, projectRoot, candidates, claude: 'claude.cmd' })
  assert.equal(result.contract, CONTRACT)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'eng001_claude_auth_unavailable')
  assert.equal(result.controls.providerRequestStarted, false)
  assert.equal(result.controls.processTerminationCalls, 0)
  assert.equal(state.calls.filter((call) => call.file === 'claude.cmd').length, 1)
})

test('dirty candidate fails closed before checking Claude auth', async () => {
  const state = makeExec({ loggedIn: true, dirtyPath: candidates[1].path })
  const result = await runEng001({ exec: state.exec, projectRoot, candidates, claude: 'claude.cmd', execute: true })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'eng001_worktree_dirty')
  assert.equal(result.detail, 'pr_412')
  assert.equal(state.calls.some((call) => call.file === 'claude.cmd'), false)
})

test('authenticated preflight remains zero-provider-call', async () => {
  const state = makeExec({ loggedIn: true })
  const result = await runEng001({ exec: state.exec, projectRoot, candidates, claude: 'claude.cmd' })
  assert.equal(result.ok, true)
  assert.equal(result.readyToDispatch, true)
  assert.equal(result.controls.providerRequestStarted, false)
  assert.equal(state.calls.filter((call) => call.file === 'claude.cmd').length, 1)
})

test('explicit execution runs once and verifies all checkouts again', async () => {
  const state = makeExec({ loggedIn: true })
  const result = await runEng001({ exec: state.exec, projectRoot, candidates, claude: 'claude.cmd', execute: true })
  assert.equal(result.ok, true)
  assert.equal(result.completed, true)
  assert.equal(result.report, 'Verified report')
  assert.equal(result.costUsd, 0.03)
  assert.equal(result.controls.providerRequestStarted, true)
  assert.equal(result.controls.existingClaudeSessionsInspected, false)
  assert.equal(state.calls.filter((call) => call.file === 'claude.cmd').length, 2)
  const reviewCall = state.calls.find((call) => call.file === 'claude.cmd' && call.args[0] !== 'auth')
  assert.match(reviewCall.input, /ENG-001/)
})

test('post-review mutation fails closed without attempting cleanup', async () => {
  const state = makeExec({ loggedIn: true, changedAfterReview: true })
  const result = await runEng001({ exec: state.exec, projectRoot, candidates, claude: 'claude.cmd', execute: true })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'eng001_post_review_identity_failed')
  assert.equal(result.controls.repositoryWrites, 'mutation_detected')
  assert.equal(result.controls.processTerminationCalls, 0)
})

