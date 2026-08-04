#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const RUNTIME_TRUTH_CONTRACT = 'supermega.runtime-truth.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const ORIGIN = `https://github.com/${REPOSITORY}.git`
const APP_RELEASE_URL = 'https://app.supermega.dev/__release.json'
const PUBLIC_RELEASE_URL = 'https://supermega.dev/__release.json'
const EXPECTED_PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const EXPECTED_PRODUCT_PATHS = ['/shop/', '/plant/', '/website/', '/ecommerce/']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024
const MAX_LIVE_BYTES = 64 * 1024
const MAX_RECEIPT_AGE_MS = 72 * 60 * 60 * 1_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const BRANCH_PATTERN = /^(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119}$/
const STATUS_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedText(value) {
  return String(value).replace(/\r\n?/g, '\n')
}

function digest(value) {
  return `sha256:${sha256(normalizedText(value))}`
}

function exactSha(value, reason) {
  const candidate = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(candidate)) fail(reason)
  return candidate
}

function exactDigest(value, reason) {
  const candidate = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(candidate)) fail(reason)
  return candidate
}

function exactTimestamp(value, reason) {
  const candidate = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(candidate)
    || new Date(candidate).toISOString() !== candidate) fail(reason)
  return candidate
}

function exactCount(value, reason, { nullable = false } = {}) {
  if (nullable && value === null) return null
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(reason)
  return value
}

function exactBoolean(value, reason, { nullable = false } = {}) {
  if (nullable && value === null) return null
  if (typeof value !== 'boolean') fail(reason)
  return value
}

function exactStatus(value, reason) {
  const candidate = String(value || '')
  if (!STATUS_PATTERN.test(candidate)) fail(reason)
  return candidate
}

function exactStringArray(value, reason, { expected = null, max = 128 } = {}) {
  if (!Array.isArray(value) || value.length > max || value.some((entry) => typeof entry !== 'string' || !entry || entry.length > 300)) {
    fail(reason)
  }
  const normalized = [...new Set(value)].sort()
  if (normalized.length !== value.length) fail(reason)
  if (expected && JSON.stringify(normalized) !== JSON.stringify([...expected].sort())) fail(reason)
  return normalized
}

function releaseIdentity(value, reason) {
  const version = (field) => {
    const candidate = String(value?.[field] || '')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(candidate)) fail(reason)
    return candidate
  }
  return {
    commit: exactSha(value?.commit, reason),
    brandVersion: version('brandVersion'),
    contextVersion: version('contextVersion'),
    catalogVersion: version('catalogVersion'),
  }
}

function relation(value, prefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${prefix}_invalid`)
  return {
    objectAvailable: exactBoolean(value.objectAvailable, `${prefix}_object_invalid`),
    isAncestor: exactBoolean(value.isAncestor, `${prefix}_ancestor_invalid`, { nullable: true }),
    headAhead: exactCount(value.headAhead, `${prefix}_ahead_invalid`, { nullable: true }),
    headBehind: exactCount(value.headBehind, `${prefix}_behind_invalid`, { nullable: true }),
  }
}

function productRecords(value, reason) {
  if (!Array.isArray(value) || value.length !== EXPECTED_PRODUCT_IDS.length) fail(reason)
  const records = value.map((entry) => {
    const id = String(entry?.id || '')
    const path = String(entry?.path || '')
    const status = exactStatus(entry?.status, reason)
    if (!EXPECTED_PRODUCT_IDS.includes(id) || !EXPECTED_PRODUCT_PATHS.includes(path)) fail(reason)
    return { id, path, status }
  }).sort((left, right) => EXPECTED_PRODUCT_IDS.indexOf(left.id) - EXPECTED_PRODUCT_IDS.indexOf(right.id))
  if (records.map((entry) => entry.id).join(',') !== EXPECTED_PRODUCT_IDS.join(',')
    || records.map((entry) => entry.path).join(',') !== EXPECTED_PRODUCT_PATHS.join(',')) fail(reason)
  return records
}

function manifestProducts(value) {
  if (!Array.isArray(value) || value.length !== EXPECTED_PRODUCT_IDS.length) fail('runtime_truth_manifest_products_invalid')
  const records = value.map((entry) => {
    const id = String(entry?.id || '')
    const publicAnchor = String(entry?.publicAnchor || '')
    const appRoute = String(entry?.appRoute || '')
    const status = exactStatus(entry?.status, 'runtime_truth_manifest_products_invalid')
    if (!EXPECTED_PRODUCT_IDS.includes(id)
      || publicAnchor !== EXPECTED_PRODUCT_PATHS[EXPECTED_PRODUCT_IDS.indexOf(id)]
      || appRoute !== `https://app.supermega.dev${publicAnchor}`) fail('runtime_truth_manifest_products_invalid')
    return { id, publicAnchor, appRoute, status }
  }).sort((left, right) => EXPECTED_PRODUCT_IDS.indexOf(left.id) - EXPECTED_PRODUCT_IDS.indexOf(right.id))
  if (records.map((entry) => entry.id).join(',') !== EXPECTED_PRODUCT_IDS.join(',')) fail('runtime_truth_manifest_products_invalid')
  return records
}

function managedSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.contract !== 'supermega.managed-pilot-readiness.v1') fail('runtime_truth_managed_invalid')
  const gates = Array.isArray(value.gates) ? value.gates.map((entry) => ({
    id: exactStatus(entry?.id, 'runtime_truth_managed_gate_invalid'),
    status: exactStatus(entry?.status, 'runtime_truth_managed_gate_invalid'),
  })).sort((left, right) => left.id.localeCompare(right.id)) : fail('runtime_truth_managed_gate_invalid')
  if (new Set(gates.map((entry) => entry.id)).size !== gates.length || gates.length > 64) fail('runtime_truth_managed_gate_invalid')
  const blockers = gates.filter((entry) => entry.status === 'blocked').map((entry) => entry.id)
  const blockingGateCount = exactCount(value.blockingGateCount, 'runtime_truth_managed_count_invalid')
  const hostedActivationReady = exactBoolean(value.hostedActivationReady, 'runtime_truth_managed_activation_invalid')
  if (blockingGateCount !== blockers.length || hostedActivationReady === (blockingGateCount > 0)) {
    fail('runtime_truth_managed_state_invalid')
  }
  return {
    contract: value.contract,
    asOf: exactTimestamp(value.asOf, 'runtime_truth_managed_time_invalid'),
    sourceDigest: exactDigest(value.sourceDigest, 'runtime_truth_managed_digest_invalid'),
    status: exactStatus(value.status, 'runtime_truth_managed_status_invalid'),
    hostedActivationReady,
    blockingGateCount,
    blockers,
    gates,
  }
}

function migrationSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('runtime_truth_migrations_invalid')
  const files = exactStringArray(value.files, 'runtime_truth_migration_files_invalid', { max: 128 })
  const count = exactCount(value.count, 'runtime_truth_migration_count_invalid')
  const latest = String(value.latest || '')
  if (count !== files.length || latest !== files.at(-1) || !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(latest)) {
    fail('runtime_truth_migrations_invalid')
  }
  return {
    count,
    files,
    latest,
    aggregateDigest: exactDigest(value.aggregateDigest, 'runtime_truth_migration_digest_invalid'),
    quarantineDigest: exactDigest(value.quarantineDigest, 'runtime_truth_quarantine_digest_invalid'),
  }
}

function gateSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('runtime_truth_gates_invalid')
  const allowed = new Set(['passed', 'not_run', 'not_proven'])
  const hqVerify = String(value.hqVerify || '')
  const appVerify = String(value.appVerify || '')
  const renderedRoutes = String(value.renderedRoutes || '')
  const hostedActivation = String(value.hostedActivation || '')
  if (![hqVerify, appVerify, renderedRoutes, hostedActivation].every((entry) => allowed.has(entry)) || hqVerify !== 'passed') {
    fail('runtime_truth_gates_invalid')
  }
  return { hqVerify, appVerify, renderedRoutes, hostedActivation }
}

export function buildRuntimeTruth(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('runtime_truth_input_invalid')
  const generatedAt = exactTimestamp(input.generatedAt, 'runtime_truth_time_invalid')
  if (input.repository !== REPOSITORY || input.origin !== ORIGIN) fail('runtime_truth_repository_invalid')

  const branch = String(input.local?.branch || '')
  if (!BRANCH_PATTERN.test(branch) || input.local?.clean !== true) fail('runtime_truth_local_invalid')
  const head = exactSha(input.local?.head, 'runtime_truth_head_invalid')
  const trackingMain = exactSha(input.local?.trackingMain, 'runtime_truth_tracking_main_invalid')
  const remoteMain = exactSha(input.remote?.mainCommit, 'runtime_truth_remote_main_invalid')
  const remoteCandidate = input.remote?.candidateCommit == null
    ? null
    : exactSha(input.remote.candidateCommit, 'runtime_truth_remote_candidate_invalid')
  const appRelease = releaseIdentity(input.live?.app, 'runtime_truth_live_app_invalid')
  const publicRelease = releaseIdentity(input.live?.public, 'runtime_truth_live_public_invalid')
  const livePairMatches = JSON.stringify(appRelease) === JSON.stringify(publicRelease)

  const relations = {
    trackingMatchesRemote: exactBoolean(input.relations?.trackingMatchesRemote, 'runtime_truth_tracking_relation_invalid'),
    remoteMain: relation(input.relations?.remoteMain, 'runtime_truth_remote_main_relation'),
    liveApp: relation(input.relations?.liveApp, 'runtime_truth_live_app_relation'),
    livePublic: relation(input.relations?.livePublic, 'runtime_truth_live_public_relation'),
    remoteCandidate: remoteCandidate === null
      ? null
      : relation(input.relations?.remoteCandidate, 'runtime_truth_remote_candidate_relation'),
  }
  if (relations.trackingMatchesRemote !== (trackingMain === remoteMain)) fail('runtime_truth_tracking_relation_invalid')

  const portfolioProducts = productRecords(input.routes?.portfolioProducts, 'runtime_truth_portfolio_products_invalid')
  const customerProducts = manifestProducts(input.routes?.manifestProducts)
  const appProductRoutes = exactStringArray(input.routes?.appProductRoutes, 'runtime_truth_app_routes_invalid', { expected: EXPECTED_PRODUCT_PATHS })
  const appDeclaredPaths = exactStringArray(input.routes?.appDeclaredPaths, 'runtime_truth_app_declared_routes_invalid', { max: 64 })
  const publicPageRoutes = exactStringArray(input.routes?.publicPageRoutes, 'runtime_truth_public_routes_invalid', { max: 32 })
  for (const route of ['/', '/contact/', '/privacy/', ...EXPECTED_PRODUCT_PATHS]) {
    if (!publicPageRoutes.includes(route)) fail('runtime_truth_public_routes_invalid')
  }

  const routes = {
    appProductRoutes,
    appDeclaredPaths,
    publicPageRoutes,
    portfolioProducts,
    manifestProducts: customerProducts,
    appSourceDigest: exactDigest(input.routes?.appSourceDigest, 'runtime_truth_app_source_digest_invalid'),
    manifestDigest: exactDigest(input.routes?.manifestDigest, 'runtime_truth_manifest_digest_invalid'),
    portfolioDigest: exactDigest(input.routes?.portfolioDigest, 'runtime_truth_portfolio_digest_invalid'),
  }
  const managed = managedSummary(input.managed)
  const migrations = migrationSummary(input.migrations)
  const gates = gateSummary(input.gates)
  if (gates.hostedActivation === 'not_proven' && managed.hostedActivationReady) fail('runtime_truth_gate_state_invalid')

  let releaseStatus = 'manual_reconciliation_required'
  if (!livePairMatches) releaseStatus = 'live_pair_mismatch'
  else if (!relations.trackingMatchesRemote) releaseStatus = 'remote_tracking_stale'
  else if (head === remoteMain && head === appRelease.commit) releaseStatus = 'live_matches_head_and_main'
  else if (relations.remoteMain.isAncestor === true
    && relations.liveApp.isAncestor === true
    && relations.livePublic.isAncestor === true
    && (relations.remoteMain.headAhead ?? 0) > 0
    && (relations.liveApp.headAhead ?? 0) > 0) releaseStatus = 'candidate_ahead_review_required'

  const remoteCandidateState = remoteCandidate === null
    ? 'unpublished'
    : remoteCandidate === head
      ? 'exact'
      : relations.remoteCandidate?.isAncestor === true
        ? 'behind_fast_forward_possible'
        : 'diverged_or_unavailable'
  const nextAction = releaseStatus === 'remote_tracking_stale'
    ? 'refresh_origin_main_then_regenerate'
    : releaseStatus === 'live_pair_mismatch'
      ? 'investigate_live_pair_before_release_work'
      : releaseStatus === 'candidate_ahead_review_required'
        ? 'owner_review_candidate_then_rehearse_isolated_managed_foundation'
        : releaseStatus === 'live_matches_head_and_main' && !managed.hostedActivationReady
          ? 'rehearse_isolated_managed_foundation'
          : 'manual_release_and_managed_state_reconciliation'

  const body = {
    contract: RUNTIME_TRUTH_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    repository: REPOSITORY,
    origin: ORIGIN,
    mode: 'read_only_observation',
    local: { branch, head, clean: true, trackingMain },
    remote: { mainCommit: remoteMain, candidateCommit: remoteCandidate },
    live: { app: appRelease, public: publicRelease, pairMatches: livePairMatches },
    relations,
    managed,
    routes,
    migrations,
    gates,
    assessment: {
      releaseStatus,
      remoteCandidateState,
      managedStatus: managed.hostedActivationReady ? 'hosted_activation_ready' : 'managed_activation_blocked',
      productCount: portfolioProducts.length,
      publicPageCount: publicPageRoutes.length,
      migrationCount: migrations.count,
      nextAction,
    },
    authority: {
      networkReadsPerformed: true,
      gitFetchPerformed: false,
      branchCreated: false,
      filesChangedByObservation: false,
      pushApproved: false,
      mergeApproved: false,
      deploymentApproved: false,
      providerMutationApproved: false,
      productionWriteApproved: false,
      remoteWritesPerformed: false,
      providerWritesPerformed: false,
    },
  }
  return { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
}

export function validateRuntimeTruthPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('runtime_truth_packet_invalid')
  const rebuilt = buildRuntimeTruth({
    generatedAt: packet.generatedAt,
    repository: packet.repository,
    origin: packet.origin,
    local: packet.local,
    remote: packet.remote,
    live: packet.live,
    relations: packet.relations,
    managed: packet.managed,
    routes: packet.routes,
    migrations: packet.migrations,
    gates: packet.gates,
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(packet)) fail('runtime_truth_packet_invalid')
  return rebuilt
}

function run(file, args, { allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
    timeout,
    windowsHide: true,
  })
  if (!allowFailure && (result.error || result.signal || result.status !== 0)) fail('runtime_truth_command_failed')
  return { status: result.status, stdout: String(result.stdout || '').trim() }
}

function git(...args) {
  return run('git', args).stdout
}

function isAncestor(ancestor, descendant) {
  const result = run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true })
  if (![0, 1].includes(result.status)) fail('runtime_truth_ancestry_failed')
  return result.status === 0
}

function objectAvailable(commit) {
  const result = run('git', ['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true })
  if (![0, 1].includes(result.status)) fail('runtime_truth_object_check_failed')
  return result.status === 0
}

function commitRelation(commit, head) {
  const available = objectAvailable(commit)
  if (!available) return { objectAvailable: false, isAncestor: null, headAhead: null, headBehind: null }
  return {
    objectAvailable: true,
    isAncestor: isAncestor(commit, head),
    headAhead: Number(git('rev-list', '--count', `${commit}..${head}`)),
    headBehind: Number(git('rev-list', '--count', `${head}..${commit}`)),
  }
}

function remoteHead(ref) {
  const output = git('ls-remote', '--heads', 'origin', ref)
  if (!output) return null
  const lines = output.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) fail('runtime_truth_remote_ref_ambiguous')
  const [commit, exactRef, ...extra] = lines[0].split(/\s+/)
  if (extra.length || exactRef !== `refs/heads/${ref}`) fail('runtime_truth_remote_ref_invalid')
  return exactSha(commit, 'runtime_truth_remote_ref_invalid')
}

async function boundedRead(path, reason) {
  const metadata = await lstat(path).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_FILE_BYTES) fail(reason)
  const value = await readFile(path, 'utf8')
  if (Buffer.byteLength(value) !== metadata.size) fail(reason)
  return value
}

async function boundedJson(url, reason) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok || !response.body) fail(reason)
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_LIVE_BYTES) {
      await reader.cancel()
      fail(reason)
    }
    chunks.push(Buffer.from(value))
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    fail(reason)
  }
}

async function observeRoutes() {
  const appPath = resolve(root, 'showroom', 'src', 'App.tsx')
  const manifestPath = resolve(root, 'site-manifest.json')
  const portfolioPath = resolve(root, 'hq', 'portfolio.json')
  const [appSource, manifestText, portfolioText] = await Promise.all([
    boundedRead(appPath, 'runtime_truth_app_source_invalid'),
    boundedRead(manifestPath, 'runtime_truth_manifest_invalid'),
    boundedRead(portfolioPath, 'runtime_truth_portfolio_invalid'),
  ])
  let manifest
  let portfolio
  try {
    manifest = JSON.parse(manifestText)
    portfolio = JSON.parse(portfolioText)
  } catch {
    fail('runtime_truth_route_json_invalid')
  }
  const appDeclaredPaths = [...new Set([...appSource.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]))].sort()
  const appProductRoutes = EXPECTED_PRODUCT_IDS.map((id) => {
    if (!appDeclaredPaths.includes(`${id}/*`)) fail('runtime_truth_app_routes_invalid')
    return `/${id}/`
  })
  return {
    appProductRoutes,
    appDeclaredPaths,
    publicPageRoutes: (manifest.pages || []).map((page) => String(page?.route || '')).sort(),
    portfolioProducts: (portfolio.products || []).map(({ id, path, status }) => ({ id, path, status })),
    manifestProducts: (manifest.customerProducts || []).map(({ id, publicAnchor, appRoute, status }) => ({ id, publicAnchor, appRoute, status })),
    appSourceDigest: digest(appSource),
    manifestDigest: digest(manifestText),
    portfolioDigest: digest(portfolioText),
  }
}

async function observeManaged() {
  const path = resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')
  const text = await boundedRead(path, 'runtime_truth_managed_file_invalid')
  let readiness
  try { readiness = JSON.parse(text) } catch { fail('runtime_truth_managed_json_invalid') }
  return {
    contract: readiness.contract,
    asOf: readiness.asOf,
    sourceDigest: readiness.sourceDigest,
    status: readiness.overall?.status,
    hostedActivationReady: readiness.overall?.hostedActivationReady,
    blockingGateCount: readiness.overall?.blockingGateCount,
    gates: readiness.gates?.map(({ id, status }) => ({ id, status })),
  }
}

async function observeMigrations() {
  const directory = resolve(root, 'supabase', 'migrations')
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d{14}_[a-z0-9_]+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (!entries.length) fail('runtime_truth_migration_files_invalid')
  const hash = createHash('sha256')
  for (const name of entries) {
    const relative = `supabase/migrations/${name}`
    const source = await boundedRead(resolve(directory, name), 'runtime_truth_migration_file_invalid')
    hash.update(relative, 'utf8')
    hash.update('\0', 'utf8')
    hash.update(normalizedText(source), 'utf8')
    hash.update('\0', 'utf8')
  }
  const quarantine = await boundedRead(
    resolve(root, 'supabase', 'rehearsal', '20260804_public_browser_quarantine.sql'),
    'runtime_truth_quarantine_invalid',
  )
  return {
    count: entries.length,
    files: entries.map((name) => `supabase/migrations/${name}`),
    latest: `supabase/migrations/${entries.at(-1)}`,
    aggregateDigest: `sha256:${hash.digest('hex')}`,
    quarantineDigest: digest(quarantine),
  }
}

function runHqGate() {
  const command = process.platform === 'win32'
    ? { file: resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), args: ['/d', '/s', '/c', 'npm.cmd run hq:verify'] }
    : { file: 'npm', args: ['run', 'hq:verify'] }
  run(command.file, command.args, { timeout: 3 * 60 * 1_000 })
}

async function currentInput(generatedAt) {
  const branch = git('symbolic-ref', '--short', 'HEAD')
  if (!BRANCH_PATTERN.test(branch)) fail('runtime_truth_local_invalid')
  const head = exactSha(git('rev-parse', 'HEAD'), 'runtime_truth_head_invalid')
  const origin = git('remote', 'get-url', 'origin')
  if (origin !== ORIGIN || git('status', '--porcelain=v1')) fail('runtime_truth_worktree_dirty')
  runHqGate()

  const trackingMain = exactSha(git('rev-parse', 'origin/main'), 'runtime_truth_tracking_main_invalid')
  const remoteMain = remoteHead('main')
  const remoteCandidate = remoteHead(branch)
  if (!remoteMain) fail('runtime_truth_remote_main_missing')
  const [app, publicRelease, routes, managed, migrations] = await Promise.all([
    boundedJson(APP_RELEASE_URL, 'runtime_truth_live_app_fetch_failed'),
    boundedJson(PUBLIC_RELEASE_URL, 'runtime_truth_live_public_fetch_failed'),
    observeRoutes(),
    observeManaged(),
    observeMigrations(),
  ])
  if (git('rev-parse', 'HEAD') !== head || git('status', '--porcelain=v1')) fail('runtime_truth_local_changed_during_observation')
  return {
    generatedAt,
    repository: REPOSITORY,
    origin,
    local: { branch, head, clean: true, trackingMain },
    remote: { mainCommit: remoteMain, candidateCommit: remoteCandidate },
    live: { app, public: publicRelease },
    relations: {
      trackingMatchesRemote: trackingMain === remoteMain,
      remoteMain: commitRelation(remoteMain, head),
      liveApp: commitRelation(exactSha(app.commit, 'runtime_truth_live_app_invalid'), head),
      livePublic: commitRelation(exactSha(publicRelease.commit, 'runtime_truth_live_public_invalid'), head),
      remoteCandidate: remoteCandidate ? commitRelation(remoteCandidate, head) : null,
    },
    managed,
    routes,
    migrations,
    gates: {
      hqVerify: 'passed',
      appVerify: 'not_run',
      renderedRoutes: 'not_run',
      hostedActivation: managed.hostedActivationReady ? 'passed' : 'not_proven',
    },
  }
}

export async function writeExclusiveJson(outputPath, packet) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('runtime_truth_output_exists')
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  if (Buffer.byteLength(payload) > MAX_OUTPUT_BYTES) fail('runtime_truth_output_too_large')
  const handle = await open(absolute, 'wx', 0o600)
  try {
    await handle.writeFile(payload, 'utf8')
  } finally {
    await handle.close()
  }
  return {
    path: absolute,
    bytes: Buffer.byteLength(payload),
    digest: `sha256:${sha256(payload)}`,
    packetDigest: packet.digest,
  }
}

function parseArgs(argv) {
  if (argv.length !== 2 || !argv[1]) fail('runtime_truth_path_required')
  if (argv[0] === '--output') return { mode: 'prepare', path: argv[1] }
  if (argv[0] === '--verify') return { mode: 'verify', path: argv[1] }
  fail('runtime_truth_mode_invalid')
}

async function prepare(path) {
  const packet = buildRuntimeTruth(await currentInput(new Date().toISOString()))
  return { ok: true, ...await writeExclusiveJson(path, packet), ...packet.assessment, contract: RUNTIME_TRUTH_CONTRACT, authority: packet.authority }
}

async function verify(path) {
  const absolute = resolve(path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_OUTPUT_BYTES) {
    fail('runtime_truth_file_invalid')
  }
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload) !== metadata.size) fail('runtime_truth_file_changed')
  let packet
  try { packet = validateRuntimeTruthPacket(JSON.parse(payload)) } catch (error) {
    if (String(error?.message || '').startsWith('runtime_truth_')) throw error
    fail('runtime_truth_packet_invalid')
  }
  const age = Date.now() - Date.parse(packet.generatedAt)
  if (age < -5 * 60 * 1_000) fail('runtime_truth_receipt_from_future')
  if (age > MAX_RECEIPT_AGE_MS) fail('runtime_truth_receipt_stale')
  const current = buildRuntimeTruth(await currentInput(packet.generatedAt))
  if (JSON.stringify(current) !== JSON.stringify(packet)) fail('runtime_truth_state_changed')
  return {
    ok: true,
    contract: RUNTIME_TRUTH_CONTRACT,
    path: absolute,
    bytes: metadata.size,
    digest: `sha256:${sha256(payload)}`,
    packetDigest: packet.digest,
    ...packet.assessment,
    authority: packet.authority,
  }
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  const receipt = request.mode === 'prepare' ? await prepare(request.path) : await verify(request.path)
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: RUNTIME_TRUTH_CONTRACT, reason: String(error?.message || 'runtime_truth_failed').slice(0, 160) })}\n`)
    process.exitCode = 1
  })
}
