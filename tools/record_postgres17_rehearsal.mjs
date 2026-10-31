import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const outputPath = resolve(root, 'hq', 'research', 'postgres17-rehearsal.json')
const toolchainProfilePath = resolve(root, 'hq', 'research', 'postgres17-toolchain-profile.json')
const rehearsalRunner = resolve(root, 'tools', 'rehearse_supermega_postgres17.py')

import { verifyPostgres17ToolchainProfile } from './postgres17_toolchain_profile.mjs'
import { buildPostgres17AuthorityRequest } from './postgres17_authority_session.mjs'

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
  let profile
  try { profile = JSON.parse(await readFile(profilePath, 'utf8')) } catch { fail('database_rehearsal_toolchain_profile_invalid') }
  const fileName = profile?.archive?.fileName
  if (typeof fileName !== 'string' || fileName !== basename(fileName)) {
    fail('database_rehearsal_toolchain_profile_archive_name_mismatch')
  }
  return resolve(homedir(), '.cache', 'supermega-postgresql', fileName)
}

export async function resolveSecondMaterializationRoot(
  archivePath,
  profilePath = toolchainProfilePath,
) {
  let profile
  try { profile = JSON.parse(await readFile(profilePath, 'utf8')) } catch {
    fail('database_rehearsal_toolchain_profile_invalid')
  }
  const rootName = profile?.extractedRootName
  if (typeof rootName !== 'string' || rootName.length === 0
    || rootName !== basename(rootName)) {
    fail('database_rehearsal_toolchain_profile_root_mismatch')
  }
  return resolve(dirname(archivePath), `${rootName}.materialization-pass-2`)
}

export function toolchainAuthority(verified) {
  const publisher = verified?.publisherAuthentication
  const authority = {
    profileId: verified?.profileId,
    archiveFileName: verified?.archiveFileName,
    manifestSha256: verified?.manifestSha256,
    policyId: publisher?.policyId,
    policySha256: publisher?.policySha256,
    sourceArtifactSha256: publisher?.sourceArtifactSha256,
    signerCertificateSha256: publisher?.signerCertificateSha256,
    timestampCertificateSha256: publisher?.timestampCertificateSha256,
    sourceAuthenticationEvidenceSha256: verified?.sourceAuthenticationEvidenceSha256,
    loadClosureEvidenceSha256: verified?.loadClosureEvidenceSha256,
    materializationEvidenceSha256: verified?.materializationEvidenceSha256,
    materializationInventorySha256: verified?.materializationInventorySha256,
    executionBundleSha256: verified?.executionBundleSha256,
  }
  if (typeof authority.profileId !== 'string' || authority.profileId.length === 0
    || typeof authority.policyId !== 'string' || authority.policyId.length === 0
    || typeof authority.archiveFileName !== 'string'
    || !authority.archiveFileName.toLowerCase().endsWith('.exe')
    || Object.entries(authority).some(([key, value]) => !['profileId', 'policyId', 'archiveFileName'].includes(key)
      && !/^[0-9a-f]{64}$/.test(value || ''))) {
    fail('database_rehearsal_toolchain_authority_invalid')
  }
  return authority
}

function gitOutput(args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (result.status !== 0) fail('database_rehearsal_git_unavailable')
  return result.stdout.trim()
}

function cleanSource() {
  if (gitOutput(['status', '--porcelain', '--untracked-files=all'])) fail('database_rehearsal_record_requires_clean_worktree')
  return { implementationCommit: gitOutput(['rev-parse', 'HEAD']), implementationTree: gitOutput(['rev-parse', 'HEAD^{tree}']) }
}

async function requireAbsent(path) {
  try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  fail('database_rehearsal_output_exists')
}

export function recorderOutcomeReconciled(result, raw) {
  return !result?.error && !result?.signal && result?.status === 0
    && raw?.contract === 'supermega_postgres17_rehearsal_v2' && raw.cleanup_complete === true
    && raw.production_mutated === false && raw.supabase_mutated === false
    && raw.vercel_mutated === false && raw.secret_values_exposed === false
}

export function toolchainChildEnvironment(verifiedToolchain, baseEnvironment = {}) {
  const execution = verifiedToolchain?.execution
  if (!execution?.postgresBin || !execution?.openssl || !execution?.python || !execution?.psycopg) {
    fail('database_rehearsal_toolchain_execution_binding_missing')
  }
  // The inherited environment supplies operating-system plumbing only. Tool,
  // Python, PostgreSQL and database selectors are deliberately absent; Python
  // independently derives and verifies them from the canonical profile.
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

export async function buildRecorderAuthorityRequest({
  verifiedToolchain,
  source,
  implementation,
  now = Date.now(),
}) {
  const publisher = verifiedToolchain?.publisherAuthentication
  const roots = verifiedToolchain?.execution?.materializationRoots
  if (!Array.isArray(roots) || roots.length !== 2 || !publisher) {
    fail('database_rehearsal_authority_request_unavailable')
  }
  const parent = await archiveEvidence(process.execPath)
  return buildPostgres17AuthorityRequest({
    source: {
      head: source.implementationCommit,
      tree: source.implementationTree,
      implementationDigest: implementation.digest,
    },
    toolchain: {
      profileId: verifiedToolchain.profileId,
      manifestSha256: verifiedToolchain.manifestSha256,
      policyId: publisher.policyId,
      policySha256: publisher.policySha256,
      sourceArtifactSha256: publisher.sourceArtifactSha256,
      materializationEvidenceSha256: verifiedToolchain.materializationEvidenceSha256,
      materializationInventorySha256: verifiedToolchain.materializationInventorySha256,
      loadClosureEvidenceSha256: verifiedToolchain.loadClosureEvidenceSha256,
      executionBundleSha256: verifiedToolchain.executionBundleSha256,
    },
    materialization: { firstRoot: roots[0], secondRoot: roots[1] },
    execution: {
      archivePath: verifiedToolchain.archivePath,
      root: verifiedToolchain.execution.root,
      postgresBin: verifiedToolchain.execution.postgresBin,
      openssl: verifiedToolchain.execution.openssl,
      python: verifiedToolchain.execution.python,
      psycopg: verifiedToolchain.execution.psycopg,
    },
    parent: {
      pid: process.pid,
      executablePath: process.execPath,
      executableSha256: parent.sha256,
    },
    now,
  })
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
    buildRecorderAuthorityRequest,
    revalidateToolchain: async () => fail('database_rehearsal_toolchain_revalidation_missing'),
    ...runtime,
  }
  const rawPath = `${destination}.raw.json`
  await requireAbsent(destination)
  await requireAbsent(rawPath)
  await requireAbsent(`${destination}.diagnostic.json`)
  const source = dependencies.cleanSource()
  const implementation = await dependencies.implementationEvidence()
  await mkdir(dirname(destination), { recursive: true })
  const lockPath = `${destination}.lock`
  const commonDirectory = dependencies.gitOutput(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const commonKey = process.platform === 'win32' ? commonDirectory.toLowerCase() : commonDirectory
  const repositoryLock = resolve(dependencies.tmpdir(), `supermega-postgres17-${sha256(commonKey).slice(7)}.lock`)
  return withRecorderLease([repositoryLock, lockPath], async (lease) => {
    // The loopback PostgreSQL cluster, TLS checks, dump, and restore can exceed
    // two minutes on the ROG Ally under normal foreground load. Keep the run
    // bounded, but allow enough time to avoid converting machine contention
    // into a false database failure.
    const verifiedToolchain = await dependencies.revalidateToolchain()
    const authorityBefore = toolchainAuthority(verifiedToolchain)
    const authorityRequest = await dependencies.buildRecorderAuthorityRequest({
      verifiedToolchain, source, implementation,
    })
    lease.markLaunched()
    const childEnvironment = toolchainChildEnvironment(verifiedToolchain, process.env)
    const result = dependencies.spawnSync(
      verifiedToolchain.execution.python,
      ['-I', '-B', rehearsalRunner, '--expected-head', source.implementationCommit],
      {
        cwd: root,
        env: childEnvironment,
        input: `${JSON.stringify(authorityRequest)}\n`,
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
    const authorityAfter = toolchainAuthority(verifiedAfter)
    if (!same(authorityAfter, authorityBefore)) fail('database_rehearsal_toolchain_changed')
    if (!same(dependencies.cleanSource(), source)
      || !same(await dependencies.implementationEvidence(), implementation)) fail('database_rehearsal_source_changed')
    const proof = buildSanitizedProof(raw, {
      recordedAt: new Date().toISOString(),
      ...source,
      implementation,
      archive: await archiveEvidence(verifiedAfter.archivePath),
      toolchain: authorityAfter,
    })
    const summary = recordCompletionSummary(proof, await dependencies.implementationEvidence())
    if (!same(dependencies.cleanSource(), source)) fail('database_rehearsal_source_changed')
    await writeFile(destination, `${JSON.stringify(proof, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return summary
  })
}

async function verify(input, expectedHead) {
  const proof = JSON.parse(await readFile(input, 'utf8'))
  if (expectedHead) {
    const source = cleanSource()
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
  if (command.length === 0 || (command.length === 2 && command[0] === '--output' && command[1])) {
    const archivePath = await resolveToolchainArchivePath()
    const secondExtractedRoot = await resolveSecondMaterializationRoot(archivePath)
    revalidateToolchain = () => verifyPostgres17ToolchainProfile({
      manifestPath: toolchainProfilePath,
      archivePath,
      secondExtractedRoot,
      requireHostPlatform: true,
    })
    await revalidateToolchain()
  }
  if (command.length === 2 && command[0] === '--output' && command[1]) result = await record(resolve(command[1]), { revalidateToolchain })
  else if (command.length === 0) result = await record(outputPath, { revalidateToolchain })
  else if (same(command, ['--verify'])) result = await verify(outputPath)
  else if ([3, 5].includes(command.length) && command[0] === '--verify' && command[1] === '--input'
    && command[2] && (command.length === 3 || (command[3] === '--expected-head' && /^[0-9a-f]{40}$/.test(command[4])))) {
    result = await verify(resolve(command[2]), command[4])
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
