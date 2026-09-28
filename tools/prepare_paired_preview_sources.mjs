import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const git = (cwd, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
  cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
}).trim()
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const within = (parent, child) => {
  const rel = relative(parent, child)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

// Local preparation only. No build, credentials, environment pulls, provider
// reads/writes, or source-supplied hooks/scripts are permitted in this phase.
export function preparePairedPreviewSources({ repository, commit, output }, runGit = git) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('preview_source_commit_invalid')
  const repo = realpathSync(repository)
  if (runGit(repo, ['rev-parse', '--show-toplevel']).replaceAll('\\', '/') !== repo.replaceAll('\\', '/')) {
    throw new Error('preview_source_repository_root_required')
  }
  // Checkout filters can invoke programs/network. Reject configured filters
  // rather than silently executing them under a local-only preparation claim.
  let filters = ''
  try { filters = runGit(repo, ['config', '--get-regexp', '^filter\\..*\\.(process|smudge|clean)$']) }
  catch (error) { if (error.status !== 1) throw new Error('preview_source_filter_inspection_failed') }
  if (filters) throw new Error('preview_source_checkout_filters_require_review')
  if (runGit(repo, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('preview_source_checkout_dirty')
  if (runGit(repo, ['rev-parse', 'HEAD']) !== commit) throw new Error('preview_source_head_mismatch')
  const tree = runGit(repo, ['rev-parse', `${commit}^{tree}`])
  const out = resolve(output)
  if (existsSync(out)) throw new Error('preview_source_output_exists')
  // Resolve the real parent before creating anything, including junction paths.
  const parent = realpathSync(dirname(out))
  const destination = resolve(parent, relative(dirname(out), out))
  if (within(repo, destination) || within(destination, repo)) throw new Error('preview_source_output_overlaps_repository')
  if (lstatSync(parent).isSymbolicLink()) throw new Error('preview_source_parent_invalid')
  mkdirSync(destination) // Exclusive: never replace an existing output or worktree.
  const receiptPath = resolve(destination, 'preparation.json')
  const receipt = {
    contract: 'supermega.paired-preview-source-preparation.v1',
    state: 'preparing', commit, tree, generatedAt: new Date().toISOString(),
    sources: [], attempts: [], localMutationOutcome: 'not_attempted',
    controls: { localWorktreesConfirmed: 0, buildPerformed: false, credentialsRead: false,
      providerReadPerformed: false, providerWritePerformed: false, deploymentPerformed: false,
      productionMutated: false, hostedAcceptanceProven: false },
  }
  const persist = () => {
    const body = { ...receipt }
    writeFileSync(receiptPath, `${JSON.stringify({ ...body, digest: sha256(JSON.stringify(body)) }, null, 2)}\n`)
  }
  persist()
  try {
    for (const kind of ['app', 'public']) {
      const path = resolve(destination, kind)
      const attempt = { kind, path, stage: 'worktree_add', outcome: 'unresolved' }
      receipt.attempts.push(attempt)
      receipt.localMutationOutcome = 'unresolved'
      persist() // Durable intent before the local mutating subprocess starts.
      // -c applies only to this call. Never execute an owner or repository hook.
      runGit(repo, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', path, commit])
      attempt.stage = 'source_readback'
      persist()
      const source = { kind, path, commit: runGit(path, ['rev-parse', 'HEAD']),
        tree: runGit(path, ['rev-parse', 'HEAD^{tree}']), clean: !runGit(path, ['status', '--porcelain', '--untracked-files=all']) }
      receipt.sources.push(source)
      persist()
      if (source.commit !== commit || source.tree !== tree || !source.clean) throw new Error('source_identity_mismatch')
      attempt.stage = 'source_verified'
      attempt.outcome = 'confirmed_complete'
      receipt.controls.localWorktreesConfirmed += 1
      persist()
    }
    if (runGit(repo, ['rev-parse', 'HEAD']) !== commit || runGit(repo, ['status', '--porcelain', '--untracked-files=all'])) {
      throw new Error('source_changed_during_preparation')
    }
    receipt.state = 'local_sources_prepared'
    receipt.localMutationOutcome = 'confirmed_complete'
    persist()
    return { ...receipt, receiptPath }
  } catch {
    // Keep partial worktrees for inspection. Never retry/delete behind an owner.
    receipt.state = 'incomplete_local_preparation'
    persist()
    throw new Error(`preview_source_preparation_incomplete:${receiptPath}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--repository' || args[2] !== '--commit' || args[4] !== '--output') {
      throw new Error('usage: --repository EXACT_ROOT --commit EXACT_HEAD --output NEW_LOCAL_DIRECTORY')
    }
    const result = preparePairedPreviewSources({ repository: args[1], commit: args[3], output: args[5] })
    console.log(JSON.stringify({ ok: true, state: result.state, commit: result.commit, tree: result.tree,
      receiptPath: result.receiptPath, controls: result.controls }))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }))
    process.exitCode = 1
  }
}
