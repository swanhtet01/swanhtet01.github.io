#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const RELEASE_INTEGRATION_PLAN_CONTRACT = 'supermega.release-integration-plan.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const MAX_OUTPUT_BYTES = 1_000_000
const MAX_CONFLICT_PATHS = 512
const SHA_PATTERN = /^[0-9a-f]{40}$/
const BRANCH_PATTERN = /^(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119}$/
const BATCH_ORDER = [
  'identity-data-onboarding',
  'app-shell',
  'ecommerce',
  'release-security-hq',
  'cross-cutting',
]

const BATCH_AUTHORITY = {
  'identity-data-onboarding': {
    owner: 'Identity + Data Engineering',
    acceptance: 'Preserve current managed identity, tenant isolation, recovery, database policy, and import authority before product behavior is reconciled.',
  },
  'app-shell': {
    owner: 'Product Platform + UX',
    acceptance: 'Retain one understandable mobile-first shell, canonical four-product navigation, and the current authenticated setup path.',
  },
  ecommerce: {
    owner: 'Ecommerce + Shop Engineering',
    acceptance: 'Port customer workflows onto the reconciled identity and shell foundation while Shop remains the only consequential commerce authority.',
  },
  'release-security-hq': {
    owner: 'Release + Security + CEO Control',
    acceptance: 'Reconcile verifiers and evidence last, run the complete gate, and prohibit any release claim that is not exact-commit bound.',
  },
  'cross-cutting': {
    owner: 'CEO / Codex Integrator',
    acceptance: 'Assign an explicit owner and acceptance test before resolving any unclassified conflict.',
  },
}

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactSha(value, reason) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(reason)
  return normalized
}

function exactCount(value, reason) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(reason)
  return value
}

function normalizedPath(value) {
  const candidate = String(value || '').replaceAll('\\', '/').trim()
  if (!candidate
    || candidate.length > 300
    || candidate.startsWith('/')
    || /^[A-Za-z]:\//.test(candidate)
    || candidate.split('/').some((part) => !part || part === '.' || part === '..')
    || /[\u0000-\u001f\u007f]/.test(candidate)) {
    fail('release_integration_conflict_path_invalid')
  }
  return candidate
}

export function parseMergeTreeNameOnly(output) {
  const lines = String(output || '').replace(/\r\n?/g, '\n').split('\n').filter(Boolean)
  const tree = exactSha(lines.shift(), 'release_integration_merge_tree_invalid')
  const paths = [...new Set(lines.map(normalizedPath))].sort()
  if (paths.length > MAX_CONFLICT_PATHS) fail('release_integration_conflict_limit_exceeded')
  return { tree, paths }
}

export function classifyIntegrationConflict(path) {
  const candidate = normalizedPath(path)
  if (candidate.includes('/ecommerce/') || candidate.toLowerCase().includes('ecommerce')) return 'ecommerce'
  if (candidate === 'showroom/src/core/CoreApp.tsx'
    || candidate === 'showroom/src/core/CoreShell.tsx'
    || candidate === 'showroom/src/core/ProductHomeReadiness.tsx'
    || candidate === 'showroom/src/core/core-app.css') return 'app-shell'
  if (candidate === 'showroom/src/core/ClientDataOnboarding.tsx'
    || candidate === 'showroom/src/core/SettingsPage.tsx'
    || candidate === 'showroom/src/core/managed-trial.ts'
    || candidate.startsWith('supermega_runtime/')
    || candidate.startsWith('tests/test_cloud_')
    || candidate.startsWith('tests/test_database_')) return 'identity-data-onboarding'
  if (candidate === 'package.json'
    || candidate === 'tools/create_public_vercel_output.mjs'
    || candidate.startsWith('kernel/managed-pilot-readiness')
    || candidate.startsWith('tools/verify_')
    || candidate.startsWith('hq/')
    || candidate.startsWith('docs/')) return 'release-security-hq'
  return 'cross-cutting'
}

function validateBatches(batches, conflicts) {
  const expected = [...conflicts].sort()
  const actual = batches.flatMap((batch) => batch.files).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)
    || new Set(actual).size !== actual.length
    || batches.some((batch, index) => BATCH_ORDER.indexOf(batch.id) < BATCH_ORDER.indexOf(batches[index - 1]?.id))) {
    fail('release_integration_batch_coverage_invalid')
  }
}

export function buildReleaseIntegrationPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('release_integration_input_invalid')
  const generatedAt = String(input.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt) fail('release_integration_time_invalid')
  if (input.repository !== REPOSITORY || input.origin !== ORIGIN) fail('release_integration_repository_invalid')

  const branch = String(input.candidate?.branch || '')
  if (!BRANCH_PATTERN.test(branch)) fail('release_integration_branch_invalid')
  if (input.candidate?.clean !== true) fail('release_integration_worktree_dirty')
  const candidateCommit = exactSha(input.candidate?.commit, 'release_integration_candidate_invalid')
  const mainCommit = exactSha(input.main?.commit, 'release_integration_main_invalid')
  const mergeBase = exactSha(input.relations?.mergeBase, 'release_integration_merge_base_invalid')
  const mainOnlyCommits = exactCount(input.relations?.mainOnlyCommits, 'release_integration_main_count_invalid')
  const candidateOnlyCommits = exactCount(input.relations?.candidateOnlyCommits, 'release_integration_candidate_count_invalid')
  if (candidateCommit === mainCommit || mergeBase === candidateCommit || mergeBase === mainCommit
    || mainOnlyCommits < 1 || candidateOnlyCommits < 1) fail('release_integration_not_diverged')

  const mergeTree = exactSha(input.mergeTree?.tree, 'release_integration_merge_tree_invalid')
  const conflicts = [...new Set((input.mergeTree?.conflicts || []).map(normalizedPath))].sort()
  if (conflicts.length > MAX_CONFLICT_PATHS) fail('release_integration_conflict_limit_exceeded')
  if ((input.mergeTree?.status === 'conflicts') !== (conflicts.length > 0)) fail('release_integration_merge_status_invalid')

  const batches = BATCH_ORDER.map((id) => {
    const files = conflicts.filter((path) => classifyIntegrationConflict(path) === id)
    if (!files.length) return null
    return { id, ...BATCH_AUTHORITY[id], files }
  }).filter(Boolean)
  validateBatches(batches, conflicts)

  const body = {
    contract: RELEASE_INTEGRATION_PLAN_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    repository: REPOSITORY,
    mode: 'owner_review_only_no_git_mutation',
    candidate: { branch, commit: candidateCommit, clean: true },
    main: { ref: 'origin/main', commit: mainCommit },
    relations: {
      mergeBase,
      mainIsAncestor: false,
      candidateIsAncestor: false,
      mainOnlyCommits,
      candidateOnlyCommits,
    },
    mergeTree: {
      tree: mergeTree,
      status: conflicts.length ? 'conflicts' : 'clean',
      conflictCount: conflicts.length,
      conflicts,
    },
    integration: {
      status: conflicts.length ? 'manual_integration_required' : 'clean_merge_review_required',
      strategy: 'new_owner_approved_integration_branch_from_origin_main',
      batchCount: batches.length,
      batches,
      finalGate: [
        'npm run app:verify',
        'npm run company:ally:self-test',
        'npm run release:handoff:prepare -- --output <exclusive-path>',
        'npm run release:handoff:verify -- <same-path>',
      ],
    },
    authority: {
      branchCreationApproved: false,
      mergeApproved: false,
      conflictResolutionApproved: false,
      pushApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      providerWritesPerformed: false,
      remoteWritesPerformed: false,
      forcePushAllowed: false,
    },
    nextAction: {
      kind: 'owner_review_integration_plan',
      exactMainCommit: mainCommit,
      exactCandidateCommit: candidateCommit,
      firstBatch: batches[0]?.id || null,
      mergeIncluded: false,
      pushIncluded: false,
      deploymentIncluded: false,
    },
  }
  return { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
}

export function validateReleaseIntegrationPlan(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('release_integration_packet_invalid')
  const rebuilt = buildReleaseIntegrationPlan({
    generatedAt: packet.generatedAt,
    repository: packet.repository,
    origin: ORIGIN,
    candidate: packet.candidate,
    main: packet.main,
    relations: packet.relations,
    mergeTree: {
      tree: packet.mergeTree?.tree,
      status: packet.mergeTree?.status,
      conflicts: packet.mergeTree?.conflicts,
    },
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(packet)) fail('release_integration_packet_invalid')
  return rebuilt
}

function run(file, args, { allowFailure = false } = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 2 * 60 * 1_000,
    windowsHide: true,
  })
  if (!allowFailure && (result.error || result.signal || result.status !== 0)) fail('release_integration_command_failed')
  return { status: result.status, stdout: String(result.stdout || '').trim() }
}

function git(...args) {
  return run('git', args).stdout
}

function remoteMainHead() {
  const output = git('ls-remote', '--heads', 'origin', 'main')
  const lines = output.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) fail('release_integration_remote_main_invalid')
  const [commit, ref, ...extra] = lines[0].split(/\s+/)
  if (extra.length || ref !== 'refs/heads/main') fail('release_integration_remote_main_invalid')
  return exactSha(commit, 'release_integration_remote_main_invalid')
}

function currentInput(generatedAt) {
  const branch = git('symbolic-ref', '--short', 'HEAD')
  const candidateCommit = exactSha(git('rev-parse', 'HEAD'), 'release_integration_candidate_invalid')
  const origin = git('remote', 'get-url', 'origin')
  if (origin !== ORIGIN) fail('release_integration_repository_invalid')
  if (git('status', '--porcelain=v1')) fail('release_integration_worktree_dirty')
  const mainCommit = remoteMainHead()
  if (exactSha(git('rev-parse', 'origin/main'), 'release_integration_main_invalid') !== mainCommit) {
    fail('release_integration_remote_tracking_stale')
  }
  const mergeBase = exactSha(git('merge-base', mainCommit, candidateCommit), 'release_integration_merge_base_invalid')
  const [mainOnlyCommits, candidateOnlyCommits] = git('rev-list', '--left-right', '--count', `${mainCommit}...${candidateCommit}`)
    .split(/\s+/).map(Number)
  const mergeResult = run('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', mainCommit, candidateCommit], { allowFailure: true })
  if (![0, 1].includes(mergeResult.status)) fail('release_integration_merge_tree_failed')
  const mergeTree = parseMergeTreeNameOnly(mergeResult.stdout)
  if ((mergeResult.status === 0) !== (mergeTree.paths.length === 0)) fail('release_integration_merge_status_invalid')
  return {
    generatedAt,
    repository: REPOSITORY,
    origin,
    candidate: { branch, commit: candidateCommit, clean: true },
    main: { commit: mainCommit },
    relations: { mergeBase, mainOnlyCommits, candidateOnlyCommits },
    mergeTree: { tree: mergeTree.tree, status: mergeTree.paths.length ? 'conflicts' : 'clean', conflicts: mergeTree.paths },
  }
}

export async function writeExclusiveJson(outputPath, packet) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('release_integration_output_exists')
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  if (Buffer.byteLength(payload) > MAX_OUTPUT_BYTES) fail('release_integration_output_too_large')
  const handle = await open(absolute, 'wx', 0o600)
  try { await handle.writeFile(payload, 'utf8') } finally { await handle.close() }
  return { path: absolute, bytes: Buffer.byteLength(payload), digest: `sha256:${sha256(payload)}`, packetDigest: packet.digest }
}

function parseArgs(argv) {
  if (argv.length !== 2 || !argv[1]) fail('release_integration_path_required')
  if (argv[0] === '--output') return { mode: 'prepare', path: argv[1] }
  if (argv[0] === '--verify') return { mode: 'verify', path: argv[1] }
  fail('release_integration_mode_invalid')
}

async function prepare(path) {
  const packet = buildReleaseIntegrationPlan(currentInput(new Date().toISOString()))
  const receipt = await writeExclusiveJson(path, packet)
  return {
    ok: true,
    contract: RELEASE_INTEGRATION_PLAN_CONTRACT,
    mode: packet.mode,
    ...receipt,
    conflictCount: packet.mergeTree.conflictCount,
    batchCount: packet.integration.batchCount,
    nextAction: packet.nextAction,
    authority: packet.authority,
  }
}

async function verify(path) {
  const absolute = resolve(path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_OUTPUT_BYTES) {
    fail('release_integration_file_invalid')
  }
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload) !== metadata.size) fail('release_integration_file_changed')
  let packet
  try { packet = validateReleaseIntegrationPlan(JSON.parse(payload)) } catch (error) {
    if (String(error?.message || '').startsWith('release_integration_')) throw error
    fail('release_integration_packet_invalid')
  }
  const current = buildReleaseIntegrationPlan(currentInput(packet.generatedAt))
  if (JSON.stringify(current) !== JSON.stringify(packet)) fail('release_integration_state_changed')
  return {
    ok: true,
    contract: RELEASE_INTEGRATION_PLAN_CONTRACT,
    mode: packet.mode,
    path: absolute,
    bytes: metadata.size,
    digest: `sha256:${sha256(payload)}`,
    packetDigest: packet.digest,
    conflictCount: packet.mergeTree.conflictCount,
    batches: packet.integration.batches.map((batch) => ({ id: batch.id, fileCount: batch.files.length })),
    nextAction: packet.nextAction,
    authority: packet.authority,
  }
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  const result = request.mode === 'prepare' ? await prepare(request.path) : await verify(request.path)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: RELEASE_INTEGRATION_PLAN_CONTRACT, reason: String(error?.message || 'release_integration_failed').slice(0, 160) })}\n`)
    process.exitCode = 1
  })
}
