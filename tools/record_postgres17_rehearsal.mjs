import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, mkdir, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const outputPath = resolve(root, 'hq', 'research', 'postgres17-rehearsal.json')
const toolchainProfilePath = resolve(root, 'hq', 'research', 'postgres17-toolchain-profile.json')
const rehearsalRunner = resolve(root, 'tools', 'rehearse_supermega_postgres17.py')

import { verifyPostgres17ToolchainProfile } from './postgres17_toolchain_profile.mjs'

import {
  DATABASE_REHEARSAL_EVIDENCE_SCHEMA, implementationPaths, fail, sha256, same,
  buildSanitizedProof, validateSanitizedProof,
} from '../kernel/database-rehearsal-evidence.mjs'
export {
  DATABASE_REHEARSAL_EVIDENCE_SCHEMA, buildSanitizedProof, validateSanitizedProof,
  catalogCheckNames, proofDigest,
} from '../kernel/database-rehearsal-evidence.mjs'

export async function implementationEvidence(repositoryRoot = root) {
  const digest = createHash('sha256')
  for (const path of implementationPaths) {
    digest.update(path, 'utf8')
    digest.update('\0', 'utf8')
    digest.update((await readFile(resolve(repositoryRoot, path), 'utf8')).replace(/\r\n/g, '\n'), 'utf8')
    digest.update('\0', 'utf8')
  }
  return {
    digest: `sha256:${digest.digest('hex')}`,
    fileCount: implementationPaths.length,
    paths: [...implementationPaths],
  }
}

export function recordCompletionSummary(proof, implementation) {
  const validation = validateSanitizedProof(proof, implementation)
  return { ...validation, implementationCommit: proof.implementationCommit,
    implementationTree: proof.implementationTree, implementationDigest: proof.implementationDigest,
    receiptDigest: proof.receiptDigest }
}

async function archiveEvidence(path) {
  if (typeof path !== 'string' || path.length === 0) fail('database_rehearsal_archive_invalid')
  await access(path)
  const metadata = await stat(path)
  const digest = createHash('sha256')
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.on('error', rejectStream)
    stream.on('end', resolveStream)
  })
  return { bytes: metadata.size, sha256: digest.digest('hex') }
}

export async function resolveToolchainArchivePath(profilePath = toolchainProfilePath) {
  const sources = await resolveToolchainSourcePaths(profilePath)
  let profile
  try { profile = JSON.parse(await readFile(profilePath, 'utf8')) } catch { fail('database_rehearsal_toolchain_profile_invalid') }
  const primary = profile?.sources?.find((source) => source.component === 'postgresql')
  if (!primary || typeof sources[primary.sourceId] !== 'string') {
    fail('database_rehearsal_toolchain_profile_archive_name_mismatch')
  }
  return sources[primary.sourceId]
}

export async function resolveToolchainSourcePaths(profilePath = toolchainProfilePath) {
  let profile
  try { profile = JSON.parse(await readFile(profilePath, 'utf8')) } catch { fail('database_rehearsal_toolchain_profile_invalid') }
  if (!Array.isArray(profile?.sources) || profile.sources.length === 0) {
    fail('database_rehearsal_toolchain_profile_source_invalid')
  }
  const cacheRoot = resolve(homedir(), '.cache', 'supermega-postgresql')
  const entries = profile.sources.map(({ sourceId, fileName }) => {
    if (typeof sourceId !== 'string' || sourceId.length === 0
      || typeof fileName !== 'string' || fileName !== basename(fileName)) {
      fail('database_rehearsal_toolchain_profile_source_invalid')
    }
    return [sourceId, resolve(cacheRoot, fileName)]
  })
  if (new Set(entries.map(([sourceId]) => sourceId)).size !== entries.length) {
    fail('database_rehearsal_toolchain_profile_source_invalid')
  }
  return Object.fromEntries(entries)
}

export function toolchainAuthority(verified) {
  const receiptEvidence = verified?.receiptEvidence
  const authority = {
    ...receiptEvidence,
    archiveFileName: verified?.archiveFileName,
    archiveBytes: verified?.archiveBytes,
    sourceArtifactSha256: verified?.archiveSha256,
    trustedBoundary: 'isolated-single-purpose-windows-x64-v1',
  }
  if (authority.contract !== 'supermega.postgres17-toolchain-receipt-evidence.v1'
    || typeof authority.profileId !== 'string' || authority.profileId.length === 0
    || typeof authority.archiveFileName !== 'string'
    || !authority.archiveFileName.toLowerCase().endsWith('.exe')
    || !Number.isSafeInteger(authority.archiveBytes) || authority.archiveBytes < 1
    || authority.trustedBoundary !== 'isolated-single-purpose-windows-x64-v1'
    || !Array.isArray(authority.sourceAuthentication)
    || authority.sourceAuthentication.length === 0
    || ![authority.manifestSha256, authority.policySha256, authority.sourceDigest,
      authority.bindingDigest, authority.loadClosureEvidenceSha256,
      authority.executionBundleSha256, authority.sourceArtifactSha256]
      .every((value) => /^[0-9a-f]{64}$/.test(value || ''))) {
    fail('database_rehearsal_toolchain_authority_invalid')
  }
  return authority
}

function gitOutput(gitExecutable, args) {
  if (typeof gitExecutable !== 'string' || !isAbsolute(gitExecutable)) {
    fail('database_rehearsal_verified_git_required')
  }
  const result = spawnSync(gitExecutable, ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (result.status !== 0) fail('database_rehearsal_git_unavailable')
  return result.stdout.trim()
}

function cleanSource(gitExecutable) {
  if (gitOutput(gitExecutable, ['status', '--porcelain', '--untracked-files=all'])) fail('database_rehearsal_record_requires_clean_worktree')
  return { implementationCommit: gitOutput(gitExecutable, ['rev-parse', 'HEAD']), implementationTree: gitOutput(gitExecutable, ['rev-parse', 'HEAD^{tree}']) }
}

export async function requireVerifiedRecorderRuntime(
  verifiedToolchain,
  currentNode = process.execPath,
  realpathImplementation = realpath,
) {
  const verifiedNode = verifiedToolchain?.execution?.node
  if (typeof verifiedNode !== 'string' || !verifiedNode || typeof currentNode !== 'string' || !currentNode) {
    fail('database_rehearsal_recorder_node_unverified')
  }
  let expected, observed
  try {
    [expected, observed] = await Promise.all([
      realpathImplementation(verifiedNode), realpathImplementation(currentNode),
    ])
  } catch { fail('database_rehearsal_recorder_node_unverified') }
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value
  if (normalize(expected) !== normalize(observed)) fail('database_rehearsal_recorder_node_mismatch')
  return expected
}

async function requireAbsent(path) {
  try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  fail('database_rehearsal_output_exists')
}

export function recorderOutcomeReconciled(result, raw) {
  return !result?.error && !result?.signal && result?.status === 0
    && raw?.contract === 'supermega_postgres17_rehearsal_v2'
    && raw.authoritative === false && raw.cleanup_complete === true
    && raw.production_mutated === false && raw.supabase_mutated === false
    && raw.vercel_mutated === false && raw.secret_values_exposed === false
}

export function toolchainChildEnvironment(verifiedToolchain, baseEnvironment = {}) {
  const execution = verifiedToolchain?.execution
  if (!execution?.postgresBin || !execution?.openssl || !execution?.python
    || !execution?.psycopg || !execution?.node || !execution?.git) {
    fail('database_rehearsal_toolchain_execution_binding_missing')
  }
  // The inherited environment supplies operating-system plumbing only. The
  // recorder passes exact verified executable paths as arguments; Python and
  // database selectors from the caller's environment are deliberately absent.
  const allowed = {}
  for (const key of [
    'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP',
    'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  ]) {
    if (typeof baseEnvironment[key] === 'string' && baseEnvironment[key]) {
      allowed[key] = baseEnvironment[key]
    }
  }
  return {
    ...allowed,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
  }
}

export function recorderChildFailureCode(result) {
  if (result?.error || result?.signal || !Number.isInteger(result?.status) || result.status <= 0) return ''
  const launcherErrors = new Set([
    'configured_python_unusable',
    'python_with_psycopg_missing',
    'rehearsal_process_failed',
  ])
  for (const output of [result?.stderr, result?.stdout]) {
    if (typeof output !== 'string' || !output.trim()) continue
    let report
    try { report = JSON.parse(output.trim()) } catch { continue }
    if (!report || typeof report !== 'object' || Array.isArray(report)) continue
    if (report.contract === 'supermega_postgres17_rehearsal_launcher_v1'
      && report.ok === false && report.secret_values_exposed === false
      && launcherErrors.has(report.error)) return `database_rehearsal_child_${report.error}`
    if (report.contract === 'supermega_postgres17_rehearsal_v2'
      && report.ok === false && report.error === 'evidence_write_failed'
      && typeof report.cleanup_complete === 'boolean'
      && report.secret_values_exposed === false
      && report.production_mutated === false && report.supabase_mutated === false
      && report.vercel_mutated === false) return 'database_rehearsal_child_evidence_write_failed'
  }
  return ''
}

export function buildRecorderFailureDiagnostic(result, rawStatus) {
  const rawStatuses = new Set(['missing', 'unreadable', 'malformed', 'parsed_unreconciled'])
  if (!rawStatuses.has(rawStatus)) fail('database_rehearsal_diagnostic_raw_status_invalid')
  const spawnErrorCodes = new Set(['EACCES', 'ENOENT', 'ENOMEM', 'EPERM', 'ETIMEDOUT'])
  const signals = new Set(['SIGABRT', 'SIGBREAK', 'SIGINT', 'SIGKILL', 'SIGTERM'])
  const spawnError = spawnErrorCodes.has(result?.error?.code) ? result.error.code : null
  const signal = signals.has(result?.signal) ? result.signal : null
  return {
    contract: 'supermega.postgres17-recorder-failure.v1',
    phase: 'child_terminal_without_reconciled_raw',
    terminal: {
      exitStatus: Number.isInteger(result?.status) && result.status >= 0 ? result.status : null,
      signal,
      spawnError,
    },
    streams: {
      stdoutBytes: typeof result?.stdout === 'string' ? Buffer.byteLength(result.stdout, 'utf8') : 0,
      stderrBytes: typeof result?.stderr === 'string' ? Buffer.byteLength(result.stderr, 'utf8') : 0,
      contentsRetained: false,
    },
    rawStatus,
    childFailureCode: recorderChildFailureCode(result) || null,
    rawEvidenceAccepted: false,
    cleanupAttested: false,
    leaseReleased: false,
    retryAuthorized: false,
    secretValuesRetained: false,
  }
}

export async function writeRecorderFailureDiagnostic(destination, result, rawStatus) {
  const path = `${destination}.diagnostic.json`
  const diagnostic = buildRecorderFailureDiagnostic(result, rawStatus)
  await writeFile(path, `${JSON.stringify(diagnostic, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { path, diagnostic }
}

export function recorderDiagnosticPersistenceCode(error) {
  const codes = new Set(['EACCES', 'EEXIST', 'ENOSPC', 'EPERM', 'EROFS'])
  return codes.has(error?.code)
    ? `database_rehearsal_diagnostic_persistence_${error.code.toLowerCase()}`
    : 'database_rehearsal_diagnostic_persistence_failed'
}

export async function withRecorderLease(lockPaths, operation) {
  const owned = []
  let launched = false, reconciled = false
  try {
    for (const path of lockPaths) {
      let handle
      try { handle = await open(path, 'wx') }
      catch (error) {
        if (error.code === 'EEXIST') fail('database_rehearsal_active_or_unreconciled')
        throw error
      }
      owned.push({ path, handle })
    }
    return await operation({
      markLaunched() { launched = true },
      reconcile(result, raw) {
        reconciled = recorderOutcomeReconciled(result, raw)
        return reconciled
      },
    })
  } finally {
    for (const { path, handle } of owned.reverse()) {
      await handle.close()
      // A timeout kills only the immediate launcher on Windows. Without its
      // terminal child result AND confirmed cleanup, retain both lock markers.
      if (!launched || reconciled) await rm(path, { force: true })
    }
  }
}

export async function record(destination, runtime = {}) {
  const dependencies = {
    cleanSource,
    gitOutput,
    implementationEvidence,
    readFile,
    spawnSync,
    tmpdir,
    writeRecorderFailureDiagnostic,
    writeFile,
    requireVerifiedRecorderRuntime,
    revalidateToolchain: async () => fail('database_rehearsal_toolchain_revalidation_missing'),
    ...runtime,
  }
  const rawPath = `${destination}.raw.json`
  await requireAbsent(destination)
  await requireAbsent(rawPath)
  await requireAbsent(`${destination}.diagnostic.json`)
  const initialToolchain = await dependencies.revalidateToolchain()
  await dependencies.requireVerifiedRecorderRuntime(initialToolchain)
  const initialAuthority = toolchainAuthority(initialToolchain)
  const source = dependencies.cleanSource(initialToolchain.execution.git)
  const implementation = await dependencies.implementationEvidence()
  await mkdir(dirname(destination), { recursive: true })
  const lockPath = `${destination}.lock`
  const commonDirectory = dependencies.gitOutput(
    initialToolchain.execution.git,
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  )
  const commonKey = process.platform === 'win32' ? commonDirectory.toLowerCase() : commonDirectory
  const repositoryLock = resolve(dependencies.tmpdir(), `supermega-postgres17-${sha256(commonKey).slice(7)}.lock`)
  return withRecorderLease([repositoryLock, lockPath], async (lease) => {
    // The loopback PostgreSQL cluster, TLS checks, dump, and restore can exceed
    // two minutes on the ROG Ally under normal foreground load. Keep the run
    // bounded, but allow enough time to avoid converting machine contention
    // into a false database failure.
    const verifiedToolchain = await dependencies.revalidateToolchain()
    await dependencies.requireVerifiedRecorderRuntime(verifiedToolchain)
    const authorityBefore = toolchainAuthority(verifiedToolchain)
    if (!same(authorityBefore, initialAuthority)
      || !same(verifiedToolchain.execution, initialToolchain.execution)) {
      fail('database_rehearsal_toolchain_changed')
    }
    lease.markLaunched()
    const childEnvironment = toolchainChildEnvironment(verifiedToolchain, process.env)
    const result = dependencies.spawnSync(
      verifiedToolchain.execution.python,
      [
        '-I', '-B', rehearsalRunner,
        '--expected-head', source.implementationCommit,
        '--postgres-bin', verifiedToolchain.execution.postgresBin,
        '--openssl', verifiedToolchain.execution.openssl,
        '--git', verifiedToolchain.execution.git,
      ],
      {
        cwd: root,
        env: childEnvironment,
        input: '',
        encoding: 'utf8',
        timeout: 300_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    )
    let raw, rawParsed = false, rawStatus = 'missing'
    if (typeof result?.stdout === 'string' && result.stdout.trim()) {
      try { raw = JSON.parse(result.stdout.trim()); rawParsed = true }
      catch { rawStatus = 'malformed' }
    }
    if (rawParsed && !recorderOutcomeReconciled(result, raw)) rawStatus = 'parsed_unreconciled'
    if (!rawParsed || !lease.reconcile(result, raw)) {
      try { await dependencies.writeRecorderFailureDiagnostic(destination, result, rawStatus) }
      catch (error) { fail(recorderDiagnosticPersistenceCode(error)) }
      fail(recorderChildFailureCode(result) || 'database_rehearsal_termination_unreconciled')
    }
    if (result.status !== 0) {
      fail(recorderChildFailureCode(result) || 'database_rehearsal_execution_failed')
    }
    await dependencies.writeFile(
      rawPath,
      `${JSON.stringify(raw, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    const verifiedAfter = await dependencies.revalidateToolchain()
    await dependencies.requireVerifiedRecorderRuntime(verifiedAfter)
    const authorityAfter = toolchainAuthority(verifiedAfter)
    if (!same(authorityAfter, authorityBefore)
      || !same(verifiedAfter.execution, verifiedToolchain.execution)) {
      fail('database_rehearsal_toolchain_changed')
    }
    if (!same(dependencies.cleanSource(verifiedAfter.execution.git), source)
      || !same(await dependencies.implementationEvidence(), implementation)) fail('database_rehearsal_source_changed')
    const proof = buildSanitizedProof(raw, {
      recordedAt: new Date().toISOString(),
      ...source,
      implementation,
      archive: await archiveEvidence(verifiedAfter.archivePath),
      toolchain: authorityAfter,
    })
    const summary = recordCompletionSummary(proof, await dependencies.implementationEvidence())
    if (!same(dependencies.cleanSource(verifiedAfter.execution.git), source)) fail('database_rehearsal_source_changed')
    await writeFile(destination, `${JSON.stringify(proof, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return summary
  })
}

async function verify(input, expectedHead, verifiedGit = null) {
  const proof = JSON.parse(await readFile(input, 'utf8'))
  if (expectedHead) {
    if (typeof verifiedGit !== 'string') fail('database_rehearsal_verified_git_required')
    const source = cleanSource(verifiedGit)
    if (source.implementationCommit !== expectedHead || proof.implementationCommit !== expectedHead
      || proof.implementationTree !== source.implementationTree) fail('database_rehearsal_source_mismatch')
  }
  const raw = JSON.parse(await readFile(`${input}.raw.json`, 'utf8'))
  const implementation = await implementationEvidence()
  // Check receipt integrity and freshness before comparing the raw runner output
  // with today's implementation. Old evidence requires a new rehearsal.
  validateSanitizedProof(proof, implementation)
  const rebuilt = buildSanitizedProof(raw, {
    recordedAt: proof.recordedAt, implementationCommit: proof.implementationCommit,
    implementationTree: proof.implementationTree, implementation,
    archive: { bytes: proof.engine.archiveBytes, sha256: proof.engine.observedArchiveSha256 },
    toolchain: proof.engine.toolchain,
  })
  if (!same(rebuilt, proof)) fail('database_rehearsal_raw_receipt_mismatch')
  return validateSanitizedProof(proof, implementation)
}

async function main() {
  const command = process.argv.slice(2)
  let result
  let revalidateToolchain
  const records = command.length === 0
    || (command.length === 2 && command[0] === '--output' && command[1])
  const verifiesExpectedHead = command.length === 5 && command[0] === '--verify'
    && command[1] === '--input' && command[2] && command[3] === '--expected-head'
    && /^[0-9a-f]{40}$/.test(command[4])
  let verifiedForSource = null
  if (records || verifiesExpectedHead) {
    const sourcePaths = await resolveToolchainSourcePaths()
    const archivePath = await resolveToolchainArchivePath()
    revalidateToolchain = () => verifyPostgres17ToolchainProfile({
      manifestPath: toolchainProfilePath,
      archivePath,
      sourcePaths,
      requireHostPlatform: true,
    })
    verifiedForSource = await revalidateToolchain()
    await requireVerifiedRecorderRuntime(verifiedForSource)
  }
  if (command.length === 2 && command[0] === '--output' && command[1]) result = await record(resolve(command[1]), { revalidateToolchain })
  else if (command.length === 0) result = await record(outputPath, { revalidateToolchain })
  else if (same(command, ['--verify'])) result = await verify(outputPath)
  else if ([3, 5].includes(command.length) && command[0] === '--verify' && command[1] === '--input'
    && command[2] && (command.length === 3 || (command[3] === '--expected-head' && /^[0-9a-f]{40}$/.test(command[4])))) {
    result = await verify(resolve(command[2]), command[4], verifiedForSource?.execution?.git)
  } else fail('database_rehearsal_record_arguments_invalid')
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    const code = error instanceof Error && /^[a-z][a-z0-9_]+$/.test(error.message) ? error.message : 'database_rehearsal_record_failed'
    console.error(JSON.stringify({ ok: false, contract: DATABASE_REHEARSAL_EVIDENCE_SCHEMA, error: code, secretValuesExposed: false }))
    process.exitCode = 1
  })
}
