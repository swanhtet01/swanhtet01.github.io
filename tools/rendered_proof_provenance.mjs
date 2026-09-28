import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

export const APP_ENTRY_RENDERED_CONTRACT = 'supermega.app-entry-rendered.v2'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const MAX_ARTIFACT_FILES = 20_000
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024

function fail(code) {
  throw new Error(code)
}

export function sha256Digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function posixPath(value) {
  return value.replace(/\\/g, '/')
}

function boundedRelativePath(parent, child, code) {
  const from = resolve(parent)
  const to = resolve(child)
  const candidate = relative(from, to)
  if (!candidate || candidate === '..' || candidate.startsWith(`..\\`) || candidate.startsWith('../') || isAbsolute(candidate)) {
    fail(code)
  }
  return posixPath(candidate)
}

export function buildGitSourceState({ commit, tree, status } = {}) {
  const exactCommit = String(commit || '').trim().toLowerCase()
  const exactTree = String(tree || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(exactCommit) || !SHA_PATTERN.test(exactTree)) fail('app_entry_rendered_git_state_invalid')
  if (String(status || '').trim()) fail('app_entry_rendered_source_tree_dirty')
  return {
    commit: exactCommit,
    tree: exactTree,
    clean: true,
  }
}

function runGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true,
  })
  if (result.error || result.signal || result.status !== 0) fail('app_entry_rendered_git_command_failed')
  return String(result.stdout || '').trim()
}

export function collectGitSourceState(root) {
  return buildGitSourceState({
    commit: runGit(root, ['rev-parse', 'HEAD']),
    tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    status: runGit(root, ['status', '--porcelain=v1', '--untracked-files=all']),
  })
}

export async function collectDirectoryManifest(directory) {
  const absolute = resolve(directory)
  const rootMetadata = await lstat(absolute).catch(() => null)
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) fail('app_entry_rendered_artifact_directory_invalid')

  const entries = []
  let totalBytes = 0

  async function walk(current) {
    const children = await readdir(current, { withFileTypes: true })
    children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    for (const child of children) {
      const absoluteChild = resolve(current, child.name)
      if (child.isSymbolicLink()) fail('app_entry_rendered_artifact_symlink_forbidden')
      if (child.isDirectory()) {
        await walk(absoluteChild)
        continue
      }
      if (!child.isFile()) fail('app_entry_rendered_artifact_entry_invalid')
      const payload = await readFile(absoluteChild)
      totalBytes += payload.byteLength
      entries.push({
        path: posixPath(relative(absolute, absoluteChild)),
        bytes: payload.byteLength,
        digest: sha256Digest(payload),
      })
      if (entries.length > MAX_ARTIFACT_FILES || totalBytes > MAX_ARTIFACT_BYTES) {
        fail('app_entry_rendered_artifact_bounds_exceeded')
      }
    }
  }

  await walk(absolute)
  if (!entries.length) fail('app_entry_rendered_artifact_empty')
  return {
    digest: sha256Digest(JSON.stringify(entries)),
    fileCount: entries.length,
    totalBytes,
    entries,
  }
}

export async function collectRenderedProofProvenance({ root, distDir, verifierPath }) {
  const source = collectGitSourceState(root)
  const verifierPayload = await readFile(resolve(verifierPath)).catch(() => null)
  if (!verifierPayload?.byteLength) fail('app_entry_rendered_verifier_invalid')
  const manifest = await collectDirectoryManifest(distDir)
  return {
    source,
    verifier: {
      path: boundedRelativePath(root, verifierPath, 'app_entry_rendered_verifier_outside_source'),
      digest: sha256Digest(verifierPayload),
      bytes: verifierPayload.byteLength,
    },
    artifact: {
      path: boundedRelativePath(root, distDir, 'app_entry_rendered_artifact_outside_source'),
      digest: manifest.digest,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
    },
  }
}

export function assertRenderedProofProvenanceStable(before, after) {
  if (JSON.stringify(before?.source) !== JSON.stringify(after?.source)) fail('app_entry_rendered_source_changed_during_proof')
  if (JSON.stringify(before?.verifier) !== JSON.stringify(after?.verifier)) fail('app_entry_rendered_verifier_changed_during_proof')
  if (JSON.stringify(before?.artifact) !== JSON.stringify(after?.artifact)) fail('app_entry_rendered_artifact_changed_during_proof')
  return true
}

export function assertExpectedHead(provenance, expectedHead) {
  const expected = String(expectedHead || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(expected)) fail('app_entry_rendered_expected_head_required')
  if (provenance?.source?.commit !== expected) fail('app_entry_rendered_expected_head_mismatch')
  return expected
}

export function buildScreenshotEvidence({ payload, path, evidenceDir }) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 1) fail('app_entry_rendered_screenshot_invalid')
  const file = boundedRelativePath(evidenceDir, path, 'app_entry_rendered_screenshot_outside_evidence_directory')
  if (!file.toLowerCase().endsWith('.png')) fail('app_entry_rendered_screenshot_extension_invalid')
  return {
    file,
    bytes: payload.byteLength,
    digest: sha256Digest(payload),
  }
}

export function buildEvidenceDescriptor({ evidenceDir, outputPath }) {
  if (!evidenceDir || !outputPath) fail('app_entry_rendered_evidence_paths_required')
  const report = boundedRelativePath(evidenceDir, outputPath, 'app_entry_rendered_report_outside_evidence_directory')
  if (!report.toLowerCase().endsWith('.json')) fail('app_entry_rendered_report_extension_invalid')
  return {
    directory: '.',
    report,
  }
}

export async function assertEvidenceDirectoryReady(evidenceDir) {
  const absolute = resolve(evidenceDir)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata) return true
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('app_entry_rendered_evidence_directory_invalid')
  const entries = await readdir(absolute)
  if (entries.length) fail('app_entry_rendered_evidence_directory_not_empty')
  return true
}

export function signedRenderedProof(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('app_entry_rendered_report_invalid')
  return { ...body, digest: sha256Digest(JSON.stringify(body)) }
}
