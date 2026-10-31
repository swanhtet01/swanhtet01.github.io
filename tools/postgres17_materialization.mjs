import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const POSTGRES17_MATERIALIZATION_CONTRACT =
  'supermega.postgres17-materialization.v1'

const SHA256 = /^[0-9a-f]{64}$/

function fail(code) {
  throw new Error(code)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')
    || value.includes(':') || value.startsWith('/') || value.endsWith('/')
    || isAbsolute(value)) return false
  const parts = value.split('/')
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
}

function exactFile(file) {
  return isObject(file)
    && canonicalRelativePath(file.relativePath)
    && Number.isSafeInteger(file.bytes)
    && file.bytes >= 0
    && SHA256.test(file.sha256 || '')
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function exactInventory(files, directories) {
  if (!Array.isArray(files) || !files.every(exactFile)
    || !Array.isArray(directories) || !directories.every(canonicalRelativePath)) {
    fail('database_rehearsal_materialization_manifest_invalid')
  }
  const identities = [...directories, ...files.map(({ relativePath }) => relativePath)]
    .map((path) => path.toLowerCase())
  if (new Set(identities).size !== identities.length) {
    fail('database_rehearsal_materialization_case_collision')
  }
  return {
    files: files.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 }))
      .sort((left, right) => compareUtf8(left.relativePath, right.relativePath)),
    directories: [...directories].sort(compareUtf8),
  }
}

export function inspectPostgres17MaterializationEvidence(profile, evidence) {
  if (!isObject(evidence)
    || evidence.contract !== POSTGRES17_MATERIALIZATION_CONTRACT
    || evidence.status !== 'reviewed'
    || evidence.method !== 'two-pass-reviewed-installer-v1'
    || evidence.sourceArtifactSha256 !== profile?.archive?.sha256
    || evidence.outputRootName !== profile?.extractedRootName
    || !Array.isArray(evidence.installerArguments)
    || evidence.installerArguments.length === 0
    || !evidence.installerArguments.every((argument) =>
      typeof argument === 'string' && argument.length > 0 && !argument.includes('\0'))
    || evidence.installerArguments.filter((argument) => argument === '{destination}').length !== 1
    || !isObject(evidence.approval)
    || evidence.approval.status !== 'reviewed'
    || typeof evidence.approval.reviewedBy !== 'string'
    || evidence.approval.reviewedBy.length === 0
    || !Number.isFinite(Date.parse(evidence.approval.reviewedAt))) {
    fail('database_rehearsal_materialization_manifest_invalid')
  }
  const inventory = exactInventory(evidence.files, evidence.directories)
  const manifestFiles = new Map(inventory.files.map((file) => [file.relativePath, file]))
  for (const binding of [...(profile.artifacts || []), ...(profile.dependencies || [])]) {
    const expected = manifestFiles.get(binding.relativePath)
    if (!expected || expected.bytes !== binding.bytes || expected.sha256 !== binding.sha256
      || binding.sourceArtifactSha256 !== profile.archive.sha256) {
      fail('database_rehearsal_materialization_binding_mismatch')
    }
  }
  return inventory
}

async function sha256File(path) {
  const digest = createHash('sha256')
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.on('error', rejectStream)
    stream.on('end', resolveStream)
  })
  return digest.digest('hex')
}

export async function inventoryPostgres17MaterializedTree(root) {
  const rootMetadata = await lstat(root)
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail('database_rehearsal_materialization_root_invalid')
  }
  const canonicalRoot = await realpath(root)
  if (canonicalRoot !== resolve(root)) fail('database_rehearsal_materialization_root_substituted')
  const files = []
  const directories = []
  const casefold = new Set()

  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!canonicalRelativePath(relativePath)) fail('database_rehearsal_materialization_path_invalid')
      const folded = relativePath.toLowerCase()
      if (casefold.has(folded)) fail('database_rehearsal_materialization_case_collision')
      casefold.add(folded)
      const path = resolve(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) fail('database_rehearsal_materialization_reparse_point')
      const resolved = await realpath(path)
      const child = relative(canonicalRoot, resolved)
      if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
        fail('database_rehearsal_materialization_path_escape')
      }
      if (metadata.isDirectory()) {
        directories.push(relativePath)
        await visit(path, relativePath)
      } else if (metadata.isFile()) {
        const observed = await stat(path)
        if (observed.nlink !== 1) fail('database_rehearsal_materialization_hardlink')
        files.push({
          relativePath,
          bytes: observed.size,
          sha256: await sha256File(path),
        })
      } else {
        fail('database_rehearsal_materialization_special_file')
      }
    }
  }

  await visit(canonicalRoot)
  return exactInventory(files, directories)
}

export async function verifyPostgres17MaterializedTree({ profile, evidence, root }) {
  const expected = inspectPostgres17MaterializationEvidence(profile, evidence)
  const observed = await inventoryPostgres17MaterializedTree(root)
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    fail('database_rehearsal_materialization_tree_mismatch')
  }
  return observed
}

export function verifyDeterministicMaterializationPasses(first, second) {
  const normalizedFirst = exactInventory(first.files, first.directories)
  const normalizedSecond = exactInventory(second.files, second.directories)
  if (JSON.stringify(normalizedFirst) !== JSON.stringify(normalizedSecond)) {
    fail('database_rehearsal_materialization_nondeterministic')
  }
  return normalizedFirst
}

export async function verifyTwoPassMaterializationRoots({
  profile,
  evidence,
  firstRoot,
  secondRoot,
}) {
  if (typeof firstRoot !== 'string' || typeof secondRoot !== 'string'
    || resolve(firstRoot) === resolve(secondRoot)) {
    fail('database_rehearsal_materialization_passes_invalid')
  }
  const first = await verifyPostgres17MaterializedTree({
    profile, evidence, root: firstRoot,
  })
  const second = await verifyPostgres17MaterializedTree({
    profile, evidence, root: secondRoot,
  })
  return verifyDeterministicMaterializationPasses(first, second)
}
