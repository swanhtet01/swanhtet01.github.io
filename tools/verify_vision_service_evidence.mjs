import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const platformRoot = resolve(import.meta.dirname, '..')
const proof = JSON.parse(readFileSync(resolve(platformRoot, 'evidence', 'vision-service-proof.json'), 'utf8'))
const sourceIndex = process.argv.indexOf('--source-root')
const sourceRoot = resolve(sourceIndex >= 0 && process.argv[sourceIndex + 1] ? process.argv[sourceIndex + 1] : resolve(platformRoot, '..', 'supermega-vision'))

function fail(reason) {
  process.stderr.write(`${JSON.stringify({ ok: false, contract: 'supermega.vision.service-proof-verification.v1', reason })}\n`)
  process.exit(1)
}

function git(...args) {
  return execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', timeout: 20_000, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } }).trim()
}

if (proof.contract !== 'supermega.vision.service-proof.v1'
  || proof.sourceRepository !== 'supermega-vision'
  || !/^[a-f0-9]{40}$/.test(proof.sourceCommit)
  || !/^[a-f0-9]{40}$/.test(proof.sourceTree)
  || proof.verification?.command !== 'verify.cmd'
  || proof.verification?.tests !== 264
  || proof.verification?.exitCode !== 0
  || proof.verification?.passed !== true
  || !/^2026-07-31T/.test(proof.verification?.observedAt || '')
  || !Array.isArray(proof.limitations)
  || proof.limitations.length !== 3) fail('proof_contract_invalid')

let head
let tree
let status
try {
  head = git('rev-parse', 'HEAD')
  tree = git('rev-parse', 'HEAD^{tree}')
  status = git('status', '--porcelain', '--untracked-files=all')
} catch {
  fail('source_git_state_unavailable')
}
if (head !== proof.sourceCommit || tree !== proof.sourceTree || status) fail('source_identity_drift')

for (const [claim, paths] of Object.entries(proof.claims || {})) {
  if (!claim || !Array.isArray(paths) || paths.length < 2) fail('claim_evidence_invalid')
  for (const relative of paths) {
    if (typeof relative !== 'string' || !relative || relative.includes('..') || relative.startsWith('/') || /^[A-Za-z]:/.test(relative)) fail('claim_path_unsafe')
    const path = resolve(sourceRoot, relative)
    if (!path.startsWith(`${sourceRoot}\\`) && path !== sourceRoot) fail('claim_path_escaped')
    let entry
    try { entry = lstatSync(path) } catch { fail('claim_evidence_missing') }
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) fail('claim_evidence_unsafe')
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  contract: 'supermega.vision.service-proof-verification.v1',
  sourceCommit: head,
  sourceTree: tree,
  claims: Object.keys(proof.claims).length,
  tests: proof.verification.tests,
  limitations: proof.limitations.length,
  fullVerificationSnapshot: proof.verification.passed,
  effects: { source_files_modified: 0, network_requests: 0, external_actions: 0 },
})}\n`)
