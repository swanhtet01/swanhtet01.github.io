import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_RANGE,
  LOCAL_PREREVIEW_CONTRACT,
  MAX_TASK_DOCUMENT_BYTES,
  PrereviewError,
  RUNNER_RECEIPT_SCHEMA,
  UNAVAILABLE_REASON,
  buildTaskDocument,
  evaluateReceipt,
  parseCliArguments,
  parseNameStatus,
  runLocalPrereview,
  validateRange,
} from './run_local_prereview.mjs'

const PROJECT_ROOT = 'C:\\stub\\lane-worktree'
const PROBE_SCRIPT = 'C:\\stub\\check_local_ai.ps1'
const LAUNCHER = 'C:\\stub\\local-code.cmd'
const POWERSHELL = 'C:\\stub\\powershell.exe'

function receiptLine(overrides = {}) {
  return JSON.stringify({
    schema: RUNNER_RECEIPT_SCHEMA,
    externalActionPerformed: false,
    paidApiUsed: false,
    autoPermissionsEnabled: false,
    ok: false,
    status: 'rejected',
    reason: 'no_file_change',
    model: 'llama3.2:1b',
    agentExitCode: 0,
    changedFiles: [],
    protectedFilesCurrent: true,
    testCommand: ['git', 'status', '--porcelain=v1'],
    testExitCode: 0,
    testsPassed: true,
    modelUnloadedAfterRun: true,
    wallSeconds: 41.5,
    agentOutput: '1. SUMMARY: adds the advisory pre-review wrapper.\n2. SUSPICIOUS DELETIONS: none\n3. POSSIBLE SECRETS: none\n4. SCOPE CREEP: none',
    agentError: '',
    testOutput: '',
    ...overrides,
  }, null, 0)
}

function readyProbeStdout() {
  return JSON.stringify({
    contract: 'supermega.local-ai-readiness.v1',
    ok: true,
    codingAgentReady: true,
    supportedModels: ['llama3.2:1b'],
    externalRequestsPerformed: 0,
  }, null, 2)
}

// Every subprocess is stubbed: the self-test must pass on GitHub runners with
// no git remote state, no PowerShell, no Ollama, and no OpenCode installed.
function stubExec({ nameStatus, diff, probeStdout, runnerReply }) {
  const calls = []
  const exec = async (file, args, opts = {}) => {
    calls.push({ file, args, opts })
    if (file === 'git' && args[0] === 'rev-parse') return { code: 0, stdout: 'abc123def456\n', stderr: '' }
    if (file === 'git' && args.includes('--name-status')) return { code: 0, stdout: nameStatus, stderr: '' }
    if (file === 'git' && args.includes('--unified=1')) return { code: 0, stdout: diff, stderr: '' }
    if (file === POWERSHELL) return { code: 0, stdout: probeStdout ?? readyProbeStdout(), stderr: '' }
    if (file === 'cmd.exe' && args.includes('--run')) return runnerReply ?? { code: 1, stdout: `${receiptLine()}\n`, stderr: '' }
    throw new Error(`unexpected exec: ${file} ${args.join(' ')}`)
  }
  return { calls, exec }
}

async function makeOutputDirectory() {
  return mkdtemp(join(tmpdir(), 'local-prereview-test-'))
}

function baseOptions(stub, outputDirectory, overrides = {}) {
  return {
    projectRoot: PROJECT_ROOT,
    outputDirectory,
    launcher: LAUNCHER,
    probeScript: PROBE_SCRIPT,
    powershell: POWERSHELL,
    exec: stub.exec,
    exists: async (path) => path === PROBE_SCRIPT || path === LAUNCHER,
    ...overrides,
  }
}

test('range validation accepts lane ranges and rejects option injection', () => {
  assert.equal(validateRange(undefined), DEFAULT_RANGE)
  assert.equal(validateRange('origin/main...HEAD'), 'origin/main...HEAD')
  assert.equal(validateRange('abc123..HEAD~2'), 'abc123..HEAD~2')
  assert.equal(validateRange('feat/base-branch'), 'feat/base-branch')
  for (const bad of ['--exec=evil', '-rf', 'a b', 'a;b', '$(cmd)', '', '   ', 'a'.repeat(201)]) {
    assert.throws(() => validateRange(bad), (error) => error instanceof PrereviewError && error.reason === 'local_prereview_range_invalid')
  }
})

test('CLI argument parsing is strict', () => {
  assert.deepEqual(parseCliArguments(['node', 'tool']), { range: undefined, probeOnly: false })
  assert.deepEqual(parseCliArguments(['node', 'tool', '--check']), { range: undefined, probeOnly: true })
  assert.deepEqual(parseCliArguments(['node', 'tool', 'origin/main...HEAD']), { range: 'origin/main...HEAD', probeOnly: false })
  assert.throws(() => parseCliArguments(['node', 'tool', '--evil']), (error) => error.reason === 'local_prereview_arguments_invalid')
  assert.throws(() => parseCliArguments(['node', 'tool', 'a', 'b']), (error) => error.reason === 'local_prereview_arguments_invalid')
})

test('name-status parsing keeps rename targets and rejects malformed lines', () => {
  assert.deepEqual(parseNameStatus('M\ttools/foo.mjs\nA\tdocs/bar.md\nR100\told.mjs\tnew.mjs\n'), [
    { status: 'M', path: 'tools/foo.mjs' },
    { status: 'A', path: 'docs/bar.md' },
    { status: 'R100', path: 'new.mjs' },
  ])
  assert.deepEqual(parseNameStatus(''), [])
  assert.throws(() => parseNameStatus('garbage-without-tab'), (error) => error.reason === 'local_prereview_git_output_invalid')
})

test('task document stays inside the runner task budget and keeps the advisory contract', () => {
  const bigDiff = `diff --git a/x b/x\n${'+'.repeat(80)}\n`.repeat(3_000)
  const { document, diffTruncated } = buildTaskDocument({
    range: DEFAULT_RANGE,
    changedFiles: Array.from({ length: 120 }, (_, index) => ({ status: 'M', path: `tools/file-${index}.mjs` })),
    diff: bigDiff,
  })
  assert.ok(Buffer.byteLength(document, 'utf8') <= MAX_TASK_DOCUMENT_BYTES)
  assert.equal(diffTruncated, true)
  assert.ok(document.includes('advisory only'))
  assert.ok(document.includes('Do not modify'))
  assert.ok(document.includes('Do not access the network'))
  assert.ok(document.includes('[diff truncated'))
  assert.ok(document.includes('Changed files (120, listing first 50)'))
  assert.ok(!document.includes('\u0000'))

  const small = buildTaskDocument({ range: DEFAULT_RANGE, changedFiles: [{ status: 'M', path: 'a.mjs' }], diff: '+ok\n' })
  assert.equal(small.diffTruncated, false)
})

test('receipt evaluation verifies the free-local contract and digests the exact line', () => {
  const line = receiptLine()
  const clean = evaluateReceipt(`starting...\n${line}\n`)
  assert.equal(clean.outcome, 'clean_advisory')
  assert.equal(clean.receiptDigest, `sha256:${createHash('sha256').update(line, 'utf8').digest('hex')}`)
  assert.equal(clean.receipt.paidApiUsed, false)

  const mutated = evaluateReceipt(receiptLine({ ok: true, status: 'accepted', reason: 'accepted', changedFiles: ['tools/foo.mjs'] }))
  assert.equal(mutated.outcome, 'mutation_detected')

  const failed = evaluateReceipt(receiptLine({ reason: 'agent_failed', agentExitCode: 1 }))
  assert.equal(failed.outcome, 'agent_failed')

  for (const bad of [
    '',
    'not json',
    receiptLine({ schema: 'other.schema.v1' }),
    receiptLine({ paidApiUsed: true }),
    receiptLine({ externalActionPerformed: true }),
    receiptLine({ autoPermissionsEnabled: true }),
  ]) {
    assert.throws(() => evaluateReceipt(bad), (error) => error instanceof PrereviewError && error.reason === 'local_prereview_receipt_invalid')
  }
})

test('happy path: stubbed runner produces a digested advisory report and mutates only the output directory', async () => {
  const outputDirectory = await makeOutputDirectory()
  const stub = stubExec({
    nameStatus: 'M\ttools/foo.mjs\nA\tdocs/bar.md\n',
    diff: 'diff --git a/tools/foo.mjs b/tools/foo.mjs\n+const ok = true\n',
  })
  const writes = []
  const result = await runLocalPrereview(baseOptions(stub, outputDirectory, {
    writeFile: async (path, data, opts) => {
      writes.push(String(path))
      return writeFile(path, data, opts)
    },
  }))

  assert.equal(result.ok, true)
  assert.equal(result.contract, LOCAL_PREREVIEW_CONTRACT)
  assert.equal(result.advisory, true)
  assert.equal(result.blocking, false)
  assert.equal(result.outcome, 'clean_advisory')
  assert.equal(result.changedFileCount, 2)
  assert.equal(result.networkCallsByWrapper, 0)
  assert.equal(result.worktreeMutationsByWrapper, 0)
  assert.match(result.receiptDigest, /^sha256:[0-9a-f]{64}$/)

  // The wrapper only ever writes inside the git-ignored output directory.
  assert.equal(writes.length, 2)
  for (const path of writes) assert.ok(path.startsWith(outputDirectory), `write escaped output dir: ${path}`)

  // The runner was invoked through the documented launcher in bounded headless mode.
  const runnerCall = stub.calls.find((call) => call.file === 'cmd.exe' && call.args.includes('--run'))
  assert.ok(runnerCall, 'runner not invoked')
  assert.equal(runnerCall.args[3], LAUNCHER)
  assert.ok(runnerCall.args.includes(PROJECT_ROOT))
  assert.deepEqual(runnerCall.args.slice(-4), ['--test', 'git', 'status', '--porcelain=v1'])
  const taskPath = runnerCall.args[runnerCall.args.indexOf('--run') + 2]
  assert.ok(taskPath.startsWith(outputDirectory))
  const taskDocument = await readFile(taskPath, 'utf8')
  assert.ok(Buffer.byteLength(taskDocument, 'utf8') <= MAX_TASK_DOCUMENT_BYTES)
  assert.ok(taskDocument.includes('advisory only'))

  // The written report embeds the receipt and its digest.
  const reportName = (await readdir(outputDirectory)).find((name) => name.startsWith('prereview-') && name.endsWith('.json'))
  assert.ok(reportName, 'report not written')
  const report = JSON.parse(await readFile(join(outputDirectory, reportName), 'utf8'))
  assert.equal(report.contract, LOCAL_PREREVIEW_CONTRACT)
  assert.equal(report.advisory, true)
  assert.equal(report.blocking, false)
  assert.equal(report.receiptDigest, result.receiptDigest)
  assert.equal(report.receipt.schema, RUNNER_RECEIPT_SCHEMA)
  assert.equal(report.receipt.paidApiUsed, false)
  assert.equal(report.review.outcome, 'clean_advisory')
  assert.ok(report.review.text.includes('SUMMARY'))
  assert.equal(report.wrapper.networkCalls, 0)
  assert.equal(report.wrapper.worktreeMutations, 0)
  assert.deepEqual(report.changedFiles, [
    { status: 'M', path: 'tools/foo.mjs' },
    { status: 'A', path: 'docs/bar.md' },
  ])
})

test('fail-closed: absent local stack yields the single unavailable reason and never reaches the runner', async () => {
  const outputDirectory = await makeOutputDirectory()
  const stub = stubExec({ nameStatus: 'M\ttools/foo.mjs\n', diff: '+x\n' })
  await assert.rejects(
    runLocalPrereview(baseOptions(stub, outputDirectory, { exists: async () => false })),
    (error) => error instanceof PrereviewError && error.reason === UNAVAILABLE_REASON && error.detail === 'none:local_stack_not_installed',
  )
  assert.equal(stub.calls.filter((call) => call.file === 'cmd.exe').length, 0)
  assert.equal((await readdir(outputDirectory)).length, 0)
})

test('fail-closed: probe reporting not-ready blocks before any model run', async () => {
  const outputDirectory = await makeOutputDirectory()
  const stub = stubExec({
    nameStatus: 'M\ttools/foo.mjs\n',
    diff: '+x\n',
    probeStdout: JSON.stringify({ contract: 'supermega.local-ai-readiness.v1', ok: true, codingAgentReady: false }),
  })
  await assert.rejects(
    runLocalPrereview(baseOptions(stub, outputDirectory)),
    (error) => error.reason === UNAVAILABLE_REASON && error.detail === 'check_local_ai.ps1',
  )
  assert.equal(stub.calls.filter((call) => call.file === 'cmd.exe').length, 0)
})

test('fail-closed: blocked runner receipt surfaces its reason without an error spray', async () => {
  const outputDirectory = await makeOutputDirectory()
  const blocked = JSON.stringify({
    schema: RUNNER_RECEIPT_SCHEMA,
    externalActionPerformed: false,
    paidApiUsed: false,
    autoPermissionsEnabled: false,
    ok: false,
    status: 'blocked',
    reason: 'worktree_must_be_clean',
    wallSeconds: 0.2,
  })
  const stub = stubExec({
    nameStatus: 'M\ttools/foo.mjs\n',
    diff: '+x\n',
    runnerReply: { code: 2, stdout: '', stderr: `${blocked}\n` },
  })
  await assert.rejects(
    runLocalPrereview(baseOptions(stub, outputDirectory)),
    (error) => error.reason === UNAVAILABLE_REASON && error.detail === 'worktree_must_be_clean',
  )
})

test('advisory contract: an agent that mutated files is reported loudly but never blocks', async () => {
  const outputDirectory = await makeOutputDirectory()
  const stub = stubExec({
    nameStatus: 'M\ttools/foo.mjs\n',
    diff: '+x\n',
    runnerReply: {
      code: 0,
      stdout: `${receiptLine({ ok: true, status: 'accepted', reason: 'accepted', changedFiles: ['tools/foo.mjs'] })}\n`,
      stderr: '',
    },
  })
  const result = await runLocalPrereview(baseOptions(stub, outputDirectory))
  assert.equal(result.ok, true)
  assert.equal(result.blocking, false)
  assert.equal(result.outcome, 'mutation_detected')
})

test('empty range short-circuits before probing or running anything', async () => {
  const outputDirectory = await makeOutputDirectory()
  const stub = stubExec({ nameStatus: '', diff: '' })
  const result = await runLocalPrereview(baseOptions(stub, outputDirectory))
  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'no_changes')
  assert.equal(result.report, null)
  assert.deepEqual(stub.calls.map((call) => call.file), ['git', 'git'])
  assert.equal((await readdir(outputDirectory)).length, 0)
})

test('probe-only mode reports readiness without touching git or the runner', async () => {
  const stub = stubExec({ nameStatus: '', diff: '' })
  const ready = await runLocalPrereview(baseOptions(stub, await makeOutputDirectory(), { probeOnly: true }))
  assert.equal(ready.ok, true)
  assert.equal(ready.mode, 'check')
  assert.equal(ready.probe.ready, true)
  assert.deepEqual(stub.calls.map((call) => call.file), [POWERSHELL])

  const offlineStub = stubExec({ nameStatus: '', diff: '' })
  const offline = await runLocalPrereview(baseOptions(offlineStub, await makeOutputDirectory(), { probeOnly: true, exists: async () => false }))
  assert.equal(offline.ok, false)
  assert.equal(offline.reason, UNAVAILABLE_REASON)
  assert.equal(offlineStub.calls.length, 0)
})

test('wrapper source adds no network capability of its own', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'run_local_prereview.mjs'), 'utf8')
  assert.ok(!/node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:dns\b/.test(source), 'network-capable node module imported')
  assert.ok(!/\bfetch\s*\(|WebSocket|XMLHttpRequest|axios|undici/.test(source), 'network call primitive present')
  assert.ok(!/https?:\/\//.test(source), 'URL literal present in wrapper')
})
