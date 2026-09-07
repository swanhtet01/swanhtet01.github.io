import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const outputPath = resolve(root, 'hq', 'research', 'postgres17-rehearsal.json')
const rehearsalRunner = resolve(root, 'tools', 'run_postgres17_rehearsal.mjs')
const archivePath = resolve(homedir(), '.cache', 'supermega-postgresql', 'postgresql-17.10-2-windows-x64-binaries.zip')

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

async function archiveEvidence(path = archivePath) {
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
  return !result?.error && !result?.signal && Number.isInteger(result?.status) && result.status >= 0
    && raw?.contract === 'supermega_postgres17_rehearsal_v2' && raw.cleanup_complete === true
    && raw.production_mutated === false && raw.supabase_mutated === false
    && raw.vercel_mutated === false && raw.secret_values_exposed === false
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

async function record(destination) {
  const rawPath = `${destination}.raw.json`
  await requireAbsent(destination)
  await requireAbsent(rawPath)
  const source = cleanSource()
  const implementation = await implementationEvidence()
  await mkdir(dirname(destination), { recursive: true })
  const lockPath = `${destination}.lock`
  const commonDirectory = gitOutput(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const commonKey = process.platform === 'win32' ? commonDirectory.toLowerCase() : commonDirectory
  const repositoryLock = resolve(tmpdir(), `supermega-postgres17-${sha256(commonKey).slice(7)}.lock`)
  return withRecorderLease([repositoryLock, lockPath], async (lease) => {
    // The loopback PostgreSQL cluster, TLS checks, dump, and restore can exceed
    // two minutes on the ROG Ally under normal foreground load. Keep the run
    // bounded, but allow enough time to avoid converting machine contention
    // into a false database failure.
    lease.markLaunched()
    const result = spawnSync(process.execPath, [rehearsalRunner, '--expected-head', source.implementationCommit, '--evidence-file', rawPath], { cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true })
    let raw
    try { raw = JSON.parse(await readFile(rawPath, 'utf8')) } catch { fail('database_rehearsal_termination_unreconciled') }
    if (!lease.reconcile(result, raw)) fail('database_rehearsal_termination_unreconciled')
    if (result.status !== 0) fail('database_rehearsal_execution_failed')
    if (!same(cleanSource(), source) || !same(await implementationEvidence(), implementation)) fail('database_rehearsal_source_changed')
    const proof = buildSanitizedProof(raw, {
      recordedAt: new Date().toISOString(),
      ...source,
      implementation,
      archive: await archiveEvidence(),
    })
    const summary = recordCompletionSummary(proof, await implementationEvidence())
    if (!same(cleanSource(), source)) fail('database_rehearsal_source_changed')
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
  const rebuilt = buildSanitizedProof(raw, {
    recordedAt: proof.recordedAt, implementationCommit: proof.implementationCommit,
    implementationTree: proof.implementationTree, implementation,
    archive: { bytes: proof.engine.archiveBytes, sha256: proof.engine.observedArchiveSha256 },
  })
  if (!same(rebuilt, proof)) fail('database_rehearsal_raw_receipt_mismatch')
  return validateSanitizedProof(proof, implementation)
}

async function main() {
  const command = process.argv.slice(2)
  let result
  if (command.length === 2 && command[0] === '--output' && command[1]) result = await record(resolve(command[1]))
  else if (command.length === 0) result = await record(outputPath)
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
